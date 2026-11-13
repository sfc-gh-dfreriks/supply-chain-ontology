import { useMemo, useState } from "react";
import { useQuery } from "../hooks/useQuery";
import { api, type BoNode } from "../lib/api";
import { GraphCanvas } from "../components/GraphCanvas";
import { MetricCard } from "../components/Cards";
import { AskCortex } from "../components/AskCortex";
import { SourceBadge, asOfDate } from "../components/SourceBadge";

// The governed Supply Chain domain in Snowflake Business Ontology. This is not a
// copy for display: the scenario network and the digital thread are exported by
// walking these relationships and reading each concept's representations, so the
// table at the bottom is the app's real data lineage.

// What each part of the app reads, and through which governed concept.
const USES: { part: string; key: string; via: string }[] = [
  { part: "Network: suppliers, plants, customers", key: "nodes", via: "endpoints of supplies and ships to" },
  { part: "Material flows", key: "flows", via: "IS_A children of the concept Material Category classifies" },
  { part: "Capacity and inventory buffers", key: "capacity_inventory", via: "Plant properties" },
  { part: "Substitution (which plant can make what)", key: "substitution", via: "Material Category, produced by Plant" },
  { part: "Order economics: margin, OTIF", key: "economics", via: "Sales Order, fulfilled by Plant" },
];

