# Supply Chain Ontology

An ontology explorer for the **supply-chain slice of the SAP Business Data Cloud
catalog** — 36 data products, 338 CDS entities and 281 declared associations
across Design to Operate, Source to Pay and Lead to Cash. Explore the graph,
traverse associations, review coverage, and ask questions in natural language
through Cortex Analyst.

Derived from the full BDC Ontology Explorer (334 products) and focused for
supply chain. Foundation material: the ontology-agent pattern from
[`sfc-gh-tjia/supplychain_ontology_agent`](https://github.com/sfc-gh-tjia/supplychain_ontology_agent),
the app and publishing patterns from
[`sap-bdc-supply-chain-360`](https://github.com/sfc-gh-dfreriks/sap-bdc-supply-chain-360)
and [`supply-chain-360-public`](https://github.com/sfc-gh-dfreriks/supply-chain-360-public),
and the AI309 Summit narrative.

---

## What this is, and what it is not

Two things live here, and keeping them apart is the point.

**The ontology** — 15 classes and 11 relations in `SAP_SUPPLY_CHAIN.ONTOLOGY`.
This is the model: what *kinds* of thing exist and how they relate. Five classes
are abstract, which is what lets one query span several concrete types — asking
for parties returns all 8 customers and 6 suppliers together. See
[docs/08-ontology-layer.md](docs/08-ontology-layer.md).

**The SAP BDC catalog** — 10 processes, 334 data products, 2,243 CDS entities.
This is metadata about *what data exists*: which entities are published, how they
are annotated, how they associate.

Neither is transactional supply chain data — there are no shipments, inventory
levels or purchase orders in the catalog half. The scenario engine does carry a
19-node network with real capacity and inventory for disruption modelling; for
production supply-chain analytics see the SAP Supply Chain 360 app.

The app previously called the catalog "the ontology". It is not one: a catalog
cannot express that a Supplier and a Customer are both Parties, so it cannot
answer "which parties are affected" in a single pass.

---

## Running it

```bash
npm install
npm run export-data      # build data/sc_ontology.json from the BDC catalog
npm run deploy-views     # create the Snowflake views + verify parity (optional)
npm run dev              # server :3009, client :5179
```

Open <http://localhost:5179>.

Cortex Analyst needs `server/.env`:

```
SNOWFLAKE_ACCOUNT=…
SNOWFLAKE_USER=…
SNOWFLAKE_PRIVATE_KEY_PATH=…
BDC_SEMANTIC_VIEW=SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.SUPPLY_CHAIN_ONTOLOGY_MODEL
PORT=3009
```

---

## Pages

| Page | What it shows |
|---|---|
| Overview | The ontology stack and catalog totals, lenses by source system, industry and provenance |
| **Ontology Model** | The 15 classes and 11 relations as a left-to-right tree, each node stating its instance count. Abstract/Concrete/Both toggle — *Concrete* deliberately shows ten disconnected classes, because stripping the abstract layer leaves nothing joining a Supplier to a Customer. Relations are off by default and marked stored, inferred or abstract; selecting an abstract class shows the breakdown that proves the abstraction |
| SAP BDC Catalog | Process → data product → entity, filterable and expandable. Labels sit below the circles, since a 30-character entity name cannot fit inside an 18px node. Renamed from "Ontology Graph": it is a catalog, not an ontology |
| Graph Traversal | Breadth-first expansion and shortest association path |
| Business Processes | Per-process rollups and members |
| Use Cases | Mapping to BDC Intelligent Applications |
| Correlation | Process coupling via the ODM master-data overlay |
| Coverage & Scorecard | Readiness scoring across the slice |
| Ask the Ontology | Cortex Analyst over the supply-chain semantic view |
| Guided Demo | Seven-step walkthrough of the hurricane scenario, with click targets pinned on live components |
| **Scenario Studio** | Build a disruption from five event types; results bucketed by the response each needs |
| **Ripple Map** | Geography and topology side by side, selection synced, cascade played one lane at a time with the camera following each beat. A deliberate zoom on the topology panel is preserved across beats, with a **Reset view** control to refit. Each beat carries a subtitle, popout KPI cards showing what changed, and an "explain this step" popover with the arithmetic |
| **Mitigation** | Reroutes inside real capacity, what cannot be saved and why, plus an AI you can interrogate |
| **Optimization Map** | The recovery as a movie: one beat per reroute, the replaced lane struck through and the new one drawn in, with the receiving plant's headroom before and after. Ends on the plant the plan leaves tightest |

---

## Briefing documents

Two Word deliverables are generated from the running application, so their figures
cannot drift from what it actually reports:

```bash
npm run dev                              # the generators query the live API
python3 tools/build_management_summary.py # executive briefing
python3 tools/build_demo_scripts.py       # six per-persona demo scripts
```

| Document | Contents |
|---|---|
`Supply_Chain_Ontology_Management_Summary.docx` | 11 sections: exposure, scenario library, personas, a recommended showcase, and an explicit real-versus-modelled table |
`Supply_Chain_Ontology_Demo_Scripts.docx` | Six standalone scripts — Risk Manager, VP/COO, CFO, Plant Manager, Account Director, Architect — each with an action/say table, the numbers to land, a closing line and expected questions |

Both write to `~/Documents/SAP/`. Layout helpers live in `tools/docx_kit.py`, shared
by both generators so they cannot drift apart in styling.

---

## Presales kit

A separate set of deliverables aimed at a Snowflake SE rather than a customer,
published to the SAP Partnership Compass page on Seismic. Seismic has no API, so
the generators write a local folder and the upload is manual.

```bash
python3 tools/build_presales_kit.py   # three Word documents
python3 tools/build_presales_deck.py  # ten-slide deck, screenshots from the video
```

Both write to `~/Documents/SAP/Supply_Chain_Ontology_Presales_Kit/`. Unlike the
briefing documents above they read `data/*.json` rather than the live API, so they
do not need `npm run dev` running — but they are only as current as the last
export.

| File | Contents |
|---|---|
| `00_START_HERE.docx` | What is in the kit, which file to open when, the demo in six numbers, the real-versus-modelled discipline |
| `03_SE_Quick_Start.docx` | Positioning, a ten-minute demo path, the scenario library, persona-to-page map, discovery questions, seven objections with answers |
| `06_Setup_and_Access.docx` | Live URL, local run, the Snowflake object inventory across both schemas, the scope rule |
| `00_Presales_Overview.pptx` | Ten slides — problem, product, cascade, response, result, library, architecture, real-versus-modelled, the ask |

The remaining kit files are copies of existing assets: the management summary, the
demo scripts, the documentation handbook and the narrated walkthrough video.

`build_presales_deck.py` pulls four screenshots straight out
of `Supply_Chain_Ontology_Walkthrough.mp4` with ffmpeg, cached in
`tools/.presales_shots/`. Two consequences worth knowing:

- The video is the narrated cut. The silent `_video.mp4` sibling has no audio
  track — check with `ffprobe` before substituting it.
- Screenshots age with the UI. The recording predates renaming *Ontology Graph* to
  *SAP BDC Catalog* and the addition of the *Ontology Model* page, so both new
  documents carry that caveat explicitly. Re-record before adding a fifth frame,
  or the deck will contradict the live app.

Check the deck renders before shipping it — a text box that overflows in
PowerPoint is invisible in the XML:

```bash
soffice --headless --convert-to pdf 00_Presales_Overview.pptx --outdir /tmp/deckchk
pdftoppm -png -r 70 /tmp/deckchk/00_Presales_Overview.pdf /tmp/deckchk/p
```

Wide screenshots do not fit a full-width slide: at 1600×1132 a 12-inch box is
height-bound and the image lands at barely half the available width. The picture
slides put the screenshot in a 7.6-inch column with the KPI cards stacked beside
it instead.

---

## Scope rule

A data product is in scope when **either**

- its business process is Design to Operate (SAP's supply-chain process), **or**
- its line of business names Supply Chain, Manufacturing, Sourcing and
  Procurement, or R&D Engineering.

Line of business is a delimited multi-value string (`"Manufacturing,Supply Chain"`),
so it is matched per token. Matching the whole string would drop every product
carrying Supply Chain alongside another LOB — which is most of the interesting
cross-functional ones.

The identical rule is implemented twice, once in `tools/export_sc_ontology.py`
for the app's JSON and once in `tools/deploy_sc_views.py` for the Snowflake
views. `npm run deploy-views` asserts the two agree and fails if they drift,
because otherwise Ask would answer over a different population than the pages
display.

---

## How the graph is actually shaped

Worth knowing before demoing traversal:

- **No entity association crosses a data product boundary** — all 281 stay
  inside their own product. An entity-level shortest path can never leave the
  product it starts in.
- The 269 connected entities form **94 separate components**, the largest
  holding 14. **69 entities declare no associations at all.**
- Cross-product linkage lives one level up, in the **ODM overlay**: 20 of 36
  products connect, entirely through the canonical object **Plant**, which sits
  at the centre of a star with degree 19.

The Graph Traversal page states this on screen rather than implying a richer
graph than exists.

---

## Snowflake objects

Two schemas, matching the two halves described above.

**The ontology** — `SAP_SUPPLY_CHAIN.ONTOLOGY`, five layers:

```
L1  KG_NODE  2,662     KG_EDGE  5,457     instances + 15 schema nodes
L2  20 ONT_* tables                       classes, relations, properties, rules
L3  40 views · 4 UDFs · 10 procedures     VW_ONT_* span several concrete types
L4  SUPPLY_CHAIN_BASE                     concrete lookups
    SUPPLY_CHAIN_ONTOLOGY_MODEL           cross-type reasoning
    SUPPLY_CHAIN_METADATA_MODEL           governance and provenance
L5  SUPPLY_CHAIN_AGENT                    7 tools, routes to the right layer
```

**The BDC catalog** — views over the parent ontology's `CORE` tables, no copies,
so there is one source of truth:

```
SAP_BDC_ONTOLOGY.SUPPLY_CHAIN
  V_PRODUCT          36    V_ENTITY_EDGE   281
  V_ENTITY          338    V_ODM_EDGE       19
  V_PROCESS           3    V_PROCESS_ROLLUP
  SUPPLY_CHAIN_ONTOLOGY_MODEL   (semantic view: 17 facts, 11 metrics)
```

### Two views share the name `SUPPLY_CHAIN_ONTOLOGY_MODEL`

They are different objects in different schemas, and their specs are kept apart
by filename:

| Spec file | Deploys to |
|---|---|
| `SUPPLY_CHAIN_ONTOLOGY_MODEL.sv.yaml` | `SAP_SUPPLY_CHAIN.ONTOLOGY` (the abstract layer) |
| `SUPPLY_CHAIN_ONTOLOGY_MODEL_BDC.sv.yaml` | `SAP_BDC_ONTOLOGY.SUPPLY_CHAIN` (the catalog) |

`sv-write --source-object` derives the workspace filename from the view name
alone, so writing either one without an explicit `--file-path` will overwrite the
other. Pass `--file-path` when the name is already taken.

### Editing a semantic view

Use the `cortex agent-studio` CLI, not a text editor:

```bash
cortex agent-studio sv-edit --file-path SUPPLY_CHAIN_ONTOLOGY_MODEL_BDC.sv.yaml \
  --operations '[{"operation":"validate_yaml"}]'
cortex agent-studio sv-deploy --file-path SUPPLY_CHAIN_ONTOLOGY_MODEL_BDC.sv.yaml \
  --fqn SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.SUPPLY_CHAIN_ONTOLOGY_MODEL
```

**Do not promote numeric columns to facts in this model.** Leave them as
dimensions and expose aggregates as metrics — which is how `sv-generate`
classifies them by default.

Cortex Analyst does not query through `SEMANTIC_VIEW(...)`; it compiles the
logical model into base-table SQL itself, and it omits fact columns from the CTE
projection while still referencing them in the outer `SELECT`:

```sql
WITH __v_product AS (SELECT product_label FROM …V_PRODUCT)
SELECT product_label, product_entity_count      -- not projected above
FROM __v_product ORDER BY product_entity_count DESC
```

That fails with `invalid identifier 'PRODUCT_ENTITY_COUNT'`, even though the same
fact resolves correctly in a hand-written `SEMANTIC_VIEW(… FACTS …)` query.
Dimensions are always projected, so row-level numbers belong there.

Two further traps found the hard way:

- A fact whose **unqualified** expression names a column that exists on more than
  one table in the model is dropped **silently** — `sv-edit` reports success and
  the fact is simply absent. Three were lost this way. Qualifying the expression
  (`V_PRODUCT.ENTITY_COUNT`) makes `sv-edit` accept it but produces SQL that
  fails at run time, because the CTE is aliased `__v_product`. The fix is to make
  the column name unique in the view — hence the `PRODUCT_` prefixes above.
- `V_ENTITY.PROCESS_CODE` must not join to `V_PROCESS`. Entities reach their
  process through their product; a direct join creates a second path to the same
  dimension.

Always count facts and metrics after editing, and run the example questions
before calling it done — the model can validate and deploy clean and still fail
every query.

---

## Public static build

A credential-free snapshot for sharing, following the `supply-chain-360-public`
pattern. `VITE_STATIC=1` makes the client read pre-baked JSON from
`client/public/data/` instead of calling `/api`.

```bash
npm run dev            # in one shell — the baker reads from the live API
npm run bake           # writes ~280 snapshots (incl. ~80 Ask Cortex answers) to client/public/data/
npm run build:static
npm run preview:static # http://localhost:8899
```

Commit `client/public/data/*.json` — the Pages workflow refuses to deploy with
fewer than 20 snapshots, since the site would otherwise build green and render
empty.

What the public build cannot do, and says so on screen:

- **Ask** is disabled — Cortex Analyst needs Snowflake credentials.
- **Ask Cortex** shows the baked default answer for each preset view, lot and
  class; follow-up questions need the live app.
- **Shortest path** is hidden — the pair space is quadratic; only expansion from
  the 24 most-connected entities is baked.

Snapshot filenames fold percent-escapes to `-`, because a literal `%3A` in a
filename is decoded back to `:` by the web server and would never match the file
on disk. The rule is implemented in both `tools/bake_static.py` and
`client/src/lib/api.ts` and the two must stay identical.

---

## Refreshing the data

Three independent artifacts, three refresh steps.

```bash
npm run export-data                       # data/sc_ontology.json   BDC catalog
python3 tools/export_ontology_schema.py   # data/sc_ontology_schema.json  classes
python3 tools/export_scenario_network.py  # data/sc_network.json     19 nodes
npm run deploy-views                      # re-assert Snowflake/JSON parity
npm run bake                              # re-snapshot for the public build
```

`export-data` reuses the parent explorer's own derivation functions
(`ontology_builder.process_rollup`, `correlation`, `scorecard`, `insight_apps`,
`semantic_roles`, `lens_summary`) over the filtered dictionary. Copying the
parent's precomputed blocks instead would publish 334-product figures inside a
36-product app.

`export_ontology_schema.py` reads `SAP_SUPPLY_CHAIN.ONTOLOGY` and reports any
mapping defect it finds — a concrete class with no physical mapping, or an
abstract class that has one — exiting non-zero so a broken export cannot be baked
silently. Counts come from `INFORMATION_SCHEMA`, not `SHOW`: `SHOW PROCEDURES`
reports 43 in that schema because it includes built-ins, where the real figure
is 10.

The baker defaults to `localhost:3009` and honours `BAKE_HOST`:

```bash
BAKE_HOST=http://localhost:3011 python3 tools/bake_static.py
```

It emits 19 ontology snapshots — the schema, one per toggle position, and one per
class. Class snapshots are driven off the schema rather than a hardcoded list, so
a new class is picked up on the next bake.
