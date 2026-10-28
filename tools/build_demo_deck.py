#!/usr/bin/env python3
"""Build SAP_Supply_Chain_Ontology_Demo.pptx — the customer-facing demo deck.

Follows the shape of SAP_Finance_360_Demo.pptx so the two read as a set:
title, overview, challenge, solution, by-the-numbers, demo flow, a walkthrough
section with one slide per act, a technical architecture section, deployment
options, and a close. Seventeen slides on the shared Snowflake template, checked
by the shared deck verifier.

Figures come from data/*.json in this repo, exported from the running application,
so the deck cannot drift from what the app reports.

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

RED = RGBColor(0xA2, 0x00, 0x00)

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path.home() / "Documents" / "SAP" / "SAP_Supply_Chain_Ontology_Demo.pptx"

TOP, BOTTOM, LEFT, RIGHT = 1.32, 5.08, 0.40, 9.50
FULLW = RIGHT - LEFT

CONTACT = "dave.freriks@snowflake.com"
PUBLIC_URL = "sfc-gh-dfreriks.github.io/supply-chain-ontology"


def load():
    d = lambda n: json.loads((REPO / "data" / n).read_text())  # noqa: E731
    return d("sc_ontology_schema.json"), d("sc_network.json"), d("sc_ontology.json")


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
    set_ph(s, 3, "SAP BDC SUPPLY CHAIN ONTOLOGY")
    set_ph(s, 0, "When a plant goes offline, what else stops?")
    set_ph(s, 2, f"Demo deck · {CONTACT}")
    return s


def s02_overview(prs, schema, net, cat):
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


def s04_solution(prs, schema):
    c = schema["counts"]
    s = content(prs, "Model the kinds of thing, not just the rows",
                "An ontology answers questions a star schema cannot phrase")
    card(s, LEFT, TOP, 4.4, 1.85, "a dimensional model", [
        ("Knows Suppliers and Customers as separate tables. \"Which parties are "
         "affected?\" has to be written as a union, by hand, for every question that "
         "spans both.", 12, False, DK1, 0)], accent=BODY_GREY)
    card(s, LEFT + 4.7, TOP, 4.4, 1.85, "an ontology", [
        (f"Knows that Supplier and Customer are both Party. One query returns all of "
         f"them together — because {c['abstract']} of the {c['classes']} classes are "
         f"abstract, and that is what they are for.", 12, False, DK1, 0)], accent=SF_BLUE)
    banner(s, TOP + 2.05, [
        ("Zero copy throughout: SAP BDC shares the data into Snowflake, and every "
         "layer above it is Snowflake-native. Nothing is extracted.", 12, True, WHITE, 0)],
        h=0.56)
    note(s, "The abstract layer is the design decision the whole demo rests on.")
    return s


def s05_numbers(prs, schema, net, cat):
    c, t = schema["counts"], net["totals"]
    s = content(prs, "Supply Chain Ontology by the numbers",
                "Read from the platform, not from a previous deck")
    w = (FULLW - 0.3) / 4
    row1 = [
        (f"{c['classes']}", "ontology classes", f"{c['abstract']} abstract", SF_BLUE),
        (f"{c['relations']}", "relations", f"{c['relations_inferred']} inferred by rule", TEAL),
        (f"{c['instances']:,}", "instances", "in the knowledge graph", VIOLET),
        (f"{len(cat['products'])}", "SAP BDC products", f"{len(cat['entities'])} CDS entities", DK2),
    ]
    for i, (v, lab, det, ac) in enumerate(row1):
        stat(s, LEFT + i * (w + 0.10), TOP, w, 1.02, v, lab, det, accent=ac)
    row2 = [
        (f"${t['monthly_value']/1e6:,.2f}M", "monthly flow value", f"across {t['flows']} flows", SF_BLUE),
        ("$16.05M", "exposed by one scenario", "28.3% of the network", RED),
        ("91.4%", "protected by rerouting", "inside real capacity", TEAL),
        (f"{len(t['single_source_categories'])}", "sole-source categories", "structural exposure", RED),
    ]
    for i, (v, lab, det, ac) in enumerate(row2):
        stat(s, LEFT + i * (w + 0.10), TOP + 1.20, w, 1.02, v, lab, det, accent=ac)
    banner(s, TOP + 2.42, [
        ("Five layers in Snowflake: graph storage, ontology metadata, generated "
         "abstract views, three semantic views, and an agent that routes to the right "
         "one.", 11.5, True, WHITE, 0)], h=0.54)
    return s


def s06_flow(prs):
    s = content(prs, "Demo flow", "About ten minutes, ending on a decision with a number attached")
    grid(s, [
        ("1 · Scenario Studio", "open on the network, then run the Austin hurricane"),
        ("2 · Ripple Map", "watch the cascade walk one lane at a time"),
        ("3 · The second hop", "Penang stops too — the part no spreadsheet catches"),
        ("4 · Mitigation", "two reroutes that fit inside real capacity"),
        ("5 · What cannot be saved", "die sorting has no alternative source, at any price"),
        ("6 · Ask Cortex", "the cross-type question, in plain English"),
    ], y0=TOP, rh=0.52)
    note(s, "If time allows, run the Penang typhoon second: 0% recoverable, and the contrast makes the structural point.")
    return s


def s07_walkthrough_section(prs):
    return section(
        prs, "LIVE DEMO WALKTHROUGH", "Six acts, one scenario",
        ["Scenario Studio — build the disruption",
         "Ripple Map — the cascade, and the second hop",
         "Mitigation — the plan, bounded by real capacity",
         "Optimization Map — the recovery as a sequence",
         "Ontology Model — why the model answers what a schema cannot",
         "Ask Cortex — natural language across abstract classes"],
    )


def s08_scenario(prs, net):
    t = net["totals"]
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
    note(s, "Six preset scenarios ship, spanning fully recoverable to entirely unrecoverable.")
    return s


def s09_ripple(prs):
    s = content(prs, "Ripple Map — and the hop that matters",
                "Geography and topology, one lane at a time")
    w = (FULLW - 0.2) / 3
    for i, (v, lab, det, ac) in enumerate([
        ("$13.80M", "hop 1 — direct loss", "two customers lose supply", RED),
        ("$1.29M", "hop 2 — second order", "Penang stops on 12 days of stock", RED),
        ("$16.05M", "total exposure", "28.3% of monthly value", DK2),
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


def s10_mitigation(prs):
    s = content(prs, "Mitigation — a plan, not a percentage",
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
        ("91.4% protected · 8.6% structural. The AI interprets the computed result; it "
         "does not produce it.", 12, True, WHITE, 0)], h=0.52)
    return s


def s11_ontology_model(prs, schema):
    c = schema["counts"]
    s = content(prs, "Ontology Model — the part that is not a dashboard",
                "Toggle to Concrete and the graph falls apart, on purpose")
    card(s, LEFT, TOP, 4.4, 1.75, "with the abstract layer", [
        (f"{c['classes']} classes, {c['abstract']} of them abstract. Party joins "
         f"Supplier to Customer; Facility generalises Plant; MaterialFlow covers "
         f"inbound, outbound and inter-plant.", 12, False, DK1, 0)], accent=SF_BLUE)
    card(s, LEFT + 4.7, TOP, 4.4, 1.75, "without it", [
        ("Ten disconnected classes. Nothing joins a Supplier to a Customer, so "
         "\"which parties are affected\" cannot be asked — let alone answered in one "
         "pass.", 12, False, DK1, 0)], accent=RED)
    grid(s, [
        ("Relations are labelled on screen", f"{c['relations_stored']} stored · {c['relations_inferred']} inferred · {c['relations_abstract']} abstract"),
        ("Selecting an abstract class", "shows the breakdown that proves the abstraction"),
    ], y0=TOP + 1.95, rh=0.46)
    note(s, "Instance counts sit on every node, so the model is never an empty diagram.")
    return s


def s12_ask(prs):
    s = content(prs, "Ask Cortex", "Three semantic views, and an agent that routes")
    grid(s, [
        ("Base semantic view", "concrete lookups — a named plant, a monthly value, spare capacity"),
        ("Ontology semantic view", "cross-type reasoning and class-hierarchy questions"),
        ("Metadata semantic view", "governance and provenance — how it is modelled, where it came from"),
    ], y0=TOP, rh=0.52)
    card(s, LEFT, TOP + 1.80, FULLW, 1.20, "the question to ask live", [
        ("\"Which parties are affected if the Austin plant goes offline?\" — it returns "
         "customers and suppliers together, from one query, because Party is abstract. "
         "That is the question a dimensional model cannot phrase, and the reason the "
         "ontology exists.", 12, False, DK1, 0)], accent=SF_BLUE)
    banner(s, 4.30, [
        ("Pointing a question at the wrong view returns a plausible but wrong answer, "
         "so the separation is enforced in the agent's routing.", 11.5, True, WHITE, 0)],
        h=0.52)
    note(s, "Exact object names are listed in the project guide.")
    return s


def s13_arch_section(prs):
    return section(
        prs, "TECHNICAL ARCHITECTURE", "SAP BDC → graph → ontology → semantic → agent",
        ["Zero copy in from SAP Business Data Cloud",
         "Five Snowflake-native layers above it",
         "Three semantic views, purpose-separated",
         "One agent with seven tools"],
    )


def s14_dataflow(prs, schema):
    s = content(prs, "Technical data flow", "Everything above the share is Snowflake-native")
    y = TOP
    for st in schema["stack"]:
        add_shape_text(s, MSO_SHAPE.RECTANGLE, LEFT, y, 0.62, 0.50, st["layer"],
                       SF_BLUE, WHITE, 11, True)
        box(s, LEFT + 0.68, y, FULLW - 0.68, 0.50, LIGHT_BG, None)
        stack(s, LEFT + 0.88, y + 0.06, FULLW - 1.1, 0.40, [
            (f"{st['name']} — {st['detail']}", 10.5, True, DK1, 1),
            (st["note"], 9, False, BODY_GREY, 0)])
        y += 0.58
    note(s, "SAP S/4HANA remains the source of record. No data is extracted or duplicated.")
    return s


def s15_catalog(prs, cat):
    s = content(prs, "The catalog half, and an honest caveat",
                "Metadata about what exists — which is not an ontology")
    w = (FULLW - 0.2) / 3
    for i, (v, lab, det, ac) in enumerate([
        (f"{len(cat['products'])}", "data products", "in the supply-chain slice", SF_BLUE),
        (f"{len(cat['entities'])}", "CDS entities", f"{len(cat['entity_edges'])} associations", TEAL),
        (f"{len(cat['odm_edges'])}", "products linked", "via the ODM overlay", VIOLET),
    ]):
        stat(s, LEFT + i * (w + 0.10), TOP, w, 1.02, v, lab, det, accent=ac)
    card(s, LEFT, TOP + 1.22, FULLW, 1.35, "what the graph actually looks like", [
        (f"No entity association crosses a data product boundary — all "
         f"{len(cat['entity_edges'])} stay inside their own product, so an "
         f"entity-level shortest path can never leave where it started. Cross-product "
         f"linkage lives one level up, in the ODM overlay, entirely through the "
         f"canonical object Plant. The application states this on screen rather than "
         f"implying a richer graph than exists.", 11.5, False, DK1, 0)], accent=RED)
    banner(s, TOP + 2.75, [
        ("A catalog cannot express that a Supplier and a Customer are both Parties. "
         "That is why the ontology layer is separate.", 11.5, True, WHITE, 0)], h=0.52)
    return s


def s16_deployment(prs):
    s = content(prs, "Deployment options", "Three routes, depending on who is in the room")
    grid(s, [
        ("Public web build", "credential-free, nothing to install — Ask and shortest path disabled"),
        ("Local application", "all 14 pages against live Snowflake, including Ask Cortex"),
        ("Snowflake Intelligence only", "the agent and three semantic views, no application needed"),
    ], y0=TOP, rh=0.54)
    card(s, LEFT, TOP + 1.85, FULLW, 1.15, "what is real, and what is modelled", [
        ("Network, flows, values, plant capacity and inventory buffers are real SAP "
         "data. Substitutability is derived from observed shipments, and hours per "
         "unit is blended across products — both planning-grade. Qualification time "
         "for a plant change and component-level shortages are not modelled at all.",
         11.5, False, DK1, 0)], accent=RED)
    note(s, f"Public build: {PUBLIC_URL} · local: application 5179, API 3009")
    return s


def s17_close(prs):
    s = prs.slides.add_slide(prs.slide_layouts[13])
    set_ph(s, 3, "THANK YOU")
    set_ph(s, 0, "Of $15.09M exposed, 91.4% can be protected")
    # The placeholder takes ~41 characters, so the public build link stays on the
    # deployment slide; a bare address reads as a terse bullet, hence the lead-in.
    set_ph(s, 2, f"Questions — {CONTACT}")
    return s


def main():
    schema, net, cat = load()
    prs = new_presentation()

    slides = [
        s01_title(prs, net),
        s02_overview(prs, schema, net, cat),
        s03_challenge(prs),
        s04_solution(prs, schema),
        s05_numbers(prs, schema, net, cat),
        s06_flow(prs),
        s07_walkthrough_section(prs),
        s08_scenario(prs, net),
        s09_ripple(prs),
        s10_mitigation(prs),
        s11_ontology_model(prs, schema),
        s12_ask(prs),
        s13_arch_section(prs),
        s14_dataflow(prs, schema),
        s15_catalog(prs, cat),
        s16_deployment(prs),
        s17_close(prs),
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
