# 4. Execution

Commands to run, refresh, and publish.

---

## First run

```bash
git clone https://github.com/sfc-gh-dfreriks/supply-chain-ontology.git
cd supply-chain-ontology
npm install
npm run dev
```

Open <http://localhost:5179>. All eight pages work immediately from the three
committed data files — `data/sc_business_ontology.json` (the governed domain),
`data/sc_network.json` (the scenario network) and `data/sc_ops_thread.json`
(digital thread and operations pulse). No Snowflake connection is needed.

Two things need credentials: the **Ask Cortex** buttons and the **AI briefing**
on Mitigation & Recovery, both `AI_COMPLETE` with `claude-opus-5-5`. Both state
what is missing rather than failing silently; simulation and the optimizer work
without them.

```bash
cp server/.env.example server/.env
# fill in account, user, private key path
npm run dev
```

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Server :3009 and client :5179 together |
| `npm run build` | Typecheck and build both workspaces |
| `npm run start` | Run the built server |
| `npm run refresh` | Re-export the domain, network and thread, bake, reconcile |
| `npm run export-network` | Walk the domain into `data/sc_network.json` only |
| `npm run bake` | Snapshot the live API to `client/public/data/` |
| `npm run build:static` | Build the credential-free public bundle |
| `npm run preview:static` | Serve that bundle on :8899 |
| `npm run build-land` | Fetch and convert the world land outline (run once) |
| `npm run verify-scenario` | Build the server, then assert checks across all five disruption kinds |
| `npm run docs-word` | Word versions of these documents |
| `npm run video` | Re-record the narrated walkthrough |

---

## Ports

| Port | What |
|---|---|
| 3009 | Express API (`PORT` in `server/.env`) |
| 5179 | Vite dev client, proxies `/api` to 3009 |
| 8899 | `preview:static` |

---

## Refreshing after the ontology changes

When a steward changes a concept, relationship or representation in the Supply
Chain domain, run one command:

```bash
npm run refresh          # python3 tools/refresh_all.py
npm run refresh -- --check   # reconcile only, change nothing
```

It runs, in order: `export_business_ontology.py`, `export_ontology_network.py`,
`export_ops_thread.py`, a server build, a server on a free port,
`bake_static.py`, then a reconcile that re-walks the domain and compares it with
what was just exported. Any mismatch fails the run.

Then check the diff of `data/` and `client/public/data/` before committing.
A changed scenario total is either a real data change or a broken walk; read the
`lineage` block in `data/sc_network.json` to see which object each input
resolved to.

---

## Publishing the public build

GitHub Pages builds from the committed snapshots.

```bash
npm run refresh         # or: npm run dev, then npm run bake
git add data client/public/data
git commit -m "refresh snapshots"
git push
```

`.github/workflows/deploy.yml` runs on pushes touching `client/**`, refuses to
deploy with too few snapshots, and builds with `BASE_PATH=/<repo-name>/`.
The guard exists because a missing-snapshot build succeeds and produces a site
where every page renders empty — worse than a red build.

---

## What the public build can and cannot do

It **can** run every page: the dashboard, the Ontology page with each concept's
detail, the digital thread, and the scenario section for the nine preset
disruptions — ripple animation, mitigation plan and the recovery movie. Simulate
is a POST, so one result per preset is baked and keyed by a signature of the
disruption.

It **cannot**, each stated on screen:

- **Ask Cortex and the scenario AI** — need Snowflake credentials.
- **Custom disruptions** — the sliders need the live server.

The simulate filename rule lives in both `tools/bake_static.py` (`sim_name`) and
`client/src/lib/api.ts` (`simName`). The two must stay identical.

---

## Word versions of the documentation

Every markdown file in this set also ships as a branded Word document, for people
who will not open a repository.

```bash
npm run docs-word        # or: python3 tools/build_docs_docx.py
```

Writes nine files to `~/Documents/SAP/Supply_Chain_Ontology_Docs/` — one per source
document plus a combined handbook with a contents page — alongside the two
narrative deliverables (`Supply_Chain_Ontology_Management_Summary.docx` and
`..._Demo_Scripts.docx`), which are generated separately from `tools/facts.py` and the live API.

