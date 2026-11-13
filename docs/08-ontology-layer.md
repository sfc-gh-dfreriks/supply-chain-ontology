# 08 — The ontology layer

The app began as a viewer over the SAP Business Data Cloud catalog: business
processes, data products, CDS entities. That catalog is real and useful, but it
was labelled "the ontology", and it is not one. This document covers the layer
that was added to fix that, why the distinction matters, and what broke on the
way.

---

## Catalog and ontology are different things

A catalog answers **what data exists**. An ontology answers **what kinds of
thing exist**.

| | SAP BDC catalog | Supply-chain ontology |
|---|---|---|
| Question | what data exists | what kinds of thing exist |
| Contents | 10 processes, 334 data products, 2,243 CDS entities | 15 classes, 11 relations |
| Level | instances | schema |
| Snowflake | `SAP_BDC_ONTOLOGY.CORE` | `SAP_SUPPLY_CHAIN.ONTOLOGY` |
| App page | SAP BDC Catalog | Ontology Model |

The consequence is concrete. The catalog cannot express that a Supplier and a
Customer are both Parties, so it cannot answer *"which parties are affected"* in
one pass. With the abstract layer:

```sql
SELECT ENTITY_TYPE, COUNT(*)
FROM SAP_SUPPLY_CHAIN.ONTOLOGY.VW_ONT_PARTY
GROUP BY 1;
-- Customer  8
-- Supplier  6
```

One query, two concrete types, 14 rows. That is the whole argument for the
layer, and the app now shows it on the Ontology Model page whenever an abstract
class is selected.

---

## The five layers

Every figure below is read from Snowflake by
`tools/export_ontology_schema.py` — nothing here is hand-maintained.

| Layer | Contents | Purpose |
|---|---|---|
| L1 Physical | `KG_NODE` 2,662 · `KG_EDGE` 5,457 | instances, plus 15 schema nodes carrying the class hierarchy |
| L2 Metadata | 20 `ONT_*` tables | classes, relations, properties, rules, permissions |
| L3 Abstract views | 40 views · 4 UDFs · 10 procedures | `VW_ONT_*` span several concrete types in one query |
| L4 Semantic | 3 semantic views | Cortex Analyst grounding, one per question shape |
| L5 Agent | `SUPPLY_CHAIN_AGENT` | routes a question to the right layer |

### Why the class hierarchy lives in `KG_NODE`

The 15 classes are stored twice: as rows in `ONT_CLASS`, and as nodes of type
`OntologyClass` in `KG_NODE` with 14 `subClassOf` edges between them. The
duplication is deliberate — the graph traversal UDFs walk `KG_EDGE`, so without
the schema nodes in the graph they have nothing to walk. Before this was loaded,
all four traversal functions returned zero rows.

---

## Abstract and concrete

Five classes are abstract: `Entity`, `Party`, `Facility`, `MaterialFlow`,
`CatalogObject`. They carry no rows of their own and have no physical mapping —
they are unions over their children. This is why `ONT_CLASS_MAP` has 10 rows for
15 classes, and the exporter treats a missing mapping as **expected** for an
abstract class and a **defect** for a concrete one.

```
Entity
├── Party                    abstract
│   ├── Customer             8
│   └── Supplier             6
├── Facility                 abstract
│   └── Plant                5
├── MaterialFlow             abstract
│   ├── InboundFlow          12
│   ├── OutboundFlow         11
│   └── InterPlantFlow       4
├── MaterialCategory         14
└── CatalogObject            abstract
    ├── BusinessProcess      10
    ├── DataProduct          334
    └── CDSEntity            2,243
```

Two branches, and they must not be mixed in one answer without saying so. The
supply-chain branch is the domain. The `CatalogObject` branch is SAP BDC
metadata describing what data exists.

The **Concrete** position on the app's toggle makes the point negatively: with
the abstract classes filtered out, the remaining ten have **zero** `subClassOf`
edges between them. They are disconnected islands. That is not a rendering bug —
it is what the model looks like without an abstract layer.

---

## Stored, inferred and abstract relations

Of 11 relations, 9 are stored, 1 is inferred, 1 is abstract.

