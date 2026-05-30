#!/usr/bin/env python3
"""W244 wave 79 — bench history snapshot collector.

Walks `git log` over `W244_BENCHMARK_DOSSIER.json` history and emits
`reports/acceptance/W244_BENCHMARK_HISTORY.json` — per-commit snapshot
sa mean_ns za svaki bench. Daje vremensku seriju za regression analysis
bez potrebe za eksternom telemetry infrastructure.

Output structure:
  {
    "schema": "w244-benchmark-history/v1",
    "merkle_root_sha256": "...",
    "snapshots": [
      { "commit": "abc1234", "timestamp": "...",
        "records": {"group/bench": mean_ns, ...}, ... },
      ...
    ]
  }

Deterministic — manifest Merkle invariant na zadati git rev range.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BENCH_REL = "reports/acceptance/W244_BENCHMARK_DOSSIER.json"
OUT = REPO / "reports" / "acceptance" / "W244_BENCHMARK_HISTORY.json"

# Cap history at 50 commits (avoids unbounded growth).
MAX_SNAPSHOTS = 50


def _git_log_commits() -> list[str]:
    """Return up to MAX_SNAPSHOTS commit SHAs that touched the bench file."""
    r = subprocess.run(
        ["git", "log",
         f"--max-count={MAX_SNAPSHOTS}",
         "--format=%H", "--", BENCH_REL],
        capture_output=True, text=True, cwd=str(REPO), check=True,
    )
    return [c for c in r.stdout.strip().split("\n") if c]


def _read_at_rev(rev: str) -> dict | None:
    """Read bench dossier content at a git revision; None if not present."""
    try:
        r = subprocess.run(
            ["git", "show", f"{rev}:{BENCH_REL}"],
            capture_output=True, text=True, cwd=str(REPO), check=True,
        )
        return json.loads(r.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def _commit_meta(rev: str) -> tuple[str, str]:
    """Return (short_sha, ISO-UTC timestamp) for a commit."""
    r = subprocess.run(
        ["git", "show", "-s", "--format=%h|%aI", rev],
        capture_output=True, text=True, cwd=str(REPO), check=True,
    )
    return tuple(r.stdout.strip().split("|", 1))  # type: ignore[return-value]


def main() -> int:
    commits = _git_log_commits()
    if not commits:
        print("[bench-history] no commits touched the bench dossier")
        return 0

    snapshots = []
    for rev in commits:
        d = _read_at_rev(rev)
        if d is None:
            continue
        short_sha, ts = _commit_meta(rev)
        records = {}
        for r in d.get("records", []):
            key = f"{r['group']}/{r['bench']}"
            records[key] = float(r["mean_ns"])
        if not records:
            continue
        snapshots.append({
            "commit": short_sha,
            "timestamp": ts,
            "bench_count": len(records),
            "merkle_root_sha256": d.get("merkle_root_sha256", ""),
            "mean_across_all": (
                sum(records.values()) / len(records) if records else 0.0
            ),
            "records": records,
        })

    # Merkle = sha256 over canonical "commit|bench|mean_ns\n" leaf stream
    leaf_lines = []
    for snap in snapshots:
        for bench in sorted(snap["records"]):
            leaf_lines.append(
                f"{snap['commit']}|{bench}|{snap['records'][bench]!r}\n"
            )
    merkle = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artefakt = {
        "schema": "w244-benchmark-history/v1",
        "merkle_root_sha256": merkle,
        "snapshot_count": len(snapshots),
        "earliest_commit": snapshots[-1]["commit"] if snapshots else None,
        "latest_commit": snapshots[0]["commit"] if snapshots else None,
        "snapshots": snapshots,
        "verification": (
            "Re-run `python3 tools/build_bench_history.py` from the same "
            "git HEAD. Merkle must be byte-identical (commits + means u "
            "git history are immutable)."
        ),
    }
    OUT.write_text(
        json.dumps(artefakt, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(f"[bench-history] wrote {OUT.relative_to(REPO)}")
    print(f"  snapshots:    {len(snapshots)}")
    if snapshots:
        print(f"  earliest:     {snapshots[-1]['commit']} "
              f"({snapshots[-1]['timestamp']})")
        print(f"  latest:       {snapshots[0]['commit']} "
              f"({snapshots[0]['timestamp']})")
    print(f"  merkle:       {merkle}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
