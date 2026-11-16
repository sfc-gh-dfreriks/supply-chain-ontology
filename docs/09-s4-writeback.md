# 09 — Executing the recovery in S/4HANA

> **Added 16 Nov 2026.** The **Execute in S/4HANA** page (`#execute`) takes the
> reroutes on Mitigation & Recovery through to SAP S/4HANA document changes. The
> S/4HANA system is **simulated** in `SAP_SUPPLY_CHAIN.S4_WRITEBACK`; no real
> S/4HANA connection is made.

Mitigation & Recovery answers *what should we do*. This page answers *do it*, and
does so in a way a planning or IT lead would sign off: every change is defined in
the governed ontology, checked against live data, approved by a second person who
acknowledges it alters the system of record, and recorded as S/4 change documents.

---

## From nouns to verbs: Action nodes

The design follows the Action-node pattern in *Ontology Execution and Writeback*
(the "From Nouns to Verbs" blog and one-pager). A Business Ontology **Term** says
what something means and a **Metric** how it is measured; an **Action** says what
the business can do. The ontology **defines** the operation but never runs it:

| Layer | Role |
|---|---|
| Business Ontology | holds each Action's contract: parameters, criteria, effects, and the procedure that runs it |
| The app | finds the Actions, checks every criterion against live data, collects the approval |
| Snowflake RBAC | decides who may approve and post (`SC_RECOVERY_APPROVER`) |
| The named procedure | performs the write, and re-checks its own guards |
| Change documents and query history | record what ran |

Three Actions live in the **Supply Chain** domain (created by
`tools/create_recovery_actions.py`, draft → approve → `ACTS_ON`):

| Action | Acts on | Kind | S/4HANA change | Runs via |
|---|---|---|---|---|
| Reassign Delivering Plant | Sales Order | MODIFY_OBJECT | `PATCH A_SalesOrderItem.ProductionPlant` (VBAP-WERKS) | `S4_REASSIGN_DELIVERING_PLANT` |
| Create Planned Order | Plant | CREATE_OBJECT | `POST A_PlannedOrder` (PLAF, type LA) | `S4_CREATE_PLANNED_ORDER` |
| Approve Recovery Change Request | Sales Order | MODIFY_OBJECT | governance gate | `SP_DECIDE_CR` |

The app finds them by walking `ACTS_ON` into Sales Order and Plant
(`FIND_ACTIONS_FOR_ENTITY`), never by name. A steward who adds an Action and
attaches its procedure changes what the page offers without an app change.

---

## Why a reroute is two S/4 changes

The optimizer moves a material category for a customer from a failed plant to one
with spare hours. In S/4HANA that means:

1. **Reassign Delivering Plant** on each of the customer's open sales order items
   for that category, earliest first, until the moved quantity is covered.
2. **Create Planned Order** at the receiving plant for the same quantity, so MRP
   and capacity planning see the new demand.

For the hurricane preset (Austin offline 60 days) that is two sales order items
moved from plant 2000 to 1000 and two planned orders at 1000 (2 × MAT-1001
inspection, 3 × MAT-1005 metrology), which fits San Jose's five spare units.

---

## The flow and its guards

```
Recovery plan ──► Find the Actions ──► Raise change request ──► Approve ──► Run the named procedures ──► S/4HANA receives OData ──► Change documents
 (server)          (ACTS_ON)            (criteria checked,        (2nd person)  (re-check, then write)        (PATCH / POST)               (CDHDR/CDPOS, reversible)
                                         nothing written)
```

| Guard | Where it is enforced |
|---|---|
| The plan is recomputed on the server from the disruption; the browser cannot submit its own | `server/src/services/writeback.ts` |
| The plan is fingerprinted (hash); approval and posting refuse if it has changed | server, stored on the request |
| Approver holds `SC_RECOVERY_APPROVER` and is not the requester | `SP_DECIDE_CR` |
| Three acknowledgements (reviewed every change; changes live transactional data; recorded under my name) and the phrase `POST TO S4HANA` | `SP_DECIDE_CR`, mirrored in the dialog |
| Only `APPROVED` requests post; posting twice is refused | `SP_POST_CR` |
| Each Action procedure refuses a call that does not match an approved, eligible item, re-checks the item is open, unchanged since approval, and the plant produces the category, and checks spare capacity | `S4_REASSIGN_DELIVERING_PLANT`, `S4_CREATE_PLANNED_ORDER` |
| Every change is written as a change document under the approver; reversal restores from them | `SP_REVERSE_CR` |

The page header shows a swimlane diagram of these steps (recovery app, Business
Ontology, people, Snowflake, S/4HANA) and highlights where the current request is.

---

## What is simulated

| Element | Status |
|---|---|
| Action contracts in Business Ontology | **Real** — governed nodes in the Supply Chain domain |
| Criteria inputs (open items, which plant produces what, spare units) | **Real** reads of the network, plus a demo order book |
| Open sales order items | **Demo** — the 3 real open items plus one synthetic open item per customer lane (numbers from 4600001) |
| Material-to-category mapping | **Demo** — assigned from material descriptions |
| The S/4HANA system, OData calls and responses | **Simulated** — mirror tables, an outbox with the exact call S/4 would receive, simulated document numbers |

Connecting a real S/4HANA would change only the two write procedures (for
example, an external function or connector calling the same OData services). The
contracts, criteria, approval and audit stay as they are.

---

## Running and testing

```bash
# Snowflake objects, then the Action nodes (both idempotent)
snow sql -f sql/ontology/10_s4_writeback.sql
python3 tools/create_recovery_actions.py
python3 tools/refresh_all.py --check          # the ontology exports still match

python3 tools/test_s4_writeback.py            # 20 governance checks in SQL
APP=http://localhost:5179 python3 tools/shoot_writeback.py   # UI walk-through, screenshots to docs/writeback/
python3 tools/bake_static.py --only-writeback # public example (scrubbed of the account's login and role)
```

`CALL SAP_SUPPLY_CHAIN.S4_WRITEBACK.SP_RESET_DEMO()` returns the simulated system
to its seed. The public site shows the baked hurricane request read-only.

---

## Findings while building it

- **Action nodes are enabled on the demo account.** `itemKind: ACTION` drafts,
  approves and accepts `ACTS_ON`; the stored `actionSpec` round-trips exactly. The
  app's ontology refresh still reports *in sync* with the new node kind present.
- **Caller's-rights procedures resolve names in the caller's schema.** The server
  session sits in `ONTOLOGY`, so unqualified `S4_*` names failed from the API while
  passing from a worksheet. Every reference is now fully qualified.
- **`V_CARRIESCATEGORY` reads lowercase keys** from edge properties that are stored
  uppercase, so its typed columns are always null. The writeback reads `PROPS`
  directly and leaves the shared view alone.
- **Scripting `IF` cannot call SQL UDFs that contain subqueries**, and `VALUES`
  rejects expressions. Both are rewritten as `SELECT … INTO` and `INSERT … SELECT`.
