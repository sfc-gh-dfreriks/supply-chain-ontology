#!/usr/bin/env python3
"""Export the operational digital thread THROUGH Snowflake Business Ontology.

Every query starts from a governed concept in the "Supply Chain" domain and reads
the objects the steward linked to it as representations; nothing here names a
table. The concepts and the relationships the thread walks are governed too:

    Component Lot  <- has part -  System Serial  - shipped on ->  Sales Order  - placed by ->  Customer
    System Serial  - built at ->  Plant            Equipment  - installed at ->  Plant
    Component Lot  - supplied by ->  Supplier      Sales Order - fulfilled by ->  Plant

    data/sc_ops_thread.json
      classes      the thread's concepts: parent (IS_A) and instance counts
      relations    the governed relationships the thread walks, with row counts
      serials      System Serial index (customer, plant, test result, deviating lots)
      trace        per serial: lots -> suppliers, plus the order it shipped on
      lots         per Component Lot: blast radius (systems, orders, customers, value)
      equipment    Equipment with health and the order book at its plant
      operations   the dashboard pulse and live scenario presets (Plant, Equipment
                   and Sales Order fact representations)

Run:  python3 tools/export_ops_thread.py [--check]   (--check compares with the file)
"""
import json
import pathlib
import sys
from decimal import Decimal

import snowflake.connector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from sf_conn import conn_params  # noqa: E402
from export_ontology_network import Ontology, DOMAIN  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sc_ops_thread.json"
THREAD = ("Equipment", "Sales Order", "System Serial", "Component Lot", "Asset", "Transaction", "Item")


def rows(cur, sql):
    cur.execute(sql)
    cols = [c[0].lower() for c in cur.description]
    out = []
    for r in cur.fetchall():
        d = {}
        for k, v in zip(cols, r):
            if isinstance(v, Decimal):
                v = float(v)
            elif hasattr(v, "isoformat"):
                v = v.isoformat()
            elif isinstance(v, str) and v[:1] in "{[":
                try:
                    v = json.loads(v)
                except ValueError:
                    pass
            d[k] = v
        out.append(d)
    return out


def rep(ont: Ontology, concept: str, obj: str) -> str:
    """The representation of `concept` named `obj`; fails if the steward has not linked it."""
    hit = [f for f in ont.reps[concept] if f.split(".")[-1] == obj]
    if not hit:
        raise SystemExit(f"{concept} has no representation {obj}; link it in Business Ontology")
    return hit[0]


