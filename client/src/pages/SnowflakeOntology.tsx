import { useState } from "react";
import { SourceBadge } from "../components/SourceBadge";
import { AgentSearch } from "../components/AgentSearch";

/**
 * What the governed Supply Chain domain looks like inside Snowflake itself.
 *
 * These are Snowsight screenshots of the Business Ontology page, not app
 * renderings, so a viewer can match what the app reads to the place it is
 * defined and approved. They were captured from the US demo account.
 */
const SHOTS: { file: string; title: string; where: string; points: string[]; why: string }[] = [
  {
    file: "11_bo_graph.png", title: "The Supply Chain domain graph", where: "Business Ontology → Graph",
    points: [
      "21 concepts and 26 relationships, approved and active",
      "Hierarchy: Party → Customer and Supplier; Facility → Plant; Material Flow → Inbound, Outbound, Inter Plant",
      "Business verbs as edges: supplies, ships to, fulfilled by, built at, installed at, produces",
    ],
    why: "These are the relationships every page of this app walks to build the network, the ripple and the recovery plan.",
  },
  {
    file: "10_bo_list.png", title: "Every concept, in one governed list", where: "Business Ontology → List",
    points: ["Each concept has an approved definition, a type and a domain", "State filter shows Active or Draft"],
    why: "A concept means one thing on the account, for this app, for Cortex agents and for every other tool.",
  },
  {
    file: "12_bo_supplier.png", title: "Supplier: where a scenario starts", where: "Supplier node",
    points: [
      "Definition, type Entity, domain Supply Chain",
      "Relationships: supplies → Plant, is a → Party, Component Lot supplied by → Supplier",
      "Representation: VW_ONT_SUPPLIER, the view the app reads",
    ],
    why: "Hamamatsu is an instance; Supplier is the concept. The node points at the exact view that holds the suppliers.",
  },
  {
    file: "13_bo_plant.png", title: "Plant: where the ripple lands", where: "Plant node",
    points: [
      "Seven connected concepts: Supplier, Equipment, Sales Order, System Serial in; Customer, Material Category, Facility out",
      "Representation: VW_ONT_PLANT, the view the app reads",
    ],
    why: "Every relation the scenario uses to find exposed plants and customers is visible and governed here.",
  },
  {
    file: "14_bo_history.png", title: "The audit trail", where: "Plant → History",
    points: ["Who created the node, changed its status, added each relationship and representation, and when"],
    why: "Every change to a definition is attributable, which an app-owned model never was.",
  },
];

export default function SnowflakeOntology() {
  const [open, setOpen] = useState<string | null>(null);
  const src = (f: string) => `${import.meta.env.BASE_URL}snowsight/${f}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-slate-600">
        <SourceBadge source="native" />
        <span>
          Screenshots from <b>Snowsight → Horizon Catalog → Business Ontology</b>, the native Snowflake
          feature. The Ontology page renders the same domain inside the app; this page shows where it is
          defined, approved and audited. Click any image to enlarge it.
        </span>
      </div>

      {SHOTS.map((s, i) => (
        <section key={s.file} className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-[3fr_2fr]">
          <button className="overflow-hidden rounded-md border border-gray-200" onClick={() => setOpen(s.file)}>
            <img src={src(s.file)} alt={s.title} className="w-full" loading="lazy" />
          </button>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
              {i + 1}. {s.where}
            </div>
            <h2 className="mt-1 text-base font-bold text-slate-800">{s.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <p className="mt-3 text-sm text-slate-700"><b>Why it matters:</b> {s.why}</p>
          </div>
        </section>
      ))}

      <AgentSearch />

      <p className="text-xs text-slate-500">
        Business Ontology is in private preview and enabled on the US demo account. Captured 13 Nov 2026.
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setOpen(null)}>
          <img src={src(open)} alt="" className="max-h-full max-w-full rounded-md shadow-2xl" />
        </div>
      )}
    </div>
  );
}
