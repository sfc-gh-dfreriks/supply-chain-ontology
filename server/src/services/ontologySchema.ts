/**
 * The ontology SCHEMA layer: classes and relations, not instances.
 *
 * This is deliberately separate from ontology.ts, which serves the SAP BDC
 * catalog (data products and CDS entities). The two answer different questions:
 *
 *   ontology.ts        what data exists          -> Process, Product, CDSEntity
 *   ontologySchema.ts  what kinds of thing exist -> Party, Facility, MaterialFlow
 *
 * Conflating them is the problem this module exists to fix. A catalog cannot
 * tell you that a Supplier and a Customer are both Parties, so it cannot answer
 * "which parties are affected" in one pass. The class layer can.
 *
 * Source: SAP_SUPPLY_CHAIN.ONTOLOGY, exported by tools/export_ontology_schema.py.
 * Read from JSON rather than queried live because tools/bake_static.py builds a
 * credential-free static site.
 */

import fs from "fs";
import path from "path";

export interface ClassSource {
  database: string; schema: string; table: string;
  filter_col: string | null; filter_val: string | null;
}

export interface OntClass {
  name: string;
  parent: string | null;
  is_abstract: boolean;
  description: string | null;
  depth: number | null;
  descendants: number | null;
  instances: number;
  source: ClassSource | null;
}

export interface OntRelation {
  name: string;
  domain: string;
  range: string;
  cardinality: string | null;
  is_hierarchical: boolean;
  is_transitive: boolean;
  inverse: string | null;
  description: string | null;
  is_stored: boolean;
  is_inferred: boolean;
  is_abstract: boolean;
  rule: { id: string; kind: string; enabled: boolean; edges: number } | null;
}

export interface AbstractRollup {
  view: string;
  total: number;
  breakdown: { type: string; count: number }[];
}

export interface StackLayer {
  layer: string; name: string; detail: string; note: string; objects: number;
}

export interface OntologySchema {
  ontology: string;
  source: string;
  stack: StackLayer[];
  classes: OntClass[];
  relations: OntRelation[];
  subclass_of: { child: string; parent: string }[];
  abstract_rollup: Record<string, AbstractRollup>;
  descendants: { root: string; descendant: string; depth: number; path: string }[];
  ancestors: { start: string; ancestor: string; depth: number }[];
  properties: Record<string, { name: string; type: string; required: boolean }[]>;
  counts: Record<string, number>;
}

const DATA_FILE = path.resolve(import.meta.dirname, "../../../data/sc_ontology_schema.json");

let _cache: OntologySchema | null = null;

export function loadSchema(): OntologySchema {
  if (_cache) return _cache;
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(
      `Ontology schema not found at ${DATA_FILE}. Run: python3 tools/export_ontology_schema.py`,
    );
  }
  _cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as OntologySchema;
  return _cache;
}

export type ClassMode = "abstract" | "concrete" | "both";

/**
 * Colour by branch, so the two halves of the ontology read apart at a glance.
 *
 * These are deliberately dark. Concrete nodes are filled with the branch colour
 * and labelled in white, and a mid-tone like #29B5E8 gives roughly 2.3:1 against
 * white — unreadable. Every colour below clears 4.5:1.
 */
export function branchColor(sch: OntologySchema, name: string): string {
  // Walk up to the branch directly beneath Entity.
  const byName = new Map(sch.classes.map((c) => [c.name, c]));
  let cur = byName.get(name);
  const seen = new Set<string>();
  while (cur?.parent && cur.parent !== "Entity" && !seen.has(cur.name)) {
    seen.add(cur.name);
    cur = byName.get(cur.parent);
  }
  const branch = cur?.parent === "Entity" ? cur.name : name;
  switch (branch) {
    case "Party":            return "#0369a1";  // sky-700
    case "Facility":         return "#1B3A57";  // SAP navy
    case "MaterialFlow":     return "#0e7490";  // cyan-700
    case "MaterialCategory": return "#0f766e";  // teal-700
    case "CatalogObject":    return "#475569";  // slate-600: metadata, not domain
    default:                 return "#334155";  // Entity itself
  }
}

