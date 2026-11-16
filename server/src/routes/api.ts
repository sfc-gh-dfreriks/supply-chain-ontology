import { Router } from "express";
import { loadBusinessOntology, boSummary, boNodeFor, buildBoGraph }
  from "../services/businessOntology.js";
import { loadNetwork, simulate, type Disruption, type DisruptionKind }
  from "../services/scenario.js";
import { mitigate } from "../services/mitigate.js";
import { explain, interrogate, reasoningConfigured } from "../services/reason.js";
import { threadSummary, serialTrace, askCortex, operations } from "../services/thread.js";
import { STATIC_PRESETS } from "../services/presets.js";

// Every route serves data that was exported through Snowflake Business Ontology:
// the governed "Supply Chain" domain itself (/api/bo/*), the scenario network built
// by walking its relationships (/api/scenario/*), and the digital thread read from
// its concepts' representations (/api/thread, /api/operations).

export const apiRouter = Router();

// the sync `wrap` below cannot catch a rejected promise, so async handlers need
// their own wrapper or a Cortex failure surfaces as an unhandled rejection and
// the request hangs instead of returning an error
function wrapAsync(handler: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any) => {
    handler(req, res).catch((e: any) =>
      res.status(500).json({
        error: String(e?.message || e),
      })
    );
  };
}

function wrap(handler: (req: any, res: any) => void) {
  return (req: any, res: any) => {
    try {
      handler(req, res);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  };
}

apiRouter.get("/api/health", (_req, res) => res.json({ ok: true }));

/** What the sidebar and dashboard need to say what the app is built on. */
apiRouter.get("/api/meta", wrap((_req, res) => {
  const bo = boSummary(loadBusinessOntology());
  const net = loadNetwork();
  res.json({ ontology: bo, network: net.totals, networkSource: net.source, lineage: (net as any).lineage ?? null });
}));

// ---- Snowflake Business Ontology: the governed domain -----------------------

apiRouter.get("/api/bo/summary", wrap((_req, res) => {
  res.json(boSummary(loadBusinessOntology()));
}));

apiRouter.get("/api/bo/graph", wrap((_req, res) => {
  const bo = loadBusinessOntology();
  if (!bo) { res.status(404).json({ error: "Business Ontology export not found. Run: python3 tools/export_business_ontology.py" }); return; }
  res.json({ elements: buildBoGraph(bo), counts: bo.counts, exportedAt: bo.exportedAt });
}));

apiRouter.get("/api/bo/node/:name", wrap((req, res) => {
  const n = boNodeFor(loadBusinessOntology(), String(req.params.name));
  if (!n) { res.status(404).json({ error: `No such concept: ${req.params.name}` }); return; }
  res.json(n);
}));

// ---- scenario modelling ----------------------------------------------------

const KINDS: DisruptionKind[] = ["weather", "supplier", "capacity", "lane", "demand"];

/** The network plus everything the Studio needs to build a valid disruption. */
apiRouter.get("/api/scenario/network", wrap((_req, res) => {
  const net = loadNetwork();
  res.json({
    nodes: net.nodes, flows: net.flows,
    capacity: net.capacity, inventory: net.inventory,
    substitution: net.substitution,
    totals: net.totals, notes: net.notes, source: net.source,
    kinds: KINDS,
  });
}));

/**
 * Validate a disruption from the client. Returning a clear reason beats letting
 * the engine silently produce an empty ripple, which reads as "no impact" and is
 * indistinguishable from a working simulation of a harmless event.
 */
function parseDisruption(body: any): { d?: Disruption; error?: string } {
  const kind = String(body?.kind ?? "");
  if (!KINDS.includes(kind as DisruptionKind)) {
    return { error: `kind must be one of ${KINDS.join(", ")}` };
  }
  const targets: string[] = Array.isArray(body?.targets)
    ? body.targets.map(String).filter(Boolean) : [];
  if (!targets.length) return { error: "at least one target is required" };

  const net = loadNetwork();
  const known = kind === "lane"
    ? new Set(net.flows.map((f) => f.flow_id))
    : new Set(net.nodes.map((n) => n.node_id));
  const unknown = targets.filter((t) => !known.has(t));
  if (unknown.length) {
    return { error: `unknown ${kind === "lane" ? "flow" : "node"} id: ${unknown.join(", ")}` };
  }
  if (kind === "demand") {
    const nonCustomer = targets.filter(
      (t) => net.nodes.find((n) => n.node_id === t)?.node_type !== "Customer");
    if (nonCustomer.length) {
      return { error: `demand targets must be customers: ${nonCustomer.join(", ")}` };
    }
  }

  const severity = Number(body?.severity);
  const durationDays = Number(body?.durationDays);
  if (!Number.isFinite(severity) || severity <= 0) {
    return { error: "severity must be greater than 0" };
  }
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    return { error: "durationDays must be greater than 0" };
  }

  return {
    d: {
      kind: kind as DisruptionKind,
      targets,
      severity: Math.min(kind === "demand" ? 5 : 1, severity),
      durationDays: Math.min(365, durationDays),
      label: body?.label ? String(body.label).slice(0, 120) : undefined,
    },
  };
}

