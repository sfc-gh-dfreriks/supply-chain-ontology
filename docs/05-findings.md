# 5. Findings

Things that were not obvious, cost real time, and are worth knowing before
building something similar. The first three sections date from the SAP BDC
catalog explorer and its semantic view, both removed on 13 Nov 2026; they are
kept as history because the lessons transfer. Everything from "Percent-escapes"
on applies to the current app.

---

## History — catalog-era findings

> Superseded. These describe the catalog pages and natural-language query page
> the app no longer has.

## The graph is not what it looks like

Building a traversal page implies a richly connected graph. Measuring it first
was worth doing.

### No entity association crosses a data product boundary

**0 of 281.** Every declared association stays inside its own data product.

The consequence is concrete: an entity-level shortest path **can never leave the
product it starts in**. A page offering "find the path between any two entities"
is overselling unless it says so.

This was found while investigating why the demo panel showed
`crossProduct: 0`. The first assumption was a filtering bug — the edge filter
requires both endpoints in scope, so cross-product edges could plausibly have
been dropped. Checking the parent ontology settled it:

```
parent edges              2376
parent cross_product=True    0
parent cross edges with BOTH endpoints in SC scope: 0
parent cross edges with ONE  endpoint  in SC scope: 0
```

The parent has none either. The `EntityEdge.cross_product` flag exists in the
data model and is **never set true**. Code that trusts it paints every edge as
internal and is silently correct-looking.

The fix was to derive it from the endpoints' owning products instead, and to
report the real cross-product measures — `sum(cross_product_assoc)` = 92 across
26 of 36 products, and 19 ODM-linked pairs.

### The graph is 94 islands, not one graph

| Measure | Value |
|---|---|
Entities | 338 |
With at least one association | 269 |
**Isolated (no associations at all)** | **69** |
Connected components | 94 |
Largest component | 14 |
Component sizes | 14, 14, 12, 10, 10, 8, 6, 5, 4, 4, … |

So "no path found" is a **correct and common answer**, not an error. The
traversal service returns it with a reason rather than throwing, and depth
sliders above 3 rarely change anything because the largest component is 14 nodes.

### Cross-product linkage is a star centred on Plant

At the product level, via the ODM overlay:

| Measure | Value |
|---|---|
Products in the ODM graph | 20 of 36 |
Components | 1 |
`Plant` degree | **19** |
Every other product's degree | **1** |
Canonical objects doing the linking | **`Plant`, and only `Plant`** |

Every path between two non-`Plant` products is exactly two hops, through
`Plant`. That is not a rich graph — it is a genuine finding: **`Plant` is the
master-data spine of the SAP supply chain**, and in this slice it is the *only*
canonical object joining products.

The Graph Traversal page states all of this on screen. Turning a limitation into
the headline insight was better than hiding it behind a depth slider.

---

## The semantic view trap

The single largest time sink. Three separate wrong conclusions before the right
one — recorded in order, because the wrong turns are instructive.

### Symptom

`sv-generate` classified numeric columns as dimensions. Promoting them to facts
via `remove_dimension` + `add_fact` reported **41 of 41 operations applied**, and
`V_PRODUCT` came back with **7 facts instead of 10**. Three vanished with no
error, and the paired `remove_dimension` had already run — so the columns were
gone from the model entirely.

### Wrong conclusion 1 — "logical name collision"

The three missing facts shared logical names with facts on other tables, so the
theory was that `add_fact` de-duplicates by name.

**Disproved** by rebuilding with model-unique names
(`SC_PRODUCT_ENTITY_COUNT` etc.). The same three dropped again.

### Actual cause

The three were exactly those whose **unqualified physical column name exists on
more than one table** in the model:

| Column | Also on |
|---|---|
`ENTITY_COUNT` | `V_PRODUCT`, `V_PROCESS_ROLLUP` |
`ASSOCIATION_COUNT` | `V_PRODUCT`, `V_ENTITY` |
`CROSS_PRODUCT_ASSOCIATIONS` | `V_PRODUCT`, `V_PROCESS_ROLLUP` |

An ambiguous expression makes `add_fact` **drop the operation silently**.

### Wrong conclusion 2 — "qualify the expression"

