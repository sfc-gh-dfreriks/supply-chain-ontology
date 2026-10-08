/**
 * Supply-chain disruption propagation and mitigation.
 *
 * Runs in-process: 19 nodes and 27 flows, so a full simulation is microseconds
 * and the UI can re-run on every slider movement. Snowflake remains the source
 * of truth via data/sc_network.json (see tools/export_scenario_network.py).
 *
 * ---------------------------------------------------------------------------
 * The model, stated plainly
 * ---------------------------------------------------------------------------
 * This is a share-based linear propagation model, not a discrete-event
 * simulation. Three rules do the work:
 *
 *  1. A disrupted node loses `severity` of its throughput.
 *
 *  2. Impact travels along flows OUT of an impaired node, scaled by how much the
 *     receiving node depends on that flow. Dependency is the flow's share of the
 *     receiver's total inbound volume. If Austin supplies 8 of the 38 units
 *     Penang receives, Austin going dark impairs Penang by 21%, not 100%.
 *
 *  3. Inventory defers impact at the RECEIVING node. A node with 12 days of
 *     buffer absorbs the first 12 days; only the remainder bites. This is what
 *     makes duration matter, and it is why a 10-day event can be almost free
 *     while a 60-day event is not.
 *
 * What it deliberately does not do: explode the multi-level BOM to trace
 * component-level shortages, or model lead times and in-transit stock. Both
 * would sharpen it. The BOM is present (A_BOM_ITEM, 30 items) if this is ever
 * taken further.
 */
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------- data shapes

export interface Node {
  node_id: string; node_name: string; node_type: "Plant" | "Supplier" | "Customer";
  city: string; country: string; latitude: number; longitude: number;
  plant: string | null;
}

export interface Flow {
  flow_id: string; flow_type: "Inbound" | "Inter-plant" | "Outbound";
  material_category: string; monthly_volume: number; monthly_value: number;
  source_id: string; source_name: string; source_type: string;
  source_city: string; source_country: string;
  source_lat: number; source_lon: number; source_plant: string | null;
  target_id: string; target_name: string; target_type: string;
  target_city: string; target_country: string;
  target_lat: number; target_lon: number; target_plant: string | null;
}

export interface Capacity {
  plant: string; plant_name: string; work_centers: number;
  available_hrs: number; used_hrs: number; free_hrs: number;
  utilization_pct: number; headroom_pct: number;
  units_shipped: number; hrs_per_unit: number; spare_units: number;
}

export interface Inventory {
  plant: string; plant_name: string | null; materials: number;
  min_days_of_inventory: number; avg_days_of_inventory: number;
  stock_value: number; obsolete_materials: number;
}

export interface Substitution {
  material_category: string; flow_type: string;
  source_plant: string; plant_name: string;
  volume: number; value: number;
  capable_plants: number; has_alternative: boolean;
}

export interface PlantEconomics {
  node_id: string; plant_name: string; monthly_order_value: number; margin_rate: number;
  otif_pct: number; open_orders: number; open_order_value: number;
}

export interface Network {
  nodes: Node[]; flows: Flow[]; capacity: Capacity[]; economics?: PlantEconomics[];
  inventory: Inventory[]; substitution: Substitution[];
  totals: any; source: string; notes: Record<string, string>;
}

// ------------------------------------------------------------------ scenario

export type DisruptionKind =
  | "weather"       // an event at a location: the node stops or is degraded
  | "supplier"      // a supplier fails; every plant it feeds is starved
  | "capacity"      // a plant loses part of its capacity, not all of it
  | "lane"          // specific flows stop; the nodes keep operating
  | "demand";       // a customer surges demand, testing headroom upward

export interface Disruption {
  kind: DisruptionKind;
  /** Node ids for weather / supplier / capacity, flow ids for lane, customer node for demand. */
  targets: string[];
  /** 0..1. For `demand` this is the uplift (0.5 = +50%). */
  severity: number;
  /** Days. Compared against each receiving node's inventory buffer. */
  durationDays: number;
  label?: string;
}

