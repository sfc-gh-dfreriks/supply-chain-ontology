# 2. Architecture

How the pieces fit, and which decisions were load-bearing.

> The data flow below covers the **SAP BDC catalog** half of the app. A second,
> independent flow serves the **ontology** — 15 classes and 11 relations in
> `SAP_SUPPLY_CHAIN.ONTOLOGY`, exported by `tools/export_ontology_schema.py` and
> served on separate `/api/ontology/*` routes. See
> [08-ontology-layer.md](08-ontology-layer.md). The two are deliberately not
> merged: a catalog says what data exists, an ontology says what kinds of thing
> exist, and collapsing them is the defect the ontology layer was added to fix.

---

## Data flow

```
SAP Business Accelerator Hub  (api.sap.com/DataProducts)
        │  CSN Interop JSON — 334 data products, 2,243 CDS entities
        ▼
sap_bdc_explorer/utils/ontology_builder.py      ← parent project
        │  build_ontology(): classify roles, resolve associations, ODM overlay
        ▼
tools/export_sc_ontology.py                     ← this project
        │  narrow to supply chain, then RE-RUN the parent's derivations
        ▼
data/sc_ontology.json          36 products · 338 entities · 281 associations
        │
        ├──▶ Express API (:3009) ──▶ React client (:5179)      live mode
        │
        ├──▶ tools/bake_static.py ──▶ client/public/data/*.json  public mode
        │
        └──▶ tools/deploy_sc_views.py
                     │
                     ▼
             SAP_BDC_ONTOLOGY.SUPPLY_CHAIN   6 views
                     │
                     ▼
             SUPPLY_CHAIN_ONTOLOGY_MODEL     semantic view
                     │
                     ▼
             Cortex Analyst ──▶ "Ask Cortex" page
```

