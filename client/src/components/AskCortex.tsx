import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, Loader2, X, Send } from "lucide-react";
import { askCortex } from "../lib/api";

/**
 * "Ask Cortex" — analyses the current view in context. The server resolves the
 * facts by graph traversal or simulation, then asks AI_COMPLETE to explain them.
 */
export function AskCortex({ topic, args = {}, label = "Ask Cortex", suggestions = [], compact = false }: {
  topic: string; args?: Record<string, unknown>; label?: string; suggestions?: string[]; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function run(question = "") {
    setOpen(true); setBusy(true); setErr(null); setText(null);
    try { setText(await askCortex(topic, args, question)); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className={compact ? "inline-block" : ""}>
      <button onClick={() => run()}
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 font-semibold text-white shadow-sm hover:opacity-90 ${compact ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"}`}>
        <Sparkles className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> {label}
      </button>
      {open && (
        <div className={`mt-3 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/70 p-4 shadow-sm ${compact ? "fixed inset-x-0 bottom-0 z-50 mx-auto mb-6 max-h-[70vh] max-w-3xl overflow-y-auto shadow-2xl" : ""}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-bold text-indigo-700"><Sparkles className="h-4 w-4" /> Cortex analysis</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          {busy && <p className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Traversing the graph and analysing…</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {text && <div className="cortex-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>}
          {!busy && (
            <div className="mt-3 space-y-2 border-t border-indigo-100 pt-3">
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => { setQ(s); run(s); }}
                      className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-50">{s}</button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) run(q); }} className="flex gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a follow-up about this view…"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
                <button className="rounded-lg bg-indigo-500 px-3 text-white hover:bg-indigo-600"><Send className="h-4 w-4" /></button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
