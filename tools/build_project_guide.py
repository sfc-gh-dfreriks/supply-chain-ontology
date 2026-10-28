#!/usr/bin/env python3
"""Build SAP_Supply_Chain_Ontology_Project_Guide.docx.

The implementation-facing companion to the demo deck, following the section
structure of SAP_Finance_360_Project_Guide.docx so the two read as a set:
executive summary, project overview, architecture, data model, agent,
application stack, listing, installation, verification, support.

Where it deliberately diverges from the Finance guide: this project has two
halves that must not be conflated — an ONTOLOGY (15 classes, the model) and a
CATALOG (36 SAP BDC data products, metadata about what data exists). The guide
keeps them apart throughout, because a catalog cannot express that a Supplier and
a Customer are both Parties, which is the whole reason the ontology exists.

Figures are read from data/*.json in this repo, which is exported from the running
application, so the guide cannot drift from what the app reports.

    python3 tools/build_project_guide.py
"""
from __future__ import annotations

import json
import pathlib
import sys
from datetime import date

from docx import Document
from docx.shared import Pt

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from docx_kit import (  # noqa: E402
    GREY, SAP_NAVY, SNOW_BLUE, body, bullet, callout, h1, h2, setup_page, table,
)

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path.home() / "Documents" / "SAP" / "SAP_Supply_Chain_Ontology_Project_Guide.docx"
DATE = date.today().strftime("%d %B %Y")

REPO_URL = "https://github.com/sfc-gh-dfreriks/supply-chain-ontology"
PUBLIC_URL = "https://sfc-gh-dfreriks.github.io/supply-chain-ontology/"
CONTACT = "dave.freriks@snowflake.com"

PAGES = [
    ("Ask Cortex", "Cortex Analyst over the supply-chain semantic views"),
    ("Executive Dashboard", "The ontology stack and catalog totals, lenses by source system and provenance"),
    ("Ontology Model", "15 classes and 11 relations as a tree, with instance counts and an Abstract/Concrete toggle"),
    ("SAP BDC Catalog", "Process to data product to entity, filterable and expandable"),
    ("Graph Traversal", "Breadth-first expansion and shortest association path"),
    ("Business Processes", "Per-process rollups and members"),
    ("Use Cases / Insight Apps", "Mapping to BDC Intelligent Applications"),
    ("Correlation", "Process coupling via the ODM master-data overlay"),
    ("Coverage & Scorecard", "Readiness scoring across the slice"),
    ("Guided Demo", "Seven-step walkthrough of the hurricane scenario"),
    ("Scenario Studio", "Build a disruption from five event types"),
    ("Ripple Map", "Geography and topology side by side, cascade played one lane at a time"),
    ("Mitigation", "Reroutes inside real capacity, what cannot be saved, and why"),
    ("Optimization Map", "The recovery as a sequence, one beat per reroute"),
]

SCENARIOS = [
    ("Hurricane: Austin Fab offline", "60d", "$16.05M", "28.3%", "2", "91.4%"),
    ("Typhoon: Penang Assembly offline", "30d", "$5.85M", "10.3%", "1", "0%"),
    ("Supplier failure: Hamamatsu Photonics", "45d", "$9.08M", "16.0%", "3", "70.2%"),
    ("Partial loss: Dresden Fab at 60%", "30d", "$4.12M", "7.3%", "1", "44.7%"),
    ("Lane closed: San Jose to Penang", "40d", "$3.73M", "6.6%", "2", "0%"),
    ("Demand spike: TSMC +60%", "30d", "$8.82M", "15.6%", "1", "—"),
]

AGENT_QUESTIONS = [
    "Which parties are affected if the Austin plant goes offline?",
    "What kinds of material flow exist, and which carry the most monthly value?",
    "Which material categories are made at only one plant?",
    "Which plants have spare capacity, and how much?",
    "How is a Supplier related to a Customer in this model?",
    "Which classes are abstract, and what do they roll up?",
    "Which SAP BDC data products feed the supply-chain slice?",
]


def load():
    d = lambda n: json.loads((REPO / "data" / n).read_text())  # noqa: E731
    return d("sc_ontology_schema.json"), d("sc_network.json"), d("sc_ontology.json")


