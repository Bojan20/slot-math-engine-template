"""tools.agent_corpus.antibodies — match an incoming math-debug symptom
against an antibody DB so the Math Debug Specialist can surface
"this exact bug class is already codified" as the first recommendation.

An antibody DB is any SQLite file with an `antibodies` table of the shape:

    (id, pattern, severity, recommended_fix, family, created_at, last_seen)

This module is **provider-agnostic** — the DB can come from a local
corpus, a published bug-class catalogue, or an external orchestration
host. The default path is resolved in this order:

    1. `--db PATH`             — explicit CLI flag (highest priority)
    2. `$SLOT_MATH_ANTIBODY_DB` — environment override
    3. `${SLOT_MATH_HOME:-.}/data/antibodies.db` — in-repo default

If the resolved DB doesn't exist, every lookup returns an empty list
silently so the eval harness still passes on a fresh machine.

CLI:
    python -m tools.agent_corpus.antibodies "wild prefix max double count"
    python -m tools.agent_corpus.antibodies --severity HIGH "rtp drift"
    SLOT_MATH_ANTIBODY_DB=/path/to/custom.db \
        python -m tools.agent_corpus.antibodies "..."
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


def _resolve_default_db() -> Path:
    """Resolve the antibody DB path from environment with sensible defaults.

    Highest-priority: `SLOT_MATH_ANTIBODY_DB`. Falls back to
    `${SLOT_MATH_HOME:-.}/data/antibodies.db`. Returns a Path regardless
    of whether the file exists — caller treats missing as empty.
    """
    env = os.environ.get("SLOT_MATH_ANTIBODY_DB")
    if env:
        return Path(env).expanduser()
    home = Path(os.environ.get("SLOT_MATH_HOME") or ".")
    return home / "data" / "antibodies.db"


DEFAULT_DB = _resolve_default_db()

SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")


def _tokens(text: str) -> List[str]:
    return [t.lower() for t in re.findall(r"[A-Za-z0-9_]+", text or "")]


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return cur.fetchone() is not None


def _columns(conn: sqlite3.Connection, table: str) -> List[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]


def query(
    symptom: str,
    severity_min: str = "MEDIUM",
    db_path: Optional[Path] = None,
    limit: int = 8,
) -> List[Dict[str, Any]]:
    """Score every antibody pattern against the symptom by jaccard
    overlap of tokens. Return rows with severity ≥ severity_min,
    sorted by score desc.

    Returns [] silently if the DB or table is missing.
    """
    db_path = db_path or DEFAULT_DB
    if not db_path.exists():
        return []
    sev_min_idx = SEVERITIES.index(severity_min.upper()) if severity_min.upper() in SEVERITIES else 1

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return []
    try:
        if not _table_exists(conn, "antibodies"):
            return []
        cols = _columns(conn, "antibodies")
        select_cols = [c for c in ("id", "pattern", "severity", "recommended_fix", "family", "last_seen") if c in cols]
        select_sql = ", ".join(select_cols) if select_cols else "*"
        cur = conn.execute(f"SELECT {select_sql} FROM antibodies")
        rows: List[Dict[str, Any]] = [
            dict(zip(select_cols if select_cols else [d[0] for d in cur.description], r))
            for r in cur.fetchall()
        ]
    finally:
        conn.close()

    q_toks = set(_tokens(symptom))
    if not q_toks:
        return []

    scored: List[Dict[str, Any]] = []
    for row in rows:
        sev = (row.get("severity") or "MEDIUM").upper()
        if sev not in SEVERITIES:
            continue
        if SEVERITIES.index(sev) > sev_min_idx:
            continue
        p_toks = set(_tokens(row.get("pattern") or ""))
        if not p_toks:
            continue
        inter = q_toks & p_toks
        if not inter:
            continue
        union = q_toks | p_toks
        score = len(inter) / max(1, len(union))
        scored.append({
            "id": row.get("id"),
            "pattern": row.get("pattern"),
            "severity": sev,
            "score": round(score, 4),
            "matched_tokens": sorted(inter),
            "recommended_fix": row.get("recommended_fix"),
            "family": row.get("family"),
            "last_seen": row.get("last_seen"),
        })

    scored.sort(key=lambda r: (-r["score"], SEVERITIES.index(r["severity"])))
    return scored[:limit]


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Query CORTEX antibody DB for math-debug symptom matches.")
    p.add_argument("symptom", help="Free-form failure description.")
    p.add_argument("--severity", default="MEDIUM", help=f"Minimum severity (one of {SEVERITIES}). Default MEDIUM.")
    p.add_argument("--db", default=str(DEFAULT_DB))
    p.add_argument("--limit", type=int, default=8)
    args = p.parse_args(argv)

    hits = query(args.symptom, severity_min=args.severity, db_path=Path(args.db), limit=args.limit)
    print(json.dumps({"symptom": args.symptom, "hits": hits, "count": len(hits)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
