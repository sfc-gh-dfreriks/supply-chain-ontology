"""Single source for every figure the documentation generators quote.

Reads the exported ontology, network and thread JSON plus the baked Hamamatsu
scenario, so a refresh (``npm run refresh``) flows into every deliverable.
"""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BAKED = ROOT / "client" / "public" / "data"
HAMAMATSU = BAKED / "scenario_sim__supplier__SUP-001__100__45.json"

# Sidebar order (client/src/components/Sidebar.tsx). The app opens on Ontology.
PAGES = [
    ("Ontology", "#model",
     "The governed Supply Chain domain: graph, definitions, relationships, representations, history"),
    ("Executive Dashboard", "#overview",
     "Operations pulse, the governed domain and the network the scenarios run on"),
    ("Snowflake Ontology Details", "#snowflake",
     "Snowsight screenshots of the same domain: graph, list, Supplier and Plant nodes, change history"),
    ("Ask Cortex", "#ask",
     "Questions across the whole supply chain, answered from the governed domain, operations and every scenario"),
    ("Guided Demo", "#demo", "Seven-step walkthrough of the hurricane scenario"),
    ("Scenario Studio", "#scenario",
     "Build a disruption from five event types; results bucketed by the response each needs"),
    ("Ripple Map", "#ripple",
     "Geography and topology side by side, the cascade played one lane at a time"),
    ("Mitigation & Recovery", "#mitigation",
     "Reroutes inside real capacity, old lanes in red and new lanes in green; what cannot be saved and why"),
    ("Digital Thread", "#thread",
     "Orders, systems, component lots and tools: which customers did this bad lot reach?"),
]


def _load(p):
    return json.loads(Path(p).read_text())


def money(v, digits=2):
    """$9.08M / $790K style."""
    v = float(v)
    if abs(v) >= 1e6:
        return f"${v / 1e6:.{digits}f}M"
    if abs(v) >= 1e3:
        return f"${v / 1e3:.0f}K"
    return f"${v:.0f}"


def build():
    bo = _load(DATA / "sc_business_ontology.json")
    net = _load(DATA / "sc_network.json")
    th = _load(DATA / "sc_ops_thread.json")
    ham = _load(HAMAMATSU)

    kinds = Counter(n["kind"] for n in bo["nodes"])
    rel_types = Counter(r["type"] for r in bo["relationships"])
    t = net["totals"]
    cls = {c["class_name"]: c["instances"] for c in th["classes"]}
    deviating = [l for l in th["lots"] if l["inspection_result"] != "Accepted"]
    r, p = ham["result"]["totals"], ham["plan"]["totals"]

    return {
        "domain": bo["domain"],
        "account": bo["account"],
        "exported_at": bo["exportedAt"],
        "snowsight_url": bo["snowsightUrl"],
        "concepts": bo["counts"]["nodes"],
        "entities": kinds.get("ENTITY", 0),
        "terms": kinds.get("TERM", 0),
        "relationships": bo["counts"]["relationships"],
        "rel_types": dict(rel_types.most_common()),
        "representations": bo["counts"]["representations"],
        "concept_names": sorted(n["name"] for n in bo["nodes"]),
        "pages": PAGES,
        "page_names": [p_[0] for p_ in PAGES],
        "plants": t["plants"],
        "suppliers": t["suppliers"],
        "customers": t["customers"],
        "network_nodes": t["nodes"],
        "flows": t["flows"],
        "monthly_value": t["monthly_value"],
        "single_source": list(t["single_source_categories"]),
        "systems": len(th["serials"]),
        "lots": len(th["lots"]),
        "lots_view": cls.get("Component Lot", len(th["lots"])),
        "deviating_lots": len(deviating),
        "rejected_lots": sum(l["inspection_result"] == "Rejected" for l in deviating),
        "tools": len(th["equipment"]),
        "orders": th["operations"]["totals"]["orders"],
        "otif_pct": th["operations"]["totals"]["otif_pct"],
        "late_orders": th["operations"]["totals"]["late_orders"],
        "late_cost": th["operations"]["totals"]["late_cost_usd"],
        "ham": {
            "label": ham["result"]["disruption"]["label"],
            "duration_days": ham["result"]["disruption"]["durationDays"],
            "value_at_risk": r["valueAtRisk"],
            "pct_network": r["pctOfNetwork"],
            "revenue_at_risk": r["revenueAtRisk"],
            "lost_margin": r["lostMargin"],
            "late_penalty": r["latePenalty"],
            "cost_of_disruption": r["costOfDisruption"],
            "hops": r["maxHop"],
            "plants_impaired": r["plantsImpaired"],
            "customers_affected": r["customersAffected"],
            "protected": p["valueProtected"],
            "protected_pct": p["protectedPct"],
            "unprotected": p["valueUnprotected"],
            "reroutes": len(ham["plan"]["reroutes"]),
        },
    }


