import { useEffect, useState } from "react";
import { STATIC, writeback, type ActionContract, type ChangeRequest, type Disruption } from "../lib/api";

/**
 * Execute the recovery plan in S/4HANA, governed by Business Ontology Actions.
 *
 *   1. Review   - the plan becomes a change request: one row per S/4 document
 *                 change, each tied to the Action contract that performs it and
 *                 with every contract criterion checked against live data.
 *   2. Approve  - a second person, holding the approver role, acknowledges that
 *                 this alters the transactional system and types the confirmation.
 *   3. Posted   - the OData calls S/4 received, the change documents it wrote,
 *                 and a reversal for demo resets.
 *
 * Nothing here writes on its own: the server recomputes the plan, and the Snowflake
 * procedures named by the contracts refuse anything not approved. The S/4HANA
 * system is simulated in SAP_SUPPLY_CHAIN.S4_WRITEBACK.
 */
const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800", APPROVED: "bg-sky-100 text-sky-800",
  POSTED: "bg-emerald-100 text-emerald-800", POSTED_WITH_ERRORS: "bg-rose-100 text-rose-800",
  REJECTED: "bg-slate-200 text-slate-700", REVERSED: "bg-slate-200 text-slate-700",
};

export function ExecuteInS4({ disruption, onStatus }: { disruption: Disruption; onStatus?: (status: string | null) => void }) {
  const [contracts, setContracts] = useState<ActionContract[]>([]);
  const [cr, setCr] = useState<ChangeRequest | null>(null);
  const [example, setExample] = useState<{ proposed: ChangeRequest; posted: ChangeRequest } | null>(null);
  const [requester, setRequester] = useState("Maria Chen (Supply Planner)");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [openContract, setOpenContract] = useState<string | null>(null);

  useEffect(() => {
    writeback.actions().then((r) => setContracts(r.actions)).catch(() => setContracts([]));
    if (STATIC) writeback.example().then(setExample).catch(() => setExample(null));
  }, []);
  // a new scenario invalidates any change request raised for the previous one
  useEffect(() => { setCr(null); setError(null); }, [disruption]);

  const run = async (label: string, fn: () => Promise<ChangeRequest>) => {
    setBusy(label); setError(null);
    try { setCr(await fn()); } catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(null); }
  };

  const shown = cr ?? (STATIC ? example?.proposed ?? null : null);
  useEffect(() => { onStatus?.(shown?.status ?? null); }, [shown?.status, onStatus]);
  const contractFor = (name: string) => contracts.find((c) => c.name === name);

  return (
    <div className="rounded-lg border-2 border-indigo-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Execute in SAP S/4HANA
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
            Turn the reroutes into S/4HANA document changes. Each change is performed by a
            governed <b>Action</b> in the Supply Chain ontology, whose contract says what it needs,
            when it is allowed and what it changes. Nothing posts until a second person approves.
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
          Target: SAP S/4HANA S4H · client 100 <span className="text-slate-400">(simulated in Snowflake)</span>
        </span>
      </div>

      {/* the contracts */}
      <div className="mt-3 flex flex-wrap gap-2">
        {contracts.map((c) => (
          <button key={c.fqn} onClick={() => setOpenContract(openContract === c.name ? null : c.name)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${openContract === c.name
              ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-gray-200 text-slate-600 hover:border-indigo-300"}`}>
            ◇ {c.name} <span className="text-slate-400">acts on {c.actsOn.replace("Supply Chain.", "")}</span>
          </button>
        ))}
        {!contracts.length && <span className="text-[11px] text-slate-400">Loading Action contracts from the ontology…</span>}
      </div>
      {openContract && contractFor(openContract) && <Contract c={contractFor(openContract)!} />}

      {/* step 1: raise */}
      {!shown && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-slate-50 p-3">
          <label className="text-[11px] text-slate-600">
            Requested by
            <input value={requester} onChange={(e) => setRequester(e.target.value)}
              className="mt-1 block w-64 rounded border border-gray-300 px-2 py-1 text-xs" />
          </label>
          <button disabled={!!busy || !requester.trim() || STATIC}
            onClick={() => run("propose", () => writeback.propose(disruption, requester.trim()))}
            className="rounded bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-800 disabled:opacity-50">
            {busy === "propose" ? "Checking every criterion…" : "Raise change request"}
          </button>
          <span className="text-[11px] text-slate-500">Builds the change set and checks it. Writes nothing to S/4HANA.</span>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      )}

      {shown && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-slate-700">{shown.cr_id}</span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[shown.status] ?? "bg-slate-100"}`}>
              {shown.status}
            </span>
            <span className="text-slate-500">
              requested by {shown.requested_by}
              {shown.approved_by && <> · {shown.status === "REJECTED" ? "rejected" : "approved"} by {shown.approved_by}</>}
            </span>
            {STATIC && <span className="text-[11px] text-amber-700">Example from a live run. Executing needs a live connection.</span>}
          </div>

          <ChangeSet cr={shown} contractFor={contractFor} />

          {shown.status === "SUBMITTED" && (
            <div className="flex flex-wrap gap-2">
              <button disabled={STATIC || !!busy} onClick={() => setApproving(true)}
                className="rounded bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
                Review and approve changes to S/4HANA…
              </button>
              <button disabled={STATIC || !!busy} onClick={() => setCr(null)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Discard
              </button>
            </div>
          )}
          {shown.status === "APPROVED" && (
            <div className="flex flex-wrap items-center gap-3 rounded border border-sky-200 bg-sky-50 p-3">
              <button disabled={STATIC || !!busy} onClick={() => run("post", () => writeback.post(shown.cr_id, disruption))}
                className="rounded bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
                {busy === "post" ? "Posting to S/4HANA…" : `Post ${shown.items.filter((i) => i.eligible).length} changes to S/4HANA`}
              </button>
              <span className="text-[11px] text-sky-900">
                Approved. Each change runs through the procedure its Action contract names, which re-checks its criteria first.
              </span>
            </div>
          )}
          {(shown.status === "POSTED" || shown.status === "POSTED_WITH_ERRORS" || shown.status === "REVERSED") &&
            <Posted cr={STATIC ? example?.posted ?? shown : shown} />}
          {(shown.status === "POSTED" || shown.status === "POSTED_WITH_ERRORS") && (
            <div className="flex gap-2">
              <button disabled={STATIC || !!busy}
                onClick={() => run("reverse", () => writeback.reverse(shown.cr_id, shown.approved_by ?? "demo reset"))}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busy === "reverse" ? "Reversing…" : "Reverse these changes (demo reset)"}
              </button>
            </div>
          )}
          {(shown.status === "REVERSED" || shown.status === "REJECTED") && !STATIC && (
            <button onClick={() => setCr(null)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              Raise a new change request
            </button>
          )}
        </div>
      )}

      {STATIC && example && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">After approval and posting</div>
          <Posted cr={example.posted} />
        </div>
      )}

      {approving && shown && (
        <ApprovalDialog cr={shown} onClose={() => setApproving(false)} busy={busy === "decide"}
          onDecide={(body) => run("decide", () => writeback.decide(shown.cr_id, disruption, body)).then(() => setApproving(false))} />
      )}
    </div>
  );
}

