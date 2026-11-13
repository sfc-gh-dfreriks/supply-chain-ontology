#!/usr/bin/env python3
"""Build SAP_Supply_Chain_Ontology_Demo.pptx — the customer-facing demo deck.

Follows the shape of SAP_Finance_360_Demo.pptx so the two read as a set:
title, overview, challenge, solution, by-the-numbers, demo flow, a walkthrough
section with one slide per act, a technical architecture section, deployment
options, and a close. Sixteen slides on the shared Snowflake template, checked
by the shared deck verifier.

Figures come from tools/facts.py (exported ontology, network, thread and baked
scenarios), so the deck cannot drift from what the app reports.

    python3 tools/build_demo_deck.py
"""
from __future__ import annotations

import json
import pathlib
import sys

from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_AUTO_SIZE, PP_ALIGN
from pptx.util import Inches, Pt

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from pptx_kit import (  # noqa: E402
    BODY_GREY, DK1, DK2, LIGHT_BG, SF_BLUE, TEAL, VIOLET, WHITE,
    add_shape_text, new_presentation, set_ph, verify_deck, verify_slide,
)
from pptx.dml.color import RGBColor  # noqa: E402
import facts  # noqa: E402
from facts import money  # noqa: E402

RED = RGBColor(0xA2, 0x00, 0x00)

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path.home() / "Documents" / "SAP" / "SAP_Supply_Chain_Ontology_Demo.pptx"

TOP, BOTTOM, LEFT, RIGHT = 1.32, 5.08, 0.40, 9.50
FULLW = RIGHT - LEFT

CONTACT = "dave.freriks@snowflake.com"
PUBLIC_URL = "sfc-gh-dfreriks.github.io/supply-chain-ontology"


def load():
    """facts, network JSON, and the hurricane preset (figures for the walkthrough)."""
    X = facts.build()
    net = json.loads((REPO / "data" / "sc_network.json").read_text())
    hur = next(x for x in facts.scenarios() if x["id"] == "hurricane-austin")
    return X, net, hur


# ----------------------------------------------------------------- helpers


def content(prs, title, subtitle):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    set_ph(s, 0, title)
    set_ph(s, 1, subtitle)
    return s


def section(prs, kicker, title, lines):
    """Divider slide, mirroring the Finance deck's section breaks."""
    s = prs.slides.add_slide(prs.slide_layouts[0])
    set_ph(s, 0, title)
    set_ph(s, 1, kicker)
    y = TOP + 0.15
    for ln in lines:
        add_shape_text(s, MSO_SHAPE.RECTANGLE, LEFT, y, 0.055, 0.30, "", SF_BLUE, DK1)
        stack(s, LEFT + 0.26, y + 0.02, FULLW - 0.4, 0.28, [(ln, 13, False, DK1, 0)])
        y += 0.46
    return s


def box(slide, x, y, w, h, fill=LIGHT_BG, accent=None):
    add_shape_text(slide, MSO_SHAPE.RECTANGLE, x, y, w, h, "", fill, DK1)
    if accent is not None:
        add_shape_text(slide, MSO_SHAPE.RECTANGLE, x, y, 0.05, h, "", accent, DK1)


def stack(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, spacing=1.06):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(runs):
        body, size, bold, colour = item[:4]
        after = item[4] if len(item) > 4 else 5
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(after)
        r = p.add_run()
        r.text = body
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = colour
        r.font.name = "Arial"
    return tb


def card(slide, x, y, w, h, kicker, runs, accent=DK2, fill=LIGHT_BG):
    box(slide, x, y, w, h, fill, accent)
    head = [(kicker.upper(), 8.5, True, DK2, 7)] if kicker else []
    stack(slide, x + 0.24, y + 0.16, w - 0.42, h - 0.30, head + list(runs))


def banner(slide, y, runs, fill=DK2, h=0.62, x=LEFT, w=FULLW):
    add_shape_text(slide, MSO_SHAPE.RECTANGLE, x, y, w, h, "", fill, WHITE)
    stack(slide, x + 0.30, y + 0.11, w - 0.60, h - 0.22, runs)


def stat(slide, x, y, w, h, value, label, detail=None, accent=DK2):
    box(slide, x, y, w, h, LIGHT_BG, accent)
    runs = [(value, 26, True, DK2, 3), (label.upper(), 8.5, True, BODY_GREY, 4)]
    if detail:
        runs.append((detail, 9.5, False, DK1, 0))
    stack(slide, x + 0.24, y + 0.15, w - 0.44, h - 0.28, runs)