| Relation | Domain → Range | Kind |
|---|---|---|
| `supplies` | Supplier → Plant | stored |
| `shipsTo` | Plant → Customer | stored |
| `transfersTo` | Plant → Plant | stored |
| `produces` | Plant → MaterialCategory | stored |
| `carriesCategory` | MaterialFlow → MaterialCategory | stored |
| `containsProduct` | BusinessProcess → DataProduct | stored |
| `exposesEntity` | DataProduct → CDSEntity | stored |
| `associatedWith` | CDSEntity → CDSEntity | stored |
| `sharesCanonicalObject` | CDSEntity → CDSEntity | stored |
| `canSubstituteFor` | Plant → Plant | **inferred** |
| `flowsTo` | Entity → Entity | **abstract** |

### `canSubstituteFor` cannot be stored

`V_SUBSTITUTION` holds `(category, plant)` capability rows — which plant can make
which category. There is no target plant in the data, so storing the relation
directly produces self-loops. It has to be derived: two plants can substitute
when both `produces` the same category.

```sql
SELECT DISTINCT a.SOURCE_PLANT, b.SOURCE_PLANT
FROM V_SUBSTITUTION a
JOIN V_SUBSTITUTION b
  ON a.MATERIAL_CATEGORY = b.MATERIAL_CATEGORY
 AND a.SOURCE_PLANT <> b.SOURCE_PLANT;
```

Six distinct plant pairs. Note this is **6 pairs**, not 8 — 8 is the count of
`(category, plant, plant)` triples, which is a different question.

Rule `R_SUBSTITUTION` (`JOIN_DERIVED`) materialises these into
`REL_EDGE_INFERRED`, and the count was validated against an independent
recomputation from source rather than against the rule's own output.

### `flowsTo` is abstract, not inferred

`ONT_RELATION_DEF` has **no `IS_ABSTRACT` column** — it can express
`IS_HIERARCHICAL` and `IS_TRANSITIVE` but not abstractness. So abstractness of a
relation is derived: a relation with no `ONT_REL_MAP` row *and* no inference rule
is an umbrella over concrete relations. Nothing stores it and nothing derives it,
so it exists only as a grouping over `supplies`, `shipsTo` and `transfersTo`.

This is a real gap in the metadata schema, recorded in `docs/05-findings.md`.

---

## Layer 4: three semantic views, three question shapes

One semantic view per kind of question, because a single overloaded model routes
badly.

| View | Objects | Answers |
|---|---|---|
| `SUPPLY_CHAIN_BASE` | 5 `SCENARIO` views | a named plant's spare capacity, a lane's monthly value, days of inventory |
| `SUPPLY_CHAIN_ONTOLOGY_MODEL` | 10 `VW_ONT_*` + hierarchy views | which parties, what kinds of flow, ancestors and descendants |
| `SUPPLY_CHAIN_METADATA_MODEL` | 15 `ONT_*` + 3 BDC views | how something is modelled, which relations are inferred |

A fourth exists and predates this work:
`SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.SUPPLY_CHAIN_ONTOLOGY_MODEL`, the BDC catalog
slice. It shares a *name* with the new ontology model but sits in a different
schema; its spec lives at `cortex_project/SUPPLY_CHAIN_ONTOLOGY_MODEL_BDC.sv.yaml`.

> **Naming trap.** `sv-write --source-object` derives the workspace filename from
> the view name alone, so two same-named views in different schemas collide and
> silently overwrite one another. Pass `--file-path` explicitly when a name is
> already taken.

---

## Layer 5: the agent

`SUPPLY_CHAIN_AGENT` carries 7 tools — the 3 semantic views plus 4 hierarchy
tools — and routing instructions that select by what a question is *about*
rather than which words it uses.

Verified routing:

| Question | Routes to | Answer |
|---|---|---|
| Austin Fab spare capacity and inventory | `base_query_tool` | 2 units, 259 hrs, 81.4%, 42 days |
| Which parties, split by type | `ontology_query_tool` | 14 = 8 customers + 6 suppliers |
| Which relations are inferred | `metadata_query_tool` | `canSubstituteFor` only |
| Descendants of Facility | `ontology_query_tool` | Plant, depth 1 |
| Supplier → Entity path | `get_hierarchy_path_tool` | Supplier → Party → Entity |

