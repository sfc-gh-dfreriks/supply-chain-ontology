/**
 * Operational digital thread, resolved from the knowledge graph.
 *
 * Served from data/sc_ops_thread.json (tools/export_ops_thread.py), which reads
 * only KG_NODE / KG_EDGE and the VW_ONT_* views — every link here was found by
 * graph traversal. Ask Cortex passes the traversal result to AI_COMPLETE as
 * facts, the same pattern reason.ts uses for scenarios.
 */
import fs from "node:fs";
import path from "node:path";
import { runSql } from "./snowflake.js";
import { loadNetwork, simulate, type Disruption } from "./scenario.js";
import { mitigate } from "./mitigate.js";
import { loadBusinessOntology, boNodeFor } from "./businessOntology.js";

const MODEL = process.env.SCENARIO_LLM_MODEL ?? "claude-opus-5-5";
let _t: any = null;

export function loadThread(): any {
  if (_t) return _t;
  const f = path.resolve(import.meta.dirname, "../../../data/sc_ops_thread.json");
  if (!fs.existsSync(f)) throw new Error(`Digital thread not found at ${f}. Run tools/export_ops_thread.py.`);
  _t = JSON.parse(fs.readFileSync(f, "utf-8"));
  return _t;
}

export function threadSummary() {
  const t = loadThread();
  const deviating = t.lots.filter((l: any) => l.inspection_result !== "Accepted");
  return {
    classes: t.classes, relations: t.relations, note: t.note,
    kpi: {
      serials: t.serials.length,
      lots: t.lots.length,
      deviating_lots: deviating.length,
      exposed_orders: deviating.reduce((s: number, l: any) => s + l.orders, 0),
      exposed_value_usd: deviating.reduce((s: number, l: any) => s + Number(l.order_value_usd || 0), 0),
      tools_at_risk: t.equipment.filter((e: any) => Number(e.props?.FAILURE_PROB_48H) >= 0.3).length,
    },
    serials: t.serials.slice(0, 150),
    lots: t.lots,
    equipment: t.equipment,
  };
}

/** Supply Chain 360 operations pulse (gold layer), keyed to KG plant ids. */
export function operations() {
  return loadThread().operations;
}

/** SC360 operations for the plants a scenario impairs: what the ripple lands on. */
function opsFor(nodeIds: string[]) {
  const set = new Set(nodeIds);
  return operations().plants.filter((p: any) => set.has(p.node_id));
}

export function serialTrace(serial: string) {
  return loadThread().trace[serial] ?? null;
}

// ------------------------------------------------------------- Ask Cortex
const SYSTEM = `You are Snowflake Cortex, a supply-chain ontology analyst for a semiconductor inspection-equipment
maker (plants San Jose, Austin, Dresden, Singapore, Penang). The facts below were produced by walking
the governed relationships of the Snowflake Business Ontology "Supply Chain" domain and reading the data
each concept represents (SAP master data plus demo enrichment for orders, tools and component lots). Treat them as authoritative; never invent numbers. Lead with the direct answer, then
evidence (a small markdown table when comparing), then 2-4 concrete actions. Name the governed relationships you
followed (e.g. System Serial -has part-> Component Lot, System Serial -shipped on-> Sales Order -placed by-> Customer).
Concepts and relationships are governed in Snowflake Business Ontology (domain "Supply Chain"); when the facts
include governed_definition_snowflake_business_ontology, take the concept's meaning from it and say "governed
definition (Snowflake Business Ontology)". Under 300 words.`;

function factsFor(topic: string, args: Record<string, any>): unknown {
  const t = loadThread();
  switch (topic) {
    case "thread": return threadSummary();
    case "serial": return serialTrace(String(args.serial)) ?? { error: "serial not found" };
    case "lot": return t.lots.find((l: any) => l.lot_id === args.lot) ?? { error: "lot not found" };
    case "equipment": return t.equipment;
    case "scenario":
    case "ripple":
    case "mitigation":
    case "optimize": {
      const d = args.disruption as Disruption;
      const r = simulate(d);
      const plan = mitigate(r);
      const ids = [...r.origin, ...r.impaired].map((n) => n.node_id);
      const base = { disruption: d, totals: r.totals, origin: r.origin, impaired: r.impaired.slice(0, 12),
                     sc360_operations_at_impaired_plants: opsFor(ids), assumptions: r.assumptions };
      if (topic === "ripple") return { ...base, hops: r.hops, top_flows: r.flows.slice(0, 12) };
      if (topic === "mitigation" || topic === "optimize")
        return { ...base, plan: { totals: plan.totals, reroutes: plan.reroutes, unmitigable: plan.unmitigable } };
      return { ...base, top_flows: r.flows.slice(0, 10), economics: loadNetwork().economics };
    }
    case "pulse":
    case "overview": return { operations: operations(), thread: threadSummary().kpi, network: loadNetwork().totals };
    case "class": {
      const name = String(args.class);
      const gov = boNodeFor(loadBusinessOntology(), name);
      // The governed concept, plus how many instances its representation holds.
      return { class: name,
               governed_definition_snowflake_business_ontology: gov
                 ? { node: gov.fqn, status: gov.status, definition: gov.description, relationships: gov.edges, representations: gov.representations }
                 : null,
               instances: loadThread().classes.find((c: any) => c.class_name === (gov?.name ?? name)) ?? null,
               network: loadNetwork().totals };
    }
    default: throw new Error(`unknown topic ${topic}`);
  }
}

export async function askCortex(topic: string, args: Record<string, any>, question: string): Promise<string> {
  const facts = JSON.stringify(factsFor(topic, args)).slice(0, 60000);
  const q = question?.trim() || "Analyse this: what stands out, why, and what should we do?";
  const prompt = `${SYSTEM}\n\nTopic: ${topic}\nFACTS (JSON):\n${facts}\n\nQuestion: ${q}`;
  // Escaped rather than bound: see reason.ts — the connector's bind support does not cover this call shape.
  const { rows } = await runSql(`SELECT AI_COMPLETE('${MODEL}', '${prompt.replace(/'/g, "''")}') AS RESPONSE`);
  const text = String(rows?.[0]?.[0] ?? "").trim();
  if (!text) throw new Error("AI_COMPLETE returned no text");
  return text;
}
