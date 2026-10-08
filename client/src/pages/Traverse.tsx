import { useMemo, useState } from "react";
import { GraphCanvas } from "../components/GraphCanvas";
import { useQuery } from "../hooks/useQuery";
import { STATIC, api, type PathResult, type TraverseResult } from "../lib/api";
import { AskCortex } from "../components/AskCortex";

const ROLE_COLOR: Record<string, string> = {
  fact: "#29B5E8", dimension: "#7D44CF", text: "#10b981",
  hierarchy: "#f59e0b", value_help: "#ec4899", other: "#94a3b8",
};

/** Depth ring colours: the seed reads darkest, outer rings fade out. */
const DEPTH_COLOR = ["#1B3A57", "#29B5E8", "#7DD3F0", "#BAE6FD", "#E0F2FE"];

function toElements(r: TraverseResult) {
  const nodes = r.nodes.map((n) => ({
    data: {
      id: n.id, label: n.label, kind: "entity",
      color: DEPTH_COLOR[Math.min(n.depth, DEPTH_COLOR.length - 1)],
      size: n.depth === 0 ? 58 : Math.max(26, 44 - n.depth * 6),
      title: `${n.label} · ${n.productLabel} · ${n.role} · ${n.elements} elements`,
    },
  }));
  const edges = r.edges.map((e, i) => ({
    data: {
      id: `e${i}`, source: e.source, target: e.target,
      kind: e.crossProduct ? "cross" : "assoc",
      color: e.crossProduct ? "#f59e0b" : "#cbd5e1",
    },
  }));
  return [...nodes, ...edges];
}