export interface AffectedFlow {
  flow_id: string; flow_type: string; material_category: string;
  source_id: string; source_name: string;
  target_id: string; target_name: string; target_type: string;
  monthly_volume: number; monthly_value: number;
  /** Fraction of this flow lost, after severity and dependency. */
  impactFactor: number;
  /** Days this flow is actually degraded, after the receiver's buffer. */
  daysAtRisk: number;
  /** Units lost over the whole event — the business impact figure. */
  unitsAtRisk: number;
  /** Units lost PER MONTH. Capacity is a monthly rate, so any capacity
   *  comparison must use this and never unitsAtRisk. */
  unitsPerMonthAtRisk: number;
  valueAtRisk: number;
  hop: number;
  /** Why this flow is affected, in one phrase, for the UI. */
  reason: string;
}

export interface ImpairedNode {
  node_id: string; node_name: string; node_type: string;
  plant: string | null;
  hop: number;
  /** 0..1 degradation of this node's throughput. */
  impairment: number;
  bufferDays: number | null;
  daysExposed: number;
  /** Inbound dependency that caused it, for hop >= 1. */
  causedBy?: string;
}

export interface ScenarioResult {
  disruption: Disruption;
  origin: ImpairedNode[];
  impaired: ImpairedNode[];
  flows: AffectedFlow[];
  hops: { hop: number; nodes: number; flows: number; valueAtRisk: number }[];
  totals: {
    valueAtRisk: number;
    monthlyNetworkValue: number;
    pctOfNetwork: number;
    revenueAtRisk: number;       // outbound only — what customers do not receive
    /** Dollar view: margin on systems not built + penalties on orders pushed late. */
    lostMargin: number;
    latePenalty: number;
    costOfDisruption: number;
    ordersAtRisk: number;
    customersAffected: number;
    plantsImpaired: number;
    maxHop: number;
  };
  /** Model caveats surfaced in the UI rather than buried here. */
  assumptions: string[];
}

const DAYS_PER_MONTH = 30;
/** Below this, an impairment is noise and propagating it further adds nothing. */
const IMPAIRMENT_FLOOR = 0.02;
const MAX_HOPS = 4;

let _net: Network | null = null;

export function loadNetwork(): Network {
  if (_net) return _net;
  const f = path.resolve(import.meta.dirname, "../../../data/sc_network.json");
  if (!fs.existsSync(f)) {
    throw new Error(`Scenario network not found at ${f}. ` +
                    `Run: npm run export-network`);
  }
  _net = JSON.parse(fs.readFileSync(f, "utf-8")) as Network;
  return _net;
}

// ------------------------------------------------------------------ indexes

interface Idx {
  net: Network;
  node: Map<string, Node>;
  flow: Map<string, Flow>;
  outOf: Map<string, Flow[]>;
  intoOf: Map<string, Flow[]>;
  /** Total inbound volume per node — the denominator for dependency share. */
  inboundVolume: Map<string, number>;
  capByPlant: Map<string, Capacity>;
  invByPlant: Map<string, Inventory>;
}

function index(net: Network): Idx {
  const node = new Map(net.nodes.map((n) => [n.node_id, n]));
  const flow = new Map(net.flows.map((f) => [f.flow_id, f]));
  const outOf = new Map<string, Flow[]>();
  const intoOf = new Map<string, Flow[]>();
  const inboundVolume = new Map<string, number>();
  for (const f of net.flows) {
    (outOf.get(f.source_id) ?? outOf.set(f.source_id, []).get(f.source_id)!).push(f);
    (intoOf.get(f.target_id) ?? intoOf.set(f.target_id, []).get(f.target_id)!).push(f);
    inboundVolume.set(f.target_id, (inboundVolume.get(f.target_id) ?? 0) + f.monthly_volume);
  }
  return {
    net, node, flow, outOf, intoOf, inboundVolume,
    capByPlant: new Map(net.capacity.map((c) => [c.plant, c])),
    invByPlant: new Map(net.inventory.map((i) => [i.plant, i])),
  };
}