def note(slide, text, y=4.88):
    stack(slide, LEFT, y, FULLW, 0.19, [(text, 8, False, BODY_GREY, 0)])


def grid(slide, rows, y0=TOP, rh=0.50, widths=(4.55, 4.15), size=10.5):
    """Two-column label/value rows."""
    y = y0
    for i, (a, b) in enumerate(rows):
        box(slide, LEFT, y, FULLW, rh, LIGHT_BG if i % 2 == 0 else WHITE, None)
        stack(slide, LEFT + 0.24, y + 0.13, widths[0], rh - 0.26, [(a, size, True, DK1, 0)])
        stack(slide, LEFT + 0.30 + widths[0], y + 0.13, widths[1], rh - 0.26,
              [(b, size, False, BODY_GREY, 0)])
        y += rh + 0.06
    return y


# ------------------------------------------------------------------ slides


def s01_title(prs, f):
    s = prs.slides.add_slide(prs.slide_layouts[13])
    set_ph(s, 3, "SUPPLY CHAIN ONTOLOGY")
    set_ph(s, 0, "When a plant goes offline, what else stops?")
    set_ph(s, 2, f"Demo deck · {CONTACT}")
    return s


def s02_overview(prs, X, net):
    t = net["totals"]
    s = content(prs, "Apex Manufacturing", "A global manufacturer, modelled from SAP data in place")
    w = (FULLW - 0.3) / 4
    for i, (v, lab, det) in enumerate([
        (f"{t['plants']}", "plants", "US, EU and APAC"),
        (f"{t['suppliers']}", "suppliers", "inbound material"),
        (f"{t['customers']}", "customers", "outbound revenue"),
        (f"{t['flows']}", "material flows", f"${t['monthly_value']/1e6:,.2f}M a month"),
    ]):
        stat(s, LEFT + i * (w + 0.10), TOP, w, 1.05, v, lab, det,
             accent=[SF_BLUE, TEAL, VIOLET, DK2][i])
    card(s, LEFT, TOP + 1.25, FULLW, 1.25, "the network in one sentence", [
        (f"{t['nodes']} nodes joined by {t['flows']} recurring flows, carrying "
         f"${t['monthly_value']/1e6:,.2f}M of value every month — with real "
         f"work-centre capacity and real inventory buffers attached to each plant, "
         f"which is what makes a disruption answer defensible rather than indicative.",
         12, False, DK1, 0)], accent=SF_BLUE)
    banner(s, TOP + 2.70, [
        (f"{len(t['single_source_categories'])} of the material categories are made at "
         f"exactly one plant. Those are the exposures planning cannot close.",
         12, True, WHITE, 0)], h=0.56)
    return s


def s03_challenge(prs):
    s = content(prs, "The challenge: the second hop", "Every resilience plan breaks in the same place")
    card(s, LEFT, TOP, 4.4, 1.55, "what a spreadsheet can do", [
        ("Name the customers served by the site that went down. One hop, one lookup — "
         "most planners can do this in an afternoon.", 12, False, DK1, 0)], accent=TEAL)
    card(s, LEFT + 4.7, TOP, 4.4, 1.55, "what it cannot", [
        ("Find the plant that stops because the plant that stopped was feeding it. "
         "That needs the lane, the dependency share, and the buffer at the receiving "
         "site.", 12, False, DK1, 0)], accent=RED)
    grid(s, [
        ("Then redo it for every site", "five plants, each with different downstream dependents"),
        ("And every duration", "a 10-day outage and a 60-day outage are different questions"),
        ("And every partial loss", "a site at 60% capacity is not a site offline"),
    ], y0=TOP + 1.75, rh=0.46)
    banner(s, 4.28, [
        ("So the exercise takes days, gets done once a year, and is stale before it is "
         "finished.", 12, True, WHITE, 0)], h=0.52)
    return s


def s04_solution(prs, X):
    s = content(prs, "Govern relationships once, read them everywhere",
                "The app is built on Snowflake Business Ontology")
    card(s, LEFT, TOP, 4.4, 1.85, "hard-coded joins", [
        ("Every report rediscovers how a Supplier reaches a Customer from column names. "
         "The next question nobody anticipated means rediscovering it again.",
         12, False, DK1, 0)], accent=BODY_GREY)
    card(s, LEFT + 4.7, TOP, 4.4, 1.85, "a governed ontology", [
        (f"A steward declares that Supplier supplies Plant and Plant ships to Customer, "
         f"and links each concept to the Snowflake object holding its data. The app walks "
         f"those {X['relationships']} relationships and names no table.", 12, False, DK1, 0)],
        accent=SF_BLUE)
    banner(s, TOP + 2.05, [
        ("Change a relationship or a representation in Snowflake and the next refresh "
         "reads from the new place. No code change, no data copied.", 12, True, WHITE, 0)],
        h=0.56)
    note(s, "Walk the relationship, read the representation: the design decision the whole demo rests on.")
    return s


