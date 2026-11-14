#!/usr/bin/env python3
"""Build the presales kit documents for the SAP Partnership Compass page.

Three documents, written for the Snowflake presales team rather than for a
customer:

    00_START_HERE.docx        what is in the kit and which file to open when
    03_SE_Quick_Start.docx    positioning, a ten-minute path, objections
    06_Setup_and_Access.docx  live URL, local run, Snowflake objects

Figures come from tools/facts.py (the exported ontology, network, thread and
baked scenarios), so they cannot drift from what a demo actually shows. The kit
also refreshes its copies of the management summary, demo scripts, handbook,
demo deck and project guide from their generated originals.

    python3 tools/build_presales_kit.py
"""

import json
import shutil
import subprocess
from pathlib import Path

from docx import Document
from docx.shared import Pt

import facts
from facts import money
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
DATE = __import__("datetime").date.today().strftime("%d %B %Y")


SAP = Path.home() / "Documents" / "SAP"
# kit file  <-  generated original
COPIES = {
    "01_Management_Summary.docx": SAP / "Supply_Chain_Ontology_Management_Summary.docx",
    "02_Demo_Scripts_by_Persona.docx": SAP / "Supply_Chain_Ontology_Demo_Scripts.docx",
    "05_Technical_Handbook.docx": SAP / "Supply_Chain_Ontology_Docs" / "Supply_Chain_Ontology_Documentation_Handbook.docx",
    "SAP_Supply_Chain_Ontology_Demo.pptx": SAP / "SAP_Supply_Chain_Ontology_Demo.pptx",
    "SAP_Supply_Chain_Ontology_Project_Guide.docx": SAP / "SAP_Supply_Chain_Ontology_Project_Guide.docx",
}


def load_data():
    """facts, scenario list, network JSON."""
    network = json.loads((REPO / "data" / "sc_network.json").read_text())
    return facts.build(), facts.scenarios(), network


def scen(sc, id_):
    return next(x for x in sc if x["id"] == id_)


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


