import { useEffect, useRef, useState } from "react";

/**
 * The writeback process as a swimlane diagram: who does each step, what guards it,
 * and where the current change request is.
 *
 * Five lanes (the app, Business Ontology, the approver, Snowflake, S/4HANA) and
 * seven steps laid out left to right. Arrows are drawn in one SVG over the grid so
 * they can cross lanes. The highlight follows the change request status reported
 * by the panel below, so the diagram is also a progress indicator.
 */
type Lane = "app" | "ontology" | "people" | "snowflake" | "s4";
type State = "done" | "current" | "todo" | "stopped";

const LANES: { id: Lane; label: string; sub: string; tone: string; chip: string }[] = [
  { id: "app", label: "Recovery app", sub: "optimizer + this page", tone: "bg-slate-50", chip: "bg-slate-700" },
  { id: "ontology", label: "Business Ontology", sub: "Supply Chain domain", tone: "bg-indigo-50/60", chip: "bg-indigo-600" },
  { id: "people", label: "People", sub: "planner · approver", tone: "bg-amber-50/70", chip: "bg-amber-600" },
  { id: "snowflake", label: "Snowflake", sub: "S4_WRITEBACK procedures", tone: "bg-sky-50/70", chip: "bg-sky-600" },
  { id: "s4", label: "SAP S/4HANA", sub: "S4H · client 100 (simulated)", tone: "bg-emerald-50/70", chip: "bg-emerald-600" },
];

const STEPS: { n: number; lane: Lane; title: string; body: string; guard?: string }[] = [
  { n: 1, lane: "app", title: "Recovery plan", body: "Reroutes that fit real capacity", guard: "recomputed on the server" },
  { n: 2, lane: "ontology", title: "Find the Actions", body: "Walk ACTS_ON; read each contract", guard: "criteria · effects · runs via" },
  { n: 3, lane: "snowflake", title: "Raise change request", body: "One item per S/4 document, criteria checked", guard: "writes nothing to S/4" },
  { n: 4, lane: "people", title: "Approve", body: "A second person acknowledges and types POST TO S4HANA", guard: "approver ≠ requester · approver role" },
  { n: 5, lane: "snowflake", title: "Run the named procedures", body: "Each re-checks its criteria, then writes", guard: "refuses anything not approved" },
  { n: 6, lane: "s4", title: "S/4HANA receives OData", body: "PATCH sales order item · POST planned order" },
  { n: 7, lane: "s4", title: "Change documents", body: "CDHDR/CDPOS under the approver; reversible", guard: "audit trail" },
];

/** Which steps are done, current or stopped for a change request status. */
function stateOf(step: number, status: string | null): State {
  const reached: Record<string, number> = { none: 3, SUBMITTED: 4, APPROVED: 5, POSTED: 8, POSTED_WITH_ERRORS: 5, REVERSED: 8, REJECTED: 4 };
  const cur = reached[status ?? "none"] ?? 3;
  if ((status === "REJECTED" || status === "POSTED_WITH_ERRORS") && step === cur) return "stopped";
  if (step < cur) return "done";
  return step === cur ? "current" : "todo";
}

const STATUS_TEXT: Record<string, string> = {
  none: "Next: raise a change request. Nothing has been written.",
  SUBMITTED: "Waiting for approval. Nothing has been written to S/4HANA yet.",
  APPROVED: "Approved. Posting will call the procedures each Action contract names.",
  POSTED: "Posted. S/4HANA received the OData calls and wrote change documents.",
  POSTED_WITH_ERRORS: "Posting stopped at a refusal. Changes before it were applied.",
  REJECTED: "Rejected by the approver. Nothing was written to S/4HANA.",
  REVERSED: "Posted, then reversed from the change documents (demo reset).",
};

const COL_W = 100 / STEPS.length;   // % width of a step column
const LANE_H = 112;                  // px height of a lane row