/** Inventory buffer in days for a node. Only plants hold stock in this dataset. */
function bufferDays(idx: Idx, n: Node): number | null {
  if (!n.plant) return null;
  return idx.invByPlant.get(n.plant)?.min_days_of_inventory ?? null;
}

/**
 * Days a receiver is actually exposed, after its buffer absorbs the front of the
 * event. Returns 0 when the buffer outlasts the disruption — the case that makes
 * short events cheap and is the single most important thing duration controls.
 */
function exposedDays(duration: number, buffer: number | null): number {
  if (buffer === null) return duration;      // suppliers and customers hold none here
  return Math.max(0, duration - buffer);
}

// --------------------------------------------------------------- propagation

export function simulate(d: Disruption): ScenarioResult {
  const net = loadNetwork();
  const idx = index(net);

  const impaired = new Map<string, ImpairedNode>();
  const affected = new Map<string, AffectedFlow>();
  const origin: ImpairedNode[] = [];

  const sev = Math.max(0, Math.min(1, d.severity));

  // ---- seed: what the event hits directly -------------------------------
  const seeds: { node: Node; impairment: number }[] = [];

  if (d.kind === "lane") {
    // Lanes stop while both endpoints keep running, so there is no seed node.
    // Each named flow is simply cut, and the receiver is impaired by its
    // dependency on that lane.
    for (const fid of d.targets) {
      const f = idx.flow.get(fid);
      if (!f) continue;
      const tgt = idx.node.get(f.target_id);
      const buf = tgt ? bufferDays(idx, tgt) : null;
      const days = exposedDays(d.durationDays, buf);
      const factor = sev * (days / Math.max(d.durationDays, 1));
      addFlow(affected, f, factor, days, 1, "lane closed");
      if (tgt && days > 0) {
        const dep = f.monthly_volume / Math.max(idx.inboundVolume.get(tgt.node_id) ?? 1, 1);
        seedImpair(impaired, tgt, sev * dep, 1, buf, days, `lost ${f.material_category} lane`);
      }
    }
  } else if (d.kind === "demand") {
    // Demand runs the other way: a customer asks for more, and the question is
    // whether the supplying plant has the headroom. Nothing is "at risk" in the
    // revenue sense, so this reports capacity shortfall instead.
    for (const cid of d.targets) {
      const cust = idx.node.get(cid);
      if (!cust) continue;
      origin.push({
        node_id: cust.node_id, node_name: cust.node_name, node_type: cust.node_type,
        plant: null, hop: 0, impairment: 0, bufferDays: null,
        daysExposed: d.durationDays,
      });
      for (const f of idx.intoOf.get(cid) ?? []) {
        addFlow(affected, f, sev, d.durationDays, 1, `demand +${Math.round(sev * 100)}%`);
      }
    }
  } else {
    for (const id of d.targets) {
      const n = idx.node.get(id);
      if (!n) continue;
      seeds.push({ node: n, impairment: sev });
    }
  }

  for (const s of seeds) {
    const buf = bufferDays(idx, s.node);
    const o: ImpairedNode = {
      node_id: s.node.node_id, node_name: s.node.node_name,
      node_type: s.node.node_type, plant: s.node.plant,
      hop: 0, impairment: s.impairment,
      bufferDays: buf, daysExposed: d.durationDays,
    };
    origin.push(o);
    impaired.set(s.node.node_id, o);
  }

  // ---- breadth-first outward ---------------------------------------------
  // Seed from everything the phase above impaired, each at its own hop. A lane
  // closure produces no origin node at all — only an impaired receiver at hop 1 —
  // so seeding from `origin` alone would leave that receiver's customers untouched
  // and report zero revenue at risk for a disruption that plainly has some.
  const queue: { id: string; hop: number }[] = [...impaired.values()]
    .filter((n) => n.impairment >= IMPAIRMENT_FLOOR)
    .map((n) => ({ id: n.node_id, hop: n.hop }));

  let frontier = queue.filter((q) => q.hop === Math.min(...queue.map((x) => x.hop)))
                      .map((q) => q.id);
  let startHop = queue.length ? Math.min(...queue.map((x) => x.hop)) : 0;

  for (let hop = startHop + 1; hop <= MAX_HOPS && frontier.length; hop++) {
    const next: string[] = [];
    for (const srcId of frontier) {
      const src = impaired.get(srcId);
      if (!src || src.impairment < IMPAIRMENT_FLOOR) continue;

      for (const f of idx.outOf.get(srcId) ?? []) {
        const tgt = idx.node.get(f.target_id);
        const buf = tgt ? bufferDays(idx, tgt) : null;
        const days = exposedDays(d.durationDays, buf);

        // The flow itself is degraded by the source's impairment for the whole
        // event; the receiver only feels it after its buffer runs out.
        const flowFactor = src.impairment;
        addFlow(affected, f, flowFactor, d.durationDays, hop,
                hop === 1 ? "source disrupted" : "upstream input reduced");

        if (!tgt || tgt.node_type === "Customer" || days <= 0) continue;

        // dependency share: how much of the receiver's inbound this flow is
        const dep = f.monthly_volume / Math.max(idx.inboundVolume.get(tgt.node_id) ?? 1, 1);
        const downstream = src.impairment * dep * (days / Math.max(d.durationDays, 1));
        if (downstream < IMPAIRMENT_FLOOR) continue;

        const existing = impaired.get(tgt.node_id);
        if (existing) {
          // A node fed by two disrupted paths is worse off than by either alone,
          // but impairment cannot exceed total loss.
          existing.impairment = Math.min(1, existing.impairment + downstream);
        } else {
          impaired.set(tgt.node_id, {
            node_id: tgt.node_id, node_name: tgt.node_name, node_type: tgt.node_type,
            plant: tgt.plant, hop, impairment: downstream,
            bufferDays: buf, daysExposed: days,
            causedBy: `${f.material_category} from ${f.source_name}`,
          });
          next.push(tgt.node_id);
        }
      }
    }
    frontier = next;
  }

  // ---- roll up -----------------------------------------------------------
  const flows = [...affected.values()].sort((a, b) => b.valueAtRisk - a.valueAtRisk);
  const impairedList = [...impaired.values()]
    .filter((n) => n.hop > 0)
    .sort((a, b) => a.hop - b.hop || b.impairment - a.impairment);

  const hopRows: ScenarioResult["hops"] = [];
  for (let h = 0; h <= MAX_HOPS; h++) {
    const hf = flows.filter((f) => f.hop === h);
    const hn = [...impaired.values()].filter((n) => n.hop === h);
    if (!hf.length && !hn.length) continue;
    hopRows.push({
      hop: h, nodes: hn.length, flows: hf.length,
      valueAtRisk: round(hf.reduce((s, f) => s + f.valueAtRisk, 0)),
    });
  }

  const monthlyNetworkValue = net.flows.reduce((s, f) => s + f.monthly_value, 0);
  const valueAtRisk = flows.reduce((s, f) => s + f.valueAtRisk, 0);
  const revenueAtRisk = flows
    .filter((f) => f.target_type === "Customer")
    .reduce((s, f) => s + f.valueAtRisk, 0);

  // ---- dollar view ---------------------------------------------------------
  // Each impaired plant loses `impairment` of its order book for the exposed days.
  // Margin is lost on what is not built; what is built late pays 0.5%/day of order
  // value, capped at 5% — the same penalty rule as Supply Chain 360.
  let lostMargin = 0, latePenalty = 0, ordersAtRisk = 0;
  const econ = new Map((net.economics ?? []).map((e) => [e.node_id, e]));
  for (const n of impaired.values()) {
    const e = econ.get(n.node_id);
    if (!e || n.node_type !== "Plant") continue;
    const days = n.daysExposed ?? d.durationDays;
    const valueHit = e.monthly_order_value * n.impairment * (days / DAYS_PER_MONTH);
    const slip = Math.round(days * n.impairment);
    lostMargin += valueHit * e.margin_rate * 0.5;          // half the shortfall is lost, half recovered late
    latePenalty += valueHit * 0.5 * Math.min(0.05, 0.005 * slip);
    ordersAtRisk += Math.round(e.open_orders * n.impairment);
  }

  return {
    disruption: d,
    origin,
    impaired: impairedList,
    flows,
    hops: hopRows,
    totals: {
      valueAtRisk: round(valueAtRisk),
      monthlyNetworkValue: round(monthlyNetworkValue),
      pctOfNetwork: round(100 * valueAtRisk / Math.max(monthlyNetworkValue, 1), 1),
      revenueAtRisk: round(revenueAtRisk),
      lostMargin: round(lostMargin),
      latePenalty: round(latePenalty),
      costOfDisruption: round(lostMargin + latePenalty),
      ordersAtRisk,
      customersAffected: new Set(
        flows.filter((f) => f.target_type === "Customer").map((f) => f.target_id)).size,
      plantsImpaired: impairedList.filter((n) => n.node_type === "Plant").length,
      maxHop: hopRows.length ? Math.max(...hopRows.map((h) => h.hop)) : 0,
    },
    assumptions: [
      "Impact spreads in proportion to how much a node depends on the lost flow, " +
      "measured as that flow's share of the node's inbound volume.",
      "Inventory defers impact at the receiving node: a plant with 12 days of " +
      "buffer absorbs the first 12 days of the event.",
      "Value at risk prorates monthly flow value over the days actually exposed.",
      "The multi-level BOM is not exploded, so component-level shortages inside " +
      "a plant are not traced.",
      "Cost of disruption assumes half the lost output is never sold (margin lost) " +
      "and half ships late at 0.5% of order value per day, capped at 5%. Order " +
      "economics are representative demo enrichment.",
    ],
  };
}