The scenario layer is a second, parallel path over different source data. It shares
the app shell and nothing else, because the ontology cannot model ripple effects —
see [scenario modelling](07-scenario-modelling.md#why-this-needed-a-different-data-foundation).

```
SAP_SUPPLY_CHAIN  (plants, flows, capacity, stock, BOM)
        │
        ▼
tools/deploy_scenario_views.py ──▶ SAP_SUPPLY_CHAIN.SCENARIO   5 views
        │
        ▼
tools/export_scenario_network.py ──▶ data/sc_network.json   19 nodes · 27 flows
        │
        ├──▶ services/scenario.ts   propagation (in-process, microseconds)
        │            │
        │            ▼
        │    services/mitigate.ts   greedy reroute inside capacity limits
        │            │
        │            ▼
        │    services/reason.ts ──▶ AI_COMPLETE   narrative and what-ifs
        │
        └──▶ Scenario Studio · Ripple Map · Mitigation · Optimization Map · Guided Demo
```

---

## Reuse the parent's derivations, do not copy its numbers

The explorer needs precomputed blocks: `rollup`, `correlation`, `scorecard`,
`insight_apps`, `semantic_roles`, `lens_summary`.

`export_sc_ontology.py` filters the ontology dictionary and then calls the
**parent's own functions** on the filtered result:

```python
full = ob.build_ontology()
ont  = narrow(full)              # 334 → 36 products

payload = {
    "rollup":         ob.process_rollup(ont),
    "correlation":    ob.correlation(ont),
    "scorecard":      ob.scorecard(ont),
    "insight_apps":   ob.insight_apps(ont),
    "semantic_roles": ob.semantic_roles(ont),
    "lens_summary":   ob.lens_summary(ont),
}
```

Two alternatives were rejected:

- **Copying the parent's precomputed blocks** would publish 334-product figures
  inside a 36-product app. The scorecard and every rollup would be wrong.
- **Reimplementing the derivations here** would drift from the parent the first
  time either side changed, and the drift would be silent.

This was caught the direct way: the first version of the exporter omitted
`correlation`, `scorecard` and `insight_apps` entirely, and three pages read
those fields. Comparing the exported keys against the server's `Ontology`
interface surfaced it before it reached the browser.

---

## Edge filtering: both endpoints or nothing

When narrowing, an association is kept only when **both** endpoints survive the
filter:

```python
edges = [e for e in ont["entity_edges"]
         if e["source"] in ekeep and e["target"] in ekeep]
```

A half-edge would render as a line to a node that is not on the canvas, and
would inflate every association count. The same rule applies to ODM edges and
product pairs.

---

## One rule, two implementations

The scope rule exists in Python (for the app's JSON) and in SQL (for the
Snowflake views). Two implementations of one rule will drift, so
`tools/deploy_sc_views.py` asserts they agree and exits non-zero if not:

```
parity against the JSON export:
OK  products       snowflake=   36 json=   36
OK  entities       snowflake=  338 json=  338
OK  processes      snowflake=    3 json=    3
OK  entity edges   snowflake=  281 json=  281
OK  odm edges      snowflake=   19 json=   19
```

Without this, Ask would answer over a different population than the pages
display, and nothing would flag it.

---

## Snowflake objects

Views over the parent ontology's `CORE` tables — **no copies**, so there is one
source of truth and nothing to keep in sync:

| Object | Rows | Notes |
|---|---|---|
`V_PRODUCT` | 36 | Scope rule lives here; three columns renamed (below) |
`V_ENTITY` | 338 | Entities whose product is in scope |
`V_PROCESS` | 3 | Processes present in the slice |
`V_ENTITY_EDGE` | 281 | Both endpoints in scope |
`V_ODM_EDGE` | 19 | Both products in scope |
`V_PROCESS_ROLLUP` | 3 | **Re-derived** from `V_PRODUCT`, not selected from `CORE.FCT_PROCESS_ROLLUP` |
`SUPPLY_CHAIN_ONTOLOGY_MODEL` | — | Semantic view: 2 facts, 12 metrics, 9 verified queries |

`V_PROCESS_ROLLUP` is recomputed rather than filtered because the parent rollup
counts all 334 products per process. Selecting from it would overstate every
figure in the slice.

### Renamed columns

`V_PRODUCT` projects explicit columns so three names can be made unique:

| Source column | Exposed as | Also exists on |
|---|---|---|
`ENTITY_COUNT` | `PRODUCT_ENTITY_COUNT` | `V_PROCESS_ROLLUP` |
`ASSOCIATION_COUNT` | `PRODUCT_ASSOCIATION_COUNT` | `V_ENTITY` |
`CROSS_PRODUCT_ASSOCIATIONS` | `PRODUCT_CROSS_ASSOC` | `V_PROCESS_ROLLUP` |

This is not cosmetic. An ambiguous column name makes `sv-edit` drop facts
silently — see [findings](05-findings.md#the-semantic-view-trap).

### The join graph

```
V_ENTITY ──▶ V_PRODUCT ──▶ V_PROCESS
```

`V_ENTITY.PROCESS_CODE` exists but **must not** join to `V_PROCESS`. Entities
reach their process through their product; a direct join creates a second path
to the same dimension and Cortex Analyst can then produce inflated aggregates.
The semantic description states this so the model does not add the join back.

---

## Application

An npm workspace with two packages.

### Server — Express + TypeScript, port 3009

| Module | Responsibility |
|---|---|
`services/ontology.ts` | Loads and caches `data/sc_ontology.json`; builds graph elements |
`services/traverse.ts` | Adjacency, BFS expansion, shortest path, topology |
`services/analyst.ts` | JWT (RS256) → Cortex Analyst REST → executes returned SQL |
`services/scenario.ts` | Network load, disruption propagation, hop rollup, topology |
`services/mitigate.ts` | Reroute allocation against capacity, three blocked reasons |
`services/reason.ts` | Scenario brief for `AI_COMPLETE`, plus what-if interrogation |
`routes/api.ts` | 26 endpoints |

Traversal runs **in-process**. The whole graph is 338 nodes and 281 undirected
edges — small enough that a warehouse round-trip per click would add latency for
nothing. The agent repo uses Snowflake graph UDFs because its graph is a
persisted `KG_NODE`/`KG_EDGE` pair; that tradeoff does not apply here.

Async handlers need their own wrapper. A synchronous `try/catch` cannot catch a
rejected promise, so a Cortex failure would surface as an unhandled rejection
and the request would hang instead of returning an error:

```ts
function wrapAsync(handler) {
  return (req, res) => {
    handler(req, res).catch((e) =>
      res.status(500).json({ error: String(e?.message || e),
                             sql: e?.generatedSql ?? null }));
  };
}
```

The `sql` field carries the query Cortex Analyst generated when execution fails.
A SQL error with no query attached is nearly undebuggable — adding this is what
made the fact bug in [findings](05-findings.md) findable at all.

### Client — React + Vite + Cytoscape, port 5179

Thirteen pages. Eight cover the ontology; four cover scenarios (Scenario Studio,
Ripple Map, Mitigation, Optimization Map), and the Guided Demo walks the scenario
end to end.

The two animated pages share their step furniture rather than duplicating it:

| Module | Job |
| --- | --- |
| `lib/substeps.ts` | Decomposes a ripple into narrated beats — subtitle, mechanism, KPI deltas, arithmetic |
| `lib/mitsteps.ts` | Does the same for a mitigation plan: one beat per reroute, per blocked exposure, plus a summary |
| `lib/pace.ts` | Seconds-per-step playback pace, persisted, with a longer hold on beats that explain something |
| `components/StepCards.tsx` | `SubtitleBand`, `KpiCards`, `ExplainStep`, `PaceControl` — used by both players |

`ExplainStep` positions itself in viewport coordinates and clamps to the window.
Anchoring it to the button's left edge pushed the panel off-screen, because the
button sits on the right of the beat header; measuring also lets it flip upward
when there is little room below and escapes any clipping ancestor.

| Module | Responsibility |
|---|---|
`lib/severity.ts` | The single severity scale, shared by map and graph so they agree |
`components/WorldMap.tsx` | Hand-rolled SVG projection, Bezier flow arcs, reroute overlay |
`components/RippleGraph.tsx` | Cytoscape topology with hop rings and SPOF halos |
`components/ScenarioCharts.tsx` | Bullet charts, staged action pipeline, flow comparison |
`components/Walkthrough.tsx` | Screen frames and annotation pins for the Guided Demo |
`lib/substeps.ts` | Decomposes a scenario into lettered beats and their camera framing |
`hooks/useScenario.ts` | Module-level scenario store, so a run survives navigation |

Scenario state lives in a module-level store rather than React context: running a
disruption in the Studio and losing it on the way to the Ripple Map would make the
section unusable, and threading context through the switch-based router would mean
rewriting the shell for one feature.

The Guided Demo embeds the real components rather than screenshots. Screenshots
would show the surrounding chrome, but every figure here changes when the catalog
is re-sliced, so a capture would be wrong within a release and nobody would
notice.

---

## Two run modes

| | Live | Public static |
|---|---|---|
Data source | `/api` on :3009 | pre-baked JSON in `client/public/data/` |
Flag | default | `VITE_STATIC=1` |
Ask | works | disabled, with an on-screen explanation |
Shortest path | works | hidden — the pair space is quadratic |
Traversal | any entity, depth 1–4 | 24 hub entities, depths 1–3 |
Scenario pages | full | not baked — the API computes them per request |
Needs credentials | yes, for Ask and the scenario AI only | no |

The static build exists so the work can be shared without handing out Snowflake
access. Both modes call the same `api.ts` methods; only the transport differs.

Snapshot filenames fold percent-escapes to `-`, because a literal `%3A` in a
filename is decoded back to `:` by the web server and would never match the file
on disk. The rule is implemented in both `tools/bake_static.py` and
`client/src/lib/api.ts` and **the two must stay identical** — a comment in each
says so.