def s05_numbers(prs, X, hur):
    rt = X["rel_types"]
    s = content(prs, "Supply Chain Ontology by the numbers",
                "Read from the platform, not from a previous deck")
    w = (FULLW - 0.3) / 4
    row1 = [
        (f"{X['concepts']}", "governed concepts", f"{X['entities']} entities · {X['terms']} term", SF_BLUE),
        (f"{X['relationships']}", "relationships", f"{rt.get('IS_A', 0)} IS_A · {rt.get('CUSTOM', 0)} custom", TEAL),
        (f"{X['representations']}", "representations", "concept → Snowflake object", VIOLET),
        (f"{X['lots']}", "component lots", f"{X['deviating_lots']} deviating · {X['systems']} systems", DK2),
    ]
    for i, (v, lab, det, ac) in enumerate(row1):
        stat(s, LEFT + i * (w + 0.10), TOP, w, 1.02, v, lab, det, accent=ac)
    row2 = [
        (money(X["monthly_value"]), "monthly flow value", f"across {X['flows']} flows", SF_BLUE),
        (money(hur["valueAtRisk"]), "exposed by one scenario", f"{hur['pctOfNetwork']}% of the network", RED),
        (f"{hur['protectedPct']}%", "protected by rerouting", "inside real capacity", TEAL),
        (f"{len(X['single_source'])}", "sole-source categories", "structural exposure", RED),
    ]
    for i, (v, lab, det, ac) in enumerate(row2):
        stat(s, LEFT + i * (w + 0.10), TOP + 1.20, w, 1.02, v, lab, det, accent=ac)
    banner(s, TOP + 2.42, [
        (f"One governed domain, {len(X['pages'])} pages, three exporters that walk it, and a "
         f"reconcile step that fails the refresh if the app drifts from the ontology.",
         11.5, True, WHITE, 0)], h=0.54)
    return s


def s06_flow(prs):
    s = content(prs, "Demo flow", "About ten minutes, ending on a decision with a number attached")
    grid(s, [
        ("1 · Scenario Studio", "open on the network, then run the Austin hurricane"),
        ("2 · Ripple Map", "watch the cascade walk one lane at a time"),
        ("3 · The second hop", "Penang stops too — the part no spreadsheet catches"),
        ("4 · Mitigation", "two reroutes that fit inside real capacity"),
        ("5 · What cannot be saved", "die sorting has no alternative source, at any price"),
        ("6 · Ontology and Digital Thread", "every input read through governed concepts; trace a bad lot"),
    ], y0=TOP, rh=0.52)
    note(s, "If time allows, run the Penang typhoon second: 0% recoverable, and the contrast makes the structural point.")
    return s


def s07_walkthrough_section(prs):
    return section(
        prs, "LIVE DEMO WALKTHROUGH", "Six acts, one scenario",
        ["Scenario Studio — build the disruption",
         "Ripple Map — the cascade, and the second hop",
         "Mitigation & Recovery — the plan, played one decision at a time",
         "Ontology — the governed domain every page reads through",
         "Digital Thread — which customers did this lot reach?",
         "Ask Cortex — an AI reading of the view, citing the definitions"],
    )


def s08_scenario(prs, net):
    s = content(prs, "Scenario Studio", "Five event types, and a network with real capacity behind it")
    grid(s, [
        ("Site outage", "a plant offline, fully or partially"),
        ("Supplier failure", "inbound material stops"),
        ("Lane closure", "a route between two nodes is cut"),
        ("Demand spike", "a customer's requirement jumps"),
        ("Partial capacity loss", "a site degraded rather than down"),
    ], y0=TOP, rh=0.48)
    card(s, LEFT, TOP + 2.75, FULLW, 0.95, "the run we will use", [
        (f"A hurricane closes the Austin fab for 60 days. Austin holds 42 days of "
         f"stock, so the downstream effect is deferred — not absent. Inventory timing "
         f"is modelled, not assumed away.", 12, False, DK1, 0)], accent=SF_BLUE)
    note(s, "Nine preset scenarios ship, spanning fully recoverable to entirely unrecoverable.")
    return s


