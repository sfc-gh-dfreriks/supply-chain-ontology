import { useEffect, useState } from "react";
import { Sidebar, type PageId } from "./components/Sidebar";
import { useQuery } from "./hooks/useQuery";
import { api } from "./lib/api";
import Overview from "./pages/Overview";
import OntologyModel from "./pages/OntologyModel";
import SnowflakeOntology from "./pages/SnowflakeOntology";
import AskCortexPage from "./pages/AskCortexPage";
import Demo from "./pages/Demo";
import ScenarioStudio from "./pages/ScenarioStudio";
import RippleMap from "./pages/RippleMap";
import OptimizeMap from "./pages/OptimizeMap";
import Mitigation from "./pages/Mitigation";
import ExecuteS4 from "./pages/ExecuteS4";
import DigitalThread from "./pages/DigitalThread";
import { OperationsPulse } from "./components/OperationsPulse";

const TITLES: Record<PageId, string> = {
  model: "Ontology — the governed Supply Chain domain",
  overview: "Executive Dashboard",
  snowflake: "Snowflake Ontology Details — the domain inside Snowsight",
  ask: "Ask Cortex — questions across the whole supply chain",
  demo: "Guided Demo",
  scenario: "Scenario Studio",
  ripple: "Ripple Map — geography and topology",
  mitigation: "Mitigation & Recovery",
  execute: "Execute in S/4HANA — governed writeback of the recovery plan",
  thread: "Digital Thread — orders, systems, lots and tools",
};

const PAGE_IDS = Object.keys(TITLES) as PageId[];

// Old links keep working: the recovery map now lives on the Mitigation page.
const ALIASES: Record<string, PageId> = { optimize: "mitigation" };

/** Read the page from the URL hash, falling back to the Ontology page (first in the nav). */
function pageFromHash(): PageId {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (ALIASES[h]) return ALIASES[h];
  return PAGE_IDS.includes(h as PageId) ? (h as PageId) : "model";
}

export default function App() {
  // The page lives in the hash so every view can be linked to, bookmarked and
  // handed to someone else — the dashboard app links straight to Scenario Studio.
  const [page, setPage] = useState<PageId>(pageFromHash);
  const meta = useQuery(() => api.meta(), []);

  // Push the current page into the URL, and follow the URL when it changes
  // underneath us (back button, or a link pasted into the same tab).
  useEffect(() => {
    if (pageFromHash() !== page) window.location.hash = page;
  }, [page]);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const render = () => {
    switch (page) {
      case "overview": return (<>
        <div className="mb-6"><OperationsPulse onNavigate={(p) => setPage(p as PageId)} /></div>
        <Overview /></>);
      case "thread": return <DigitalThread />;
      case "model": return <OntologyModel />;
      case "snowflake": return <SnowflakeOntology />;
      case "ask": return <AskCortexPage />;
      case "demo": return <Demo onNavigate={setPage} />;
      case "scenario": return <ScenarioStudio />;
      case "ripple": return <RippleMap />;
      case "mitigation": return (<>
        <OptimizeMap />
        <div className="mt-6"><Mitigation onNavigate={setPage} /></div></>);
      case "execute": return <ExecuteS4 onNavigate={setPage} />;
    }
  };

  return (
    <div className="flex h-full">
      <Sidebar active={page} onNavigate={setPage}
        concepts={meta.data?.ontology.available ? meta.data.ontology.counts.nodes : 0}
        domain={meta.data?.ontology.available ? meta.data.ontology.domain : "Supply Chain"} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
          <h1 className="text-lg font-bold text-slate-800">{TITLES[page]}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            built on Snowflake Business Ontology
          </span>
          {meta.error && <span className="ml-auto text-xs text-rose-500">{meta.error}</span>}
        </header>
        <main className="flex-1 overflow-auto bg-slate-50 p-6">{render()}</main>
      </div>
    </div>
  );
}
