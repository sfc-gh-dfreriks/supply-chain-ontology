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

Open <http://localhost:5179>. Eleven of the twelve pages work immediately from the
two committed data files — `data/sc_ontology.json` for the ontology pages and
`data/sc_network.json` for the scenario pages. No Snowflake connection is needed for
any of them.

Two things need credentials: **Ask Cortex** (Cortex Analyst) and the **AI
briefing** on the Mitigation page (`AI_COMPLETE`). Both state what is missing rather
than failing silently, and the scenario simulation and optimizer work without them.

```bash
cp server/.env.example server/.env
# fill in account, user, private key path
npm run dev
```

The Ask page states what is missing if the configuration is incomplete, rather
than failing silently.

---

## Scripts

| Command | Does |
|---|---|
`npm run dev` | Server :3009 and client :5179 together |
`npm run build` | Typecheck and build both workspaces |
`npm run start` | Run the built server |
`npm run export-data` | Rebuild `data/sc_ontology.json` from the parent catalog |
`npm run deploy-views` | Create the Snowflake views, assert parity, fail on drift |
`npm run bake` | Snapshot the live API to `client/public/data/` |
`npm run build:static` | Build the credential-free public bundle |
`npm run preview:static` | Serve that bundle on :8899 |
`npm run deploy-scenario` | Create `SAP_SUPPLY_CHAIN.SCENARIO`, verify row counts and join fanout |
`npm run export-network` | Export the scenario network to `data/sc_network.json` |
`npm run build-land` | Fetch and convert the world land outline (run once) |
`npm run verify-scenario` | Build the server, then assert 20 checks across all five disruption kinds |

