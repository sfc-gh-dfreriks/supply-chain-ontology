#!/usr/bin/env python3
"""Build the slim presales deck for the SAP Partnership Compass page.

Ten slides for a Snowflake SE to drop into their own deck: the problem, the
ontology, the scenario result, what is real, and the ask. Screenshots are
captured from the running app with Playwright (http://localhost:5179, dev server
up) so the slides show the current product; they are cached in tools/.presales_shots
and reused when the app is not running. The narrated walkthrough video predates
the 13 Nov 2026 rebuild, so it is no longer used as a screenshot source.

Figures come from tools/facts.py.

    python3 tools/build_presales_deck.py
"""

import json
import subprocess
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import facts  # noqa: E402
from facts import money  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
KIT = Path.home() / "Documents" / "SAP" / "Supply_Chain_Ontology_Presales_Kit"
VIDEO = Path.home() / "Documents" / "SAP" / "Supply_Chain_Ontology_Walkthrough.mp4"
SHOTS = REPO / "tools" / ".presales_shots"   # cache, deliberately outside the kit

NAVY = RGBColor(0x1B, 0x3A, 0x57)
BLUE = RGBColor(0x29, 0xB5, 0xE8)
GREY = RGBColor(0x5A, 0x6A, 0x7A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
RED = RGBColor(0xC0, 0x28, 0x28)
GREEN = RGBColor(0x1B, 0x7F, 0x4B)
LIGHT = RGBColor(0xEE, 0xF4, 0xF8)

W, H = Inches(13.333), Inches(7.5)

PUBLIC_URL = "https://sfc-gh-dfreriks.github.io/supply-chain-ontology/"

APP = "http://localhost:5179/"
# name -> (hash route, scroll before capture). Scenario pages load the hurricane
# preset through sessionStorage, the same hook the Guided Demo uses.
SHOTS_SPEC = {
    "scenario": ("#scenario", 0),
    "ripple": ("#ripple", 0),
    "mitigation": ("#mitigation", 0),
    "plan": ("#mitigation", 1100),
    "ontology": ("#model", 0),
}
PRESET = "hurricane-austin"


def capture_shots():
    """Fresh screenshots from the running app, falling back to the cache."""
    import urllib.request
    SHOTS.mkdir(parents=True, exist_ok=True)
    out = {n: SHOTS / f"{n}.png" for n in SHOTS_SPEC}
    try:
        urllib.request.urlopen(APP, timeout=3)
    except Exception:
        missing = [n for n, pth in out.items() if not pth.exists()]
        if missing:
            raise SystemExit(f"app not running at {APP} and no cached shots for {missing}")
        print(f"  app not running; using cached shots in {SHOTS}")
        return out
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1000})
        pg.goto(APP + "#overview")
        pg.evaluate(f"sessionStorage.setItem('sc.preset', '{PRESET}')")
        for name, (route, scroll) in SHOTS_SPEC.items():
            pg.goto(APP + route)
            pg.wait_for_timeout(5000)
            if scroll:
                pg.mouse.wheel(0, scroll)
                pg.wait_for_timeout(1500)
            pg.screenshot(path=str(out[name]))
        b.close()
    return out


# ------------------------------------------------------------------ primitives


def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def rect(slide, x, y, w, h, fill):
    from pptx.enum.shapes import MSO_SHAPE

    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    s.line.fill.background()
    s.shadow.inherit = False
    return s


def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, spacing=1.0):
    """runs: list of (text, size, bold, color) or (text, size, bold, color, space_after)"""
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(runs):
        body, size, bold, color = item[:4]
        after = item[4] if len(item) > 4 else 6
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(after)
        r = p.add_run()
        r.text = body
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = "Arial"
    return tb


def slide_header(slide, kicker, title):
    rect(slide, 0, 0, W, Inches(0.09), BLUE)
    text(
        slide,
        Inches(0.6),
        Inches(0.42),
        Inches(12.1),
        Inches(1.1),
        [
            (kicker.upper(), 10, True, BLUE, 3),
            (title, 27, True, NAVY, 0),
        ],
    )


def footer(slide, note):
    text(
        slide,
        Inches(0.6),
        Inches(7.03),
        Inches(12.1),
        Inches(0.3),
        [(note, 8, False, GREY, 0)],
    )


