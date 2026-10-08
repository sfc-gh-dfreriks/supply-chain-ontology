import { useEffect, useState } from "react";
import { useQuery } from "../hooks/useQuery";
import { thread } from "../lib/api";
import { AskCortex } from "../components/AskCortex";
import { ArrowRight } from "lucide-react";

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const RES: Record<string, string> = {
  Accepted: "bg-emerald-100 text-emerald-700", "Accepted with deviation": "bg-amber-100 text-amber-700",
  Rejected: "bg-red-100 text-red-700", PASS: "bg-emerald-100 text-emerald-700",
  PASS_AFTER_REWORK: "bg-amber-100 text-amber-700", FAIL: "bg-red-100 text-red-700",
};
const pill = (v: string) => <span className={`rounded px-2 py-0.5 text-xs font-semibold ${RES[v] ?? "bg-slate-100 text-slate-600"}`}>{String(v).replace(/_/g, " ")}</span>;

function Node({ cls, name, sub }: { cls: string; name: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">{cls}</p>
      <p className="font-semibold text-slate-800">{name}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
const Edge = ({ rel }: { rel: string }) => (
  <div className="flex flex-col items-center px-1 text-[10px] font-mono text-indigo-500">
    {rel}<ArrowRight className="h-4 w-4" />
  </div>
);

export default function DigitalThread() {
  const s = useQuery(() => thread.summary(), []);
  const [serial, setSerial] = useState("");
  const [tr, setTr] = useState<any>(null);

  useEffect(() => { if (s.data && !serial) setSerial(s.data.serials[0]?.serial_no ?? ""); }, [s.data]);
  useEffect(() => { if (serial) thread.serial(serial).then(setTr).catch(() => setTr(null)); }, [serial]);

  if (s.loading) return <div className="h-64 animate-pulse rounded-xl bg-slate-100" />;
  if (s.error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{s.error}</div>;
  const d = s.data;
  const badLots = d.lots.filter((l: any) => l.inspection_result !== "Accepted");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm text-slate-600">
          <p>The operational digital thread is part of the ontology, not a report: four new classes and seven relations
            put every built system, component lot, customer order and production tool in the knowledge graph, so a
            question like <i>"which customers did this bad lot reach?"</i> is answered by traversal.</p>
          <p className="mt-1 text-xs text-slate-400">{d.note}</p>
        </div>
        <AskCortex topic="thread" label="Ask Cortex: assess the thread"
          suggestions={["Which supplier lot is the biggest customer risk?", "Is there a supplier pattern behind deviating lots?", "Which tool threatens the most order value?"]} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["Systems traced", d.kpi.serials], ["Component lots", d.kpi.lots], ["Deviating lots", d.kpi.deviating_lots],
          ["Order value exposed", money(d.kpi.exposed_value_usd)], ["Tools at high risk", d.kpi.tools_at_risk]].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-bold text-slate-900">New ontology classes</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-1">Class</th><th>Parent</th><th>Instances</th></tr></thead>
            <tbody>{d.classes.map((c: any) => (
              <tr key={c.class_name} className="border-b border-slate-100">
                <td className="py-1.5 font-medium">{c.class_name}{c.is_abstract && <span className="ml-1 text-xs text-slate-400">(abstract)</span>}</td>
                <td>{c.parent_class_name}</td><td>{c.instances.toLocaleString()}</td></tr>))}
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-bold text-slate-900">New relations</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-1">Relation</th><th>Domain → Range</th><th>Edges</th></tr></thead>
            <tbody>{d.relations.map((r: any) => (
              <tr key={r.rel_name} className="border-b border-slate-100">
                <td className="py-1.5 font-mono text-xs">{r.rel_name}</td><td>{r.domain_class} → {r.range_class}</td><td>{r.edges.toLocaleString()}</td></tr>))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">Supplier-lot blast radius</h3>
        <p className="mb-3 text-xs text-slate-500">ComponentLot ← containsLot ← SystemSerial → shippedOn → SalesOrder → placedBy → Customer. Deviating lots first, by order value reached.</p>
        <div className="max-h-[380px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-800 text-left text-white"><tr>
              {["Lot", "Component", "Supplier", "Inspection", "Systems", "Not first-pass", "Customers", "Order value", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{badLots.concat(d.lots.filter((l: any) => l.inspection_result === "Accepted").slice(0, 10)).map((l: any, i: number) => (
              <tr key={l.lot_id} className={i % 2 ? "bg-slate-50" : ""}>
                <td className="px-3 py-1.5 font-mono text-xs">{l.lot_id}</td><td className="px-3">{l.component}</td><td className="px-3">{l.supplier}</td>
                <td className="px-3">{pill(l.inspection_result)}</td><td className="px-3">{l.systems}</td><td className="px-3">{l.systems_not_first_pass}</td>
                <td className="px-3" title={(l.customer_list ?? []).join(", ")}>{l.customers}</td>
                <td className="px-3 font-semibold">{money(Number(l.order_value_usd))}</td>
                <td className="px-3"><AskCortex compact topic="lot" args={{ lot: l.lot_id }} label="Analyse" /></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="font-bold text-slate-900">Trace one system</h3>
          <select value={serial} onChange={(e) => setSerial(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            {d.serials.map((x: any) => <option key={x.serial_no} value={x.serial_no}>{x.serial_no} · {x.customer} · {x.final_test_result.replace(/_/g, " ")}{x.deviating_lots ? ` · ${x.deviating_lots} deviating` : ""}</option>)}
          </select>
          {serial && <AskCortex compact topic="serial" args={{ serial }} label="Analyse this system" />}
        </div>
        {tr && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-1">
              <Node cls="Supplier" name={`${tr.lots.length} lots`} sub={[...new Set(tr.lots.map((l: any) => l.supplier))].join(", ")} />
              <Edge rel="suppliedBy⁻¹" />
              <Node cls="ComponentLot" name={`${tr.lots.filter((l: any) => l.INSPECTION_RESULT !== "Accepted").length} deviating`} sub={`${tr.lots.length} lots consumed`} />
              <Edge rel="containsLot⁻¹" />
              <Node cls="SystemSerial" name={tr.serial.serial_no} sub={`Final test ${String(tr.system.FINAL_TEST_RESULT).replace(/_/g, " ")}`} />
              <Edge rel="shippedOn" />
              <Node cls="SalesOrder" name={tr.order.sales_order} sub={tr.order.OTIF ? "OTIF" : `${tr.order.DELAY_DAYS}d late · ${tr.order.LATE_CAUSE}`} />
              <Edge rel="placedBy" />
              <Node cls="Customer" name={tr.serial.customer} sub={`built at ${tr.serial.plant_name}`} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-800 text-left text-white">{["Lot", "Component", "Supplier", "Received", "Inspection", "Deviation"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>{tr.lots.map((l: any, i: number) => (
                <tr key={l.lot_id} className={i % 2 ? "bg-slate-50" : ""}>
                  <td className="px-3 py-1.5 font-mono text-xs">{l.lot_id}</td><td className="px-3">{l.COMPONENT}</td><td className="px-3">{l.supplier}</td>
                  <td className="px-3">{l.RECEIVED_DATE}</td><td className="px-3">{pill(l.INSPECTION_RESULT)}</td><td className="px-3 text-xs text-slate-600">{l.DEVIATION_NOTE ?? "—"}</td>
                </tr>))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Equipment exposure</h3>
            <p className="text-xs text-slate-500">Equipment → installedAt → Plant ← fulfilledBy ← SalesOrder: the order book each tool puts at risk.</p>
          </div>
          <AskCortex compact topic="equipment" label="Ask Cortex" />
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="py-1">Tool</th><th>Type</th><th>Plant</th><th>Failure risk 48h</th><th>Plant orders</th><th>Order book</th></tr></thead>
          <tbody>{d.equipment.slice(0, 10).map((e: any) => {
            const p = Number(e.props?.FAILURE_PROB_48H ?? 0);
            return (
              <tr key={e.equipment_name} className="border-b border-slate-100">
                <td className="py-1.5 font-medium">{e.equipment_name}{e.props?.ANOMALY_FLAG && <span className="ml-2 rounded bg-red-500 px-1.5 text-[10px] font-bold text-white">ANOMALY</span>}</td>
                <td>{e.props?.EQUIPMENT_TYPE}</td><td>{e.plant_name}</td>
                <td><span className={`rounded px-2 py-0.5 text-xs font-semibold ${p >= 0.3 ? "bg-red-100 text-red-700" : p >= 0.1 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{(100 * p).toFixed(1)}%</span></td>
                <td>{e.plant_orders}</td><td className="font-semibold">{money(Number(e.plant_order_value))}</td>
              </tr>);
          })}</tbody>
        </table>
      </section>
    </div>
  );
}