export default function Traverse() {
  const [seed, setSeed] = useState<string>("");
  const [depth, setDepth] = useState(2);
  const [limit, setLimit] = useState(60);
  const [target, setTarget] = useState<string>("");
  const [pathRes, setPathRes] = useState<PathResult | null>(null);
  const [pathErr, setPathErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const hubs = useQuery(() => api.hubs(30), []);
  const topo = useQuery(() => api.topology(), []);
  const ents = useQuery(() => api.entities(filter, 300), [filter]);

  // Seed defaults to the highest-degree entity: an arbitrary pick in a
  // 338-node graph usually lands on a leaf with a single association.
  const effSeed = seed || hubs.data?.[0]?.id || "";
  const trav = useQuery<TraverseResult | null>(
    () => (effSeed ? api.traverse(effSeed, depth, limit) : Promise.resolve(null)),
    [effSeed, depth, limit],
  );

  const elements = useMemo(
    () => (trav.data ? toElements(trav.data) : []), [trav.data]);

  const runPath = async () => {
    setPathErr(null); setPathRes(null);
    if (!effSeed || !target) { setPathErr("pick both a start and an end entity"); return; }
    try { setPathRes(await api.path(effSeed, target)); }
    catch (e: any) { setPathErr(String(e.message || e)); }
  };

  const seedNode = trav.data?.nodes.find((n) => n.depth === 0);
  const byDepth = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of trav.data?.nodes ?? []) m.set(n.depth, (m.get(n.depth) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [trav.data]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-xs text-slate-500">
            Start entity
            <input value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="filter entities…"
              className="mt-1 w-56 rounded border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            &nbsp;
            <select value={effSeed} onChange={(e) => { setSeed(e.target.value); setPathRes(null); }}
              className="mt-1 w-80 rounded border border-gray-300 px-2 py-1 text-sm">
              {(ents.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.label} — {e.productLabel}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Depth {depth}
            <input type="range" min={1} max={4} value={depth}
              onChange={(e) => setDepth(Number(e.target.value))} className="mt-2 w-28" />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Max nodes {limit}
            <input type="range" min={10} max={200} step={10} value={limit}
              onChange={(e) => setLimit(Number(e.target.value))} className="mt-2 w-32" />
          </label>
        </div>

        {STATIC ? (
          <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-slate-500">
            Shortest-path search needs the live API — the public snapshot ships expansion
            from the {24} most-connected entities only.
          </div>
        ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
          <label className="flex flex-col text-xs text-slate-500">
            Shortest path to
            <select value={target} onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-80 rounded border border-gray-300 px-2 py-1 text-sm">
              <option value="">— pick an end entity —</option>
              {(ents.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.label} — {e.productLabel}</option>
              ))}
            </select>
          </label>
          <button onClick={runPath}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
            Find path
          </button>
          {pathErr && <span className="text-xs text-rose-500">{pathErr}</span>}
          {pathRes && pathRes.hops === null && (
            <span className="text-xs text-amber-600">{pathRes.reason}</span>
          )}
          {pathRes && pathRes.hops !== null && (
            <span className="text-xs text-slate-600">
              <b>{pathRes.hops}</b> hop{pathRes.hops === 1 ? "" : "s"}
              {pathRes.crossesProducts != null &&
                <> across <b>{pathRes.crossesProducts}</b> data product
                   {pathRes.crossesProducts === 1 ? "" : "s"}</>}
            </span>
          )}
        </div>
        )}
      </div>

      {pathRes && pathRes.hops !== null && pathRes.path.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-800">
            Association path
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pathRes.path.map((n, i) => (
              <span key={n.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-sky-400">→</span>}
                <span className="rounded bg-white px-2 py-1 text-xs shadow-sm">
                  <b className="text-slate-800">{n.label}</b>
                  <span className="ml-1 text-slate-400">{n.productLabel}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}


      {topo.data && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
          <span className="font-semibold">How this graph is shaped.</span>{" "}
          All {topo.data.entities.totalEdges} entity associations stay inside their own data
          product — {topo.data.entities.crossProductEdges} cross a product boundary — so a path
          never leaves the product it starts in. The {topo.data.entities.connected} connected
          entities form {topo.data.entities.components} separate components, the largest
          holding {topo.data.entities.largestComponent}; {topo.data.entities.isolated} entities
          declare no associations at all.
          {topo.data.products.canonicalObjects.length > 0 && (
            <> Cross-product linkage sits one level up, in the ODM overlay:{" "}
              {topo.data.products.inOdmGraph} of {topo.data.products.total} products connect
              through{" "}
              {topo.data.products.canonicalObjects.map((c) => c.canonical).join(", ")}, a star
              centred on <b>{topo.data.products.hubs[0]?.label}</b> (degree{" "}
              {topo.data.products.hubs[0]?.degree}).</>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3 rounded-lg border border-gray-200 bg-white p-2">
          {trav.loading && <div className="p-6 text-sm text-slate-400">traversing…</div>}
          {trav.error && <div className="p-6 text-sm text-rose-500">{trav.error}</div>}
          {trav.data && <GraphCanvas elements={elements} height={620} />}
        </div>

        <div className="space-y-4">
          {seedNode && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-slate-400">Seed</div>
                <AskCortex compact topic="neighbourhood" args={{ start: effSeed, depth: String(depth) }} label="What does this mean?" />
              </div>
              <div className="mt-1 font-semibold text-slate-800">{seedNode.label}</div>
              <div className="text-xs text-slate-500">{seedNode.productLabel}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded px-1.5 py-0.5 text-[11px] text-white"
                  style={{ background: ROLE_COLOR[seedNode.role] ?? "#94a3b8" }}>
                  {seedNode.role}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                  {seedNode.elements} elements
                </span>
              </div>
            </div>
          )}

          {trav.data && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Reach</div>
              <div className="mt-2 space-y-1 text-sm">
                {byDepth.map(([d, n]) => (
                  <div key={d} className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full"
                      style={{ background: DEPTH_COLOR[Math.min(d, DEPTH_COLOR.length - 1)] }} />
                    <span className="text-slate-500">{d === 0 ? "seed" : `${d} hop${d > 1 ? "s" : ""}`}</span>
                    <span className="ml-auto font-medium text-slate-800">{n}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-xs text-slate-500">
                  <span>connected component</span>
                  <span className="font-medium text-slate-700">{trav.data.reachable}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>edges shown</span>
                  <span className="font-medium text-slate-700">{trav.data.edges.length}</span>
                </div>
              </div>
              {trav.data.truncated && (
                <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                  truncated at {limit} nodes — raise Max nodes to see the full ring
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Most connected entities
            </div>
            <div className="mt-2 space-y-1">
              {(hubs.data ?? []).slice(0, 12).map((h) => (
                <button key={h.id} onClick={() => { setSeed(h.id); setPathRes(null); }}
                  className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-50
                              ${h.id === effSeed ? "bg-sky-50" : ""}`}>
                  <span className="truncate text-slate-700">{h.label}</span>
                  <span className="ml-auto rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">
                    {h.degree}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