def kpi_row(slide, items, y=Inches(5.75), h=Inches(1.1)):
    n = len(items)
    gap = Inches(0.2)
    total = W - Inches(1.2)
    cw = int((total - gap * (n - 1)) / n)
    for i, (label, value, color) in enumerate(items):
        x = Inches(0.6) + i * (cw + gap)
        rect(slide, x, y, cw, h, LIGHT)
        text(
            slide,
            x + Inches(0.18),
            y + Inches(0.15),
            cw - Inches(0.36),
            h - Inches(0.3),
            [
                (label.upper(), 8, True, GREY, 3),
                (value, 19, True, color, 0),
            ],
        )


def kpi_column(slide, items, x=Inches(8.55), y=Inches(1.8), w=Inches(4.18), h=Inches(1.15)):
    """Stacked KPI cards down the right-hand side, beside a screenshot."""
    gap = Inches(0.17)
    for i, (label, value, color) in enumerate(items):
        cy = y + i * (h + gap)
        rect(slide, x, cy, w, h, LIGHT)
        rect(slide, x, cy, Inches(0.05), h, color)
        text(
            slide,
            x + Inches(0.24),
            cy + Inches(0.2),
            w - Inches(0.44),
            h - Inches(0.4),
            [
                (label.upper(), 8.5, True, GREY, 4),
                (value, 20, True, color, 0),
            ],
        )


def picture_fit(slide, path, x, y, w, h):
    """Insert the picture scaled to fit the box, centred."""
    im = Image.open(path)
    ar = im.width / im.height
    box_ar = w / h
    if ar > box_ar:
        pw, ph = w, int(w / ar)
    else:
        ph, pw = h, int(h * ar)
    slide.shapes.add_picture(
        str(path), int(x + (w - pw) / 2), int(y + (h - ph) / 2), pw, ph
    )


def bullets(slide, x, y, w, items, size=13, gap=11):
    runs = []
    for b in items:
        runs.append(("—  " + b, size, False, NAVY, gap))
    text(slide, x, y, w, Inches(3.5), runs, spacing=1.12)


# ---------------------------------------------------------------------- slides


def s01_title(prs, net):
    s = blank(prs)
    rect(s, 0, 0, W, H, NAVY)
    rect(s, Inches(0.6), Inches(2.5), Inches(0.06), Inches(1.9), BLUE)
    text(
        s,
        Inches(0.95),
        Inches(2.45),
        Inches(11),
        Inches(2.2),
        [
            ("SAP + SNOWFLAKE  ·  PRESALES KIT", 11, True, BLUE, 12),
            ("Supply Chain Ontology", 44, True, WHITE, 8),
            ("Disruption modelling built on Snowflake Business Ontology", 17, False, LIGHT, 0),
        ],
    )
    t = net["totals"]
    text(
        s,
        Inches(0.95),
        Inches(5.5),
        Inches(11),
        Inches(1.2),
        [
            (
                f"{t['plants']} plants · {t['suppliers']} suppliers · {t['customers']} customers · "
                f"${t['monthly_value'] / 1_000_000:,.2f}M monthly network value",
                12,
                True,
                BLUE,
                6,
            ),
            (f"Live demo, no credentials required — {PUBLIC_URL}", 11, False, LIGHT, 0),
        ],
    )


def s02_problem(prs, hur, byc):
    s = blank(prs)
    slide_header(s, "The problem", "Every resilience plan breaks at the second hop")
    bullets(
        s,
        Inches(0.6),
        Inches(1.95),
        Inches(6.0),
        [
            "A site goes down. Which customers lose supply is answerable — most planners "
            "can do the first hop in a spreadsheet.",
            "The second hop is where it fails: the plant that stops because the plant "
            "that stopped was feeding it. That needs the lane, the dependency share and "
            "the inventory buffer at the receiving site.",
            "Then it has to be redone for every site, every duration and every partial "
            "outage. In practice that exercise takes days, so it is done once a year — "
            "if at all.",
            "The data to answer it properly is already in SAP. What is missing is the "
            "relationships between the objects, governed in one place.",
        ],
    )
    rect(s, Inches(7.0), Inches(1.95), Inches(5.73), Inches(3.9), LIGHT)
    text(
        s,
        Inches(7.35),
        Inches(2.25),
        Inches(5.03),
        Inches(3.3),
        [
            ("WHAT A SPREADSHEET MISSES", 9, True, BLUE, 14),
            ("Austin Fab goes offline for 60 days.", 15, True, NAVY, 10),
            ("Hop 1 — two customers lose supply directly.", 13, False, NAVY, 6),
            (money(sum(c["value"] for c in byc if c["hop"] == 1)), 22, True, RED, 14),
            (
                "Hop 2 — Austin also ships test fixtures to Penang, which runs on "
                "12 days of stock. Penang stops too.",
                13,
                False,
                NAVY,
                6,
            ),
            (money(sum(c["value"] for c in byc if c["hop"] == 2)), 22, True, RED, 12),
            ("No one finds the second number by hand in time to act on it.", 11, True, GREY, 0),
        ],
    )
    footer(s, "Figures from the Austin hurricane scenario, 60 days, 100% outage.")


