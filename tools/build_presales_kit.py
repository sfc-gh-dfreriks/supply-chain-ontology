#!/usr/bin/env python3
"""Build the presales kit documents for the SAP Partnership Compass page.

Three documents, written for the Snowflake presales team rather than for a
customer:

    00_START_HERE.docx        what is in the kit and which file to open when
    03_SE_Quick_Start.docx    positioning, a ten-minute path, objections
    06_Setup_and_Access.docx  live URL, local run, Snowflake objects

Figures come from data/ in this repo, which is exported from the running
application, so they cannot drift from what a demo actually shows.

    python3 tools/build_presales_kit.py
"""

import json
import shutil
import subprocess
from pathlib import Path

from docx import Document
from docx.shared import Pt

from docx_kit import (
    AMBER,
    GREEN,
    GREY,
    LIGHT_HEX,
    RED,
    SAP_NAVY,
    SNOW_BLUE,
    body,
    bullet,
    callout,
    h1,
    h2,
    setup_page,
    table,
)

REPO = Path(__file__).resolve().parent.parent
VIDEO_SRC = Path.home() / "Documents" / "SAP" / "Supply_Chain_Ontology_Walkthrough.mp4"
KIT = Path.home() / "Documents" / "SAP" / "Supply_Chain_Ontology_Presales_Kit"


def kit_video(src):
    """Copy the walkthrough into the kit under a name carrying its real length,
    replacing any older cut, and return that name for the file table."""
    secs = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
        check=True, capture_output=True, text=True).stdout)
    name = f"04_Walkthrough_Narrated_{int(secs // 60)}min{int(secs % 60):02d}.mp4"
    KIT.mkdir(parents=True, exist_ok=True)
    for old in KIT.glob("04_Walkthrough_Narrated_*.mp4"):
        if old.name != name:
            old.unlink()
    if not (KIT / name).exists() or (KIT / name).stat().st_mtime < src.stat().st_mtime:
        shutil.copy2(src, KIT / name)
    return name


PUBLIC_URL = "https://sfc-gh-dfreriks.github.io/supply-chain-ontology/"
REPO_URL = "https://github.com/sfc-gh-dfreriks/supply-chain-ontology"
DATE = "21 September 2026"


def load_data():
    schema = json.loads((REPO / "data" / "sc_ontology_schema.json").read_text())
    network = json.loads((REPO / "data" / "sc_network.json").read_text())
    return schema, network


def title_block(doc, title, subtitle, strap):
    p = doc.add_paragraph()
    r = p.add_run(title)
    r.font.size = Pt(20)
    r.font.bold = True
    r.font.color.rgb = SAP_NAVY
    p.paragraph_format.space_after = Pt(2)

    p = doc.add_paragraph()
    r = p.add_run(subtitle)
    r.font.size = Pt(11.5)
    r.font.color.rgb = SNOW_BLUE
    p.paragraph_format.space_after = Pt(2)

    p = doc.add_paragraph()
    r = p.add_run(strap)
    r.font.size = Pt(9)
    r.font.color.rgb = GREY
    p.paragraph_format.space_after = Pt(14)


# ---------------------------------------------------------------- START HERE


