#!/usr/bin/env python3
"""Export the Snowflake Business Ontology "Supply Chain" domain to data/sc_business_ontology.json.

The app now shows two kinds of ontology, and keeps them visibly apart:

  Snowflake Business Ontology (this file)  governed MEANING: approved definitions,
                                           synonyms, typed relationships between
                                           concepts, representations (concept ->
                                           Snowflake object) and change history.
  App ontology (sc_ontology_schema.json)   the OPERATIONAL model: abstract flags,
                                           typed properties, cardinality, the
                                           substitution rule, class -> table maps
                                           and instance counts. Business Ontology
                                           has no field for any of these.

The domain was published from SAP_SUPPLY_CHAIN.ONTOLOGY, so each native node maps
back to an app class. The map is built from the node's synonyms (the app class
name was stored as a synonym where it differs) and falls back to the name with
spaces removed.

Read-only: only SYSTEM$GET_GLOSSARY_* calls. Exported rather than queried live
because tools/bake_static.py builds a credential-free static site.

Run:  python3 tools/export_business_ontology.py
Out:  data/sc_business_ontology.json
"""
import datetime as dt
import json
import pathlib
import sys

import snowflake.connector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from export_ontology_schema import conn_params  # noqa: E402

DOMAIN = "Supply Chain"
ACCOUNT_URL = "https://app.snowflake.com/sfsenorthamerica/dfreriks_aws1_w2"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "sc_business_ontology.json"


def sysfn(cur, sql: str) -> dict:
    cur.execute(sql)
    v = json.loads(cur.fetchone()[0])
    if isinstance(v, dict) and v.get("error") not in (None, False):
        raise RuntimeError(f"{sql}: {v.get('error')}")
    return v


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def snowsight_url(name: str) -> str:
    from urllib.parse import quote
    return f"{ACCOUNT_URL}/#/data/business-ontology/domain/{quote(DOMAIN)}/entity/{quote(name)}"


def main() -> None:
    con = snowflake.connector.connect(**conn_params())
    cur = con.cursor()
    graph = sysfn(cur, "SELECT SYSTEM$GET_GLOSSARY_GRAPH(" + lit(json.dumps(
        {"domainName": DOMAIN, "includeAssociations": True, "limit": 500})) + ")")
    terms = {t["termId"]: t for t in graph["terms"]}
    rels = graph["relationships"]

    nodes = []
    for tid, t in sorted(terms.items(), key=lambda kv: kv[1]["name"]):
        d = sysfn(cur, f"SELECT SYSTEM$GET_GLOSSARY_TERM({lit(tid)})")
        h = sysfn(cur, f"SELECT SYSTEM$GET_GLOSSARY_TERM_HISTORY({lit(tid)}, " + lit(json.dumps({"pageSize": 100})) + ")")
        syn = d.get("synonyms") or []
        app_class = next((s for s in syn if " " not in s), None) or t["name"].replace(" ", "")
        edges = []
        for r in rels:
            if tid not in (r["sourceTermId"], r["targetTermId"]):
                continue
            out = r["sourceTermId"] == tid
            other = terms.get(r["targetTermId"] if out else r["sourceTermId"], {}).get("name")
            edges.append({"type": r["relationshipType"], "label": r.get("label") or None,
                          "direction": "out" if out else "in", "node": other})
        reps = [{"object": a["objectName"], "fqn": a["fqn"], "objectType": a["objectType"],
                 "role": a["associationRole"], "validity": a.get("validity")}
                for a in graph.get("associations", []) if a["termId"] == tid]
        ev = h.get("events") or []
        nodes.append({
            "termId": tid, "name": t["name"], "fqn": t["fqn"], "kind": t["itemKind"],
            "status": d.get("status"), "description": d.get("description"), "synonyms": syn,
            "appClass": app_class, "edges": edges, "representations": reps,
            "history": {"events": len(ev), "truncated": bool(h.get("truncated")),
                        "last": max((e["createdOn"] for e in ev), default=None),
                        "changedBy": sorted({e["changedBy"] for e in ev if e.get("changedBy")})},
            "createdOn": d.get("createdOn"), "lastModifiedOn": d.get("lastModifiedOn"),
            "snowsightUrl": snowsight_url(t["name"]),
        })
    con.close()

    by_id = {n["termId"]: n["name"] for n in nodes}
    out = {
        "domain": DOMAIN,
        "account": "MSB89522",
        "exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "snowsightUrl": f"{ACCOUNT_URL}/#/data/business-ontology",
        "counts": {"nodes": len(nodes), "relationships": len(rels),
                   "representations": sum(len(n["representations"]) for n in nodes)},
        "nodes": nodes,
        "relationships": [{"source": by_id.get(r["sourceTermId"]), "target": by_id.get(r["targetTermId"]),
                           "type": r["relationshipType"], "label": r.get("label") or None} for r in rels],
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(f"{OUT}: {out['counts']}")


if __name__ == "__main__":
    main()
