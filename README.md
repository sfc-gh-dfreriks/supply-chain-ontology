# Supply Chain Ontology

A supply-chain disruption and traceability app **built on Snowflake Business
Ontology**. Every page runs on the governed "Supply Chain" domain: 21 concepts,
26 typed relationships and 25 representations linking each concept to the
Snowflake objects that hold its data. Model a supplier failure or a plant
outage, watch it ripple through the network, plan the recovery inside real
capacity, and trace a bad component lot to the customers it reached.

---

## How it is built on the ontology

Nothing in the app names a table. Each input is found by walking the governed
domain, then read from the representation a steward linked to that concept:

| App input | Found by walking | Concept → representation |
|---|---|---|
| Suppliers, plants, customers | endpoints of **supplies** and **ships to** | Supplier, Plant, Customer → `VW_ONT_*` |
| Material flows | the kinds (IS_A) of the concept **Material Category classifies** | Inbound / Outbound / Inter Plant Flow → `VW_ONT_*` |
| Capacity and inventory buffers | Plant properties | Plant → `VW_ONT_PLANT` |
| Substitution (who can make what) | Material Category, **produced by** Plant | Material Category → `ONTOLOGY.V_PRODUCES` |
| Order economics | Sales Order, **fulfilled by** Plant | Sales Order → `ANALYTICS.DT_ORDER_FULFILLMENT` |
| Digital thread | System Serial **has part** Component Lot, **shipped on** Sales Order, **placed by** Customer | Component Lot → `VW_ONT_LOT_BLAST_RADIUS`, plus class views |
| Operations pulse | Plant and Equipment facts | Plant → `DT_OPERATING_RATE`, `DT_COMPONENT_COVER`; Equipment → `DT_EQUIPMENT_HEALTH`, `A_WORK_CENTER` |

Change a relationship or representation in Snowflake and the next refresh reads
from the new place. The rewrite was gated on parity: all nine scenario presets
and the full digital thread produce identical results to the previous,
table-driven version.

What Business Ontology does not model, and so stays in the scenario engine's
code: plant-to-plant transfer as an edge type, cardinality, the substitution
rule (same category plus spare hours) and buffer timing.

---

## Running it

```bash
npm install
npm run dev              # server :3009, client :5179
```

Open <http://localhost:5179>. The pages read exported JSON, so they run with no
connection. Ask Cortex (AI_COMPLETE, `claude-opus-5-5`) needs `server/.env`:

```
SNOWFLAKE_ACCOUNT=…
SNOWFLAKE_USER=…
SNOWFLAKE_PRIVATE_KEY_PATH=…
PORT=3009
```

---

## Pages

| Page | What it shows |
|---|---|
| **Executive Dashboard** | Operations pulse (OTIF, late cost, operating rate, tool risk, component cover per plant), the governed domain, and the network the scenarios run on |
| **Ontology** | The governed Supply Chain domain: graph, each concept's definition, relationships, representations and change history (with a link to Snowsight), and the table of what the app reads through it |
| **Scenario Studio** | Build a disruption from five event types; results bucketed by the response each needs |
| **Ripple Map** | Geography and topology side by side, the cascade played one lane at a time |
| **Mitigation & Recovery** | The recovery as a movie, one beat per reroute, then the plan: reroutes inside real capacity, what cannot be saved and why, plus an AI you can interrogate |
| **Digital Thread** | Orders, built systems, component lots and tools: "which customers did this bad lot reach?" answered by walking the governed relationships |
| **Guided Demo** | Seven-step walkthrough of the hurricane scenario |
| **Ask Cortex** (most pages) | A grounded AI_COMPLETE reading of the view on screen, citing the governed definitions |

Old links to `#optimize` open Mitigation & Recovery.

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

These generators predate the move onto Business Ontology and may quote removed
pages; regenerate or edit before reuse.

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

---

## Public static build

A credential-free snapshot for sharing. `VITE_STATIC=1` makes the client read
pre-baked JSON from `client/public/data/` instead of calling `/api`.

```bash
npm run dev            # in one shell — the baker reads from the live API
npm run bake           # snapshots, incl. one per concept and ~80 Ask Cortex answers
npm run build:static
npm run preview:static # http://localhost:8899
```

Commit `client/public/data/*.json`. The public build shows the baked default
Ask Cortex answer for each preset view, lot and concept; follow-up questions and
custom sliders need the live app.

---

## Refreshing the data

One command, in order, and it fails loudly if anything is out of step:

```bash
npm run refresh        # python3 tools/refresh_all.py
```

| Step | Tool | Output |
|---|---|---|
| 1 | `export_business_ontology.py` | `data/sc_business_ontology.json`: the domain |
| 2 | `export_ontology_network.py` | `data/sc_network.json`: the scenario network, found by walking the domain |
| 3 | `export_ops_thread.py` | `data/sc_ops_thread.json`: thread and pulse, found the same way |
| 4–6 | build, serve, `bake_static.py` | `client/public/data/*.json` |
| 7 | reconcile | re-walks the domain and compares with steps 2–3 |

`python3 tools/refresh_all.py --check` reconciles without changing anything.
Both walking exporters also take `--check` on their own.

All three exporters are read-only: `SYSTEM$GET_GLOSSARY_*` calls and SELECTs on
represented objects.
