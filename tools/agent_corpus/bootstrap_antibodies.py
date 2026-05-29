"""tools.agent_corpus.bootstrap_antibodies — create + seed the in-repo
antibody DB so the QA Agent's L1 antibody layer flips from SKIP to PASS.

Idempotent: re-running creates the schema if absent, and `INSERT OR IGNORE`
keeps every existing row stable. The shipped seed catalog is the union of
every bug class that has historically landed in this repo's master TODO
(W4.* fair-price + paytable scaling, W196 truth-check oracle drift, W205
host-orchestrator audit, W237 adapter mutation kills, W241 cluster/bulk
follow-ups, jurisdiction adapter parity slips, RNG snapshot edge cases,
PAR cell provenance, evidence manifest churn …).

Schema (compatible with `tools.agent_corpus.antibodies` reader):

    CREATE TABLE antibodies (
        id                TEXT PRIMARY KEY,
        pattern           TEXT NOT NULL,
        severity          TEXT NOT NULL,
        recommended_fix   TEXT NOT NULL,
        family            TEXT NOT NULL,
        created_at        TEXT NOT NULL,    -- ISO-8601 UTC
        last_seen         TEXT NOT NULL     -- ISO-8601 UTC
    )

CLI:

    python -m tools.agent_corpus.bootstrap_antibodies              # default path
    python -m tools.agent_corpus.bootstrap_antibodies --db PATH    # custom
    python -m tools.agent_corpus.bootstrap_antibodies --dry-run    # print only

Designed to be safe on CI: no network, no external deps, pure stdlib.
"""
from __future__ import annotations

import argparse
import datetime
import sqlite3
import sys
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from tools.agent_paths import antibody_db_path

# ISO-8601 stamp pinned to the bootstrap commit's land moment so re-running
# the script in CI doesn't churn `created_at` and trip downstream hash
# comparators. `last_seen` is bumped on every re-run for live drift tracking.
_LANDED_AT = "2026-05-29T22:15:00Z"

