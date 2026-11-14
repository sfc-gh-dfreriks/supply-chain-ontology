"""Script for the narrated walkthrough video.

One entry per beat. Each carries the narration (which sets the segment's length),
the popup card copy, and the actions that put the app in the right state.

Narration is written to be spoken, not read. Contractions, short sentences, and
`[[slnc n]]` pauses where a person would draw breath. Figures are spelled out —
"sixteen million" reads correctly aloud where "$16,051,035" does not. macOS `say`
is the only synthesiser available offline, so the phrasing does the work the voice
cannot.

Actions run at the start of a segment; the page then holds for whatever narration
time remains. Beats are stepped manually rather than left to autoplay, because a
click is deterministic and autoplay would drift out of sync over three minutes.
"""

# Page routes, by sidebar label — navigation happens in-app so scenario state
# survives (a full reload would drop it).
NAV = {
    "model": "Ontology",
    "snowflake": "Snowflake Ontology Details",
    "scenario": "Scenario Studio",
    "ripple": "Ripple Map",
    "mitigation": "Mitigation & Recovery",
}

SEGMENTS = [
    # ------------------------------------------------------------ the ontology
    dict(
        id="00_ontology", page="model", actions=[("wait", 1500)],
        narration=(
            "Before we break anything, [[slnc 250]] let's look at what this whole "
            "app runs on. [[slnc 400]] This is Snowflake's own Business Ontology. "
            "A governed Supply Chain domain, with twenty-one concepts, twenty-six "
            "relationships, and twenty-five links to the Snowflake objects that "
            "hold their data. [[slnc 350]] The app doesn't keep a model of its own. "
            "It reads this one."
        ),
        popup=dict(title="Built on Snowflake Business Ontology",
                   figure="21 · 26 · 25",
                   body="Concepts, relationships and representations, governed in "
                        "Snowflake. The app keeps no model of its own."),
    ),
    dict(
        id="01_plant", page="model", actions=[("tap_node", "Plant"), ("wait", 1200)],
        narration=(
            "Take Plant. [[slnc 300]] It has a steward-approved definition, and "
            "seven relationships. A supplier supplies a plant. A plant ships to a "
            "customer. A plant produces a material category. [[slnc 400]] And it "
            "points at the exact views that hold plant capacity and stock."
        ),
        popup=dict(title="One concept, defined once",
                   figure="7 relationships",
                   body="Approved definition, business verbs like supplies and "
                        "ships to, and links to the views that hold its data."),
    ),
    dict(
        id="02_lineage", page="model",
        actions=[("scroll_to_text", "What the app reads"), ("wait", 900)],
        narration=(
            "Here's why that matters. [[slnc 300]] No page in this app names a "
            "table. [[slnc 300]] Every input is found by walking those "
            "relationships, then reading whatever the steward linked to the "
            "concept. [[slnc 400]] Point Plant at a new view in Snowflake, and the "
            "app reads it on the next refresh."
        ),
        popup=dict(title="No hard-coded tables",
                   figure="walk → read",
                   body="The network, flows, capacity and orders are all found by "
                        "walking the governed domain."),
    ),
    dict(
        id="03_snowsight", page="snowflake", actions=[("wait", 1200)],
        narration=(
            "And this is the same domain inside Snowsight. [[slnc 350]] It's where "
            "definitions are approved, where access is controlled by domain, and "
            "where every change is recorded. [[slnc 350]] Cortex agents search "
            "these same definitions, so the app and the A I agree on what a plant "
            "is."
        ),
        popup=dict(title="Governed where it lives",
                   figure="Snowsight · Horizon Catalog",
                   body="Approval, access by domain and full change history. The "
                        "same definitions ground Cortex agents."),
    ),

    # ------------------------------------------------------------ the scenario
    dict(
        id="10_network", page="scenario", actions=[],
        narration=(
            "Now let's put it to work. [[slnc 350]] What happens when a hurricane "
            "takes one of our plants offline? [[slnc 300]] This network was "
            "assembled by walking supplies and ships to over S A P data in "
            "Snowflake. Five plants, six suppliers, eight customers, and about "
            "fifty-seven million dollars of material a month."
        ),
        popup=dict(title="The network, walked from the ontology",
                   figure="$56.7M / month",
                   body="19 nodes and 27 material flows, found through the governed "
                        "relationships. Nothing here is hand-built."),
    ),
    dict(
        id="11_preset", page="scenario",
        actions=[("click_text", "Hurricane — Austin Fab offline"), ("wait", 3500)],
        narration=(
            "So. [[slnc 250]] A hurricane closes Austin for sixty days. "
            "[[slnc 400]] One click, and the answer comes back in under a second. "
            "Sixteen million dollars at risk. That's twenty-eight percent of the "
            "entire network, from a single site going dark."
        ),
        popup=dict(title="Austin goes offline", figure="$16.05M at risk",
                   body="60 days, 100% throughput lost. 28.3% of monthly network "
                        "value — computed in under a second."),
    ),
    dict(
        id="12_columns", page="scenario", actions=[],
        narration=(
            "And notice how the results are grouped. [[slnc 300]] Not by size — by "
            "what each one actually needs from you. Watch it, act on it, or pick up "
            "the phone."
        ),
        popup=dict(title="Sorted by response, not by size",
                   figure="watch · act · escalate",
                   body="A ranked list of dollar amounts tells you nothing about "
                        "what to do next. This tells you who needs to move."),
    ),

    # ------------------------------------------------------------ ripple
    dict(
        id="20_ripple_intro", page="ripple",
        actions=[("set_pace", "5"), ("click_chip", "start")],
        narration=(
            "Now let's watch it spread. [[slnc 400]] The Ripple Map plays the "
            "cascade one lane at a time. [[slnc 350]] Austin holds forty-two days "
            "of stock, so for the first six weeks, nobody downstream even notices."
        ),
        popup=dict(title="Before anything spreads", figure="42-day buffer",
                   body="Inventory defers impact. Austin's own stock shields "
                        "everyone downstream for 42 of the 60 days."),
    ),
    dict(
        id="21_hop1", page="ripple",
        actions=[("click_chip", "1a"), ("wait", 1500), ("click_chip", "1b")],
        narration=(
            "First hop. [[slnc 250]] Austin can't ship to GlobalFoundries, or to "
            "Micron. [[slnc 300]] Thirteen point eight million dollars between "
            "them. [[slnc 300]] No surprise — they're Austin's own customers."
        ),
        popup=dict(title="Hop 1 — Austin's own customers",
                   figure="$13.80M at risk",
                   body="GlobalFoundries $8.40M and Micron $5.40M. Direct losses, "
                        "easy to reason about."),
    ),
    dict(
        id="22_hop1c", page="ripple", actions=[("click_chip", "1c"), ("wait", 1200)],
        narration=(
            "But here's the one that matters. [[slnc 450]] Austin also ships test "
            "fixtures to Penang Assembly, in Malaysia. [[slnc 350]] That lane is an "
            "inter-plant flow in the ontology, so the ripple follows it, all the "
            "way overseas."
        ),
        popup=dict(title="Hop 1c — the lane that travels",
                   figure="Texas → Malaysia · $960K",
                   body="An Inter Plant Flow, a kind of Material Flow in the "
                        "ontology. Small, but it carries the problem to hop 2."),
    ),
    dict(
        id="23_hop2", page="ripple",
        actions=[("click_chip", "2a"), ("wait", 800), ("click_chip", "2b")],
        narration=(
            "So Penang starves. [[slnc 350]] It runs on twelve days of stock, then "
            "takes T S M C and Texas Instruments down with it. [[slnc 400]] Two "
            "customers with no connection to Texas at all. [[slnc 300]] That's the "
            "effect a spreadsheet never catches, and a graph always does."
        ),
        popup=dict(title="Hop 2 — two customers, no Texas link",
                   figure="11% impaired, 48 days exposed",
                   body="TSMC and Texas Instruments lose $1.29M between them. "
                        "Neither has any direct relationship with Austin."),
    ),
    dict(
        id="24_ripple_sum", page="ripple", actions=[("click_chip", "all")],
        narration=(
            "Pull back, and there's the whole shape. [[slnc 400]] Sixteen million "
            "dollars, five lanes, two hops. [[slnc 350]] Now — what can we "
            "actually do about it?"
        ),
        popup=dict(title="The full picture", figure="$16.05M · 5 flows · 2 hops",
                   body="28.3% of the network, propagated by dependency share and "
                        "deferred by real inventory."),
    ),

    # ------------------------------------------------------------ recovery
    dict(
        id="30_before", page="mitigation",
        actions=[("set_pace", "5"), ("click_chip_exact", "before")],
        narration=(
            "The recovery plan comes from the ontology too. [[slnc 350]] A plant "
            "can take over a lane only if it produces the same material category, "
            "and has spare hours. [[slnc 400]] So let's play it out, one decision "
            "at a time."
        ),
        popup=dict(title="Reroutes the ontology allows",
                   figure="Plant produces Material Category",
                   body="Only plants that make the same category, with spare "
                        "capacity, qualify. $15.09M exposed, nothing done yet."),
    ),
    dict(
        id="31_fix1", page="mitigation", actions=[("click_chip_exact", "fix 1")],
        narration=(
            "First move. [[slnc 250]] GlobalFoundries shifts from Austin to San "
            "Jose. [[slnc 300]] The old lane turns red, the new one is drawn in "
            "green. [[slnc 300]] Eight point four million protected, and San "
            "Jose's spare hours drop from two hundred and eighty-two to a hundred "
            "and eighty-four."
        ),
        popup=dict(title="Fix 1 — Austin → San Jose",
                   figure="+$8.40M · 282h → 183.7h",
                   body="Red is the lane being replaced, dashed green the new one. "
                        "Headroom at San Jose: 7.1%."),
    ),
    dict(
        id="32_fix2", page="mitigation", actions=[("click_chip_exact", "fix 2")],
        narration=(
            "Second move. [[slnc 300]] Micron also goes to San Jose. Another five "
            "point four million saved. [[slnc 350]] But the spare hours fall again, "
            "down to thirty-six. [[slnc 300]] You can watch the buffer being spent."
        ),
        popup=dict(title="Fix 2 — the buffer runs down",
                   figure="+$5.40M · 183.7h → 36.2h",
                   body="Headroom now 1.4%. Each decision consumes what the next "
                        "one could have used."),
    ),
    dict(
        id="33_result", page="mitigation", actions=[("click_chip_exact", "result")],
        narration=(
            "And here's the result. [[slnc 350]] Ninety-one percent protected. "
            "[[slnc 350]] But San Jose is now at ninety-eight point six percent "
            "utilisation, with zero spare units. [[slnc 400]] We didn't remove our "
            "single point of failure. We moved it."
        ),
        popup=dict(title="The fix relocates the risk",
                   figure="91.4% · San Jose 98.6%",
                   body="$13.8M of $15.09M defended. Zero spare units left at San "
                        "Jose: a second event would have no answer."),
    ),
    dict(
        id="34_blocked", page="mitigation", actions=[("scroll", 1100)],
        narration=(
            "And one point two nine million can't be moved at any price. "
            "[[slnc 350]] The ontology says only Penang produces die sorting. "
            "[[slnc 300]] So that's not an operations problem. It's an investment "
            "decision."
        ),
        popup=dict(title="What money cannot fix this week",
                   figure="$1.29M unrecoverable",
                   body="No other plant produces Die Sorting. A sole-source "
                        "dependency, not a capacity shortfall."),
    ),
    dict(
        id="35_close", page="mitigation", actions=[],
        narration=(
            "One event, sixteen million dollars, ninety-one percent defensible, "
            "[[slnc 300]] and a clear view of what it costs. [[slnc 400]] All of it "
            "walked from one governed ontology in Snowflake, over data that was "
            "already there."
        ),
        popup=dict(title="One governed model, end to end",
                   figure="no shadow copy",
                   body="Scenario, ripple and recovery, all walked from Snowflake "
                        "Business Ontology over SAP data in place."),
    ),
]