def title_block(doc, title, subtitle, strap):
    for text_, size, bold, color, after in (
        (title, 20, True, SAP_NAVY, 2),
        (subtitle, 11.5, False, SNOW_BLUE, 2),
        (strap, 9, False, GREY, 14),
    ):
        p = doc.add_paragraph()
        r = p.add_run(text_)
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        p.paragraph_format.space_after = Pt(after)


def main() -> int:
    schema, net, cat = load()
    c = schema["counts"]
    t = net["totals"]
    mv = t["monthly_value"] / 1_000_000

    doc = Document()
    setup_page(doc)
    title_block(
        doc,
        "SAP BDC Supply Chain Ontology — Project Guide",
        "Disruption modelling over SAP Business Data Cloud data in Snowflake",
        f"{DATE}  ·  Owner: Dave Freriks  ·  {CONTACT}",
    )

    # ---------------------------------------------------------- executive
    h1(doc, "Executive Summary")
    body(
        doc,
        "Supply Chain Ontology answers a question conventional analytics cannot: when "
        "a site is disrupted, what fails downstream, and how much of it can be "
        "protected by moving work between plants the business already owns. It runs "
        "on SAP data already in Snowflake — nothing is copied out of SAP and no new "
        "platform is introduced.",
    )
    body(
        doc,
        "The distinguishing feature is an explicit ontology rather than a star "
        f"schema: {c['classes']} classes of which {c['abstract']} are abstract, so a "
        "single question can span several concrete types. Asking which parties are "
        f"affected returns all {t['customers']} customers and {t['suppliers']} "
        "suppliers together, which a dimensional model cannot do without a union "
        "written by hand for every question.",
    )

    h2(doc, "Key Outcomes")
    bullet(doc, f"A {t['nodes']}-node network carrying ${mv:,.2f}M of monthly flow, modelled from SAP data in place.")
    bullet(doc, "Second-order impact quantified: the plant that fails because the plant that failed was feeding it.")
    bullet(doc, "A mitigation plan bounded by real work-centre capacity, not a recovery percentage taken on faith.")
    bullet(doc, f"{len(t['single_source_categories'])} structural exposures identified — categories made at exactly one plant, where resilience has to be bought rather than planned.")
    bullet(doc, "Natural-language access through Cortex Analyst over three purpose-separated semantic views.")

    h2(doc, "Target Audiences")
    table(
        doc,
        ["Audience", "What they get from it"],
        [
            ["Supply chain risk and resilience", "A costed response per site, and the exposures that cannot be closed by planning"],
            ["Operations leadership", "Which fragilities are structural, and what a fix would cost"],
            ["Finance", "Revenue at risk split into defensible and undefendable"],
            ["Plant leadership", "The hours and utilisation a reroute imposes on the receiving site"],
            ["Enterprise architecture", "How ontology reasoning works on Snowflake without copying SAP data"],
        ],
        widths=[1.9, 4.8],
    )

    # ---------------------------------------------------------- overview
    h1(doc, "Project Overview")
    h2(doc, "Customer Profile")
    body(
        doc,
        f"Illustrated through a representative global manufacturer: {t['plants']} "
        f"plants, {t['suppliers']} suppliers and {t['customers']} customers across "
        f"{t['flows']} recurring material flows worth ${mv:,.2f}M a month. The "
        "network, the volumes and values, plant capacity and inventory buffers are "
        "real SAP data products in Snowflake.",
    )

    h2(doc, "Solution Components")
    table(
        doc,
        ["Component", "What it is", "Scale"],
        [
            ["Ontology layer", "Classes, relations, properties and rules over the network",
             f"{c['classes']} classes · {c['relations']} relations · {c['instances']:,} instances"],
            ["SAP BDC catalog", "Metadata about which data products and CDS entities exist",
             f"{len(cat['products'])} products · {len(cat['entities'])} entities · {len(cat['entity_edges'])} associations"],
            ["Scenario engine", "Disruption simulation across five event types, with mitigation",
             f"{t['nodes']} nodes · {t['flows']} flows · 6 preset scenarios"],
            ["Application", "React explorer and scenario studio",
             f"{len(PAGES)} pages"],
            ["Publication", "Documented public repository and a credential-free web build",
             "GitHub Pages"],
        ],
        widths=[1.4, 3.3, 2.0],
    )

    callout(
        doc,
        "Two halves, deliberately kept apart",
        "The ONTOLOGY is the model — what kinds of thing exist and how they relate. "
        "The SAP BDC CATALOG is metadata about what data exists. Neither is "
        "transactional supply-chain data. A catalog cannot express that a Supplier "
        "and a Customer are both Parties, so it cannot answer 'which parties are "
        "affected' in one pass — which is precisely why the ontology layer exists.",
    )

    # ---------------------------------------------------------- architecture
    h1(doc, "Architecture")
    h2(doc, "Data Flow")
    body(
        doc,
        "SAP S/4HANA is the source of record. SAP Business Data Cloud shares governed "
        "data products into Snowflake with zero copy. Every layer above that is "
        "Snowflake-native: physical graph storage, ontology metadata, generated "
        "abstract views, semantic views, and an agent that routes a question to the "
        "right layer.",
    )
    table(
        doc,
        ["Layer", "Contents", "Purpose"],
        [[s["layer"], s["detail"], s["note"]] for s in schema["stack"]],
        widths=[0.6, 2.4, 3.7],
    )

    # ---------------------------------------------------------- data model
    h1(doc, "Data Model")
    h2(doc, "Classes — the ontology layer")
    body(
        doc,
        f"{c['classes']} classes: {c['concrete']} concrete and {c['abstract']} "
        "abstract. The abstract layer is the point of the design — it is what allows "
        "one query to span several concrete types.",
    )
    rows = []
    for cl in schema["classes"]:
        rows.append([
            cl["name"],
            "abstract" if cl["is_abstract"] else "concrete",
            cl.get("parent") or "—",
            (cl.get("description") or "")[:110],
        ])
    table(doc, ["Class", "Type", "Parent", "Description"], rows, widths=[1.3, 0.8, 1.2, 3.4], size=8)

    h2(doc, "Relations")
    body(
        doc,
        f"{c['relations']} relations: {c['relations_stored']} stored, "
        f"{c['relations_inferred']} inferred by rule, and {c['relations_abstract']} "
        "abstract. Inferred relations are materialised by the inference procedures "
        "rather than loaded, and the application labels each one on screen so a "
        "viewer can tell a derived edge from a stored one.",
    )

    h2(doc, "Semantic View Metadata")
    body(doc, "Three semantic views, separated by purpose rather than by table. Pointing a question at the wrong one produces a plausible but wrong answer, so the separation is enforced in the agent's routing.")
    table(
        doc,
        ["Semantic view", "Use it for", "Do not use it for"],
        [
            ["SUPPLY_CHAIN_BASE", "Concrete lookups — a named plant, a monthly value, spare capacity, days of inventory",
             "Cross-type questions spanning suppliers and customers"],
            ["SUPPLY_CHAIN_ONTOLOGY_MODEL", "Cross-type reasoning and class-hierarchy questions",
             "A specific named plant or an exact monthly figure"],
            ["SUPPLY_CHAIN_METADATA_MODEL", "Governance and provenance — how something is modelled, where it came from, coverage",
             "Any supply-chain value"],
        ],
        widths=[2.1, 2.6, 2.0],
    )

    h2(doc, "Relationships, and how the graph is actually shaped")
    body(doc, "Worth knowing before demonstrating traversal, because the graph is thinner than the totals imply:")
    bullet(doc, f"No entity association crosses a data product boundary — all {len(cat['entity_edges'])} stay inside their own product, so an entity-level shortest path can never leave the product it starts in.")
    bullet(doc, f"Cross-product linkage lives one level up in the ODM overlay: {len(cat['odm_edges'])} of {len(cat['products'])} products connect, entirely through the canonical object {list(cat['odm_owner'])[0]}.")
    bullet(doc, "The Graph Traversal page states this on screen rather than implying a richer graph than exists.")

    # ---------------------------------------------------------- agent
    h1(doc, "Cortex Agent — Snowflake Intelligence")
    h2(doc, "Agent Configuration")
    table(
        doc,
        ["Item", "Value"],
        [
            ["Agent", "SAP_SUPPLY_CHAIN.ONTOLOGY.SUPPLY_CHAIN_AGENT"],
            ["Tools", "7 — routes a question to base, ontology, metadata or graph traversal"],
            ["Semantic views", "SUPPLY_CHAIN_BASE · SUPPLY_CHAIN_ONTOLOGY_MODEL · SUPPLY_CHAIN_METADATA_MODEL"],
            ["Graph procedures", "Traversal and path-finding over KG_NODE and KG_EDGE"],
        ],
        widths=[1.5, 5.2],
    )

    h2(doc, "Sample Natural-Language Questions")
    for q in AGENT_QUESTIONS:
        bullet(doc, q)
    body(
        doc,
        "The first question is the one to lead with. It is the question a dimensional "
        "model cannot answer in one pass, and the abstract Party class is what makes "
        "it work.",
        italic=True,
    )

    h2(doc, "Accessing via Snowflake Intelligence")
    body(doc, "Snowsight → AI/ML → Snowflake Intelligence → select SUPPLY_CHAIN_AGENT. No application deployment is required for this route, which makes it the fastest way to show the reasoning layer to an architect.")

    # ---------------------------------------------------------- app
    h1(doc, "Application Stack")
    h2(doc, "Pages")
    table(doc, ["Page", "What it shows"], [[n, w] for n, w in PAGES], widths=[1.9, 4.8], size=8.5)

    h2(doc, "Scenario Library")
    table(
        doc,
        ["Scenario", "Duration", "At risk", "Of network", "Hops", "Recoverable"],
        [list(s) for s in SCENARIOS],
        widths=[2.4, 0.8, 0.9, 1.0, 0.5, 1.1],
        size=8.5,
    )
    body(
        doc,
        "The spread is deliberate. Penang is entirely unrecoverable because it is the "
        "sole source of die sorting, so no capacity elsewhere helps. Dresden is only "
        "44.7% recoverable despite being a partial outage, because it has the least "
        "spare capacity in the network. Demonstrating one recoverable and one "
        "unrecoverable scenario makes the structural point that a single scenario "
        "cannot.",
    )

    h2(doc, "Environment Variables")
    body(doc, "Cortex Analyst requires server/.env:", after=2)
    for line in ["SNOWFLAKE_ACCOUNT=…", "SNOWFLAKE_USER=…", "SNOWFLAKE_PRIVATE_KEY_PATH=…",
                 "BDC_SEMANTIC_VIEW=SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.SUPPLY_CHAIN_ONTOLOGY_MODEL",
                 "PORT=3009"]:
        p = doc.add_paragraph()
        r = p.add_run("    " + line)
        r.font.name = "Menlo"
        r.font.size = Pt(8.5)
        p.paragraph_format.space_after = Pt(0)
    doc.add_paragraph()

    # ---------------------------------------------------------- install
    h1(doc, "Installation Procedures")
    h2(doc, "A. Publisher setup (one-time)")
    table(
        doc,
        ["Step", "Action"],
        [
            ["1", f"git clone {REPO_URL} && npm install"],
            ["2", "Deploy the ontology layers: physical, metadata, abstract views, procedures"],
            ["3", "Deploy the three semantic views and the agent"],
            ["4", "npm run deploy-views — creates the Snowflake views and asserts scope parity"],
            ["5", "npm run export-data — regenerate data/sc_ontology.json from the catalog"],
        ],
        widths=[0.5, 6.2],
    )

    h2(doc, "B. Running the application")
    table(
        doc,
        ["Step", "Command", "Result"],
        [
            ["1", "npm run dev", "Server on 3009, client on 5179"],
            ["2", "open http://localhost:5179", "All 14 pages, Ask enabled"],
        ],
        widths=[0.5, 2.6, 3.6],
    )

    h2(doc, "C. Public static build")
    body(
        doc,
        "A credential-free snapshot for sharing. VITE_STATIC=1 makes the client read "
        "pre-baked JSON instead of calling the API.",
    )
    table(
        doc,
        ["Step", "Command"],
        [
            ["1", "npm run dev            # the baker reads from the live API"],
            ["2", "npm run bake           # writes snapshots to client/public/data/"],
            ["3", "npm run build:static"],
            ["4", "npm run preview:static # http://localhost:8899"],
        ],
        widths=[0.5, 6.2],
    )
    callout(
        doc,
        "What the public build cannot do",
        "Ask Cortex is disabled because Cortex Analyst needs credentials, and "
        "shortest path is hidden because the pair space is quadratic — only "
        "expansion from the 24 most-connected entities is baked. Both are stated on "
        "screen in that build. Commit the baked JSON: the Pages workflow refuses to "
        "deploy with fewer than 20 snapshots, because the site would otherwise build "
        "green and render empty.",
    )

    # ---------------------------------------------------------- verification
    h1(doc, "Verification")
    h2(doc, "Scope parity")
    body(
        doc,
        "A data product is in scope when either its business process is Design to "
        "Operate, or its line of business names Supply Chain, Manufacturing, Sourcing "
        "and Procurement, or R&D Engineering. Line of business is a delimited "
        "multi-value string, so it is matched per token — matching the whole string "
        "would drop every product carrying Supply Chain alongside another LOB, which "
        "is most of the interesting cross-functional ones.",
    )
    body(
        doc,
        "That rule is implemented twice, once for the application JSON and once for "
        "the Snowflake views. npm run deploy-views asserts the two agree and fails if "
        "they drift, because otherwise Ask would answer over a different population "
        "than the pages display.",
    )

    h2(doc, "Quick verification commands")
    table(
        doc,
        ["Check", "How"],
        [
            ["Ontology layer deployed", "SELECT COUNT(*) FROM SAP_SUPPLY_CHAIN.ONTOLOGY.ONT_CLASS  -- expect 15"],
            ["Instances loaded", "SELECT COUNT(*) FROM SAP_SUPPLY_CHAIN.ONTOLOGY.KG_NODE"],
            ["Abstract views present", "SHOW VIEWS LIKE 'VW_ONT_%' IN SCHEMA SAP_SUPPLY_CHAIN.ONTOLOGY"],
            ["Semantic views present", "SHOW SEMANTIC VIEWS IN DATABASE SAP_SUPPLY_CHAIN"],
            ["Agent present", "SHOW AGENTS IN DATABASE SAP_SUPPLY_CHAIN"],
            ["Scenario network", "SELECT COUNT(*) FROM SAP_SUPPLY_CHAIN.SCENARIO.V_NODE  -- expect 19"],
            ["Scope parity", "npm run deploy-views  -- fails on drift"],
        ],
        widths=[1.7, 5.0],
    )

    h2(doc, "Scenario harness")
    body(doc, "An automated harness runs 20 assertions across all five disruption types, so a change to the engine cannot silently alter a published figure.")

    # ---------------------------------------------------------- real vs modelled
    h1(doc, "What is Real, and What is Modelled")
    body(doc, "Stating this plainly protects the numbers when they are challenged.")
    table(
        doc,
        ["Element", "Status"],
        [
            ["Network, flows, volumes, values", "Real — SAP data products in Snowflake"],
            ["Plant capacity and utilisation", "Real — work-centre capacity data"],
            ["Inventory buffer days", "Real — material stock data"],
            ["Which plant can substitute for another", "Derived from observed shipments, since production versions list only one plant per material"],
            ["Hours consumed per unit", "Derived and approximate — blended across products, planning-grade"],
            ["Qualification time for a plant change", "Not modelled. A reroute called feasible may still take weeks to approve"],
            ["Component-level shortages inside a plant", "Not modelled. The bill of materials is available if taken further"],
        ],
        widths=[2.6, 4.1],
    )

    # ---------------------------------------------------------- support
    h1(doc, "Support & Contact")
    table(
        doc,
        ["Resource", "Location"],
        [
            ["Source and documentation", REPO_URL],
            ["Public demonstration build", PUBLIC_URL],
            ["Runs locally on", "Application port 5179, API port 3009"],
            ["Owner", f"Dave Freriks — {CONTACT}"],
        ],
        widths=[2.0, 4.7],
    )

    h2(doc, "Related deliverables")
    table(
        doc,
        ["Document", "Contents"],
        [
            ["SAP_Supply_Chain_Ontology_Demo.pptx", "17-slide demo presentation — the narrative for a customer session"],
            ["Supply_Chain_Ontology_Presales_Kit/", "SE-facing kit: quick start, per-persona demo scripts, management summary"],
            ["Supply_Chain_Ontology_Documentation_Handbook.docx", "Full technical handbook: concepts, build steps, findings, references"],
        ],
        widths=[2.6, 4.1],
    )

    body(doc, f"Every figure in this guide was read from data/*.json in the repository, which is exported from the running application. Generated {DATE}.", italic=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
