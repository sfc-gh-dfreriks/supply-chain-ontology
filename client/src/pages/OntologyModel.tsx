import { useMemo, useState } from "react";
import { useQuery } from "../hooks/useQuery";
import { api, type ClassMode, type ClassDetail, type OntRelation, type BoNode } from "../lib/api";
import { GraphCanvas } from "../components/GraphCanvas";
import { MetricCard, ChartCard } from "../components/Cards";
import { LayerStack, RollupBars } from "../components/LayerStack";
import { AskCortex } from "../components/AskCortex";
import { SourceBadge, asOfDate } from "../components/SourceBadge";

// Which ontology the graph draws. Native is the default: it is the governed
// version of the concepts. The app model is still one click away because it
// carries what Business Ontology cannot (abstract classes, properties, rules).
type GraphSource = "native" | "app";

const MODES: { id: ClassMode; label: string; blurb: string }[] = [
  { id: "both", label: "Both",
    blurb: "The whole model, read left to right. Abstract classes are hollow with a dashed border and carry no rows of their own; concrete classes are filled and state their instance count." },
  { id: "abstract", label: "Abstract",
    blurb: "The five classes that carry no rows of their own. This is the layer that lets one query span several concrete types." },
  { id: "concrete", label: "Concrete",
    blurb: "Only the mapped classes. Note there are no subClassOf edges between them — strip the abstract layer and nothing joins a Supplier to a Customer." },
];

function Pill({ tone, children }: { tone: "abstract" | "concrete" | "inferred" | "stored" | "muted"; children: any }) {
  const cls = {
    abstract: "bg-slate-100 text-slate-700 ring-slate-300",
    concrete: "bg-sky-50 text-sky-800 ring-sky-300",
    inferred: "bg-purple-50 text-purple-800 ring-purple-300",
    stored:   "bg-emerald-50 text-emerald-800 ring-emerald-300",
    muted:    "bg-gray-50 text-gray-600 ring-gray-300",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {children}
    </span>
  );
}

