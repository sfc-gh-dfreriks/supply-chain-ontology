"""End-to-end test of the S/4HANA writeback governance (sql/ontology/10_s4_writeback.sql).

Runs the hurricane plan through propose -> approve -> post -> reverse and checks
that every refusal leaves the simulated S/4HANA untouched. Resets the demo first
and last, so it is safe to rerun.

    python3 tools/test_s4_writeback.py
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path.home() / "Documents/GitHub/mfg-use-cases/framework/tools"))
from sf import connect  # noqa: E402

PLAN = {"scenario": "Hurricane — Austin Fab offline", "requestedBy": "Maria Chen (Supply Planner)", "planHash": "test", "reroutes": [
    {"flow_id": "FL-016", "material_category": "Inspection Systems", "customer": "GlobalFoundries",
     "fromPlant": "Austin Fab", "toPlantId": "1000", "unitsMoved": 2},
    {"flow_id": "FL-017", "material_category": "Metrology", "customer": "Micron Technology",
     "fromPlant": "Austin Fab", "toPlantId": "1000", "unitsMoved": 3}]}
ACKS = json.dumps(["reviewed", "transactional", "recorded"])
APPROVER = "Raj Patel (Operations Director)"
failures = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def main():
    c = connect().cursor()
    c.execute("USE SCHEMA SAP_SUPPLY_CHAIN.S4_WRITEBACK")
    c.execute("CALL SP_RESET_DEMO()")

    def call(sql, *args):
        c.execute(sql, args)
        v = c.fetchone()[0]
        try:
            return json.loads(v)
        except (TypeError, ValueError):
            return v

    def state():
        c.execute("SELECT HASH_AGG(VBELN, POSNR, WERKS) FROM S4_SALES_ORDER_ITEM")
        h = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM S4_PLANNED_ORDER WHERE STATUS = 'CREATED'")
        return h, c.fetchone()[0]

    seed = state()
    r = call("CALL SP_PROPOSE_RECOVERY_CR(PARSE_JSON(%s))", json.dumps(PLAN))
    cr = r.get("cr_id")
    check("propose creates a change request", bool(cr), r)
    c.execute("SELECT ACTION_NAME, OBJECT_KEY, VALUE_BEFORE, VALUE_AFTER, ELIGIBLE FROM CR_ITEM WHERE CR_ID = %s ORDER BY CR_ITEM", (cr,))
    items = c.fetchall()
    for it in items:
        print("      ", it)
    check("4 items: 2 plant reassignments + 2 planned orders", len(items) == 4 and sum(i[0] == "Create Planned Order" for i in items) == 2)
    check("all items eligible", all(i[4] for i in items))
    check("propose writes nothing to S/4", state() == seed)

    check("post refused before approval", "error" in call("CALL SP_POST_CR(%s)", cr))
    check("Action procedure refuses when called directly",
          str(call("CALL S4_REASSIGN_DELIVERING_PLANT(%s, 1, '4600004', 10, '1000')", cr)).startswith("REFUSED"))
    check("self-approval refused (segregation of duties)",
          "error" in call("CALL SP_DECIDE_CR(%s, 'APPROVE', %s, PARSE_JSON(%s), 'POST TO S4HANA', '')", cr, PLAN["requestedBy"], ACKS))
    check("missing acknowledgement refused",
          "error" in call("CALL SP_DECIDE_CR(%s, 'APPROVE', %s, PARSE_JSON(%s), 'POST TO S4HANA', '')", cr, APPROVER, '["reviewed"]'))
    check("wrong confirmation phrase refused",
          "error" in call("CALL SP_DECIDE_CR(%s, 'APPROVE', %s, PARSE_JSON(%s), 'post to s4', '')", cr, APPROVER, ACKS))
    check("refusals left S/4 unchanged", state() == seed)

    check("approve", call("CALL SP_DECIDE_CR(%s, 'APPROVE', %s, PARSE_JSON(%s), 'POST TO S4HANA', 'Hurricane recovery')",
                          cr, APPROVER, ACKS).get("status") == "APPROVED")
    p = call("CALL SP_POST_CR(%s)", cr)
    check("post", p.get("status") == "POSTED" and p.get("posted") == 4, p)
    c.execute("SELECT WERKS FROM S4_SALES_ORDER_ITEM WHERE VBELN IN ('4600004', '4600005')")
    check("sales order items now delivered from plant 1000", {r[0] for r in c.fetchall()} == {"1000"})
    c.execute("SELECT COUNT(*), SUM(GSMNG) FROM S4_PLANNED_ORDER WHERE CR_ID = %s AND STATUS = 'CREATED'", (cr,))
    check("2 planned orders created at plant 1000 for 5 units", c.fetchone() == (2, 5))
    c.execute("SELECT COUNT(*) FROM S4_CHANGE_DOCUMENT WHERE CR_ID = %s", (cr,))
    check("4 change documents", c.fetchone()[0] == 4)
    c.execute("SELECT COUNT(*) FROM S4_API_OUTBOX WHERE CR_ID = %s", (cr,))
    check("4 OData calls in the outbox", c.fetchone()[0] == 4)
    check("posting twice refused", "error" in call("CALL SP_POST_CR(%s)", cr))

    check("reverse", call("CALL SP_REVERSE_CR(%s, %s)", cr, APPROVER).get("status") == "REVERSED")
    after = state()
    c.execute("SELECT VBELN, POSNR, WERKS FROM S4_SALES_ORDER_ITEM WHERE CHANGED_BY <> 'SEED'")
    check("reversal restores the order book and removes planned orders", after == seed, f"{after} vs {seed}; touched {c.fetchall()}")

    c.execute("CALL SP_RESET_DEMO()")
    print(f"\n{len(failures)} failure(s)" if failures else "\nall checks passed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
