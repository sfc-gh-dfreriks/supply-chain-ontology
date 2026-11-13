# 7. Scenario modelling

Disruption ripple analysis and AI-assisted mitigation, over a real geospatial
supply-chain network.

---

## The data foundation

The network is read through Snowflake Business Ontology: the domain is walked
to find suppliers, plants and customers (endpoints of **supplies** and **ships
to**), material flows (the IS_A kinds of what Material Category classifies),
capacity and inventory (Plant), substitution (Plant **produces** Material
Category) and order economics (Sales Order **fulfilled by** Plant). Each is read
from the representation linked to that concept. See
[concepts](01-concepts.md#built-on-the-ontology-not-beside-it).

| | |
|---|---|
Nodes | **19** with real lat/lon — 5 plants, 6 suppliers, 8 customers |
Flows | **27** — 12 inbound, 4 inter-plant, 11 outbound, **$56.7M/month** |
Constraints | work-center capacity, inventory days, observed substitutability |

The ontology says what these objects are and how they relate; the scenario
engine says what happens to them. What the ontology cannot express — transfer
as an edge, cardinality, the substitution rule, buffer timing — lives in the
engine's code.

---

## The network

```
 SUPPLIERS                PLANTS                    CUSTOMERS
 Hamamatsu   (JP) ──┐   San Jose HQ    (US) ──┬──▶ TSMC          (TW)
 Teledyne    (CA) ──┼──▶ Austin Fab     (US) ──┼──▶ Samsung       (KR)
 Aerotech    (US) ──┤   Dresden Fab    (DE) ──┼──▶ Intel         (US)
 TRUMPF      (DE) ──┤   Singapore Hub  (SG) ──┼──▶ GlobalFoundries(US)
 Festo       (DE) ──┤   Penang Assy    (MY) ──┼──▶ Micron        (US)
 Coherent    (US) ──┘         ▲   │            ├──▶ SK Hynix      (KR)
                              └───┘            ├──▶ Infineon      (AT)
                          inter-plant          └──▶ Texas Instr.  (US)
```

### What makes it interesting to disrupt

**Substitutability is uneven**, which is what turns mitigation into a real
decision rather than a lookup:

| Category | Made at | Reroutable |
|---|---|---|
Inspection Systems | San Jose, Dresden, Austin | yes, two alternatives |
Metrology | San Jose, Austin | yes, one alternative |
Die Sorting | Penang only | **no** |
Surface Analysis | Singapore only | **no** |
E-Beam Review | Dresden only | **no** |
Sub-assemblies / Optics / Test Fixtures | one plant each | **no** |

**Capacity is tight.** Spare units per month:

| Plant | Free hrs | Hrs/unit | Spare units |
|---|---|---|---|
San Jose | 282 | 49.2 | 5 |
Penang | 238 | 74.0 | 3 |
Austin | 259 | 87.2 | 2 |
Dresden | 62 | 61.0 | **1** |
Singapore | 115 | 121.0 | **0** |

**Inventory decides timing.** Minimum buffer days: Penang **12**, San Jose 15,
Dresden 35, Singapore 40, Austin 42. Penang breaks before Austin does.

---

## The model

Three rules, stated on screen as well as here:

1. A disrupted node loses `severity` of its throughput.
2. Impact travels along outbound flows, **scaled by dependency share** — the
   flow's share of the receiver's total inbound volume. Austin supplies 8 of the
   58 units Penang receives, so Austin going dark impairs Penang by 14%, not 100%.
3. **Inventory defers impact at the receiver.** A plant with 12 days of buffer
   absorbs the first 12 days. This is why duration is the control that changes the
   answer most.

Deliberately not modelled: multi-level BOM explosion, lead times, in-transit
stock, qualification time for a plant change. The BOM is available
(`A_BOM_ITEM`, 30 items) if this is taken further.

### The headline case

Austin Fab offline 60 days:

```
hop 0  Austin Fab                                      100% down
hop 1  GlobalFoundries  Inspection Systems   $8.4M
       Micron           Metrology            $5.4M
       Penang Assembly  Test Fixtures        $960K   → 11% impaired
                                                       (12d buffer, exposed 48d)
hop 2  TSMC             Die Sorting          $794K
       Texas Instr.     Die Sorting          $497K

$16.05M at risk = 28.3% of the monthly network
```

Mitigation, inside real limits:

```
REROUTE  Inspection Systems → San Jose   2 u/mo   98.3h of 282   $8.4M
REROUTE  Metrology          → San Jose   3 u/mo  147.5h of 184   $5.4M
                                                  ↳ last spare unit
BLOCKED  Die Sorting (TSMC)              $794K   Penang is sole source
BLOCKED  Die Sorting (TI)                $497K   Penang is sole source

$13.8M protected of $15.1M = 91.4%
San Jose 89.1% → 98.6% utilisation, 0 spare units left
```

Inspection (2) plus Metrology (3) is **exactly** San Jose's 5 spare units, and
San Jose becomes the new single point of failure. That tightness is in the data,
not contrived.

---

## Disruption types

| Kind | Models | Notes |
|---|---|---|
`weather` | Hurricane, typhoon, flood on a site | Duration vs downstream buffers |
`supplier` | A supplier fails | Hamamatsu feeds two plants, so wide but shallow |
`capacity` | Partial output loss | Severity below 1.0 |
`lane` | Port, canal or airspace closure | Both endpoints keep running |
`demand` | A customer surges | Tests headroom upward; reports shortfall, not reroutes |

---

## Mitigation optimizer

Greedy by value at risk: sort lost customer flows most-valuable first, allocate
the alternative plant with the most room. Greedy rather than exact **on purpose**
— every decision can be read off the table in one line, which matters more here
than the last few percent of optimality. The plan says it is greedy.

Three kinds of "cannot be saved" are distinguished, because each needs a
different response:

- **no alternative plant makes this category** — qualification or tooling
- **the only alternative is also disrupted** — a different scenario response
- **alternatives have no spare capacity** — overtime or displacing lower-value work

Capacity is compared **as a monthly rate**. An early version compared units
needed over 60 days against one month of spare capacity and wrongly rejected
feasible reroutes; see [findings](05-findings.md#the-rate-mismatch).

---

## AI reasoning

`AI_COMPLETE` with `claude-opus-5-5`, not a text-to-SQL tool.

A scenario is a hypothetical the engine just computed in memory — the ripple and
the reroutes are nowhere in Snowflake to query, so a text-to-SQL tool would
query the *undisrupted* network and answer the wrong question.

So the computed scenario is passed as facts and the model interprets rather than
calculates. Every figure comes from the deterministic engine; the model
contributes judgement, ranking and prose. **If the model did the arithmetic the
numbers would stop being auditable.**

Two endpoints: a four-section briefing, and a follow-up channel for what-ifs that
is told to flag inference versus simulated output.

---

## Visualization

Techniques drawn from Cambridge Intelligence, Creately, Ventagium and PuppyGraph
guidance:

| Technique | Where |
|---|---|
Geographic map with Bezier flow arcs | Ripple Map, left |
Hop-distance rings, colour by distance from the event | both views |
Edge thickness = volume, colour = severity (separate encodings) | both views |
One shared severity scale across both views | `lib/severity.ts` |
Left-to-right role tiers (supplier → plant → customer) | Ripple Map, right |
Single-point-of-failure halo | topology view |
Dashed overlay for reroutes as *new* lanes | both views |
Staged action pipeline by required response | Scenario Studio |
Bullet charts for capacity and buffer | Studio, Mitigation |
Before/after flow comparison | Mitigation |
Step animation of the cascade | Ripple Map, lettered sub-steps; auto-plays in the Guided Demo |
Camera framing per beat | Ripple Map and Mitigation & Recovery, "follow with zoom" |
Annotation pins on click targets | Guided Demo |
Burned-in subtitle per beat | both animated maps, `SubtitleBand` |
Popout KPI cards showing before → after | both animated maps, `KpiCards` |
Arithmetic on demand per beat | both animated maps, `ExplainStep` |
Replaced lane struck through beside its replacement | Mitigation & Recovery, change card |
Recovery progress bar, protected against residual | Mitigation & Recovery |
User-set seconds per step | both animated maps, `PaceControl` |

**Gauges and pie charts are avoided deliberately** — the Ventagium guidance is
explicit that radial angle encoding is read less accurately than length, and
capacity headroom must not be misread. Bullet charts everywhere instead.

The map is hand-rolled SVG over a committed 68 KB land outline. Nineteen pins and
27 arcs do not justify a tile layer or a projection library, and hand-rolling
keeps the arc geometry under control for the reroute overlay.

---

## Playing the ripple as sub-steps

A hop reveals every flow at that distance at once. That is faithful to the model
and hard to follow — three arcs light up together and the viewer cannot tell which
one causes the next hop.

The Ripple Map therefore splits each hop into lettered beats, one lane each:

```
start   Austin Fab disrupted 100% for 60 days (42-day buffer)
1a      Austin → GlobalFoundries    $8.40M   customer loss
1b      Austin → Micron             $5.40M   customer loss
1c      Austin → Penang             $960K    INTER-PLANT — bridges to hop 2
        → Penang 11% impaired, 12-day buffer, exposed 48 days
2a      Penang → TSMC               $794K    customer loss
2b      Penang → Texas Instruments  $497K    customer loss
sum     5 flows, 2 hops, $16.05M, camera pulls back
```

**Ordering inside a hop is deliberate.** Customer-facing flows come first, biggest
first, because those are the immediate revenue losses. Inter-plant flows come
**last**, because they are the bridge to the next hop — ending a hop on the flow
that causes the next one makes the cascade tell itself rather than needing
narration.

Each beat carries its own panel: what is happening, what it causes, the value for
that lane, and the running total against the scenario's total. Both views spotlight
the active lane and drop everything else back, so the two panels always agree about
what is being discussed.

### The camera

With `follow with zoom` on, the map frames the two endpoints of the active beat —
bounding box, padded, forced to the panel's aspect ratio, floored so a single node
cannot fill the screen, and clamped inside the world so it never shows void.
Everything drawn is divided by the zoom factor, so labels and node radii hold their
on-screen size instead of ballooning.

The resulting zoom sequence was not scripted; it falls out of the geography, and it
happens to narrate the story:

| Beat | Framed | Zoom |
|---|---|---|
start | Austin alone | 4.2× |
1a | Austin + GlobalFoundries | 3.0× |
1b | Austin + Micron | 3.0× |
**1c** | Austin + **Penang** | **1.0×** |
2a | Penang + TSMC | 2.6× |
2b | Penang + Texas Instruments | 1.0× |

The camera sits tight on Texas for the two US customers, then pulls all the way out
at 1c — the exact moment the chain jumps to Malaysia. The most important beat in the
scenario is the one where the view snaps to the whole world.

Beats that impair a downstream site dwell longer during playback (3.4s against
2.3s), because those carry the explanation that makes the following hop make sense.

---

## The recovery as a movie

The Ripple Map answers what breaks. The recovery movie on Mitigation & Recovery answers what to do about
it, and needs a different spine: the optimizer emits a list of decisions, so each
decision becomes one beat — the lane that died, the lane replacing it, and what the
plant picking up the work gives up.

For the Austin hurricane:

| Beat | What | Numbers |
|---|---|---|
| BEFORE | $15.09M of customer revenue exposed | nothing done yet |
| FIX 1 | GlobalFoundries: Austin -> San Jose | +$8.40M, free hours 282 -> 183.7, headroom 7.1% |
| FIX 2 | Micron: Austin -> San Jose | +$5.40M, free hours 183.7 -> 36.2, headroom 1.4% |
| BLOCKED 1 | TSMC | -$794K, no alternative plant makes this category |
| BLOCKED 2 | Texas Instruments | -$497K, same |
| RESULT | 91.4% protected | San Jose HQ 89.1% -> 98.6%, 0 spare left |

Three decisions in that design are worth recording.

**Beats follow the optimizer's own order, not value order.** The optimizer is
greedy: it spends the biggest exposure first, and the spare capacity each step
consumes is genuinely unavailable to later steps. Re-sorting the beats would
misrepresent why a later reroute failed.

**Per-step versus final state was checked, not assumed.** `hrsAvailableBefore` and
`headroomPctAfter` are computed inside that greedy loop, so they are per-decision
and safe to show as a step delta — which is why the free-hour count visibly runs
down 282 -> 183.7 -> 36.2. `capacityAfter` is the aggregate end state for a plant,
so it appears only on the summary; showing it on FIX 1 would credit FIX 1 with
FIX 2's consumption.

**The ending is the finding, not the total.** San Jose absorbs exactly its five
spare units and lands at 98.6% utilisation with zero spare. The plan works and it
relocates the network's single point of failure rather than removing it. A second
disruption at San Jose during the window would have no answer. The summary beat says
so, and the capacity card carries a `NEW WEAK POINT` badge.

The baseline reads $15.09M rather than the $16.05M on the Ripple Map, deliberately:
only customer-facing revenue is protectable. Inter-plant flows are the mechanism of
the damage, not the loss, so the optimizer scores customer lanes and the beat's
"why" explains the difference.

## Reading a beat

Both animated maps narrate the same way, through `components/StepCards.tsx`:

- a **subtitle** burned across the bottom of the map, one line, timed with the camera
- **popout KPI cards** that re-animate on every beat, showing `before -> after` where
  something changed rather than only a running total
- **"Explain this step"**, which opens the mechanism and the arithmetic —
  `100% x $8,400,000 = $8,400,000`, dependency shares, the buffer subtraction

`ExplainStep` positions itself in viewport coordinates and clamps to the window. It
first anchored to the button's left edge, which pushed the 480px panel 320px
off-screen at every width tested, because the button sits on the right of the beat
header. Measuring also lets it flip upward when there is under 240px below, and a
fixed position escapes any clipping ancestor.

Playback pace is user-set in seconds per step (1.5s to 20s), persisted across pages,
because someone talking over the animation wants it to stay slow when they move
between the two maps. The choice is a *base*: beats that carry the reasoning — a hop
that impairs a downstream plant, an exposure that cannot be rerouted, the summary —
hold 1.45x longer. Flattening that would make the explanatory beats as fleeting as
the routine ones. The bar shows the resulting total runtime (24s at the 3s default,
158s at 20s), so the pace can be chosen against the real number rather than by trial.

The transport controls and the hop rail sit **below** the map on both pages, so the
map stays in view while it is being driven.

## Running it

```bash
npm run export-network    # walk the domain into data/sc_network.json
npm run build-land        # fetch and convert the land outline (once)
npm run verify-scenario   # assertions across all 5 disruption kinds
npm run dev
```

`npm run refresh` does the export as part of the full refresh cycle.

Pages: **Scenario Studio** (build and run), **Ripple Map** (both views, synced
selection, sub-step player), **Mitigation & Recovery** (the recovery played beat
by beat, then the plan, before/after and the AI), and the **Guided Demo**, which
walks the hurricane end to end in seven annotated steps.

The Guided Demo embeds the real components with numbered pins on the click
targets. It uses live components rather than screenshots because every figure
changes when the network is re-exported.

The engine runs in-process — 19 nodes and 27 flows simulate in microseconds, so
the UI re-runs on every slider movement.

Only the AI needs credentials. Everything else works from the committed JSON.

---

## Snowflake objects

The representations the network walk reads:

```
SAP_SUPPLY_CHAIN.ONTOLOGY
  VW_ONT_SUPPLIER   VW_ONT_PLANT   VW_ONT_CUSTOMER
  VW_ONT_INBOUNDFLOW   VW_ONT_OUTBOUNDFLOW   VW_ONT_INTERPLANTFLOW
  V_PRODUCES
SAP_SUPPLY_CHAIN.ANALYTICS
  DT_ORDER_FULFILLMENT
```

`hrs_per_unit` is **derived** — used hours divided by units shipped, blended
across work centers and products. Planning-grade, and the UI says so rather than
presenting unit counts as exact.
