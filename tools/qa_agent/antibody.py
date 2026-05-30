"""tools.qa_agent.antibody — pre-flight gate.

Queries the antibody SQLite DB resolved via `tools.agent_paths.antibody_db_path()`.
Tokenises the input symptom + recent commit subjects, finds HIGH/CRITICAL
matches via **dual-path token-set overlap (Jaccard)**, and returns a
structured verdict.

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


# Antibody-match thresholds.
#
# Earlier behaviour was a single-token `LIKE %tok%` per input token, which
# produced false positives the moment any recent commit subject contained
# a common bug-class word (`rtp`, `paytable`, `matrix`, `qa`, `test`, …).
# A single such collision was enough to BLOCK the entire QA-quick run.
#
# We now require **dual-path token-set overlap (Jaccard intersection)**:
#
#   • input  token set = recent commit subjects + symptom + scenario ids
#   • pattern token set = bug-class phrase (stopwords stripped)
#   • match iff EITHER
#       (A) jaccard(input, pattern) >= `_STRONG_JACCARD`     — single highly
#           specific token carries the signal (rare-token symptoms),
#     OR
#       (B) |inter| >= `_MIN_OVERLAP_TOKENS` AND
#           jaccard(input, pattern) >= `_WEAK_JACCARD`       — multi-token
#           overlap confirms semantic match even with common vocabulary.
#
# The dual-path keeps selftest-style 1-token tripwires alive (they hit (A)
# trivially) while the multi-token floor (B) prevents production false
# positives from generic commit subjects like "fix(W4.8): … paytable …".
_STRONG_JACCARD = 0.30
_MIN_OVERLAP_TOKENS = 3
_WEAK_JACCARD = 0.10
# Tokens too common to count toward overlap (would otherwise float every
# software-related antibody into match range). Kept tight on purpose; the
# Jaccard floor handles the long tail.
_STOPWORDS: frozenset[str] = frozenset(
    {
        # generic english / programming filler
        "the", "and", "for", "with", "from", "into", "must", "not", "any",
        "all", "but", "use", "uses", "used", "via", "per", "are", "was",
        "this", "that", "than", "then", "when", "where", "which", "what",
        "verify", "check", "fix", "test", "tests", "spec", "specs",
        "code", "data", "file", "files", "path", "value", "values",
        "field", "fields", "should", "would", "could", "ref", "refs",
        # frequent repo-topic words that show up in nearly every commit
        "qa", "rtp", "par", "ir", "rust", "feat", "docs", "wave",
        "matrix", "engine", "agent", "agents", "report", "reports",
        "build", "builds", "module", "modules", "scope", "post",
        "commit", "commits", "push", "pull", "diff", "kill", "kills",
        "killer", "killers", "stryker", "mutation", "mutant", "mutants",
        "score", "scoped", "gate", "gates", "pass", "fail", "fails",
        "result", "results", "snapshot", "log", "logs", "row", "rows",
        # mathematics/QA topic vocabulary (legitimate but too generic)
        "drift", "mismatch", "monotonic", "reference",
        "paytable", "rng", "seed", "spin", "spins",
        "session", "sessions", "wager", "win", "wins", "loss",
    }
)


def _pattern_tokens(text: str) -> set:
    return {t for t in _tokens(text) if t not in _STOPWORDS}


def query_db(
    db: Path,
    tokens: List[str],
    *,
    severities: Optional[set] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """Return matched antibodies for the given token set.

    Matches require EITHER:
      • ``jaccard(input, pattern) >= _STRONG_JACCARD``, OR
      • ``|input ∩ pattern| >= _MIN_OVERLAP_TOKENS`` AND
        ``jaccard(input, pattern) >= _WEAK_JACCARD``.
    Empty on absent DB.
    """
    if not db.exists():
        return []
    sev_filter = severities or _BLOCKING
    input_toks = {t.lower() for t in tokens if t and t not in _STOPWORDS}
    if not input_toks:
        return []
    out: List[Dict[str, Any]] = []
    try:
        conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return []
    try:
        if not _has_table(conn, "antibodies"):
            return []
        seen: set = set()
        cur = conn.execute(
            "SELECT id, pattern, severity, recommended_fix, family "
            "FROM antibodies WHERE severity IN ({}) ORDER BY severity DESC".format(
                ",".join("?" * len(sev_filter))
            ),
            tuple(sorted(sev_filter)),
        )
        for row in cur.fetchall():
            pat_toks = _pattern_tokens(row[1] or "")
            if not pat_toks:
                continue
            inter = input_toks & pat_toks
            if not inter:
                continue
            union = input_toks | pat_toks
            jaccard = len(inter) / max(1, len(union))
            # Dual-path acceptance: strong jaccard alone, OR overlap floor
            # combined with weak jaccard.
            strong = jaccard >= _STRONG_JACCARD
            weak = len(inter) >= _MIN_OVERLAP_TOKENS and jaccard >= _WEAK_JACCARD
            if not (strong or weak):
                continue
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
                    "score": round(jaccard, 4),
                    "matched_tokens": sorted(inter),
                }
            )
            if len(out) >= limit:
                break
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
