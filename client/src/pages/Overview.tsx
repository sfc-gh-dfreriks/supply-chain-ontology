import { useQuery } from "../hooks/useQuery";
import { api } from "../lib/api";
import { ChartCard } from "../components/Cards";
import { SourceBadge, asOfDate } from "../components/SourceBadge";

/**
 * Below the operations pulse: what the app is built on. The governed domain in
 * Snowflake Business Ontology, and the network the scenario engine assembled by
 * walking it.
 */
export default function Overview() {
  const meta = useQuery(() => api.meta(), []);
  if (meta.error) return <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-600">{String(meta.error)}</div>;
  if (!meta.data) return <div className="text-sm text-slate-500">Loading&hellip;</div>;
  const bo = meta.data.ontology;
  const net = meta.data.network;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <ChartCard title="Supply Chain ontology" subtitle="governed in Snowflake Business Ontology">
        {bo.available && (
          <>
            <SourceBadge source="native" asOf={asOfDate(bo.exportedAt)} href={bo.snowsightUrl} />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat value={bo.counts.nodes} label="governed concepts" sub={`domain ${bo.domain}`} tone="text-[#29B5E8]" />
              <Stat value={bo.counts.relationships} label="relationships" sub="typed, approved" tone="text-[#29B5E8]" />
              <Stat value={bo.counts.representations} label="representations" sub="concept → Snowflake object" tone="text-[#29B5E8]" />
              <Stat value="Active" label="status" sub="steward-approved" tone="text-emerald-600" />
            </div>
          </>
        )}
        <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] leading-relaxed text-slate-600">
          Every concept the app uses (Supplier, Plant, Customer, Material Flow, Sales Order, Component Lot) has a
          steward-approved definition here, typed relationships to the others, and links to the Snowflake objects
          that hold its data. Cortex agents and every Snowflake user find the same definitions.
        </p>
      </ChartCard>

      <ChartCard title="The network the scenarios run on" subtitle="assembled by walking the ontology">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={net.plants} label="plants" tone="text-[#1B3A57]" />
          <Stat value={net.suppliers} label="suppliers" sub="supplies → Plant" tone="text-[#0369a1]" />
          <Stat value={net.customers} label="customers" sub="Plant ships to →" tone="text-[#0369a1]" />
          <Stat value={net.flows} label="material flows" sub={`$${(net.monthly_value / 1e6).toFixed(1)}M a month`} tone="text-[#0e7490]" />
        </div>
        <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] leading-relaxed text-slate-600">
          The scenario engine finds its suppliers, plants and customers at the ends of the governed <b>supplies</b> and
          <b> ships to</b> relationships, its flows as the kinds of <b>Material Flow</b>, and plant capacity, buffers and
          qualifications in each concept's representations.
          {net.single_source_categories.length > 0 && (
            <> Single-source today: <span className="font-medium text-rose-700">{net.single_source_categories.join(", ")}</span>.</>
          )}
        </p>
      </ChartCard>
    </div>
  );
}

function Stat({ value, label, sub, tone }: {
  value: number | string | undefined;
  label: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div>
      <div className={`text-2xl font-extrabold leading-none ${tone}`}>
        {value ?? "—"}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-slate-600">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-600">{msg}<div className="mt-1 text-xs text-rose-400">If data is missing, run <code>npm run export-data</code>.</div></div>;
}