Writing `V_PRODUCT.ENTITY_COUNT` made `sv-edit` accept all three, produced 10/10
facts, validated clean, and deployed successfully.

**It then failed every query.** Cortex Analyst does not query through
`SEMANTIC_VIEW(...)` — it compiles the logical model into base-table SQL itself,
aliasing each table as a CTE:

```sql
WITH __v_product AS (SELECT process_code FROM …V_PRODUCT)
SELECT …
```

`V_PRODUCT.ENTITY_COUNT` is an invalid identifier inside `__v_product`. A model
can validate, deploy, and be entirely broken.

### The real answer

Two changes:

**1. Make the column names unique in the view.** `V_PRODUCT` projects explicit
columns and renames the three to `PRODUCT_ENTITY_COUNT`,
`PRODUCT_ASSOCIATION_COUNT`, `PRODUCT_CROSS_ASSOC`. With unique names,
unqualified expressions work and nothing is dropped — 17 facts on the first pass.

**2. Do not promote numerics to facts at all.** Even unambiguous and unqualified,
facts still failed:

```
error: invalid identifier 'PRODUCT_ENTITY_COUNT'

WITH __v_product AS (
  SELECT product_label            -- fact column not projected
  FROM SAP_BDC_ONTOLOGY.SUPPLY_CHAIN.V_PRODUCT
)
SELECT product_label,
       product_entity_count       -- but referenced here
FROM __v_product
ORDER BY product_entity_count DESC
```

Analyst omits fact columns from the CTE projection while still referencing them
in the outer `SELECT`. The identical fact resolves correctly in a hand-written
`SEMANTIC_VIEW(… FACTS …)` query — so the model is fine and the generated SQL is
not.

**Dimensions are always projected.** So row-level numbers stay dimensions, and
aggregates are exposed as metrics — which is exactly how `sv-generate` classified
them before any of this. The final model is **2 facts, 12 metrics**, and 10 of 10
example questions pass.

### What made this findable

The error response originally returned only a message. Attaching the generated
SQL turned an opaque `invalid identifier` into an obvious diagnosis:

```ts
catch (e: any) {
  const err: any = new Error(String(e?.message || e));
  err.generatedSql = sql;
  throw err;
}
```

### Rules that came out of it

1. Leave numeric columns as dimensions; expose aggregates as metrics.
2. Make physical column names unique across the model's tables.
3. Never qualify a fact expression with its table name.
4. Count facts and metrics after every edit — success is not confirmation.
5. Run the example questions before calling it done.
6. Return the generated SQL on failure.

---

## Multi-path joins inflate aggregates

`V_ENTITY` carries a denormalized `PROCESS_CODE`. Joining it to `V_PROCESS`
alongside `V_PRODUCT → V_PROCESS` gives two paths to the same dimension, and
aggregates inflate.

The generator got this right unprompted — it built only
`V_ENTITY → V_PRODUCT → V_PROCESS`. It is asserted after generation anyway, and
the semantic description tells the model not to add the join back.

---

## Percent-escapes cannot be filenames

The static baker used `urllib.parse.urlencode`, so entity IDs containing `::`
produced filenames like `traverse__seed=…%3A%3A….json`. Every one 404'd.

The web server decodes `%3A` to `:` on the way in and looks for a file with a
literal colon. Both the baker and the client now fold unsafe characters to `-`
using the identical rule, with a comment on each side saying they must match.

Only reproducible **over HTTP** — the files were present and correct on disk.

---

## A shell quoting failure is not an app failure

A test loop building JSON with a nested `python3 -c` one-liner reported
`0 passed, 5 failed`. The outer shell had mangled the `:` characters, so the
payload never formed.

Rewriting the harness in Python gave the true result: 3 passed, 3 failed — which
then led to the real bug. Worth confirming the harness works before trusting a
red result.

---

## The rate mismatch

The mitigation optimizer compared **units needed over the whole event** against
**spare capacity per month**. For a 60-day outage that meant testing a two-month
requirement against one month of headroom, and it wrongly rejected reroutes that
were comfortably feasible:

