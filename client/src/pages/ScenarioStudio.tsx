import { useEffect, useMemo, useRef, useState } from "react";
import { ActionCenter, Bullet, type StageItem } from "../components/ScenarioCharts";
import {
  DEFAULT_DISRUPTION, KIND_HINT, KIND_LABEL, useNetwork, useScenario,
} from "../hooks/useScenario";
import { money, pct } from "../lib/severity";
import { STATIC } from "../lib/api";
import { AskCortex } from "../components/AskCortex";
import type { Disruption, DisruptionKind } from "../lib/api";

/**
 * Build a disruption, run it, and read the consequences bucketed by what each
 * one requires you to do about it.
 */
export default function ScenarioStudio() {
  const { net, presets, error: netError } = useNetwork();
  const { disruption, result, plan, running, error, run } = useScenario();

  const [draft, setDraft] = useState<Disruption>(disruption ?? DEFAULT_DISRUPTION);

  // A preset handed over from the Overview operations pulse ("Simulate today's risks").
  // Read once at mount: both effects below must agree on whether a hand-off is pending.
  const handoff = useRef<string | null>(sessionStorage.getItem("sc.preset"));
  useEffect(() => {
    const p = handoff.current && presets?.find((x) => x.id === handoff.current);
    if (p) { sessionStorage.removeItem("sc.preset"); const d = { ...p }; setDraft(d); run(d); }
  }, [presets]);

  // Run the default scenario once so the page never opens empty — an empty studio
  // makes the reader guess what a scenario even looks like here.
  useEffect(() => {
    // Skip when a preset hand-off is pending, or the default would race it and win.
    if (net && !result && !running && !error && !handoff.current) run(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  const targetOptions = useMemo(() => {
    if (!net) return [];
    if (draft.kind === "lane") {
      return net.flows.map((f) => ({
        id: f.flow_id,
        label: `${f.source_name} → ${f.target_name} · ${f.material_category}`,
      }));
    }
    const wanted =
      draft.kind === "supplier" ? "Supplier" :
      draft.kind === "demand" ? "Customer" : "Plant";
    return net.nodes
      .filter((n) => (draft.kind === "weather" ? true : n.node_type === wanted))
      .map((n) => ({ id: n.node_id, label: `${n.node_name} · ${n.city}, ${n.country}` }));
  }, [net, draft.kind]);

  // Changing kind invalidates the target list, so reset to the first valid option
  // rather than leaving an id that the server will reject.
  const setKind = (kind: DisruptionKind) => {
    const first = (() => {
      if (!net) return [];
      if (kind === "lane") return [net.flows[0]?.flow_id];
      if (kind === "supplier") return [net.nodes.find((n) => n.node_type === "Supplier")?.node_id];
      if (kind === "demand") return [net.nodes.find((n) => n.node_type === "Customer")?.node_id];
      return [net.nodes.find((n) => n.node_type === "Plant")?.node_id];
    })().filter(Boolean) as string[];
    setDraft((d) => ({
      ...d, kind, targets: first,
      severity: kind === "demand" ? 0.6 : kind === "capacity" ? 0.4 : 1,
      label: undefined,
    }));
  };

  const stages = useMemo<{ name: string; hint: string; items: StageItem[] }[]>(() => {
    if (!result || !plan) return [];

    const disrupted: StageItem[] = result.origin.map((o) => ({
      key: `o-${o.node_id}`, title: o.node_name,
      subtitle: `${Math.round(o.impairment * 100)}% down for ${o.daysExposed}d`,
      value: 0, tone: "bad",
    }));

    // A node whose buffer outlasts the event is materially different from one that
    // is exposed: it needs monitoring, not action, and mixing the two hides the
    // items that are genuinely urgent.
    const buffered: StageItem[] = [];
    const atRisk: StageItem[] = [];
    for (const n of result.impaired) {
      const item: StageItem = {
        key: `i-${n.node_id}`, title: n.node_name,
        subtitle: n.bufferDays != null
          ? `${n.bufferDays}d buffer, exposed ${n.daysExposed}d`
          : n.causedBy,
        value: 0,
        tone: n.daysExposed > 0 ? "warn" : "ok",
      };
      (n.daysExposed > 0 ? atRisk : buffered).push(item);
    }
    const mitigated: StageItem[] = plan.reroutes.map((r) => ({
      key: `r-${r.flow_id}`, title: `${r.material_category} → ${r.toPlant}`,
      subtitle: `${r.customer} · ${r.unitsMoved}u/mo · ${r.hrsRequired}h`,
      value: r.valueProtected, tone: "ok",
    }));

    const stuck: StageItem[] = plan.unmitigable.map((u) => ({
      key: `u-${u.flow_id}`, title: `${u.material_category} · ${u.customer}`,
      subtitle: u.reason, value: u.valueAtRisk, tone: "bad",
    }));

    return [
      { name: "Disrupted", hint: "hit directly by the event", items: disrupted },
      { name: "Exposed", hint: "buffer runs out before the event ends", items: atRisk },
      { name: "Buffered", hint: "inventory covers the whole event", items: buffered },
      { name: "Mitigated", hint: "a reroute protects this", items: mitigated },
      { name: "Unmitigable", hint: "needs a decision, not a reroute", items: stuck },
    ];
  }, [result, plan, net]);

  const isDemand = draft.kind === "demand";

  return (
    <div className="space-y-4">
      {netError && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Could not load the network: {netError}
          <div className="mt-1 text-xs">Run <code>npm run export-network</code> to rebuild
            <code className="ml-1">data/sc_network.json</code>.</div>
        </div>
      )}

      {STATIC && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs
                        leading-relaxed text-slate-700">
          <b>Public build.</b> The six preset scenarios below are pre-computed and fully
          explorable, including the ripple animation and the mitigation plan. Building a
          custom disruption with the sliders needs the live app — the simulation runs
          server-side.
        </div>
      )}

      {/* presets */}
      {presets && presets.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Start from a scenario
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {presets.map((p) => {
              const active = disruption?.label === p.label;
              return (
                <button key={p.id}
                  onClick={() => { const d = { ...p }; setDraft(d); run(d); }}
                  className={`rounded-lg border p-2.5 text-left transition
                    ${active ? "border-sky-400 bg-sky-50" : "border-gray-200 hover:bg-slate-50"}`}>
                  <div className="text-xs font-semibold text-slate-800">
                    {p.source === "sc360" && <span className="mr-1.5 rounded bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Live · SC360</span>}
                    {p.label}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-slate-500">{p.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* builder */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-xs text-slate-500">
            Disruption type
            <select value={draft.kind}
              onChange={(e) => setKind(e.target.value as DisruptionKind)}
              className="mt-1 w-52 rounded border border-gray-300 px-2 py-1 text-sm">
              {(net?.kinds ?? []).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs text-slate-500">
            {draft.kind === "lane" ? "Lane" : draft.kind === "demand" ? "Customer" : "Site"}
            <select value={draft.targets[0] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, targets: [e.target.value] }))}
              className="mt-1 w-80 rounded border border-gray-300 px-2 py-1 text-sm">
              {targetOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs text-slate-500">
            {isDemand
              ? `Uplift +${Math.round(draft.severity * 100)}%`
              : `Severity ${Math.round(draft.severity * 100)}%`}
            <input type="range" min={isDemand ? 10 : 10} max={isDemand ? 200 : 100} step={5}
              value={Math.round(draft.severity * 100)}
              onChange={(e) => setDraft((d) => ({ ...d, severity: Number(e.target.value) / 100 }))}
              className="mt-2 w-36" />
          </label>

          <label className="flex flex-col text-xs text-slate-500">
            Duration {draft.durationDays} days
            <input type="range" min={5} max={180} step={5} value={draft.durationDays}
              onChange={(e) => setDraft((d) => ({ ...d, durationDays: Number(e.target.value) }))}
              className="mt-2 w-40" />
          </label>

          <button onClick={() => run(draft)} disabled={running || !draft.targets.length}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white
                       hover:bg-sky-700 disabled:opacity-50">
            {running ? "Simulating…" : "Run scenario"}
          </button>
        </div>

        <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {KIND_HINT[draft.kind]}
        </div>

        {/* Duration is the control that changes the answer most, because inventory
            absorbs short events entirely. Saying so beats leaving it to be discovered. */}
        {net && draft.kind !== "demand" && (
          <div className="mt-2 rounded bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
            Thinnest buffer in the network is{" "}
            <b>{Math.min(...net.inventory.map((i) => i.min_days_of_inventory))} days</b>{" "}
            ({net.inventory.reduce((a, b) =>
                a.min_days_of_inventory <= b.min_days_of_inventory ? a : b).plant_name}).
            Events shorter than a downstream site's buffer never reach its customers.
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </div>
        )}
      </div>

      {/* headline numbers */}
      {result && plan && disruption && (
        <div className="flex justify-end">
          <AskCortex topic="scenario" args={{ disruption }} label="Ask Cortex: what does this cost us?"
            suggestions={["Which customers and orders are most exposed?", "What is the cheapest mitigation per dollar protected?", "How does duration change the cost?"]} />
        </div>
      )}
      {result && plan && (
        <>
          <div className="grid grid-cols-6 gap-3">
            {[
              ["Value at risk", money(result.totals.valueAtRisk),
               `${pct(result.totals.pctOfNetwork, 1)} of network`],
              ["Customer revenue", money(result.totals.revenueAtRisk),
               `${result.totals.customersAffected} customers`],
              ["Cost of disruption", money(result.totals.costOfDisruption ?? 0),
               `${money(result.totals.lostMargin ?? 0)} margin · ${money(result.totals.latePenalty ?? 0)} penalties`],
              ["Ripple depth", `${result.totals.maxHop} hop${result.totals.maxHop === 1 ? "" : "s"}`,
               `${result.totals.plantsImpaired} plants impaired`],
              ["Protected", money(plan.totals.valueProtected),
               `${pct(plan.totals.protectedPct, 1)} of exposure`],
              ["Still exposed", money(plan.totals.valueUnprotected),
               `${plan.unmitigable.length} item${plan.unmitigable.length === 1 ? "" : "s"}`],
            ].map(([label, big, sub]) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="text-xl font-bold text-slate-800">{big}</div>
                <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              What this means, by what it needs from you
            </div>
            <ActionCenter stages={stages} />
          </div>

          {/* plant state, as bullet charts rather than gauges */}
          {net && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Capacity utilisation after mitigation
                </div>
                <div className="mt-3">
                  {net.capacity.map((c) => {
                    const after = plan.capacityAfter.find((x) => x.plant === c.plant);
                    const val = after?.utilizationAfter ?? c.utilization_pct;
                    return (
                      <Bullet key={c.plant}
                        label={`${c.plant_name}${after ? `  (+${after.unitsAdded}u)` : ""}`}
                        value={val} max={110} band={[70, 90]} target={100} danger={95}
                        format={(n) => `${n.toFixed(1)}%`} />
                    );
                  })}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  band = 70–90% normal operating range · marker = full capacity
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Inventory buffer against this event
                </div>
                <div className="mt-3">
                  {net.inventory.map((i) => (
                    <Bullet key={i.plant}
                      label={i.plant_name ?? i.plant}
                      value={i.min_days_of_inventory}
                      max={Math.max(60, draft.durationDays)}
                      target={draft.durationDays}
                      format={(n) => `${Math.round(n)}d`} />
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  marker = event duration ({draft.durationDays}d). Bars short of the marker
                  run out before it ends.
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4 text-[11px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-600">How this is calculated.</span>{" "}
            {result.assumptions.join(" ")}
          </div>
        </>
      )}
    </div>
  );
}
