import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, Loader2, Send } from "lucide-react";
import { askCortex, STATIC } from "../lib/api";
import { SourceBadge } from "../components/SourceBadge";

/**
 * Domain-wide Ask Cortex, as in the 360 apps. The server's "domain" topic sends
 * AI_COMPLETE the governed concepts and relationships, the operations pulse,
 * the digital thread and every preset scenario with its recovery plan.
 *
 * The question travels in args as well as in the question field, so the static
 * build can key a baked answer for each suggestion (tools/bake_static.py).
 */
export const DOMAIN_SUGGESTIONS = [
  "Which single supplier or plant is our biggest point of failure, and why?",
  "Which preset scenario costs the most, and how much of it can we recover?",
  "Where would one more unit of capacity protect the most revenue?",
  "Which customers are exposed in more than one scenario?",
  "What does the ontology say a Plant is, and how does the app use it?",
  "What should we act on first this week?",
];

export default function AskCortexPage() {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(question: string) {
    setAsked(question || null); setBusy(true); setErr(null); setText(null);
    try { setText(await askCortex("domain", question ? { question } : {}, question)); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 via-white to-sky-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-indigo-700">
          <Sparkles className="h-4 w-4" /> Cortex supply chain analysis
          <SourceBadge source="native" />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Ask anything across the supply chain. Cortex answers from the governed Supply Chain domain in
          Snowflake Business Ontology (its concepts, definitions and relationships), the operations pulse,
          the digital thread, and every preset scenario run through the engine with its recovery plan.
          Answers name the relationships they rely on.
        </p>
        {STATIC && (
          <p className="mt-2 text-xs text-amber-700">
            Public build: the suggested questions below have pre-computed answers. Free-text questions need the
            live app with a Snowflake connection.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested questions</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run("")} disabled={busy}
            className="rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            Analyse the supply chain
          </button>
          {DOMAIN_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => { setQ(s); run(s); }} disabled={busy}
              className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) run(q.trim()); }} className="mt-3 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={busy}
            placeholder="Ask about suppliers, plants, scenarios, recovery, lots…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
          <button disabled={busy} className="rounded-lg bg-indigo-500 px-4 text-white hover:bg-indigo-600 disabled:opacity-50">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {(busy || text || err) && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/70 p-5 shadow-sm">
          <div className="mb-2 text-sm font-bold text-indigo-700">
            {asked ?? "Analyse the supply chain"}
          </div>
          {busy && <p className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Walking the ontology and running the scenarios…</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {text && <div className="cortex-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>}
        </div>
      )}
    </div>
  );
}