def main():
    con = snowflake.connector.connect(**conn_params())
    cur = con.cursor()
    q = lambda sql: rows(cur, sql)
    ont = Ontology(cur)
    cur.execute("SELECT SYSTEM$GET_GLOSSARY_GRAPH('" + json.dumps({"domainName": DOMAIN, "limit": 500}) + "')")
    desc = {t["name"]: t.get("subtitle") for t in json.loads(cur.fetchone()[0])["terms"]}

    SER = ont.class_view("System Serial"); ORD = ont.class_view("Sales Order")
    LOT = ont.class_view("Component Lot"); EQP = ont.class_view("Equipment")
    PLT = ont.class_view("Plant"); SUP = ont.class_view("Supplier")
    BLAST = rep(ont, "Component Lot", "VW_ONT_LOT_BLAST_RADIUS")
    ORDERS = rep(ont, "Sales Order", "DT_ORDER_FULFILLMENT")
    RATE = rep(ont, "Plant", "DT_OPERATING_RATE"); COVER = rep(ont, "Plant", "DT_COMPONENT_COVER")
    HEALTH = rep(ont, "Equipment", "DT_EQUIPMENT_HEALTH"); WC = rep(ont, "Equipment", "A_WORK_CENTER")
    plants = f"(SELECT PROPS:PROPS:PLANT::STRING AS PLANT, ENTITY_NAME AS NAME, ENTITY_ID AS NODE_ID FROM {PLT})"

    # ---- the thread's concepts and relationships, as governed
    parent = {s: t for s, rel, t in ont.rels if rel == "is_a"}
    counts = {c: q(f"SELECT COUNT(*) AS n FROM {ont.class_view(c)}")[0]["n"] for c in THREAD if ont.reps.get(c)}
    classes = sorted(({"class_name": c, "parent_class_name": parent.get(c), "is_abstract": c not in counts,
                       "description": desc.get(c), "instances": counts.get(c, 0)} for c in THREAD),
                     key=lambda r: -r["instances"])
    edge_rows = {("System Serial", "has_part", "Component Lot"): f"SELECT COUNT(*) n FROM {BLAST}",
                 ("Sales Order", "fulfilled by", "Plant"): f"SELECT COUNT(*) n FROM {ORD}",
                 ("Sales Order", "placed by", "Customer"): f"SELECT COUNT(*) n FROM {ORD}",
                 ("System Serial", "built at", "Plant"): f"SELECT COUNT(*) n FROM {SER}",
                 ("System Serial", "shipped on", "Sales Order"): f"SELECT COUNT(DISTINCT SERIAL_NO) n FROM {BLAST}",
                 ("Component Lot", "supplied by", "Supplier"): f"SELECT COUNT(*) n FROM {LOT}",
                 ("Equipment", "installed at", "Plant"): f"SELECT COUNT(*) n FROM {EQP}"}
    relations = sorted(({"rel_name": rel.replace("_", " "), "domain_class": s, "range_class": t, "cardinality": None,
                         "description": None, "edges": q(sql)[0]["n"]}
                        for (s, rel, t), sql in edge_rows.items() if (s, rel, t) in set(ont.rels)),
                       key=lambda r: -r["edges"])

    # ---- System Serial -> shipped on -> Sales Order -> placed by -> Customer, built at -> Plant
    serials = q(f"""
        SELECT b.SERIAL_NO AS serial_no, s.PROPS:MATERIAL::STRING AS material,
               s.PROPS:FINAL_TEST_RESULT::STRING AS final_test_result,
               b.SALES_ORDER AS sales_order, o.PROPS:SOLD_TO::STRING AS customer, p.NAME AS plant_name,
               COUNT_IF(b.INSPECTION_RESULT <> 'Accepted') AS deviating_lots
          FROM {BLAST} b
          JOIN {SER} s ON s.NAME = b.SERIAL_NO
          JOIN {ORD} o ON o.NAME = b.SALES_ORDER
          JOIN {plants} p ON p.PLANT = s.PROPS:PLANT::STRING
         GROUP BY 1, 2, 3, 4, 5, 6
         ORDER BY deviating_lots DESC, serial_no""")
    trace_rows = q(f"""
        SELECT b.SERIAL_NO AS serial_no, l.NAME AS lot_id, l.PROPS AS lot, l.PROPS:SUPPLIER::STRING AS supplier,
               sp.ENTITY_ID AS supplier_id
          FROM {BLAST} b
          JOIN {LOT} l ON l.NAME = b.LOT_ID
          JOIN {SUP} sp ON sp.ENTITY_NAME = l.PROPS:SUPPLIER::STRING
         ORDER BY 1, 2""")
    orders = {r["name"]: r["props"] for r in q(f"SELECT NAME, PROPS FROM {ORD}")}
    sprops = {r["name"]: r["props"] for r in q(f"SELECT NAME, PROPS FROM {SER}")}
    trace = {}
    for s in serials:
        trace[s["serial_no"]] = {"serial": s, "system": sprops.get(s["serial_no"], {}),
                                 "order": {"sales_order": s["sales_order"], **orders.get(s["sales_order"], {})},
                                 "lots": []}
    for r in trace_rows:
        if r["serial_no"] in trace:
            trace[r["serial_no"]]["lots"].append({"lot_id": r["lot_id"], "supplier": r["supplier"],
                                                  "supplier_id": r["supplier_id"], **(r["lot"] or {})})

    lots = q(f"""
        SELECT LOT_ID, COMPONENT, SUPPLIER, INSPECTION_RESULT,
               COUNT(DISTINCT SERIAL_NO) AS systems,
               COUNT(DISTINCT IFF(FINAL_TEST_RESULT <> 'PASS', SERIAL_NO, NULL)) AS systems_not_first_pass,
               COUNT(DISTINCT SALES_ORDER) AS orders, COUNT(DISTINCT CUSTOMER) AS customers,
               ARRAY_AGG(DISTINCT CUSTOMER) WITHIN GROUP (ORDER BY CUSTOMER) AS customer_list,
               ANY_VALUE(v.order_value_usd) AS order_value_usd
          FROM {BLAST} b
          JOIN (SELECT LOT_ID AS v_lot, SUM(ORDER_VALUE_USD) AS order_value_usd
                  FROM (SELECT DISTINCT LOT_ID, SALES_ORDER, ORDER_VALUE_USD FROM {BLAST})
                 GROUP BY 1) v ON v.v_lot = b.LOT_ID
         GROUP BY 1, 2, 3, 4
         ORDER BY (INSPECTION_RESULT <> 'Accepted') DESC, order_value_usd DESC, LOT_ID""")

    # ---- Equipment installed at Plant, with the orders that Plant fulfils
    equipment = q(f"""
        SELECT e.NAME AS equipment_name, e.PROPS AS props, p.NAME AS plant_name, p.NODE_ID AS plant_id,
               COUNT(o.NAME) AS plant_orders, SUM(o.PROPS:NET_VALUE_USD::NUMBER) AS plant_order_value,
               COUNT_IF(o.PROPS:ORDER_STATUS::STRING LIKE 'Open%') AS open_orders
          FROM {EQP} e
          JOIN {plants} p ON p.PLANT = e.PROPS:PLANT::STRING
          LEFT JOIN {ORD} o ON o.PROPS:PLANT::STRING = p.PLANT
         GROUP BY 1, 2, 3, 4
         ORDER BY e.PROPS:FAILURE_PROB_48H::FLOAT DESC, e.NAME""")

    # ---- the operations pulse, from Plant, Equipment and Sales Order fact representations
    pulse = q(f"""
        WITH f AS (SELECT PLANT, PLANT_NAME, COUNT(*) orders, ROUND(100*COUNT_IF(OTIF)/COUNT(*),1) otif_pct,
                          COUNT_IF(NOT ON_TIME) late_orders, SUM(LATE_COST_USD) late_cost_usd,
                          COUNT_IF(ORDER_STATUS LIKE 'Open%') open_orders
                     FROM {ORDERS} GROUP BY 1, 2),
             r AS (SELECT PLANT, ROUND(100*SUM(PRODUCED_UNITS)/SUM(NAMEPLATE_UNITS),1) operating_rate_pct,
                          SUM(EQUIPMENT_LOSS_UNITS) equipment_loss, SUM(MATERIAL_SHORTAGE_UNITS) material_loss,
                          IFF(SUM(EQUIPMENT_LOSS_UNITS) >= SUM(MATERIAL_SHORTAGE_UNITS), 'Equipment', 'Components') binding_constraint
                     FROM {RATE} GROUP BY 1),
             e AS (SELECT PLANT, MAX(FAILURE_PROB_48H) max_failure_prob, COUNT_IF(FAILURE_PROB_48H >= 0.3) tools_at_risk,
                          MAX_BY(EQUIPMENT_NAME, FAILURE_PROB_48H) riskiest_tool, MAX_BY(EQUIPMENT_ID, FAILURE_PROB_48H) riskiest_tool_id
                     FROM (SELECT * FROM {HEALTH}
                           QUALIFY ROW_NUMBER() OVER (PARTITION BY EQUIPMENT_ID ORDER BY READING_DATE DESC) = 1)
                    GROUP BY 1),
             c AS (SELECT PLANT, COUNT_IF(STATUS = 'Critical') critical_components,
                          MAX(SUPPLIER_LEAD_TIME_DAYS - DAYS_OF_COVER) worst_shortfall_days,
                          MAX_BY(COMPONENT_DESC, SUPPLIER_LEAD_TIME_DAYS - DAYS_OF_COVER) worst_component
                     FROM {COVER} GROUP BY 1)
        SELECT 'PLT-' || f.PLANT AS node_id, f.*, r.operating_rate_pct, r.equipment_loss, r.material_loss, r.binding_constraint,
               e.max_failure_prob, e.tools_at_risk, e.riskiest_tool, e.riskiest_tool_id,
               c.critical_components, c.worst_shortfall_days, c.worst_component
          FROM f JOIN r USING (PLANT) LEFT JOIN e USING (PLANT) LEFT JOIN c USING (PLANT)
         ORDER BY late_cost_usd DESC""")
    totals = q(f"""SELECT COUNT(*) orders, ROUND(100*COUNT_IF(OTIF)/COUNT(*),1) otif_pct, SUM(LATE_COST_USD) late_cost_usd,
                          COUNT_IF(NOT ON_TIME) late_orders FROM {ORDERS}""")[0]
    by_cause = q(f"""SELECT LATE_CAUSE_LABEL AS cause, COUNT(*) orders, SUM(LATE_COST_USD) late_cost_usd
                       FROM {ORDERS} WHERE NOT ON_TIME GROUP BY 1 ORDER BY 3 DESC""")
    # Scenario presets derived from live risk, so the studio opens on today's real exposures.
    # Severity for a tool outage = the tool's work-center share of plant capacity.
    tool = q(f"""SELECT h.EQUIPMENT_ID, h.EQUIPMENT_NAME, h.PLANT, h.PLANT_NAME, h.FAILURE_PROB_48H,
                        ROUND(w.AVAILABLE_CAPACITY_HRS / SUM(w.AVAILABLE_CAPACITY_HRS) OVER (PARTITION BY w.PLANT), 2) AS capacity_share
                   FROM {HEALTH} h
                   JOIN {WC} w ON w.WORK_CENTER = h.WORK_CENTER
                 QUALIFY ROW_NUMBER() OVER (PARTITION BY h.EQUIPMENT_ID ORDER BY h.READING_DATE DESC) = 1
                  ORDER BY h.FAILURE_PROB_48H DESC LIMIT 1""")[0]
    comp = q(f"""SELECT PLANT, PLANT_NAME, COMPONENT_DESC, SUPPLIER, SUPPLIER_NAME, DAYS_OF_COVER, SUPPLIER_LEAD_TIME_DAYS
                   FROM {COVER} ORDER BY SUPPLIER_LEAD_TIME_DAYS - DAYS_OF_COVER DESC LIMIT 1""")[0]
    worst_lot = next((l for l in lots if l["inspection_result"] == "Rejected"), lots[0])
    presets = [
        {"id": "ops-tool-failure", "label": f"Tool failure — {tool['equipment_name']} ({tool['plant_name']})",
         "kind": "capacity", "targets": [f"PLT-{tool['plant']}"],
         "severity": max(0.15, min(0.6, float(tool["capacity_share"] or 0.3))), "durationDays": 14,
         "blurb": f"From SC360: {100*float(tool['failure_prob_48h']):.0f}% failure risk in 48h and anomalous vibration. "
                  f"Its work center is ~{100*float(tool['capacity_share'] or 0.3):.0f}% of plant capacity."},
        {"id": "ops-component-shortage", "label": f"Shortage — {comp['component_desc']} at {comp['plant_name']}",
         "kind": "capacity", "targets": [f"PLT-{comp['plant']}"], "severity": 0.35,
         "durationDays": int(float(comp["supplier_lead_time_days"]) - float(comp["days_of_cover"])),
         "blurb": f"From SC360: {comp['days_of_cover']} days of cover against a {comp['supplier_lead_time_days']}-day "
                  f"lead time from {comp['supplier_name']}. The line is short until the next receipt."},
        {"id": "ops-lot-recall", "label": f"Supplier quality hold — {worst_lot['supplier']} ({worst_lot['lot_id']})",
         "kind": "supplier", "targets": [next((r['supplier_id'] for t in trace.values() for r in t['lots'] if r['lot_id'] == worst_lot['lot_id']), "SUP-003")],
         "severity": 0.6, "durationDays": 21,
         "blurb": f"Lot {worst_lot['lot_id']} ({worst_lot['component']}) was {worst_lot['inspection_result'].lower()} and reached "
                  f"{worst_lot['systems']} systems across {worst_lot['customers']} customers. A hold on the supplier while it is contained."},
    ]
    operations = {"totals": totals, "by_cause": by_cause, "plants": pulse, "presets": presets}

    payload = {"source": f"Snowflake Business Ontology · {DOMAIN}", "operations": operations, "classes": classes,
               "relations": relations, "serials": serials, "trace": trace, "lots": lots, "equipment": equipment,
               "lineage": {"System Serial": SER, "Sales Order": [ORD, ORDERS], "Component Lot": [LOT, BLAST],
                           "Equipment": [EQP, HEALTH, WC], "Plant": [PLT, RATE, COVER], "Supplier": SUP},
               "note": "Instances are OPS_EXT demo enrichment keyed to SAP plants, suppliers, customers and BOM."}
    cur.close(); con.close()

    if "--check" in sys.argv:
        old = json.loads(OUT.read_text())
        new = json.loads(json.dumps(payload, default=str))
        def norm(k, v):
            if k == "lots":
                return sorted(json.dumps({**r, "customer_list": sorted(r["customer_list"])}, sort_keys=True) for r in v)
            if k == "equipment":
                return sorted(json.dumps(r, sort_keys=True) for r in v)
            return v
        bad = [k for k in ("serials", "trace", "lots", "equipment", "operations") if norm(k, old.get(k)) != norm(k, new[k])]
        print("parity:", "IDENTICAL" if not bad else f"DIFFERS in {bad}")
        for k in bad:
            o, n = old[k], new[k]
            if isinstance(o, list):
                i = next((i for i, (a, b) in enumerate(zip(o, n)) if a != b), None)
                print(f"  {k}: {len(o)} vs {len(n)} rows; first diff at {i}")
                if i is not None:
                    print("    old", json.dumps(o[i], default=str)[:400]); print("    new", json.dumps(n[i], default=str)[:400])
            elif isinstance(o, dict):
                ks = [x for x in set(o) | set(n) if o.get(x) != n.get(x)][:3]
                for x in ks:
                    print(f"  {k}.{x}\n    old {json.dumps(o.get(x), default=str)[:400]}\n    new {json.dumps(n.get(x), default=str)[:400]}")
        sys.exit(1 if bad else 0)

    OUT.write_text(json.dumps(payload, default=str))
    print(f"wrote {OUT.name}: {len(serials)} serials, {len(lots)} lots, {len(equipment)} tools")


if __name__ == "__main__":
    main()
