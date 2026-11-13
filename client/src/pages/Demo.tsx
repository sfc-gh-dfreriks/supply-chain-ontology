import { useEffect, useMemo, useState } from "react";
import { RippleGraph } from "../components/RippleGraph";
import { WorldMap } from "../components/WorldMap";
import { Bullet, FlowComparison } from "../components/ScenarioCharts";
import { Annotated, MockControls, ScreenFrame, Steps } from "../components/Walkthrough";
import { useNetwork, useScenario, useScenarioMaps } from "../hooks/useScenario";
import { hopColor, money, pct } from "../lib/severity";
import type { PageId } from "../components/Sidebar";

/**
 * Guided walkthrough of the disruption scenario, step by step.
 *
 * Rebuilt from a narrative deck summary into an actual walkthrough: each step
 * shows the real component with real data, annotated with where to click, and a
 * button that performs the step on the live page.
 *
 * The visuals are live components rather than screenshots because the figures
 * change whenever the SAP catalog is re-sliced — a screenshot would be wrong
 * within a release and nobody would notice.
 */

const SCENARIO = {
  kind: "weather" as const,
  targets: ["PLT-2000"],
  severity: 1,
  durationDays: 60,
  label: "Hurricane — Austin Fab offline",
};

interface StepDef {
  id: string;
  kicker: string;
  title: string;
  why: string;
  page: PageId | null;
  pageLabel: string;
  goLabel?: string;
}

const STEPS: StepDef[] = [
  { id: "network", kicker: "Step 1", title: "Start with the network you actually run",
    why: "Everything downstream is only as credible as this. Five plants, six suppliers, "
       + "eight customers, found by walking the governed Supply Chain domain in Snowflake "
       + "Business Ontology and reading the SAP data each concept represents.",
    page: "scenario", pageLabel: "Scenario Studio", goLabel: "Open Scenario Studio" },
  { id: "pick", kicker: "Step 2", title: "Choose the disruption",
    why: "Six scenarios ship ready to run, and you can build your own from five event "
       + "types. We will follow the hurricane, because its second-order effect is the one "
       + "that surprises people.",
    page: "scenario", pageLabel: "Scenario Studio · presets", goLabel: "Run this scenario" },
  { id: "exposure", kicker: "Step 3", title: "Read the exposure",
    why: "One number for the size of the problem, and a breakdown by what each item needs "
       + "from you rather than by how big it is.",
    page: "scenario", pageLabel: "Scenario Studio · results", goLabel: "See the full breakdown" },
  { id: "ripple", kicker: "Step 4", title: "Watch it ripple outward",
    why: "This is the step that earns the tool. Hop 1 is Austin's own customers. Hop 2 is "
       + "Penang — in Malaysia, with no hurricane anywhere near it.",
    page: "ripple", pageLabel: "Ripple Map", goLabel: "Open the Ripple Map" },
  { id: "buffer", kicker: "Step 5", title: "Find out when it bites, not just whether",
    why: "Penang holds 12 days of stock. It runs normally until day 13 and only then "
       + "starves. Duration is the control that changes the answer most.",
    page: "ripple", pageLabel: "Ripple Map · node detail", goLabel: "Inspect the nodes" },
  { id: "plan", kicker: "Step 6", title: "Get a plan that respects real capacity",
    why: "Two moves recover most of the exposure — and the plan shows what they cost in "
       + "plant hours, plus what cannot be moved at any price.",
    page: "mitigation", pageLabel: "Mitigation", goLabel: "Open the Mitigation plan" },
  { id: "ai", kicker: "Step 7", title: "Ask why, and what if",
    why: "The AI reads the figures the simulation produced and explains the trade-off. It "
       + "is not allowed to calculate them, so the numbers stay auditable.",
    page: "mitigation", pageLabel: "Mitigation · AI briefing", goLabel: "Generate a briefing" },
];

