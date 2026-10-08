import { useState } from "react";
import { useQuery } from "../hooks/useQuery";
import { api } from "../lib/api";
import { ChartCard, ProcessBadge, Bar } from "../components/Cards";

export default function Processes() {
  const proc = useQuery(() => api.processes(), []);
  const [pick, setPick] = useState<string>("");

  if (proc.error) return <div className="text-sm text-rose-600">{proc.error}</div>;
  if (!proc.data) return <div className="text-sm text-slate-400">Loading…</div>;

  // Largest coverage first; the unassigned bucket always last.
  const ordered = [...proc.data].sort((a, b) => (a.code === "NONE" ? 1 : b.code === "NONE" ? -1 : b.coverage_pct - a.coverage_pct));
  const selected = ordered.find((r) => r.code === (pick || ordered[0]?.code));

  return (
    <div className="space-y-6">
      <ChartCard title="SAP value chain" subtitle="every data product classified into a business process">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ordered.map((r) => (
            <button key={r.code} onClick={() => setPick(r.code)}
              className={`rounded-lg border p-3 text-left transition hover:shadow ${
                selected?.code === r.code ? "border-sf-primary ring-1 ring-sf-primary" : "border-gray-100"}`}>
              <ProcessBadge code={r.code} color={r.color} name={r.name} />
              <div className="mt-2 text-2xl font-bold text-slate-800">{r.products}</div>
              <div className="text-xs text-slate-500">products · {r.entities.toLocaleString()} entities</div>
              <div className="mt-2 text-xs text-slate-500">{r.coverage_pct}% mapped · reach {r.cross_product_assoc}</div>
              <div className="mt-1"><Bar pct={r.coverage_pct} color={r.color} /></div>
            </button>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Process rollup" subtitle="products, entities, coverage and cross-process reach">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-400">
            <th className="py-2">Process</th><th>Products</th><th>CDS entities</th>
            <th>Mapped</th><th>Coverage</th><th>Reach</th>
          </tr></thead>
          <tbody>
            {ordered.map((r) => (
              <tr key={r.code} className="border-b border-gray-50">
                <td className="py-2"><ProcessBadge code={r.code} color={r.color} name={r.name} /></td>
                <td>{r.products}</td><td>{r.entities.toLocaleString()}</td><td>{r.mapped}</td>
                <td className="w-40"><div className="flex items-center gap-2"><Bar pct={r.coverage_pct} color={r.color} /><span className="text-xs">{r.coverage_pct}%</span></div></td>
                <td>{r.cross_product_assoc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      {selected && (
        <ChartCard title={`Members — ${selected.name}`} subtitle={`${selected.products} data products`}>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="py-2">Data product</th><th>Line of business</th><th>Entities</th><th>Assoc.</th><th>Semantic</th>
              </tr></thead>
              <tbody>
                {selected.members.map((m: any) => (
                  <tr key={m.tech} className="border-b border-gray-50">
                    <td className="py-1.5">{m.label}</td>
                    <td className="text-slate-500">{m.lob}</td>
                    <td>{m.entity_count}</td><td>{m.assoc_count}</td>
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