def s03_answer(prs, shots):
    s = blank(prs)
    slide_header(s, "What it does", "Runs the cascade in seconds, and shows its work")
    picture_fit(s, shots["scenario"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
    text(
        s,
        Inches(8.55),
        Inches(1.85),
        Inches(4.18),
        Inches(5.0),
        [
            ("FIVE EVENT TYPES", 9, True, BLUE, 10),
            ("Site outage, partial capacity loss, supplier failure, lane closure, demand spike.", 12, False, NAVY, 16),
            ("INVENTORY DEFERS IMPACT", 9, True, BLUE, 10),
            (
                "Austin holds 42 days of stock, so downstream sites are shielded for 42 "
                "of the 60 days. The timing is modelled, not assumed away.",
                12,
                False,
                NAVY,
                16,
            ),
            ("EVERY STEP EXPLAINS ITSELF", 9, True, BLUE, 10),
            (
                "Each beat carries the arithmetic behind it on demand — which is what "
                "makes the total defensible when it is challenged.",
                12,
                False,
                NAVY,
                0,
            ),
        ],
    )
    footer(s, "Scenario Studio with the Austin hurricane preset. Screenshot from the running app.")


def s04_ripple(prs, shots, hur, byc):
    s = blank(prs)
    slide_header(s, "The cascade", "Geography and topology, one lane at a time")
    picture_fit(s, shots["ripple"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
    kpi_column(
        s,
        [
            ("Direct loss, hop 1", money(sum(c["value"] for c in byc if c["hop"] == 1)), RED),
            ("Second-order loss, hop 2", money(sum(c["value"] for c in byc if c["hop"] == 2)), RED),
            ("Total exposure", money(hur["valueAtRisk"]), RED),
            ("Of monthly network value", f"{hur['pctOfNetwork']}%", NAVY),
        ],
    )
    footer(s, "Selection is synced across both panels; the camera follows each beat.")


def s05_mitigation(prs, shots, hur):
    r1, r2 = hur["reroutes"][0], hur["reroutes"][1]
    s = blank(prs)
    slide_header(s, "The response", "A plan bounded by real capacity, not a percentage")
    picture_fit(s, shots["mitigation"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
    kpi_column(
        s,
        [
            (f"Fix 1 — {r1['customer']} to {r1['toPlant']}", f"+{money(r1['valueProtected'])}", GREEN),
            (f"{r1['toPlant']} free hours", f"{r1['hrsAvailableBefore']:g}h → {r1['hrsAvailableBefore'] - r1['hrsRequired']:.1f}h", NAVY),
            (f"Fix 2 — {r2['customer']} to {r2['toPlant']}", f"+{money(r2['valueProtected'])}", GREEN),
            ("Free hours remaining", f"{r2['hrsAvailableBefore'] - r2['hrsRequired']:.1f}h", NAVY),
        ],
    )
    footer(s, "Mitigation & Recovery plays the plan one decision per beat. The AI interprets the result; it does not produce it.")


def s06_result(prs, shots, hur):
    s = blank(prs)
    cap = hur["capacityAfter"][0]
    rest = round(100 - hur["protectedPct"], 1)
    slide_header(s, "The result", f"{hur['protectedPct']}% protected — and the {rest}% that cannot be")
    picture_fit(s, shots["plan"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
    kpi_column(
        s,
        [
            ("Protected by rerouting", f"{money(hur['protected'])} · {hur['protectedPct']}%", GREEN),
            ("Unrecoverable at any price", f"{money(hur['unprotected'])} · {rest}%", RED),
            (f"{cap['plantName']} utilisation", f"{cap['utilizationBefore']}% → {cap['utilizationAfter']}%", RED),
            ("Spare units left", str(cap["spareUnitsLeft"]), RED),
        ],
    )
    footer(s, "The plan relocates the risk rather than removing it. Saying so is the credibility of the whole exercise.")


def s07_library(prs, sc, X):
    s = blank(prs)
    sc = [x for x in sc if not x["id"].startswith("ops-")]
    slide_header(s, "The library", f"{len(sc)} core scenarios, deliberately contradictory")
    rows = [
        ("Scenario", "Duration", "At risk", "Of network", "Hops", "Recoverable"),
    ] + [
        (x["label"].replace(" — ", ": "), f"{x['days']}d", money(x["valueAtRisk"]),
         f"{x['pctOfNetwork']}%", str(x["maxHop"]),
         "—" if x["kind"] == "demand" else f"{x['protectedPct']}%")
        for x in sc
    ]
    widths = [Inches(4.6), Inches(1.2), Inches(1.5), Inches(1.7), Inches(1.0), Inches(2.13)]
    y = Inches(2.0)
    rh = Inches(0.46)
    for ri, row in enumerate(rows):
        x = Inches(0.6)
        head = ri == 0
        for ci, cell in enumerate(row):
            rect(s, x, y, widths[ci], rh, NAVY if head else (LIGHT if ri % 2 else WHITE))
            color = WHITE if head else NAVY
            if not head and ci == 5:
                color = GREY if cell == "—" else RED if float(cell[:-1]) < 50 else GREEN
            text(
                s,
                x + Inches(0.14),
                y + Inches(0.12),
                widths[ci] - Inches(0.28),
                Inches(0.3),
                [(cell, 11, head or ci == 5, color, 0)],
            )
            x += widths[ci]
        y += rh
    text(
        s,
        Inches(0.6),
        Inches(5.55),
        Inches(12.13),
        Inches(1.3),
        [
            (
                "Penang is entirely unrecoverable — it is the sole source of die sorting, so no capacity "
                "anywhere else helps. Dresden is only 44.7% recoverable despite being a partial outage, because it "
                "has the least spare capacity in the network.",
                13,
                False,
                NAVY,
                8,
            ),
            (
                f"{len(X['single_source'])} of the product categories are made at exactly one plant. Those are the places where resilience "
                "has to be bought, not planned.",
                13,
                True,
                NAVY,
                0,
            ),
        ],
        spacing=1.12,
    )


def s08_architecture(prs, X, net, shots):
    s = blank(prs)
    slide_header(s, "How it works", "Built on Snowflake Business Ontology")
    picture_fit(s, shots["ontology"], Inches(0.6), Inches(1.72), Inches(7.0), Inches(4.0))
    lin, walk = net["lineage"], net["lineage"]["walk"]
    rows = [
        ("Network", walk["network"]),
        ("Flows", "IS_A kinds of what Material Category classifies"),
        ("Economics", walk["economics"]),
        ("Thread", "System Serial has part Component Lot"),
    ]
    y = Inches(5.85)
    for name, how in rows:
        text(s, Inches(0.6), y, Inches(7.0), Inches(0.26),
             [(f"{name}: {how}", 10.5, False, NAVY, 0)])
        y += Inches(0.28)
    rt = X["rel_types"]
    text(
        s,
        Inches(7.95),
        Inches(1.85),
        Inches(4.78),
        Inches(4.9),
        [
            ("ONE GOVERNED DOMAIN", 9, True, BLUE, 10),
            (
                f"{X['concepts']} concepts, {X['relationships']} relationships "
                f"({rt.get('IS_A', 0)} IS_A, {rt.get('CUSTOM', 0)} custom, "
                f"{rt.get('HAS_PART', 0)} has-part, {rt.get('CLASSIFIES', 0)} classifies) and "
                f"{X['representations']} representations, owned by a steward in Snowsight.",
                12, False, NAVY, 14,
            ),
            ("THE APP NAMES NO TABLE", 9, True, BLUE, 10),
            (
                "Every input is found by walking the domain and read from the "
                "representation linked to the concept it reached. Change a relationship "
                "or a representation and the next refresh reads from the new place.",
                12, False, NAVY, 14,
            ),
            ("VERIFIED", 9, True, BLUE, 10),
            (
                "npm run refresh re-walks the ontology after exporting and fails on any "
                "mismatch. The switch was parity-gated on all nine presets.",
                12, False, NAVY, 0,
            ),
        ],
    )
    footer(s, "Ontology page, screenshot from the running app. Full inventory in 06_Setup_and_Access.")


def s09_real(prs):
    s = blank(prs)
    slide_header(s, "Credibility", "What is real, and what is modelled")
    text(
        s,
        Inches(0.6),
        Inches(1.75),
        Inches(12.13),
        Inches(0.4),
        [("Say this before you are asked. It is what makes the numbers survive challenge.", 13, True, GREY, 0)],
    )
    rows = [
        ("Network, flows, volumes, values", "Real — SAP data in Snowflake, read through the ontology", GREEN),
        ("Digital-thread instances", "Demo enrichment keyed to real plants and BOMs", RGBColor(0xB4, 0x6A, 0x00)),
        ("Plant capacity and utilisation", "Real — work-centre capacity data", GREEN),
        ("Inventory buffer days", "Real — material stock data", GREEN),
        ("Which plant can substitute for another", "Derived from observed shipments", RGBColor(0xB4, 0x6A, 0x00)),
        ("Hours consumed per unit", "Derived, planning-grade, blended across products", RGBColor(0xB4, 0x6A, 0x00)),
        ("Qualification time for a plant change", "Not modelled", RED),
    ]
    y = Inches(2.35)
    for i, (element, status, color) in enumerate(rows):
        rect(s, Inches(0.6), y, Inches(12.13), Inches(0.56), LIGHT if i % 2 == 0 else WHITE)
        rect(s, Inches(0.6), y, Inches(0.05), Inches(0.56), color)
        text(s, Inches(0.85), y + Inches(0.15), Inches(5.2), Inches(0.3), [(element, 12, True, NAVY, 0)])
        text(s, Inches(6.2), y + Inches(0.15), Inches(6.4), Inches(0.3), [(status, 12, False, color, 0)])
        y += Inches(0.6)
    footer(s, "The application states this on screen, and the customer-facing management summary carries the same table.")


def s10_ask(prs):
    s = blank(prs)
    rect(s, 0, 0, W, H, NAVY)
    rect(s, Inches(0.6), Inches(0.8), Inches(0.06), Inches(1.0), BLUE)
    text(
        s,
        Inches(0.95),
        Inches(0.75),
        Inches(11.5),
        Inches(1.2),
        [
            ("WHERE TO TAKE IT", 11, True, BLUE, 10),
            ("Four options, in order of effort", 32, True, WHITE, 0),
        ],
    )
    opts = [
        ("Demonstrate", "Use it as-is in customer conversations. Deployed, credential-free, no further work needed."),
        ("Extend to a customer network", "Point the same engine at their own SAP network. The scenario logic is independent of this dataset."),
        ("Deepen the model", "Add bill-of-materials explosion and lead times to move from planning-grade to scheduling-grade."),
        ("Turn findings into an investment case", "The single-source analysis already identifies where a second source removes the most unrecoverable exposure."),
    ]
    y = Inches(2.3)
    for i, (head, detail) in enumerate(opts):
        rect(s, Inches(0.95), y, Inches(11.4), Inches(0.92), RGBColor(0x24, 0x4A, 0x6B))
        text(
            s,
            Inches(1.25),
            y + Inches(0.14),
            Inches(10.8),
            Inches(0.7),
            [
                (f"{i + 1}.  {head}", 14, True, BLUE, 3),
                (detail, 11.5, False, LIGHT, 0),
            ],
        )
        y += Inches(1.02)

    text(
        s,
        Inches(0.95),
        Inches(6.55),
        Inches(11.4),
        Inches(0.7),
        [
            (f"Live demo: {PUBLIC_URL}", 12, True, WHITE, 4),
            ("Full kit on SAP Partnership Compass · start with 03_SE_Quick_Start.docx · contact Dave Freriks", 10.5, False, LIGHT, 0),
        ],
    )


def main():
    X = facts.build()
    sc = facts.scenarios()
    pf = facts.persona_facts()
    hur, byc = pf["hurricane"], pf["hurricane_by_customer"]
    hur.update(next(x for x in sc if x["id"] == "hurricane-austin"))
    network = json.loads((REPO / "data" / "sc_network.json").read_text())
    shots = capture_shots()

    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H

    s01_title(prs, network)
    s02_problem(prs, hur, byc)
    s03_answer(prs, shots)
    s04_ripple(prs, shots, hur, byc)
    s05_mitigation(prs, shots, hur)
    s06_result(prs, shots, hur)
    s07_library(prs, sc, X)
    s08_architecture(prs, X, network, shots)
    s09_real(prs)
    s10_ask(prs)

    out = KIT / "00_Presales_Overview.pptx"
    prs.save(out)
    print(f"wrote {out}  ({len(prs.slides.__iter__.__self__._sldIdLst)} slides)")


if __name__ == "__main__":
    main()
