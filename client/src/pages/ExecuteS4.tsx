import { useState } from "react";
import { useScenario } from "../hooks/useScenario";
import { money } from "../lib/severity";
import { ExecuteInS4 } from "../components/ExecuteInS4";
import { WritebackProcess } from "../components/WritebackProcess";

/**
 * Execute in S/4HANA: the governed writeback of the current recovery plan.
 *
 * Split out of Mitigation & Recovery so that page stays about the plan. This one is
 * about acting on it: the Business Ontology Action contracts, the change request,
 * the second-person approval and what S/4HANA received. It reads the same shared
 * scenario, so it always executes the plan shown on Mitigation & Recovery.
 */
export default function ExecuteS4({ onNavigate }: { onNavigate: (p: "scenario" | "mitigation") => void }) {
  const { disruption, plan } = useScenario();
  const [status, setStatus] = useState<string | null>(null);

  if (!disruption || !plan) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-sm font-semibold text-slate-800">No recovery plan to execute yet</div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Run a disruption in <b>Scenario Studio</b>, review its plan on <b>Mitigation &amp; Recovery</b>,
          then come here to turn the reroutes into S/4HANA changes.
        </p>
        <button onClick={() => onNavigate("scenario")}
          className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900">
          Open Scenario Studio
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="text-xs text-slate-600">
          Executing the plan for <b className="text-slate-800">{disruption.label ?? disruption.targets.join(", ")}</b>
          {" · "}{plan.reroutes.length} reroute{plan.reroutes.length === 1 ? "" : "s"} protecting{" "}
          <b className="text-emerald-700">{money(plan.totals.valueProtected)}</b>
        </div>
        <button onClick={() => onNavigate("mitigation")}
          className="rounded border border-gray-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
          ← Back to the plan
        </button>
      </div>
      <WritebackProcess status={status} />
      {plan.reroutes.length > 0 ? (
        <ExecuteInS4 disruption={disruption} onStatus={setStatus} />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-slate-600">
          This plan has no feasible reroutes, so there is nothing to change in S/4HANA.
        </div>
      )}
    </div>
  );
}