export function WritebackProcess({ status }: { status: string | null }) {
  // arrows are drawn in pixels, so measure the step area rather than stretching an SVG
  const area = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!area.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(area.current);
    return () => ro.disconnect();
  }, []);
  const laneIndex = (l: Lane) => LANES.findIndex((x) => x.id === l);
  const centre = (s: (typeof STEPS)[number]) => ({ x: (s.n - 0.5) * COL_W, y: laneIndex(s.lane) * LANE_H + LANE_H / 2 });
  const height = LANES.length * LANE_H;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">How the plan reaches S/4HANA</div>
        <div className={`text-xs font-medium ${status === "REJECTED" || status === "POSTED_WITH_ERRORS" ? "text-rose-700"
          : status === "POSTED" ? "text-emerald-700" : "text-slate-600"}`}>
          {STATUS_TEXT[status ?? "none"] ?? ""}
        </div>
      </div>

      <div className="mt-3 flex">
        {/* lane labels */}
        <div className="w-40 shrink-0">
          {LANES.map((l) => (
            <div key={l.id} style={{ height: LANE_H }} className={`flex flex-col justify-center border-b border-white px-3 ${l.tone}`}>
              <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${l.chip}`}>
                {l.label}
              </span>
              <span className="mt-1 text-[10.5px] text-slate-500">{l.sub}</span>
            </div>
          ))}
        </div>

        {/* lanes, steps and arrows */}
        <div ref={area} className="relative min-w-0 flex-1" style={{ height }}>
          {LANES.map((l, i) => (
            <div key={l.id} className={`absolute left-0 right-0 border-b border-white ${l.tone}`}
              style={{ top: i * LANE_H, height: LANE_H }} />
          ))}

          <svg className="pointer-events-none absolute inset-0" width={w} height={height}>
            <defs>
              <marker id="wb-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
              </marker>
            </defs>
            {STEPS.slice(1).map((s, k) => {
              const a = centre(STEPS[k]), b = centre(s);
              const done = stateOf(s.n, status) === "done" || stateOf(s.n, status) === "current";
              // leave the box edge before bending, so arrows read as connectors, not lines through cards
              const px = (pct: number) => (pct / 100) * w;
              const x1 = px(a.x + COL_W * 0.44), x2 = px(b.x - COL_W * 0.44) - 2, mid = (x1 + x2) / 2;
              return (
                <path key={s.n} d={`M${x1},${a.y} L${mid},${a.y} L${mid},${b.y} L${x2},${b.y}`}
                  fill="none" stroke={done ? "#475569" : "#cbd5e1"} strokeWidth={done ? 2 : 1.5}
                  strokeDasharray={done ? undefined : "4 3"} markerEnd="url(#wb-arrow)" />
              );
            })}
          </svg>

          {STEPS.map((s) => {
            const st = stateOf(s.n, status);
            const c = centre(s);
            const ring = st === "current" ? "border-indigo-500 ring-2 ring-indigo-200 shadow-md"
              : st === "done" ? "border-slate-300" : st === "stopped" ? "border-rose-500 ring-2 ring-rose-200" : "border-dashed border-slate-300 opacity-70";
            const badge = st === "done" ? "bg-emerald-600" : st === "current" ? "bg-indigo-600" : st === "stopped" ? "bg-rose-600" : "bg-slate-400";
            return (
              <div key={s.n} className={`absolute rounded-md border bg-white px-2 py-1.5 ${ring}`}
                style={{ left: `${c.x - COL_W * 0.44}%`, width: `${COL_W * 0.88}%`, top: c.y - 44, minHeight: 88 }}>
                <div className="flex items-center gap-1.5">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${badge}`}>
                    {st === "done" ? "✓" : st === "stopped" ? "!" : s.n}
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-800">{s.title}</span>
                </div>
                <div className="mt-0.5 break-words text-[10px] leading-snug text-slate-600">{s.body}</div>
                {s.guard && <div className="mt-0.5 break-words text-[9.5px] leading-snug text-amber-800">🔒 {s.guard}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 text-[10.5px] text-slate-400">
        The ontology defines each operation but never runs it. Snowflake RBAC decides who may approve and post, and the
        procedures each contract names are the only path that writes.
      </div>
    </div>
  );
}
