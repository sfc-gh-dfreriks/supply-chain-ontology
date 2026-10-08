import { useQuery } from "../hooks/useQuery";
import { api } from "../lib/api";
import { MetricCard, ChartCard, Bar } from "../components/Cards";

export default function Coverage() {
  const sc = useQuery(() => api.scorecard(), []);
  const cov = useQuery(() => api.coverage(), []);
  if (sc.error) return <div className="text-sm text-rose-600">{sc.error}</div>;
  if (!sc.data || !cov.data) return <div className="text-sm text-slate-400">Loading…</div>;

  const overall = sc.data.overall;
  const t = sc.data.totals;
  const color = overall >= 80 ? "#16a34a" : overall >= 60 ? "#f59e0b" : "#ef4444";
  const rollup = [...cov.data.rollup].sort((a, b) => b.coverage_pct - a.coverage_pct);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Completeness</div>
          <div className="text-5xl font-extrabold" style={{ color }}>{overall}</div>
          <div className="text-xs text-slate-400">/ 100</div>
        </div>
        <MetricCard label="Data products" value={t.products} accent="from-violet-50 to-indigo-50 border-violet-200" />
        <MetricCard label="CDS entities" value={t.entities.toLocaleString()} accent="from-emerald-50 to-teal-50 border-emerald-200" />
        <MetricCard label="Associations" value={t.associations.toLocaleString()} accent="from-amber-50 to-orange-50 border-amber-200" />
        <MetricCard label="Semantic models" value={`${t.mapped}/${t.products}`} accent="from-cyan-50 to-sky-50 border-cyan-200" />
      </div>

      <ChartCard title="Ontology quality criteria" subtitle="scored against six standard ontology dimensions">
        <div className="space-y-3">
          {[...sc.data.items].sort((a: any, b: any) => b.score - a.score).map((it: any) => {
            const c = it.score >= 80 ? "#16a34a" : it.score >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <div key={it.id} className="flex items-center gap-3">
                <div className="w-72"><div className="text-sm font-medium text-slate-700">{it.label}</div>
                  <div className="text-xs text-slate-400">{it.detail}</div></div>
                <div className="flex-1"><Bar pct={it.score} color={c} /></div>
                <div className="w-8 text-right text-sm font-bold" style={{ color: c }}>{it.score}</div>
              </div>
            );
          })}
        </div>
      </ChartCard>

      <ChartCard title="Semantic-model coverage by business process" subtitle="share of products with a Snowflake semantic model">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-400">
            <th className="py-2">Business process</th><th>Products</th><th>With model</th><th>Coverage</th>
          </tr></thead>
          <tbody>
            {rollup.map((r: any) => (
              <tr key={r.code} className="border-b border-gray-50">
                <td className="py-2">{r.name}</td><td>{r.products}</td><td>{r.mapped}</td>
                <td className="w-48"><div className="flex items-center gap-2"><Bar pct={r.coverage_pct} color={r.color} /><span className="text-xs">{r.coverage_pct}%</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      {cov.data.gaps.length > 0 && (
        <ChartCard title={`Coverage gaps — ${cov.data.gaps.length} products without a semantic model`}
          subtitle="largest by entity count first">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="py-2">Data product</th><th>Process</th><th>Line of business</th><th>Entities</th>
              </tr></thead>
              <tbody>
                {cov.data.gaps.map((g: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5">{g.label}</td>
                    <td className="text-slate-500">{cov.data.process_name[g.process]}</td>
                    <td className="text-slate-500">{g.lob}</td>
                    <td>{g.entity_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
