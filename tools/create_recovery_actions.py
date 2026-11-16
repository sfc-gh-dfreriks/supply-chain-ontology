"""Create the recovery Action nodes in the Supply Chain Business Ontology domain.

Follows the Action-node pattern (Ontology Execution and Writeback): each Action
holds the contract for one S/4HANA operation - parameters, checkable criteria,
effects and the procedure that performs it. The ontology defines the operation;
the app checks the criteria, RBAC authorizes, and the procedure writes.

    python3 tools/create_recovery_actions.py           # create or verify
    python3 tools/create_recovery_actions.py --show    # print stored contracts

Idempotent: an Action that already exists is left alone. Action nodes are a
preview capability; if the account rejects itemKind ACTION the script stops
before changing anything else.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path.home() / "Documents/GitHub/mfg-use-cases/framework/tools"))
from sf import connect  # noqa: E402

DOMAIN = "Supply Chain"
WB = "SAP_SUPPLY_CHAIN.S4_WRITEBACK"

ACTIONS = [
    {
        "name": "Reassign Delivering Plant",
        "target": "Sales Order",
        "description": ("Move an open sales order item to another production plant in S/4HANA, so a customer is supplied from a "
                        "plant with capacity when its usual plant is disrupted. Changes VBAP-WERKS through API_SALES_ORDER_SRV. "
                        "The recognized operation for executing a recovery reroute; acts on Sales Order."),
        "synonyms": ["Reroute sales order", "Change delivering plant", "Change production plant", "Switch plant"],
        "actionKind": "MODIFY_OBJECT",
        "parameters": [
            {"name": "cr_id", "dataType": "STRING", "required": True, "description": "Approved recovery change request"},
            {"name": "cr_item", "dataType": "NUMBER", "required": True, "description": "Item of the change request"},
            {"name": "sales_order", "dataType": "STRING", "required": True, "description": "Sales order number (VBELN)"},
            {"name": "item", "dataType": "NUMBER", "required": True, "description": "Sales order item (POSNR)"},
            {"name": "new_plant", "dataType": "STRING", "required": True, "description": "Receiving production plant (WERKS)"},
        ],
        "criteria": [
            "Recovery change request is APPROVED by someone other than the requester",
            "Sales order item status is OPEN",
            "Current plant equals the plant recorded when the request was approved",
            "New plant produces the item's material category (Plant produces Material Category)",
        ],
        "effects": [
            "Sets S/4HANA sales order item ProductionPlant (VBAP-WERKS) to the new plant",
            "Writes a change document (VERKBELEG / VBAP-WERKS) under the approver's name",
            "Sends PATCH A_SalesOrderItem to API_SALES_ORDER_SRV",
        ],
        "procedure": f"{WB}.S4_REASSIGN_DELIVERING_PLANT",
    },
    {
        "name": "Create Planned Order",
        "target": "Plant",
        "description": ("Create a planned order in S/4HANA at the receiving plant for the quantity a recovery reroute moves there, "
                        "so production planning covers the reassigned demand. Posts A_PlannedOrder through API_PLANNED_ORDERS. "
                        "Acts on Plant."),
        "synonyms": ["Add planned order", "Plan production at plant", "Create PLAF"],
        "actionKind": "CREATE_OBJECT",
        "parameters": [
            {"name": "cr_id", "dataType": "STRING", "required": True, "description": "Approved recovery change request"},
            {"name": "cr_item", "dataType": "NUMBER", "required": True, "description": "Item of the change request"},
            {"name": "material", "dataType": "STRING", "required": True, "description": "Material number (MATNR)"},
            {"name": "plant", "dataType": "STRING", "required": True, "description": "Production plant (PLWRK)"},
            {"name": "quantity", "dataType": "NUMBER", "required": True, "description": "Planned quantity (GSMNG)"},
            {"name": "need_date", "dataType": "DATE", "required": True, "description": "Planned finish date"},
        ],
        "criteria": [
            "Recovery change request is APPROVED by someone other than the requester",
            "Plant produces the material's category",
            "Quantity is no more than the plant's spare units, less planned orders already created",
        ],
        "effects": [
            "Creates an S/4HANA planned order (PLAF, order type LA) at the plant",
            "Writes a change document (PLAF insert) under the approver's name",
            "Sends POST A_PlannedOrder to API_PLANNED_ORDERS",
        ],
        "procedure": f"{WB}.S4_CREATE_PLANNED_ORDER",
    },
    {
        "name": "Approve Recovery Change Request",
        "target": "Sales Order",
        "description": ("Record a governed decision to apply a recovery change request to the S/4HANA transactional system. "
                        "The approver confirms they have reviewed every change and understand it alters live sales and planning "
                        "documents. Required before any recovery Action can post."),
        "synonyms": ["Approve recovery plan", "Release recovery changes", "Approve S/4 changes"],
        "actionKind": "MODIFY_OBJECT",
        "parameters": [
            {"name": "cr_id", "dataType": "STRING", "required": True, "description": "Change request to decide"},
            {"name": "decision", "dataType": "STRING", "required": True, "description": "APPROVE or REJECT"},
            {"name": "approver", "dataType": "STRING", "required": True, "description": "Named approver, not the requester"},
            {"name": "acknowledgements", "dataType": "ARRAY", "required": True, "description": "reviewed, transactional, recorded"},
            {"name": "confirmation", "dataType": "STRING", "required": True, "description": "The phrase POST TO S4HANA"},
        ],
        "criteria": [
            "Change request status is SUBMITTED",
            "Caller holds role SC_RECOVERY_APPROVER",
            "Approver is not the requester (segregation of duties)",
            "All three acknowledgements are given and the confirmation phrase is POST TO S4HANA",
        ],
        "effects": [
            "Sets the change request to APPROVED or REJECTED",
            "Records the approver, acknowledgements, confirmation, comment, Snowflake user and role",
        ],
        "procedure": f"{WB}.SP_DECIDE_CR",
    },
]


def main():
    c = connect().cursor()

    def sys_call(fn, *args):
        c.execute(f"SELECT {fn}({', '.join(['%s'] * len(args))})", args)
        v = c.fetchone()[0]
        try:
            return json.loads(v)
        except (TypeError, ValueError):
            return v

    summary = sys_call("SYSTEM$GET_GLOSSARY_SUMMARY")
    dom = next(d for d in summary["domains"] if d["name"] == DOMAIN)

    if "--show" in sys.argv:
        for a in ACTIONS:
            print(json.dumps(sys_call("SYSTEM$GET_GLOSSARY_TERM", f"{DOMAIN}.{a['name']}"), indent=1)[:3000])
        return

    for a in ACTIONS:
        fqn = f"{DOMAIN}.{a['name']}"
        existing = sys_call("SYSTEM$GET_GLOSSARY_TERM", fqn)
        if isinstance(existing, dict) and not existing.get("error") and existing.get("name"):
            print(f"exists   {fqn} ({existing.get('itemKind')}, {existing.get('status')})")
            continue
        body = {"name": a["name"], "itemKind": "ACTION", "domainId": dom["domainId"], "sourceType": "MANUAL",
                "description": a["description"], "synonyms": a["synonyms"],
                "actionSpec": {"actionKind": a["actionKind"], "targetEntity": a["target"], "parameters": a["parameters"],
                               "criteria": a["criteria"], "effects": a["effects"],
                               "execution": {"kind": "PROCEDURE", "target": a["procedure"]}}}
        r = sys_call("SYSTEM$DRAFT_GLOSSARY_TERM", json.dumps(body))
        if isinstance(r, dict) and r.get("error") or (isinstance(r, str) and "error" in r.lower()):
            print(f"REJECTED {fqn}: {r}")
            print("Action nodes are not available on this account; nothing else was changed.")
            sys.exit(2)
        print(f"drafted  {fqn}: {str(r)[:160]}")
        print(f"approved {fqn}: {str(sys_call('SYSTEM$APPROVE_GLOSSARY_TERM', fqn))[:160]}")
        target = f"{DOMAIN}.{a['target']}"
        rel = sys_call("SYSTEM$CREATE_GLOSSARY_RELATIONSHIP", fqn, target, "ACTS_ON")
        print(f"related  {fqn} ACTS_ON {target}: {str(rel)[:160]}")


if __name__ == "__main__":
    main()