```
before:  Inspection 4u vs 5 spare -> fits;  Metrology 6u vs 1 left -> REJECTED
after:   Inspection 2u/mo,        Metrology 3u/mo -> both fit exactly
         protected 55.7%  ->  91.4%
```

Both figures were individually correct and the units even looked plausible, which
is what made it survive a first read. It was caught only because the result was
checked against a hand-computed expectation — San Jose has 5 spare units and the
two flows need 2 and 3, so "no capacity" could not be right.

The engine now exposes `unitsPerMonthAtRisk` alongside `unitsAtRisk`, with a
comment on each stating which one capacity comparisons must use.

**Lesson:** when two quantities have units, check the units before checking the
logic. A rate compared against a total produces answers that are wrong by exactly
the ratio of the windows, and nothing in the output announces it.

---

## Lane closures did not ripple

The propagation loop seeded its frontier from `origin` — the nodes an event hits
directly. A lane closure has no such node: both endpoints keep operating and only
the flow between them stops, so `origin` was empty and the breadth-first search
never started.

The receiving plant was correctly marked 34.5% impaired, and then nothing
propagated from it. The scenario reported **$0 revenue at risk** for a disruption
that plainly had some — an answer that looks like a working simulation of a
harmless event.

The fix seeds the frontier from every node the seeding phase impaired, at its own
hop, rather than from `origin` alone.

**Lesson:** a zero is the most dangerous output a model can produce, because it
is indistinguishable from good news. The check that caught this asserted
`revenueAtRisk > 0` for a case where non-zero was structurally certain.

---

## A misleading label is a correctness bug

The optimizer reported "no alternative plant makes this category" for Metrology,
when San Jose makes Metrology perfectly well — it was simply caught in the same
disruption.

Both cases block the reroute, so the arithmetic was right. But the two demand
completely different responses: one needs a qualification programme measured in
months, the other needs a different scenario response today. Reporting them under
one label would have sent the reader down the wrong path with correct numbers.

There are now three reasons, and the plan text differs for each.

---

## npm install forgives what npm ci refuses

The client and server packages were renamed when this app was forked from the parent
explorer. The lockfile kept the old names. Every local build passed for weeks, and
the GitHub Pages deploy failed in twelve seconds:

```
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
          package-lock.json are in sync
npm error Missing: supply-chain-ontology-client@ from lock file
```

`npm install` reconciles a divergent lockfile silently as a side effect of running.
`npm ci` treats the same divergence as fatal, by design — that is the point of it.
So the failure could only ever appear in CI, and only after the rename had been
invisible locally for as long as nobody ran a clean install.

**Lesson:** a build that passes locally and fails in CI is usually not a CI problem.
It is a local step quietly repairing something. `rm -rf node_modules && npm ci` in a
scratch copy reproduces it in seconds.

---

## The fix for a broken build did not rebuild

Having regenerated the lockfile, the deploy stayed red. The workflow's `paths`
filter watched `client/**` and the workflow file — but not `package-lock.json`. The
commit that fixed the build therefore triggered nothing, and the last run on record
was still the failing one.

The filter now includes `package.json` and `package-lock.json`.

**Lesson:** a `paths` filter has to cover every input the job actually consumes. This
one ran `npm ci` while ignoring the file `npm ci` reads. It also produced a
particularly misleading state — a repository where the newest commit was the fix and
the newest *run* was the failure.

## Lessons from building the recovery movie

**Check whether a number is per-step or final before showing it as a delta.** The
optimizer returns both shapes. `hrsAvailableBefore` and `headroomPctAfter` are
computed inside the greedy loop and are per-decision; `capacityAfter` is the
aggregate end state for a plant. Putting the aggregate on step 1 would have credited
step 1 with every later step's capacity consumption, and the number would have
looked plausible — 98.6% on the first reroute reads fine unless you know San Jose
was at 89.1% before it. Reading the producing code took a minute and removed a
class of silent error.

**Reconcile a derived narrative against the source totals.** The beat sequence
accumulates protected value independently of `plan.totals`. Summing it gives
$13,800,000 against `valueProtected` of $13,800,000, and residual $1,291,035
against `valueUnprotected` of $1,291,035. Both matched first time, but the check is
the only thing that would have caught a beat being dropped or double-counted.

