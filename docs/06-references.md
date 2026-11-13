# 6. References

What each source contributed, and where the boundary sits. All four repos below
are public.

---

## Snowflake Business Ontology

The app's foundation since 13 Nov 2026: the governed **Supply Chain** domain on
account MSB89522 — 21 concepts, 26 relationships, 25 representations. Every page
reads its inputs by walking this domain; see [concepts](01-concepts.md).
Snowsight: *Data → Business Ontology → Supply Chain*.

## Parent project (history)

### [`sfc-gh-dfreriks/sap-bdc-data-products`](https://github.com/sfc-gh-dfreriks/sap-bdc-data-products)

> Interactive explorer for the SAP Business Data Cloud data product portfolio,
> mined from the public SAP Business Accelerator Hub catalog.

This project started as a focused fork of it, narrowed to supply chain. The
catalog pages and the exporter that imported the parent's `ontology_builder`
were removed on 13 Nov 2026. What remains is provenance: four concepts in the
domain (Catalog Object, Business Process, Data Product, CDS Entity) record that
the domain was derived from the catalog, and the React shell and Express API
shape still descend from the parent.

---

## Ontology and agent pattern

### [`sfc-gh-tjia/supplychain_ontology_agent`](https://github.com/sfc-gh-tjia/supplychain_ontology_agent)

An ontology-driven knowledge graph agent on Snowflake. Its README describes a
full deployable stack:

- 1 database (`DB_ONTOLOGY_CONTROL_PLANE`), 3 schemas
- 2 physical KG tables — **124 nodes, 109 edges**
- 8 ontology metadata tables, 27 views
- 4 semantic views, 6 graph-visualization UDFs
- 1 Cortex Agent with 5 tools, 2 Iceberg tables (IoT + risk)

**Taken:** the ontology-as-queryable-data argument, the polymorphic-query and
identity-resolution framing, and the idea of answering questions by walking
typed relationships — now done over the governed domain (the digital thread's
"which customers did this lot reach?").

**Deliberately not taken:** its graph is a persisted `KG_NODE`/`KG_EDGE` pair
traversed with Snowflake UDFs. Here the relationships are governed in Business
Ontology and the instance graph is small enough to walk in-process.

**The important difference — do not conflate the two.** That repo models real
supply-chain *objects*: suppliers, shipments, plants, purchase orders, contracts,
IoT telemetry, risk scores, with identity resolved across SAP and Ariba. This
project models *metadata about SAP data products*. Its graph can answer "what
happens if this supplier goes down"; this one cannot, and should not be presented
as if it could.

