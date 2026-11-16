// Typed API client for the Supply Chain Ontology server.
//
// Two modes:
//   - live (default): call the Express API on /api
//   - static (VITE_STATIC=1): read pre-baked JSON written by tools/bake_static.py,
//     for the public GitHub Pages build where there is no server and no Snowflake
//     credentials. Query strings are folded into the filename by the baker, so
//     the same call signatures work in both modes.
export const STATIC = import.meta.env.VITE_STATIC === "1";
const BASE = "/api";
const SNAP = `${import.meta.env.BASE_URL}data`;

/**
 * Mirror of the baker's filename rule: /products?a=1 -> products__a=1.json
 *
 * Percent-escapes are folded to "-": a literal "%3A" in a filename is decoded
 * back to ":" by the web server on the way in, so the request would never match
 * the file on disk. tools/bake_static.py applies the identical substitution.
 */
function snapshotName(pathname: string): string {
  const [p, q] = pathname.split("?");
  // a percent-escape in the path (a concept name with a space) is folded too: the web
  // server decodes "%20" in the request, so a filename keeping it would never match
  const stem = p.replace(/^\//, "").replace(/\//g, "_").replace(/%[0-9A-Fa-f]{2}/g, "-");
  if (!q) return `${stem}.json`;
  return `${stem}__${q.replace(/[^A-Za-z0-9=&._-]/g, "-")}.json`;
}

async function get<T>(pathname: string): Promise<T> {
  if (STATIC) {
    const res = await fetch(`${SNAP}/${snapshotName(pathname)}`);
    if (!res.ok) {
      throw new Error(
        "not in this snapshot — the public build ships a fixed set of views");
    }
    return res.json() as Promise<T>;
  }
  const res = await fetch(`${BASE}${pathname}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Filename for a baked simulate result. Must stay identical to sim_name() in
 * tools/bake_static.py — built from the disruption's fields rather than a hash so
 * a mismatch can be diagnosed by reading the filename.
 */
function simName(d: Disruption): string {
  const t = [...d.targets].sort().join("-");
  const key = `scenario_sim__${d.kind}__${t}__` +
              `${Math.round(d.severity * 100)}__${Math.round(d.durationDays)}`;
  return key.replace(/[^A-Za-z0-9=&._-]/g, "-");
}

/** Read a baked simulate result in static mode. */
async function staticSim<T>(d: Disruption): Promise<T> {
  const res = await fetch(`${SNAP}/${simName(d)}.json`);
  if (!res.ok) {
    throw new Error(
      "This public build ships results for the six preset scenarios only. " +
      "Pick a preset, or run the app locally to build your own.");
  }
  return res.json() as Promise<T>;
}

async function post<T>(pathname: string, body: unknown): Promise<T> {
  if (STATIC) {
    throw new Error(
      "This needs a live Snowflake connection and is disabled in the public build");
  }
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export type DisruptionKind = "weather" | "supplier" | "capacity" | "lane" | "demand";

export interface ScNode {
  node_id: string; node_name: string; node_type: "Plant" | "Supplier" | "Customer";
  city: string; country: string; latitude: number; longitude: number;
  plant: string | null;
}
export interface ScFlow {
  flow_id: string; flow_type: "Inbound" | "Inter-plant" | "Outbound";
  material_category: string; monthly_volume: number; monthly_value: number;
  source_id: string; source_name: string; source_type: string;
  source_lat: number; source_lon: number; source_plant: string | null;
  target_id: string; target_name: string; target_type: string;
  target_lat: number; target_lon: number; target_plant: string | null;
}
export interface ScCapacity {
  plant: string; plant_name: string; work_centers: number;
  available_hrs: number; used_hrs: number; free_hrs: number;
  utilization_pct: number; headroom_pct: number;
  units_shipped: number; hrs_per_unit: number; spare_units: number;
}
export interface ScInventory {
  plant: string; plant_name: string | null; materials: number;
  min_days_of_inventory: number; avg_days_of_inventory: number;
  stock_value: number; obsolete_materials: number;
}
export interface ScSubstitution {
  material_category: string; flow_type: string; source_plant: string;
  plant_name: string; volume: number; value: number;
  capable_plants: number; has_alternative: boolean;
}
export interface ScNetwork {
  nodes: ScNode[]; flows: ScFlow[]; capacity: ScCapacity[];
  inventory: ScInventory[]; substitution: ScSubstitution[];
  totals: {
    nodes: number; flows: number; monthly_value: number;
    plants: number; suppliers: number; customers: number;
    single_source_categories: string[];
  };
  notes: Record<string, string>; source: string; kinds: DisruptionKind[];
}

export interface Disruption {
  kind: DisruptionKind; targets: string[];
  severity: number; durationDays: number; label?: string;
}
export interface AffectedFlow {
  flow_id: string; flow_type: string; material_category: string;
  source_id: string; source_name: string;
  target_id: string; target_name: string; target_type: string;
  monthly_volume: number; monthly_value: number;
  impactFactor: number; daysAtRisk: number;
  unitsAtRisk: number; unitsPerMonthAtRisk: number; valueAtRisk: number;
  hop: number; reason: string;
}
export interface ImpairedNode {
  node_id: string; node_name: string; node_type: string; plant: string | null;
  hop: number; impairment: number;
  bufferDays: number | null; daysExposed: number; causedBy?: string;
}
export interface ScenarioResult {
  disruption: Disruption;
  origin: ImpairedNode[]; impaired: ImpairedNode[]; flows: AffectedFlow[];
  hops: { hop: number; nodes: number; flows: number; valueAtRisk: number }[];
  totals: {
    valueAtRisk: number; monthlyNetworkValue: number; pctOfNetwork: number;
    revenueAtRisk: number; customersAffected: number;
    plantsImpaired: number; maxHop: number;
    lostMargin?: number; latePenalty?: number; costOfDisruption?: number; ordersAtRisk?: number;
  };
  assumptions: string[];
}
export interface Reroute {
  flow_id: string; material_category: string; customer: string;
  fromPlant: string; toPlant: string; toPlantId: string;
  unitsMoved: number; unitsTotal: number;
  hrsRequired: number; hrsAvailableBefore: number; headroomPctAfter: number;
  valueProtected: number; distanceDeltaKm: number | null; note?: string;
}
export interface Unmitigable {
  flow_id: string; material_category: string; customer: string;
  fromPlant: string; valueAtRisk: number; reason: string;
  candidatesTried?: { plant: string; spareUnits: number; shortfallUnits: number }[];
}
export interface MitigationPlan {
  reroutes: Reroute[]; unmitigable: Unmitigable[];
  totals: {
    revenueAtRisk: number; valueProtected: number; valueUnprotected: number;
    protectedPct: number; unitsRerouted: number; plantsUsed: number;
  };
  capacityAfter: {
    plant: string; plantName: string; unitsAdded: number; hrsAdded: number;
    utilizationBefore: number; utilizationAfter: number; spareUnitsLeft: number;
  }[];
  actions: string[]; caveats: string[];
}
export interface SimulateResponse { result: ScenarioResult; plan: MitigationPlan; }
export interface Preset extends Disruption { id: string; blurb: string; source?: string; }

// ---- Snowflake Business Ontology: the GOVERNED layer ----------------------
// Mirrors server/src/services/businessOntology.ts. Kept as its own types so a
// component always knows whether a field is native or from the app model.
export interface BoEdge { type: string; label: string | null; direction: "out" | "in"; node: string | null }
export interface BoRepresentation { object: string; fqn: string; objectType: string; role: string; validity: string | null }
export interface BoNode {
  termId: string; name: string; fqn: string; kind: string; status: string | null;
  description: string | null; synonyms: string[]; appClass: string;
  edges: BoEdge[]; representations: BoRepresentation[];
  history: { events: number; truncated: boolean; last: number | null; changedBy: string[] };
  createdOn: number | null; lastModifiedOn: number | null; snowsightUrl: string;
}
export type BoSummary =
  | { available: false }
  | { available: true; domain: string; account: string; exportedAt: string; snowsightUrl: string;
      counts: { nodes: number; relationships: number; representations: number };
      kinds: Record<string, number>; relationshipTypes: Record<string, number> };

export interface Meta {
  ontology: BoSummary;
  network: ScNetwork["totals"];
  networkSource: string;
  /** which governed concept, and which of its representations, each input came from */
  lineage: Record<string, Record<string, string> | Record<string, unknown>> | null;
}

export const api = {
  meta: () => get<Meta>("/meta"),
  boSummary: () => get<BoSummary>("/bo/summary"),
  boGraph: () => get<{ elements: any[]; counts: Record<string, number>; exportedAt: string }>("/bo/graph"),
  boNode: (name: string) => get<BoNode>(`/bo/node/${encodeURIComponent(name)}`),

  scNetwork: () => get<ScNetwork>("/scenario/network"),
  scPresets: () => get<Preset[]>("/scenario/presets"),
  scSimulate: (d: Disruption) =>
    STATIC ? staticSim<SimulateResponse>(d) : post<SimulateResponse>("/scenario/simulate", d),
  scReasoningStatus: () => get<{ ok: boolean; missing: string[] }>("/scenario/reasoning/status"),
  scExplain: (d: Disruption) => post<{ text: string }>("/scenario/explain", d),
  scAsk: (d: Disruption, question: string, history: { role: string; text: string }[]) =>
    post<{ text: string }>("/scenario/ask", { ...d, question, history }),
};


// ---------------------------------------------------------------- digital thread + Ask Cortex
export const thread = {
  summary: () => get<any>("/thread"),
  serial: (sn: string) => get<any>(`/thread/serial/${encodeURIComponent(sn)}`),
};

/**
 * Stable key for a baked Ask Cortex answer: topic plus sorted args. A disruption
 * is keyed by its simulate signature (simName) rather than JSON, so field order
 * or a label edit cannot break the lookup. Must match ask_key() in
 * tools/bake_static.py.
 */
export function askKey(topic: string, args: Record<string, unknown> = {}): string {
  const val = (k: string) => k === "disruption" && args[k] ? simName(args[k] as Disruption)
    : typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k];
  const a = Object.keys(args).sort().map((k) => `${k}=${val(k)}`).join("&");
  return a ? `${topic}?${a}` : topic;
}

/**
 * Grounded analysis of the view on screen. Live: the server traverses the graph
 * (or runs the scenario) and passes the result to AI_COMPLETE. Static: answers
 * for each view's default question are baked by tools/bake_static.py.
 */
export async function askCortex(topic: string, args: Record<string, unknown> = {}, question = ""): Promise<string> {
  if (STATIC) {
    const res = await fetch(`${SNAP}/ask_cortex.json`);
    const baked: Record<string, string> = res.ok ? await res.json() : {};
    return baked[askKey(topic, args)] ??
      "_Live Cortex analysis needs a Snowflake connection. In this public build only the default analysis for preset views is available._";
  }
  return (await post<{ text: string }>("/ask-cortex", { topic, args, question })).text;
}

export const ops = { pulse: () => get<any>("/operations") };
