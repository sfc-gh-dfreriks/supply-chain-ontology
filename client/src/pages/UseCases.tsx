import { useState } from "react";
import { useQuery } from "../hooks/useQuery";
import { api } from "../lib/api";
import { ChartCard, ProcessBadge, Bar, MetricCard } from "../components/Cards";

export default function UseCases() {
  const apps = useQuery(() => api.insightApps(), []);
  const [pick, setPick] = useState<string>("");

  if (apps.error) return <div className="text-sm text-rose-600">{apps.error}</div>;
  if (!apps.data) return <div className="text-sm text-slate-400">Loading…</div>;

  const list = apps.data;
  const selected = list.find((a) => a.id === (pick || list[0]?.id));
  const totalProducts = list.reduce((a, b) => a + b.products, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        SAP Business Data Cloud delivers prebuilt <b>Intelligent Applications</b> (Insight Apps) that turn
        certified data products into ready-to-use business outcomes. Each card shows which data products
        in this catalog feed that application — derived from business process, source system, and suite package.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Intelligent applications" value={list.length} />
        <MetricCard label="Product → app links" value={totalProducts}
          accent="from-violet-50 to-indigo-50 border-violet-200" />
        <MetricCard label="Best covered"
          value={[...list].sort((a,b)=>b.coverage_pct-a.coverage_pct)[0]?.name?.split(" ")[0] ?? "—"}
          accent="from-emerald-50 to-teal-50 border-emerald-200" />
        <MetricCard label="Largest app"
          value={[...list].sort((a,b)=>b.products-a.products)[0]?.products ?? 0}
          sub="data products" accent="from-amber-50 to-orange-50 border-amber-200" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[...list].sort((a, b) => b.coverage_pct - a.coverage_pct).map((a) => (
          <button key={a.id} onClick={() => setPick(a.id)}
            className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow ${
              selected?.id === a.id ? "border-sf-primary ring-1 ring-sf-primary" : "border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">{a.name}</div>
              <ProcessBadge code={a.process} color={a.color} />
            </div>
            <div className="mt-1 text-xs text-slate-500">{a.desc}</div>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              <span><b className="text-lg text-slate-800">{a.products}</b> products</span>
              <span><b>{a.entities.toLocaleString()}</b> entities</span>
              <span className="ml-auto">{a.coverage_pct}% modeled</span>
            </div>
            <div className="mt-1"><Bar pct={a.coverage_pct} color={a.color} /></div>
          </button>
        ))}
      </div>

      {selected && (
        <ChartCard title={`Data products feeding ${selected.name}`}
          subtitle={`${selected.products} products · ${selected.entities.toLocaleString()} CDS entities`}>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="py-2">Data product</th><th>Process</th><th>Entities</th><th>Semantic</th>
              </tr></thead>
              <tbody>
                {selected.members.map((m: any) => (
                  <tr key={m.tech} className="border-b border-gray-50">
                    <td className="py-1.5">{m.label}</td>
                    <td className="text-slate-500">{m.process}</td>
                    <td>{m.entity_count}</td>
                    <td>{m.has_semantic ? <span className="text-green-600">✓</span> : <span className="text-slate-300">—</span>}</td>
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
