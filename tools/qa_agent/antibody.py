"""tools.qa_agent.antibody — pre-flight gate.

Queries the antibody SQLite DB resolved via `tools.agent_paths.antibody_db_path()`.
Tokenises the input symptom + recent commit subjects, finds any HIGH/CRITICAL
match, and returns a structured verdict.

Contract:
  • DB missing → SKIP (silent PASS). CI-safe on fresh checkouts.
  • Any HIGH/CRITICAL match → BLOCK (caller emits exit-code 4).
  • LOW/MEDIUM matches are surfaced as warnings, not blocks.

The schema we read is the same one used by `tools.agent_corpus.antibodies`:
  (id, pattern, severity, recommended_fix, family, created_at, last_seen).
A DB that lacks the `antibodies` table is treated as missing.
"""
from __future__ import annotations

import re
import sqlite3
import subprocess  # noqa: S404 — read-only `git log` invocation
from pathlib import Path
from typing import Any, Dict, List, Optional

from tools.agent_paths import antibody_db_path

_TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")
_BLOCKING = {"CRITICAL", "HIGH"}
_KNOWN_SEV = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}


def _tokens(text: str) -> List[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text or "") if len(t) >= 3]


def _recent_commit_subjects(repo: Path, n: int = 10) -> List[str]:
    """Best-effort: empty list on any failure (shallow clones, fresh repos)."""
    try:
        out = subprocess.run(  # noqa: S603
            ["git", "log", f"-{n}", "--pretty=%s"],
            cwd=str(repo),
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return []
    if out.returncode != 0:
        return []
    return [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    )
    return cur.fetchone() is not None


def query_db(
    db: Path,
    tokens: List[str],
    *,
    severities: Optional[set] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """Return matched antibodies for the given token set. Empty on absent DB."""
    if not db.exists():
        return []
    sev_filter = severities or _BLOCKING
    out: List[Dict[str, Any]] = []
    try:
        conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return []
    try:
        if not _has_table(conn, "antibodies"):
            return []
        seen: set = set()
        for tok in tokens:
            cur = conn.execute(
                "SELECT id, pattern, severity, recommended_fix, family "
                "FROM antibodies WHERE LOWER(pattern) LIKE ? "
                "AND severity IN ({}) ORDER BY severity DESC LIMIT ?".format(
                    ",".join("?" * len(sev_filter))
                ),
                (f"%{tok}%", *sorted(sev_filter), limit),
            )
            for row in cur.fetchall():
                key = (row[0], row[2])
                if key in seen:
                    continue
                seen.add(key)
                out.append(
                    {
                        "id": row[0],
                        "pattern": row[1],
                        "severity": row[2],
                        "recommended_fix": row[3],
                        "family": row[4],
                    }
                )
        return out
    finally:
        conn.close()


def gate(
    symptom: str = "",
    *,
    scenario_ids: Optional[List[str]] = None,
    repo: Optional[Path] = None,
    db: Optional[Path] = None,
) -> Dict[str, Any]:
    """Run the gate. Returns a structured verdict ready to embed in the report.

    verdict:
      • status   ∈ {PASS, SKIP, BLOCK}
      • blocking ∈ List[antibody]
      • warnings ∈ List[antibody]
      • tokens   — the actual tokens queried (debug aid)
    """
    db = db or antibody_db_path()
    repo_path = repo or Path.cwd()
    pieces: List[str] = [symptom]
    for sid in scenario_ids or []:
        pieces.append(sid)
    pieces.extend(_recent_commit_subjects(repo_path))
    toks: List[str] = []
    for piece in pieces:
        for t in _tokens(piece):
            if t not in toks:
                toks.append(t)
    if not db.exists():
        return {
            "status": "SKIP",
            "reason": f"db missing: {db}",
            "blocking": [],
            "warnings": [],
            "tokens": toks,
        }
    if not toks:
        return {"status": "PASS", "blocking": [], "warnings": [], "tokens": []}
    blocking = query_db(db, toks, severities=_BLOCKING)
    warnings = query_db(db, toks, severities={"MEDIUM", "LOW"})
    return {
        "status": "BLOCK" if blocking else "PASS",
        "blocking": blocking,
        "warnings": warnings,
        "tokens": toks,
        "db": str(db),
    }