def agent_search():
    """Before/after checks for the agent's Business Ontology search
    (client/src/data/agent_search.json, written by tools/export_agent_search.py)."""
    d = _load(ROOT / "client" / "src" / "data" / "agent_search.json")
    rows = d["rows"]
    changed = [r for r in rows if r["before_tools"] != r["after_tools"]]
    return {
        "agent": d["agent"], "run_date": d["run_date"], "note": d["note"],
        "rows": rows, "checks": len(rows),
        "uses_bon": sum("business_ontology" in r["after_tools"] for r in rows),
        "changed": len(changed),
        "sql": "sql/ontology/11_agent_business_ontology.sql",
        "screenshot": "/tmp/agentshots/sc_agent_search.png",
        "panel": "The agent looks up the governed meaning before it answers",
    }


def _sim_file(preset):
    # same rule as sim_name() in tools/bake_static.py
    t = "-".join(sorted(preset["targets"]))
    return BAKED / (f"scenario_sim__{preset['kind']}__{t}__"
                    f"{round(preset['severity'] * 100)}__{preset['durationDays']}.json")


def scenarios():
    """Every preset with its baked result and plan totals, in preset order."""
    out = []
    for pr in _load(BAKED / "scenario_presets.json"):
        sim = _load(_sim_file(pr))
        r, p = sim["result"]["totals"], sim["plan"]["totals"]
        out.append({
            "id": pr["id"], "label": pr["label"], "kind": pr["kind"],
            "days": pr["durationDays"], "source": pr.get("source"),
            "valueAtRisk": r["valueAtRisk"], "pctOfNetwork": r["pctOfNetwork"],
            "revenueAtRisk": r["revenueAtRisk"], "costOfDisruption": r["costOfDisruption"],
            "maxHop": r["maxHop"], "customersAffected": r["customersAffected"],
            "plantsImpaired": r["plantsImpaired"],
            "protected": p["valueProtected"], "unprotected": p["valueUnprotected"],
            "protectedPct": p["protectedPct"],
            "_sim": sim,
        })
    return out


def persona_facts():
    """The structure the persona scripts and management summary read."""
    net = _load(DATA / "sc_network.json")
    sc = {x["id"]: x for x in scenarios()}

    def brief(x):
        sim = x["_sim"]
        return {"risk": x["valueAtRisk"], "revenue": x["revenueAtRisk"],
                "protected": x["protected"], "protectedPct": x["protectedPct"],
                "unprotected": x["unprotected"], "reroutes": sim["plan"]["reroutes"],
                "capacityAfter": sim["plan"]["capacityAfter"]}

    hur = sc["hurricane-austin"]["_sim"]
    by = {}
    for f in hur["result"]["flows"]:
        if f.get("target_type") != "Customer":
            continue
        c = by.setdefault(f["target_name"], {"customer": f["target_name"], "value": 0,
                                             "hop": f["hop"], "cats": []})
        c["value"] += f["valueAtRisk"]
        c["hop"] = min(c["hop"], f["hop"])
        if f["material_category"] not in c["cats"]:
            c["cats"].append(f["material_category"])
    by_cust = sorted(by.values(), key=lambda c: (c["hop"], -c["value"]))

    subs = {}
    for s_ in net["substitution"]:
        c = subs.setdefault(s_["material_category"], {"cat": s_["material_category"],
                                                      "plants": [], "value": 0,
                                                      "alt": s_["has_alternative"]})
        c["plants"].append(s_["plant_name"])
        c["value"] += s_["value"]
    return {"totals": net["totals"], "hurricane": brief(sc["hurricane-austin"]),
            "penang": brief(sc["typhoon-penang"]), "hurricane_by_customer": by_cust,
            "substitution": sorted(subs.values(), key=lambda c: -c["value"]),
            "capacity": net["capacity"], "inventory": net["inventory"]}


if __name__ == "__main__":
    import pprint
    pprint.pprint(build(), width=110)
