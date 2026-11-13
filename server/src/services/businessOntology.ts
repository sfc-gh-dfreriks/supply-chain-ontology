/**
 * Snowflake Business Ontology — the GOVERNED layer of the same model.
 *
 * The app shows two ontologies and keeps them visibly apart:
 *
 *   businessOntology.ts  Snowflake-native, steward-approved MEANING: definitions,
 *                        synonyms, typed relationships, representations (concept ->
 *                        Snowflake object) and change history.
 *   ontologySchema.ts    the app's OPERATIONAL model in SAP_SUPPLY_CHAIN.ONTOLOGY:
 *                        abstract flags, typed properties, cardinality, the
 *                        substitution rule, class -> table maps, instance counts.
 *
 * Business Ontology has no field for anything in the second list, so those keep
 * coming from the app model. Each native node maps back to one app class
 * (`appClass`); only the app's technical root, Entity, has no native node.
 *
 * Source: the "Supply Chain" domain on MSB89522, exported read-only by
 * tools/export_business_ontology.py. Read from JSON, like the schema, so the
 * static site needs no credentials.
 */

import fs from "fs";
import path from "path";
import type { OntologySchema } from "./ontologySchema.js";
import { treePositions, branchColor } from "./ontologySchema.js";

export interface BoEdge { type: string; label: string | null; direction: "out" | "in"; node: string | null }
export interface BoRepresentation { object: string; fqn: string; objectType: string; role: string; validity: string | null }
export interface BoNode {
  termId: string; name: string; fqn: string; kind: string; status: string | null;
  description: string | null; synonyms: string[]; appClass: string;
  edges: BoEdge[]; representations: BoRepresentation[];
  history: { events: number; truncated: boolean; last: number | null; changedBy: string[] };
  createdOn: number | null; lastModifiedOn: number | null; snowsightUrl: string;
}
export interface BusinessOntology {
  domain: string; account: string; exportedAt: string; snowsightUrl: string;
  counts: { nodes: number; relationships: number; representations: number };
  nodes: BoNode[];
  relationships: { source: string | null; target: string | null; type: string; label: string | null }[];
}

const DATA_FILE = path.resolve(import.meta.dirname, "../../../data/sc_business_ontology.json");

let _cache: BusinessOntology | null | undefined;

/** null when the export is missing: the app still runs on its own model. */
export function loadBusinessOntology(): BusinessOntology | null {
  if (_cache !== undefined) return _cache;
  _cache = fs.existsSync(DATA_FILE)
    ? (JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as BusinessOntology)
    : null;
  return _cache;
}

export function boSummary(bo: BusinessOntology | null) {
  if (!bo) return { available: false as const };
  const kinds: Record<string, number> = {};
  for (const n of bo.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
  const types: Record<string, number> = {};
  for (const r of bo.relationships) types[r.type] = (types[r.type] ?? 0) + 1;
  return {
    available: true as const,
    domain: bo.domain, account: bo.account, exportedAt: bo.exportedAt,
    snowsightUrl: bo.snowsightUrl, counts: bo.counts, kinds, relationshipTypes: types,
  };
}

/** The native node for an app class, by mapped class name or node name. */
export function boNodeFor(bo: BusinessOntology | null, name: string): BoNode | null {
  if (!bo) return null;
  const k = name.toLowerCase();
  return bo.nodes.find((n) => n.appClass.toLowerCase() === k || n.name.toLowerCase() === k) ?? null;
}

function boxFor(name: string, sub: string) {
  const w = Math.round(Math.min(215, Math.max(150, Math.max(name.length * 7.4, sub.length * 5.3) + 30)));
  return { w, h: 54, tw: w - 20 };
}

// Grid slots (column, row) for the native graph. The app's class tree is a
// hierarchy and lays out as columns; the native graph is mostly business
// relationships around Plant, so it is laid out as a network: parties and
// the plant in the middle, what plants make and move to the right, the
// traceability chain to the left and the SAP catalog branch underneath.
// Concepts not listed fall back to the class-tree position.
const SLOT: Record<string, [number, number]> = {
  Party: [1, 0],
  Supplier: [0, 1], Customer: [2, 1],
  ComponentLot: [-1, 1], Equipment: [0, 2.2], Asset: [-1, 2.2],
  Plant: [1, 3], Facility: [1, 4.4],
  SalesOrder: [0, 3.6], Transaction: [-1, 3.6],
  SystemSerial: [0, 5], Item: [-1, 5],
  MaterialCategory: [2, 3], MaterialFlow: [3, 3],
  InboundFlow: [4, 2], InterPlantFlow: [4, 3], OutboundFlow: [4, 4],
  BusinessProcess: [0, 6.6], DataProduct: [1, 6.6], CDSEntity: [2, 6.6], CatalogObject: [1, 7.8],
};

/**
 * The native graph. IS_A edges get the subClassOf style; every other native
 * type is a labelled relationship.
 */
export function buildBoGraph(bo: BusinessOntology, sch: OntologySchema): any[] {
  const byName = new Map(bo.nodes.map((n) => [n.name, n]));
  const classes = sch.classes.filter((c) => bo.nodes.some((n) => n.appClass === c.name));
  const tree = treePositions(sch, classes);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of bo.nodes) {
    const s = SLOT[n.appClass];
    pos.set(n.appClass, s ? { x: s[0] * 250, y: s[1] * 95 } : tree.get(n.appClass) ?? { x: 0, y: 0 });
  }
  const nodes = bo.nodes.map((n) => ({
    data: {
      id: `bo::${n.name}`,
      label: `${n.name}\n${n.kind === "TERM" ? "term" : "entity"} · ${n.status?.toLowerCase() ?? ""}`,
      name: n.appClass, boName: n.name, kind: "class", native: true,
      processColor: branchColor(sch, n.appClass),
      // same box rule as the app graph: 12px semibold ~7.4px/char, 9.5px ~5.3px/char
      ...boxFor(n.name, `entity · ${n.status?.toLowerCase() ?? ""}`), abstract: false,
      sub: [n.description ?? "", `${n.representations.length} representation(s)`].filter(Boolean).join("<br>"),
    },
    position: pos.get(n.appClass) ?? { x: 0, y: 0 },
  }));
  const edges = bo.relationships
    .filter((r) => r.source && r.target && byName.has(r.source) && byName.has(r.target))
    .map((r, i) => ({
      data: {
        id: `bo-rel::${i}`, source: `bo::${r.source}`, target: `bo::${r.target}`, native: true,
        kind: r.type === "IS_A" ? "subClassOf" : "relation",
        label: r.type === "IS_A" ? undefined : (r.label ?? r.type.toLowerCase().replace("_", " ")),
        weight: r.type === "IS_A" ? 2 : 1,
      },
    }));
  return [...nodes, ...edges];
}