The metadata answer distinguished `flowsTo` as *abstract* from
`canSubstituteFor` as *inferred* without being asked to — the distinction the
layer exists to make.

### UDTFs cannot be agent function tools

The four traversal tools are **table** functions. A Cortex Agent
`type: function` resource resolves scalar functions only, so registering a UDTF
fails with `Unknown user-defined function` — the name resolves, the scalar lookup
does not. Each is wrapped in a stored procedure returning a JSON array
([`sql/ontology/08_agent_sp_wrappers.sql`](../sql/ontology/08_agent_sp_wrappers.sql))
and registered as `type: procedure`.

The failure was not obvious: the agent caught the error and silently fell back to
`ontology_query_tool`, which produced the *correct* answer. The tools were dead
while the output looked healthy.

---

## How the app reads all this

The server does **not** query Snowflake for the ontology. `tools/bake_static.py`
builds a credential-free GitHub Pages site, so live queries would break the
static build. The pattern is the same as the other two data artifacts:

```
tools/export_ontology_schema.py  ->  data/sc_ontology_schema.json
                                     server/src/services/ontologySchema.ts
                                     GET /api/ontology/schema
                                     GET /api/ontology/class-graph?mode=...
                                     GET /api/ontology/class/:name
                                     client/src/pages/OntologyModel.tsx
```

Three artifacts, three different things:

| File | Contents |
|---|---|
| `data/sc_ontology.json` | BDC catalog — data products and CDS entities |
| `data/sc_network.json` | scenario network — 19 nodes, 27 flows |
| `data/sc_ontology_schema.json` | the ontology — 15 classes, 11 relations |

To refresh after changing the Snowflake layer:

```bash
python3 tools/export_ontology_schema.py     # re-read classes and relations
npm run dev                                 # or start the built server
BAKE_HOST=http://localhost:3009 python3 tools/bake_static.py
```

The baker emits 19 ontology snapshots: the schema, three toggle positions, and
one per class. Class snapshots are driven off the schema rather than a hardcoded
list, so a new class is picked up automatically.

---

## The app is built on Snowflake Business Ontology

As of 13 Nov 2026 the app reads nothing from the `ONT_*` / `KG_*` layer described
above. Every input is found by walking the governed "Supply Chain" domain in
Snowflake Business Ontology (account MSB89522) and reading the representation a
steward linked to each concept. The sections above remain as the record of how
the domain was derived; the app itself no longer depends on them.

| App input | Walk | Representation read |
|---|---|---|
| Network nodes | endpoints of `supplies` and `ships to` | `VW_ONT_SUPPLIER`, `VW_ONT_PLANT`, `VW_ONT_CUSTOMER` |
| Flows | IS_A children of the concept `Material Category` classifies | `VW_ONT_INBOUNDFLOW`, `VW_ONT_OUTBOUNDFLOW`, `VW_ONT_INTERPLANTFLOW` |
| Capacity, inventory | Plant | `VW_ONT_PLANT` |
| Substitution | Material Category | `V_PRODUCES` |
| Economics | Sales Order fulfilled by Plant | `ANALYTICS.DT_ORDER_FULFILLMENT` |
| Digital thread | System Serial has part Component Lot, shipped on Sales Order | `VW_ONT_LOT_BLAST_RADIUS` + class views |
| Operations pulse | Plant, Equipment | `DT_OPERATING_RATE`, `DT_COMPONENT_COVER`, `DT_EQUIPMENT_HEALTH`, `A_WORK_CENTER` |

Seven representations were added to the domain for this (Material Category,
Sales Order, Component Lot, two on Plant, two on Equipment), each through the
quality gate with 0 findings, bringing it to 25.

```
tools/export_business_ontology.py  ->  data/sc_business_ontology.json   the domain
tools/export_ontology_network.py   ->  data/sc_network.json             walk -> scenario network
tools/export_ops_thread.py         ->  data/sc_ops_thread.json          walk -> thread and pulse
tools/refresh_all.py                   all three, bake, then reconcile (re-walk and compare)
```

