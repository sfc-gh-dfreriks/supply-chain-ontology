/**
 * AI reasoning over a simulated scenario.
 *
 * ---------------------------------------------------------------------------
 * Why COMPLETE and not Cortex Analyst
 * ---------------------------------------------------------------------------
 * Analyst answers questions about data that exists in tables. A scenario is a
 * hypothetical the engine has just computed in memory — the ripple, the reroutes
 * and the residual exposure are nowhere in Snowflake to be queried. Analyst would
 * dutifully query the undisrupted network and answer the wrong question.
 *
 * So the computed scenario is passed to AI_COMPLETE as facts, and
 * the model is asked to interpret rather than to calculate. Every number in the
 * prompt comes from the deterministic engine; the model contributes judgement,
 * ranking and prose. That split is deliberate and worth preserving: if the model
 * were asked to do arithmetic the figures would stop being auditable.
 */
import { runSql } from "./snowflake.js";
import type { ScenarioResult } from "./scenario.js";
import type { MitigationPlan } from "./mitigate.js";

const MODEL = process.env.SCENARIO_LLM_MODEL ?? "claude-opus-5-5";

export function reasoningConfigured(): { ok: boolean; missing: string[] } {
  const missing = ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PRIVATE_KEY_PATH"]
    .filter((k) => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

const money = (n: number) => "$" + Math.round(n).toLocaleString();

/**
 * Compact, factual summary of the scenario. Kept tight on purpose — a long dump
 * of every flow buries the few figures that drive the decision, and the model
 * starts narrating the data instead of interpreting it.
 */
function brief(res: ScenarioResult, plan: MitigationPlan): string {
  const d = res.disruption;
  const L: string[] = [];

  L.push(`DISRUPTION: ${d.label ?? d.kind}`);
  L.push(`  type ${d.kind}, severity ${Math.round(d.severity * 100)}%, ` +
         `duration ${d.durationDays} days`);
  L.push(`  origin: ${res.origin.map((o) => o.node_name).join(", ") || "n/a"}`);

  L.push(`\nIMPACT`);
  L.push(`  value at risk ${money(res.totals.valueAtRisk)} ` +
         `(${res.totals.pctOfNetwork}% of the ${money(res.totals.monthlyNetworkValue)} monthly network)`);
  L.push(`  customer revenue at risk ${money(res.totals.revenueAtRisk)} ` +
         `across ${res.totals.customersAffected} customers`);
  L.push(`  ripple depth ${res.totals.maxHop} hops, ${res.totals.plantsImpaired} plants impaired`);

  if (res.impaired.length) {
    L.push(`\nDOWNSTREAM NODES`);
    for (const n of res.impaired.slice(0, 8)) {
      L.push(`  hop ${n.hop} ${n.node_name}: ${Math.round(n.impairment * 100)}% impaired, ` +
             `inventory buffer ${n.bufferDays ?? "none"} days, exposed ${n.daysExposed} days` +
             (n.causedBy ? ` (via ${n.causedBy})` : ""));
    }
  }

  L.push(`\nFLOWS AT RISK (top by value)`);
  for (const f of res.flows.slice(0, 10)) {
    L.push(`  hop ${f.hop} ${f.source_name} -> ${f.target_name} [${f.material_category}] ` +
           `${Math.round(f.impactFactor * 100)}% lost, ${money(f.valueAtRisk)}`);
  }

  if (plan.reroutes.length) {
    L.push(`\nFEASIBLE REROUTES (from the optimizer)`);
    for (const r of plan.reroutes) {
      L.push(`  ${r.material_category} for ${r.customer}: ${r.fromPlant} -> ${r.toPlant}, ` +
             `${r.unitsMoved} units/month, needs ${r.hrsRequired}h of ${r.hrsAvailableBefore}h free, ` +
             `leaves ${r.headroomPctAfter}% headroom, protects ${money(r.valueProtected)}` +
             (r.distanceDeltaKm != null ? `, ${r.distanceDeltaKm >= 0 ? "+" : ""}${r.distanceDeltaKm} km` : ""));
    }
  }

  if (plan.unmitigable.length) {
    L.push(`\nCANNOT BE REROUTED`);
    for (const u of plan.unmitigable) {
      L.push(`  ${u.material_category} for ${u.customer}: ${money(u.valueAtRisk)} — ${u.reason}`);
    }
  }

  if (plan.capacityAfter.length) {
    L.push(`\nRECEIVING PLANT LOAD AFTER REROUTING`);
    for (const c of plan.capacityAfter) {
      L.push(`  ${c.plantName}: ${c.utilizationBefore}% -> ${c.utilizationAfter}%, ` +
             `${c.spareUnitsLeft} spare units left`);
    }
  }

  L.push(`\nOUTCOME: ${money(plan.totals.valueProtected)} protected of ` +
         `${money(plan.totals.revenueAtRisk)} at risk (${plan.totals.protectedPct}%), ` +
         `${money(plan.totals.valueUnprotected)} residual exposure`);

  L.push(`\nMODEL CAVEATS (do not contradict these)`);
  for (const c of [...res.assumptions, ...plan.caveats]) L.push(`  - ${c}`);

  return L.join("\n");
}

const SYSTEM = `
You are a supply-chain resilience analyst briefing an operations director.

The figures below were produced by a deterministic simulation. Treat them as
given. Do not recompute them, do not invent new numbers, and do not contradict
the stated caveats. If something needed to answer well is genuinely absent, say
so plainly rather than estimating it.

Write for someone who has to act this week. Be specific and concrete. Prefer
short paragraphs and tight bullets over headings. No preamble, no restating the
question, no closing summary.
`.trim();

/**
 * Run COMPLETE. The prompt is single-quote escaped rather than bound: the
 * connector's bind support does not cover this function call shape, and the
 * prompt contains scenario labels that originate from the client.
 */
async function completeBound(prompt: string): Promise<string> {
  const escaped = prompt.replace(/'/g, "''");
  const { rows } = await runSql(
    `SELECT AI_COMPLETE('${MODEL}', '${escaped}') AS RESPONSE`);
  const text = String(rows?.[0]?.[0] ?? "").trim();
  if (!text) throw new Error("AI_COMPLETE returned no text");
  return text;
}

export async function explain(res: ScenarioResult, plan: MitigationPlan): Promise<string> {
  const prompt = `${SYSTEM}

${brief(res, plan)}

Brief the director in four short sections, using these exact labels:

WHAT HAPPENS — the ripple in plain language, naming the nodes and why the impact
reaches them. Make clear which effects are immediate and which are deferred by
inventory.

WHAT IT COSTS — the exposure, and which single line item matters most.

WHAT TO DO NOW — the reroutes, in priority order, and what each one costs in
capacity. Flag any plant left with no room.

WHAT IS STILL EXPOSED — the residual risk and the specific action it needs.
Distinguish "nobody else makes this" from "the alternative is full".`;

  return completeBound(prompt);
}

/** Follow-up what-if against the same computed scenario. */
export async function interrogate(
  res: ScenarioResult, plan: MitigationPlan,
  question: string, history: { role: string; text: string }[] = [],
): Promise<string> {
  const convo = history.length
    ? "\nEARLIER IN THIS CONVERSATION\n" +
      history.slice(-6).map((h) => `  ${h.role}: ${h.text}`).join("\n")
    : "";

  const prompt = `${SYSTEM}

${brief(res, plan)}
${convo}

QUESTION: ${question}

Answer only this question, grounded in the figures above. If the question asks
about a change the simulation has not modelled — a different plant, a longer
outage, extra capacity — reason from the numbers given and say explicitly which
part is inference rather than simulated output. If answering properly would need
a re-run with different inputs, say which inputs to change.`;

  return completeBound(prompt);
}
