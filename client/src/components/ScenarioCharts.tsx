import { money } from "../lib/severity";

/**
 * Bullet chart: current value against a normal band and a target marker.
 *
 * Used instead of a gauge or donut deliberately. The Ventagium guidance is
 * explicit that radial encodings distort magnitude — angle is read less
 * accurately than length — and capacity headroom is exactly the kind of number
 * that must not be misread. A horizontal bar against a reference band is read
 * correctly at a glance and takes a fifth of the space.
 */
export function Bullet({
  label, value, max, band, target, format = (n: number) => String(Math.round(n)),
  danger, height = 22,
}: {
  label: string;
  value: number;
  max: number;
  /** Shaded reference range, e.g. normal operating utilisation. */
  band?: [number, number];
  /** Vertical marker, e.g. the 100% capacity line. */
  target?: number;
  format?: (n: number) => string;
  /** Show the bar in red above this value. */
  danger?: number;
  height?: number;
}) {
  const w = (n: number) => `${Math.max(0, Math.min(100, (n / (max || 1)) * 100))}%`;
  const over = danger != null && value >= danger;
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-600">{label}</span>
        <span className={`font-semibold ${over ? "text-rose-600" : "text-slate-800"}`}>
          {format(value)}
        </span>
      </div>
      <div className="relative mt-1 rounded bg-slate-100" style={{ height }}>
        {band && (
          <div className="absolute inset-y-0 rounded bg-slate-200"
               style={{ left: w(band[0]), width: `calc(${w(band[1])} - ${w(band[0])})` }} />
        )}
        <div className={`absolute inset-y-[5px] left-0 rounded ${over ? "bg-rose-500" : "bg-sky-500"}`}
             style={{ width: w(value) }} />
        {target != null && (
          <div className="absolute inset-y-0 w-[2px] bg-slate-800" style={{ left: w(target) }} />
        )}
      </div>
    </div>
  );
}

/**
 * Staged pipeline of everything the scenario touched.
 *
 * The stages are chosen so each one implies a different response, which is the
 * point of the pattern: "buffered" needs watching, "unmitigable" needs a phone
 * call. Bucketing by status rather than by size stops the big-dollar items from
 * crowding out the ones that are actually undefendable.
 */
export interface StageItem {
  key: string;
  title: string;
  subtitle?: string;
  value: number;
  tone?: "bad" | "warn" | "ok" | "info";
}

const TONE: Record<string, string> = {
  bad: "border-rose-200 bg-rose-50",
  warn: "border-amber-200 bg-amber-50",
  ok: "border-emerald-200 bg-emerald-50",
  info: "border-sky-200 bg-sky-50",
};

export function ActionCenter({ stages }: {
  stages: { name: string; hint: string; items: StageItem[] }[];
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}>
      {stages.map((s) => {
        const total = s.items.reduce((a, b) => a + b.value, 0);
        return (
          <div key={s.name} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {s.name}
              </span>
              <span className="text-xs text-slate-400">{s.items.length}</span>
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-slate-400">{s.hint}</div>
            {total > 0 && (
              <div className="mt-1 text-sm font-bold text-slate-800">{money(total)}</div>
            )}
            <div className="mt-2 space-y-1.5">
              {s.items.length === 0 && (
                <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-center
                                text-[11px] text-slate-400">
                  nothing here
                </div>
              )}
              {[...s.items].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((it) => (
                <div key={it.key}
                     className={`rounded border px-2 py-1.5 ${TONE[it.tone ?? "info"]}`}>
                  <div className="text-[11px] font-medium leading-tight text-slate-800">
                    {it.title}
                  </div>
                  {it.subtitle && (
                    <div className="text-[10px] leading-tight text-slate-500">{it.subtitle}</div>
                  )}
                  {it.value > 0 && (
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-700">
                      {money(it.value)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Before/after flow comparison, in the spirit of a Sankey but simplified.
 *
 * A true Sankey needs a layered layout solver to place and stack bands without
 * crossings. At this scale a paired bar per flow carries the same message —
 * what was flowing, what survives, what a reroute restores — with none of the
 * layout risk and no new dependency.
 */
export function FlowComparison({ rows }: {
  rows: {
    key: string; label: string; sub?: string;
    baseline: number; disrupted: number; mitigated: number;
  }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.baseline));
  const w = (n: number) => `${Math.max(0.5, (n / max) * 100)}%`;
  return (
    <div className="space-y-2.5">
      {[...rows].sort((a, b) => b.baseline - a.baseline).map((r) => {
        const recovered = Math.max(0, r.mitigated - r.disrupted);
        return (
          <div key={r.key}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-slate-700">{r.label}</span>
              <span className="text-slate-400">{r.sub}</span>
            </div>
            <div className="mt-1 h-5 w-full overflow-hidden rounded bg-slate-100">
              <div className="flex h-full">
                {/* what still flows through the disruption */}
                <div className="h-full bg-slate-400" style={{ width: w(r.disrupted) }}
                     title={`still flowing ${money(r.disrupted)}`} />
                {/* what a reroute puts back */}
                <div className="h-full bg-sky-500" style={{ width: w(recovered) }}
                     title={`recovered by rerouting ${money(recovered)}`} />
                {/* what remains lost */}
                <div className="h-full bg-rose-400"
                     style={{ width: w(Math.max(0, r.baseline - r.mitigated)) }}
                     title={`still lost ${money(Math.max(0, r.baseline - r.mitigated))}`} />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-3 rounded-sm bg-slate-400" /> still flowing
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-3 rounded-sm bg-sky-500" /> recovered by rerouting
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-3 rounded-sm bg-rose-400" /> still lost
        </span>
      </div>
    </div>
  );
}