def build_start_here(schema, network):
    doc = Document()
    setup_page(doc)
    title_block(
        doc,
        "Supply Chain Ontology",
        "Presales kit — start here",
        f"SAP Partnership Compass  ·  {DATE}  ·  Owner: Dave Freriks",
    )

    body(
        doc,
        "This kit lets a Snowflake SE demonstrate disruption modelling on SAP data "
        "without building anything. A live browser build needs no credentials and no "
        "setup: open the URL below and you are in the demo. Everything else in this "
        "folder exists to tell you what to say over it.",
    )

    callout(
        doc,
        "Live demo",
        f"{PUBLIC_URL} — credential-free, nothing to install. "
        "Ask the Ontology and shortest-path traversal are disabled in this build "
        "because they need a Snowflake connection; see 06_Setup_and_Access.",
    )

    h1(doc, "What this demonstrates")
    body(
        doc,
        "When a plant goes offline, what is at risk downstream, and how much of it "
        "can be protected by moving work between plants we already own? The "
        "application answers that in seconds against SAP data products already in "
        "Snowflake. Nothing is copied out of SAP and no new platform is introduced — "
        "which is the partnership proof point, not just the supply-chain one.",
    )

    t = network["totals"]
    table(
        doc,
        ["The demo in six numbers", "Value"],
        [
            ["Network modelled", f"{t['plants']} plants, {t['suppliers']} suppliers, {t['customers']} customers"],
            ["Monthly network value", f"${t['monthly_value'] / 1_000_000:,.2f}M across {t['flows']} flows"],
            ["Flagship scenario", "Hurricane closes Austin Fab, 60 days"],
            ["Exposure it finds", "$16.05M — 28.3% of monthly network value, across 2 hops"],
            ["Protected by rerouting", "91.4% ($13.80M), inside real plant capacity"],
            ["Structural exposure", f"{len(t['single_source_categories'])} categories made at exactly one plant"],
        ],
        widths=[2.3, 4.4],
    )

    h1(doc, "Which file to open")
    table(
        doc,
        ["File", "Use it when", "Read time"],
        [
            [
                "03_SE_Quick_Start.docx",
                "You are demoing this week and have not seen it before. Positioning, "
                "a ten-minute path, discovery questions, objection handling. Start here.",
                "10 min",
            ],
            [
                "02_Demo_Scripts_by_Persona.docx",
                "You know who is in the room. Six standalone scripts — Risk Manager, "
                "VP/COO, CFO, Plant Manager, Account Director, Architect — each with "
                "an action/say table and the numbers to land.",
                "per script",
            ],
            [
                "01_Management_Summary.docx",
                "Leaving something behind with the customer, or briefing an exec "
                "before the demo. Customer-safe, states real versus modelled plainly.",
                "15 min",
            ],
            [
                VIDEO_NAME,
                "You want to see it run before you run it, or you need an async "
                "asset for a customer who could not attend. Narrated.",
                "4m43s",
            ],
            [
                "00_Presales_Overview.pptx",
                "You need slides. Ten slides covering the problem, the architecture, "
                "the scenario result and the ask. Drop into your own deck.",
                "10 slides",
            ],
            [
                "05_Technical_Handbook.docx",
                "An architect is in the room, or you are standing it up yourself. "
                "Concepts, architecture, build steps, findings, references.",
                "reference",
            ],
            [
                "06_Setup_and_Access.docx",
                "You need the full version — Ask the Ontology, the scenario pages "
                "against live Snowflake — or you want the Snowflake object inventory.",
                "5 min",
            ],
            [
                "07_Background/",
                "Provenance. The AI309 Summit deck this narrative came from, and the "
                "ontology-layer deep dive behind the abstract-class argument.",
                "optional",
            ],
        ],
        widths=[1.9, 4.0, 0.8],
    )

    h1(doc, "The one thing to get right")
    body(
        doc,
        "Be precise about what is real. The network, the flow volumes and values, "
        "plant capacity and inventory buffer days are real SAP data products in "
        "Snowflake. Two things are derived: which plant can substitute for another "
        "(inferred from observed shipments, because production versions map each "
        "material to exactly one plant and so express no alternatives) and hours "
        "consumed per unit (blended across products, planning-grade). Qualification "
        "time for a plant change and component-level shortages inside a plant are "
        "not modelled at all.",
    )
    body(
        doc,
        "Saying this before you are asked is what makes the numbers survive "
        "challenge. Both 01_Management_Summary and 03_SE_Quick_Start carry the full "
        "table; the demo states it on screen too.",
    )

    h1(doc, "Two things this is not")
    bullet(
        doc,
        "Not a supply-chain analytics dashboard. For production orders, inventory "
        "and logistics reporting, use SAP Supply Chain 360. This models disruption.",
    )
    bullet(
        doc,
        "The SAP BDC catalog half is not an ontology. It is metadata about what data "
        f"exists — {schema['counts']['classes']} classes and "
        f"{schema['counts']['relations']} relations in Snowflake are the ontology. "
        "The distinction is the architect's talk track; see 05_Technical_Handbook.",
    )

    h1(doc, "What the video covers")
    body(
        doc,
        "The narrated walkthrough was re-recorded on 08 October 2026 in the author's "
        "own voice (a Qwen3-TTS clone). It follows the hurricane scenario end to end — "
        "Scenario Studio, Ripple Map, Mitigation, Optimization Map — and every figure "
        "matches the live app. It does not show the newer Digital Thread page or the "
        "Ask Cortex buttons; demo those live if the room is operations- or "
        "quality-led.",
    )

    h1(doc, "Support")
    body(
        doc,
        f"Source and documentation: {REPO_URL}. Questions, or a customer network you "
        "want pointed at the same engine: contact Dave Freriks.",
    )

    out = KIT / "00_START_HERE.docx"
    doc.save(out)
    return out


