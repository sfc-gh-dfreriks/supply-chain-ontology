"""Before/after comparison of the Cortex agent once it was given Business Ontology search.

Reads the saved agent runs (one JSON per question, from ask.py in the retrofit folder) and
writes client/src/data/agent_search.json for the Snowflake Ontology Details page and the docs.
"""
import json, pathlib, re, shutil, sys
AGENT = "SAP_SUPPLY_CHAIN.ONTOLOGY.SUPPLY_CHAIN_AGENT"
DOMAINS = "Supply Chain (primary)"
RUN_DATE = "2026-11-16"
NOTE = ("Before: the original spec with three Cortex Analyst tools and four hierarchy functions. After: the same tools "
        "plus Business Ontology search and read-only ontology reads. Concrete numbers still come from the semantic views.")
VERDICTS = [
 ("definition", "Reads the governed Supply Chain.Plant definition instead of the app-owned ONT_* metadata tables."),
 ("composition", "Answers from the governed HAS_PART edge: Data Product has part CDS Entity."),
 ("hierarchy", "Unchanged and correct: the class views still answer questions about kinds of material flow."),
 ("relations", "Unchanged: relation detail still comes from the metadata tool and hierarchy functions."),
 ("multi_hop", "Same answer ($6,661,000 a month inbound) from the base semantic view."),
 ("number", "Same counts (5 plants, 8 customers, 6 suppliers) from the network data."),
 ("unknown", "Now searches the ontology before declining. Before, it declined without searching."),
]
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "client/src/data/agent_search.json"
SNAP = ROOT / "data/agent_search"

def first(text, n=2):
    text = re.sub(r"\*\*|`|#+ ", "", text).replace("\n", " ")
    # the agent sometimes emits its planning note glued to the answer ("...synonym.A Legal Entity ...")
    glued = [m.end() for m in re.finditer(r"[a-z\"]\.(?<!Enterprise\.)(?<!Chain\.)(?<!Capital\.)(?=[A-Z])", text[:200])]
    if glued:
        text = text[glued[-1]:]
    text = re.sub(r"(?<=[:.])\s*\d+\.\s+", " ", text)  # inline numbered lists
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n])[:360]

def main():
    if len(sys.argv) > 1:  # refresh the snapshot from a retrofit folder: <before dir> <after dir>
        for tag, src in (("before", sys.argv[1]), ("after", sys.argv[2])):
            (SNAP / tag).mkdir(parents=True, exist_ok=True)
            for f in pathlib.Path(src).glob("*.json"):
                shutil.copy(f, SNAP / tag / f.name)
    rows = []
    for key, verdict in VERDICTS:
        b = json.loads((SNAP / "before" / f"{key}.json").read_text())
        a = json.loads((SNAP / "after" / f"{key}.json").read_text())
        rows.append({"check": key, "question": a["question"],
                     "before_tools": list(dict.fromkeys(b["tools"])), "after_tools": list(dict.fromkeys(a["tools"])),
                     "before": first(b["answer"]), "after": first(a["answer"]), "verdict": verdict})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"agent": AGENT, "domains": DOMAINS, "run_date": RUN_DATE, "note": NOTE, "rows": rows}, indent=1))
    print(f"wrote {OUT} ({len(rows)} checks)")

if __name__ == "__main__":
    main()