`tools/build_docs_docx.py` is a bespoke renderer rather than a pandoc call, because
the output has to match the existing Word deliverables: same palette, page setup,
navy table headers and `keep_with_next` behaviour. It handles ATX headings, fenced
code, bullets, numbered lists, blockquotes, rules, GFM tables and inline **bold**,
`code`, *italic* and links.

Four details in that renderer exist because the alternative silently loses content:

- Table rows are parsed with or without leading and trailing pipes. GFM does not
  require them and 139 rows here omit them.
- An escaped `\|` inside a cell is protected before the row is split, otherwise a
  code span containing `||` is torn across two cells.
- Code spans are split *inside* bold segments, not alongside them, because a glob
  like `client/**` legitimately contains `**`.
- Headings render through the inline parser too — several H3s in the references are
  a linked repository name.

After a run, confirm nothing was dropped: table and fence counts should match the
source, and no `**`, `` ` `` or `](http` should survive outside a code block.

---

## The narrated walkthrough video

A five-minute video (re-recorded 14 Nov 2026) that opens on the Business Ontology, then the Austin hurricane scenario, driving the real
app rather than a mock-up.

```bash
npm run video                          # all four phases
python3 tools/video/build.py --voice Daniel --phase narrate
```

Needs the app running on 5179 and the API on 3009. Writes
`~/Documents/SAP/Supply_Chain_Ontology_Walkthrough.mp4` — 1600x1132, H.264, about
20 MB.

Four phases, in order, because each depends on the last:

| Phase | What it does |
| --- | --- |
| `narrate` | `say` synthesises each line; ffprobe measures it |
| `cards` | Pillow renders one caption strip per beat |
| `capture` | Playwright drives the live app, recording video |
| `assemble` | ffmpeg composites video, captions and narration |

The script lives in `tools/video/segments.py` — one entry per beat, carrying the
narration, the caption copy and the actions that put the app in the right state.

### Three things that were wrong first

**Timing has to be capture-led.** The first version computed segment start times
from narration lengths and assumed the browser would keep up. Page loads and
sidebar navigation are not free, so the recording came out 10s longer than the
timeline and the captions drifted progressively early. The capture now records the
wall-clock offset it actually reached for each beat, and the narration is laid onto
those offsets with `adelay` and `amix` rather than concatenated.

**A single-frame PNG cannot be faded.** Its only frame sits at PTS 0, so
`fade=t=in:st=246` leaves that frame fully transparent and the caption never
appears — every one of the 17 was invisible in the first render, while ffmpeg
reported success. Each caption is now fed with `-loop 1 -t <window>` so the fade
has real frames, and `setpts` moves it to its slot.

**Captions need their own band.** Overlaying cards on the app hid whichever panel
they landed on, and on these pages every region carries something. The canvas is
padded to 1132px and captions live in the bottom 132px, so nothing is covered.

Narration is macOS `say` (Samantha by default), which is clear but not
indistinguishable from a person — there is no neural voice available offline. The
phrasing carries what the voice cannot: contractions, short sentences and
`[[slnc]]` pauses. Swap voices with `--voice`.

After a render, check that every caption is actually visible — sample a frame
mid-segment and confirm the bottom band is not uniform navy.

---

## Troubleshooting

**A page is empty in the static build** — that view was not baked. Check
`client/public/data/` for the expected filename; the client shows "not in this
snapshot" rather than crashing.

**`npm run refresh` fails at reconcile** — the domain changed between export and
re-walk, or a walk no longer resolves (a relationship renamed, a representation
removed). Read the message: it names the concept. Fix the domain or the walk,
do not weaken the check.

**A scenario reports $0 at risk** — check it is not a lane closure, and re-run
`npm run verify-scenario`. A zero is indistinguishable from good news.

**The AI errors with "unknown model"** — `SCENARIO_LLM_MODEL` names a model this
account does not serve. Probe with `SELECT AI_COMPLETE('claude-opus-5-5', 'ok')`
and set the variable accordingly.

**Pages deploys fail on `npm ci` but local builds pass** — the lockfile and the
workspace names have diverged. Run `npm install`, commit the lockfile. See
[findings](05-findings.md#npm-install-forgives-what-npm-ci-refuses).
