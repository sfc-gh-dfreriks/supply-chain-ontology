import { useQuery } from "../hooks/useQuery";
import { ops } from "../lib/api";
import { AskCortex } from "./AskCortex";

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}K`);

/**
 * Supply Chain 360 operations, attached to the ontology's Plant nodes. Each plant
 * card links to the scenario it most needs, so the pulse is a starting point for
 * decisions rather than a second dashboard.
 */
export function OperationsPulse({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const q = useQuery(() => ops.pulse(), []);
  if (q.loading || q.error || !q.data) return null;
  const { totals, by_cause, plants, presets } = q.data;
  const maxCost = Math.max(...by_cause.map((c: any) => c.late_cost_usd), 1);

  return (
    <section className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/60 via-white to-indigo-50/40 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Operations pulse — from Supply Chain 360</h2>
          <p className="text-xs text-slate-500">
            OTIF, late cost, operating rate, tool risk and component shortfall, joined to each Plant node in the graph.
            Order, tool and lot data is representative demo enrichment keyed to SAP master data.
          </p>
        </div>
        <AskCortex topic="pulse" label="Ask Cortex: where should we act first?"
          suggestions={["Which plant is the biggest risk to customers this month?", "Is equipment or components the bigger constraint network-wide?", "Which of today's risks should we simulate first?"]} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["OTIF", `${totals.otif_pct}%`], ["Late orders", `${totals.late_orders} / ${totals.orders}`],
          ["Late-delivery cost", money(totals.late_cost_usd)], ["Top cause", by_cause[0]?.cause ?? "—"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</p>
            <p className="mt-0.5 text-xl font-extrabold text-slate-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Late cost by cause</p>
          {by_cause.map((c: any) => (
            <div key={c.cause} className="mb-1.5">
              <div className="flex justify-between text-xs"><span>{c.cause}</span><span className="font-semibold">{money(c.late_cost_usd)}</span></div>
              <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-amber-500" style={{ width: `${(100 * c.late_cost_usd) / maxCost}%` }} /></div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white xl:col-span-2">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-800 text-left text-xs text-white">
              {["Plant", "OTIF", "Late cost", "Op. rate", "Constraint", "Riskiest tool", "Worst shortfall"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{plants.map((p: any, i: number) => (
              <tr key={p.node_id} className={i % 2 ? "bg-slate-50" : ""}>
                <td className="px-3 py-1.5 font-medium">{p.plant_name}</td>
                <td className={`px-3 ${p.otif_pct < 70 ? "font-semibold text-red-600" : ""}`}>{p.otif_pct}%</td>
                <td className="px-3 font-semibold">{money(p.late_cost_usd)}</td>
                <td className="px-3">{p.operating_rate_pct}%</td>
                <td className={`px-3 ${p.binding_constraint === "Equipment" ? "text-red-600" : "text-amber-600"}`}>{p.binding_constraint}</td>
                <td className="px-3 text-xs">{p.riskiest_tool} <span className={Number(p.max_failure_prob) >= 0.3 ? "font-bold text-red-600" : "text-slate-400"}>{(100 * Number(p.max_failure_prob)).toFixed(0)}%</span></td>
                <td className="px-3 text-xs">{p.worst_component} · {Number(p.worst_shortfall_days).toFixed(0)} d</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>

      {onNavigate && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Simulate today's risks:</span>
          {presets.map((p: any) => (
            <button key={p.id} onClick={() => { sessionStorage.setItem("sc.preset", p.id); onNavigate("scenario"); }}
              className="rounded-full border border-sky-300 bg-white px-3 py-1 text-sky-700 hover:bg-sky-50">{p.label}</button>
          ))}
        </div>
      )}
    </section>
  );
}
