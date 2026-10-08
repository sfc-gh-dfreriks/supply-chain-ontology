#!/usr/bin/env python3
"""Export the operational digital thread from the knowledge graph.

Reads only SAP_SUPPLY_CHAIN.ONTOLOGY (KG_NODE / KG_EDGE and the VW_ONT_* views
created by sql/ontology/09_operations_thread.sql), so every relationship shown in
the app was resolved by graph traversal, not by an app-side join.

    data/sc_ops_thread.json
      classes      new ontology classes and their instance counts
      relations    new relation types and edge counts
      serials      SystemSerial index (customer, plant, test result, deviating lots)
      trace        per serial: lots -> suppliers, plus the order it shipped on
      lots         per ComponentLot: blast radius (systems, orders, customers, value)
      equipment    Equipment with health and the order book at its plant
"""
import json
import pathlib
from decimal import Decimal

import snowflake.connector

from export_scenario_network import conn_params  # same connection handling as the other exporters

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sc_ops_thread.json"
O = "SAP_SUPPLY_CHAIN.ONTOLOGY"
NEW_CLASSES = ("Equipment", "SalesOrder", "SystemSerial", "ComponentLot")
NEW_RELS = ("installedAt", "placedBy", "fulfilledBy", "builtAt", "shippedOn", "containsLot", "suppliedBy")


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