**Anchor popovers by measurement, not by a CSS side.** The "explain this step" panel
used `left-0`, which put a 480px panel 320px off-screen at every width from 1024 to
1920, because the trigger sits on the right of the beat header. Switching to
`right-0` would have fixed those cases and broken any layout where the trigger moves
left. Measuring the trigger and clamping to the viewport handles both, flips upward
when space below is tight, and escapes clipping ancestors.

**A speed control should scale the existing weighting, not replace it.** The players
already held longer on beats carrying explanation. Exposing a flat interval would
have made those beats as fleeting as the routine ones; exposing a base that the
1.45x weighting multiplies keeps what made the sequence readable. Showing the
resulting total runtime matters too — "3s per step" means nothing until you know it
produces a 24s play-through.

**Float subtraction leaks into the UI.** `hrsAvailableBefore - hrsRequired` rendered
as `36.19999999999999`. Rounding at the point of display, not in the model, keeps
the arithmetic exact and the card readable.

---

## Lessons from the ontology layer

> History. The app class model (`ONT_*`/`KG_*`) these describe was replaced by
> Snowflake Business Ontology on 13 Nov 2026; the lessons stand.

**A metadata schema that cannot express abstractness undercuts the model it
describes.** `ONT_RELATION_DEF` carries `IS_HIERARCHICAL` and `IS_TRANSITIVE` but
has no `IS_ABSTRACT` column, so the one abstract relation in the ontology —
`flowsTo`, an umbrella over `supplies`, `shipsTo` and `transfersTo` — cannot be
recorded as such. It is inferred instead from a double absence: no `ONT_REL_MAP`
row and no inference rule means nothing stores it and nothing derives it.
Abstract *classes* are recorded properly via `ONT_CLASS.IS_ABSTRACT`; only
relations lack the column. Deriving a property from absence works, but it is
fragile in a way a column is not.

**A name collision in a graph that holds both schema and instances fails
silently.** All four traversal UDFs resolved a concept with
`WHERE LOWER(NAME) = LOWER(arg) LIMIT 1` — no `ORDER BY`, no type filter.
`KG_NODE` holds ontology classes *and* instances, and `Supplier` matches three
nodes: a CDSEntity, a DataProduct and the OntologyClass. The UDF picked one
arbitrarily, usually a catalog node with no `subClassOf` edges, and returned zero
rows rather than an error. `EXPAND_DESCENDANTS_TOOL('Party')` worked only because
no SAP data product happens to be called "Party", which is why testing one
function passed the set. Non-deterministic, silent, and triggered by loading the
catalog the tooling itself encourages.

**Table functions are not agent function tools.** A Cortex Agent
`type: function` resource resolves scalar functions only. Registering a UDTF fails
with `Unknown user-defined function` — the name resolves, the scalar lookup does
not. Worse, the agent caught the error and fell back to another tool, producing
the *correct* answer while all four graph tools were dead. Output that looks
healthy is the hardest kind of failure to notice.

**`SHOW` counts are not object counts.** `SHOW PROCEDURES IN SCHEMA` reported 43
in a schema holding 10, because it includes built-ins. Anything drawn in a UI
from a count needs `INFORMATION_SCHEMA`.

**A directed layout cannot traverse edges that point the wrong way.**
`subClassOf` points child → parent, so `breadthfirst` rooted at `Entity` — the
only class with no outgoing edge — dead-ends immediately and leaves fourteen
classes unreachable on one rank. The output was not a poor layout but a line of
slivers. Computing positions directly was both simpler and more stable than
reversing edges, which would have drawn the arrows backwards.

**White text needs fill behind all of it, not most of it.** Labels wider than
their nodes spilled onto a light canvas and vanished; `Design to Operate`
rendered as `ign to Ope`, the fragment still over the coloured box. Sizing the
box to its label fixes the rectangles. For an 18px circle holding a 30-character
name no fill will do, and the label belongs below the node.

**Verify visual work visually.** Two rounds of contrast ratios and box arithmetic
said the diagram was correct while it was rendering as an unreadable line.
Playwright and Chromium were installed the whole time. A screenshot would have
caught it in seconds, and numeric reasoning about a rendered output is not
verification of it.