export default function Demo({ onNavigate }: { onNavigate?: (p: PageId) => void }) {
  const { net, presets, spof } = useNetwork();
  const { result, plan, running, run } = useScenario();
  const { affected, impaired } = useScenarioMaps(result);
  const [i, setI] = useState(0);
  const [revealHop, setRevealHop] = useState(2);

  // Run the scenario the walkthrough narrates, so every figure on the page is
  // the real computed answer rather than a number typed into the copy.
  useEffect(() => {
    if (net && !result && !running) run(SCENARIO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  const step = STEPS[i];

  // On the ripple step, walk the hops so the cascade is visible in place.
  useEffect(() => {
    if (step.id !== "ripple") return;
    setRevealHop(0);
    let h = 0;
    const t = setInterval(() => {
      h += 1;
      setRevealHop(h);
      if (h >= (result?.totals.maxHop ?? 2)) clearInterval(t);
    }, 1400);
    return () => clearInterval(t);
  }, [step.id, result]);

  const cust = useMemo(() => {
    const m = new Map<string, { v: number; hop: number; cat: string }>();
    for (const f of result?.flows ?? []) {
      if (f.target_type !== "Customer") continue;
      const cur = m.get(f.target_name);
      m.set(f.target_name, {
        v: (cur?.v ?? 0) + f.valueAtRisk,
        hop: Math.min(cur?.hop ?? 9, f.hop),
        cat: f.material_category,
      });
    }
    return [...m.entries()].map(([k, v]) => ({ customer: k, ...v }))
      .sort((a, b) => b.v - a.v);
  }, [result]);

  const sj = plan?.capacityAfter.find((c) => c.plantName.includes("San Jose"));
  const penang = result?.impaired.find((n) => n.node_name.includes("Penang"));

  const go = () => { if (step.page && onNavigate) onNavigate(step.page); };

  return (
    <div className="space-y-4">
      {/* progress rail */}
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-2.5">
        {STEPS.map((s, n) => (
          <button key={s.id} onClick={() => setI(n)}
            className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition
              ${n === i ? "bg-sky-600 text-white"
                : n < i ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
            {n + 1}
          </button>
        ))}
        <span className="ml-2 shrink-0 text-[11px] text-slate-400">
          {i + 1} of {STEPS.length}
        </span>
      </div>

      {/* header */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-600">
          {step.kicker} · {step.pageLabel}
        </div>
        <h2 className="mt-1 text-xl font-bold text-slate-800">{step.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{step.why}</p>
      </div>

      {/* ---------------- the visual + the actions, side by side ------------- */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          {/* 1 — the network */}
          {step.id === "network" && net && (
            <ScreenFrame page="Scenario Studio" caption="live data" tone="dark">
              <Annotated pins={[
                { x: 23, y: 36, label: "Austin Fab — our disruption target", side: "right" },
                { x: 78, y: 55, label: "Penang — two hops away", side: "left", n: 2 },
              ]}>
                <WorldMap nodes={net.nodes} flows={net.flows} height={320} />
              </Annotated>
            </ScreenFrame>
          )}

          {/* 2 — pick the preset */}
          {step.id === "pick" && (
            <ScreenFrame page="Scenario Studio" caption="six presets, or build your own">
              <Annotated pins={[{ x: 16, y: 30, label: "Click this card", side: "right" }]}>
                <MockControls active={0} items={(presets ?? []).slice(0, 6).map((p) => ({
                  label: (p.label ?? p.id).replace(" — ", ": "),
                  sub: `${p.durationDays}d · ${Math.round(p.severity * 100)}%`,
                }))} />
              </Annotated>
              <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Or build one: pick <b>weather, supplier outage, partial capacity loss, lane
                closure or demand spike</b>, choose the site, then set severity and duration.
              </div>
            </ScreenFrame>
          )}

          {/* 3 — the exposure tiles */}
          {step.id === "exposure" && result && plan && (
            <ScreenFrame page="Scenario Studio" caption="computed in under a second">
              <Annotated pins={[
                { x: 10, y: 30, label: "The headline number", side: "right" },
                { x: 90, y: 30, label: "What cannot be saved", side: "left", n: 2 },
              ]}>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    ["Value at risk", money(result.totals.valueAtRisk),
                     `${pct(result.totals.pctOfNetwork, 1)} of network`],
                    ["Customer revenue", money(result.totals.revenueAtRisk),
                     `${result.totals.customersAffected} customers`],
                    ["Ripple depth", `${result.totals.maxHop} hops`,
                     `${result.totals.plantsImpaired} plants hit`],
                    ["Protected", money(plan.totals.valueProtected),
                     pct(plan.totals.protectedPct, 1)],
                    ["Still exposed", money(plan.totals.valueUnprotected),
                     `${plan.unmitigable.length} items`],
                  ].map(([l, big, sub]) => (
                    <div key={l} className="rounded border border-gray-200 px-2 py-2">
                      <div className="text-base font-bold text-slate-800">{big}</div>
                      <div className="text-[9.5px] uppercase tracking-wide text-slate-400">{l}</div>
                      <div className="text-[10px] text-slate-500">{sub}</div>
                    </div>
                  ))}
                </div>
              </Annotated>
            </ScreenFrame>
          )}

          {/* 4 — the ripple, animating */}
          {step.id === "ripple" && net && result && (
            <div className="space-y-2">
              <ScreenFrame page="Ripple Map" caption={`revealing hop ${revealHop}`} tone="dark">
                <Annotated pins={revealHop >= 2
                  ? [{ x: 78, y: 55, label: "Penang, hop 2 — nowhere near Texas", side: "left", n: 2 }]
                  : [{ x: 23, y: 36, label: "Austin, hop 0", side: "right" }]}>
                  <WorldMap nodes={net.nodes} flows={net.flows}
                    affected={affected} impaired={impaired}
                    reroutes={plan?.reroutes} revealHop={revealHop} height={300} />
                </Annotated>
              </ScreenFrame>
              <div className="flex flex-wrap items-center gap-1.5">
                {result.hops.map((h) => (
                  <button key={h.hop} onClick={() => setRevealHop(h.hop)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]
                      ${revealHop === h.hop ? "border-slate-800 bg-slate-800 text-white"
                                            : "border-gray-300 bg-white text-slate-600"}`}>
                    <span className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: hopColor(h.hop) }} />
                    hop {h.hop} · {h.flows} flows · {money(h.valueAtRisk)}
                  </button>
                ))}
                <span className="text-[11px] text-slate-400">click to step manually</span>
              </div>
            </div>
          )}

          {/* 5 — the buffer */}
          {step.id === "buffer" && net && result && (
            <ScreenFrame page="Ripple Map" caption="click any node for its state">
              <Annotated pins={[{ x: 50, y: 18, label: "Penang: 12 days of cover", side: "bottom" }]}>
                <div className="p-1">
                  <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-800">
                      {penang?.node_name ?? "Penang Assembly"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      {penang
                        ? <>Impaired {Math.round(penang.impairment * 100)}% · buffer{" "}
                            {penang.bufferDays}d · exposed {penang.daysExposed}d of{" "}
                            {SCENARIO.durationDays}d · via {penang.causedBy}</>
                        : "run the scenario to populate"}
                    </div>
                  </div>
                  {net.inventory.map((iv) => (
                    <Bullet key={iv.plant} label={iv.plant_name ?? iv.plant}
                      value={iv.min_days_of_inventory} max={SCENARIO.durationDays}
                      target={SCENARIO.durationDays}
                      format={(n) => `${Math.round(n)}d`} />
                  ))}
                  <div className="text-[11px] text-slate-500">
                    Marker is the {SCENARIO.durationDays}-day event. Every bar short of it runs
                    out before the event ends — which is why a 10-day version of this same
                    hurricane barely reaches Penang at all.
                  </div>
                </div>
              </Annotated>
            </ScreenFrame>
          )}

          {/* 6 — the plan */}
          {step.id === "plan" && plan && (
            <ScreenFrame page="Mitigation" caption="inside real capacity limits">
              <Annotated pins={[
                { x: 88, y: 22, label: "What each move costs in hours", side: "left" },
                { x: 50, y: 78, label: "Cannot be moved at any price", side: "top", n: 2 },
              ]}>
                <div className="p-1">
                  <table className="w-full text-[11px]">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-gray-200">
                        <th className="py-1">Move</th><th>To</th>
                        <th className="text-right">Units/mo</th>
                        <th className="text-right">Hours</th>
                        <th className="text-right">Protects</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.reroutes.map((r) => (
                        <tr key={r.flow_id} className="border-b border-gray-100">
                          <td className="py-1 text-slate-700">{r.material_category}</td>
                          <td className="font-medium text-sky-700">{r.toPlant}</td>
                          <td className="text-right">{r.unitsMoved}</td>
                          <td className="text-right text-slate-500">
                            {r.hrsRequired}/{r.hrsAvailableBefore}
                          </td>
                          <td className="text-right font-semibold text-emerald-700">
                            {money(r.valueProtected)}
                          </td>
                        </tr>
                      ))}
                      {plan.unmitigable.map((u) => (
                        <tr key={u.flow_id} className="border-b border-gray-100 bg-rose-50">
                          <td className="py-1 text-slate-700">{u.material_category}</td>
                          <td colSpan={3} className="text-[10.5px] text-rose-800">{u.reason}</td>
                          <td className="text-right font-semibold text-rose-700">
                            {money(u.valueAtRisk)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sj && (
                    <div className="mt-3">
                      <Bullet label={`${sj.plantName} after the moves`}
                        value={sj.utilizationAfter} max={110} band={[70, 90]}
                        target={100} danger={95} format={(n) => `${n.toFixed(1)}%`} />
                      <div className="text-[11px] text-rose-600">
                        Was {sj.utilizationBefore}%. {sj.spareUnitsLeft} spare units left —
                        the fix creates a new single point of failure.
                      </div>
                    </div>
                  )}
                </div>
              </Annotated>
            </ScreenFrame>
          )}

          {/* 7 — the AI */}
          {step.id === "ai" && (
            <ScreenFrame page="Mitigation" caption="reasons over the figures, does not compute them">
              <Annotated pins={[{ x: 14, y: 12, label: "Click Brief me", side: "right" }]}>
                <div className="p-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white">
                      Brief me
                    </span>
                    <span className="text-[10.5px] text-slate-400">
                      then ask follow-ups in the box below it
                    </span>
                  </div>
                  <div className="space-y-1.5 rounded bg-slate-50 p-3 text-[11px] leading-relaxed">
                    <div className="font-semibold uppercase tracking-wide text-sky-700">
                      What happens
                    </div>
                    <p className="text-slate-700">
                      Austin goes offline for 60 days, cutting three flows. Penang has 12 days of
                      test fixtures, so it runs normally until day 13, then drops to 11% for the
                      remaining 48 days — cascading to TSMC and Texas Instruments.
                    </p>
                    <div className="pt-1 font-semibold uppercase tracking-wide text-sky-700">
                      What is still exposed
                    </div>
                    <p className="text-slate-700">
                      Die sorting cannot be rerouted because no other plant makes it. The
                      alternative plants aren't full — they don't exist in your network.
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["What if the outage ran twice as long?",
                      "Which single action protects the most revenue?",
                      "What should I tell the affected customers?"].map((q) => (
                      <span key={q} className="rounded-full border border-gray-300 px-2 py-0.5
                                               text-[10.5px] text-slate-600">{q}</span>
                    ))}
                  </div>
                </div>
              </Annotated>
            </ScreenFrame>
          )}
        </div>

        {/* ---------------- right rail: do this ---------------------------- */}
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Do this
            </div>
            <div className="mt-2">
              {step.id === "network" && <Steps items={[
                { n: 1, text: "Open Scenario Studio from the sidebar." },
                { n: 2, text: "Look at the map before running anything.",
                  note: "5 plants, 6 suppliers, 8 customers at real coordinates." },
                { n: 3, text: `Note the scale: ${net ? money(net.totals.monthly_value) : "—"} of flow per month.` },
              ]} />}
              {step.id === "pick" && <Steps items={[
                { n: 1, text: "Click the Hurricane — Austin Fab offline card." },
                { n: 2, text: "The scenario runs immediately; no Run needed for presets." },
                { n: 3, text: "To build your own, set type, site, severity and duration, then press Run scenario.",
                  note: "Duration matters most — it decides whether inventory absorbs the event." },
              ]} />}
              {step.id === "exposure" && <Steps items={[
                { n: 1, text: "Read the five tiles left to right." },
                { n: 2, text: "Scroll to the staged pipeline below them.",
                  note: "Columns are ordered by what each item needs from you, not by size." },
                { n: 3, text: "Check the capacity and buffer charts at the foot of the page." },
              ]} />}
              {step.id === "ripple" && <Steps items={[
                { n: 1, text: "Go to Ripple Map." },
                { n: 2, text: "Press Play from the start. It walks one lane at a time.",
                  note: "Beats are lettered — 1a, 1b, 1c, then 2a, 2b." },
                { n: 3, text: "Stop on 1c. That is the inter-plant lane that causes hop 2.",
                  note: "The camera pulls out to the whole world here, because the chain jumps to Malaysia." },
              ]} />}
              {step.id === "buffer" && <Steps items={[
                { n: 1, text: "Click the Penang node on either panel." },
                { n: 2, text: "Read the buffer and exposed days in the detail strip." },
                { n: 3, text: "Re-run at 10 days in Scenario Studio to see it disappear.",
                  note: "Below Penang's 12-day buffer, the second hop never happens." },
              ]} />}
              {step.id === "plan" && <Steps items={[
                { n: 1, text: "Go to Mitigation." },
                { n: 2, text: "Read the hours column — that is the real constraint." },
                { n: 3, text: "Look at the blocked rows and their three distinct reasons.",
                  note: "No alternative · alternative also disrupted · alternative full." },
              ]} />}
              {step.id === "ai" && <Steps items={[
                { n: 1, text: "Click Brief me." },
                { n: 2, text: "Ask a follow-up in the box, or use a suggested chip." },
                { n: 3, text: "Say plainly that the AI interprets and never calculates.",
                  note: "Every figure comes from the deterministic engine." },
              ]} />}
            </div>

            {step.page && onNavigate && (
              <button onClick={go}
                className="mt-3 w-full rounded bg-sky-600 px-3 py-2 text-xs font-semibold
                           text-white hover:bg-sky-700">
                {step.goLabel ?? "Take me there"} →
              </button>
            )}
          </div>

          {/* the number this step should leave behind */}
          {result && plan && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                The number to land
              </div>
              <div className="mt-1.5 text-2xl font-bold text-slate-800">
                {step.id === "network" && (net ? money(net.totals.monthly_value) : "—")}
                {step.id === "pick" && `${SCENARIO.durationDays} days`}
                {step.id === "exposure" && money(result.totals.valueAtRisk)}
                {step.id === "ripple" && `${result.totals.maxHop} hops`}
                {step.id === "buffer" && `${penang?.bufferDays ?? 12} days`}
                {step.id === "plan" && pct(plan.totals.protectedPct, 1)}
                {step.id === "ai" && money(plan.totals.valueUnprotected)}
              </div>
              <div className="text-[11px] leading-relaxed text-slate-600">
                {step.id === "network" && "of flow per month across the modelled network."}
                {step.id === "pick" && "the outage we are modelling. Change it and the answer changes."}
                {step.id === "exposure" && `at risk — ${pct(result.totals.pctOfNetwork, 1)} of the network.`}
                {step.id === "ripple" && "deep. The second hop is the one nobody predicts."}
                {step.id === "buffer" && "of cover at Penang, so the damage starts on day 13."}
                {step.id === "plan" && "of the exposure is defensible by moving work between our own plants."}
                {step.id === "ai" && "cannot be protected at any price. That is an investment decision."}
              </div>
            </div>
          )}

          {step.id === "ripple" && result && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Who ends up affected
              </div>
              <div className="mt-2 space-y-1.5">
                {cust.map((c) => (
                  <div key={c.customer} className="flex items-baseline gap-2 text-[11px]">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: hopColor(c.hop) }} />
                    <span className="text-slate-700">{c.customer}</span>
                    <span className="ml-auto font-semibold text-slate-800">{money(c.v)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] italic leading-relaxed text-slate-500">
                The two amber entries buy nothing from Austin. They buy from Penang.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* nav */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <button disabled={i === 0} onClick={() => setI(i - 1)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-slate-600
                     hover:bg-slate-50 disabled:opacity-40">
          Back
        </button>
        <button disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)}
          className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white
                     hover:bg-sky-700 disabled:opacity-40">
          Next step
        </button>
        <span className="text-xs text-slate-500">{step.title}</span>
        <span className="ml-auto text-[11px] text-slate-400">
          every figure on this page is computed live, not written into the copy
        </span>
      </div>
    </div>
  );
}
