import { LayoutDashboard, PlayCircle, CloudLightning, Globe2, Wrench, Layers, Cable, Snowflake } from "lucide-react";

export type PageId = "overview" | "model" | "snowflake" | "demo" | "scenario" | "ripple" | "mitigation" | "thread";

// Every page runs on the governed Supply Chain domain in Snowflake Business
// Ontology: the Ontology page shows it, and the scenario and thread pages walk
// its relationships over the data each concept represents.
const NAV: { id: PageId; label: string; icon: any }[] = [
  { id: "model", label: "Ontology", icon: Layers },
  { id: "snowflake", label: "Snowflake Ontology Details", icon: Snowflake },
  { id: "demo", label: "Guided Demo", icon: PlayCircle },
  { id: "scenario", label: "Scenario Studio", icon: CloudLightning },
  { id: "ripple", label: "Ripple Map", icon: Globe2 },
  { id: "mitigation", label: "Mitigation & Recovery", icon: Wrench },
  { id: "thread", label: "Digital Thread", icon: Cable },
  { id: "overview", label: "Executive Dashboard", icon: LayoutDashboard },
];

export function Sidebar({ active, onNavigate, concepts, domain }: {
  active: PageId; onNavigate: (p: PageId) => void; concepts: number; domain: string;
}) {
  return (
    <aside className="flex w-64 flex-col bg-gradient-to-b from-sf-dark to-sf-deeper text-white">
      <div className="px-5 py-5">
        <div className="inline-flex rounded-md bg-sf-primary px-3 py-1 text-lg font-extrabold tracking-widest">SAP</div>
        <div className="mt-2 text-base font-semibold leading-tight">Supply Chain Ontology</div>
        <div className="text-xs text-sf-pale">{domain} domain &bull; {concepts} governed concepts</div>
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
        Built on Snowflake Business Ontology &middot; SAP supply-chain data
      </div>
    </aside>
  );
}
