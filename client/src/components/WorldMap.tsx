import { useEffect, useMemo, useRef, useState } from "react";
import {
  edgeWidth, hopColor, money, severityColor, TYPE_COLOR,
} from "../lib/severity";
import type { AffectedFlow, ImpairedNode, Reroute, ScFlow, ScNode } from "../lib/api";

/**
 * Geographic view of the network and a disruption's ripple.
 *
 * Hand-rolled SVG rather than a mapping library: 19 pins and 27 arcs over a
 * static 68 KB land outline does not justify a tile layer, a projection library
 * or a WebGL context, and hand-rolling keeps the arc geometry and the camera
 * under our control.
 *
 * Flows are quadratic Bezier arcs with the control point pushed perpendicular to
 * the chord. Straight lines between 19 nodes overlap badly — San Jose sits on
 * three near-collinear lanes — and the offset separates them without changing
 * which endpoints they connect.
 */

export interface MapProps {
  nodes: ScNode[];
  flows: ScFlow[];
  affected?: Map<string, AffectedFlow>;
  impaired?: Map<string, ImpairedNode>;
  reroutes?: Reroute[];
  /** Hops revealed so far; undefined means show everything. */
  revealHop?: number;
  /** Flow ids to spotlight. Everything else drops back. */
  highlightFlows?: Set<string>;
  /** Node ids the camera should frame. Empty or undefined means the whole world. */
  focusNodes?: string[];
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  height?: number;
  /** Before/after mode: lanes being replaced turn red, replacement lanes green. */
  contrast?: boolean;
}

const OLD_LANE = "#ef4444";
const NEW_LANE = "#22c55e";

const W = 1000;
const H = 500;
/** Trim the poles: nothing here is above 60N and the empty band wastes half the frame. */
const LAT_TOP = 78;
const LAT_BOTTOM = -58;

const FULL: Box = { x: 0, y: 0, w: W, h: H };
/** Never zoom tighter than this, or a single node fills the screen with no context. */
const MIN_SPAN = 190;
const CAMERA_MS = 780;

interface Box { x: number; y: number; w: number; h: number }

/** Equirectangular. Adequate at world scale and trivially invertible. */
function project(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * W, ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H];
}

function arcPath(x1: number, y1: number, x2: number, y2: number, lift = 0.22): string {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const k = len * lift;
  return `M${x1},${y1} Q${mx + nx * k},${my + ny * k} ${x2},${y2}`;
}

/**
 * Frame a set of nodes: bounding box, padded, forced to the panel's aspect ratio,
 * floored at MIN_SPAN and clamped inside the world so the camera never shows void.
 */
