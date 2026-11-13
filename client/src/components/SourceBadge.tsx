/**
 * Which ontology a card or field comes from. The app shows three sources and
 * they must never be mistaken for one another:
 *
 *   native  Snowflake Business Ontology — governed, steward-approved meaning
 *   app     the app's operational model in SAP_SUPPLY_CHAIN.ONTOLOGY
 *   kg      the knowledge graph: instances, not concepts
 *
 * `why` says why this field comes from this source, shown on hover.
 */
export type OntologySource = "native" | "app" | "kg";

const STYLE: Record<OntologySource, { label: string; cls: string; dot: string; why: string }> = {
  native: {
    label: "Snowflake Business Ontology",
    cls: "bg-sky-50 text-sky-800 ring-sky-300",
    dot: "bg-[#29B5E8]",
    why: "Governed in Snowflake (Horizon Catalog): approved definitions, typed relationships, representations and change history.",
  },
  app: {
    label: "App ontology · SAP_SUPPLY_CHAIN.ONTOLOGY",
    cls: "bg-slate-100 text-slate-700 ring-slate-300",
    dot: "bg-slate-500",
    why: "The app's operational model. Business Ontology has no field for abstract classes, properties, cardinality, rules or table filters, so these stay here.",
  },
  kg: {
    label: "Knowledge graph · instances",
    cls: "bg-emerald-50 text-emerald-800 ring-emerald-300",
    dot: "bg-emerald-500",
    why: "Instance data (KG_NODE / KG_EDGE): the actual plants, suppliers and flows. Not part of either ontology.",
  },
};

export function SourceBadge({ source, why, asOf, href, compact = false }: {
  source: OntologySource; why?: string; asOf?: string | null; href?: string; compact?: boolean;
}) {
  const s = STYLE[source];
  const title = why ?? s.why;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${s.cls}`}
      title={title}>
      {source === "native"
        ? <SnowflakeMark />
        : <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.dot}`} />}
      {compact && source === "app" ? "App ontology" : s.label}
      {asOf && <span className="font-normal opacity-70">· as of {asOf}</span>}
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="font-normal underline decoration-dotted hover:opacity-80"
          onClick={(e) => e.stopPropagation()}>
          open in Snowsight
        </a>
      )}
    </span>
  );
}

function SnowflakeMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="#29B5E8" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" />
    </svg>
  );
}

/** "13 Nov 2026" from an ISO timestamp. */
export function asOfDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One line at the top of a page saying which governed concepts it walks. */
export function BuiltOn({ walks }: { walks: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-[11.5px] text-slate-600">
      <SourceBadge source="native" />
      <span>{walks}</span>
    </div>
  );
}
