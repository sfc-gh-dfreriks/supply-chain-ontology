#!/usr/bin/env python3
"""Build SAP_Supply_Chain_Ontology_Project_Guide.docx.

The implementation-facing companion to the demo deck, following the section
structure of SAP_Finance_360_Project_Guide.docx so the two read as a set:
executive summary, project overview, architecture, data model, agent,
application stack, listing, installation, verification, support.

Where it diverges from the Finance guide: there is no agent or semantic-view
section. The app is built on Snowflake Business Ontology — every input is found by
walking the governed Supply Chain domain — so the data model section describes
concepts, relationships and representations instead.

Every figure comes from tools/facts.py (the exported domain, network, thread and
baked scenarios), so the guide cannot drift from what the app reports.

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
import facts  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path.home() / "Documents" / "SAP" / "SAP_Supply_Chain_Ontology_Project_Guide.docx"
DATE = date.today().strftime("%d %B %Y")

REPO_URL = "https://github.com/sfc-gh-dfreriks/supply-chain-ontology"
PUBLIC_URL = "https://sfc-gh-dfreriks.github.io/supply-chain-ontology/"
CONTACT = "dave.freriks@snowflake.com"

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


def mono(doc, lines):
    for line in lines:
        p = doc.add_paragraph()
        r = p.add_run("    " + line)
        r.font.name = "Menlo"
        r.font.size = Pt(8.5)
        p.paragraph_format.space_after = Pt(0)
    doc.add_paragraph()


def main() -> int:
    X = facts.build()
    bo = json.loads((REPO / "data" / "sc_business_ontology.json").read_text())
    net = json.loads((REPO / "data" / "sc_network.json").read_text())
    scen = facts.scenarios()
    H = X["ham"]
    mv = X["monthly_value"] / 1_000_000
    rt = X["rel_types"]

    doc = Document()
    setup_page(doc)
    title_block(
        doc,
        "Supply Chain Ontology — Project Guide",
        "Disruption modelling and traceability built on Snowflake Business Ontology",
        f"{DATE}  ·  Owner: Dave Freriks  ·  {CONTACT}",
    )

    # ---------------------------------------------------------- executive
    h1(doc, "Executive Summary")
    body(
        doc,
        "Supply Chain Ontology answers a question conventional analytics cannot: when "
        "a site or supplier is disrupted, what fails downstream, and how much of it can "
        "be protected by moving work between plants the business already owns. It also "
        "traces a bad component lot to every customer it reached. It runs on SAP data "
        "already in Snowflake — nothing is copied and no new platform is introduced.",
    )
    body(
        doc,
        f"The distinguishing feature is that the app names no table. Every input is "
        f"found by walking the governed {X['domain']} domain in Snowflake Business "
        f"Ontology — {X['concepts']} concepts, {X['relationships']} typed relationships, "
        f"{X['representations']} representations — and read from the representation a "
        f"steward linked to each concept. Change a relationship or a representation in "
        f"Snowflake and the next refresh reads from the new place.",
    )

    h2(doc, "Key Outcomes")
    bullet(doc, f"A {X['network_nodes']}-node network carrying ${mv:,.2f}M of monthly flow, found by walking the ontology.")
    bullet(doc, "Second-order impact quantified: the plant that fails because the plant that failed was feeding it.")
    bullet(doc, "A mitigation plan bounded by real work-centre capacity, not a recovery percentage taken on faith.")
    bullet(doc, f"{len(X['single_source'])} structural exposures identified — categories made at exactly one plant, where resilience has to be bought rather than planned.")
    bullet(doc, f"A digital thread across {X['systems']} systems and {X['lots']} component lots: which customers did a bad lot reach?")
    bullet(doc, "Ask Cortex on most pages: AI_COMPLETE (claude-opus-5-5) reads the view on screen and cites the governed definitions.")

    h2(doc, "Target Audiences")
    table(
        doc,
        ["Audience", "What they get from it"],
        [
            ["Supply chain risk and resilience", "A costed response per site, and the exposures that cannot be closed by planning"],
            ["Operations leadership", "Which fragilities are structural, and what a fix would cost"],
            ["Finance", "Revenue at risk split into defensible and undefendable"],
            ["Quality and plant leadership", "Lot blast radius, and the hours a reroute imposes on the receiving site"],
            ["Enterprise architecture", "An application built on governed semantics, with no table named in code"],
        ],
        widths=[1.9, 4.8],
    )

    # ---------------------------------------------------------- overview
    h1(doc, "Project Overview")
    h2(doc, "Customer Profile")
    body(
        doc,
        f"Illustrated through a representative semiconductor-equipment manufacturer: "
        f"{X['plants']} plants, {X['suppliers']} suppliers and {X['customers']} customers "
        f"across {X['flows']} recurring material flows worth ${mv:,.2f}M a month. The "
        "network, volumes and values, plant capacity and inventory buffers are real SAP "
        "data in Snowflake; the digital-thread instances are demo enrichment keyed to it.",
    )

    h2(doc, "Solution Components")
    table(
        doc,
        ["Component", "What it is", "Scale"],
        [
            ["Business Ontology domain", "Governed concepts, typed relationships and representations",
             f"{X['concepts']} concepts · {X['relationships']} relationships · {X['representations']} representations"],
            ["Exporters", "Walk the domain and export what the app reads",
             "3 exporters · npm run refresh"],
            ["Scenario engine", "Disruption simulation across five event types, with mitigation",
             f"{X['network_nodes']} nodes · {X['flows']} flows · {len(scen)} presets"],
            ["Digital thread", "Orders, systems, component lots and tools",
             f"{X['orders']} orders · {X['systems']} systems · {X['lots']} lots · {X['tools']} tools"],
            ["Application", "React client and Express API", f"{len(X['pages'])} pages"],
            ["Publication", "Documented public repository and a credential-free web build", "GitHub Pages"],
        ],
        widths=[1.5, 3.2, 2.0],
    )

    # ---------------------------------------------------------- architecture
    h1(doc, "Architecture")
    h2(doc, "Data Flow")
    body(
        doc,
        "SAP data sits in Snowflake (SAP_SUPPLY_CHAIN). The Supply Chain domain in "
        "Business Ontology declares the concepts and how they relate, and links each "
        "concept to the Snowflake object holding its data. Three exporters walk the "
        "domain and write JSON; the API and the React client read that JSON; a baker "
        "snapshots it for the public build.",
    )
    mono(doc, [
        "Business Ontology  'Supply Chain'",
        "  tools/export_business_ontology.py  -> data/sc_business_ontology.json",
        "  tools/export_ontology_network.py   -> data/sc_network.json",
        "  tools/export_ops_thread.py         -> data/sc_ops_thread.json",
        "  tools/refresh_all.py               all three, bake, reconcile",
        "Express API :3009  ->  React client :5179",
    ])

    h2(doc, "How each input is found")
    walk = net["lineage"]["walk"]
    table(
        doc,
        ["App input", "Walk", "Representation read"],
        [
            ["Suppliers, plants, customers", walk["network"],
             ", ".join(v.split(".")[-1] for v in net["lineage"]["nodes"].values())],
            ["Material flows", walk["flows"],
             ", ".join(v.split(".")[-1] for v in net["lineage"]["flows"].values())],
            ["Capacity and inventory", "Plant", "VW_ONT_PLANT"],
            ["Substitution", "Plant produces Material Category", "V_PRODUCES"],
            ["Order economics", walk["economics"], "DT_ORDER_FULFILLMENT"],
            ["Digital thread", "System Serial has part Component Lot, shipped on Sales Order",
             "VW_ONT_LOT_BLAST_RADIUS + concept views"],
            ["Operations pulse", "Plant, Equipment",
             "DT_OPERATING_RATE, DT_COMPONENT_COVER, DT_EQUIPMENT_HEALTH"],
        ],
        widths=[1.6, 2.6, 2.5], size=8.5,
    )
    body(doc, "Not in Business Ontology, and so in the engine's code: plant-to-plant "
              "transfer as an edge, cardinality, the substitution rule and buffer timing.",
         italic=True)

    # ---------------------------------------------------------- data model
    h1(doc, "Data Model")
    h2(doc, "Concepts")
    body(
        doc,
        f"{X['concepts']} concepts: {X['entities']} entities and {X['terms']} term. "
        "Four (Catalog Object, Business Process, Data Product, CDS Entity) record the "
        "SAP BDC catalog the domain was derived from; the app does not read them as data.",
    )
    rows = []
    for n in sorted(bo["nodes"], key=lambda n: n["name"]):
        desc = (n.get("description") or "").split(" Source:")[0]
        rows.append([n["name"], n["kind"].lower(), str(len(n.get("representations") or [])),
                     desc[:120]])
    table(doc, ["Concept", "Kind", "Reps", "Definition"], rows,
          widths=[1.4, 0.6, 0.45, 4.25], size=7.5)

    h2(doc, "Relationships")
    body(doc, f"{X['relationships']} relationships: " + ", ".join(f"{v} {k}" for k, v in rt.items()) + ".")
    table(doc, ["Source", "Type", "Target"],
          [[r["source"], r["label"] or r["type"], r["target"]]
           for r in sorted(bo["relationships"], key=lambda r: (r["type"], r["source"]))],
          widths=[2.2, 1.6, 2.9], size=8)

    # ---------------------------------------------------------- app
    h1(doc, "Application Stack")
    h2(doc, "Pages")
    table(doc, ["Page", "Route", "What it shows"], [[n, r, w] for n, r, w in X["pages"]],
          widths=[1.7, 0.9, 4.1], size=8.5)
    body(doc, "Ask Cortex buttons on most pages send the view on screen to AI_COMPLETE "
              "(claude-opus-5-5) with the governed definitions.", size=9)

    h2(doc, "Scenario Library")
    table(
        doc,
        ["Scenario", "Duration", "At risk", "Of network", "Hops", "Recoverable"],
        [[x["label"].replace(" — ", ": "), f"{x['days']}d", facts.money(x["valueAtRisk"]),
          f"{x['pctOfNetwork']}%", str(x["maxHop"]),
          "—" if x["kind"] == "demand" else f"{x['protectedPct']}%"] for x in scen],
        widths=[2.6, 0.7, 0.9, 0.9, 0.5, 1.1],
        size=8.5,
    )
    body(
        doc,
        f"The spread is deliberate. A {H['label'].split(' — ')[-1]} failure puts "
        f"{facts.money(H['value_at_risk'])} at risk ({H['pct_network']}% of the network) "
        f"across {H['hops']} hops and {H['plants_impaired']} plants; "
        f"{H['protected_pct']}% is recoverable. Penang is entirely unrecoverable because "
        "it is the sole source of die sorting.",
    )

    h2(doc, "Environment Variables")
    body(doc, "Only the AI features need server/.env:", after=2)
    mono(doc, ["SNOWFLAKE_ACCOUNT=…", "SNOWFLAKE_USER=…", "SNOWFLAKE_PRIVATE_KEY_PATH=…",
               "PORT=3009"])

    # ---------------------------------------------------------- install
    h1(doc, "Installation Procedures")
    h2(doc, "A. Running the application")
    table(
        doc,
        ["Step", "Command", "Result"],
        [
            ["1", f"git clone {REPO_URL} && npm install", "Dependencies installed"],
            ["2", "npm run dev", "Server on 3009, client on 5179"],
            ["3", "open http://localhost:5179", f"All {len(X['pages'])} pages from committed JSON"],
        ],
        widths=[0.5, 3.1, 3.1],
    )

    h2(doc, "B. Refreshing from the ontology")
    body(doc, "After a steward changes the domain, one command re-walks it, re-exports, "
              "rebuilds the server, re-bakes the snapshots and reconciles — failing if the "
              "served files no longer match the ontology.")
    mono(doc, ["npm run refresh            # python3 tools/refresh_all.py",
               "npm run refresh -- --check # reconcile only"])

    h2(doc, "C. Public static build")
    table(
        doc,
        ["Step", "Command"],
        [
            ["1", "npm run refresh        # or npm run dev + npm run bake"],
            ["2", "npm run build:static"],
            ["3", "npm run preview:static # http://localhost:8899"],
        ],
        widths=[0.5, 6.2],
    )
    callout(
        doc,
        "What the public build cannot do",
        "Ask Cortex and the scenario AI are disabled because they need credentials, "
        "and custom disruptions need the live server; the nine presets are baked. "
        "Both limits are stated on screen. Commit the baked JSON: the Pages workflow "
        "refuses to deploy with too few snapshots.",
    )

    # ---------------------------------------------------------- verification
    h1(doc, "Verification")
    table(
        doc,
        ["Check", "How"],
        [
            ["Domain matches the export", "npm run refresh -- --check"],
            ["Scenario engine", "npm run verify-scenario"],
            ["Live API", "curl localhost:3009/api/meta   # domain counts and network totals"],
            ["Ontology counts", f"Snowsight → Business Ontology → {X['domain']}: "
                                f"{X['concepts']} concepts, {X['relationships']} relationships"],
        ],
        widths=[1.9, 4.8],
    )
    body(doc, "The switch onto Business Ontology was gated on parity: all nine presets "
              "and the full digital thread give identical results to the previous "
              "table-driven version.")

    # ---------------------------------------------------------- real vs modelled
    h1(doc, "What is Real, and What is Modelled")
    table(
        doc,
        ["Element", "Status"],
        [
            ["Network, flows, volumes, values", "Real — SAP data, read through the ontology"],
            ["Plant capacity and utilisation", "Real — work-centre capacity data"],
            ["Inventory buffer days", "Real — material stock data"],
            ["Digital-thread instances", "Demo enrichment (OPS_EXT) keyed to real plants, suppliers, customers and BOMs"],
            ["Which plant can substitute for another", "Derived from observed shipments"],
            ["Hours consumed per unit", "Derived and approximate — planning-grade"],
            ["Qualification time for a plant change", "Not modelled"],
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
            ["Ontology in Snowsight", X["snowsight_url"]],
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
            ["SAP_Supply_Chain_Ontology_Demo.pptx", "Demo presentation — the narrative for a customer session"],
            ["Supply_Chain_Ontology_Presales_Kit/", "SE-facing kit: quick start, per-persona demo scripts, management summary"],
            ["Supply_Chain_Ontology_Documentation_Handbook.docx", "Full technical handbook: concepts, build steps, findings, references"],
        ],
        widths=[2.6, 4.1],
    )

    body(doc, f"Every figure in this guide is read from tools/facts.py. Domain exported {X['exported_at'][:10]}; generated {DATE}.", italic=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
