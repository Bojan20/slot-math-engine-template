"""Closed-form parity test for `template-book-bonusbuy.ir.json` (W4.11 + W4.15)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "parity" / "book_bonusbuy_closed_form.py"
REPORT = REPO / "reports" / "acceptance" / "book_bonusbuy_parity.json"


def _run() -> dict:
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    assert result.returncode == 0, (
        f"parity script exit {result.returncode}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert REPORT.exists(), f"report not written: {REPORT}"
    return json.loads(REPORT.read_text())


def test_parity_script_runs_and_writes_report():
    report = _run()
    assert report["all_gates_pass"] is True


def test_parity_all_gates_pass():
    report = _run()
    for gate, ok in report["gates"].items():
        assert ok, f"gate {gate} failed: deltas={report['deltas_pp']}"


def test_parity_scatter_is_exact():
    """Scatter term uses an exact hypergeometric model — Δ ≤ 0.01 pp."""
    report = _run()
    assert abs(report["deltas_pp"]["scatter_pay_delta_pp"]) <= 0.01


def test_parity_bb_fair_price_is_marginally_positive():
    """Bonus-Buy fair-price delta must be small and positive (BB Base on trigger)."""
    report = _run()
    delta_pp = report["bonus_buy_fair_price_pp"]
    assert 0 < delta_pp <= 0.05, f"BB fair-price delta out of range: {delta_pp}"


def test_parity_fs_share_within_3pp():
    """FS share inferred via P(3+ BOOK) × avg_pay must match within 3pp."""
    report = _run()
    assert abs(report["deltas_pp"]["fs_rtp_via_avg_pay_delta_pp"]) <= 3.0


def test_parity_total_within_1p5pp():
    """Total RTP closed-form must match reference within ≤1.5 pp (documented wild bias)."""
    report = _run()
    assert abs(report["deltas_pp"]["total_delta_pp"]) <= 1.5


def test_parity_book_pmf_matches_par_pph():
    """
    Book PMF probabilities should match PAR PPH inverse to 4 sig figs:
      * P(5 Book) ≈ 1 / 248_283.95 ≈ 4.027e-6
      * P(4 Book) ≈ 1 / 4280.76    ≈ 2.336e-4
      * P(3 Book) ≈ 1 / 189.90     ≈ 5.266e-3
    """
    report = _run()
    pmf = report["computed"]["fs_trigger_book_pmf"]
    ref = {"5": 4.027e-6, "4": 2.336e-4, "3": 5.266e-3}
    for k, expected in ref.items():
        got = pmf[k]
        rel_err = abs(got - expected) / expected
        assert rel_err < 0.005, f"PMF[{k}] rel_err={rel_err:.4f} (got {got}, exp {expected})"
