#!/usr/bin/env python3
"""Snapshot the live API into client/public/data for the public static build.

The GitHub Pages build has no server and no Snowflake credentials, so every view
it can show has to be baked ahead of time. This walks the endpoints the client
calls and writes one JSON file per call, using the same filename rule the client
applies in static mode:

    /products                -> products.json
    /graph?processes=D2O     -> graph__processes=D2O.json

Anything not baked here will surface in the UI as "not in this snapshot" rather
than a blank page, so the set below is the contract for what the public build
can do.

Run the app first (npm run dev), then:  python3 tools/bake_static.py
"""
import json
import pathlib
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# Overridable so the baker can point at a dev server on another port without
# editing this file: BAKE_HOST=http://localhost:3011 python3 tools/bake_static.py
HOST = os.environ.get("BAKE_HOST", "http://localhost:3009")
OUT = pathlib.Path(__file__).resolve().parent.parent / "client" / "public" / "data"

# Traversal is baked per seed, so the public build offers expansion from the
# most-connected entities only. Shortest path is not baked: it is O(n^2) pairs
# and the client disables the control in static mode.
HUB_COUNT = 24
TRAVERSE_DEPTHS = (1, 2, 3)


def fetch(path: str):
    with urllib.request.urlopen(HOST + "/api" + path, timeout=60) as r:
        return json.load(r)


def sim_name(d: dict) -> str:
    """Filename for a baked simulate result.

    Must stay identical to simName() in client/src/lib/api.ts. Built from the
    disruption's own fields rather than a hash so a mismatch is debuggable by
    reading the filename.
    """
    t = "-".join(sorted(d["targets"]))
    key = (f"scenario_sim__{d['kind']}__{t}__"
           f"{int(round(float(d['severity']) * 100))}__{int(d['durationDays'])}")
    return re.sub(r"[^A-Za-z0-9=&._-]", "-", key)


def ask_key(topic: str, args: dict) -> str:
    """Key for a baked Ask Cortex answer. Must stay identical to askKey() in
    client/src/lib/api.ts: sorted args, a disruption keyed by sim_name()."""
    def val(k):
        v = args[k]
        if k == "disruption" and v:
            return sim_name(v)
        return json.dumps(v, separators=(",", ":")) if isinstance(v, (dict, list)) else str(v)
    a = "&".join(f"{k}={val(k)}" for k in sorted(args))
    return f"{topic}?{a}" if a else topic


def name(path: str) -> str:
    """Filename for a snapshot. Must stay identical to snapshotName() in
    client/src/lib/api.ts.

    Percent-escapes are folded to "-" because a literal "%3A" in a filename is
    decoded back to ":" by the web server serving the build, so the browser's
    request would never match the file written here."""
    p, _, q = path.partition("?")
    stem = p.lstrip("/").replace("/", "_")
    if not q:
        return f"{stem}.json"
    safe = re.sub(r"[^A-Za-z0-9=&._-]", "-", q)
    return f"{stem}__{safe}.json"


def bake(path: str, data=None) -> int:
    if data is None:
        data = fetch(path)
    f = OUT / name(path)
    f.write_text(json.dumps(data))
    return f.stat().st_size