def s09_ripple(prs, hur):
    s = content(prs, "Ripple Map — and the hop that matters",
                "Geography and topology, one lane at a time")
    w = (FULLW - 0.2) / 3
    for i, (v, lab, det, ac) in enumerate([
        ("$13.80M", "hop 1 — direct loss", "two customers lose supply", RED),
        ("$1.29M", "hop 2 — second order", "Penang stops on 12 days of stock", RED),
        (money(hur["valueAtRisk"]), "total exposure", f"{hur['pctOfNetwork']}% of monthly value", DK2),
    ]):
        stat(s, LEFT + i * (w + 0.10), TOP, w, 1.05, v, lab, det, accent=ac)
    card(s, LEFT, TOP + 1.25, FULLW, 1.30, "why the second hop is the whole argument", [
        ("Austin also ships test fixtures to Penang. Penang runs on 12 days of stock, "
         "so when Austin stops, Penang stops too — and nobody finds that number by "
         "hand in time to act on it. Each beat carries the arithmetic behind it on "
         "demand, which is what makes the total defensible when challenged.",
         12, False, DK1, 0)], accent=RED)
    banner(s, TOP + 2.75, [
        ("Selection is synced across both panels, and the camera follows each beat.",
         11.5, True, WHITE, 0)], h=0.52)
    return s


def s10_mitigation(prs, hur):
    s = content(prs, "Mitigation & Recovery — a plan, not a percentage",
                "Tested against real work-centre capacity")
    grid(s, [
        ("Fix 1 · GlobalFoundries moves to San Jose", "+$8.40M protected · free hours 282 → 183.7"),
        ("Fix 2 · Micron moves to San Jose", "+$5.40M protected · free hours 183.7 → 36.2"),
        ("Blocked · die sorting, two customers", "$1.29M unrecoverable — Penang is the only source"),
    ], y0=TOP, rh=0.54)
    card(s, LEFT, TOP + 1.85, FULLW, 1.15, "the finding worth taking to a planning conversation", [
        ("The two reroutes consume San Jose's spare capacity exactly. It ends at 98.6% "
         "utilised with zero spare units — so the plan works, and it leaves no room "
         "for a second event. Saying that out loud is the credibility of the whole "
         "exercise.", 12, False, DK1, 0)], accent=RED)
    banner(s, 4.30, [
        (f"{hur['protectedPct']}% protected · {round(100 - hur['protectedPct'], 1)}% structural. The AI interprets the computed result; it "
         "does not produce it.", 12, True, WHITE, 0)], h=0.52)
    return s


def s11_ontology(prs, X):
    s = content(prs, "Ontology — the part that is not a dashboard",
                "The governed Supply Chain domain, as the app reads it")
    card(s, LEFT, TOP, 4.4, 1.75, "each concept", [
        ("A definition, synonyms, typed relationships, change history and a link to "
         "Snowsight — and its representations: the Snowflake objects a steward linked "
         "as the place its data lives.", 12, False, DK1, 0)], accent=SF_BLUE)
    card(s, LEFT + 4.7, TOP, 4.4, 1.75, "what the app reads through it", [
        ("Suppliers, plants and customers are the endpoints of supplies and ships to. "
         "Flows are the IS_A kinds of what Material Category classifies. The page lists "
         "every input with the walk that found it.", 12, False, DK1, 0)], accent=TEAL)
    grid(s, [
        ("Not in the ontology, so in the engine's code",
         "transfer as an edge, cardinality, substitution rule, buffer timing"),
        ("Parity-gated", "all nine presets identical to the table-driven version"),
    ], y0=TOP + 1.95, rh=0.46)
    note(s, f"Domain '{X['domain']}' · {X['concepts']} concepts · {X['relationships']} relationships · {X['representations']} representations")
    return s


def s12_thread(prs, X):
    s = content(prs, "Digital Thread and Ask Cortex", "Traceability by walking the same relationships")
    grid(s, [
        ("System Serial has part Component Lot", f"{X['systems']} built systems · {X['lots']} lots"),
        ("shipped on Sales Order, placed by Customer", f"{X['orders']} orders · {X['customers']} customers"),
        ("Equipment installed at Plant", f"{X['tools']} tools with health and failure risk"),
    ], y0=TOP, rh=0.52)
    card(s, LEFT, TOP + 1.80, FULLW, 1.20, "the question to ask live", [
        (f"\"Which customers did this bad lot reach?\" — {X['deviating_lots']} lots carry a "
         "deviation. Pick one and the thread walks lot to system to order to customer. "
         "Ask Cortex then reads the view on screen with AI_COMPLETE, citing the governed "
         "definitions.", 12, False, DK1, 0)], accent=SF_BLUE)
    banner(s, 4.30, [
        ("The AI interprets what the app computed; it never calculates the figures.",
         11.5, True, WHITE, 0)], h=0.52)
    return s