function addFlow(
  acc: Map<string, AffectedFlow>, f: Flow, factor: number,
  days: number, hop: number, reason: string,
) {
  const clamped = Math.max(0, Math.min(1, factor));
  if (clamped < IMPAIRMENT_FLOOR) return;
  const prior = acc.get(f.flow_id);
  // Keep the worst assessment of a flow, and the earliest hop that found it.
  if (prior && prior.impactFactor >= clamped) return;
  const share = days / DAYS_PER_MONTH;
  acc.set(f.flow_id, {
    flow_id: f.flow_id, flow_type: f.flow_type, material_category: f.material_category,
    source_id: f.source_id, source_name: f.source_name,
    target_id: f.target_id, target_name: f.target_name, target_type: f.target_type,
    monthly_volume: f.monthly_volume, monthly_value: f.monthly_value,
    impactFactor: round(clamped, 3),
    daysAtRisk: round(days, 1),
    unitsAtRisk: round(f.monthly_volume * clamped * share, 2),
    unitsPerMonthAtRisk: round(f.monthly_volume * clamped, 2),
    valueAtRisk: round(f.monthly_value * clamped * share),
    hop: prior ? Math.min(prior.hop, hop) : hop,
    reason,
  });
}

function seedImpair(
  m: Map<string, ImpairedNode>, n: Node, impairment: number,
  hop: number, buf: number | null, days: number, causedBy: string,
) {
  const cur = m.get(n.node_id);
  if (cur) { cur.impairment = Math.min(1, cur.impairment + impairment); return; }
  m.set(n.node_id, {
    node_id: n.node_id, node_name: n.node_name, node_type: n.node_type,
    plant: n.plant, hop, impairment: Math.min(1, impairment),
    bufferDays: buf, daysExposed: days, causedBy,
  });
}

function round(v: number, dp = 0): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}
