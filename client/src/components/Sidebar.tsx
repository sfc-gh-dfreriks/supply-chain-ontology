import { Network, Workflow, Grid3x3, ShieldCheck, LayoutDashboard, Boxes,
         MessageSquare, Share2, PlayCircle, CloudLightning, Globe2,
         Wrench , Route, Layers, Cable} from "lucide-react";

export type PageId = "overview" | "model" | "graph" | "traverse" | "processes" | "usecases"
                   | "correlation" | "coverage" | "ask" | "demo"
                   | "scenario" | "ripple" | "optimize" | "mitigation" | "thread";

const NAV: { id: PageId; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  // The ontology proper sits above the catalog: it is the model the catalog's
  // contents conform to, and the page most people actually want when they say
  // "show me the ontology".
  { id: "model", label: "Ontology Model", icon: Layers },
  { id: "graph", label: "SAP BDC Catalog", icon: Network },
  { id: "traverse", label: "Graph Traversal", icon: Share2 },
  { id: "thread", label: "Digital Thread", icon: Cable },
  { id: "processes", label: "Business Processes", icon: Workflow },
  { id: "usecases", label: "Use Cases / Insight Apps", icon: Boxes },
  { id: "correlation", label: "Correlation", icon: Grid3x3 },
  { id: "coverage", label: "Coverage & Scorecard", icon: ShieldCheck },
  { id: "ask", label: "Ask the Ontology", icon: MessageSquare },
  { id: "demo", label: "Guided Demo", icon: PlayCircle },
  { id: "scenario", label: "Scenario Studio", icon: CloudLightning },
  { id: "ripple", label: "Ripple Map", icon: Globe2 },
  { id: "mitigation", label: "Mitigation", icon: Wrench },
  { id: "optimize", label: "Optimization Map", icon: Route },
];

export function Sidebar({ active, onNavigate, products, entities }: {
  active: PageId; onNavigate: (p: PageId) => void; products: number; entities: number;
}) {
  return (
    <aside className="flex w-64 flex-col bg-gradient-to-b from-sf-dark to-sf-deeper text-white">
      <div className="px-5 py-5">
        <div className="inline-flex rounded-md bg-sf-primary px-3 py-1 text-lg font-extrabold tracking-widest">SAP</div>
        <div className="mt-2 text-base font-semibold leading-tight">Supply Chain Ontology</div>
        <div className="text-xs text-sf-pale">{products} data products &bull; {entities.toLocaleString()} entities</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => onNavigate(id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              active === id ? "bg-white/15 font-semibold text-white" : "text-sf-pale hover:bg-white/10"
            }`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-4 text-[10px] leading-tight text-sf-pale/70">
        Design to Operate &middot; Source to Pay &middot; supply-chain slice of the SAP BDC catalog
      </div>
    </aside>
  );
}