function frame(pts: [number, number][]): Box {
  if (!pts.length) return FULL;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);

  const pad = Math.max(60, Math.max(maxX - minX, maxY - minY) * 0.35);
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;

  let w = Math.max(maxX - minX, MIN_SPAN);
  let h = w / (W / H);                       // keep the panel's 2:1 ratio
  if (maxY - minY > h) { h = maxY - minY; w = h * (W / H); }

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  w = Math.min(w, W); h = Math.min(h, H);
  const x = Math.max(0, Math.min(W - w, cx - w / 2));
  const y = Math.max(0, Math.min(H - h, cy - h / 2));
  return { x, y, w, h };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function WorldMap({
  nodes, flows, affected, impaired, reroutes,
  revealHop, highlightFlows, focusNodes, selected, onSelect, height = 460, contrast,
}: MapProps) {
  const [land, setLand] = useState<number[][][][] | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [box, setBox] = useState<Box>(FULL);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let dead = false;
    fetch(`${import.meta.env.BASE_URL}land.geo.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => { if (!dead && g) setLand(g.features?.[0]?.geometry?.coordinates ?? null); })
      .catch(() => { /* the graticule alone is an acceptable fallback */ });
    return () => { dead = true; };
  }, []);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.node_id, n])), [nodes]);

  /** Animate the camera toward the requested frame. */
  const target = useMemo(() => {
    if (!focusNodes?.length) return FULL;
    const pts = focusNodes
      .map((id) => nodeById.get(id))
      .filter(Boolean)
      .map((n) => project(n!.longitude, n!.latitude)) as [number, number][];
    return frame(pts);
  }, [focusNodes, nodeById]);

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const from = box;
    const to = target;
    // A jump of a few pixels is not worth a transition; it reads as a flicker.
    if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) +
        Math.abs(from.w - to.w) + Math.abs(from.h - to.h) < 2) return;

    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / CAMERA_MS);
      const k = ease(t);
      setBox({
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        w: from.w + (to.w - from.w) * k,
        h: from.h + (to.h - from.h) * k,
      });
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  /**
   * Zoom factor. Everything drawn in viewBox units grows as the box shrinks, so
   * radii, strokes and text are divided by this to hold their on-screen size.
   */
  const k = box.w / W;

  const maxVol = useMemo(() => Math.max(1, ...flows.map((f) => f.monthly_volume)), [flows]);
  const show = (hop: number) => revealHop === undefined || hop <= revealHop;
  const spotlight = highlightFlows && highlightFlows.size > 0;

  const landPath = useMemo(() => {
    if (!land) return "";
    const parts: string[] = [];
    for (const poly of land) {
      for (const ring of poly) {
        if (ring.length < 4) continue;
        const pts = ring.map(([lon, lat]) => project(lon, lat));
        parts.push("M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z");
      }
    }
    return parts.join(" ");
  }, [land]);

  const replaced = useMemo(() => new Set((reroutes ?? []).map((r) => r.flow_id)), [reroutes]);

  const rerouteArcs = useMemo(() => {
    if (!reroutes?.length) return [];
    const byName = new Map(nodes.map((n) => [n.node_name, n]));
    return reroutes.map((r) => {
      const from = byName.get(r.toPlant), to = byName.get(r.customer);
      if (!from || !to) return null;
      const [x1, y1] = project(from.longitude, from.latitude);
      const [x2, y2] = project(to.longitude, to.latitude);
      return { r, d: arcPath(x1, y1, x2, y2, -0.3) };
    }).filter(Boolean) as { r: Reroute; d: string }[];
  }, [reroutes, nodes]);

  const tip = (e: React.MouseEvent, lines: string[]) => {
    const b = wrapRef.current?.getBoundingClientRect();
    setHover({ x: e.clientX - (b?.left ?? 0), y: e.clientY - (b?.top ?? 0), lines });
  };

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
           style={{ width: "100%", height }} className="rounded-lg bg-slate-900">
        <g stroke="#1e293b" strokeWidth={0.6 * k}>
          {[-40, -20, 0, 20, 40, 60].map((lat) => {
            const [, y] = project(0, lat);
            return <line key={lat} x1={0} y1={y} x2={W} y2={y} />;
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const [x] = project(lon, 0);
            return <line key={lon} x1={x} y1={0} x2={x} y2={H} />;
          })}
        </g>

        {landPath && <path d={landPath} fill="#243244" stroke="#31445c" strokeWidth={0.5 * k} />}

        {/* baseline flows */}
        <g fill="none">
          {flows.map((f) => {
            const old = contrast && replaced.has(f.flow_id);
            const a = affected?.get(f.flow_id);
            const visible = !a || show(a.hop);
            const hit = !!(a && visible);
            const lit = !spotlight || highlightFlows!.has(f.flow_id);
            const [x1, y1] = project(f.source_lon, f.source_lat);
            const [x2, y2] = project(f.target_lon, f.target_lat);
            const w = edgeWidth(f.monthly_volume, maxVol, 0.8, 5) * k;
            return (
              <path key={f.flow_id} d={arcPath(x1, y1, x2, y2)}
                stroke={old ? OLD_LANE : hit ? severityColor(a!.impactFactor) : "#475569"}
                strokeWidth={old ? Math.max(w * 1.6, 2.2 * k) : hit ? (lit ? w * 1.9 : w) : w}
                strokeOpacity={old ? 0.9 : hit ? (lit ? 1 : 0.22) : spotlight ? 0.12 : 0.34}
                style={{ transition: "stroke-opacity 300ms, stroke-width 300ms" }}
                onMouseEnter={(e) => tip(e, [
                  `${f.source_name} → ${f.target_name}`,
                  `${f.material_category} · ${f.monthly_volume} units/mo · ${money(f.monthly_value)}/mo`,
                  ...(old ? ["OLD LANE · replaced by the green reroute"] : []),
                  ...(hit ? [`${Math.round(a!.impactFactor * 100)}% lost · ${money(a!.valueAtRisk)} at risk · hop ${a!.hop}`] : []),
                ])}
                onMouseLeave={() => setHover(null)} />
            );
          })}
        </g>

        {/* reroute overlay — dashed, so a proposal cannot read as an existing lane */}
        <g fill="none">
          {rerouteArcs.map(({ r, d }) => (
            <path key={`rr-${r.flow_id}`} d={d} stroke={contrast ? NEW_LANE : "#38bdf8"}
              strokeWidth={(contrast ? 2.8 : 2.4) * k}
              strokeDasharray={`${7 * k} ${5 * k}`} strokeOpacity={spotlight ? 0.35 : 0.95}
              onMouseEnter={(e) => tip(e, [
                `REROUTE · ${r.material_category}`,
                `${r.toPlant} → ${r.customer} (was ${r.fromPlant})`,
                `${r.unitsMoved} units/mo · ${r.hrsRequired}h · protects ${money(r.valueProtected)}`,
              ])}
              onMouseLeave={() => setHover(null)} />
          ))}
        </g>

        {/* nodes */}
        <g>
          {nodes.map((n) => {
            const imp = impaired?.get(n.node_id);
            const visible = !imp || show(imp.hop);
            const [x, y] = project(n.longitude, n.latitude);
            const isPlant = n.node_type === "Plant";
            const r = (isPlant ? 9 : 6.5) * k;
            const sev = imp && visible ? imp.impairment : 0;
            const isSel = selected === n.node_id;
            const inFocus = !focusNodes?.length || focusNodes.includes(n.node_id);
            return (
              <g key={n.node_id} style={{ cursor: "pointer", opacity: inFocus ? 1 : 0.45,
                                          transition: "opacity 300ms" }}
                 onClick={() => onSelect?.(isSel ? null : n.node_id)}
                 onMouseEnter={(e) => tip(e, [
                   `${n.node_name} · ${n.node_type}`,
                   `${n.city}, ${n.country}`,
                   ...(imp && visible ? [
                     `${Math.round(imp.impairment * 100)}% impaired · hop ${imp.hop}`,
                     imp.bufferDays != null
                       ? `${imp.bufferDays}d buffer · exposed ${imp.daysExposed}d` : "",
                     imp.causedBy ? `via ${imp.causedBy}` : "",
                   ].filter(Boolean) : []),
                 ])}
                 onMouseLeave={() => setHover(null)}>
                {imp && visible && (
                  <circle cx={x} cy={y} r={r + (7 + imp.hop * 3) * k}
                    fill="none" stroke={hopColor(imp.hop)} strokeWidth={1.6 * k}
                    strokeOpacity={0.55} />
                )}
                {isSel && (
                  <circle cx={x} cy={y} r={r + 13 * k} fill="none" stroke="#e2e8f0"
                          strokeWidth={1.2 * k} strokeDasharray={`${3 * k} ${3 * k}`} />
                )}
                {isPlant ? (
                  <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2 * k}
                    fill={sev > 0 ? severityColor(sev) : TYPE_COLOR.Plant}
                    stroke="#e2e8f0" strokeWidth={1.3 * k} />
                ) : (
                  <circle cx={x} cy={y} r={r}
                    fill={sev > 0 ? severityColor(sev) : TYPE_COLOR[n.node_type]}
                    stroke="#e2e8f0" strokeWidth={1.2 * k} />
                )}
                <text x={x} y={y - r - 5 * k} textAnchor="middle"
                      fontSize={9.5 * k} fill="#cbd5e1" style={{ pointerEvents: "none" }}>
                  {n.node_name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5" style={{ background: TYPE_COLOR.Plant }} /> plant
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR.Supplier }} /> supplier
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR.Customer }} /> customer
        </span>
        <span className="flex items-center gap-1">
          <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#38bdf8" strokeWidth="2.4" strokeDasharray="7 5" /></svg>
          {contrast ? "new lane (reroute)" : "reroute"}
        </span>
        {contrast && (
          <span className="flex items-center gap-1">
            <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={OLD_LANE} strokeWidth="3" /></svg>
            old lane (replaced)
          </span>
        )}
        <span>thickness = volume · colour = share lost</span>
        {k < 0.99 && (
          <span className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
            zoomed {(1 / k).toFixed(1)}×
          </span>
        )}
      </div>

      {hover && (
        <div className="pointer-events-none absolute z-20 max-w-xs rounded bg-slate-900/95 px-2.5 py-1.5
                        text-[11px] leading-snug text-slate-100 shadow-lg ring-1 ring-white/10"
             style={{ left: Math.min(hover.x + 12, 620), top: hover.y + 12 }}>
          {hover.lines.map((l, i) => (
            <div key={i} className={i === 0 ? "font-semibold" : "text-slate-300"}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