# (id, pattern, severity, recommended_fix, family)
_SEED: List[Tuple[str, str, str, str, str]] = [
    # ─── Mathematical correctness ─────────────────────────────────────────
    (
        "AB-MATH-001",
        "RTP closed-form drift versus 10B MC reference above 0.1 percent",
        "HIGH",
        "Re-run rust-sim release MC with seed=12345; verify reel weights + line scope unchanged; bisect against last green commit using scripts/par-diff.mjs",
        "math.rtp_drift",
    ),
    (
        "AB-MATH-002",
        "Hit frequency exceeds 1.0 or below 0.0 in PAR validator",
        "HIGH",
        "Engine emits hit_freq as decimal fraction (not percent); check evaluator.rs hit_count divisor, must equal total_spins",
        "math.hit_freq_oob",
    ),
    (
        "AB-MATH-003",
        "Win frequency greater than hit frequency in evaluation",
        "CRITICAL",
        "win_freq is subset of hit_freq by definition; if greater, scatter pays are double-counted — see W181 cluster fix in evaluator.rs::count_scatters",
        "math.win_gt_hit",
    ),
    (
        "AB-MATH-004",
        "Paytable monotonic gate fails — longer combo pays less than shorter",
        "HIGH",
        "Sort paytable by combo length descending then verify pays non-increasing per symbol; usually wild substitution prefix collision (W237 adapter L598 mutant class)",
        "math.paytable_monotonic",
    ),
    (
        "AB-MATH-005",
        "Bonus buy RTP delta vs natural game above 0.5 percent",
        "CRITICAL",
        "Fair-price BB must price-in the natural trigger probability exactly; recompute bb_cost = bonus_rtp / trigger_prob; W4.11b real-market MC parity gate covers this",
        "math.bb_fair_price",
    ),
    (
        "AB-MATH-006",
        "Ways topology RTP exceeds 100 percent in matrix runner",
        "HIGH",
        "Apply _paytable_scale(topology, feature) — WAYS_243 → 0.10, WAYS_1024 → 0.04, MEGAWAYS → 0.02, FREE_SPINS additional 0.40 (see tools/cert_lab/matrix_runner.py)",
        "math.ways_explosion",
    ),
    (
        "AB-MATH-007",
        "Free spins multiplier compounds across retriggers instead of resetting",
        "HIGH",
        "FS multiplier is per-trigger snapshot not per-spin; retrigger emits a NEW multiplier, must not multiply with active one — feature engine fs_state.rs",
        "math.fs_multiplier_compound",
    ),
    (
        "AB-MATH-008",
        "Cluster pays counts isolated singletons as winning cluster",
        "MEDIUM",
        "min_cluster_size must be >= 5 by convention; BFS adjacency=orthogonal does not include diagonal — verify _evaluation_block emits min_cluster_size",
        "math.cluster_singleton",
    ),
    (
        "AB-MATH-009",
        "Megaways ways count exceeds 117649 (max for 6 reels rows 2..7)",
        "MEDIUM",
        "ways = product(rows_per_reel) capped at 117649; check rows_max <= 7 and reels == 6, otherwise topology is mis-classified",
        "math.megaways_ways_max",
    ),
    (
        "AB-MATH-010",
        "Cascade reaction chain RTP share grows unbounded",
        "HIGH",
        "Each cascade step must consume the winning symbols before re-evaluating; check tools/feature_engine/cascade.py::resolve_chain returns after MAX_CASCADE_DEPTH=15 even if winning",
        "math.cascade_unbounded",
    ),

    # ─── RNG + statistical integrity ──────────────────────────────────────
    (
        "AB-RNG-001",
        "PCG64 TS Mulberry32 parity mismatch beyond 1e-12",
        "CRITICAL",
        "Both runtimes pinned to seed=42; mulberry32 uses uint32 wrap-around — verify TS uses Math.imul, Rust uses wrapping_mul; W6.4 PCG64 parity gate",
        "rng.parity_mismatch",
    ),
    (
        "AB-RNG-002",
        "ChaCha20 KAT test fails — block 0 byte 0 mismatch",
        "CRITICAL",
        "RFC 7539 vector 1 is non-negotiable; binary must include rng_submission_bin and emit canonical block 0 hex",
        "rng.chacha_kat",
    ),
    (
        "AB-RNG-003",
        "ENT statistical assessment chi-squared above 16.92 critical at p=0.05",
        "MEDIUM",
        "1000-sample roughness check is tolerant; re-run with seed +1 to confirm not p-hacked failure; if persistent, escalate to SP 800-90B suite",
        "rng.ent_chi2",
    ),
    (
        "AB-RNG-004",
        "SP 800-90B entropy estimate below 6.5 bits per byte",
        "HIGH",
        "NIST SP 800-90B min-entropy floor is 6.5; failure usually indicates output post-processing introducing bias — check rng/transform.rs whitening stage",
        "rng.sp80090b_floor",
    ),
    (
        "AB-RNG-005",
        "RNG snapshot determinism gate fails between cold and warm starts",
        "HIGH",
        "Snapshot must include FULL state (counter + key + buffer); verify rng_state.rs::serialize matches deserialize bit-for-bit using snapshot_seeds.rs helpers",
        "rng.snapshot_determinism",
    ),

    # ─── IR + adapter correctness (W237 family) ───────────────────────────
    (
        "AB-IR-001",
        "GameConfig adapter strips outer length but engine still reads inner length",
        "HIGH",
        "W237 kill class line 266 — adapter.rs strips outer reel length, must clone inner; verify with w237_kill_tests::strips_outer_keeps_inner_len",
        "ir.adapter_outer_inner",
    ),
    (
        "AB-IR-002",
        "Hold-and-win tier match uses < instead of <=, off-by-one award",
        "HIGH",
        "W237 kill class line 651 — tier match must be tier_value <= cap, not <; affects boundary hits exactly at cap value",
        "ir.handw_tier_boundary",
    ),
    (
        "AB-IR-003",
        "Free spins trigger uses OR where AND is required (multi-symbol scatter)",
        "CRITICAL",
        "W237 kill class line 598 — trigger.scatter_count >= 3 AND scatter_kind == requested; OR allows wild substitution to trigger feature, which is mathematically distinct",
        "ir.fs_trigger_or_and",
    ),
    (
        "AB-IR-004",
        "Ways evaluation uses modulo instead of division on column count",
        "HIGH",
        "W237 kill class line 334 — column-count must be reels rows_max / cells_per_row (integer division); modulo gives wrong window size on non-divisible grids",
        "ir.ways_modulo_division",
    ),
    (
        "AB-IR-005",
        "Duplicate symbol id in IR silently accepted by parser",
        "HIGH",
        "PHASE 50 fix — Symbol id uniqueness must be validated at parse time; emit IRParseError with duplicate id list; rust-sim/tests/ir_roundtrip.rs::duplicate_symbol_id_is_error",
        "ir.duplicate_symbol_id",
    ),
    (
        "AB-IR-006",
        "Non-finite paytable pays (NaN, Inf) load without error",
        "HIGH",
        "PHASE 50 fix — all numeric fields must pass is_finite() at parse; reject and surface the offending paytable row index",
        "ir.non_finite_pays",
    ),

    # ─── Cargo mutation kill class ────────────────────────────────────────
    (
        "AB-MUT-001",
        "behavior_impls mutation hits MAX vs MIN aggregation",
        "MEDIUM",
        "W241 cluster kill class L109 — max_mult_seen must be MAX not MIN; verify w241_cluster_kills.rs::max_mult_is_actual_max",
        "mutation.max_min_swap",
    ),
    (
        "AB-MUT-002",
        "bulk dispatcher checkpoint resume logic mutated by cargo-mutants",
        "MEDIUM",
        "W241 followup 768f4bb — verify checkpoint resume invariants L181, L228-230 with bulk dispatcher kill suite (5 specs)",
        "mutation.bulk_checkpoint",
    ),
    (
        "AB-MUT-003",
        "markov VARY_RESPINS snapshot equivalent mutant accepted",
        "LOW",
        "W241 markov kill — 11 missed mutants are mathematically equivalent (same result via different path); confirm with snapshot diff tool not flag count",
        "mutation.markov_equivalent",
    ),

    # ─── Jurisdiction + regulator surface ─────────────────────────────────
    (
        "AB-JUR-001",
        "ADM (Italy) max_win exceeds 30000x cap",
        "CRITICAL",
        "adapt_spec_for_jurisdiction must clamp max_win to 30000 for ADM code; verify W9.1 jurisdictions.py and that jurisdiction_overrides block is injected at IR root",
        "jurisdiction.adm_max_win",
    ),
    (
        "AB-JUR-002",
        "UKGC RTP variant below 0.85 floor",
        "HIGH",
        "UKGC requires RTP floor 0.85; adapt_spec must reject or up-clamp below this; W9.1 registry covers UKGC/MGA/ADM/DGOJ/KSA/NMI",
        "jurisdiction.ukgc_rtp_floor",
    ),
    (
        "AB-JUR-003",
        "Jurisdiction code lowercase silently routed to default adapter",
        "MEDIUM",
        "Jurisdiction code MUST be normalized uppercase via W9.3 migration helper; lowercase 'adm' should trigger schema migration not silent default",
        "jurisdiction.case_drift",
    ),

    # ─── Truth-check + drift sentinel ─────────────────────────────────────
    (
        "AB-TRUTH-001",
        "slot-truth-check passes despite missing CI job",
        "HIGH",
        "W196.TRUTH-V2 closed this — verify .github/workflows/slot-math-ci.yml truth-check job actually runs scripts/slot-truth-check.sh --ci; line 82 of CLAUDE.md previously lied for years",
        "truth.unwired_gate",
    ),
    (
        "AB-TRUTH-002",
        "Master TODO line count below 3000 floor",
        "MEDIUM",
        "10% drift window from oracle floor; if below, master TODO has been truncated — bisect for accidental delete commit",
        "truth.master_todo_floor",
    ),
    (
        "AB-TRUTH-003",
        "rust_lib_tests below 290 floor",
        "HIGH",
        "W196.TRUTH-V2 bumped oracle to 290; tests below this means a module was deleted or test suite mis-collected — verify cargo test --lib output count",
        "truth.rust_test_floor",
    ),

    # ─── Portfolio + dashboard count drift ────────────────────────────────
    (
        "AB-PORTFOLIO-001",
        "Portfolio validator IR count mismatches test expectation",
        "MEDIUM",
        "Tests must be flipped together with new game addition; check tools/tests/test_portfolio_validator.py count + test_each_game_covered dict matches games/<folder>/out/*.ir.json union",
        "portfolio.ir_count_drift",
    ),
    (
        "AB-PORTFOLIO-002",
        "Evidence manifest file_count test expectation lags reality",
        "MEDIUM",
        "Post wave landings refresh tools/build_evidence_manifest.py output; flip tools/tests/test_evidence_manifest.py file_count to match — W4.8 + W4.12 batch went 20 → 27",
        "portfolio.evidence_count",
    ),
    (
        "AB-PORTFOLIO-003",
        "Real-market dashboard TEMPLATE badge count off",
        "LOW",
        "TEMPLATE_FOLDERS frozenset in tools/build_real_market_portfolio.py is source of truth — book + megaways + walking-wild = 3 expected",
        "portfolio.template_badge",
    ),

    # ─── Host orchestrator drift (W205) ───────────────────────────────────
    (
        "AB-HOST-001",
        "Host orchestrator path hard-coded to one operator binary",
        "HIGH",
        "W205 + W205+2 — dispatcher must be host-orchestrator-agnostic; SLOT_QLORA_BIN env override + skip if missing; never assume /usr/local/bin path",
        "host.hardcoded_path",
    ),
    (
        "AB-HOST-002",
        "CLAUDE.md drift versus master TODO mismatch over 30 lines",
        "MEDIUM",
        "W150 lesson — 37 line drift between CLAUDE.md context and master TODO previously slipped CI; truth-check script now catches this gap",
        "host.claude_md_drift",
    ),

    # ─── Build + tool plumbing ────────────────────────────────────────────
    (
        "AB-BUILD-001",
        "GitHub Actions workflow on: parsed as YAML boolean True",
        "HIGH",
        "YAML 1.1 boolean keyword collision — use quoted string \"on\": instead of bare on:; A.1 CI fix removes 0s push-event failure",
        "build.yaml_on_boolean",
    ),
    (
        "AB-BUILD-002",
        "deployment dry-run prepare-green exits 2 without state file",
        "MEDIUM",
        "A.2/A.3 fix synthesizes in-memory green stub for --dry-run; production path still writes state file",
        "build.dryrun_no_state",
    ),
    (
        "AB-BUILD-003",
        "Ruff lint fails with hundreds of errors after Python version bump",
        "LOW",
        "Mass refactor is out of scope for single wave; cap fix to surgical errors per file unless explicitly tasked with ruff cleanup",
        "build.ruff_mass",
    ),
    (
        "AB-BUILD-004",
        "Cargo clippy fails with -D warnings after dependency upgrade",
        "MEDIUM",
        "Run cargo clippy --all-targets -- -D warnings; if new lint, gate on per-crate basis with #[allow(clippy::...)] documented in commit message",
        "build.clippy_strict",
    ),

    # ─── PAR + cell provenance ────────────────────────────────────────────
    (
        "AB-PAR-001",
        "openpyxl style sheet read fails on textRotation > 180",
        "MEDIUM",
        "Vendor export bug — strip textRotation > 180 from xl/styles.xml before openpyxl load; Fort Knox Wolf Run hit this in W4.* dump",
        "par.openpyxl_text_rotation",
    ),
    (
        "AB-PAR-002",
        "PAR cell provenance hash differs across runs of same SWID",
        "HIGH",
        "W5.3 cell provenance must be order-independent; sort cells by (sheet, row, col) before hashing; non-deterministic dict iteration was old bug",
        "par.provenance_order",
    ),
    (
        "AB-PAR-003",
        "PAR commitment file leaks raw vendor SWID in committed artefact",
        "CRITICAL",
        "Vendor SWID 200-XXXX-NNN must stay in raw/dump/ only; downstream IR + dossier + pitch must use generic ids; check copyright posture in README",
        "par.swid_leak",
    ),

    # ─── Symbolic differentiation + QMC ───────────────────────────────────
    (
        "AB-SYM-001",
        "Symbolic derivative ignores feature share contribution",
        "MEDIUM",
        "W7.6 — derivative manifest must sum partial derivatives across base + bonus + feature shares; if missing share, derivative mass less than 1.0",
        "sym.feature_share_missed",
    ),
    (
        "AB-QMC-001",
        "QMC convergence rate worse than O(1/sqrt(N)) for low-discrepancy seq",
        "HIGH",
        "W5.4 qmc_estimator — Sobol vs Halton vs Lattice must converge faster than IID; if not, sequence generator is broken or scrambling missing",
        "qmc.convergence_floor",
    ),

    # ─── QA Agent self-loop ───────────────────────────────────────────────
    (
        "AB-QA-001",
        "QA Agent L9 manual scenario YAML schema mismatch",
        "MEDIUM",
        "Every scenario under tools/qa_agent/scenarios/*.yaml must have id + summary + steps[]; missing field surfaces as L9 ERROR (not FAIL)",
        "qa.scenario_schema",
    ),
    (
        "AB-QA-002",
        "QA Agent same-seed re-run produces byte-different report.json",
        "HIGH",
        "Hard rule — determinism gate; check that timestamp + report_hash are computed AFTER all per-layer artefacts settle and timestamps are stripped from compare",
        "qa.nondeterminism",
    ),
]