# --------------------------------------------------------------- QUICK START


def build_quick_start(schema, network):
    doc = Document()
    setup_page(doc)
    title_block(
        doc,
        "Supply Chain Ontology",
        "SE quick start",
        f"Ten-minute demo path, talk track and objection handling  ·  {DATE}",
    )

    body(
        doc,
        "Written to be read once, the day before you demo. It assumes you have not "
        "seen the application. If you have twenty minutes instead of ten, add the "
        "second scenario in step 6 and the architecture aside in step 7.",
    )

    h1(doc, "Positioning, in three sentences")
    bullet(
        doc,
        "Every manufacturer has a resilience plan built in spreadsheets, and every "
        "one of them breaks at the second hop — the plant that fails because the "
        "plant that failed was feeding it.",
    )
    bullet(
        doc,
        "This runs the second and third hop in seconds, against SAP data products "
        "already in Snowflake, and returns a mitigation plan bounded by real plant "
        "capacity rather than a recovery percentage you have to take on faith.",
    )
    bullet(
        doc,
        "Nothing leaves SAP and no new platform is bought — the SAP semantics are "
        "preserved and the compute is Snowflake's. That is the partnership story in "
        "one screen.",
    )

    h1(doc, "Before you start")
    bullet(doc, f"Public build: open {PUBLIC_URL} and confirm the Scenario Studio page loads.")
    bullet(
        doc,
        "Run the Austin hurricane preset once to warm it, then reset to a clean "
        "state. A cold first run looks slower than it is.",
    )
    bullet(
        doc,
        "If you want the AI briefing and Ask the Ontology, you need the local build "
        "with a Snowflake connection — see 06_Setup_and_Access. Decide which build "
        "you are on before the call, not during it.",
    )
    bullet(
        doc,
        "Share a large window. The Ripple Map is two panels side by side and shrinks "
        "badly on a laptop screen.",
    )
    bullet(
        doc,
        "If you are pairing the video with a live demo: the video covers the hurricane "
        "flow only. Digital Thread and the Ask Cortex buttons are live-only — show "
        "them after the video rather than before.",
    )

    h1(doc, "The ten-minute path")
    body(
        doc,
        "This is the Risk Manager flow, compressed. It is the strongest opening for "
        "almost any room: the scenario is one every manufacturer recognises, it "
        "exercises all four scenario pages, and it ends on a decision with a number "
        "attached.",
        italic=True,
    )
    table(
        doc,
        ["#", "Page", "Do and say", "Time"],
        [
            [
                "1",
                "Scenario Studio",
                "Open on the network — 5 plants, 6 suppliers, 8 customers, $56.69M a "
                "month. Say: this is not a model we built, it is their SAP data "
                "read in place.",
                "1 min",
            ],
            [
                "2",
                "Scenario Studio",
                "Run the Austin hurricane, 60 days. Exposure appears: $16.05M, 28.3% "
                "of monthly network value. Pause on the number before explaining it.",
                "1 min",
            ],
            [
                "3",
                "Ripple Map",
                "Press Play from the start. The cascade walks one lane at a time, "
                "camera following. Let it run — the sequencing is the argument.",
                "2 min",
            ],
            [
                "4",
                "Ripple Map",
                "Click Penang. Austin also ships test fixtures to Penang, which runs "
                "on 12 days of stock, so Penang stops too — $1.29M of second-order "
                "loss. This is the hop the spreadsheet misses. Land it hard.",
                "1 min",
            ],
            [
                "5",
                "Mitigation",
                "Two feasible reroutes to San Jose, consuming 98 then 148 of 282 free "
                "hours. San Jose ends at 98.6% utilised with zero spare units — the "
                "plan works and leaves no slack. That honesty is the credibility.",
                "2 min",
            ],
            [
                "6",
                "Mitigation",
                "The blocked item: die sorting for two customers cannot be rerouted at "
                "any price, because Penang is the only plant that makes it. $1.29M "
                "unrecoverable. Close on 91.4% protected, 8.6% structural.",
                "1 min",
            ],
            [
                "7",
                "Mitigation",
                "Generate the AI briefing, then ask a follow-up — what if the outage "
                "runs 90 days. Shows the AI interpreting a computed result, not "
                "inventing one. (Local build only.)",
                "1 min",
            ],
            [
                "8",
                "Scenario Studio",
                "If time allows, run Typhoon — Penang Assembly. $5.85M at risk, 0% "
                "recoverable. Same tool, opposite answer: resilience is a property of "
                "the network, not of a plant.",
                "1 min",
            ],
        ],
        widths=[0.3, 1.4, 4.3, 0.7],
    )

    h2(doc, "The closing line")
    callout(
        doc,
        "Say this",
        "Of $15.09M of customer revenue exposed by a hurricane at Austin, 91.4% can "
        "be protected by moving work between plants we already own — and the "
        "remainder cannot be protected at any price, which is a sourcing decision, "
        "not a planning one.",
    )

    h1(doc, "The scenario library, for picking a second run")
    body(
        doc,
        "Six scenarios ship ready to run. The spread is the point: pick a second one "
        "that contradicts the first.",
    )
    table(
        doc,
        ["Scenario", "Duration", "At risk", "Hops", "Recoverable"],
        [
            ["Hurricane: Austin Fab offline", "60d", "$16.05M", "2", "91.4%"],
            ["Typhoon: Penang Assembly offline", "30d", "$5.85M", "1", "0%"],
            ["Supplier failure: Hamamatsu Photonics", "45d", "$9.08M", "3", "70.2%"],
            ["Partial loss: Dresden Fab at 60%", "30d", "$4.12M", "1", "44.7%"],
            ["Lane closed: San Jose to Penang", "40d", "$3.73M", "2", "0%"],
            ["Demand spike: TSMC +60%", "30d", "$8.82M", "1", "—"],
        ],
        widths=[2.7, 0.8, 0.9, 0.5, 1.1],
    )
    body(
        doc,
        "Two are worth raising deliberately. The Penang typhoon is entirely "
        "unrecoverable because Penang is the sole source of die sorting — a "
        "structural exposure no planning exercise can close. Dresden is only 44.7% "
        "recoverable despite being a partial outage, because it has the least spare "
        "capacity in the network.",
    )

    h1(doc, "Which page to open for which room")
    table(
        doc,
        ["Persona", "Their question", "Open on", "Fit"],
        [
            [
                "Supply Chain Risk Manager",
                "What is our exposure this season, and what is the playbook?",
                "Scenario Studio",
                "Best",
            ],
            [
                "VP Supply Chain / COO",
                "Where are we structurally fragile, and what would a fix cost?",
                "Scenario library table",
                "High",
            ],
            [
                "CFO / FP&A",
                "What revenue is exposed, and how much of it is defensible?",
                "Mitigation split",
                "High",
            ],
            [
                "Plant Manager",
                "What am I being asked to absorb, and can I take it?",
                "Mitigation, capacity view",
                "Medium",
            ],
            [
                "Customer Account Director",
                "Which of my customers are exposed, and what do I tell them?",
                "Exposure by customer",
                "Medium",
            ],
            [
                "Quality / Operations lead",
                "Which customers did this bad supplier lot reach?",
                "Digital Thread",
                "High",
            ],
            [
                "Enterprise / Data Architect",
                "How does this work without copying SAP data?",
                "Ontology Model",
                "Medium",
            ],
        ],
        widths=[1.6, 2.6, 1.6, 0.6],
    )
    body(
        doc,
        "Full scripts for all six, with the numbers to land and the questions each "
        "audience actually asks, are in 02_Demo_Scripts_by_Persona.docx. Scripts 1 "
        "and 2 are the only pair designed to run back to back.",
        italic=True,
    )

    h1(doc, "Discovery questions")
    body(doc, "Ask these before you demo. They tell you which scenario to run and whether this qualifies.")
    bullet(doc, "When a site went down in the last two years, how long did it take you to work out what else stopped?")
    bullet(doc, "Do you know which of your product categories are made at exactly one site?")
    bullet(doc, "When you reroute production, who checks the receiving plant has the capacity — and how long does that take?")
    bullet(doc, "Is your SAP data already in Snowflake, or is that the conversation we should be having first?")
    bullet(doc, "Who owns the resilience plan today, and what tool is it in?")

    h1(doc, "Objections, and what to say")
    table(
        doc,
        ["They say", "You say"],
        [
            [
                "Is this real data or a demo dataset?",
                "The network, volumes, values, plant capacity and inventory are real "
                "SAP data products in Snowflake. Two things are derived and labelled "
                "as such on screen: substitutability, inferred from observed "
                "shipments, and hours per unit, blended across products.",
            ],
            [
                "We could do this in a spreadsheet.",
                "The first hop, yes. The second breaks it — you need to know Austin "
                "feeds Penang, how much Penang depends on that lane, and that 12 days "
                "of stock is the buffer. Then redo it for every site and duration.",
            ],
            [
                "How accurate is the 12-day figure?",
                "It is the minimum days of inventory from material stock data, not the "
                "average, deliberately. One component at 12 days stops the line "
                "regardless of another sitting at 400.",
            ],
            [
                "Can a reroute really happen that fast?",
                "Feasible here means another plant already ships that category and has "
                "the hours. It does not mean qualified and approved — that is "
                "explicitly not modelled, and it is the right question to escalate.",
            ],
            [
                "Does it check components at the receiving plant?",
                "No. Inbound component availability at the receiving plant is not "
                "re-checked, and it is listed as a limitation. Bill-of-materials "
                "explosion is the natural next increment.",
            ],
            [
                "Why not do this in SAP?",
                "The reasoning spans plants, parties and flows as kinds of thing, "
                "which is what the abstract classes give you — one query answers "
                "'which parties are affected' across suppliers and customers. The SAP "
                "semantics are preserved; Snowflake does the traversal and the AI.",
            ],
            [
                "Can we point it at our network?",
                "Yes — the scenario logic is independent of this dataset. That is the "
                "follow-on engagement, and the ask at the end of the deck.",
            ],
        ],
        widths=[1.9, 4.8],
    )

    h1(doc, "Real versus modelled")
    body(doc, "Put this on screen if challenged. It is in the customer-facing summary too, by design.")
    table(
        doc,
        ["Element", "Status"],
        [
            ["Network, flows, volumes, values", "Real — SAP data products in Snowflake"],
            ["Plant capacity and utilisation", "Real — work-centre capacity data"],
            ["Inventory buffer days", "Real — material stock data"],
            ["Which plant can substitute", "Derived from observed shipments"],
            ["Hours consumed per unit", "Derived, planning-grade, blended across products"],
            ["Qualification time for a plant change", "Not modelled"],
            ["Component shortages inside a plant", "Not modelled — BOM available if taken further"],
        ],
        widths=[2.8, 3.9],
    )

    h1(doc, "If it goes wrong")
    bullet(doc, "Ask returns nothing or errors — you are on the public build. It needs Snowflake credentials; skip step 7.")
    bullet(doc, "Shortest path is missing — also public-build only. Expansion from the 24 most-connected entities is available.")
    bullet(doc, "The topology panel is zoomed awkwardly — press Reset view. A deliberate zoom is preserved across beats by design.")
    bullet(doc, "Playback is too slow or too fast for the room — speed is adjustable from 1.5 to 20 seconds per step.")
    bullet(doc, "Graph traversal looks thinner than expected — say so. No entity association crosses a data product boundary; cross-product linkage lives in the ODM overlay, through Plant. The page states this on screen rather than implying a richer graph.")

    out = KIT / "03_SE_Quick_Start.docx"
    doc.save(out)
    return out


