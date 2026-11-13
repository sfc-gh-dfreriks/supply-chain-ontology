# 1. Concepts

What an ontology is in this app, and why Snowflake Business Ontology is where it
lives.

---

## The problem this addresses

A supply chain does not live in one system. The material master sits in
S/4HANA, the supplier profile in Ariba, the sensor feed and the inspection
result outside SAP entirely. Each system names the same real-world object
differently, and nothing in any of them declares how they relate.

The usual response is to hard-code joins in each report. That works until
someone asks a question nobody anticipated — "a supplier fails, which customers
lose revenue?" — at which point the relationships have to be rediscovered from
column names and tribal knowledge.

An ontology inverts this: **the relationships become governed data**, defined
once by a steward and read by every application.

---

## The governed domain

The app runs on one domain in Snowflake Business Ontology: **Supply Chain**
(account MSB89522).

| Element | What it is | Count |
|---|---|---|
| **Concept** | A governed business term — 20 entities (Supplier, Plant, Sales Order, Component Lot…) and 1 term (Material Category) | 21 |
| **Relationship** | A typed link between concepts | 26 |
| **Representation** | The Snowflake object a steward linked to a concept as the place its data lives | 25 |

The 26 relationships are of four types:

| Type | Count | Example |
|---|---|---|
| `IS_A` | 13 | Inbound Flow IS_A Material Flow; Supplier IS_A Party |
| `CUSTOM` | 9 | Supplier **supplies** Plant; Sales Order **fulfilled by** Plant |
| `HAS_PART` | 3 | System Serial has part Component Lot |
| `CLASSIFIES` | 1 | Material Category classifies Material Flow |

Four concepts — Catalog Object, Business Process, Data Product, CDS Entity —
record where the domain came from (the SAP BDC catalog). No page reads them as
data; they appear in the Ontology graph as provenance.

Each concept carries a definition, synonyms, change history and a link to
Snowsight, all of which the **Ontology** page shows.

---

## Built on the ontology, not beside it

Nothing in the app names a table. Every input is found by **walking** the
domain, then read from the **representation** linked to the concept it reached:

| App input | Found by walking | Representation |
|---|---|---|
| Suppliers, plants, customers | endpoints of **supplies** and **ships to** | `VW_ONT_SUPPLIER`, `VW_ONT_PLANT`, `VW_ONT_CUSTOMER` |
| Material flows | IS_A children of the concept Material Category classifies | `VW_ONT_INBOUNDFLOW`, `…OUTBOUNDFLOW`, `…INTERPLANTFLOW` |
| Capacity and inventory | Plant | `VW_ONT_PLANT` |
| Substitution | Plant **produces** Material Category | `V_PRODUCES` |
| Order economics | Sales Order, fulfilled by Plant | `ANALYTICS.DT_ORDER_FULFILLMENT` |
| Digital thread | System Serial has part Component Lot, shipped on Sales Order | `VW_ONT_LOT_BLAST_RADIUS` plus concept views |
| Operations pulse | Plant, Equipment | `DT_OPERATING_RATE`, `DT_COMPONENT_COVER`, `DT_EQUIPMENT_HEALTH`, `A_WORK_CENTER` |

The consequence is the point of the design: change a relationship or a
representation in Snowflake and the next refresh reads from the new place, with
no code change.

---

## What the ontology does not model

Business Ontology declares concepts and how they relate. It does not carry
rules, so four things stay in the scenario engine's code and are documented as
such:

- plant-to-plant transfer as an edge type
- cardinality
- the substitution rule (same material category plus spare work-center hours)
- buffer timing (days of inventory before a line stops)

---

## Real versus modelled

The network, capacity, inventory and order economics are read from SAP data
through the representations. Disruptions are **hypotheticals**: the engine
computes them in memory, and the AI (`AI_COMPLETE`, `claude-opus-5-5`)
interprets the computed figures rather than calculating them. The digital
thread instances are `OPS_EXT` demo enrichment keyed to real SAP plants,
suppliers, customers and BOMs.

---

## History

The app began as a viewer over the SAP Business Data Cloud catalog (data
products and CDS entities), then grew an app-owned class model. Both were
replaced on 13 Nov 2026 by the governed domain above; the derivation is recorded
in [the ontology layer](08-ontology-layer.md).