/** The governed side of a class: what Snowflake Business Ontology says about it. */
function NativePanel({ n, asOf }: { n: BoNode; asOf: string | null }) {
  const label = (e: BoNode["edges"][number]) =>
    e.label ?? e.type.toLowerCase().replace("_", " ");
  return (
    <div className="space-y-2 rounded-lg bg-sky-50/60 p-3 ring-1 ring-sky-200">
      <SourceBadge source="native" asOf={asOf} href={n.snowsightUrl} />
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-800">{n.name}</h3>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800 ring-1 ring-emerald-300">
          {(n.status ?? "").toLowerCase()}
        </span>
        <span className="text-[11px] text-slate-500">{n.kind === "TERM" ? "term" : "entity"} · {n.fqn}</span>
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Governed definition</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-700">{n.description}</p>
      </div>
      {n.synonyms.length > 0 && (
        <div className="text-[11px] text-slate-600"><span className="font-semibold text-slate-500">Synonyms </span>{n.synonyms.join(", ")}</div>
      )}
      {n.edges.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Relationships ({n.edges.length})</div>
          {n.edges.map((e, i) => (
            <div key={i} className="flex items-baseline gap-1 border-b border-sky-100 py-0.5 text-[11px] last:border-0">
              {e.direction === "out"
                ? <><span className="text-slate-800">{n.name}</span><span className="font-medium text-sky-800">{label(e)}</span><span className="text-slate-700">{e.node}</span></>
                : <><span className="text-slate-700">{e.node}</span><span className="font-medium text-sky-800">{label(e)}</span><span className="text-slate-800">{n.name}</span></>}
              <span className="ml-auto text-[10px] text-slate-400">{e.type}</span>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Representations</div>
        {n.representations.length === 0
          ? <div className="text-[11px] text-slate-500">None. An abstract concept has no view of its own.</div>
          : n.representations.map((r) => (
            <div key={r.fqn} className="font-mono text-[11px] text-slate-700">{r.fqn}
              <span className="ml-1 font-sans text-[10px] text-slate-400">{r.objectType.toLowerCase()} · {r.role.toLowerCase()}</span></div>
          ))}
      </div>
      <div className="text-[11px] text-slate-500">
        History: {n.history.events} change{n.history.events === 1 ? "" : "s"} recorded
        {n.history.changedBy.length > 0 && ` by ${n.history.changedBy.join(", ")}`}
      </div>
    </div>
  );
}

export default function OntologyModel() {
  const [sel, setSel] = useState<any | null>(null);
  const bo = useQuery(() => api.boSummary(), []);
  const graph = useQuery(() => api.boGraph(), []);
  const meta = useQuery(() => api.meta(), []);
  const selName: string | null = sel?.boName ?? null;
  const node = useQuery<BoNode | null>(() => (selName ? api.boNode(selName) : Promise.resolve(null)), [selName]);
  const asOf = bo.data?.available ? asOfDate(bo.data.exportedAt) : null;
  const lineage = (meta.data?.lineage ?? {}) as Record<string, Record<string, string>>;

  const rels = useMemo(() => {
    const els = graph.data?.elements ?? [];
    const name = new Map<string, string>(els.filter((e: any) => e.data?.kind === "class").map((e: any) => [e.data.id, e.data.boName]));
    return els.filter((e: any) => e.data?.source).map((e: any) => ({
      source: name.get(e.data.source), target: name.get(e.data.target),
      label: e.data.kind === "subClassOf" ? "is a" : e.data.label,
    })).sort((a: any, b: any) => (a.label === "is a" ? 1 : 0) - (b.label === "is a" ? 1 : 0) || a.source.localeCompare(b.source));
  }, [graph.data]);

  if (bo.data && !bo.data.available) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-900">
      The Business Ontology snapshot is missing. Run <code className="font-mono">python3 tools/export_business_ontology.py</code>.
    </div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-4">
        <SourceBadge source="native" asOf={asOf} href={bo.data?.available ? bo.data.snowsightUrl : undefined} />
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
          The app is built on this domain. Each concept has a steward-approved definition, typed relationships and
          <b> representations</b>: links to the Snowflake objects that hold its data. The scenario engine and the digital
          thread find their data by walking these relationships and reading those representations, so changing the
          domain in Snowflake changes what the app reads.
        </p>
      </div>

      {bo.data?.available && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Governed concepts" value={bo.data.counts.nodes}
            sub={`${bo.data.kinds.ENTITY ?? 0} entities · ${bo.data.kinds.TERM ?? 0} term · domain ${bo.data.domain}`}
            accent="from-sky-50 to-white border-sky-200" />
          <MetricCard label="Relationships" value={bo.data.counts.relationships}
            sub={Object.entries(bo.data.relationshipTypes).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(" · ")}
            accent="from-sky-50 to-white border-sky-200" />
          <MetricCard label="Representations" value={bo.data.counts.representations}
            sub="concept → Snowflake object links"
            accent="from-sky-50 to-white border-sky-200" />
          <MetricCard label="Status" value="Active"
            sub={`steward-approved · account ${bo.data.account}`}
            accent="from-sky-50 to-white border-sky-200" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {graph.error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-800">{String(graph.error)}</div>}
          <GraphCanvas elements={graph.data?.elements ?? []} onSelectNode={setSel} height={620} layout="tree" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {!selName && (
            <div className="text-[12px] text-slate-500">
              Select a concept to see its governed definition, relationships, the Snowflake objects that represent it,
              and its change history.
            </div>
          )}
          {selName && node.data && (
            <div className="space-y-3">
              <AskCortex compact topic="class" args={{ class: node.data.appClass }} label={`Explain ${node.data.name}`} />
              <NativePanel n={node.data} asOf={asOf} />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">What the app reads through the ontology</h3>
          <SourceBadge source="native" />
        </div>
        <p className="mt-0.5 text-[12px] text-slate-600">
          No page names a table. Each input is found by walking the domain, then read from the representation the
          steward linked to that concept.
        </p>
        <table className="mt-2 w-full text-[12px]">
          <thead><tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-3 font-semibold">App input</th><th className="py-1 pr-3 font-semibold">Found by walking</th>
            <th className="py-1 pr-3 font-semibold">Concept</th><th className="py-1 font-semibold">Representation read</th></tr></thead>
          <tbody>
            {USES.map((u) => Object.entries(lineage[u.key] ?? {}).map(([concept, fqn], i) => (
              <tr key={u.key + concept} className="border-b border-gray-100 last:border-0">
                <td className="py-1 pr-3 text-slate-800">{i === 0 ? u.part : ""}</td>
                <td className="py-1 pr-3 text-slate-500">{i === 0 ? u.via : ""}</td>
                <td className="py-1 pr-3 font-medium text-sky-800">{concept}</td>
                <td className="py-1 font-mono text-[11px] text-slate-700">{fqn}</td>
              </tr>)))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Relationships ({rels.length})</h3>
          <div className="mt-2 grid grid-cols-1 gap-x-6 md:grid-cols-2">
            {rels.map((r: any, i: number) => (
              <div key={i} className="flex items-baseline gap-1 border-b border-gray-100 py-0.5 text-[11.5px]">
                <span className="text-slate-800">{r.source}</span>
                <span className={`font-medium ${r.label === "is a" ? "text-slate-500" : "text-sky-800"}`}>{r.label}</span>
                <span className="text-slate-700">{r.target}</span>
              </div>))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-slate-50 p-4 text-[12px] leading-relaxed text-slate-600">
          <h3 className="text-sm font-semibold text-slate-800">Not modelled in Business Ontology</h3>
          <p className="mt-1">Business Ontology governs meaning, not mechanics. These live in the scenario engine's code:</p>
          <ul className="mt-1 list-disc pl-4">
            <li>Plant-to-plant transfers as an edge type</li>
            <li>Cardinality, such as a Sales Order fulfilled by one Plant</li>
            <li>The substitution rule: same category plus spare hours</li>
            <li>Buffer timing: the lowest days of cover sets when a ripple lands</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
