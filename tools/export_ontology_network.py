#!/usr/bin/env python3
"""Build the scenario network THROUGH Snowflake Business Ontology.

Writes data/sc_network.json, the input to the scenario engine (Scenario Studio,
Ripple Map, Mitigation). It replaces tools/export_scenario_network.py, which read
the SAP_SUPPLY_CHAIN.SCENARIO schema directly. Nothing here names a table: every
input is found by walking the governed "Supply Chain" domain and reading the
objects the steward linked to each concept as representations.

  network nodes   the concepts at either end of the governed "supplies" and
                  "ships to" relationships (Supplier, Plant, Customer)
  flows           the concepts that IS_A the concept Material Category
                  "classifies" (Inbound, Outbound, Inter Plant Flow)
  capacity,       properties of the Plant concept's representation
  inventory
  substitution    Material Category's second representation (which plants are
                  qualified to produce each category)
  economics       Sales Order's second representation, rolled up to the Plant
                  each order is "fulfilled by"

A concept's first representation is its class view (VW_ONT_<concept>); a
second one carries facts about the concept. The output shape is unchanged, so
the engine and every page read it exactly as before. `source` records which
concept and object each part came from.

Read-only: SYSTEM$GET_GLOSSARY_* calls and SELECTs on the represented objects.

Run:  python3 tools/export_ontology_network.py [--check]
Out:  data/sc_network.json   (--check compares with the file instead of writing)
"""
import json
import pathlib
import sys
from collections import defaultdict

import snowflake.connector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from sf_conn import conn_params  # noqa: E402

DOMAIN = "Supply Chain"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "sc_network.json"


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def num(v):
    """Snowflake NUMBER arrives as Decimal; match the old export's rounding."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    return int(f) if f.is_integer() else round(f, 4)


class Ontology:
    """The governed domain, read once: concepts, relationships, representations."""

    def __init__(self, cur):
        cur.execute("SELECT SYSTEM$GET_GLOSSARY_GRAPH(" + lit(json.dumps(
            {"domainName": DOMAIN, "includeAssociations": True, "limit": 500})) + ")")
        g = json.loads(cur.fetchone()[0])
        self.name = {t["termId"]: t["name"] for t in g["terms"]}
        self.rels = [(self.name[r["sourceTermId"]], (r.get("label") or r["relationshipType"]).lower(),
                      self.name[r["targetTermId"]]) for r in g["relationships"]]
        self.reps = defaultdict(list)
        for a in g["associations"]:
            self.reps[self.name[a["termId"]]].append(a["fqn"])

    def related(self, label: str):
        return [(s, t) for s, rel, t in self.rels if rel == label]

    def children(self, parent: str):
        return sorted(s for s, rel, t in self.rels if rel == "is_a" and t == parent)

    def class_view(self, concept: str) -> str:
        """VW_ONT_<concept>, e.g. VW_ONT_COMPONENTLOT for Component Lot."""
        want = "VW_ONT_" + concept.replace(" ", "").upper()
        v = [f for f in self.reps[concept] if f.split(".")[-1] == want]
        if not v:
            raise SystemExit(f"{concept} has no class-view representation ({want})")
        return v[0]

    def fact_object(self, concept: str) -> str:
        """The concept's one other representation (facts about it, not the class view)."""
        v = [f for f in self.reps[concept] if f != self.class_view(concept)]
        if len(v) != 1:
            raise SystemExit(f"{concept} needs exactly one fact representation, has {len(v)}")
        return v[0]


def props(cur, fqn: str) -> list[dict]:
    """Rows of a VW_ONT_* class view: its PROPS object, keys lower-cased."""
    cur.execute(f"SELECT PROPS:PROPS FROM {fqn}")
    return [{k.lower(): v for k, v in json.loads(r[0]).items()} for r in cur.fetchall()]


