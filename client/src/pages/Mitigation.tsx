import { useMemo, useRef, useState } from "react";
import { Bullet, FlowComparison } from "../components/ScenarioCharts";
import { useNetwork, useScenario } from "../hooks/useScenario";
import { money, pct } from "../lib/severity";
import { STATIC, api } from "../lib/api";
import { AskCortex } from "../components/AskCortex";

/**
 * The mitigation plan: what the optimizer proposes, what it cannot save, and an
 * agent you can interrogate about both.
 *
 * The split is deliberate. Every number on this page comes from the deterministic
 * optimizer, so it is auditable. The agent reasons over those numbers and answers
 * follow-ups, but it is never the source of a figure.
 */
export default function Mitigation() {
  const { net } = useNetwork();
  const { disruption, result, plan } = useScenario();

  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [turns, setTurns] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const comparison = useMemo(() => {
    if (!result || !plan) return [];
    const protectedByFlow = new Map(plan.reroutes.map((r) => [r.flow_id, r.valueProtected]));
    return result.flows
      .filter((f) => f.target_type === "Customer")
      .map((f) => {
        // baseline is the value that would have flowed over the same window, so the
        // three bars are commensurate; comparing a monthly figure against an
        // event-duration figure would make every bar look fully recovered
        const window = f.daysAtRisk / 30;
        const baseline = f.monthly_value * window;
        const disrupted = baseline - f.valueAtRisk;
        const recovered = protectedByFlow.get(f.flow_id) ?? 0;
        return {
          key: f.flow_id,
          label: `${f.material_category} → ${f.target_name}`,
          sub: `${f.source_name} · ${f.daysAtRisk}d`,
          baseline, disrupted, mitigated: disrupted + recovered,
        };
      })
      .sort((a, b) => b.baseline - a.baseline);
  }, [result, plan]);

  const runBrief = async () => {
    if (!disruption) return;
    setBriefing(true); setAiError(null);
    try { setBrief((await api.scExplain(disruption)).text); }
    catch (e: any) { setAiError(String(e?.message || e)); }
    finally { setBriefing(false); }
  };

  const ask = async () => {
    const question = q.trim();
    if (!question || !disruption) return;
    setQ(""); setAsking(true); setAiError(null);
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: "user", text: question }]);
    try {
      const { text } = await api.scAsk(disruption, question, history);
      setTurns((t) => [...t, { role: "agent", text }]);
    } catch (e: any) {
      setAiError(String(e?.message || e));
    } finally {
      setAsking(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  };

  const SUGGESTED = [
    "Which single action protects the most revenue?",
    "What if the receiving plant were already at 95% utilisation?",
    "How much would a second Die Sorting source be worth?",
    "If the outage ran twice as long, what changes?",
    "What should I tell the affected customers this week?",
  ];

  if (!result || !plan || !disruption) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-sm font-semibold text-slate-800">No scenario has been run yet</div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Run a disruption in <b>Scenario Studio</b> first. This page then shows the reroutes
          that fit inside real capacity, what cannot be saved and why, and lets you interrogate
          the plan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {disruption && (
        <div className="flex justify-end">
          <AskCortex topic="mitigation" args={{ disruption }} label="Ask Cortex: should we approve this plan?"
            suggestions={["What should be escalated as unmitigable?", "Which reroute protects the most order value?", "What is the residual risk to OTIF?"]} />
        </div>
      )}
      {/* outcome */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["At risk", money(plan.totals.revenueAtRisk), "customer revenue"],
          ["Protected", money(plan.totals.valueProtected), pct(plan.totals.protectedPct, 1)],
          ["Still exposed", money(plan.totals.valueUnprotected),
           `${plan.unmitigable.length} item${plan.unmitigable.length === 1 ? "" : "s"}`],
          ["Reroutes", String(plan.reroutes.length),
           `${plan.totals.unitsRerouted} units/mo across ${plan.totals.plantsUsed} plant${plan.totals.plantsUsed === 1 ? "" : "s"}`],
        ].map(([l, big, sub]) => (
          <div key={l} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="text-xl font-bold text-slate-800">{big}</div>
            <div className="text-xs uppercase tracking-wide text-slate-400">{l}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
          </div>
        ))}
      </div>

      {/* reroutes */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Feasible reroutes
        </div>
        {plan.reroutes.length === 0 ? (
          <div className="mt-2 rounded border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-slate-500">
            Nothing can be rerouted for this scenario.
          </div>
        ) : (
          <table className="mt-2 w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr className="border-b border-gray-200">
                <th className="py-1.5">Category</th><th>Customer</th><th>From</th><th>To</th>
                <th className="text-right">Units/mo</th><th className="text-right">Hours</th>
                <th className="text-right">Headroom after</th>
                <th className="text-right">Ship delta</th>
                <th className="text-right">Protects</th>
              </tr>
            </thead>
            <tbody>
              {plan.reroutes.map((r) => (
                <tr key={r.flow_id} className="border-b border-gray-100">
                  <td className="py-1.5 text-slate-700">{r.material_category}</td>
                  <td className="text-slate-600">{r.customer}</td>
                  <td className="text-slate-500">{r.fromPlant}</td>
                  <td className="font-medium text-sky-700">{r.toPlant}</td>
                  <td className="text-right text-slate-700">{r.unitsMoved}</td>
                  <td className="text-right text-slate-500">
                    {r.hrsRequired} / {r.hrsAvailableBefore}
                  </td>
                  <td className={`text-right font-medium ${r.headroomPctAfter < 5 ? "text-rose-600" : "text-slate-700"}`}>
                    {pct(r.headroomPctAfter, 1)}
                  </td>
                  <td className="text-right text-slate-500">
                    {r.distanceDeltaKm != null
                      ? `${r.distanceDeltaKm >= 0 ? "+" : ""}${r.distanceDeltaKm.toLocaleString()} km`
                      : "—"}
                  </td>
                  <td className="text-right font-semibold text-emerald-700">{money(r.valueProtected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {plan.reroutes.some((r) => r.note) && (
          <div className="mt-2 text-[11px] text-amber-700">
            {plan.reroutes.filter((r) => r.note).map((r) => (
              <div key={r.flow_id}>{r.toPlant}: {r.note}</div>
            ))}
          </div>
        )}
      </div>

      {/* what cannot be saved — separated by reason, because the responses differ */}
      {plan.unmitigable.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-800">
            Cannot be rerouted — {money(plan.totals.valueUnprotected)} exposed
          </div>
          <div className="mt-2 space-y-2">
            {plan.unmitigable.map((u) => (
              <div key={u.flow_id} className="rounded border border-rose-200 bg-white px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-800">
                    {u.material_category} · {u.customer}
                  </span>
                  <span className="text-xs font-semibold text-rose-700">{money(u.valueAtRisk)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600">{u.reason}</div>
                {u.candidatesTried?.length ? (
                  <div className="mt-1 text-[11px] text-slate-500">
                    tried: {u.candidatesTried.map((c) =>
                      c.shortfallUnits > 0
                        ? `${c.plant} (${c.shortfallUnits} short)`
                        : c.plant).join(", ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* before / after */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Customer flows — before and after mitigation
          </div>
          <div className="mt-3">
            <FlowComparison rows={comparison} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Load on the receiving plants
          </div>
          <div className="mt-3">
            {plan.capacityAfter.length === 0 && (
              <div className="text-xs text-slate-500">No plant takes on extra work.</div>
            )}
            {plan.capacityAfter.map((c) => (
              <div key={c.plant} className="mb-3">
                <Bullet label={`${c.plantName}  (was ${pct(c.utilizationBefore, 1)})`}
                  value={c.utilizationAfter} max={110} band={[70, 90]} target={100} danger={95}
                  format={(n) => `${n.toFixed(1)}%`} />
                <div className="text-[11px] text-slate-500">
                  +{c.unitsAdded} units/mo, +{c.hrsAdded} hrs · {c.spareUnitsLeft} spare units left
                  {c.utilizationAfter >= 95 && (
                    <span className="ml-1 font-medium text-rose-600">
                      — no recovery room if anything else slips
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {net && (
            <div className="mt-1 border-t border-gray-100 pt-2 text-[11px] text-slate-400">
              {net.notes.hrs_per_unit}
            </div>
          )}
        </div>
      </div>

      {/* actions */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Actions, in priority order
        </div>
        <ol className="mt-2 space-y-1.5">
          {plan.actions.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-700">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center
                               rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                {i + 1}
              </span>
              {a}
            </li>
          ))}
        </ol>
      </div>

      {/* AI */}
      {STATIC ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">
            AI briefing is not available in the public build
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
            The briefing and the follow-up agent call Cortex, which needs Snowflake
            credentials. Everything above — the ripple, the reroutes, what cannot be
            saved — is computed by the optimizer and works here without them.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              AI briefing
            </div>
            <button onClick={runBrief} disabled={briefing}
              className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white
                         hover:bg-slate-900 disabled:opacity-50">
              {briefing ? "Thinking…" : brief ? "Regenerate" : "Brief me"}
            </button>
            <span className="text-[11px] text-slate-400">
              reasons over the figures above — it does not recompute them
            </span>
          </div>

          {aiError && (
            <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {aiError}
            </div>
          )}

          {brief && (
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
              {brief.split("\n").filter(Boolean).map((line, i) => {
                const head = /^\*\*(.+?)\*\*$/.exec(line.trim());
                if (head) {
                  return <div key={i} className="pt-1 text-xs font-semibold uppercase
                                                 tracking-wide text-sky-700">{head[1]}</div>;
                }
                return <p key={i}>{line.replace(/\*\*/g, "")}</p>;
              })}
            </div>
          )}

          {/* what-if */}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Interrogate this scenario
            </div>

            {turns.length > 0 && (
              <div className="mt-2 max-h-80 space-y-2 overflow-auto pr-1">
                {turns.map((t, i) => (
                  <div key={i} className={t.role === "user"
                    ? "ml-auto max-w-[75%] rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white"
                    : "max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-800"}>
                    {t.text.split("\n").filter(Boolean).map((l, j) => (
                      <p key={j} className={j ? "mt-1.5" : ""}>{l.replace(/\*\*/g, "")}</p>
                    ))}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}

            <div className="mt-2 flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                placeholder="What if Dresden were also at 95% utilisation?"
                className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-xs" />
              <button onClick={ask} disabled={asking || !q.trim()}
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white
                           hover:bg-sky-700 disabled:opacity-50">
                {asking ? "…" : "Ask"}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => setQ(s)}
                  className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px]
                             text-slate-600 hover:bg-slate-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-600">Limits of this plan.</span>{" "}
        {plan.caveats.join(" ")}
      </div>
    </div>
  );
}