**Parity.** The switch was gated on identical output: the network export
matched the old `SCENARIO`-schema export field for field; all nine presets gave
identical totals, flows and mitigation plans; the thread matched on serials,
traces, lots, equipment and the operations pulse (two lists had undefined order
before and are now sorted).

**Removed with the catalog:** SAP BDC Catalog, Graph Traversal, Business
Processes, Use Cases, Correlation, Coverage & Scorecard, the Cortex Analyst page,
and the app class model view; `export_sc_ontology.py`,
`export_ontology_schema.py`, `export_scenario_network.py`, `deploy_sc_views.py`.

**Not in Business Ontology**, and so in the engine's code: plant-to-plant
transfer as an edge, cardinality, the substitution rule and buffer timing.

---

## Reading the diagrams

Three rendering traps cost real time here, and all three produced output that
looked plausible while being wrong. They are recorded because each is easy to
repeat.

### The class tree is positioned server-side, not laid out by Cytoscape

`subClassOf` points **child → parent**. A directed `breadthfirst` layout rooted at
the classes with no *outgoing* edge therefore roots at `Entity` — correct — and
then immediately dead-ends, because every edge points *up* toward it. All fourteen
other classes are unreachable and land on a single rank. The result is not a bad
layout, it is fifteen nodes collapsed into one horizontal line of slivers.

Reversing the edges would satisfy the layout engine but would draw the arrows
backwards and misstate the relation, so positions are computed in
`buildClassGraph` instead: a post-order walk assigns each leaf a slot and centres
parents on their children, and the client renders `preset`.

Left to right rather than top down, because class names are long horizontal words
and ranks-as-columns give them room:

```
                        ┌ BusinessProcess  10
        ┌ CatalogObject ┼ CDSEntity     2,243
        │                └ DataProduct    334
        ├ Facility ────── Plant             5
Entity ─┼ MaterialCategory  14
        │                ┌ InboundFlow     12
        ├ MaterialFlow ──┼ InterPlantFlow   4
        │                └ OutboundFlow    11
        └ Party ─────────┬ Customer         8
                         └ Supplier         6
```

### A node has one label, so two lines are joined with a newline

`source-label` is an **edge** property and does nothing on a node. To put a count
under a class name, the server emits `label: "Party\n14 in 2 types"` and the
client sets `text-wrap: wrap`, which honours the break.

Box size deliberately does **not** encode instance count. It did at first, and it
fought legibility from both ends: `CDSEntity` at 2,243 wanted to be enormous, and
`Plant` at 5 wanted to be smaller than the word "Plant". Width is driven by the
wider of the two text lines, and the count is stated in words — which is also more
honest about magnitude than area ever is.

### White text needs a fill behind all of it

Both graphs shipped with white labels wider than the shapes holding them. The
overflow landed on the light canvas and vanished, so `Design to Operate` read as
`ign to Ope` — the only fragment still over the coloured fill. Two different fixes,
because the shapes differ:

| Node | Fix |
|---|---|
| Process (rounded rect) | `width: label` with padding, so the fill always extends behind the whole string |
| Product / entity (small circle) | label moved **below** the node in dark text with a white outline |

A 30-character name cannot sit inside an 18px circle. Putting it below is the
honest arrangement, and the outline keeps it readable where it crosses an edge.

Related: `fcose` fits the node bounding box, which **excludes** labels, so names on
the outermost nodes were cropped at the container edge until an explicit re-fit
with label-width padding was added.

### Controls

| Control | Behaviour |
|---|---|
| Abstract / Concrete / Both | Concrete deliberately shows ten disconnected classes — strip the abstract layer and nothing joins a Supplier to a Customer |
| Show relations | Off by default. The eleven relation edges cross the tree and bury the `subClassOf` spine, which is what the page is about |
| Reset view | Appears only once you have zoomed or panned, and restores the fit |

The reset control exists because the topology panel refitted on every beat of the
ripple, undoing a deliberate zoom. A viewer's zoom is now recorded and suppresses
further auto-fitting. Telling that input apart from a programmatic fit needs a
flag around the `cy.fit` call, since `fit` emits the same `zoom` and `pan` events
that a mouse wheel does — without it the graph marks itself moved the instant it
fits, and never re-frames again.

