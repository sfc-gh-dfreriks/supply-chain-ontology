/**
 * S/4HANA writeback for the recovery plan, governed by Business Ontology Actions.
 *
 * The flow mirrors the Action-node pattern (Ontology Execution and Writeback):
 *   - the ontology holds each operation's contract (Reassign Delivering Plant,
 *     Create Planned Order, Approve Recovery Change Request), found by walking
 *     ACTS_ON into Sales Order and Plant, never by name in this file;
 *   - the change request checks every contract criterion against live data;
 *   - only the procedures the contracts name write, and each refuses unless its
 *     change request was approved by a second person who acknowledged that the
 *     change alters the transactional system.
 *
 * The S/4HANA system is SIMULATED in SAP_SUPPLY_CHAIN.S4_WRITEBACK (document
 * mirrors, CDHDR/CDPOS-style change documents, an OData-shaped outbox).
 *
 * The plan is recomputed here from the disruption, exactly as /scenario/explain
 * does, so the browser cannot submit a plan the optimizer did not produce. Its
 * hash is stored on the change request and rechecked before approval and posting.
 */
import { createHash } from "node:crypto";
import { runSql } from "./snowflake.js";
import type { MitigationPlan } from "./mitigate.js";

const WB = "SAP_SUPPLY_CHAIN.S4_WRITEBACK";
export const TARGET_SYSTEM = { id: "S4H", client: "100", label: "SAP S/4HANA (S4H, client 100) - simulated" };
export const CONFIRMATION_PHRASE = "POST TO S4HANA";
export const ACKNOWLEDGEMENTS = [
  { id: "reviewed", text: "I have reviewed every document change listed above." },
  { id: "transactional", text: "I understand this changes live transactional data in S/4HANA: sales order items and production planning." },
  { id: "recorded", text: "I understand every change is recorded in S/4 change documents under my name and can only be undone by a reversal." },
];
const ACTION_ENTITIES = ["Supply Chain.Sales Order", "Supply Chain.Plant"];

/** Stable fingerprint of what the plan would change; any drift invalidates an approval. */
export function planHash(plan: MitigationPlan): string {
  const core = plan.reroutes.map((r) => [r.flow_id, r.toPlantId, r.unitsMoved]).sort();
  return createHash("sha256").update(JSON.stringify(core)).digest("hex").slice(0, 16);
}

async function callJson(sql: string, binds: any[]): Promise<any> {
  const { rows } = await runSql(sql, binds);
  const v = rows[0]?.[0];
  return typeof v === "string" ? JSON.parse(v) : v;
}

function check(r: any) {
  if (r && typeof r === "object" && r.error) throw Object.assign(new Error(String(r.error)), { status: 409 });
  return r;
}

/** Action contracts from the governed domain, discovered through ACTS_ON. */
export async function actions() {
  const out: any[] = [];
  for (const entity of ACTION_ENTITIES) {
    const list = await callJson(`CALL ${WB}.FIND_ACTIONS_FOR_ENTITY(?)`, [entity]);
    for (const a of list ?? []) out.push({ ...a, actsOn: entity });
  }
  return { system: TARGET_SYSTEM, actions: out };
}

export async function propose(plan: MitigationPlan, scenario: string, requestedBy: string) {
  if (!plan.reroutes.length) throw Object.assign(new Error("This plan has no reroutes to execute."), { status: 400 });
  const body = {
    scenario, requestedBy, planHash: planHash(plan),
    reroutes: plan.reroutes.map((r) => ({
      flow_id: r.flow_id, material_category: r.material_category, customer: r.customer,
      fromPlant: r.fromPlant, toPlantId: r.toPlantId, unitsMoved: r.unitsMoved,
    })),
  };
  const r = check(await callJson(`CALL ${WB}.SP_PROPOSE_RECOVERY_CR(PARSE_JSON(?))`, [JSON.stringify(body)]));
  return changeRequest(r.cr_id);
}

export async function changeRequest(crId: string): Promise<Record<string, any>> {
  const q = async (sql: string) => {
    const { columns, rows } = await runSql(sql, [crId]);
    return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.toLowerCase(), parse(r[i])])));
  };
  const [cr] = (await q(`SELECT * FROM ${WB}.RECOVERY_CHANGE_REQUEST WHERE CR_ID = ?`)) as Record<string, any>[];
  if (!cr) throw Object.assign(new Error(`Change request ${crId} not found`), { status: 404 });
  return {
    ...cr,
    system: TARGET_SYSTEM, confirmationPhrase: CONFIRMATION_PHRASE, acknowledgements: ACKNOWLEDGEMENTS,
    items: await q(`SELECT * FROM ${WB}.CR_ITEM WHERE CR_ID = ? ORDER BY CR_ITEM`),
    approvals: await q(`SELECT * FROM ${WB}.CR_APPROVAL WHERE CR_ID = ? ORDER BY DECIDED_AT`),
    changeDocuments: await q(`SELECT * FROM ${WB}.S4_CHANGE_DOCUMENT WHERE CR_ID = ? ORDER BY CHANGENR`),
    outbox: await q(`SELECT * FROM ${WB}.S4_API_OUTBOX WHERE CR_ID = ? ORDER BY CALL_ID`),
  };
}

async function assertCurrent(crId: string, plan: MitigationPlan) {
  const cr = await changeRequest(crId);
  if (cr.plan_hash !== planHash(plan)) {
    throw Object.assign(new Error("The recovery plan has changed since this request was raised. Raise a new change request."), { status: 409 });
  }
  return cr;
}

export async function decide(crId: string, plan: MitigationPlan, d: {
  decision: "APPROVE" | "REJECT"; approver: string; acknowledgements: string[]; confirmation: string; comment: string;
}) {
  await assertCurrent(crId, plan);
  check(await callJson(`CALL ${WB}.SP_DECIDE_CR(?, ?, ?, PARSE_JSON(?), ?, ?)`,
    [crId, d.decision, d.approver, JSON.stringify(d.acknowledgements ?? []), d.confirmation ?? "", d.comment ?? ""]));
  return changeRequest(crId);
}

export async function post(crId: string, plan: MitigationPlan) {
  await assertCurrent(crId, plan);
  check(await callJson(`CALL ${WB}.SP_POST_CR(?)`, [crId]));
  return changeRequest(crId);
}

export async function reverse(crId: string, by: string) {
  check(await callJson(`CALL ${WB}.SP_REVERSE_CR(?, ?)`, [crId, by]));
  return changeRequest(crId);
}

export async function resetDemo() {
  const { rows } = await runSql(`CALL ${WB}.SP_RESET_DEMO()`);
  return { message: rows[0]?.[0] };
}

function parse(v: unknown) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return v;
  try { return JSON.parse(t); } catch { return v; }
}