/**
 * Size a class node so both label lines fit inside it.
 *
 * The node carries two lines — the class name at 12px semibold and a count at
 * 9.5px — so width is driven by whichever line is wider, and height is fixed at
 * two lines plus padding rather than scaled by instance count. Encoding count in
 * the box size was the earlier approach and it fought legibility: CDSEntity at
 * 2,243 wanted to be huge and Plant at 5 wanted to be smaller than its own name.
 * The count is now stated in text, which is both clearer and honest about
 * magnitude in a way area never is.
 */
function classBox(sch: OntologySchema, c: OntClass): { w: number; h: number; tw: number } {
  const rollup = sch.abstract_rollup[c.name];
  const countLine = c.is_abstract
    ? (rollup ? `${rollup.total.toLocaleString()} in ${rollup.breakdown.length} ${rollup.breakdown.length === 1 ? "type" : "types"}` : "abstract")
    : `${c.instances.toLocaleString()} instance${c.instances === 1 ? "" : "s"}`;
  // 12px semibold ~ 7.4px/char; 9.5px regular ~ 5.3px/char
  const need = Math.max(c.name.length * 7.4, countLine.length * 5.3);
  const w = Math.round(Math.min(215, Math.max(150, need + 30)));
  return { w, h: 54, tw: w - 20 };
}


/**
 * Lay the class tree out explicitly, left to right.
 *
 * Cytoscape's `breadthfirst` cannot do this from the data as it stands:
 * subClassOf points child -> parent, so a directed traversal rooted at Entity
 * immediately dead-ends and every other class ends up unreachable on a single
 * rank. Rather than reverse the edges — which would draw the arrows backwards
 * and misstate the relation — positions are computed here and shipped as a
 * preset layout.
 *
 * Left to right rather than top down because class names are long horizontal
 * words; ranks as columns give each label room without crowding its siblings.
 */
