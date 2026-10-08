import { useEffect, useMemo, useState } from "react";
import { RippleGraph } from "../components/RippleGraph";
import { WorldMap } from "../components/WorldMap";
import { useNetwork, useScenario, useScenarioMaps } from "../hooks/useScenario";
import { hopColor, money, severityColor } from "../lib/severity";
import { buildSubSteps, groupByHop, revealedFlows, revealedHop } from "../lib/substeps";
import { ExplainStep, KpiCards, PaceControl, SubtitleBand } from "../components/StepCards";
import { dwellMs, usePace } from "../lib/pace";
import { AskCortex } from "../components/AskCortex";

/**
 * The ripple, geographically and topologically, stepped one lane at a time.
 *
 * Selection is shared: clicking a node in either view highlights it in the other.
 * That is the reason for showing both — the reader can ask "where is this" and
 * "how far from the event is this" about the same node without losing it.
 *
 * The player walks lettered sub-steps rather than whole hops. Revealing a hop at
 * once lights three arcs simultaneously and hides which one causes the next hop;
 * one lane per beat, with the camera framing that lane, makes the chain legible.
 */
export default function RippleMap() {
  const { net, spof } = useNetwork();
  const { disruption, result, plan, running, error } = useScenario();
  const { affected, impaired } = useScenarioMaps(result);

  const [selected, setSelected] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showReroutes, setShowReroutes] = useState(false);
  const [zoom, setZoom] = useState(true);
  const [paceSec, setPaceSec] = usePace();

  const steps = useMemo(() => buildSubSteps(result), [result]);
  const hopGroups = useMemo(() => groupByHop(steps), [steps]);
  const step = steps[idx];

  // Reset to the origin whenever a different scenario arrives.
  useEffect(() => { setIdx(0); setPlaying(false); }, [result]);

  useEffect(() => {
    if (!playing || !steps.length) return;
    if (idx >= steps.length - 1) { setPlaying(false); return; }
    // Longer on beats that impair a downstream site: those carry the explanation
    // that makes the next hop make sense. The base comes from the user's pace.
    const t = setTimeout(() => setIdx((i) => i + 1),
                         dwellMs(paceSec, Boolean(steps[idx]?.impairs)));
    return () => clearTimeout(t);
  }, [playing, idx, steps, paceSec]);

  const shownFlows = useMemo(() => revealedFlows(steps, idx), [steps, idx]);
  const shownHop = useMemo(() => revealedHop(steps, idx), [steps, idx]);
  const focus = zoom ? step?.focusNodes ?? [] : [];

  const selectedDetail = useMemo(() => {
    if (!selected || !net) return null;
    const node = net.nodes.find((n) => n.node_id === selected);
    if (!node) return null;
    return {
      node,
      imp: impaired.get(selected),
      inbound: net.flows.filter((f) => f.target_id === selected),
      outbound: net.flows.filter((f) => f.source_id === selected),
      cap: net.capacity.find((c) => c.plant === node.plant),
      inv: net.inventory.find((i) => i.plant === node.plant),
    };
  }, [selected, net, impaired]);

  if (!net) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-slate-500">
      Loading the network…
    </div>;
  }

  if (!result || !steps.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-sm font-semibold text-slate-800">No scenario has been run yet</div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Open <b>Scenario Studio</b>, pick a disruption and run it. The ripple then plays
          here one lane at a time, on the map and the network graph together, with the camera
          following each step.
        </p>
        {running && <div className="mt-3 text-sm text-slate-500">Simulating…</div>}
        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
      </div>
    );
  }

  const pctThrough = Math.round(((idx + 1) / steps.length) * 100);

  // How long a full play-through takes at the chosen pace, so the pace choice can
  // be made against the actual runtime rather than by trial and error.
  const runSeconds = Math.round(
    steps.reduce((t, s2) => t + dwellMs(paceSec, Boolean(s2.impairs)), 0) / 1000);

  return (
    <div className="space-y-4">
      {disruption && (
        <div className="flex justify-end">
          <AskCortex topic="ripple" args={{ disruption }} label="Ask Cortex: explain this ripple"
            suggestions={["Which customers feel it first, and when?", "Which orders at impaired plants are at risk?", "Why does the impact reach that far?"]} />
        </div>
      )}
      {/* ---- what scenario this is --------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">
          {disruption?.label ?? "Scenario"}
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {disruption?.durationDays}d · {Math.round((disruption?.severity ?? 0) * 100)}%
        </span>
        <span className="ml-auto text-[11px] text-slate-500">
          {money(result.totals.valueAtRisk)} at risk · {result.totals.pctOfNetwork}% of network
          {result.totals.costOfDisruption ? <> · <b className="text-red-600">{money(result.totals.costOfDisruption)} cost of disruption</b></> : null}
        </span>
      </div>

      {/* ---- the two synced views ---------------------------------------- */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Geography — where it happens
            </span>
            {zoom && focus.length > 0 && (
              <span className="text-[10px] text-sky-600">following step {step.id}</span>
            )}
          </div>
          <div className="relative">
            <WorldMap nodes={net.nodes} flows={net.flows}
              affected={affected} impaired={impaired}
              reroutes={showReroutes ? plan?.reroutes : []}
              revealHop={shownHop}
              highlightFlows={step.kind === "summary" ? undefined : new Set(step.flowIds)}
              focusNodes={focus}
              selected={selected} onSelect={setSelected} height={400} />
            <SubtitleBand
              text={step.subtitle}
              badge={step.id === "0" ? "START"
                   : step.id === "sum" ? "SUMMARY"
                   : `STEP ${step.id.toUpperCase()}`} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Topology — how far from the event
          </div>
          <RippleGraph nodes={net.nodes} flows={net.flows}
            affected={affected} impaired={impaired}
            reroutes={showReroutes ? plan?.reroutes : []}
            revealHop={shownHop} spof={spof}
            highlightFlows={step.kind === "summary" ? undefined : new Set(step.flowIds)}
            selected={selected} onSelect={setSelected} height={400} />
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
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white
                       hover:bg-sky-700 disabled:opacity-50">
            {playing ? "Playing…" : "Play from the start"}
          </button>
          <button onClick={() => setPlaying(false)} disabled={!playing}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-slate-600
                       hover:bg-slate-50 disabled:opacity-40">
            Pause
          </button>
          <button onClick={() => { setPlaying(false); setIdx(Math.max(0, idx - 1)); }}
            disabled={idx === 0}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-slate-600
                       hover:bg-slate-50 disabled:opacity-40">
            ‹ Prev
          </button>
          <button onClick={() => { setPlaying(false); setIdx(Math.min(steps.length - 1, idx + 1)); }}
            disabled={idx === steps.length - 1}
            className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-slate-600
                       hover:bg-slate-50 disabled:opacity-40">
            Next ›
          </button>
          <PaceControl seconds={paceSec} onChange={setPaceSec}
            heavyNote="hops that impair a downstream plant hold longer" />
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
            follow with zoom
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showReroutes}
                   onChange={(e) => setShowReroutes(e.target.checked)} />
            reroutes
          </label>
        </div>
      </div>
        <div className="border-t border-gray-200 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {hopGroups.map(({ hop, steps: ss }) => (
            <div key={hop} className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <span className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: hopColor(hop) }} />
                {hop === 0 ? "Origin" : `Hop ${hop}`}
              </span>
              {ss.map((s) => {
                const at = steps.indexOf(s);
                const done = at < idx;
                const now = at === idx;
                return (
                  <button key={s.id}
                    onClick={() => { setPlaying(false); setIdx(at); }}
                    title={s.title}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition
                      ${now ? "bg-slate-800 text-white ring-2 ring-slate-300"
                        : done ? "bg-sky-100 text-sky-800"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {s.id === "0" ? "start" : s.id}
                  </button>
                );
              })}
            </div>
          ))}
          <button onClick={() => { setPlaying(false); setIdx(steps.length - 1); }}
            className={`rounded px-2 py-1 text-[11px] font-medium
              ${idx === steps.length - 1 ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>
            all
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            step {idx + 1} of {steps.length}
            <span className="ml-2 text-slate-300">·</span>
            <span className="ml-2" title="Full play-through at the chosen pace">
              {runSeconds < 60 ? `${runSeconds}s` : `${Math.floor(runSeconds / 60)}m ${runSeconds % 60}s`} total
            </span>
          </span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-sky-500 transition-all duration-500"
               style={{ width: `${pctThrough}%` }} />
        </div>
      </div>
      </div>

      {/* ---- WHAT IS HAPPENING RIGHT NOW --------------------------------- */}
      <div className="rounded-lg border-2 border-sky-300 bg-sky-50 p-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">
            {step.id === "0" ? "START" : step.id === "sum" ? "SUMMARY" : `STEP ${step.id.toUpperCase()}`}
          </span>
          <span className="text-base font-bold text-slate-800">{step.title}</span>
          {step.hop > 0 && step.kind !== "summary" && (
            <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px]
                             font-medium text-slate-600">
              <span className="inline-block h-2 w-2 rounded-full"
                    style={{ background: hopColor(step.hop) }} />
              hop {step.hop}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium
            ${step.kind === "interplant" ? "bg-amber-100 text-amber-800"
              : step.kind === "customer" ? "bg-rose-100 text-rose-800"
              : "bg-slate-100 text-slate-600"}`}>
            {step.kind === "interplant" ? "inter-plant — this causes the next hop"
              : step.kind === "customer" ? "direct customer loss"
              : step.kind === "origin" ? "the event itself" : "everything revealed"}
          </span>
          {step.valueAtRisk > 0 && (
            <span className="ml-auto text-lg font-bold text-rose-700">
              {money(step.valueAtRisk)}
            </span>
          )}
          <div className={step.valueAtRisk > 0 ? "" : "ml-auto"}>
            <ExplainStep why={step.why} detail={step.detail} />
          </div>
        </div>

        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-700">{step.what}</p>

        {step.consequence && (
          <div className="mt-2 flex gap-2 rounded border border-amber-200 bg-white px-3 py-2">
            <span className="text-sm font-bold text-amber-600">→</span>
            <p className="max-w-4xl text-sm leading-relaxed text-slate-700">{step.consequence}</p>
          </div>
        )}

        {/* Popout cards: what this beat changed, re-animated on every step. */}
        <div className="mt-3">
          <KpiCards kpis={step.kpis} beatKey={step.id} />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-sky-200 pt-2 text-[11px]">
          <span className="text-slate-600">
            revealed so far <b className="text-slate-900">{money(step.cumulative)}</b>
          </span>
          <span className="text-slate-600">
            of <b className="text-slate-900">{money(result.totals.valueAtRisk)}</b> total
          </span>
          <span className="text-slate-600">
            flows shown <b className="text-slate-900">{shownFlows.size}</b> of {result.flows.length}
          </span>
          {step.impairs && (
            <span className="text-amber-800">
              {step.impairs.node_name} now <b>{Math.round(step.impairs.impairment * 100)}%</b> impaired
            </span>
          )}
        </div>
      </div>

      {/* ---- the beat list, so the whole chain is readable at once -------- */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          The chain, step by step
        </div>
        <div className="mt-2 space-y-1">
          {steps.filter((s) => s.kind !== "summary").map((s) => {
            const at = steps.indexOf(s);
            const now = at === idx;
            const done = at < idx;
            return (
              <button key={s.id} onClick={() => { setPlaying(false); setIdx(at); }}
                className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition
                  ${now ? "bg-sky-50 ring-1 ring-sky-300" : done ? "" : "opacity-45"}
                  hover:bg-slate-50`}>
                <span className="w-9 shrink-0 text-[11px] font-bold text-slate-500">
                  {s.id === "0" ? "start" : s.id}
                </span>
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: hopColor(s.hop) }} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{s.title}</span>
                {s.kind === "interplant" && (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">
                    bridges to hop {s.hop + 1}
                  </span>
                )}
                <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-800">
                  {s.valueAtRisk > 0 ? money(s.valueAtRisk) : "—"}
                </span>
                <span className="w-20 shrink-0 text-right text-[11px] text-slate-400">
                  {money(s.cumulative)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-end gap-4 border-t border-gray-100 pt-2 text-[11px] text-slate-400">
          <span>this step</span><span className="w-20 text-right">running total</span>
        </div>
      </div>

      {/* ---- selection detail -------------------------------------------- */}
      {selectedDetail && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {selectedDetail.node.node_name}
            </span>
            <span className="text-xs text-slate-500">
              {selectedDetail.node.node_type} · {selectedDetail.node.city}, {selectedDetail.node.country}
            </span>
            {selectedDetail.imp && (
              <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                {Math.round(selectedDetail.imp.impairment * 100)}% impaired · hop {selectedDetail.imp.hop}
              </span>
            )}
            <button onClick={() => setSelected(null)}
                    className="ml-auto text-xs text-slate-500 hover:text-slate-800">clear</button>
          </div>
          {selectedDetail.imp?.causedBy && (
            <div className="mt-1 text-xs text-slate-600">
              Reached via {selectedDetail.imp.causedBy}
              {selectedDetail.imp.bufferDays != null &&
                ` · ${selectedDetail.imp.bufferDays}d buffer absorbed the first part, exposed ${selectedDetail.imp.daysExposed}d`}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
            {(["inbound", "outbound"] as const).map((dir) => (
              <div key={dir}>
                <div className="font-semibold capitalize text-slate-600">
                  {dir} ({selectedDetail[dir].length})
                </div>
                {selectedDetail[dir].map((f) => {
                  const a = affected.get(f.flow_id);
                  return (
                    <div key={f.flow_id} className="mt-1 flex justify-between gap-2">
                      <span className="truncate text-slate-600">
                        {dir === "inbound" ? f.source_name : f.target_name}
                      </span>
                      <span className={a ? "font-medium text-rose-700" : "text-slate-400"}>
                        {a ? money(a.valueAtRisk) : money(f.monthly_value)}
                      </span>
                    </div>
                  );
                })}
                {!selectedDetail[dir].length && <div className="mt-1 text-slate-400">none</div>}
              </div>
            ))}
            <div>
              <div className="font-semibold text-slate-600">State</div>
              {selectedDetail.cap ? (
                <>
                  <div className="mt-1 flex justify-between"><span className="text-slate-500">utilisation</span>
                    <span className="text-slate-700">{selectedDetail.cap.utilization_pct}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">free hours</span>
                    <span className="text-slate-700">{selectedDetail.cap.free_hrs}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">spare units</span>
                    <span className="text-slate-700">{selectedDetail.cap.spare_units}</span></div>
                </>
              ) : <div className="mt-1 text-slate-400">not a plant — holds no capacity or stock</div>}
              {selectedDetail.inv && (
                <div className="flex justify-between"><span className="text-slate-500">min buffer</span>
                  <span className="text-slate-700">{selectedDetail.inv.min_days_of_inventory}d</span></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