function Contract({ c }: { c: ActionContract }) {
  const s = c.actionSpec;
  return (
    <div className="mt-2 rounded border border-indigo-200 bg-indigo-50/40 p-3 text-[11px] text-slate-700">
      <div className="font-semibold text-indigo-900">{c.fqn} <span className="font-normal text-slate-500">· {s.actionKind} · {c.status}</span></div>
      <p className="mt-1">{c.description}</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <div><div className="font-semibold text-slate-500">Criteria</div>{s.criteria.map((x) => <div key={x}>• {x}</div>)}</div>
        <div><div className="font-semibold text-slate-500">Effects</div>{s.effects.map((x) => <div key={x}>• {x}</div>)}</div>
        <div>
          <div className="font-semibold text-slate-500">Parameters</div>
          {s.parameters.map((p) => <div key={p.name}><span className="font-mono">{p.name}</span> <span className="text-slate-400">{p.dataType}</span></div>)}
          <div className="mt-1 font-semibold text-slate-500">Runs via</div>
          <div className="font-mono text-[10px]">{s.execution.kind} {s.execution.target}</div>
        </div>
      </div>
    </div>
  );
}

function ChangeSet({ cr, contractFor }: { cr: ChangeRequest; contractFor: (n: string) => ActionContract | undefined }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-slate-500">
        <tr className="border-b border-gray-200">
          <th className="py-1.5">#</th><th>Action</th><th>S/4 document</th><th>Field</th>
          <th>Before</th><th>After</th><th>Criteria (from the contract)</th><th>Result</th>
        </tr>
      </thead>
      <tbody>
        {cr.items.map((i) => (
          <tr key={i.cr_item} className={`border-b border-gray-100 align-top ${i.eligible ? "" : "bg-rose-50"}`}>
            <td className="py-1.5 text-slate-400">{i.cr_item}</td>
            <td className="text-indigo-800" title={contractFor(i.action_name)?.actionSpec.execution.target}>◇ {i.action_name}</td>
            <td className="font-mono text-slate-700">{i.object_type} {i.object_key}</td>
            <td className="text-slate-500">{i.field}</td>
            <td className="text-rose-700">{i.value_before ?? "-"}</td>
            <td className="font-medium text-emerald-700">{i.value_after}</td>
            <td>
              {i.criteria.map((k) => (
                <div key={k.criterion} className={k.pass ? "text-slate-600" : "font-medium text-rose-700"}>
                  {k.pass ? "✓" : "✗"} {k.criterion}
                </div>
              ))}
            </td>
            <td className="text-[11px] text-slate-600">{i.result ?? (i.eligible ? "pending" : "excluded: a criterion failed")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApprovalDialog({ cr, onClose, onDecide, busy }: {
  cr: ChangeRequest; onClose: () => void; busy: boolean;
  onDecide: (b: { decision: "APPROVE" | "REJECT"; approver: string; acknowledgements: string[]; confirmation: string; comment: string }) => void;
}) {
  const [approver, setApprover] = useState("");
  const [acks, setAcks] = useState<string[]>([]);
  const [phrase, setPhrase] = useState("");
  const [comment, setComment] = useState("");
  const eligible = cr.items.filter((i) => i.eligible);
  const counts = eligible.reduce<Record<string, number>>((m, i) => ({ ...m, [i.object_type]: (m[i.object_type] ?? 0) + 1 }), {});
  const sameAsRequester = approver.trim().toLowerCase() === cr.requested_by.trim().toLowerCase();
  const ready = approver.trim() && !sameAsRequester && acks.length === cr.acknowledgements.length && phrase === cr.confirmationPhrase;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="rounded-t-lg bg-rose-700 px-5 py-3 text-white">
          <div className="text-sm font-bold">You are about to change transactional data in SAP S/4HANA</div>
          <div className="text-xs opacity-90">{cr.system.label} · change request {cr.cr_id}</div>
        </div>
        <div className="space-y-4 p-5 text-xs text-slate-700">
          <p>
            Approving lets this request write to the system of record. Sales order items will be
            delivered from a different plant and new planned orders will enter production planning.
            Customers, MRP, capacity planning and shipping will act on these documents.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(counts).map(([t, n]) => (
              <div key={t} className="rounded border border-gray-200 px-3 py-2">
                <div className="text-lg font-bold text-slate-800">{n}</div>
                <div className="text-[11px] text-slate-500">{t}{n === 1 ? "" : "s"} {t === "Planned Order" ? "created" : "changed"}</div>
              </div>
            ))}
            {cr.items.length > eligible.length && (
              <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2">
                <div className="text-lg font-bold text-rose-700">{cr.items.length - eligible.length}</div>
                <div className="text-[11px] text-rose-700">excluded (criteria failed)</div>
              </div>
            )}
          </div>
          <ul className="space-y-0.5 rounded border border-gray-200 bg-slate-50 p-2 font-mono text-[11px]">
            {eligible.map((i) => (
              <li key={i.cr_item}>{i.object_type} {i.object_key}: {i.field} {i.value_before ?? ""} → {i.value_after}</li>
            ))}
          </ul>

          <div className="rounded border border-amber-200 bg-amber-50 p-3">
            <div className="font-semibold text-amber-900">Segregation of duties</div>
            <div className="mt-0.5 text-amber-900">
              Requested by <b>{cr.requested_by}</b>. The approver must be someone else, holding
              the <span className="font-mono">SC_RECOVERY_APPROVER</span> role.
            </div>
            <label className="mt-2 block">
              Approver
              <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="e.g. Raj Patel (Operations Director)"
                className={`mt-1 block w-full rounded border px-2 py-1 ${sameAsRequester ? "border-rose-400" : "border-gray-300"}`} />
            </label>
            {sameAsRequester && <div className="mt-1 text-rose-700">The requester cannot approve their own change request.</div>}
          </div>

          <div className="space-y-1.5">
            {cr.acknowledgements.map((a) => (
              <label key={a.id} className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={acks.includes(a.id)}
                  onChange={(e) => setAcks(e.target.checked ? [...acks, a.id] : acks.filter((x) => x !== a.id))} />
                <span>{a.text}</span>
              </label>
            ))}
          </div>

          <label className="block">
            Type <span className="font-mono font-semibold text-rose-700">{cr.confirmationPhrase}</span> to confirm
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off"
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 font-mono" />
          </label>
          <label className="block">
            Comment (stored with the approval)
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1" />
          </label>
        </div>
        <div className="flex justify-between gap-2 border-t border-gray-200 px-5 py-3">
          <button disabled={busy || !approver.trim() || sameAsRequester}
            onClick={() => onDecide({ decision: "REJECT", approver: approver.trim(), acknowledgements: acks, confirmation: phrase, comment })}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Reject request
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={!ready || busy}
              onClick={() => onDecide({ decision: "APPROVE", approver: approver.trim(), acknowledgements: acks, confirmation: phrase, comment })}
              className="rounded bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-40">
              {busy ? "Recording approval…" : "Approve changes to S/4HANA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Posted({ cr }: { cr: ChangeRequest }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded border border-gray-200 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          OData calls received by S/4HANA ({cr.outbox.length})
        </div>
        <div className="mt-2 space-y-1.5">
          {cr.outbox.map((o) => (
            <div key={o.call_id} className="break-all rounded bg-slate-50 px-2 py-1.5 font-mono text-[10.5px] text-slate-700">
              <span className={o.method === "POST" ? "text-emerald-700" : "text-sky-700"}>{o.method}</span> {o.resource_path}
              <div className="text-slate-500">{JSON.stringify(o.payload)} → {o.http_status}
                {o.response?.PlannedOrder ? ` PlannedOrder ${o.response.PlannedOrder}` : ""}</div>
            </div>
          ))}
          {!cr.outbox.length && <div className="text-xs text-slate-400">No calls yet.</div>}
        </div>
      </div>
      <div className="rounded border border-gray-200 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          S/4 change documents (CDHDR / CDPOS)
        </div>
        <table className="mt-2 w-full text-[11px]">
          <thead className="text-left text-slate-500">
            <tr><th>Object</th><th>Field</th><th>Old</th><th>New</th><th>User</th><th>Via</th></tr>
          </thead>
          <tbody>
            {cr.changeDocuments.map((d) => (
              <tr key={d.changenr} className="border-t border-gray-100">
                <td className="py-1 font-mono">{d.objectclas} {d.objectid}</td>
                <td>{d.tabname}-{d.fname} <span className="text-slate-400">{d.chngind}</span></td>
                <td className="text-rose-700">{d.value_old ?? "-"}</td>
                <td className="text-emerald-700">{d.value_new ?? "-"}</td>
                <td>{d.username}</td>
                <td className="text-slate-500">{d.tcode}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cr.approvals.length > 0 && (
          <div className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-slate-600">
            {cr.approvals.map((a, k) => (
              <div key={k}>
                <b>{a.decision}</b> by {a.approver} · acknowledged {a.acknowledgements?.length ?? 0}/3 · “{a.confirmation}”
                {a.comment ? ` · ${a.comment}` : ""} <span className="text-slate-400">(Snowflake {a.snowflake_user} as {a.snowflake_role})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