export function treePositions(
  sch: OntologySchema,
  kept: OntClass[],
): Map<string, { x: number; y: number }> {
  const COL_W = 250;      // horizontal gap between depths
  const SLOT_H = 74;      // vertical gap between siblings
  const names = new Set(kept.map((c) => c.name));
  const childrenOf = new Map<string, string[]>();
  for (const c of kept) {
    if (c.parent && names.has(c.parent)) {
      const arr = childrenOf.get(c.parent) ?? [];
      arr.push(c.name);
      childrenOf.set(c.parent, arr);
    }
  }
  for (const arr of childrenOf.values()) arr.sort();

  // roots: kept classes whose parent is absent from this view. In concrete mode
  // every class is a root, which is the honest picture — there is no spine.
  const roots = kept
    .filter((c) => !c.parent || !names.has(c.parent))
    .map((c) => c.name)
    .sort();

  const pos = new Map<string, { x: number; y: number }>();
  const depthOf = new Map<string, number>();
  let slot = 0;

  // post-order walk: leaves take the next slot, parents centre on their children
  const place = (name: string, depth: number): number => {
    depthOf.set(name, depth);
    const kids = childrenOf.get(name) ?? [];
    let y: number;
    if (kids.length === 0) {
      y = slot * SLOT_H;
      slot += 1;
    } else {
      const ys = kids.map((k) => place(k, depth + 1));
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    pos.set(name, { x: depth * COL_W, y });
    return y;
  };
  for (const r of roots) place(r, 0);

  return pos;
}

export function buildClassGraph(sch: OntologySchema, mode: ClassMode): any[] {
  const keep = (c: OntClass) =>
    mode === "both" || (mode === "abstract" ? c.is_abstract : !c.is_abstract);

  const kept = sch.classes.filter(keep);
  const keptNames = new Set(kept.map((c) => c.name));
  const pos = treePositions(sch, kept);

  const nodes = kept.map((c) => {
    const rollup = sch.abstract_rollup[c.name];
    const sub: string[] = [];
    sub.push(c.is_abstract ? "Abstract class" : "Concrete class");
    if (c.description) sub.push(c.description);
    if (c.is_abstract && rollup) {
      sub.push(
        `${rollup.total} instances across ${rollup.breakdown.length} type(s):<br>` +
        rollup.breakdown.map((b) => `&nbsp;&nbsp;${b.type} ${b.count}`).join("<br>"),
      );
    } else if (!c.is_abstract) {
      sub.push(`${c.instances} instances`);
      if (c.source) {
        sub.push(
          `source: ${c.source.table}` +
          (c.source.filter_col ? ` where ${c.source.filter_col} = ${c.source.filter_val}` : ""),
        );
      }
    }
    const props = sch.properties[c.name];
    if (props?.length) sub.push(`${props.length} declared propert${props.length === 1 ? "y" : "ies"}`);

    const countLine = c.is_abstract
      ? (rollup ? `${rollup.total.toLocaleString()} in ${rollup.breakdown.length} ${rollup.breakdown.length === 1 ? "type" : "types"}` : "abstract")
      : `${c.instances.toLocaleString()} instance${c.instances === 1 ? "" : "s"}`;

    return {
      data: {
        id: `cls::${c.name}`,
        // two lines, joined with a newline: a Cytoscape node has one label, and
        // text-wrap:wrap honours the break. The count means the diagram says
        // something without needing a click.
        label: `${c.name}\n${countLine}`,
        name: c.name,
        processColor: branchColor(sch, c.name),
        ...classBox(sch, c),
        kind: "class",
        abstract: c.is_abstract,
        instances: c.instances,
        depth: c.depth,
        sub: sub.join("<br>"),
      },
      position: pos.get(c.name) ?? { x: 0, y: 0 },
    };
  });

  const edges: any[] = [];

  // subClassOf spine. In "concrete" mode the abstract parents are filtered out,
  // which would leave the concrete classes as disconnected islands; that is the
  // honest picture, since without the abstract layer there is nothing joining
  // a Supplier to a Customer.
  for (const e of sch.subclass_of) {
    if (!keptNames.has(e.child) || !keptNames.has(e.parent)) continue;
    edges.push({
      data: {
        id: `sub::${e.child}->${e.parent}`,
        source: `cls::${e.child}`, target: `cls::${e.parent}`,
        kind: "subClassOf", weight: 2,
      },
    });
  }

  // Relations between kept classes.
  for (const r of sch.relations) {
    if (!keptNames.has(r.domain) || !keptNames.has(r.range)) continue;
    edges.push({
      data: {
        id: `rel::${r.name}::${r.domain}->${r.range}`,
        source: `cls::${r.domain}`, target: `cls::${r.range}`,
        label: r.name, kind: "relation", weight: 1,
        inferred: r.is_inferred, abstract: r.is_abstract,
      },
    });
  }

  return [...nodes, ...edges];
}

export interface ClassDetail {
  cls: OntClass;
  children: OntClass[];
  ancestors: { ancestor: string; depth: number }[];
  descendants: { descendant: string; depth: number; path: string }[];
  properties: { name: string; type: string; required: boolean }[];
  relations_out: OntRelation[];
  relations_in: OntRelation[];
  rollup: AbstractRollup | null;
}

export function classDetail(sch: OntologySchema, name: string): ClassDetail | null {
  const cls = sch.classes.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!cls) return null;
  return {
    cls,
    children: sch.classes.filter((c) => c.parent === cls.name),
    ancestors: sch.ancestors
      .filter((a) => a.start === cls.name)
      .map(({ ancestor, depth }) => ({ ancestor, depth }))
      .sort((a, b) => a.depth - b.depth),
    descendants: sch.descendants
      .filter((d) => d.root === cls.name && d.descendant !== cls.name)
      .map(({ descendant, depth, path }) => ({ descendant, depth, path }))
      .sort((a, b) => a.depth - b.depth || a.descendant.localeCompare(b.descendant)),
    properties: sch.properties[cls.name] ?? [],
    relations_out: sch.relations.filter((r) => r.domain === cls.name),
    relations_in: sch.relations.filter((r) => r.range === cls.name),
    rollup: sch.abstract_rollup[cls.name] ?? null,
  };
}