def main() -> None:
    con = snowflake.connector.connect(**conn_params())
    cur = con.cursor()
    ont = Ontology(cur)

    # ---- which concepts make up the network: follow the governed relationships
    supplies, ships = ont.related("supplies"), ont.related("ships to")
    if not supplies or not ships:
        raise SystemExit("Domain is missing the 'supplies' or 'ships to' relationship")
    node_concepts = sorted({c for pair in supplies + ships for c in pair})
    plant = next(t for _, t in supplies)                      # Supplier supplies -> Plant
    category, flow_parent = next((s, t) for s, rel, t in ont.rels if rel == "classifies")
    flow_concepts = ont.children(flow_parent)
    order = next(s for s, t in ont.related("fulfilled by") if t == plant)

    # ---- nodes, from each node concept's class view
    nodes = []
    for c in node_concepts:
        for p in props(cur, ont.class_view(c)):
            nodes.append({"node_id": p["node_id"], "node_name": p["node_name"], "node_type": c,
                          "city": p.get("city"), "country": p.get("country"),
                          "latitude": num(p.get("latitude")), "longitude": num(p.get("longitude")),
                          "plant": p.get("plant")})
    nodes.sort(key=lambda n: (n["node_type"], n["node_name"]))

    # ---- flows, from every concept that IS_A the classified flow concept
    flows = []
    for c in flow_concepts:
        for p in props(cur, ont.class_view(c)):
            flows.append({k: (num(v) if k in ("monthly_volume", "monthly_value", "source_lat", "source_lon",
                                              "target_lat", "target_lon") else v)
                          for k, v in p.items()})
    flows.sort(key=lambda f: f["flow_id"])
    flow_keys = ["flow_id", "flow_type", "material_category", "monthly_volume", "monthly_value",
                 "source_id", "source_name", "source_type", "source_city", "source_country", "source_lat",
                 "source_lon", "source_plant", "target_id", "target_name", "target_type", "target_city",
                 "target_country", "target_lat", "target_lon", "target_plant"]
    flows = [{k: f.get(k) for k in flow_keys} for f in flows]

    # ---- capacity and inventory are Plant properties
    plants = props(cur, ont.class_view(plant))
    cap_keys = ["work_centers", "available_hrs", "used_hrs", "free_hrs", "utilization_pct",
                "headroom_pct", "units_shipped", "hrs_per_unit", "spare_units"]
    inv_keys = ["materials", "min_days_of_inventory", "avg_days_of_inventory", "stock_value",
                "obsolete_materials"]
    cap = sorted(({"plant": p["plant"], "plant_name": p["node_name"], **{k: num(p.get(k)) for k in cap_keys}}
                  for p in plants), key=lambda r: r["plant_name"])
    inv = sorted(({"plant": p["plant"], "plant_name": p["node_name"], **{k: num(p.get(k)) for k in inv_keys}}
                  for p in plants), key=lambda r: r["plant_name"])

    # ---- substitution: which plants are qualified for each category
    cur.execute(f"SELECT PROPS FROM {ont.fact_object(category)}")
    sub = []
    for (raw,) in cur.fetchall():
        p = {k.lower(): v for k, v in json.loads(raw).items()}
        sub.append({"material_category": p["material_category"], "flow_type": p["flow_type"],
                    "source_plant": p["source_plant"], "plant_name": p["plant_name"],
                    "volume": num(p["volume"]), "value": num(p["value"]),
                    "capable_plants": num(p["capable_plants"]), "has_alternative": p["has_alternative"]})
    sub.sort(key=lambda r: (r["material_category"], r["plant_name"]))

    # ---- economics: orders rolled up to the plant that fulfils them
    cur.execute(f"""
        SELECT 'PLT-' || o.PLANT, o.PLANT_NAME,
               ROUND(SUM(o.NET_VALUE_USD) / NULLIF(COUNT(DISTINCT o.SHIP_MONTH), 0)),
               ROUND(SUM(o.MARGIN_PER_UNIT_USD * o.ORDER_QTY) / NULLIF(SUM(o.NET_VALUE_USD), 0), 3),
               ROUND(100 * COUNT_IF(o.OTIF) / COUNT(*), 1),
               COUNT_IF(o.ORDER_STATUS LIKE 'Open%'),
               SUM(IFF(o.ORDER_STATUS LIKE 'Open%', o.NET_VALUE_USD, 0))
          FROM {ont.fact_object(order)} o GROUP BY 1, 2 ORDER BY 2""")
    econ = [dict(zip(["node_id", "plant_name", "monthly_order_value", "margin_rate", "otif_pct",
                      "open_orders", "open_order_value"],
                     [r[0], r[1]] + [num(v) for v in r[2:]])) for r in cur.fetchall()]
    con.close()

    payload = {
        "nodes": nodes, "economics": econ, "flows": flows, "capacity": cap, "inventory": inv,
        "substitution": sub,
        "totals": {
            "nodes": len(nodes), "flows": len(flows),
            "monthly_value": num(sum(f["monthly_value"] or 0 for f in flows)),
            "plants": sum(1 for n in nodes if n["node_type"] == "Plant"),
            "suppliers": sum(1 for n in nodes if n["node_type"] == "Supplier"),
            "customers": sum(1 for n in nodes if n["node_type"] == "Customer"),
            "single_source_categories": sorted({s["material_category"] for s in sub if not s["has_alternative"]}),
        },
        "source": f"Snowflake Business Ontology · {DOMAIN}",
        "lineage": {
            "nodes": {c: ont.class_view(c) for c in node_concepts},
            "flows": {c: ont.class_view(c) for c in flow_concepts},
            "capacity_inventory": {plant: ont.class_view(plant)},
            "substitution": {category: ont.fact_object(category)},
            "economics": {order: ont.fact_object(order)},
            "walk": {"network": "supplies, ships to", "flows": f"{category} classifies {flow_parent}; IS_A children",
                     "economics": f"{order} fulfilled by {plant}"},
        },
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

    if "--check" in sys.argv:
        old = json.loads(OUT.read_text())
        bad = [k for k in ("nodes", "economics", "flows", "capacity", "inventory", "substitution", "totals")
               if old.get(k) != payload[k]]
        print("parity:", "IDENTICAL" if not bad else f"DIFFERS in {bad}")
        for k in bad:
            o, n = old.get(k), payload[k]
            if isinstance(o, list):
                for i, (a, b) in enumerate(zip(o, n)):
                    if a != b:
                        print(f"  {k}[{i}]\n    old {a}\n    new {b}")
                        break
                if len(o) != len(n):
                    print(f"  {k}: {len(o)} vs {len(n)} rows")
            else:
                print(f"  {k}\n    old {o}\n    new {n}")
        sys.exit(1 if bad else 0)

    OUT.write_text(json.dumps(payload))
    t = payload["totals"]
    print(f"wrote {OUT}: {t['nodes']} nodes, {t['flows']} flows, ${t['monthly_value']:,.0f}/month")
    print(json.dumps(payload["lineage"], indent=1))


if __name__ == "__main__":
    main()
