#!/usr/bin/env python3
"""Export SAP_SUPPLY_CHAIN.SCENARIO to data/sc_network.json.

The scenario engine runs in the Node server, not in Snowflake. The network is 19
nodes and 27 flows, so propagating a disruption in-process costs microseconds,
whereas a warehouse round-trip per slider movement would make the UI unusable.
Snowflake stays the source of truth; this is the served artifact.

Exporting also keeps the property that the app runs with no credentials — the
same reason data/sc_ontology.json is committed. Only the AI reasoning needs a
live connection, and it degrades with a message when absent.

Run:  python3 tools/export_scenario_network.py
Out:  data/sc_network.json
"""
import json
import pathlib
import sys

import snowflake.connector

DB, SC = "SAP_SUPPLY_CHAIN", "SCENARIO"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "sc_network.json"


def conn_params(name="dfreriksdemo"):
    try:
        import tomllib
    except ModuleNotFoundError:
        import tomli as tomllib
    p = pathlib.Path.home() / ".snowflake" / "connections.toml"
    c = dict(tomllib.loads(p.read_text())[name])
    if "private_key_path" in c:
        c["private_key_file"] = str(pathlib.Path(c.pop("private_key_path")).expanduser())
    c.setdefault("warehouse", "COMPUTE_WH")
    return c


def rows(cur, sql: str) -> list[dict]:
    cur.execute(sql)
    cols = [d[0].lower() for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def num(v):
    """Snowflake NUMBER comes back as Decimal, which is not JSON serializable."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    return int(f) if f.is_integer() else round(f, 4)


def clean(rs: list[dict], numeric: tuple[str, ...]) -> list[dict]:
    out = []
    for r in rs:
        d = {k: (num(v) if k in numeric else v) for k, v in r.items()}
        out.append(d)
    return out


def main() -> None:
    conn = snowflake.connector.connect(**conn_params())
    cur = conn.cursor()

    nodes = clean(rows(cur, f"SELECT * FROM {DB}.{SC}.V_NODE ORDER BY NODE_TYPE, NODE_NAME"),
                  ("latitude", "longitude"))
    flows = clean(rows(cur, f"SELECT * FROM {DB}.{SC}.V_FLOW ORDER BY FLOW_ID"),
                  ("monthly_volume", "monthly_value",
                   "source_lat", "source_lon", "target_lat", "target_lon"))
    cap = clean(rows(cur, f"SELECT * FROM {DB}.{SC}.V_PLANT_CAPACITY ORDER BY PLANT_NAME"),
                ("work_centers", "available_hrs", "used_hrs", "free_hrs",
                 "utilization_pct", "headroom_pct", "units_shipped",
                 "hrs_per_unit", "spare_units"))
    inv = clean(rows(cur, f"SELECT * FROM {DB}.{SC}.V_PLANT_INVENTORY ORDER BY PLANT_NAME"),
                ("materials", "min_days_of_inventory", "avg_days_of_inventory",
                 "stock_value", "obsolete_materials"))
    sub = clean(rows(cur, f"SELECT * FROM {DB}.{SC}.V_SUBSTITUTION "
                          f"ORDER BY MATERIAL_CATEGORY, PLANT_NAME"),
                ("volume", "value", "capable_plants"))

    # Order economics per plant from the operations extension (demo enrichment keyed
    # to SAP plants): lets the ripple be valued in lost margin and late penalties.
    econ = clean(rows(cur, """
        SELECT 'PLT-' || o.PLANT AS node_id, o.PLANT_NAME AS plant_name,
               ROUND(SUM(o.NET_VALUE_USD) / NULLIF(COUNT(DISTINCT o.SHIP_MONTH), 0)) AS monthly_order_value,
               ROUND(SUM(o.MARGIN_PER_UNIT_USD * o.ORDER_QTY) / NULLIF(SUM(o.NET_VALUE_USD), 0), 3) AS margin_rate,
               ROUND(100 * COUNT_IF(o.OTIF) / COUNT(*), 1) AS otif_pct,
               COUNT_IF(o.ORDER_STATUS LIKE 'Open%') AS open_orders,
               SUM(IFF(o.ORDER_STATUS LIKE 'Open%', o.NET_VALUE_USD, 0)) AS open_order_value
          FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_ORDER_FULFILLMENT o
         GROUP BY 1, 2 ORDER BY 2"""),
        ("monthly_order_value", "margin_rate", "otif_pct", "open_orders", "open_order_value"))

    payload = {
        "nodes": nodes,
        "economics": econ,
        "flows": flows,
        "capacity": cap,
        "inventory": inv,
        "substitution": sub,
        "totals": {
            "nodes": len(nodes),
            "flows": len(flows),
            "monthly_value": num(sum(f["monthly_value"] or 0 for f in flows)),
            "plants": sum(1 for n in nodes if n["node_type"] == "Plant"),
            "suppliers": sum(1 for n in nodes if n["node_type"] == "Supplier"),
            "customers": sum(1 for n in nodes if n["node_type"] == "Customer"),
            "single_source_categories": sorted(
                {s["material_category"] for s in sub if not s["has_alternative"]}),
        },
        "source": f"{DB}.{SC}",
        "notes": {
            "hrs_per_unit": "Derived: used hours divided by units shipped, blended "
                            "across work centers and products. Planning-grade only.",
            "min_days_of_inventory": "The operative buffer for ripple timing. One "
                                     "component at 12 days stops the line regardless "
                                     "of another at 400.",
            "substitution": "Derived from observed shipments, not production versions "
                            "(each material maps to exactly one plant there, so they "
                            "express no alternatives).",
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload))
    cur.close(); conn.close()

    t = payload["totals"]
    print(f"wrote {OUT}")
    print(f"  nodes    {t['nodes']:>4}  ({t['plants']} plants, {t['suppliers']} suppliers, "
          f"{t['customers']} customers)")
    print(f"  flows    {t['flows']:>4}  ${t['monthly_value']:,.0f} monthly value")
    print(f"  capacity {len(cap):>4}   inventory {len(inv)}   substitution {len(sub)}")
    print(f"  size     {OUT.stat().st_size/1024:.1f} KB")
    print(f"\n  unmitigable categories: {', '.join(t['single_source_categories'])}")
    print("\n  capacity headroom:")
    for c in sorted(cap, key=lambda x: -(x["spare_units"] or 0)):
        print(f"     {c['plant_name']:18} {c['free_hrs']:>6} free hrs  "
              f"{c['hrs_per_unit']:>6} hrs/unit  {c['spare_units']:>3} spare units")
    print("\n  inventory buffer (min days — sets ripple timing):")
    for i in sorted(inv, key=lambda x: x["min_days_of_inventory"] or 0):
        print(f"     {i['plant_name'] or i['plant']:18} {i['min_days_of_inventory']:>4} days")


if __name__ == "__main__":
    main()
