# 3. Build steps

The sequence that produces the current app, in order, with what each step
verified. Anyone reproducing it should get the same numbers at the same
checkpoints.

Prerequisites: Node 20+, Python 3.10+, and read access to the Snowflake Business
Ontology domain **Supply Chain** and the `SAP_SUPPLY_CHAIN` objects its
representations point at (`server/.env`, see [execution](04-execution.md)).

---

## Step 1 — Govern the domain

The Supply Chain domain holds 21 concepts (20 entities, 1 term), 26
relationships (13 IS_A, 9 CUSTOM, 3 HAS_PART, 1 CLASSIFIES) and 25
representations. Seven representations were added for the app — Material
Category, Sales Order, Component Lot, two on Plant, two on Equipment — each
through the quality gate with 0 findings.

**Verify:** the Ontology page and Snowsight show the same counts.

---

## Step 2 — Export by walking the domain

```bash
python3 tools/export_business_ontology.py   # data/sc_business_ontology.json
python3 tools/export_ontology_network.py    # data/sc_network.json   19 nodes, 27 flows
python3 tools/export_ops_thread.py          # data/sc_ops_thread.json 419 systems, 107 lots
```

Each exporter finds its inputs by relationship and reads the representation of
the concept it reached; the resolved objects are written to a `lineage` block.

**Verify — parity:** before the switch, all nine scenario presets produced
identical totals, flows and mitigation plans to the previous table-driven
export, and the thread matched on serials, traces, lots, equipment and the
operations pulse.

---

## Step 3 — The scenario engine

```bash
npm run build-land        # client/public/land.geo.json — once only
npm run verify-scenario   # assertions across all five disruption kinds
```

Propagation, the optimizer and the visualization choices are in
[scenario modelling](07-scenario-modelling.md). Run `verify-scenario` before
trusting any figure: it caught a unit-rate mismatch and a lane closure that
silently reported zero exposure, and both looked plausible on screen.

---

## Step 4 — Bake and reconcile

```bash
npm run refresh           # exports, server build, bake, reconcile
npm run build:static
npm run preview:static    # http://localhost:8899
```

`VITE_STATIC=1` switches `api.ts` from `/api` to pre-baked JSON. The AI features
are disabled with on-screen explanations rather than left to fail.

**The filename trap:** IDs containing `::` once produced filenames with `%3A%3A`,
which the web server decodes back to `:` and never finds. Both sides now fold
unsafe characters to `-` using the identical rule. **Verify** over HTTP, not off
disk.

---

## Step 5 — Narrated beats on both maps

Add the shared step furniture and the recovery player.

```
client/src/lib/substeps.ts        enrich beats: subtitle, why, kpis[], detail[]
client/src/lib/mitsteps.ts        NEW  one beat per reroute / blocked / summary
client/src/lib/pace.ts            NEW  persisted seconds-per-step, 1.45x on heavy beats
client/src/components/StepCards.tsx  NEW  SubtitleBand, KpiCards, ExplainStep, PaceControl
client/src/pages/OptimizeMap.tsx  NEW  the recovery, beat by beat (now embedded in Mitigation & Recovery)
client/src/pages/RippleMap.tsx    wire subtitle + cards + explain; controls moved below the map
client/src/index.css              kpi-in and lane-draw keyframes
client/src/App.tsx                route + title for `optimize`
client/src/components/Sidebar.tsx nav entry; PageId gains "optimize"
```

No server or SQL change is needed — the recovery movie reads the `plan` already
returned by `POST /api/scenario/simulate`, so the baked static snapshots continue to
work unchanged.

Verify the narrative against the optimizer rather than by eye:

```bash
# cumulative protected must equal plan.totals.valueProtected,
# and residual must equal valueUnprotected
node --input-type=module -e "..."   # see docs/05-findings.md
```

---

## History — the catalog-explorer build (superseded 13 Nov 2026)

The first build sliced the SAP BDC catalog into a metadata explorer with Snowflake
views and a semantic view, then added an app-owned class model. Both were removed
when the app moved onto Business Ontology; their exporters and pages no longer
exist. The derivation of the domain from that work is recorded in
[the ontology layer](08-ontology-layer.md).
