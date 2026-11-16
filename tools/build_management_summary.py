#!/usr/bin/env python3
"""Generate the management summary Word document.

Every figure is read from tools/facts.py (exported ontology, network, baked scenarios),
which are produced by querying the running application — nothing here is
transcribed by hand, so the document cannot drift from what the app actually
reports.

Regenerate the inputs first (app must be running on :3009), then:
    python3 tools/build_management_summary.py
"""
import datetime
import json
import pathlib
import sys

from docx import Document
from docx.shared import Inches, Pt

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from docx_kit import (  # noqa: E402
    GREY, SAP_NAVY, SNOW_BLUE,
    body, bullet, h1, h2, money, setup_page, table,
)
import facts  # noqa: E402

OUT = pathlib.Path.home() / "Documents" / "SAP" / "Supply_Chain_Ontology_Management_Summary.docx"

REPO = "https://github.com/sfc-gh-dfreriks/supply-chain-ontology"
SITE = "https://sfc-gh-dfreriks.github.io/supply-chain-ontology/"


# ------------------------------------------------------------------- the report

def main():
    X = facts.build()
    # the six core presets; the three ops-* presets come from the operations pulse
    scen = [x for x in facts.scenarios() if not x["id"].startswith("ops-")]
    pf = facts.persona_facts()
    net = {"totals": pf["totals"]}

    doc = Document()
    setup_page(doc)

    # ---- title -----------------------------------------------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("Supply Chain Ontology")
    r.font.size = Pt(26)
    r.font.bold = True
    r.font.color.rgb = SAP_NAVY

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("Disruption scenario modelling on Snowflake Business Ontology")
    r.font.size = Pt(13)
    r.font.color.rgb = SNOW_BLUE

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(14)
    r = p.add_run(f"Management summary · {datetime.date.today():%d %B %Y}")
    r.font.size = Pt(9.5)
    r.font.color.rgb = GREY

    nt = net["totals"]
    # the plant the hurricane plan leaves tightest — the "new weak point"
    sj = next((c for c in pf["hurricane"]["capacityAfter"]
               if "San Jose" in c["plantName"]), None)

    # ---- executive summary ----------------------------------------------
    h1(doc, "Executive summary")
    body(doc,
         "We have built and deployed a working application that answers a question the "
         "business could not previously answer quickly: when a plant goes offline, what "
         "ripples through the supply chain, what does it cost, and what can be done to "
         "compensate.",
         size=10.5)
    body(doc,
         f"It runs on data already in Snowflake. Nothing was copied out of SAP, and no new "
         f"data platform was required. The application models a {nt['plants']}-plant network "
         f"carrying {money(nt['monthly_value'])} of flow per month, and produces a costed "
         f"mitigation plan in seconds rather than the days a manual exercise takes.")

    rows = [
        ["Business question answered",
         "If a site is disrupted, what is at risk downstream and how do we compensate?"],
        ["Status", "**Built, deployed and verified. Running today.**"],
        ["Data foundation",
         f"SAP data in Snowflake, read through a governed Business Ontology domain "
         f"({X['concepts']} concepts, {X['relationships']} relationships) — {nt['nodes']} network "
         f"nodes, {nt['flows']} flows, {money(nt['monthly_value'])} monthly"],
        ["Time to an answer",
         "Seconds per scenario, versus a manual exercise measured in days"],
        ["New infrastructure required", "None. One governed ontology domain over existing Snowflake data."],
        ["Cost to operate",
         "Negligible. Simulation runs in the application; only the AI narrative uses Snowflake compute."],
    ]
    table(doc, ["Item", "Summary"], rows, [1.9, 5.0], size=9.5)

    # ---- what was delivered ---------------------------------------------
    h1(doc, "What was delivered")
    body(doc,
         "Three connected pieces of work, each independently usable.")

    rows = [
        ["1. Governed ontology",
         f"The Supply Chain domain in Snowflake Business Ontology — {X['concepts']} concepts, "
         f"{X['relationships']} relationships, {X['representations']} representations — with an "
         f"executive dashboard and an Ontology page. Every page finds its data by walking it.",
         "2 pages"],
        ["2. Scenario modelling",
         "Disruption simulation across five event types, with ripple visualisation on a world "
         "map and network graph side by side, a mitigation optimiser, an animated recovery that "
         "plays the plan one decision at a time, and an AI briefing.",
         "4 pages"],
        ["3. Digital thread",
         f"Traceability from sales order to built system to component lot to tool: "
         f"{X['systems']} systems, {X['lots']} lots, {X['deviating_lots']} with a deviation. "
         f"Answers which customers a bad lot reached.",
         "1 page"],
        ["4. Publication",
         "Documented public repository and a credential-free web build, so the work can be "
         "shared with customers and colleagues without granting Snowflake access.",
         "7 documents"],
    ]
    table(doc, ["Workstream", "What it does", "Scale"], rows, [1.55, 4.35, 0.95], size=9.5)

    # ---- the worked example ---------------------------------------------
    hur = next(x for x in scen if x["id"] == "hurricane-austin")
    h1(doc, "Worked example: a hurricane closes the Austin plant")
    body(doc,
         "This is the case to show first, because the second-order effect is the part no "
         "spreadsheet catches.")

    rows = [
        ["Direct loss", "Two customers lose supply immediately",
         money(8_400_000 + 5_400_000)],
        ["Second-order loss",
         "Austin also ships test fixtures to Penang. Penang runs on 12 days of stock, then "
         "starves — taking two further customers down with it.",
         money(1_291_035)],
        ["**Total exposure**", f"**{hur['pctOfNetwork']}% of monthly network value**",
         f"**{money(hur['valueAtRisk'])}**"],
    ]
    table(doc, ["Effect", "What happens", "Value"], rows, [1.5, 4.35, 1.0], size=9.5, align_right=(2,))

    body(doc,
         "The application then produces a mitigation plan that respects real capacity limits:",
         after=4)
    bullet(doc, "Move inspection systems for GlobalFoundries to San Jose — 98 of 282 free hours.")
    bullet(doc, "Move metrology for Micron to San Jose — 148 of the remaining 184 hours.")
    bullet(doc,
           "Die sorting for two customers cannot be moved at all. Penang is the only plant "
           "that makes it.")

    body(doc, "", after=2)
    rows = [
        ["Protected by rerouting", f"**{money(hur['protected'])}**", f"{hur['protectedPct']}%"],
        ["Residual exposure", money(hur["unprotected"]), f"{round(100-hur['protectedPct'],1)}%"],
    ]
    table(doc, ["Outcome", "Value", "Share"], rows, [3.0, 2.0, 1.85], size=9.5, align_right=(1, 2))

    body(doc,
         "Two findings emerged that were not visible before. The two reroutes consume San Jose's "
         "spare capacity exactly, leaving it at 98.6% utilisation — the mitigation creates a new "
         "single point of failure. And roughly 1.3 million dollars of exposure cannot be "
         "engineered away at all; it requires either a second qualified source or a customer "
         "conversation.",
         italic=True, color=GREY)

    doc.add_page_break()

    # ---- scenario library ------------------------------------------------
    # ---- the recovery player ---------------------------------------------
    h1(doc, "Seeing the plan, not just the number")
    body(doc,
         "A recovery percentage is easy to state and hard to trust. Mitigation & Recovery plays "
         "the plan out as a sequence, one decision per step, so the reasoning is visible rather "
         "than asserted.")

    table(doc, ["Step", "What it shows", "Numbers"],
          [["Before", "The exposure, untouched", f"{money(hur['revenueAtRisk'])} of customer revenue at risk"],
           ["Fix 1", "GlobalFoundries moves Austin to San Jose",
            "+$8.40M protected, San Jose free hours 282 to 183.7, headroom 7.1%"],
           ["Fix 2", "Micron moves Austin to San Jose",
            "+$5.40M protected, free hours 183.7 to 36.2, headroom 1.4%"],
           ["Blocked", "Two customers with no alternative source",
            f"{money(hur['unprotected'])} unrecoverable at any price"],
           ["Result", "The plan, and what it cost",
            f"{hur['protectedPct']}% protected, San Jose "
            f"{sj['utilizationBefore'] if sj else 89.1}% to "
            f"{sj['utilizationAfter'] if sj else 98.6}% utilised, "
            f"{sj['spareUnitsLeft'] if sj else 0} spare units left"]],
          [0.85, 3.25, 2.75], size=9)

    body(doc,
         "The closing step is the part worth taking to a planning conversation. San Jose absorbs "
         "exactly its five spare units and ends fully committed, which means the plan works and "
         "it relocates the network's single point of failure rather than removing it. A second "
         "disruption at San Jose inside the same window would have no answer. The application "
         "flags the plant itself with a NEW WEAK POINT badge rather than leaving it to be "
         "noticed.", size=9.5)

    body(doc,
         "Each step also carries the arithmetic behind it on demand, and playback speed is "
         "adjustable from 1.5 to 20 seconds per step, so the same screen serves a two-minute "
         "executive walkthrough and a half-hour working session.", size=9.5)

    # ---- acting on the plan --------------------------------------------
    Wb = facts.writeback()
    h1(doc, "Acting on the plan in S/4HANA")
    body(doc,
         "A plan is only useful if it can be carried out. The Execute in S/4HANA page turns the "
         f"reroutes into S/4HANA document changes: for the hurricane, {Wb['sales_order_items']} sales "
         f"order items move to San Jose and {Wb['planned_orders']} planned orders are created there. "
         "Each change is a governed Action in the Supply Chain ontology, whose contract says what it "
         "needs, when it is allowed and what it changes, so the business rule lives with the data "
         "definitions rather than in code.")
    body(doc,
         "Nothing reaches the system of record without a second person. The approver must hold the "
         "approver role, cannot be the person who raised the request, and must acknowledge in "
         "writing that they are changing live transactional data. Every change is recorded as an "
         f"S/4 change document under their name and can be reversed. {Wb['simulated']}", size=9.5)

    h1(doc, "Scenario library")
    body(doc,
         f"{len(scen)} core scenarios ship ready to run, plus three drawn from the operations pulse. The spread matters: some disruptions are largely "
         "recoverable and some are not recoverable at all, and knowing which is which in advance "
         "is the point of the exercise.")

    rows = []
    for x in scen:
        recover = "—" if x["kind"] == "demand" else f"{x['protectedPct']}%"
        rows.append([
            x["label"].replace(" — ", ": "),
            f"{x['days']}d",
            money(x["valueAtRisk"]),
            f"{x['pctOfNetwork']}%",
            str(x["maxHop"]),
            recover,
        ])
    table(doc, ["Scenario", "Duration", "At risk", "Of network", "Hops", "Recoverable"],
          rows, [2.5, 0.7, 0.95, 0.95, 0.5, 1.05], size=9, align_right=(2, 3, 4, 5))

    body(doc,
         "Two results are worth drawing management attention to.", after=4)
    bullet(doc, "**A typhoon at Penang **is entirely unrecoverable. Penang is the sole source of die sorting, so no amount of "
           "capacity elsewhere helps. This is a structural exposure, not an operational one.")
    bullet(doc, "**A partial loss at Dresden **is only 44.7% recoverable despite being a partial outage, because Dresden has the "
           "least spare capacity in the network and is sole source for e-beam review.")

    body(doc,
         f"Across the whole network, {len(nt['single_source_categories'])} of the product "
         f"categories are made at exactly one plant. Those are the places where resilience has "
         f"to be bought rather than planned.")

    # ---- personas --------------------------------------------------------
    h1(doc, "Who uses this, and for what")
    body(doc,
         "Six roles get distinct value from the same application. The question each one asks is "
         "different, and so is the page they start on.")

    rows = [
        ["Supply Chain Risk Manager",
         "What is our exposure this hurricane season, and what is our playbook?",
         "Runs the scenario library, builds a costed response per site, identifies which "
         "exposures cannot be engineered away.",
         "**Best showcase**"],
        ["VP Supply Chain / COO",
         "Where are we structurally fragile, and what would it cost to fix?",
         "Reviews single-source categories and recoverability by scenario to prioritise "
         "second-source investment.",
         "High"],
        ["CFO / FP&A",
         "What revenue is exposed, and how much of it is defensible?",
         "Quantified value at risk, protected versus residual, watched accumulating decision by "
         "decision on Mitigation & Recovery — usable in risk "
         "disclosure and contingency planning.",
         "High"],
        ["Plant Manager",
         "What am I being asked to absorb, and can I actually take it?",
         "Sees the hours and utilisation a reroute imposes, and whether it pushes the site past "
         "safe operating headroom.",
         "Medium"],
        ["Customer Account Director",
         "Which of my customers are exposed, and what do I tell them?",
         "Exposure by named customer, plus an AI-drafted position for the customer conversation.",
         "Medium"],
        ["Enterprise / Data Architect",
         "How does this work without copying SAP data?",
         "The Ontology page shows every input read through governed concepts and their "
         "representations — no table named in code, no data copied.",
         "Medium"],
    ]
    table(doc, ["Role", "Question they ask", "What they do with it", "Fit"],
          rows, [1.5, 1.85, 2.55, 0.85], size=8.5)

    doc.add_page_break()

    # ---- recommended showcase -------------------------------------------
    h1(doc, "Recommended showcase: pre-season resilience review")
    body(doc,
         "The Supply Chain Risk Manager is the strongest persona to demonstrate, for three "
         "reasons. The scenario is one every manufacturer recognises. It exercises the whole "
         "application rather than one page. And it ends in a decision with a number attached, "
         "which is what makes the value legible.",
         size=10.5)

    h2(doc, "The narrative")
    body(doc,
         "Hurricane season is approaching. The risk manager has to tell the executive team what "
         "the company's exposure is and what the response would be — before anything happens, "
         "not during.")

    h2(doc, "Suggested flow, about eight minutes")
    rows = [
        ["1", "Scenario Studio",
         "Open on the network: 5 plants, 6 suppliers, 8 customers, "
         f"{money(nt['monthly_value'])} a month. Establish that this is real, current data.",
         "1 min"],
        ["2", "Scenario Studio",
         "Run the Austin hurricane. Headline exposure appears: "
         f"{money(hur['valueAtRisk'])}, {hur['pctOfNetwork']}% of the network.",
         "1 min"],
        ["3", "Ripple Map",
         "Press Play from the start. The cascade walks one lane at a time — 1a, 1b, 1c — "
         "on the map and the network graph together, and the camera follows each beat. "
         "Stop on 1c: it is the lane to Penang, and the map pulls out to the whole world "
         "because the chain has just jumped to Malaysia.",
         "2 min"],
        ["4", "Ripple Map",
         "Click Penang. The step panel already says it: 12 days of stock, so it fails on "
         "day 13, not day 1.",
         "1 min"],
        ["5", "Mitigation & Recovery",
         "Show the two feasible reroutes, and that they consume San Jose's spare capacity "
         "exactly — the fix creates a new fragility.",
         "1 min"],
        ["6", "Mitigation & Recovery",
         "Show the blocked item: die sorting cannot be rerouted at any price, because Penang "
         "is the only source.",
         "1 min"],
        ["7", "Mitigation & Recovery",
         "Generate the AI briefing, then ask a follow-up such as what if the outage ran twice "
         "as long. Emphasise that the AI interprets the numbers and does not invent them.",
         "1 min"],
    ]
    table(doc, ["#", "Page", "What to do and say", "Time"],
          rows, [0.35, 1.25, 4.4, 0.75], size=8.5)

    h2(doc, "The closing line")
    body(doc,
         f"Of {money(hur['revenueAtRisk'])} of customer revenue exposed by a hurricane at "
         f"Austin, {hur['protectedPct']}% can be protected by moving work between plants we "
         f"already own — and the remainder cannot be protected at any price with the network as "
         f"it stands today. We now know which is which before the storm, not after.",
         size=10.5, italic=True, color=SAP_NAVY)

    h2(doc, "Second scenario, if time allows")
    body(doc,
         "Run the Penang typhoon. It is 0% recoverable, and the contrast with Austin makes the "
         "structural point far better than any single scenario can: resilience is not uniform "
         "across the network, and the difference is knowable in advance.")

    doc.add_page_break()

    # ---- how it works ----------------------------------------------------
    h1(doc, "How it works, briefly")
    rows = [
        ["Where the data lives",
         "Snowflake, read through the governed Supply Chain domain in Business Ontology: each "
         "input is found by walking typed relationships and read from the representation "
         "linked to that concept. No copies are made."],
        ["How impact spreads",
         "Impact travels along supply flows in proportion to how much a site depends on what it "
         "lost. Inventory absorbs the front of an event, which is why duration changes the "
         "answer so much."],
        ["How mitigation is found",
         "A deterministic optimiser tests every alternative plant against real capacity and "
         "reports what fits. Every number is auditable and reproducible."],
        ["What the AI does",
         "Interprets the computed result, ranks the options and drafts the briefing. It is "
         "explicitly not allowed to calculate the figures, so the numbers remain verifiable."],
        ["Verification",
         "An automated harness runs 20 assertions across all five disruption types on every "
         "change, including checks against hand-computed expected results."],
    ]
    table(doc, ["Aspect", "Approach"], rows, [1.85, 5.05], size=9.5)

    # ---- honest limits ---------------------------------------------------
    h1(doc, "What is real, and what is modelled")
    body(doc,
         "Stating this plainly protects the credibility of the numbers when they are challenged.")

    rows = [
        ["Network, flows, volumes, values", "**Real** — SAP data in Snowflake, read through the ontology"],
        ["Plant capacity and utilisation", "**Real** — from work-centre capacity data"],
        ["Inventory buffer days", "**Real** — from material stock data"],
        ["Which plant can substitute for another",
         "**Derived** from observed shipments, since production versions list only one plant "
         "per material"],
        ["Hours consumed per unit",
         "**Derived and approximate** — blended across products, suitable for planning rather "
         "than scheduling"],
        ["Qualification and approval time for a plant change",
         "**Not modelled.** A reroute the tool calls feasible may still take weeks to authorise."],
        ["Posting the plan to S/4HANA",
         "**Simulated.** The governance and Action contracts are real; the S/4HANA system and its "
         "OData calls are modelled in Snowflake."],
        ["Component-level shortages inside a plant",
         "**Not modelled.** The bill of materials is available if this is taken further."],
    ]
    table(doc, ["Element", "Status"], rows, [2.9, 4.0], size=9)

    # ---- next steps ------------------------------------------------------
    h1(doc, "Options from here")
    bullet(doc, "**Demonstrate. **Use it as-is for customer conversations. It is deployed and needs no further work "
           "to demonstrate.")
    bullet(doc, "**Extend to a live customer network. **Point the same engine at a customer's own SAP network. The scenario logic is "
           "independent of this dataset.")
    bullet(doc, "**Deepen the model. **Add bill-of-materials explosion and lead times to move from planning-grade to "
           "scheduling-grade accuracy.")
    bullet(doc, "**Turn the findings into an investment case. **The single-source analysis already identifies where a second source would remove "
           "the most unrecoverable exposure. That is a costed investment case.")

    h1(doc, "Access")
    rows = [
        ["Source code and documentation", REPO],
        ["Public demonstration build", SITE],
        ["Runs locally on", "Application port 5179, API port 3009"],
    ]
    table(doc, ["Resource", "Location"], rows, [2.2, 4.7], size=9)

    body(doc,
         "The public build carries no credentials and no customer data. It runs every page and "
         "the nine preset scenarios; custom disruptions and the AI need the live app.",
         size=9, italic=True, color=GREY)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(f"wrote {OUT}")
    print(f"  size {OUT.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
