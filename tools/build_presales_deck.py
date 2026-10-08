#!/usr/bin/env python3
"""Build the slim presales deck for the SAP Partnership Compass page.

Ten slides for a Snowflake SE to drop into their own deck: the problem, the
architecture, the scenario result, what is real, and the ask. Screenshots are
pulled from the narrated walkthrough so the slides show the actual product.

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

# name -> (video segment id, crop height in source pixels or None for full).
# Frames are taken partway into the named segment, using the timeline the video
# builder writes, so a re-recorded video with different pacing still lands on
# the right screen. The crop removes the caption band below the app.
FRAMES = {
    "start": ("02_columns", None),
    "ripple": ("16_ripple_sum", 1000),
    "fix1": ("31_fix1", None),
    "result": ("33_result", 1000),
}
TIMELINE = Path("/tmp/sc_video/timeline.json")   # written by tools/video/build.py


def frame_time(seg_id):
    segs = {s["id"]: s for s in json.loads(TIMELINE.read_text())["segments"]}
    s = segs[seg_id]
    return round(s["start"] + 0.75 * s["secs"], 2)


def grab_frames():
    SHOTS.mkdir(parents=True, exist_ok=True)
    out = {}
    stale = VIDEO.stat().st_mtime
    for name, (seg, crop) in FRAMES.items():
        path = SHOTS / f"{name}.png"
        if not path.exists() or path.stat().st_mtime < stale:
            subprocess.run(
                ["ffmpeg", "-v", "error", "-ss", str(frame_time(seg)), "-i", str(VIDEO),
                 "-frames:v", "1", str(path), "-y"],
                check=True,
            )
            if crop:
                im = Image.open(path)
                im.crop((0, 0, im.width, crop)).save(path)
        out[name] = path
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
            ("Disruption modelling on SAP Business Data Cloud data, in place", 17, False, LIGHT, 0),
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


def s02_problem(prs):
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
            "The data to answer it properly is already in SAP. It is the traversal that "
            "is missing, not the data.",
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
            ("$13.80M", 22, True, RED, 14),
            (
                "Hop 2 — Austin also ships test fixtures to Penang, which runs on "
                "12 days of stock. Penang stops too.",
                13,
                False,
                NAVY,
                6,
            ),
            ("$1.29M", 22, True, RED, 12),
            ("No one finds the second number by hand in time to act on it.", 11, True, GREY, 0),
        ],
    )
    footer(s, "Figures from the Austin hurricane scenario, 60 days, 100% outage.")


def s03_answer(prs, shots):
    s = blank(prs)
    slide_header(s, "What it does", "Runs the cascade in seconds, and shows its work")
    picture_fit(s, shots["start"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
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
    footer(s, "Ripple Map, step 1 of 7. Playback speed adjustable 1.5–20 seconds per step.")


def s04_ripple(prs, shots):
    s = blank(prs)
    slide_header(s, "The cascade", "Geography and topology, one lane at a time")
    picture_fit(s, shots["ripple"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
    kpi_column(
        s,
        [
            ("Direct loss, hop 1", "$13.80M", RED),
            ("Second-order loss, hop 2", "$1.29M", RED),
            ("Total exposure", "$16.05M", RED),
            ("Of monthly network value", "28.3%", NAVY),
        ],
    )
    footer(s, "Selection is synced across both panels; the camera follows each beat.")


def s05_mitigation(prs, shots):
    s = blank(prs)
    slide_header(s, "The response", "A plan bounded by real capacity, not a percentage")
    picture_fit(s, shots["fix1"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
    kpi_column(
        s,
        [
            ("Fix 1 — GlobalFoundries to San Jose", "+$8.40M", GREEN),
            ("San Jose free hours", "282h → 183.7h", NAVY),
            ("Fix 2 — Micron to San Jose", "+$5.40M", GREEN),
            ("Free hours remaining", "36.2h", NAVY),
        ],
    )
    footer(s, "A deterministic optimiser tests every alternative plant against real capacity. The AI interprets the result; it does not produce it.")


def s06_result(prs, shots):
    s = blank(prs)
    slide_header(s, "The result", "91.4% protected — and the 8.6% that cannot be")
    picture_fit(s, shots["result"], Inches(0.6), Inches(1.72), Inches(7.6), Inches(5.2))
    kpi_column(
        s,
        [
            ("Protected by rerouting", "$13.80M · 91.4%", GREEN),
            ("Unrecoverable at any price", "$1.29M · 8.6%", RED),
            ("San Jose utilisation", "89.1% → 98.6%", RED),
            ("Spare units left", "0", RED),
        ],
    )
    footer(s, "The plan relocates the risk rather than removing it. Saying so is the credibility of the whole exercise.")


def s07_library(prs):
    s = blank(prs)
    slide_header(s, "The library", "Six scenarios, deliberately contradictory")
    rows = [
        ("Scenario", "Duration", "At risk", "Of network", "Hops", "Recoverable"),
        ("Hurricane: Austin Fab offline", "60d", "$16.05M", "28.3%", "2", "91.4%"),
        ("Typhoon: Penang Assembly offline", "30d", "$5.85M", "10.3%", "1", "0%"),
        ("Supplier failure: Hamamatsu Photonics", "45d", "$9.08M", "16.0%", "3", "70.2%"),
        ("Partial loss: Dresden Fab at 60%", "30d", "$4.12M", "7.3%", "1", "44.7%"),
        ("Lane closed: San Jose to Penang", "40d", "$3.73M", "6.6%", "2", "0%"),
        ("Demand spike: TSMC +60%", "30d", "$8.82M", "15.6%", "1", "—"),
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
                color = RED if cell in ("0%", "44.7%") else GREEN if cell != "—" else GREY
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
                "6 of the product categories are made at exactly one plant. Those are the places where resilience "
                "has to be bought, not planned.",
                13,
                True,
                NAVY,
                0,
            ),
        ],
        spacing=1.12,
    )


def s08_architecture(prs, schema):
    s = blank(prs)
    slide_header(s, "How it works", "No copies, and the SAP semantics survive")
    y = Inches(1.95)
    for layer in schema["stack"]:
        rect(s, Inches(0.6), y, Inches(0.72), Inches(0.72), BLUE)
        text(
            s,
            Inches(0.6),
            y + Inches(0.22),
            Inches(0.72),
            Inches(0.3),
            [(layer["layer"], 13, True, WHITE, 0)],
            align=PP_ALIGN.CENTER,
        )
        rect(s, Inches(1.32), y, Inches(6.0), Inches(0.72), LIGHT)
        text(
            s,
            Inches(1.5),
            y + Inches(0.1),
            Inches(5.7),
            Inches(0.55),
            [
                (f"{layer['name']} — {layer['detail']}", 11, True, NAVY, 2),
                (layer["note"], 9.5, False, GREY, 0),
            ],
        )
        y += Inches(0.85)

    c = schema["counts"]
    text(
        s,
        Inches(7.7),
        Inches(1.95),
        Inches(5.03),
        Inches(4.4),
        [
            ("THE ABSTRACT LAYER IS THE POINT", 9, True, BLUE, 10),
            (
                f"{c['classes']} classes — {c['abstract']} abstract, {c['concrete']} concrete — and "
                f"{c['relations']} relations over {c['instances']:,} instances.",
                12,
                False,
                NAVY,
                12,
            ),
            (
                "Because Supplier and Customer are both Parties, one query answers "
                "\u201cwhich parties are affected\u201d across all 14 of them. A catalog cannot "
                "express that, which is why a catalog cannot answer it in a single pass.",
                12,
                False,
                NAVY,
                14,
            ),
            ("WHERE THE DATA STAYS", 9, True, BLUE, 10),
            (
                "Snowflake views over existing SAP data products. Nothing is copied out of "
                "SAP, no new platform is introduced, and the simulation runs in the "
                "application — only the AI narrative calls a model.",
                12,
                False,
                NAVY,
                14,
            ),
            ("VERIFICATION", 9, True, BLUE, 10),
            (
                "An automated harness runs 20 assertions across all five disruption types on "
                "every change.",
                12,
                False,
                NAVY,
                0,
            ),
        ],
    )
    footer(s, "SAP_SUPPLY_CHAIN.ONTOLOGY and SAP_BDC_ONTOLOGY.SUPPLY_CHAIN. Full inventory in 06_Setup_and_Access.")


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
        ("Network, flows, volumes, values", "Real — SAP data products in Snowflake", GREEN),
        ("Plant capacity and utilisation", "Real — work-centre capacity data", GREEN),
        ("Inventory buffer days", "Real — material stock data", GREEN),
        ("Which plant can substitute for another", "Derived from observed shipments", RGBColor(0xB4, 0x6A, 0x00)),
        ("Hours consumed per unit", "Derived, planning-grade, blended across products", RGBColor(0xB4, 0x6A, 0x00)),
        ("Qualification time for a plant change", "Not modelled", RED),
        ("Component shortages inside a plant", "Not modelled — BOM available if taken further", RED),
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
    schema = json.loads((REPO / "data" / "sc_ontology_schema.json").read_text())
    network = json.loads((REPO / "data" / "sc_network.json").read_text())
    shots = grab_frames()

    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H

    s01_title(prs, network)
    s02_problem(prs)
    s03_answer(prs, shots)
    s04_ripple(prs, shots)
    s05_mitigation(prs, shots)
    s06_result(prs, shots)
    s07_library(prs)
    s08_architecture(prs, schema)
    s09_real(prs)
    s10_ask(prs)

    out = KIT / "00_Presales_Overview.pptx"
    prs.save(out)
    print(f"wrote {out}  ({len(prs.slides.__iter__.__self__._sldIdLst)} slides)")


if __name__ == "__main__":
    main()