Its stack was evaluated as an alternative foundation and not deployed — see
[build steps, step 0](03-build-steps.md#step-0--decide-what-ontology-means-here).

---

## Application and publishing patterns

### [`sfc-gh-dfreriks/sap-bdc-supply-chain-360`](https://github.com/sfc-gh-dfreriks/sap-bdc-supply-chain-360)

> A reference implementation showing how to turn SAP BDC Standard Data Products
> into a live, AI-powered supply-chain analytics app on Snowflake — using a
> medallion architecture, a governed semantic view, a Cortex Agent, and a
> self-contained Snowflake Native App (React + Express on Snowpark Container
> Services), deployable across multiple regions.

**Taken:** the React + Express split, the governed-semantic-view-plus-agent
pattern, and its documentation structure (`ARCHITECTURE` / `DEMO_GUIDE` /
`INSTALL`), which shaped this `docs/` set.

**Not taken:** the SPCS Native App packaging — `manifest.yml`,
`service_spec.yml`, `setup.sql`, org listings. This project runs locally or as a
static site; it is not packaged as a Native App.

**Complements rather than overlaps.** That app does transactional supply-chain
analytics on real SAP data — production planning, BOM, work-center capacity,
inventory, delivery performance. It is the right place to go for questions this
ontology cannot answer. On the same Snowflake account it corresponds to
`SAP_SUPPLY_CHAIN` and the `SAP_SUPPLY_CHAIN_360` semantic view (16 data
products, 177 entities).

### [`sfc-gh-dfreriks/supply-chain-360-public`](https://github.com/sfc-gh-dfreriks/supply-chain-360-public)

> A static, no-login public build of the SAP BDC Supply Chain 360 dashboard,
> deployed to GitHub Pages. Dashboards render from a point-in-time data snapshot
> (no Snowflake connection, no credentials in the browser).

**The public static build here follows this pattern closely:**

| Borrowed | Applied as |
|---|---|
`VITE_STATIC=1` switches the client from `/api` to pre-baked JSON | same flag, same purpose |
Pre-baked snapshots under `public/data/`, keyed by filter combination | 93 snapshots keyed by query string |
`base: process.env.BASE_PATH \|\| '/'` for Pages subdirectories | same |
GitHub Actions Pages workflow | plus a guard that fails the build under 20 snapshots |
Optional live agent via `VITE_AGENT_URL` | not adopted — Ask is disabled in the public build instead |

Two additions this project needed:

- **The snapshot-count guard.** Without snapshots the site builds green and
  renders every page empty, which is worse than a red build.
- **Filename sanitization.** Entity IDs contain `::`; percent-escaped filenames
  are decoded by the web server and never match on disk. See
  [findings](05-findings.md#percent-escapes-cannot-be-filenames).

---

## Narrative

### AI309 Summit deck — *Enterprise Supply Chain Ontology Agent*

`Copy of Copy of AI309_FINAL_SUMMIT_0602_ExternalShare.pptx` plus
`supply_chain_ontology_agent_demo_slide.html`. Not public; held locally.

Supplied the framing the Guided Demo was originally built on: the problem ("same
supplier, three systems, three different IDs, no links between them"), the solution,
why ontology (polymorphic queries, graph traversal, identity resolution), and "not a
chatbot — a reasoning engine".

The deck's argument survives in the page's copy, but the page itself has since been
rebuilt: it is now a **seven-step walkthrough of the hurricane scenario** with live
components and pinned click targets, rather than five narrative panels. The abstract
version explained why ontologies matter without showing anyone what to click.

Figures are read live from the API rather than transcribed, so the walkthrough cannot
quote numbers that have drifted from what is being served.

---

---

## Visualization guidance

The scenario views follow published supply-chain visualization practice rather than
invented conventions. Each source contributed specific techniques, listed in
[scenario modelling](07-scenario-modelling.md#visualization).

| Source | Contributed |
|---|---|
[Cambridge Intelligence — supply chain use cases](https://cambridge-intelligence.com/use-cases/supply-chain/) | Combining network, timeline and geospatial views; tracing an issue back to source and forward to who else is at risk — structurally the same problem as an outbound ripple |
[Creately — supply chain visualization guide](https://creately.com/guides/supply-chain-visualization/) | Dependency and flow diagrams, geographic overlays, critical-path highlighting, and the warning that a heat-map scale must be calibrated to the data range rather than fixed thresholds |
[Ventagium — 5 ways to visualize supply chain processes, part 1](https://www.ventagium.com/blog/5-ways-to-visualize-your-supply-chain-processes-part-1) | Bullet charts, and the explicit warning **against gauges and pie charts** because radial angle encoding is read less accurately than length |
[Ventagium — part 2](https://www.ventagium.com/blog/5-ways-to-visualize-your-supply-chain-processes-part-2) | The staged action pipeline as a leading indicator, and normal-versus-rerouted path styling |
[PuppyGraph — supply chain graph](https://www.puppygraph.com/blog/supply-chain-graph) | Dependency graphs surfacing non-obvious single points of failure, and hop-distance reasoning over a graph |

Two pieces of guidance were followed against instinct and are worth restating:

- **No gauges anywhere.** Capacity headroom is exactly the number that must not be
  misread, so it is a bullet chart against a reference band in every view.
- **Process behaviour charts were left out.** The source recommends them for
  drill-down only and says they clutter a primary view. At 27 flows they would have.

Techniques not drawn from these sources — the step animation of hop propagation, and
encoding reroute hours as a cost signal — are marked as such rather than attributed.

## Snowflake platform

- **Snowflake Business Ontology** — concepts, typed relationships and
  representations; the source of every app input.
- **`AI_COMPLETE`** (`claude-opus-5-5`) — the scenario narrative, the what-if
  channel and the Ask Cortex buttons. The computed scenario and the governed
  definitions are passed as facts; the model interprets, it does not calculate.
  The deprecated `SNOWFLAKE.CORTEX.COMPLETE` form is not used.
- **Dynamic tables** in `SAP_SUPPLY_CHAIN.ANALYTICS` — order fulfilment,
  operating rate, component cover and equipment health behind the operations
  pulse.

## Upstream data

- **`SAP_SUPPLY_CHAIN`** — SAP plants, suppliers, customers, flows, capacity,
  stock and BOMs, plus `OPS_EXT` demo enrichment for the digital thread.
- **[SAP Business Accelerator Hub](https://api.sap.com/DataProducts)** — the
  public BDC catalog the domain was originally derived from (history).

---

## Boundaries in one table

| Question | Repo |
|---|---|
| A supplier fails — what ripples, what can be saved, which customers did a bad lot reach? | **this repo** |
| Which SAP data products exist and how do they relate? | the parent, `sap-bdc-data-products` |
| Which supplier is late, and what is at risk, from an agent? | `supplychain_ontology_agent` |
| What is my production, inventory and delivery performance? | `sap-bdc-supply-chain-360` |
| Can I show that dashboard without credentials? | `supply-chain-360-public` |
