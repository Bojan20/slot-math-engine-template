"""W244 — antibody gate Jaccard regression tests.

The gate must NOT block production commits where the symptom + recent
commit subjects share generic vocabulary with antibody patterns (rtp,
paytable, rng, mc, drift, …).  Earlier versions used a naive
`LIKE %tok%` per-token search which exploded on the slot-math commit
history.  These tests pin the dual-path Jaccard contract:

  • Single highly-specific token (jaccard ≥ 0.30) BLOCKS  — selftest
    tripwire path.
  • Multi-token overlap (≥3 tokens, jaccard ≥ 0.10) BLOCKS — strong
    semantic match.
  • Anything else PASSES — including generic 1-token commit-message
    overlaps.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable

import pytest

from tools.qa_agent.antibody import gate, query_db


# ─── Fixture DB factory ─────────────────────────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE antibodies (
    id              TEXT PRIMARY KEY,
    pattern         TEXT NOT NULL,
    severity        TEXT NOT NULL,
    recommended_fix TEXT NOT NULL,
    family          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    last_seen       TEXT NOT NULL
);
"""


def _make_db(tmp_path: Path, rows: Iterable[tuple]) -> Path:
    db = tmp_path / "ab.db"
    conn = sqlite3.connect(db)
    try:
        conn.executescript(_SCHEMA_SQL)
        conn.executemany(
            "INSERT INTO antibodies "
            "(id, pattern, severity, recommended_fix, family, created_at, last_seen) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            list(rows),
        )
        conn.commit()
    finally:
        conn.close()
    return db


# ─── Pin: generic commit subject does NOT trip the gate ─────────────────────


def test_generic_commit_subject_does_not_block(tmp_path: Path) -> None:
    """Real-world false-positive case from W244 dossier push.

    Commit subjects like 'feat(W244 pass 2): Stryker 93.57 → 95.91 %'
    contain rtp/paytable/rng vocabulary but are not symptom evidence —
    the gate must NOT block.
    """
    db = _make_db(
        tmp_path,
        rows=[
            (
                "AB-MATH-001",
                "RTP closed-form drift versus 10B MC reference above 0.1 percent",
                "HIGH",
                "Re-run rust-sim release MC with seed=12345",
                "math.rtp_drift",
                "2026-05-29T00:00:00Z",
                "2026-05-29T00:00:00Z",
            ),
            (
                "AB-PAR-003",
                "PAR commitment file leaks raw vendor SWID in committed artefact",
                "CRITICAL",
                "Scrub provider IDs from any committed PAR artefact",
                "par.swid_leak",
                "2026-05-29T00:00:00Z",
                "2026-05-29T00:00:00Z",
            ),
        ],
    )
    # Simulating tokens drawn from a typical commit subject + qa scope.
    symptom = (
        "qa scope quick seed 42 feat W244 pass 2 Stryker mutation score "
        "rtp paytable rng matrix engine wave killer test pin"
    )
    # No symptom-specific antibody match → must PASS.
    v = gate(symptom=symptom, db=db, repo=tmp_path)
    assert v["status"] == "PASS", (
        f"expected PASS but got {v['status']}; blocking={v['blocking']}"
    )
    assert v["blocking"] == []


# ─── Pin: single highly-specific token DOES trip ────────────────────────────


def test_strong_jaccard_single_token_blocks(tmp_path: Path) -> None:
    """A symptom carrying a rare-token signature matches via path (A)."""
    db = _make_db(
        tmp_path,
        rows=[
            (
                "AB-RNG-001",
                "chacha20 katv vector mismatch",
                "CRITICAL",
                "Re-pin chacha20 KAT vectors",
                "rng.chacha_kat",
                "2026-05-29T00:00:00Z",
                "2026-05-29T00:00:00Z",
            ),
        ],
    )
    # symptom has the rare specific token "chacha20" + "katv" → strong
    # 2/3 jaccard.  Must BLOCK.
    v = gate(symptom="chacha20 katv mismatch", db=db, repo=tmp_path)
    assert v["status"] == "BLOCK"
    assert any(h["id"] == "AB-RNG-001" for h in v["blocking"])


# ─── Pin: multi-token overlap floor trips ───────────────────────────────────


def test_multi_token_overlap_blocks(tmp_path: Path) -> None:
    """≥3 overlapping tokens with weak jaccard still blocks via path (B)."""
    db = _make_db(
        tmp_path,
        rows=[
            (
                "AB-PAR-003",
                "vendor swid leak openpyxl provenance corruption",
                "HIGH",
                "Scrub provider IDs from any committed PAR artefact",
                "par.swid_leak",
                "2026-05-29T00:00:00Z",
                "2026-05-29T00:00:00Z",
            ),
        ],
    )
    # Three matching non-stop tokens (vendor, swid, openpyxl) hit path B.
    v = gate(
        symptom="vendor swid leak detected openpyxl scrape provenance log",
        db=db,
        repo=tmp_path,
    )
    assert v["status"] == "BLOCK"


# ─── Pin: stopword-only overlap does NOT trip ───────────────────────────────


@pytest.mark.parametrize(
    "subject",
    [
        "fix(qa): rtp paytable rng matrix wave",
        "feat(W244): mutation score push",
        "docs: master TODO snapshot",
        "chore: log report update",
    ],
)
def test_stopword_only_overlap_does_not_block(tmp_path: Path, subject: str) -> None:
    db = _make_db(
        tmp_path,
        rows=[
            (
                "AB-X-001",
                "RTP paytable rng matrix mutation drift",
                "HIGH",
                "noop",
                "x.fp",
                "2026-05-29T00:00:00Z",
                "2026-05-29T00:00:00Z",
            ),
        ],
    )
    v = gate(symptom=subject, db=db, repo=tmp_path)
    assert v["status"] == "PASS", (
        f"subject {subject!r} unexpectedly blocked: {v['blocking']}"
    )


# ─── Pin: empty DB / missing DB → SKIP / PASS ──────────────────────────────


def test_missing_db_skips_silently(tmp_path: Path) -> None:
    v = gate(symptom="anything", db=tmp_path / "nope.db", repo=tmp_path)
    assert v["status"] == "SKIP"
    assert v["blocking"] == []


def test_empty_tokens_passes(tmp_path: Path) -> None:
    db = _make_db(
        tmp_path,
        rows=[
            (
                "AB-X-001",
                "any pattern",
                "HIGH",
                "noop",
                "x.fp",
                "2026-05-29T00:00:00Z",
                "2026-05-29T00:00:00Z",
            ),
        ],
    )
    # Symptom shorter than 3 chars → no tokens emitted → PASS.
    v = gate(symptom="ab", db=db, repo=tmp_path)
    assert v["status"] == "PASS"


def test_query_db_returns_score_and_matched_tokens(tmp_path: Path) -> None:
    db = _make_db(
        tmp_path,
        rows=[
            (
                "AB-RNG-001",
                "chacha20 katv vector mismatch",
                "CRITICAL",
                "fix",
                "rng.chacha_kat",
                "2026-05-29T00:00:00Z",
                "2026-05-29T00:00:00Z",
            ),
        ],
    )
    out = query_db(db, ["chacha20", "katv"])
    assert out and out[0]["id"] == "AB-RNG-001"
    assert "score" in out[0]
    assert "matched_tokens" in out[0]
    assert set(out[0]["matched_tokens"]).issubset({"chacha20", "katv"})
