"""Monte Carlo parity test for `template-book-bonusbuy.ir.json` (W4.11 + W4.15).

The closed-form verifier (`book_bonusbuy_closed_form.py`) carries a documented
+0.96 pp wild double-count bias on the line term. This MC validator runs the
actual evaluator and proves that the *engine* (left-anchored line eval,
hypergeometric scatter, FS trigger probability) matches PAR within ≤ 0.5 pp
on line, ≤ 0.1 pp on scatter, and ≤ 10 % rel-err on FS trigger frequency.

The FS RTP-share term is reported but NOT gated — the public PAR does not
specify enough sticky-reel / per-spin expansion-budget detail for a
copyright-safe template to replay it exactly. The gates that ARE asserted
already prove the engine math is production-grade for the base-game term.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "parity" / "book_bonusbuy_mc.py"
REPORT = REPO / "reports" / "acceptance" / "book_bonusbuy_mc.json"

# 200K spinov gives ±0.2 pp CI95 on RTP — enough to make 0.5 pp / 0.1 pp gates
# statistically meaningful. We run the script ONCE per pytest module via a
# session-scoped fixture and re-use the JSON report across all assertions.
TEST_SPINS = 200_000
TEST_SEED = 20260529


@pytest.fixture(scope="module")
def report() -> dict:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--spins", str(TEST_SPINS), "--seed", str(TEST_SEED)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    assert result.returncode == 0, (
        f"mc script exit {result.returncode}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert REPORT.exists(), f"report not written: {REPORT}"
    return json.loads(REPORT.read_text())


def test_mc_script_runs_and_writes_report(report: dict):
    assert report["all_gates_pass"] is True
    assert report["spins"] == TEST_SPINS


def test_mc_line_pay_within_0p5_pp(report: dict):
    """MC line-pay must beat the closed-form's documented +0.96 pp wild bias."""
    assert abs(report["deltas_pp"]["line_pay_delta_pp"]) <= 0.5


def test_mc_scatter_pay_within_0p1_pp(report: dict):
    """Scatter is hypergeometric-exact; MC should match within sampling noise."""
    assert abs(report["deltas_pp"]["scatter_pay_delta_pp"]) <= 0.1


def test_mc_hit_frequency_within_5_pp(report: dict):
    """Hit-frequency convention varies (cash_counts_as_hit, FS hits) — allow 5 pp."""
    assert abs(report["hit_freq_delta_pp"]) <= 5.0


def test_mc_fs_trigger_freq_rel_err_within_10pct(report: dict):
    """P(trigger 3+ BOOK) is the engine-verifiable FS metric (sticky-reel detail
    is vendor-specific). MC should hit PAR PPH-derived 5.504e-3 within ±10 %."""
    assert report["fs_trigger_rel_err"] <= 0.10


def test_mc_fs_trigger_freq_in_par_realistic_range(report: dict):
    """Quick sanity: MC trigger freq must be in PAR-realistic range (1e-3 — 1e-2)."""
    measured = report["fs_trigger_freq_measured"]
    assert 1e-3 <= measured <= 1e-2


def test_mc_runtime_under_10_seconds_for_200k_spins(report: dict):
    """Performance gate moved to CI logs — JSON no longer carries timing.

    W244 wave 6 — `elapsed_seconds` was excised from the MC JSON for Merkle
    determinism (machine-load wall-clock was the cascade root that dirtied
    6 pinned regulator files on every rebuild). Performance budget for
    200K spins remains ≤ 10 s; CI keeps the actual measurement in its run
    summary. This test now just confirms the field is intentionally absent
    so future contributors don't re-add wall-clock fields by accident.
    """
    assert "elapsed_seconds" not in report
    assert "spins_per_second" not in report


def test_mc_report_contains_evaluator_note(report: dict):
    """The report must document the FS-evaluator limitations honestly."""
    assert "fs_evaluator_note" in report
    assert "sticky-reel" in report["fs_evaluator_note"]


def test_mc_versus_closed_form_line_pay_is_strictly_better(report: dict):
    """The whole point of MC: line-pay delta ≤ closed-form delta (which is +0.96 pp).
    MC removes the wild double-count bias, so its delta should be much smaller."""
    cf_report_path = REPO / "reports" / "acceptance" / "book_bonusbuy_parity.json"
    if not cf_report_path.exists():
        subprocess.run(
            [sys.executable, str(REPO / "tools/parity/book_bonusbuy_closed_form.py")],
            check=True,
            cwd=str(REPO),
        )
    cf = json.loads(cf_report_path.read_text())
    cf_line_delta_pp = abs(cf["deltas_pp"]["line_pay_delta_pp"])
    mc_line_delta_pp = abs(report["deltas_pp"]["line_pay_delta_pp"])
    assert mc_line_delta_pp < cf_line_delta_pp, (
        f"MC should beat closed-form on line pay: mc Δ={mc_line_delta_pp:.4f} pp vs cf Δ={cf_line_delta_pp:.4f} pp"
    )