def main() -> None:
    try:
        fetch("/health")
    except Exception as e:
        sys.exit(f"server not reachable at {HOST} — start it with `npm run dev`\n  {e}")

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()

    total = 0
    paths = ["/meta", "/products", "/processes", "/coverage", "/scorecard",
             "/correlation", "/insight-apps", "/semantic-roles", "/lenses",
             "/demo", "/topology", "/ask/status", "/ask/examples",
             f"/hubs?limit={HUB_COUNT}", "/hubs?limit=30",
             "/entities?q=&limit=400", "/entities?q=&limit=300", "/graph",
             # the scenario pages need the network and the preset list
             "/scenario/network", "/scenario/presets", "/scenario/reasoning/status",
             # the ontology model page: schema plus one graph per toggle position
             "/ontology/schema",
             "/ontology/class-graph?mode=both",
             "/ontology/class-graph?mode=abstract",
             "/ontology/class-graph?mode=concrete"]

    # one snapshot per ontology class, for the detail panel. Driven off the
    # schema rather than a hardcoded list so a new class is picked up
    # automatically on the next bake.
    classes = []
    try:
        classes = [c["name"] for c in fetch("/ontology/schema")["classes"]]
        paths += [f"/ontology/class/{urllib.parse.quote(n)}" for n in classes]
    except urllib.error.HTTPError as e:
        print(f"  SKIP  ontology class snapshots -> HTTP {e.code}")

    # one graph per process, matching the sidebar's single-process filters
    procs = [p["code"] for p in fetch("/processes")]
    paths += [f"/graph?processes={c}" for c in procs]

    for p in paths:
        try:
            total += bake(p)
            print(f"  baked {name(p)}")
        except urllib.error.HTTPError as e:
            print(f"  SKIP  {name(p)} -> HTTP {e.code}")

    # traversal snapshots from the hub set
    hubs = fetch(f"/hubs?limit={HUB_COUNT}")
    n = 0
    for h in hubs:
        for d in TRAVERSE_DEPTHS:
            q = urllib.parse.urlencode({"seed": h["id"], "depth": d, "limit": 60})
            try:
                total += bake(f"/traverse?{q}")
                n += 1
            except urllib.error.HTTPError as e:
                print(f"  SKIP  traverse {h['label']} d{d} -> HTTP {e.code}")
    print(f"  baked {n} traversal snapshots from {len(hubs)} hubs")

    # Scenario results come from POST /scenario/simulate, which a static site cannot
    # call. Bake one result per preset instead, keyed by a signature of the
    # disruption so the client can look the same key up. Custom slider combinations
    # are therefore unavailable in the public build, and the UI says so rather than
    # failing with a confusing error.
    presets = fetch("/scenario/presets")
    n_sim = 0
    for pr in presets:
        body = {k: pr[k] for k in ("kind", "targets", "severity", "durationDays")}
        body["label"] = pr.get("label", pr["id"])
        req = urllib.request.Request(
            HOST + "/api/scenario/simulate",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            print(f"  SKIP  simulate {pr['id']} -> HTTP {e.code}")
            continue
        f = OUT / f"{sim_name(body)}.json"
        f.write_text(json.dumps(data))
        total += f.stat().st_size
        n_sim += 1
    print(f"  baked {n_sim} scenario result(s) for {len(presets)} preset(s)")

    # Digital thread and operations pulse: the summary, the pulse, and one trace
    # per built serial so every row in the serial picker resolves.
    summary = fetch("/thread")
    total += bake("/thread", summary) + bake("/operations")
    serials = [s["serial_no"] for s in summary["serials"]]
    for sn in serials:
        total += bake(f"/thread/serial/{urllib.parse.quote(sn)}")
    print(f"  baked thread, operations and {len(serials)} serial traces")

    # Ask Cortex answers come from POST /ask-cortex (AI_COMPLETE). Bake the
    # default (no question) answer for each view a reader lands on; follow-up
    # questions need the live app.
    asks = [("pulse", {}), ("thread", {}), ("equipment", {})]
    if serials:
        asks.append(("serial", {"serial": serials[0]}))
    asks += [("lot", {"lot": l["lot_id"]}) for l in summary["lots"]
             if l["inspection_result"] != "Accepted"]
    asks += [("class", {"class": c}) for c in classes]
    for pr in presets:
        d = {k: pr[k] for k in ("kind", "targets", "severity", "durationDays")}
        d["label"] = pr.get("label", pr["id"])
        asks += [(t, {"disruption": d}) for t in ("scenario", "ripple", "mitigation", "optimize")]
    baked, failed = {}, 0

    def one(item):
        topic, args = item
        req = urllib.request.Request(
            HOST + "/api/ask-cortex",
            data=json.dumps({"topic": topic, "args": args}).encode(),
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return ask_key(topic, args), json.load(r)["text"]

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=6) as ex:
        for fut in [ex.submit(one, a) for a in asks]:
            try:
                k, text = fut.result()
                baked[k] = text
            except Exception as e:  # one slow model call should not sink the bake
                failed += 1
                print(f"  SKIP  ask-cortex -> {e}")
    (OUT / "ask_cortex.json").write_text(json.dumps(baked))
    total += (OUT / "ask_cortex.json").stat().st_size
    print(f"  baked {len(baked)} Ask Cortex answer(s), {failed} failed")

    # The scenario AI needs Snowflake, so report it unavailable rather than
    # advertising a model nobody can reach.
    (OUT / "scenario_reasoning_status.json").write_text(json.dumps(
        {"ok": False, "missing": ["public build has no Snowflake connection"]}))
    print("  overrode scenario_reasoning_status.json")

    # ask/status is rewritten so the public build reports Ask as unavailable
    # rather than advertising a semantic view nobody can reach
    (OUT / "ask_status.json").write_text(json.dumps(
        {"ok": False, "missing": ["public build has no Snowflake connection"],
         "semantic_view": ""}))
    print("  overrode ask_status.json for the public build")

    # demo.json carries the semantic view FQN for the on-screen scope note. In a
    # public build Ask is disabled, so naming the object is useless to the reader
    # and publishes an internal database path for no benefit.
    demo = json.loads((OUT / "demo.json").read_text())
    demo["semanticView"] = ""
    (OUT / "demo.json").write_text(json.dumps(demo))
    print("  stripped semanticView from demo.json")

    files = sorted(OUT.glob("*.json"))
    print(f"\n  {len(files)} files, {total / 1048576:.2f} MB total")
    big = sorted(files, key=lambda f: -f.stat().st_size)[:5]
    print("  largest:")
    for f in big:
        print(f"     {f.name:44} {f.stat().st_size / 1024:8.1f} KB")


if __name__ == "__main__":
    main()
