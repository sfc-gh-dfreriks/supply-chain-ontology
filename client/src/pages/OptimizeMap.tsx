import { useEffect, useMemo, useState } from "react";
import { WorldMap } from "../components/WorldMap";
import { ExplainStep, KpiCards, PaceControl, SubtitleBand } from "../components/StepCards";
import { dwellMs, usePace } from "../lib/pace";
import { useNetwork, useScenario, useScenarioMaps } from "../hooks/useScenario";
import { money } from "../lib/severity";
import { buildMitSteps } from "../lib/mitsteps";
import { AskCortex } from "../components/AskCortex";

/**
 * Optimization Map — the recovery played as a movie.
 *
 * The Ripple Map answers what breaks. This answers what we do about it, one
 * decision at a time: the lane that died, the lane that replaces it, and what the
 * plant picking up the work gives up to do it.
 *
 * The before-state is drawn faintly underneath and the after-state animates over
 * the top, rather than two half-size maps side by side. Austin to Penang needs the
 * width, and the comparison that actually matters is numeric — so the diff lives in
 * the change card and the before/after KPI cards, where it can be read precisely.
 */
export default function OptimizeMap() {
  const { net } = useNetwork();
  const { disruption, result, plan, running, error } = useScenario();
  const { affected, impaired } = useScenarioMaps(result);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(true);
  const [paceSec, setPaceSec] = usePace();
  const [selected, setSelected] = useState<string | null>(null);

  const steps = useMemo(() => buildMitSteps(result, plan), [result, plan]);
  const step = steps[idx];

  useEffect(() => { setIdx(0); setPlaying(false); }, [result, plan]);

  useEffect(() => {
    if (!playing || !steps.length) return;
    if (idx >= steps.length - 1) { setPlaying(false); return; }
    // Blocked beats and the summary carry the reasoning worth reading, so they hold
    // longer than a straightforward reroute. The base comes from the user's pace.
    const k = steps[idx]?.kind;
    const t = setTimeout(() => setIdx((i) => i + 1),
                         dwellMs(paceSec, k === "blocked" || k === "summary"));
    return () => clearTimeout(t);
  }, [playing, idx, steps, paceSec]);

  if (!net) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-slate-500">
      Loading the network…
    </div>;
  }

  if (!result || !plan || !steps.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-sm font-semibold text-slate-800">No scenario has been run yet</div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Open <b>Scenario Studio</b>, pick a disruption and run it. The recovery then plays
          here one decision at a time — which lane is replaced by which, what it protects,
          and what it costs the plant absorbing the work.
        </p>
        {running && <div className="mt-3 text-sm text-slate-500">Simulating…</div>}
        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
      </div>
    );
  }

  const atRisk = plan.totals.revenueAtRisk;

  // Full runtime at the chosen pace, so the choice can be made against the total.
  const runSeconds = Math.round(
    steps.reduce((t, s2) =>
      t + dwellMs(paceSec, s2.kind === "blocked" || s2.kind === "summary"), 0) / 1000);
  const protPct = atRisk > 0 ? Math.round((step.protectedCum / atRisk) * 100) : 0;

  const badge = step.kind === "baseline" ? "BEFORE"
              : step.kind === "summary" ? "RESULT"
              : step.kind === "blocked" ? `BLOCKED ${step.ordinal}`
              : `FIX ${step.ordinal}`;

  return (
    <div className="space-y-4">
      {disruption && (
        <div className="flex justify-end">
          <AskCortex topic="optimize" args={{ disruption }} label="Ask Cortex: is this the best recovery sequence?"
            suggestions={["What would you do first in the next 48 hours?", "Is any step capacity-constrained?", "What is the cost of doing nothing?"]} />
        </div>
      )}
      {/* ---- what scenario this is --------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">
          {disruption?.label ?? "Scenario"} — recovery
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {plan.reroutes.length} reroutes · {plan.unmitigable.length} blocked
        </span>
        <span className="ml-auto text-[11px] text-slate-500">
          {plan.totals.protectedPct}% of {money(atRisk)} protected
        </span>
      </div>

      {/* ---- the map ------------------------------------------------------- */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reroutes on the network
          </span>
          <span className="text-[10px] text-slate-400">
            dashed green = replacement lane · red = the lane it replaces
          </span>
          {zoom && step.focusNodes.length > 0 && (
            <span className="text-[10px] text-emerald-600">following {badge.toLowerCase()}</span>
          )}
        </div>
        <div className="relative">
          <WorldMap nodes={net.nodes} flows={net.flows}
            affected={affected} impaired={impaired}
            reroutes={step.reroutesUpto}
            highlightFlows={new Set(step.brokenFlowIds)}
            focusNodes={zoom ? step.focusNodes : []}
            selected={selected} onSelect={setSelected} height={460} />
          <SubtitleBand
            text={step.subtitle}
            badge={badge}
            tone={step.kind === "reroute" || step.kind === "summary" ? "green" : "dark"} />
        </div>
      </div>

      {/* ---- player chrome: transport + step rail, under the map ------- */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          playback
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setIdx(0); setPlaying(true); }} disabled={playing}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white
                       hover:bg-emerald-700 disabled:opacity-50">
            {playing ? "Playing…" : "Play the recovery"}
          </button>
          <button onClick={() => setPlaying(false)} disabled={!playing}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-slate-600
                       hover:bg-slate-50 disabled:opacity-40">
            Pause
          </button>
          <button onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }}
            disabled={idx === 0}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-slate-600
                       hover:bg-slate-50 disabled:opacity-40">
            ‹ Back
          </button>
          <button onClick={() => { setPlaying(false); setIdx((i) => Math.min(steps.length - 1, i + 1)); }}
            disabled={idx >= steps.length - 1}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-slate-600
                       hover:bg-slate-50 disabled:opacity-40">
            Next ›
          </button>
          <PaceControl seconds={paceSec} onChange={setPaceSec}
            heavyNote="blocked exposures and the result hold longer" />
          <label className="ml-1 flex items-center gap-1.5 text-[11px] text-slate-600">
            <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
            camera follows
          </label>
        </div>
      </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-3 py-2">
        {steps.map((s, i) => {
          const done = i < idx, active = i === idx;
          const tone = s.kind === "blocked"
            ? (active ? "bg-rose-600 text-white" : done ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400")
            : s.kind === "reroute"
            ? (active ? "bg-emerald-600 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")
            : (active ? "bg-slate-800 text-white" : done ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-400");
          return (
            <button key={s.id} onClick={() => { setPlaying(false); setIdx(i); }}
              title={s.title}
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition ${tone}`}>
              {s.kind === "baseline" ? "before"
                : s.kind === "summary" ? "result"
                : s.kind === "blocked" ? `blocked ${s.ordinal}`
                : `fix ${s.ordinal}`}
            </button>
          );
        })}
        <span className="ml-2 text-[11px] text-slate-500">
          step {idx + 1} of {steps.length}
          <span className="ml-2 text-slate-300">·</span>
          <span className="ml-2" title="Full play-through at the chosen pace">
            {runSeconds < 60 ? `${runSeconds}s` : `${Math.floor(runSeconds / 60)}m ${runSeconds % 60}s`} total
          </span>
        </span>
      </div>
      </div>

      {/* ---- what is happening now ----------------------------------------- */}
      <div className={`rounded-lg border p-4
        ${step.kind === "blocked" ? "border-rose-300 bg-rose-50"
          : step.kind === "reroute" ? "border-emerald-300 bg-emerald-50"
          : "border-slate-300 bg-slate-50"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wider text-white
            ${step.kind === "blocked" ? "bg-rose-600"
              : step.kind === "reroute" ? "bg-emerald-600" : "bg-slate-700"}`}>
            {badge}
          </span>
          <span className="text-base font-bold text-slate-800">{step.title}</span>
          <div className="ml-auto flex items-center gap-2">
            {step.kind === "reroute" && (
              <span className="text-lg font-bold text-emerald-700">
                +{money(plan.reroutes[step.ordinal! - 1].valueProtected)}
              </span>
            )}
            {step.kind === "blocked" && (
              <span className="text-lg font-bold text-rose-700">
                −{money(plan.unmitigable[step.ordinal! - 1].valueAtRisk)}
              </span>
            )}
            <ExplainStep why={step.why} detail={step.detail} />
          </div>
        </div>

        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-700">{step.what}</p>

        {/* the actual change, stated as a diff */}
        {step.change && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border
                          border-emerald-200 bg-white px-3 py-2 text-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              change
            </span>
            <span className="rounded bg-rose-50 px-2 py-0.5 font-medium text-rose-700 line-through
                             decoration-rose-400">
              {step.change.from}
            </span>
            <span className="font-bold text-slate-400">→</span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
              {step.change.to}
            </span>
          </div>
        )}

        <div className="mt-3">
          <KpiCards kpis={step.kpis} beatKey={step.id} />
        </div>

        {/* running recovery bar */}
        <div className="mt-3 border-t border-slate-200 pt-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-600">
              protected <b className="text-emerald-700">{money(step.protectedCum)}</b>
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">
              still exposed <b className="text-rose-700">{money(step.residual)}</b>
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">
              of <b className="text-slate-900">{money(atRisk)}</b> at risk
            </span>
            <span className="ml-auto font-semibold text-emerald-700">{protPct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-rose-200">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                 style={{ width: `${protPct}%` }} />
          </div>
        </div>
      </div>

      {/* ---- the plan as a table, for the people who want the list ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Reroutes ({plan.reroutes.length})
          </div>
          <div className="space-y-1.5">
            {plan.reroutes.map((r, i) => (
              <button key={r.flow_id} onClick={() => { setPlaying(false); setIdx(i + 1); }}
                className={`w-full rounded border px-2.5 py-2 text-left text-xs transition
                  ${step.id === `r${i}`
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-800">{r.customer}</span>
                  <span className="ml-auto font-bold text-emerald-700">
                    {money(r.valueProtected)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {r.material_category} · {r.fromPlant} → <b className="text-slate-700">{r.toPlant}</b>
                  {" · "}{r.headroomPctAfter}% headroom left
                </div>
              </button>
            ))}
            {!plan.reroutes.length && (
              <div className="text-[11px] text-slate-400">Nothing could be rerouted.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
            Cannot be rerouted ({plan.unmitigable.length})
          </div>
          <div className="space-y-1.5">
            {plan.unmitigable.map((u, i) => (
              <button key={u.flow_id}
                onClick={() => { setPlaying(false); setIdx(plan.reroutes.length + 1 + i); }}
                className={`w-full rounded border px-2.5 py-2 text-left text-xs transition
                  ${step.id === `x${i}`
                    ? "border-rose-400 bg-rose-50"
                    : "border-gray-200 hover:border-rose-300 hover:bg-rose-50/40"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-800">{u.customer}</span>
                  <span className="ml-auto font-bold text-rose-700">{money(u.valueAtRisk)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {u.material_category} · {u.reason}
                </div>
              </button>
            ))}
            {!plan.unmitigable.length && (
              <div className="text-[11px] text-emerald-600">
                Everything exposed could be rerouted.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- capacity consumed, the cost of the plan ------------------------ */}
      {plan.capacityAfter.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            What the plan consumed
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plan.capacityAfter.map((c) => {
              const tight = c.spareUnitsLeft <= 1;
              return (
                <div key={c.plant}
                  className={`rounded-lg border px-3 py-2 ${tight
                    ? "border-rose-300 bg-rose-50" : "border-gray-200 bg-slate-50"}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-800">{c.plantName}</span>
                    {tight && (
                      <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold
                                       tracking-wide text-white">
                        NEW WEAK POINT
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5 text-sm">
                    <span className="text-slate-400 line-through">{c.utilizationBefore}%</span>
                    <span className="text-slate-400">→</span>
                    <span className={`font-bold ${tight ? "text-rose-700" : "text-slate-800"}`}>
                      {c.utilizationAfter}%
                    </span>
                    <span className="text-[11px] text-slate-500">utilised</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    +{c.unitsAdded} units, +{c.hrsAdded} hrs ·{" "}
                    <b className={tight ? "text-rose-700" : "text-slate-700"}>
                      {c.spareUnitsLeft} spare left
                    </b>
                  </div>
                </div>
              );
            })}
          </div>
          {plan.caveats.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-gray-200 pt-2">
              {plan.caveats.map((c, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-500">
                  <span className="text-slate-300">•</span>{c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