# ------------------------------------------------------------- SETUP, ACCESS


def build_setup(schema, network):
    doc = Document()
    setup_page(doc)
    title_block(
        doc,
        "Supply Chain Ontology",
        "Setup and access",
        f"Live build, local build, Snowflake objects  ·  {DATE}",
    )

    h1(doc, "Three ways to get to it")
    table(
        doc,
        ["Option", "What you get", "What it costs you"],
        [
            [
                "Public web build",
                "Every page except Ask the Ontology and shortest-path traversal. "
                "Scenario pages, Ripple Map, Mitigation, Optimization Map all work "
                "from pre-baked snapshots. No credentials, no customer data.",
                "Nothing — open the URL",
            ],
            [
                "Local build",
                "Everything, including Cortex Analyst and the AI briefing, against "
                "live Snowflake.",
                "Node, a clone, and key-pair credentials",
            ],
            [
                "Ask for a walkthrough",
                "Someone runs it for you on a call, or you send the narrated video.",
                "A calendar invite",
            ],
        ],
        widths=[1.4, 3.9, 1.4],
    )
    callout(doc, "Public build", PUBLIC_URL)
    callout(doc, "Source and docs", REPO_URL)

    h1(doc, "Running it locally")
    body(doc, "Node 18 or later, and a Snowflake key-pair user with read access to the objects listed below.")
    table(
        doc,
        ["Step", "Command"],
        [
            ["Clone", f"git clone {REPO_URL}"],
            ["Install", "npm install"],
            ["Run", "npm run dev        # server :3009, client :5179"],
            ["Open", "http://localhost:5179"],
        ],
        widths=[0.9, 5.8],
    )
    body(doc, "Cortex Analyst needs server/.env:", after=2)
    for line in [
        "SNOWFLAKE_ACCOUNT=…",
        "SNOWFLAKE_USER=…",
        "SNOWFLAKE_PRIVATE_KEY_PATH=…",
        "BDC_SEMANTIC_VIEW=SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.SUPPLY_CHAIN_ONTOLOGY_MODEL",
        "PORT=3009",
    ]:
        p = doc.add_paragraph()
        r = p.add_run("    " + line)
        r.font.name = "Menlo"
        r.font.size = Pt(8.5)
        p.paragraph_format.space_after = Pt(0)
    doc.add_paragraph()

    h1(doc, "What the public build cannot do")
    bullet(doc, "Ask the Ontology is disabled — Cortex Analyst needs Snowflake credentials.")
    bullet(
        doc,
        "Shortest path is hidden. The pair space is quadratic, so only expansion "
        "from the 24 most-connected entities is baked.",
    )
    body(
        doc,
        "Both are stated on screen in the public build, so you will not be caught "
        "out mid-demo — but know which build you are on before the call.",
        italic=True,
    )

    h1(doc, "Snowflake objects")
    body(
        doc,
        "Two schemas, matching the two halves of the application. The ontology is "
        "the model; the catalog is metadata about what data exists.",
    )

    h2(doc, "The ontology — SAP_SUPPLY_CHAIN.ONTOLOGY")
    table(
        doc,
        ["Layer", "Name", "Contents"],
        [[s["layer"], s["name"], f"{s['detail']} — {s['note']}"] for s in schema["stack"]],
        widths=[0.6, 1.4, 4.7],
    )
    c = schema["counts"]
    body(
        doc,
        f"{c['classes']} classes ({c['abstract']} abstract, {c['concrete']} concrete), "
        f"{c['relations']} relations ({c['relations_stored']} stored, "
        f"{c['relations_inferred']} inferred, {c['relations_abstract']} abstract), "
        f"{c['instances']:,} instances. The abstract layer is what lets one query span "
        "several concrete types — asking for parties returns all 8 customers and 6 "
        "suppliers together.",
    )

    h2(doc, "The BDC catalog — SAP_BDC_ONTOLOGY.SUPPLY_CHAIN")
    body(
        doc,
        "Views over the parent ontology's CORE tables. No copies are made, so there "
        "is one source of truth.",
    )
    table(
        doc,
        ["Object", "Rows"],
        [
            ["V_PRODUCT", "36 data products"],
            ["V_ENTITY", "338 CDS entities"],
            ["V_ENTITY_EDGE", "281 associations"],
            ["V_PROCESS", "3 processes"],
            ["V_ODM_EDGE", "19 master-data links"],
            ["V_PROCESS_ROLLUP", "derived"],
            ["SUPPLY_CHAIN_ONTOLOGY_MODEL", "semantic view — 17 facts, 11 metrics"],
        ],
        widths=[3.2, 3.5],
    )

    h2(doc, "The scenario network — SAP_SUPPLY_CHAIN.SCENARIO")
    t = network["totals"]
    table(
        doc,
        ["Item", "Value"],
        [
            ["Nodes", f"{t['nodes']} — {t['plants']} plants, {t['suppliers']} suppliers, {t['customers']} customers"],
            ["Flows", f"{t['flows']} carrying ${t['monthly_value'] / 1_000_000:,.2f}M monthly"],
            ["Single-source categories", ", ".join(t["single_source_categories"])],
        ],
        widths=[1.7, 5.0],
    )

    h1(doc, "Scope rule, if asked what is in and out")
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
        "The rule is implemented twice, and a deploy step asserts the two agree and "
        "fails if they drift — otherwise Ask would answer over a different "
        "population than the pages display.",
    )

    h1(doc, "Related assets")
    table(
        doc,
        ["Asset", "Where"],
        [
            ["SAP Supply Chain 360", "Production supply-chain analytics — separate app, separate listing"],
            ["SAP BDC Ontology Explorer", "https://sfc-gh-dfreriks.github.io/sap-bdc-data-products/ — all 334 products"],
            ["This kit", "SAP Partnership Compass, Seismic"],
        ],
        widths=[1.9, 4.8],
    )

    h1(doc, "Contact")
    body(
        doc,
        "Dave Freriks. For a customer network you want pointed at the same engine, or "
        "for access help, raise it directly — the scenario logic is independent of "
        "this dataset.",
    )

    out = KIT / "06_Setup_and_Access.docx"
    doc.save(out)
    return out


def main():
    global VIDEO_NAME
    VIDEO_NAME = kit_video(VIDEO_SRC)
    KIT.mkdir(parents=True, exist_ok=True)
    schema, network = load_data()
    for fn in (build_start_here, build_quick_start, build_setup):
        path = fn(schema, network)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