/** Simulate and mitigate in one call — the UI always needs both together. */
apiRouter.post("/api/scenario/simulate", wrap((req, res) => {
  const { d, error } = parseDisruption(req.body);
  if (!d) return res.status(400).json({ error });
  const result = simulate(d);
  res.json({ result, plan: mitigate(result) });
}));

apiRouter.get("/api/scenario/reasoning/status", wrap((_req, res) => {
  res.json(reasoningConfigured());
}));

/** AI briefing over an already-computed scenario. */
apiRouter.post("/api/scenario/explain", wrapAsync(async (req, res) => {
  const { d, error } = parseDisruption(req.body);
  if (!d) { res.status(400).json({ error }); return; }
  const result = simulate(d);
  const plan = mitigate(result);
  res.json({ text: await explain(result, plan) });
}));

/** Follow-up what-if against the same scenario. */
apiRouter.post("/api/scenario/ask", wrapAsync(async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (!question) { res.status(400).json({ error: "question is required" }); return; }
  const { d, error } = parseDisruption(req.body);
  if (!d) { res.status(400).json({ error }); return; }
  const result = simulate(d);
  const plan = mitigate(result);
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  res.json({ text: await interrogate(result, plan, question, history) });
}));

/** Preset scenarios, so the page opens on something meaningful. */
apiRouter.get("/api/scenario/presets", wrap((_req, res) => {
  // Live presets first: derived from Supply Chain 360 risk (failing tool, worst
  // shortfall, rejected lot) by tools/export_ops_thread.py.
  res.json([
    ...operations().presets.map((p: any) => ({ ...p, source: "sc360" })),
    ...STATIC_PRESETS,
  ]);
}));

// ---------------------------------------------------------------- digital thread
apiRouter.get("/api/thread", wrap((_req, res) => res.json(threadSummary())));
apiRouter.get("/api/operations", wrap((_req, res) => res.json(operations())));

apiRouter.get("/api/thread/serial/:serial", wrap((req, res) => {
  const t = serialTrace(String(req.params.serial));
  if (!t) return res.status(404).json({ error: "serial not found" });
  res.json(t);
}));

/** Ask Cortex: grounded analysis of the view on screen, or of the whole domain (topic "domain"). */
apiRouter.post("/api/ask-cortex", wrapAsync(async (req, res) => {
  const topic = String(req.body?.topic ?? "");
  const args = (req.body?.args && typeof req.body.args === "object") ? req.body.args : {};
  if (["scenario", "ripple", "mitigation", "optimize"].includes(topic)) {
    const { d, error } = parseDisruption(args.disruption ?? {});
    if (!d) { res.status(400).json({ error }); return; }
    args.disruption = d;
  }
  res.json({ text: await askCortex(topic, args, String(req.body?.question ?? "").slice(0, 1000)) });
}));