def build_start_here(X, sc, network):
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
        "Ask Cortex and the AI briefing are disabled in this build because they "
        "need a Snowflake connection, and only the nine preset scenarios run; see "
        "06_Setup_and_Access.",
    )

    h1(doc, "What this demonstrates")
    body(
        doc,
        "When a plant goes offline, what is at risk downstream, and how much of it "
        "can be protected by moving work between plants we already own? The "
        "application answers that in seconds against SAP data already in Snowflake, "
        "and it is built on Snowflake Business Ontology: every input is found by "
        "walking a governed Supply Chain domain, so no table is named in code. "
        "Nothing is copied and no new platform is introduced.",
    )

    t = network["totals"]
    hur = scen(sc, "hurricane-austin")
    table(
        doc,
        ["The demo in six numbers", "Value"],
        [
            ["Network modelled", f"{t['plants']} plants, {t['suppliers']} suppliers, {t['customers']} customers"],
            ["Monthly network value", f"${t['monthly_value'] / 1_000_000:,.2f}M across {t['flows']} flows"],
            ["Flagship scenario", "Hurricane closes Austin Fab, 60 days"],
            ["Exposure it finds", f"{money(hur['valueAtRisk'])} — {hur['pctOfNetwork']}% of monthly network value, across {hur['maxHop']} hops"],
            ["Protected by rerouting", f"{hur['protectedPct']}% ({money(hur['protected'])}), inside real plant capacity"],
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
                "asset for a customer who could not attend. Narrated. Recorded "
                "before the 13 Nov 2026 rebuild, so it shows the earlier page "
                "layout; the scenario figures are unchanged.",
                "4m11s",
            ],
            [
                "00_Presales_Overview.pptx",
                "You need slides. Ten slides covering the problem, the ontology, "
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
                "You need the full version — Ask Cortex, the AI briefing, any custom "
                "disruption — or you want the Business Ontology and Snowflake object "
                "inventory.",
                "5 min",
            ],
            [
                "07_Background/",
                "Provenance. The AI309 Summit deck this narrative came from, and the "
                "earlier ontology-layer deep dive (history: the app now runs on "
                "Snowflake Business Ontology).",
                "optional",
            ],
        ],
        widths=[1.9, 4.0, 0.8],
    )

    h1(doc, "The one thing to get right")
    body(
        doc,
        "Be precise about what is real. The network, the flow volumes and values, "
        "plant capacity and inventory buffer days are real SAP data in Snowflake, "
        "read through the ontology. Digital-thread instances are demo enrichment "
        "keyed to it. Two things are derived: which plant can substitute for another "
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
        "Not an app-owned data model. The ontology is the governed Supply Chain "
        f"domain in Snowflake Business Ontology — {X['concepts']} concepts, "
        f"{X['relationships']} relationships, {X['representations']} representations — "
        "and the app only reads it. That is the architect's talk track; see "
        "05_Technical_Handbook.",
    )

    h1(doc, "What the video covers")
    body(
        doc,
        "The narrated walkthrough was re-recorded on 14 November 2026 in the author's "
        "own voice (a Qwen3-TTS clone), on the current eight-page app. It opens on "
        "Snowflake Business Ontology: the governed Supply Chain domain, the Plant "
        "concept, what the app reads through the ontology, and the same domain in "
        "Snowsight. It then runs the hurricane scenario end to end, tying each step "
        "to the relationship it walks, and plays the recovery with old lanes in red "
        "and new lanes in green. It does not show the Digital Thread or the Ask "
        "Cortex buttons; demo those live.",
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


def build_quick_start(X, sc, network):
    hur = scen(sc, "hurricane-austin")
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
        "This runs the second and third hop in seconds, against SAP data already in "
        "Snowflake, and returns a mitigation plan bounded by real plant "
        "capacity rather than a recovery percentage you have to take on faith.",
    )
    bullet(
        doc,
        "It is built on Snowflake Business Ontology: the relationships are governed "
        "once in Snowflake and every page reads through them. Nothing is copied and "
        "no new platform is bought.",
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
        "If you want the AI briefing and Ask Cortex, you need the local build "
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
        "If you are pairing the video with a live demo: the video covers the ontology "
        "and the hurricane flow. The Digital Thread and the Ask Cortex buttons are "
        "live-only — show them after the video.",
    )

    h1(doc, "The ten-minute path")
    body(
        doc,
        "This is the Risk Manager flow, compressed. It is the strongest opening for "
        "almost any room: the scenario is one every manufacturer recognises, it "
        "exercises all three scenario pages, and it ends on a decision with a number "
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
                f"Open on the network — {X['plants']} plants, {X['suppliers']} suppliers, "
                f"{X['customers']} customers, {money(X['monthly_value'])} a month. Say: "
                "this is SAP data, found by walking the governed ontology.",
                "1 min",
            ],
            [
                "2",
                "Scenario Studio",
                f"Run the Austin hurricane, 60 days. Exposure appears: "
                f"{money(hur['valueAtRisk'])}, {hur['pctOfNetwork']}% "
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
                "Mitigation & Recovery",
                "Play the recovery. Two feasible reroutes to San Jose, consuming 98 then 148 of 282 free "
                "hours. San Jose ends at 98.6% utilised with zero spare units — the "
                "plan works and leaves no slack. That honesty is the credibility.",
                "2 min",
            ],
            [
                "6",
                "Mitigation & Recovery",
                "The blocked item: die sorting for two customers cannot be rerouted at "
                "any price, because Penang is the only plant that makes it. "
                f"{money(hur['unprotected'])} unrecoverable. Close on "
                f"{hur['protectedPct']}% protected, {round(100 - hur['protectedPct'], 1)}% structural.",
                "1 min",
            ],
            [
                "7",
                "Mitigation & Recovery",
                "Generate the AI briefing, then ask a follow-up — what if the outage "
                "runs 90 days. Shows the AI interpreting a computed result, not "
                "inventing one. (Local build only.)",
                "1 min",
            ],
            [
                "8",
                "Scenario Studio",
                "If time allows, run Typhoon — Penang Assembly. "
                f"{money(scen(sc, 'typhoon-penang')['valueAtRisk'])} at risk, 0% "
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
        f"Of {money(hur['revenueAtRisk'])} of customer revenue exposed by a hurricane "
        f"at Austin, {hur['protectedPct']}% can be protected by moving work between plants we already own — and the "
        "remainder cannot be protected at any price, which is a sourcing decision, "
        "not a planning one.",
    )

    h1(doc, "The scenario library, for picking a second run")
    body(
        doc,
        f"{len(sc)} scenarios ship ready to run, three of them drawn from the "
        "operations pulse. The spread is the point: pick a second one that "
        "contradicts the first.",
    )
    table(
        doc,
        ["Scenario", "Duration", "At risk", "Hops", "Recoverable"],
        [[x["label"].replace(" — ", ": "), f"{x['days']}d", money(x["valueAtRisk"]),
          str(x["maxHop"]), "—" if x["kind"] == "demand" else f"{x['protectedPct']}%"]
         for x in sc],
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
                "Mitigation & Recovery",
                "High",
            ],
            [
                "Plant Manager",
                "What am I being asked to absorb, and can I take it?",
                "Mitigation & Recovery, capacity",
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
                "How is this built on governed semantics?",
                "Ontology",
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
                "SAP data in Snowflake. Two things are derived and labelled "
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
                "The relationships it reasons over — supplies, ships to, has part, "
                "fulfilled by — are governed once in Snowflake Business Ontology and "
                "reused by every page, alongside data from outside SAP. Snowflake "
                "does the walk and the AI.",
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
            ["Network, flows, volumes, values", "Real — SAP data in Snowflake, read through the ontology"],
            ["Digital-thread instances", "Demo enrichment keyed to real plants, suppliers and BOMs"],
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
    bullet(doc, "Ask Cortex or the AI briefing returns nothing — you are on the public build. It needs Snowflake credentials; skip step 7.")
    bullet(doc, "A slider does nothing — also public-build only. Custom disruptions need the live server; use a preset.")
    bullet(doc, "The topology panel is zoomed awkwardly — press Reset view. A deliberate zoom is preserved across beats by design.")
    bullet(doc, "Playback is too slow or too fast for the room — speed is adjustable from 1.5 to 20 seconds per step.")

    out = KIT / "03_SE_Quick_Start.docx"
    doc.save(out)
    return out


# ------------------------------------------------------------- SETUP, ACCESS


def build_setup(X, sc, network):
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
                "All eight pages and the nine preset scenarios from pre-baked "
                "snapshots. No Ask Cortex, AI briefing or custom disruptions. No "
                "credentials, no customer data.",
                "Nothing — open the URL",
            ],
            [
                "Local build",
                "Everything, including Ask Cortex, the AI briefing and custom "
                "disruptions (AI_COMPLETE needs Snowflake).",
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
    body(doc, "Node 20 or later. Every page runs from the committed JSON; the AI features need a Snowflake key-pair user.")
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
    body(doc, "Ask Cortex and the AI briefing need server/.env:", after=2)
    for line in [
        "SNOWFLAKE_ACCOUNT=…",
        "SNOWFLAKE_USER=…",
        "SNOWFLAKE_PRIVATE_KEY_PATH=…",
        "PORT=3009",
    ]:
        p = doc.add_paragraph()
        r = p.add_run("    " + line)
        r.font.name = "Menlo"
        r.font.size = Pt(8.5)
        p.paragraph_format.space_after = Pt(0)
    doc.add_paragraph()

    h1(doc, "What the public build cannot do")
    bullet(doc, "Ask Cortex and the AI briefing are disabled — AI_COMPLETE needs Snowflake credentials.")
    bullet(doc, "Custom disruptions are disabled — simulate runs server-side, so only the nine presets are baked.")
    body(
        doc,
        "Both are stated on screen in the public build, so you will not be caught "
        "out mid-demo — but know which build you are on before the call.",
        italic=True,
    )

    h1(doc, "The ontology — Snowflake Business Ontology")
    rt = X["rel_types"]
    body(
        doc,
        f"Domain '{X['domain']}' on account {X['account']}: {X['concepts']} concepts "
        f"({X['entities']} entities, {X['terms']} term), {X['relationships']} relationships "
        f"({', '.join(f'{v} {k}' for k, v in rt.items())}), {X['representations']} "
        "representations. Open it in Snowsight under Data → Business Ontology.",
    )
    lin = network["lineage"]
    table(
        doc,
        ["App input", "Found by walking", "Representation read"],
        [
            ["Suppliers, plants, customers", lin["walk"]["network"],
             ", ".join(v.split(".")[-1] for v in lin["nodes"].values())],
            ["Material flows", lin["walk"]["flows"],
             ", ".join(v.split(".")[-1] for v in lin["flows"].values())],
            ["Capacity, inventory", "Plant", "VW_ONT_PLANT"],
            ["Substitution", "Plant produces Material Category", "V_PRODUCES"],
            ["Order economics", lin["walk"]["economics"], "ANALYTICS.DT_ORDER_FULFILLMENT"],
            ["Digital thread", "System Serial has part Component Lot", "VW_ONT_LOT_BLAST_RADIUS + concept views"],
            ["Operations pulse", "Plant, Equipment", "DT_OPERATING_RATE, DT_COMPONENT_COVER, DT_EQUIPMENT_HEALTH"],
        ],
        widths=[1.6, 2.4, 2.7],
    )

    h2(doc, "The network it produces")
    t = network["totals"]
    table(
        doc,
        ["Item", "Value"],
        [
            ["Nodes", f"{t['nodes']} — {t['plants']} plants, {t['suppliers']} suppliers, {t['customers']} customers"],
            ["Flows", f"{t['flows']} carrying ${t['monthly_value'] / 1_000_000:,.2f}M monthly"],
            ["Single-source categories", ", ".join(t["single_source_categories"])],
            ["Digital thread", f"{X['systems']} systems, {X['lots']} lots ({X['deviating_lots']} deviating), {X['tools']} tools"],
        ],
        widths=[1.7, 5.0],
    )

    h1(doc, "Refreshing")
    body(
        doc,
        "After a steward changes the domain: npm run refresh. It re-walks the ontology, "
        "re-exports, re-bakes the public snapshots and reconciles — failing if the "
        "served files no longer match the ontology.",
    )

    h1(doc, "Related assets")
    table(
        doc,
        ["Asset", "Where"],
        [
            ["SAP Supply Chain 360", "Production supply-chain analytics — separate app, separate listing"],
            ["SAP BDC data products explorer", "https://sfc-gh-dfreriks.github.io/sap-bdc-data-products/ — the catalog this domain was derived from"],
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
    X, sc, network = load_data()
    for fn in (build_start_here, build_quick_start, build_setup):
        path = fn(X, sc, network)
        print(f"wrote {path}")
    for name, src in COPIES.items():
        if src.exists():
            shutil.copy2(src, KIT / name)
            print(f"copied {name}")
        else:
            print(f"MISSING original for {name}: {src}")


if __name__ == "__main__":
    main()