---

## Defects found in the generator

The layer was built with the `ontology-stack-builder` skill. Seven defects
surfaced; all were fixed locally, and the skill itself is unpatched.

The two corrective scripts are kept in `sql/ontology/`. The skill's own generated
files (physical layer, concrete views, metadata tables, abstract views, the view
generator, the inference engine) are not vendored here — regenerate them from the
skill if the layer has to be rebuilt from nothing.

| # | Defect | Symptom |
|---|---|---|
| 1 | `filter_condition` dropped from both KG loaders | 78 excess nodes, 54 excess edges — every flow class got all 27 flows |
| 2 | `VW_ONT_*` generated from `class_mappings` only | zero abstract views, the entire point missing |
| 3 | 4 hierarchy views never emitted despite being documented | no traversal |
| 4 | Ontology schema never loaded into `KG_NODE` | all 4 graph UDFs returned 0 rows |
| 5 | `row.get('FILTER_COL')` in a generated procedure | Snowpark `Row` has no `.get()` |
| 6 | UDF concept lookup unfiltered by `NODE_TYPE` | **silent, non-deterministic** empty traversals |
| 7 | UDTFs registered as agent `type: function` | all 4 graph tools failed |

### Defect 6 is the dangerous one

Every traversal UDF resolved a concept with:

```sql
WHERE LOWER(NAME) = LOWER(CONCEPT) LIMIT 1     -- no ORDER BY, no NODE_TYPE
```

`KG_NODE` holds both schema and instance nodes, and names collide. `Supplier`
matches three nodes:

```
sap-s4com-Supplier-v1::Supplier   [CDSEntity]      <- SAP catalog
sap-s4com-Supplier-v1             [DataProduct]    <- SAP catalog
class:Supplier                    [OntologyClass]  <- the one wanted
```

The UDF picked one arbitrarily, usually a catalog node with no `subClassOf`
edges, and returned nothing. `EXPAND_DESCENDANTS_TOOL('Party')` worked only
because no SAP data product happens to be called "Party" — which is why the
defect survived an earlier round of testing that checked only that function.

Fixed in [`sql/ontology/07b_fix_graph_tools.sql`](../sql/ontology/07b_fix_graph_tools.sql)
by pinning every lookup to `NODE_TYPE = 'OntologyClass'` with a deterministic
`ORDER BY`.

Worth reporting upstream: it is triggered by loading the BDC catalog the skill
itself encourages, it fails silently rather than erroring, and it is
non-deterministic.

---

## Known gaps, not fixed

| Gap | Consequence |
|---|---|
| `ONT_RELATION_DEF` has no `IS_ABSTRACT` | abstract relations inferred from absence of mapping and rule |
| `ONT_CLASS_MAP` / `ONT_OBJECT_SOURCE` record `KG_NODE` as source | provenance stops at the KG; the chain back to `V_NODE` / `V_FLOW` is lost |
| `FILTER_SQL` uppercases values (`'PLANT'` vs actual `'Plant'`) | `SP_GENERATE_ONTOLOGY_VIEWS` would regenerate empty views |
| `SUPPLY_CHAIN_BASE` has 0 metrics | Cortex Analyst improvises aggregates instead of using governed ones |

The deployed views are correct — only the stored regeneration metadata is wrong.

---

## Validation

30 checks across L1–L5, all passing:

- **L1** every class count reconciled against its source view; schema nodes match `ONT_CLASS`; `subClassOf` edges match classes with a parent
- **L2** inferred edge count matches an independent recomputation from source; no self-loops; exactly the 5 abstract classes are unmapped
- **L3** each abstract view returns the expected row and type counts
- **L4** all three semantic views deployed and answering
- **L5** agent deployed; all 4 procedure wrappers return data

One check initially failed on `InterPlantFlow` (4 vs 0). The cause was the test
literal: the source value is `Inter-plant`, not `InterPlant`. The data was
correct throughout — 12 + 11 + 4 = 27 matches `V_FLOW` exactly.