function RelationRow({ r, side }: { r: OntRelation; side: "out" | "in" }) {
  const other = side === "out" ? r.range : r.domain;
  const arrow = side === "out" ? "\u2192" : "\u2190";
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-1 last:border-0">
      <div className="min-w-0">
        <span className="font-mono text-[11px] text-slate-800">{r.name}</span>
        <span className="mx-1 text-gray-400">{arrow}</span>
        <span className="text-[11px] text-slate-600">{other}</span>
      </div>
      <div className="flex shrink-0 gap-1">
        {r.cardinality && <Pill tone="muted">{r.cardinality}</Pill>}
        {r.is_inferred && <Pill tone="inferred">inferred</Pill>}
        {r.is_abstract && <Pill tone="abstract">abstract</Pill>}
      </div>
    </div>
  );
}

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
  const [mode, setMode] = useState<ClassMode>("both");
  // Relations cross the tree and make the hierarchy hard to follow, so they
  // are off by default: the subClassOf spine is the story this page tells.
  const [showRel, setShowRel] = useState(false);
  const [sel, setSel] = useState<any | null>(null);
  const [src, setSrc] = useState<GraphSource>("native");

  const schema = useQuery(() => api.ontologySchema(), []);
  const bo = useQuery(() => api.boSummary(), []);
  const graph = useQuery(() => api.classGraph(mode), [mode]);
  const boGraph = useQuery(() => api.boGraph().catch(() => null), []);
  const boOn = bo.data?.available === true;
  const showNative = src === "native" && boOn && !!boGraph.data;
  const asOf = bo.data?.available ? asOfDate(bo.data.exportedAt) : null;

  // Both graphs carry the app class name in data.name (native nodes map back to
  // one class each), so one detail lookup serves either view.
  const selName: string | null = useMemo(
    () => (sel?.name ? String(sel.name) : sel?.id ? String(sel.id).replace(/^cls::/, "") : null),
    [sel],
  );
  const detail = useQuery<ClassDetail | null>(
    () => (selName ? api.classDetail(selName) : Promise.resolve(null)),
    [selName],
  );

  // drop relation edges unless asked for
  // Native relationships are the governed content, so they are always drawn.
  const elements = useMemo(() => {
    if (showNative) return boGraph.data!.elements;
    const all = graph.data?.elements ?? [];
    return showRel ? all : all.filter((e: any) => e.data?.kind !== "relation");
  }, [graph.data, boGraph.data, showRel, showNative]);

  // Which app relations have a governed counterpart: a native non-IS_A edge
  // between the same two classes. Keyed "Domain->Range" on app class names.
  const nativePairs = useMemo(() => {
    const els = boGraph.data?.elements ?? [];
    const cls = new Map<string, string>(els.filter((e: any) => e.data?.kind === "class").map((e: any) => [e.data.id, e.data.name]));
    const m = new Map<string, string>();
    for (const e of els) {
      if (!e.data?.source || e.data.kind === "subClassOf") continue;
      m.set(`${cls.get(e.data.source)}->${cls.get(e.data.target)}`, e.data.label);
    }
    return m;
  }, [boGraph.data]);
  const nativeFor = (r: OntRelation): { ok: boolean; text: string } => {
    const hit = nativePairs.get(`${r.domain}->${r.range}`);
    if (hit) return { ok: true, text: `\u2713 ${hit}` };
    // carriesCategory is stored the other way round natively (Category classifies Flow)
    const rev = nativePairs.get(`${r.range}->${r.domain}`);
    if (rev) return { ok: true, text: `\u2713 ${rev} (reversed)` };
    if (r.is_inferred) return { ok: false, text: "rule-derived; stays in the app" };
    if (r.is_abstract) return { ok: false, text: "umbrella relation; stated in text" };
    if (r.domain === r.range) return { ok: false, text: "self-relation; stated in the definition" };
    return { ok: false, text: "stated in the definition" };
  };

  const c = schema.data?.counts;
  const modeBlurb = MODES.find((m) => m.id === mode)!.blurb;
  const d = detail.data;

  return (
    <div className="space-y-5">
      {/* Two ontologies on one page. Say which is which before showing either. */}
      <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-4">
        <div className="text-[13px] font-semibold text-slate-800">This page shows two ontologies of the same concepts</div>
        <div className="mt-2 grid grid-cols-1 gap-3 text-[12px] leading-relaxed text-slate-600 md:grid-cols-3">
          <div>
            <SourceBadge source="native" asOf={asOf} href={bo.data?.available ? bo.data.snowsightUrl : undefined} />
            <p className="mt-1">The <b>governed</b> version, in Snowflake's Horizon Catalog: approved definitions,
              typed relationships, links to the views that hold the data, and full change history. Use it for
              <em> what a concept means</em>.</p>
          </div>
          <div>
            <SourceBadge source="app" />
            <p className="mt-1">The <b>operational</b> model the app reasons with: abstract classes, typed properties,
              cardinality and the substitution rule. Business Ontology has no field for these, so they stay here.</p>
          </div>
          <div>
            <SourceBadge source="kg" />
            <p className="mt-1">The <b>instances</b>: the actual plants, suppliers and flows the scenarios run on.
              Neither ontology stores rows; this is the data both describe.</p>
          </div>
        </div>
      </div>

      {boOn && bo.data?.available && (
        <div>
          <div className="mb-2"><SourceBadge source="native" asOf={asOf} /></div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Governed nodes" value={bo.data.counts.nodes}
              sub={`${bo.data.kinds.ENTITY ?? 0} entities \u00b7 ${bo.data.kinds.TERM ?? 0} term \u00b7 domain ${bo.data.domain}`}
              accent="from-sky-50 to-white border-sky-200" />
            <MetricCard label="Relationships" value={bo.data.counts.relationships}
              sub={Object.entries(bo.data.relationshipTypes).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(" \u00b7 ")}
              accent="from-sky-50 to-white border-sky-200" />
            <MetricCard label="Representations" value={bo.data.counts.representations}
              sub="concept → VW_ONT_* view links"
              accent="from-sky-50 to-white border-sky-200" />
            <MetricCard label="Status" value="Active"
              sub={`steward-approved \u00b7 account ${bo.data.account}`}
              accent="from-sky-50 to-white border-sky-200" />
          </div>
        </div>
      )}

      {/* Headline figures. The stack is real and deployed, so lead with it. */}
      <div className="mb-[-8px]"><SourceBadge source="app" /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard label="Classes" value={c?.classes ?? "\u2014"}
          sub={c ? `${c.abstract} abstract \u00b7 ${c.concrete} concrete` : undefined}
          accent="from-slate-50 to-cyan-50 border-slate-200" />
        <MetricCard label="Relations" value={c?.relations ?? "\u2014"}
          sub={c ? `${c.relations_stored} stored \u00b7 ${c.relations_inferred} inferred` : undefined}
          accent="from-cyan-50 to-sky-50 border-cyan-200" />
        <MetricCard label="Instances" value={c ? c.instances.toLocaleString() : "\u2014"}
          sub="conforming to the model"
          accent="from-emerald-50 to-teal-50 border-emerald-200" />
        <MetricCard label="Semantic views" value={3}
          sub="base · ontology · metadata"
          accent="from-violet-50 to-indigo-50 border-violet-200" />
        <MetricCard label="Inferred edges"
          value={schema.data?.relations.find((r) => r.is_inferred)?.rule?.edges ?? "\u2014"}
          sub="canSubstituteFor, derived by rule"
          accent="from-purple-50 to-fuchsia-50 border-purple-200" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* What this page is, and what it is not. The distinction is the point. */}
        <ChartCard title="The ontology itself" subtitle="classes and relations, not rows"
          className="lg:col-span-2">
          <p className="text-[12px] leading-relaxed text-slate-600">
            This is the <span className="font-semibold text-slate-800">model</span>, not the
            data. It answers <em>what kinds of thing exist</em>, which is what lets a single
            query span several concrete types &mdash; asking for parties returns suppliers and
            customers together. The <span className="font-medium">SAP BDC Catalog</span> page
            answers a different question: <em>what data exists</em>. Conflating the two is
            what this layer was built to fix.
          </p>
          {schema.data && (
            <>
              {/* Branch key. Colour is not decoration here: it separates the
                  supply-chain domain from the SAP BDC metadata branch, and those
                  must never be mixed in one answer without saying so. */}
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Two branches, one root
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {[
                    { c: "#0369a1", n: "Party", d: "customers and suppliers" },
                    { c: "#1B3A57", n: "Facility", d: "plants" },
                    { c: "#0e7490", n: "MaterialFlow", d: "inbound, outbound, inter-plant" },
                    { c: "#0f766e", n: "MaterialCategory", d: "what a plant can make" },
                    { c: "#475569", n: "CatalogObject", d: "SAP BDC metadata, not the domain" },
                    { c: "#334155", n: "Entity", d: "the root both branches hang from" },
                  ].map((b) => (
                    <div key={b.n} className="flex items-baseline gap-2 text-[11px]">
                      <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: b.c }} />
                      <span className="font-medium text-slate-700">{b.n}</span>
                      <span className="truncate text-slate-400">{b.d}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-[11px]">
                <span className="font-mono text-slate-500">{schema.data.source}</span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="inline-block h-3.5 w-6 rounded border-2 border-dashed border-[#0369a1] bg-white" />
                  abstract
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="inline-block h-3.5 w-6 rounded bg-[#0369a1]" />
                  concrete
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-purple-500" />
                  inferred relation
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="inline-block h-0 w-4 border-t-2 border-dotted border-slate-400" />
                  abstract relation
                </span>
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard title="Deployed stack" subtitle="read from Snowflake, not hardcoded">
          {schema.data?.stack
            ? <LayerStack stack={schema.data.stack} />
            : <div className="text-[12px] text-slate-500">Loading&hellip;</div>}
        </ChartCard>
      </div>

      {/* Abstract / concrete toggle */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Graph
          </span>
          <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-gray-300">
            {([["native", "Snowflake Business Ontology"], ["app", "App class model"]] as const).map(([id, label]) => (
              <button key={id} disabled={id === "native" && !boOn}
                onClick={() => { setSrc(id); setSel(null); }}
                className={`px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-40 ${
                  src === id ? (id === "native" ? "bg-[#29B5E8] text-white" : "bg-[#1B3A57] text-white")
                    : "bg-white text-slate-700 hover:bg-slate-50"}`}>
                {label}
              </button>
            ))}
          </div>
          {!showNative && <>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Show
          </span>
          <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-gray-300">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setSel(null); }}
                className={`px-3 py-1.5 text-[12px] font-medium transition ${
                  mode === m.id
                    ? "bg-[#1B3A57] text-white"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
            <input type="checkbox" checked={showRel}
              onChange={(e) => setShowRel(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300" />
            show relations
          </label>
          <div className="text-[11px] text-slate-400">
            {graph.data && `${graph.data.elements.filter((e: any) => e.data?.kind === "class").length} classes`}
          </div>
          </>}
          {showNative && (
            <div className="ml-auto text-[11px] text-slate-400">
              {boGraph.data!.counts.nodes} nodes · {boGraph.data!.counts.relationships} relationships
            </div>
          )}
        </div>
        <div className="mt-2">
          {showNative ? <SourceBadge source="native" asOf={asOf} /> : <SourceBadge source="app" />}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
          {showNative
            ? "The governed graph, as published in Snowflake. Laid out around Plant, the concept the scenarios turn on. It has no abstract/concrete distinction and no root: Business Ontology has no abstract flag, so the app's technical root Entity was not published. Plant-to-plant transfers and the inferred substitution rule are operational and stay in the app model."
            : modeBlurb}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {graph.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-800">
              {String(graph.error)}
              <div className="mt-1 text-red-600">
                If the schema export is missing, run:{" "}
                <code className="font-mono">python3 tools/export_ontology_schema.py</code>
              </div>
            </div>
          )}
          <GraphCanvas
            elements={elements}
            onSelectNode={setSel}
            height={620}
            layout="tree"
          />
        </div>

        {/* Detail panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {!selName && (
            <div className="text-[12px] text-slate-500">
              Select a class to see its parent, children, properties, relations and
              physical mapping. Abstract classes also show the concrete breakdown
              that proves the abstraction.
            </div>
          )}
          {selName && d && (
            <div className="space-y-3">
              <AskCortex compact topic="class" args={{ class: selName }} label={`Explain ${selName}`} />
              {d.native && <NativePanel n={d.native} asOf={asOf} />}
              {d.nativeAvailable && !d.native && (
                <div className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 ring-1 ring-slate-200">
                  <SourceBadge source="native" />
                  <p className="mt-1">Not published to Snowflake Business Ontology. {d.cls.name} is the app's
                    technical root class; it carries no business meaning of its own, and Business Ontology has no
                    abstract or root concept to map it to.</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <SourceBadge source="app" why="Operational model: abstract flag, depth, instances, properties, cardinality and table mapping. Business Ontology has no field for these." />
                <span className="text-[11px] text-slate-500">operational model</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800">{d.cls.name}</h3>
                  <Pill tone={d.cls.is_abstract ? "abstract" : "concrete"}>
                    {d.cls.is_abstract ? "abstract" : "concrete"}
                  </Pill>
                </div>
                {d.cls.description && !d.native && (
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                    {d.cls.description}
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <dt className="text-slate-500">Parent</dt>
                <dd className="text-slate-800">{d.cls.parent ?? "\u2014 (root)"}</dd>
                <dt className="text-slate-500">Depth</dt>
                <dd className="text-slate-800">{d.cls.depth ?? "\u2014"}</dd>
                <dt className="text-slate-500">Instances</dt>
                <dd className="text-slate-800">
                  {d.cls.is_abstract
                    ? `0 of its own${d.rollup ? ` \u00b7 ${d.rollup.total.toLocaleString()} below` : ""}`
                    : d.cls.instances.toLocaleString()}
                </dd>
              </dl>

              {/* The abstraction, demonstrated rather than asserted. */}
              {d.rollup && d.rollup.breakdown.length > 1 && (
                <div className="rounded-lg bg-gradient-to-br from-cyan-50 to-sky-50 p-3 ring-1 ring-cyan-200">
                  <div className="text-[11px] font-semibold text-slate-800">
                    One query across {d.rollup.breakdown.length} concrete types
                  </div>
                  <div className="mb-2 font-mono text-[10px] text-slate-500">
                    {d.rollup.view}
                  </div>
                  <RollupBars breakdown={d.rollup.breakdown} total={d.rollup.total} />
                  <div className="mt-1.5 flex justify-between border-t border-cyan-200 pt-1 text-[12px] font-semibold">
                    <span className="text-slate-800">total</span>
                    <span className="text-slate-900">{d.rollup.total.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {d.children.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Children
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.children.map((ch) => (
                      <Pill key={ch.name} tone={ch.is_abstract ? "abstract" : "concrete"}>
                        {ch.name}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}

              {d.ancestors.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Ancestors
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-700">
                    {d.cls.name}
                    {d.ancestors.map((a) => ` \u2192 ${a.ancestor}`).join("")}
                  </div>
                </div>
              )}

              {(d.relations_out.length > 0 || d.relations_in.length > 0) && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Relations
                  </div>
                  <div className="mt-1">
                    {d.relations_out.map((r) => (
                      <RelationRow key={`o-${r.name}-${r.range}`} r={r} side="out" />
                    ))}
                    {d.relations_in.map((r) => (
                      <RelationRow key={`i-${r.name}-${r.domain}`} r={r} side="in" />
                    ))}
                  </div>
                </div>
              )}

              {d.cls.source && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Physical mapping
                  </div>
                  <div className="mt-1 font-mono text-[11px] leading-relaxed text-slate-700">
                    {d.cls.source.table}
                    {d.cls.source.filter_col && (
                      <> where {d.cls.source.filter_col} = '{d.cls.source.filter_val}'</>
                    )}
                  </div>
                </div>
              )}
              {!d.cls.source && d.cls.is_abstract && (
                <div className="rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
                  No physical table, by design. An abstract class is a union over its
                  children rather than a table of its own.
                </div>
              )}

              {d.properties.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Properties ({d.properties.length})
                  </div>
                  <div className="mt-1 max-h-44 overflow-y-auto">
                    {d.properties.map((p) => (
                      <div key={p.name}
                        className="flex justify-between gap-2 border-b border-gray-100 py-0.5 text-[11px] last:border-0">
                        <span className="font-mono text-slate-700">{p.name}</span>
                        <span className="shrink-0 text-slate-500">{p.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Relation inventory: stored vs inferred vs abstract, in one place. */}
      {schema.data && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Relations</h3>
            <SourceBadge source="app" />
          </div>
          <p className="mt-0.5 text-[12px] text-slate-600">
            A stored relation is read from a source table. An inferred relation is
            derived by rule and exists nowhere on disk. An abstract relation is an
            umbrella over concrete ones and is never traversed directly.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3 font-semibold">Relation</th>
                  <th className="py-1 pr-3 font-semibold">Domain</th>
                  <th className="py-1 pr-3 font-semibold">Range</th>
                  <th className="py-1 pr-3 font-semibold">Cardinality</th>
                  <th className="py-1 pr-3 font-semibold">Kind</th>
                  <th className="py-1 pr-3 font-semibold">Derivation</th>
                  {boOn && <th className="py-1 font-semibold text-sky-800">In Business Ontology</th>}
                </tr>
              </thead>
              <tbody>
                {schema.data.relations.map((r) => (
                  <tr key={r.name} className="border-b border-gray-100 last:border-0">
                    <td className="py-1 pr-3 font-mono text-slate-800">{r.name}</td>
                    <td className="py-1 pr-3 text-slate-700">{r.domain}</td>
                    <td className="py-1 pr-3 text-slate-700">{r.range}</td>
                    <td className="py-1 pr-3 text-slate-500">{r.cardinality ?? "\u2014"}</td>
                    <td className="py-1 pr-3">
                      {r.is_inferred ? <Pill tone="inferred">inferred</Pill>
                        : r.is_abstract ? <Pill tone="abstract">abstract</Pill>
                        : <Pill tone="stored">stored</Pill>}
                    </td>
                    <td className="py-1 text-[11px] text-slate-600">
                      {r.rule
                        ? `${r.rule.id} (${r.rule.kind}) \u2192 ${r.rule.edges} edges`
                        : r.is_abstract
                          ? "umbrella over concrete flow relations"
                          : "read from source"}
                    </td>
                    {boOn && (() => { const n = nativeFor(r); return (
                      <td className={`py-1 text-[11px] ${n.ok ? "font-medium text-sky-800" : "text-slate-400"}`}>{n.text}</td>
                    ); })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
