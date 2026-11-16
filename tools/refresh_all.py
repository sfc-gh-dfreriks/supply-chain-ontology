#!/usr/bin/env python3
"""One command for the whole refresh cycle.

Everything the app serves comes from Snowflake Business Ontology, the "Supply
Chain" domain. Refreshing means re-reading the domain, rebuilding the two data
sets that are found by walking it, and re-baking the static site. A half-done
refresh publishes stale numbers silently, so the order is enforced and the last
step fails loudly if the served files no longer match the ontology.

  1. export_business_ontology.py  domain           -> data/sc_business_ontology.json
  2. export_ontology_network.py   walk the domain  -> data/sc_network.json
  3. export_ops_thread.py         walk the domain  -> data/sc_ops_thread.json
  4. npm run build -w server                          the baker talks to a built server
  5. server up on a free port
  6. bake_static.py               server           -> client/public/data/*.json
  7. reconcile                    re-walk the domain and compare with steps 2-3

Run:  python3 tools/refresh_all.py
      python3 tools/refresh_all.py --check     reconcile only, change nothing
"""
import argparse
import os
import pathlib
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BAKED = ROOT / "client" / "public" / "data"


def say(msg: str, indent: int = 2) -> None:
    print(" " * indent + msg, flush=True)


def run(cmd: list[str], cwd: pathlib.Path = ROOT, env: dict | None = None) -> None:
    """Run a step, streaming nothing but failing loudly with captured output."""
    r = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})},
                       capture_output=True, text=True)
    if r.returncode != 0:
        say(f"FAILED: {' '.join(cmd)}", 2)
        for line in (r.stdout + r.stderr).strip().splitlines()[-14:]:
            say(line, 6)
        sys.exit(1)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for(url: str, timeout: float = 45.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2):
                return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.6)
    return False


def reconcile() -> int:
    """Re-walk the ontology and compare with the served files; count mismatches."""
    bad = 0
    for tool in ("export_ontology_network.py", "export_ops_thread.py"):
        r = subprocess.run([sys.executable, f"tools/{tool}", "--check"], cwd=ROOT, capture_output=True, text=True)
        line = (r.stdout.strip().splitlines() or ["no output"])[0]
        say(f"{'ok   ' if r.returncode == 0 else 'DRIFT'} {tool}: {line}", 4)
        bad += r.returncode != 0
    for f in ("bo_summary.json", "bo_graph.json", "scenario_network.json", "thread.json"):
        if not (BAKED / f).exists():
            say(f"DRIFT baked {f} absent — bake has not run", 4)
            bad += 1
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="reconcile only, change nothing")
    args = ap.parse_args()

    if args.check:
        bad = reconcile()
        print()
        say("in sync" if bad == 0 else f"{bad} discrepancy(ies) — run without --check")
        return 0 if bad == 0 else 1

    say("1/7  exporting the Business Ontology domain")
    run([sys.executable, "tools/export_business_ontology.py"])
    run([sys.executable, "tools/export_agent_search.py"])  # before/after agent runs, saved snapshot
    say("2/7  building the scenario network through the ontology")
    run([sys.executable, "tools/export_ontology_network.py"])
    say("3/7  building the digital thread through the ontology")
    run([sys.executable, "tools/export_ops_thread.py"])

    say("4/7  building server")
    run(["npm", "run", "build", "-w", "server"])

    port = free_port()
    say(f"5/7  starting server on :{port}")
    srv = subprocess.Popen(["node", "dist/index.js"], cwd=ROOT / "server",
                           env={**os.environ, "PORT": str(port)},
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not wait_for(f"http://localhost:{port}/api/bo/summary"):
            say("server did not come up — aborting before baking stale data")
            return 1
        say("6/7  baking static snapshots")
        run([sys.executable, "tools/bake_static.py"],
            env={"BAKE_HOST": f"http://localhost:{port}"})
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=10)
        except subprocess.TimeoutExpired:
            srv.kill()

    say("7/7  reconciling")
    bad = reconcile()
    print()
    if bad:
        say(f"refresh completed but {bad} discrepancy(ies) remain — do not publish")
        return 1
    say("refresh complete and reconciled")
    say("next: git add -A && git commit && git push", 4)
    return 0


if __name__ == "__main__":
    sys.exit(main())