_DDL = """
CREATE TABLE IF NOT EXISTS antibodies (
    id              TEXT PRIMARY KEY,
    pattern         TEXT NOT NULL,
    severity        TEXT NOT NULL,
    recommended_fix TEXT NOT NULL,
    family          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    last_seen       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS antibodies_family_idx ON antibodies(family);
CREATE INDEX IF NOT EXISTS antibodies_severity_idx ON antibodies(severity);
"""


def _now_iso() -> str:
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def bootstrap(db_path: Path, dry_run: bool = False) -> dict:
    """Create schema + seed antibody catalog. Idempotent.

    Returns a summary dict: ``{schema_created, inserted, skipped, total}``.
    """
    summary = {
        "db_path": str(db_path),
        "schema_created": False,
        "inserted": 0,
        "skipped": 0,
        "total": 0,
    }

    if dry_run:
        summary["schema_created"] = True
        summary["inserted"] = len(_SEED)
        summary["total"] = len(_SEED)
        return summary

    db_path.parent.mkdir(parents=True, exist_ok=True)
    existed_before = db_path.exists()
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(_DDL)
        summary["schema_created"] = not existed_before
        now = _now_iso()
        for row in _SEED:
            ab_id, pattern, severity, fix, family = row
            cur = conn.execute(
                "INSERT OR IGNORE INTO antibodies "
                "(id, pattern, severity, recommended_fix, family, created_at, last_seen) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (ab_id, pattern, severity, fix, family, _LANDED_AT, now),
            )
            if cur.rowcount:
                summary["inserted"] += 1
            else:
                summary["skipped"] += 1
                # Bump last_seen for live drift tracking.
                conn.execute(
                    "UPDATE antibodies SET last_seen=? WHERE id=?",
                    (now, ab_id),
                )
        conn.commit()
        summary["total"] = conn.execute(
            "SELECT COUNT(*) FROM antibodies"
        ).fetchone()[0]
    finally:
        conn.close()
    return summary


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(
        description="Bootstrap the slot-math-engine antibody DB with seed catalog."
    )
    p.add_argument(
        "--db",
        default=None,
        help="Override DB path. Default: resolve via tools.agent_paths.antibody_db_path().",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would happen without touching disk.",
    )
    args = p.parse_args(argv)

    db = Path(args.db).expanduser() if args.db else antibody_db_path()
    summary = bootstrap(db, dry_run=args.dry_run)

    import json
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