`export-data` needs the [parent explorer](06-references.md#parent-project) as a
sibling directory — it imports `ontology_builder` rather than duplicating it.

Two Word deliverables are generated separately, and both read from the running app
so their figures cannot be transcribed wrongly:

```bash
python3 tools/build_management_summary.py   # executive briefing
python3 tools/build_demo_scripts.py        # six per-persona demo scripts
```

Layout helpers are in `tools/docx_kit.py`, shared by both. When changing it, check
the other document still renders — the management summary was verified byte-identical
across the extraction, and that check is worth repeating.

---

## Ports

| Port | Process |
|---|---|
3009 | Express API |
5179 | Vite dev server (proxies `/api` → 3009) |
8899 | Static preview |

Both app ports are `strictPort`, so a clash fails loudly instead of silently
moving. If 3009 is taken, change `PORT` in `server/.env` **and** the proxy target
in `client/vite.config.ts` — they must match.

---

## Refreshing after the SAP catalog changes

In order:

```bash
npm run export-data     # re-slice from the parent catalog
npm run deploy-views    # re-assert Snowflake/JSON parity
npm run bake            # re-snapshot for the public build
```

`deploy-views` is the gate. If the Python and SQL scope rules have drifted it
exits non-zero, and the run stops before a mismatched semantic view can go out.

If product or entity counts change, the figures quoted in these docs and in the
README go stale. The app reads them live; the prose does not.

The scenario network refreshes independently, since it comes from different tables:

```bash
npm run deploy-scenario   # rebuild the SCENARIO views
npm run export-network    # re-export the served network
npm run verify-scenario   # 20 assertions before trusting it
```

Run `verify-scenario` after **any** change to `scenario.ts` or `mitigate.ts`. It is
what caught a rate mismatch and a silently zero-valued lane closure; see
[findings](05-findings.md#the-rate-mismatch).

---

## Editing the semantic view

Always through the CLI:

```bash
cortex agent-studio sv-edit --file-path SUPPLY_CHAIN_ONTOLOGY_MODEL.sv.yaml \
  --operations '[{"operation":"validate_yaml"}]'

cortex agent-studio sv-deploy \
  --file-path cortex_project/SUPPLY_CHAIN_ONTOLOGY_MODEL.sv.yaml \
  --fqn SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.SUPPLY_CHAIN_ONTOLOGY_MODEL
```

After **any** edit, do both of these:

1. **Count facts and metrics.** `sv-edit` can report success and silently drop an
   operation.
2. **Run the example questions.** A model that validates and deploys clean can
   still fail every query.

```bash
curl -s localhost:3009/api/ask/examples | python3 -c '
import json,sys
for q in json.load(sys.stdin): print(q)'
```

Read [findings](05-findings.md#the-semantic-view-trap) before changing facts.

---

## Publishing the public build

GitHub Pages builds from the committed snapshots.

```bash
npm run dev             # one shell
npm run bake            # another
git add client/public/data
git commit -m "refresh snapshots"
git push
```

`.github/workflows/deploy.yml` runs on pushes touching `client/**`, refuses to
deploy with fewer than 20 snapshots, and builds with
`BASE_PATH=/<repo-name>/` because Pages serves project sites from a
subdirectory.

Enable it once under **Settings → Pages → Source: GitHub Actions**.

The guard exists because a missing-snapshot build succeeds and produces a site
where every page renders empty — worse than a red build.

---

## What the public build can and cannot do

It **can** run every ontology page, and the whole scenario section for the six
preset disruptions — the ripple animation with its camera and per-beat narration,
the mitigation plan, and the Optimization Map's beat-by-beat recovery. Simulate is
a POST that a static site cannot call, so one result per preset is baked and keyed
by a signature of the disruption; the Optimization Map needs no extra data because
it reads the `plan` already inside that same result.

It **cannot** do these, each stated on screen rather than left to fail:

- **Ask** — needs Snowflake credentials, which a public site cannot hold.
- **The scenario AI briefing** — same reason. The simulation and the optimizer
  behind it still work, so every number on the page is real.
- **Custom disruptions** — the sliders need the live app, because the simulation
  runs server-side. Scenario Studio says so up front rather than letting someone
  drag a slider into a dead end.
- **Shortest path** — the pair space is quadratic; only expansion from the 24
  most-connected entities is baked.

Everything else works from the snapshot.

The simulate filename rule lives in both `tools/bake_static.py` (`sim_name`) and
`client/src/lib/api.ts` (`simName`). The two must stay identical, exactly like the
snapshot filename rule.

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
`..._Demo_Scripts.docx`), which are generated separately from live application data.

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

A four-and-a-half minute video of the Austin hurricane scenario, driving the real
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

**Ask returns `invalid identifier`** — a numeric column was promoted to a fact.
See [findings](05-findings.md#the-semantic-view-trap). The error response
includes the generated SQL; read it.

**A page is empty in the static build** — that view was not baked. Check
`client/public/data/` for the expected filename; the client shows "not in this
snapshot" rather than crashing.

**Traversal snapshots 404 in the static build** — the filename sanitizer in
`tools/bake_static.py` and `client/src/lib/api.ts` has drifted. They must apply
the identical substitution. Test over HTTP, not off disk.

**`deploy-views` fails parity** — the Python and SQL scope rules disagree. Fix
the rule, do not weaken the check.

**Shortest path always says "no path"** — expected between different components.
The graph is 94 components; see
[findings](05-findings.md#the-graph-is-not-what-it-looks-like).

**A scenario reports $0 at risk** — check it is not a lane closure, and re-run
`npm run verify-scenario`. A zero is indistinguishable from good news, so the
harness asserts non-zero where non-zero is structurally certain.

**The scenario AI errors with "unknown model"** — `SCENARIO_LLM_MODEL` names a model
this account does not serve. Probe with
`SELECT AI_COMPLETE('claude-4-sonnet', 'ok')` and set the variable accordingly.

**Pages deploys fail on `npm ci` but local builds pass** — the lockfile and the
workspace names have diverged. `npm install` repairs that silently; `npm ci` refuses
to. Run `npm install`, commit the lockfile. See
[findings](05-findings.md#npm-install-forgives-what-npm-ci-refuses).