def main():
    con = snowflake.connector.connect(**conn_params())
    cur = con.cursor()
    q = lambda sql: rows(cur, sql)
    inlist = lambda xs: ",".join(f"'{x}'" for x in xs)

    classes = q(f"""
        SELECT c.CLASS_NAME, c.PARENT_CLASS_NAME, c.IS_ABSTRACT, c.DESCRIPTION, COUNT(n.NODE_ID) AS instances
          FROM {O}.ONT_CLASS c LEFT JOIN {O}.KG_NODE n ON n.NODE_TYPE = c.CLASS_NAME
         WHERE c.CLASS_NAME IN ('Asset','Transaction','Item',{inlist(NEW_CLASSES)})
         GROUP BY 1, 2, 3, 4 ORDER BY instances DESC""")
    relations = q(f"""
        SELECT r.REL_NAME, r.DOMAIN_CLASS, r.RANGE_CLASS, r.CARDINALITY, r.DESCRIPTION, COUNT(e.EDGE_ID) AS edges
          FROM {O}.ONT_RELATION_DEF r LEFT JOIN {O}.KG_EDGE e ON e.EDGE_TYPE = r.REL_NAME
         WHERE r.REL_NAME IN ({inlist(NEW_RELS)})
         GROUP BY 1, 2, 3, 4, 5 ORDER BY edges DESC""")

    # SystemSerial -> shippedOn -> SalesOrder -> placedBy -> Customer, builtAt -> Plant.
    serials = q(f"""
        SELECT sn.NAME AS serial_no, sn.PROPS:MATERIAL::STRING AS material,
               sn.PROPS:FINAL_TEST_RESULT::STRING AS final_test_result,
               so.NAME AS sales_order, cu.NAME AS customer, pl.NAME AS plant_name,
               COUNT_IF(lot.PROPS:INSPECTION_RESULT::STRING <> 'Accepted') AS deviating_lots
          FROM {O}.KG_NODE sn
          JOIN {O}.KG_EDGE es ON es.SRC_ID = sn.NODE_ID AND es.EDGE_TYPE = 'shippedOn'
          JOIN {O}.KG_NODE so ON so.NODE_ID = es.DST_ID
          JOIN {O}.KG_EDGE ep ON ep.SRC_ID = so.NODE_ID AND ep.EDGE_TYPE = 'placedBy'
          JOIN {O}.KG_NODE cu ON cu.NODE_ID = ep.DST_ID
          JOIN {O}.KG_EDGE eb ON eb.SRC_ID = sn.NODE_ID AND eb.EDGE_TYPE = 'builtAt'
          JOIN {O}.KG_NODE pl ON pl.NODE_ID = eb.DST_ID
          JOIN {O}.KG_EDGE el ON el.SRC_ID = sn.NODE_ID AND el.EDGE_TYPE = 'containsLot'
          JOIN {O}.KG_NODE lot ON lot.NODE_ID = el.DST_ID
         WHERE sn.NODE_TYPE = 'SystemSerial'
         GROUP BY 1, 2, 3, 4, 5, 6
         ORDER BY deviating_lots DESC, serial_no""")

    trace_rows = q(f"""
        SELECT sn.NAME AS serial_no, lot.NAME AS lot_id, lot.PROPS AS lot, sup.NAME AS supplier, sup.NODE_ID AS supplier_id
          FROM {O}.KG_NODE sn
          JOIN {O}.KG_EDGE el ON el.SRC_ID = sn.NODE_ID AND el.EDGE_TYPE = 'containsLot'
          JOIN {O}.KG_NODE lot ON lot.NODE_ID = el.DST_ID
          JOIN {O}.KG_EDGE ss ON ss.SRC_ID = lot.NODE_ID AND ss.EDGE_TYPE = 'suppliedBy'
          JOIN {O}.KG_NODE sup ON sup.NODE_ID = ss.DST_ID
         WHERE sn.NODE_TYPE = 'SystemSerial' ORDER BY 1, 2""")
    orders = {r["name"]: r["props"] for r in q(f"SELECT NAME, PROPS FROM {O}.KG_NODE WHERE NODE_TYPE = 'SalesOrder'")}
    sprops = {r["name"]: r["props"] for r in q(f"SELECT NAME, PROPS FROM {O}.KG_NODE WHERE NODE_TYPE = 'SystemSerial'")}
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
               ARRAY_AGG(DISTINCT CUSTOMER) AS customer_list,
               ANY_VALUE(v.order_value_usd) AS order_value_usd
          FROM {O}.VW_ONT_LOT_BLAST_RADIUS b
          JOIN (SELECT LOT_ID AS v_lot, SUM(ORDER_VALUE_USD) AS order_value_usd
                  FROM (SELECT DISTINCT LOT_ID, SALES_ORDER, ORDER_VALUE_USD FROM {O}.VW_ONT_LOT_BLAST_RADIUS)
                 GROUP BY 1) v ON v.v_lot = b.LOT_ID
         GROUP BY 1, 2, 3, 4
         ORDER BY (INSPECTION_RESULT <> 'Accepted') DESC, order_value_usd DESC""")

    equipment = q(f"""
        SELECT eq.NAME AS equipment_name, eq.PROPS AS props, pl.NAME AS plant_name, pl.NODE_ID AS plant_id,
               COUNT(so.NODE_ID) AS plant_orders, SUM(so.PROPS:NET_VALUE_USD::NUMBER) AS plant_order_value,
               COUNT_IF(so.PROPS:ORDER_STATUS::STRING LIKE 'Open%') AS open_orders
          FROM {O}.KG_NODE eq
          JOIN {O}.KG_EDGE ei ON ei.SRC_ID = eq.NODE_ID AND ei.EDGE_TYPE = 'installedAt'
          JOIN {O}.KG_NODE pl ON pl.NODE_ID = ei.DST_ID
          LEFT JOIN {O}.KG_EDGE ef ON ef.DST_ID = pl.NODE_ID AND ef.EDGE_TYPE = 'fulfilledBy'
          LEFT JOIN {O}.KG_NODE so ON so.NODE_ID = ef.SRC_ID
         WHERE eq.NODE_TYPE = 'Equipment'
         GROUP BY 1, 2, 3, 4
         ORDER BY eq.PROPS:FAILURE_PROB_48H::FLOAT DESC""")

    # ---- SC360 operations pulse (gold layer), per plant, keyed to KG plant ids
    A = "SAP_SUPPLY_CHAIN.ANALYTICS"
    pulse = q(f"""
        WITH f AS (SELECT PLANT, PLANT_NAME, COUNT(*) orders, ROUND(100*COUNT_IF(OTIF)/COUNT(*),1) otif_pct,
                          COUNT_IF(NOT ON_TIME) late_orders, SUM(LATE_COST_USD) late_cost_usd,
                          COUNT_IF(ORDER_STATUS LIKE 'Open%') open_orders
                     FROM {A}.DT_ORDER_FULFILLMENT GROUP BY 1, 2),
             r AS (SELECT PLANT, ROUND(100*SUM(PRODUCED_UNITS)/SUM(NAMEPLATE_UNITS),1) operating_rate_pct,
                          SUM(EQUIPMENT_LOSS_UNITS) equipment_loss, SUM(MATERIAL_SHORTAGE_UNITS) material_loss,
                          IFF(SUM(EQUIPMENT_LOSS_UNITS) >= SUM(MATERIAL_SHORTAGE_UNITS), 'Equipment', 'Components') binding_constraint
                     FROM {A}.DT_OPERATING_RATE GROUP BY 1),
             e AS (SELECT PLANT, MAX(FAILURE_PROB_48H) max_failure_prob, COUNT_IF(FAILURE_PROB_48H >= 0.3) tools_at_risk,
                          MAX_BY(EQUIPMENT_NAME, FAILURE_PROB_48H) riskiest_tool, MAX_BY(EQUIPMENT_ID, FAILURE_PROB_48H) riskiest_tool_id
                     FROM (SELECT * FROM {A}.DT_EQUIPMENT_HEALTH
                           QUALIFY ROW_NUMBER() OVER (PARTITION BY EQUIPMENT_ID ORDER BY READING_DATE DESC) = 1)
                    GROUP BY 1),
             c AS (SELECT PLANT, COUNT_IF(STATUS = 'Critical') critical_components,
                          MAX(SUPPLIER_LEAD_TIME_DAYS - DAYS_OF_COVER) worst_shortfall_days,
                          MAX_BY(COMPONENT_DESC, SUPPLIER_LEAD_TIME_DAYS - DAYS_OF_COVER) worst_component
                     FROM {A}.DT_COMPONENT_COVER GROUP BY 1)
        SELECT 'PLT-' || f.PLANT AS node_id, f.*, r.operating_rate_pct, r.equipment_loss, r.material_loss, r.binding_constraint,
               e.max_failure_prob, e.tools_at_risk, e.riskiest_tool, e.riskiest_tool_id,
               c.critical_components, c.worst_shortfall_days, c.worst_component
          FROM f JOIN r USING (PLANT) LEFT JOIN e USING (PLANT) LEFT JOIN c USING (PLANT)
         ORDER BY late_cost_usd DESC""")
    totals = q(f"""SELECT COUNT(*) orders, ROUND(100*COUNT_IF(OTIF)/COUNT(*),1) otif_pct, SUM(LATE_COST_USD) late_cost_usd,
                          COUNT_IF(NOT ON_TIME) late_orders FROM {A}.DT_ORDER_FULFILLMENT""")[0]
    by_cause = q(f"""SELECT LATE_CAUSE_LABEL AS cause, COUNT(*) orders, SUM(LATE_COST_USD) late_cost_usd
                       FROM {A}.DT_ORDER_FULFILLMENT WHERE NOT ON_TIME GROUP BY 1 ORDER BY 3 DESC""")
    # Scenario presets derived from live risk, so the studio opens on today's real exposures.
    # Severity for a tool outage = the tool's work-center share of plant capacity.
    tool = q(f"""SELECT h.EQUIPMENT_ID, h.EQUIPMENT_NAME, h.PLANT, h.PLANT_NAME, h.FAILURE_PROB_48H,
                        ROUND(w.AVAILABLE_CAPACITY_HRS / SUM(w.AVAILABLE_CAPACITY_HRS) OVER (PARTITION BY w.PLANT), 2) AS capacity_share
                   FROM {A}.DT_EQUIPMENT_HEALTH h
                   JOIN SAP_SUPPLY_CHAIN.WORK_CENTER.A_WORK_CENTER w ON w.WORK_CENTER = h.WORK_CENTER
                 QUALIFY ROW_NUMBER() OVER (PARTITION BY h.EQUIPMENT_ID ORDER BY h.READING_DATE DESC) = 1
                  ORDER BY h.FAILURE_PROB_48H DESC LIMIT 1""")[0]
    comp = q(f"""SELECT PLANT, PLANT_NAME, COMPONENT_DESC, SUPPLIER, SUPPLIER_NAME, DAYS_OF_COVER, SUPPLIER_LEAD_TIME_DAYS
                   FROM {A}.DT_COMPONENT_COVER ORDER BY SUPPLIER_LEAD_TIME_DAYS - DAYS_OF_COVER DESC LIMIT 1""")[0]
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

    payload = {"source": O, "operations": operations, "classes": classes, "relations": relations, "serials": serials,
               "trace": trace, "lots": lots, "equipment": equipment,
               "note": "Instances are OPS_EXT demo enrichment keyed to SAP plants, suppliers, customers and BOM."}
    OUT.write_text(json.dumps(payload, default=str))
    print(f"wrote {OUT.name}: {len(serials)} serials, {len(lots)} lots, {len(equipment)} tools")
    cur.close(); con.close()


if __name__ == "__main__":
    main()