def s13_arch_section(prs):
    return section(
        prs, "TECHNICAL ARCHITECTURE", "Ontology → walk → export → app",
        ["SAP data already in Snowflake, nothing copied",
         "One governed Business Ontology domain",
         "Three exporters that find every input by walking it",
         "One refresh command that reconciles against the ontology"],
    )


def s14_dataflow(prs, net):
    s = content(prs, "Technical data flow", "Every input found by walking the domain")
    lin, walk = net["lineage"], net["lineage"]["walk"]
    rows = [
        ("1", "Network", walk["network"], ", ".join(v.split(".")[-1] for v in lin["nodes"].values())),
        ("2", "Flows", walk["flows"], ", ".join(v.split(".")[-1] for v in lin["flows"].values())),
        ("3", "Substitution", "Plant produces Material Category", "V_PRODUCES"),
        ("4", "Economics", walk["economics"], "DT_ORDER_FULFILLMENT"),
        ("5", "Thread", "System Serial has part Component Lot", "the Component Lot blast-radius view"),
    ]
    y = TOP
    for n, name, how, rep_ in rows:
        add_shape_text(s, MSO_SHAPE.RECTANGLE, LEFT, y, 0.62, 0.50, n, SF_BLUE, WHITE, 11, True)
        box(s, LEFT + 0.68, y, FULLW - 0.68, 0.50, LIGHT_BG, None)
        stack(s, LEFT + 0.88, y + 0.06, FULLW - 1.1, 0.40, [
            (f"{name} — {how}", 10.5, True, DK1, 1),
            (rep_, 9, False, BODY_GREY, 0)])
        y += 0.58
    note(s, "npm run refresh: export, bake, then re-walk and fail on any mismatch.")
    return s


def s16_deployment(prs):
    s = content(prs, "Deployment options", "Three routes, depending on who is in the room")
    grid(s, [
        ("Public web build", "credential-free, nothing to install — nine presets, AI disabled"),
        ("Local application", "all seven pages, any disruption, Ask Cortex and the AI briefing"),
        ("Snowsight", "the governed domain itself, under Business Ontology"),
    ], y0=TOP, rh=0.54)
    card(s, LEFT, TOP + 1.85, FULLW, 1.15, "what is real, and what is modelled", [
        ("Network, flows, values, plant capacity and inventory buffers are real SAP "
         "data; digital-thread instances are demo enrichment. Substitutability is derived from observed shipments, and hours per "
         "unit is blended across products — both planning-grade. Qualification time "
         "for a plant change and component-level shortages are not modelled at all.",
         11.5, False, DK1, 0)], accent=RED)
    note(s, f"Public build: {PUBLIC_URL} · local: application 5179, API 3009")
    return s


def s17_close(prs, hur):
    s = prs.slides.add_slide(prs.slide_layouts[13])
    set_ph(s, 3, "THANK YOU")
    set_ph(s, 0, f"Of {money(hur['revenueAtRisk'])} exposed, {hur['protectedPct']}% can be protected")
    # The placeholder takes ~41 characters, so the public build link stays on the
    # deployment slide; a bare address reads as a terse bullet, hence the lead-in.
    set_ph(s, 2, f"Questions — {CONTACT}")
    return s


def main():
    X, net, hur = load()
    prs = new_presentation()

    slides = [
        s01_title(prs, net),
        s02_overview(prs, X, net),
        s03_challenge(prs),
        s04_solution(prs, X),
        s05_numbers(prs, X, hur),
        s06_flow(prs),
        s07_walkthrough_section(prs),
        s08_scenario(prs, net),
        s09_ripple(prs, hur),
        s10_mitigation(prs, hur),
        s11_ontology(prs, X),
        s12_thread(prs, X),
        s13_arch_section(prs),
        s14_dataflow(prs, net),
        s16_deployment(prs),
        s17_close(prs, hur),
    ]

    issues = 0
    for n, s in enumerate(slides, 1):
        found = verify_slide(s, prs, n)
        for msg in found:
            print(f"  slide {n}: {msg}")
        issues += len(found)
    issues += len(verify_deck(prs))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    print(f"\nwrote {OUT}  ({len(prs.slides)} slides, {issues} verifier issue(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
