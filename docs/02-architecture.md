# 2. Architecture

How the pieces fit, and which decisions were load-bearing.

---

## Data flow

```
Snowflake Business Ontology — domain "Supply Chain" (MSB89522)
        │  21 concepts · 26 relationships · 25 representations
        ▼
tools/export_business_ontology.py ──▶ data/sc_business_ontology.json   the domain
tools/export_ontology_network.py  ──▶ data/sc_network.json   walk → 19 nodes · 27 flows
tools/export_ops_thread.py        ──▶ data/sc_ops_thread.json  walk → thread + pulse
        │
        ├──▶ Express API (:3009) ──▶ React client (:5179)       live mode
        │        services/scenario.ts   propagation (in-process)
        │        services/mitigate.ts   greedy reroute inside capacity
        │        services/reason.ts     AI_COMPLETE narrative and what-ifs
        │        services/thread.ts     lot blast radius, Ask Cortex
        │
        └──▶ tools/bake_static.py ──▶ client/public/data/*.json  public mode
```

`tools/refresh_all.py` (`npm run refresh`) runs the three exporters, builds the
server, bakes the snapshots and then **reconciles**: it walks the domain again
and fails if the served files no longer match it. A half-done refresh would
publish stale numbers silently, so the order is enforced.

---

## Walk, then read

Each exporter resolves its inputs from the domain rather than from table names:

1. Find the concept by relationship (e.g. the endpoints of `supplies`).
2. Read the representation a steward linked to that concept.
3. Record the resolved object in a `lineage` block inside the exported JSON.

The lineage block is what the Ontology page's "what the app reads" table shows,
so the app documents its own sources.

The rewrite onto Business Ontology was gated on **parity**: all nine scenario
presets and the full digital thread produce identical results to the previous,
table-driven version.

---

## Snowflake objects

Representations point at views and dynamic tables in `SAP_SUPPLY_CHAIN`:

| Schema | Objects | Serves |
|---|---|---|
| `ONTOLOGY` | `VW_ONT_SUPPLIER`, `VW_ONT_PLANT`, `VW_ONT_CUSTOMER`, `VW_ONT_*FLOW`, `V_PRODUCES`, `VW_ONT_LOT_BLAST_RADIUS`, concept views | network, flows, substitution, thread |
| `ANALYTICS` | `DT_ORDER_FULFILLMENT`, `DT_OPERATING_RATE`, `DT_COMPONENT_COVER`, `DT_EQUIPMENT_HEALTH`, `A_WORK_CENTER` | economics, operations pulse |

No data is copied. The app needs no Snowflake connection to run, because every
page reads the exported JSON; only the AI features query Snowflake live.

---

## Application

An npm workspace with two packages.

### Server — Express + TypeScript, port 3009

| Module | Responsibility |
|---|---|
| `services/businessOntology.ts` | Loads the exported domain; graph, node detail, summary |
| `services/scenario.ts` | Network load, disruption propagation, hop rollup, topology |
| `services/mitigate.ts` | Reroute allocation against capacity, three blocked reasons |
| `services/reason.ts` | Scenario brief for `AI_COMPLETE`, plus what-if interrogation |
| `services/thread.ts` | Digital thread, operations pulse, Ask Cortex |
| `routes/api.ts` | 15 endpoints |

Endpoints: `/api/health`, `/api/meta`, `/api/bo/summary`, `/api/bo/graph`,
`/api/bo/node/:name`, `/api/scenario/network`, `/api/scenario/presets`,
`/api/scenario/simulate`, `/api/scenario/explain`, `/api/scenario/ask`,
`/api/scenario/reasoning/status`, `/api/thread`, `/api/thread/serial/:serial`,
`/api/operations`, `/api/ask-cortex`.

The engine runs **in-process**: 19 nodes and 27 flows simulate in microseconds,
so the UI re-runs on every slider movement. A warehouse round-trip per keystroke
would add latency for nothing.

Async handlers need their own wrapper. A synchronous `try/catch` cannot catch a
rejected promise, so an AI failure would surface as an unhandled rejection and
the request would hang instead of returning an error.

### Client — React + Vite + Cytoscape, port 5179

Nine pages, in sidebar order (the app opens on Ontology):

| Page | Route | Shows |
|---|---|---|
| Ontology | `#model` | Domain graph; each concept's definition, relationships, representations, history |
| Executive Dashboard | `#overview` | Operations pulse, the governed domain, the network |
| Snowflake Ontology Details | `#snowflake` | Snowsight screenshots of the same domain, with what each shows and why it matters |
| Ask Cortex | `#ask` | Questions across the whole supply chain: the governed domain, operations, thread and every preset scenario |
| Guided Demo | `#demo` | Seven-step walkthrough of the hurricane scenario |
| Scenario Studio | `#scenario` | Build a disruption from five event types |
| Ripple Map | `#ripple` | Geography and topology side by side, cascade played lane by lane |
| Mitigation & Recovery | `#mitigation` | The recovery as a movie (old lanes red, new lanes dashed green), then the plan and an AI to interrogate |
| Digital Thread | `#thread` | Orders, systems, component lots, tools; lot blast radius |

The **Ask Cortex** page (topic `domain`) answers questions across the whole supply chain. **Ask Cortex** buttons on most pages send the view on screen to `AI_COMPLETE`
(`claude-opus-5-5`) with the governed definitions, so the answer cites the
ontology. Old `#optimize` links open Mitigation & Recovery.

Shared step furniture:

| Module | Job |
| --- | --- |
| `lib/substeps.ts` | Decomposes a ripple into narrated beats and their camera framing |
| `lib/mitsteps.ts` | One beat per reroute, per blocked exposure, plus a summary |
| `lib/pace.ts` | Persisted seconds-per-step playback pace |
| `components/StepCards.tsx` | `SubtitleBand`, `KpiCards`, `ExplainStep`, `PaceControl` |
| `lib/severity.ts` | The single severity scale, shared by map and graph |
| `components/WorldMap.tsx` | Hand-rolled SVG projection, flow arcs, reroute overlay |
| `components/RippleGraph.tsx` | Cytoscape topology with hop rings and SPOF halos |
| `hooks/useScenario.ts` | Module-level scenario store, so a run survives navigation |

The Guided Demo embeds the real components rather than screenshots, because
every figure changes when the domain is re-exported.

---

## Two run modes

| | Live | Public static |
|---|---|---|
| Data source | `/api` on :3009 | pre-baked JSON in `client/public/data/` |
| Flag | default | `VITE_STATIC=1` |
| Ask Cortex and scenario AI | works with credentials | disabled, with an on-screen explanation |
| Scenario pages | any disruption | the nine baked presets |
| Needs credentials | only for the AI | no |

Snapshot filenames fold percent-escapes to `-`, because a literal `%3A` in a
filename is decoded by the web server and never matches the file on disk. The
rule is implemented in both `tools/bake_static.py` and `client/src/lib/api.ts`
and **the two must stay identical**.
