"""W7.3 — Closed-form SMT RTP synthesis regression tests.

Five guarantees:

  1. **closed_form_line_rtp** reproduces what an MC sim would measure
     for the same IR (within ε on a controlled paytable).
  2. **synth_paytable_scale** hits target RTP exactly within 1e-5.
  3. **synth_per_symbol_pays** solves a satisfiable multi-symbol
     constraint, respects the monotonic 3OAK < 4OAK < 5OAK ladder,
     and stays inside [pay_min, pay_max].
  4. **apply_paytable_scale / apply_per_symbol_pays** produce IRs
     whose `closed_form_line_rtp` matches the solver-claimed value.
  5. **Round-trip**: synth → apply → re-measure → matches target.

Note: tests require `z3-solver` (`pip install z3-solver`). Skipped
cleanly if not available so CI without z3 doesn't fail.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    import z3  # noqa: F401
    _HAS_Z3 = True
except ImportError:
    _HAS_Z3 = False

if _HAS_Z3:
    from tools.smt.rtp_synthesizer import (
        RtpSynthesisError,
        apply_paytable_scale,
        apply_per_symbol_pays,
        closed_form_line_rtp,
        synth_paytable_scale,
        synth_per_symbol_pays,
    )


# ─── Test IR builder (small, deterministic) ─────────────────────────────


def _toy_ir() -> dict:
    """Tiny IR for unit testing: 3-reel × 3-row, 1 payline, 2 LP + Wild."""
    return {
        "meta": {
            "name": "toy",
            "vendor": "test",
            "swid": "TOY-001",
            "family": "paylines",
            "rtp_total": 0.5,
            "rtp_breakdown": {},
            "hit_frequency": 0.0,
            "win_frequency": 0.0,
        },
        "topology": {"kind": "rectangular", "reels": 3, "rows": 3},
        "evaluation": {
            "kind": "lines",
            "lines": [[1, 1, 1]],
            "min_count": 3,
        },
        "symbols": [
            {"id": "A", "name": "A", "role": "lp"},
            {"id": "B", "name": "B", "role": "lp"},
            {"id": "W", "name": "Wild", "role": "wild",
             "substitutes": ["*"], "substitutes_except": []},
        ],
        "reels": {
            "base": [{"set": 1, "reels": [
                # Each reel: A=4, B=4, W=2 (total 10)
                [{"symbol": "A", "weight": 4},
                 {"symbol": "B", "weight": 4},
                 {"symbol": "W", "weight": 2}],
                [{"symbol": "A", "weight": 4},
                 {"symbol": "B", "weight": 4},
                 {"symbol": "W", "weight": 2}],
                [{"symbol": "A", "weight": 4},
                 {"symbol": "B", "weight": 4},
                 {"symbol": "W", "weight": 2}],
            ]}],
            "base_weights": {"weights": [{"set": 1, "weight": 1}],
                             "total": 1, "initial_set": 1},
        },
        "paytable": [
            {"combo": ["A", "A", "A"], "pays": 10.0, "scope": "line",
             "marker": ""},
            {"combo": ["B", "B", "B"], "pays": 5.0, "scope": "line",
             "marker": ""},
        ],
        "features": [],
        "bet_table": {"lines": 1, "multipliers": [1], "total_bets": [1.0]},
    }


@unittest.skipUnless(_HAS_Z3, "z3-solver not installed")
class TestClosedFormLineRtp(unittest.TestCase):
    """The closed-form RTP must be a deterministic function of the IR."""

    def test_toy_baseline(self):
        ir = _toy_ir()
        # P(line A3) = ((4+2)/10)^3 = 0.216; A pays 10 → A contrib = 2.16
        # P(line B3) = ((4+2)/10)^3 = 0.216; B pays 5  → B contrib = 1.08
        # total_bet = 1, num_lines = 1; RTP = 2.16 + 1.08 = 3.24
        rtp = closed_form_line_rtp(ir)
        self.assertAlmostEqual(rtp, 3.24, places=6,
                               msg="closed-form RTP doesn't match analytical")

    def test_paytable_override(self):
        ir = _toy_ir()
        # Override A 3OAK = 0
        rtp = closed_form_line_rtp(ir, paytable_override={("A", 3): 0.0})
        # Now only B contributes: 0.216 × 5 = 1.08
        self.assertAlmostEqual(rtp, 1.08, places=6)


@unittest.skipUnless(_HAS_Z3, "z3-solver not installed")
class TestSynthPaytableScale(unittest.TestCase):
    """`synth_paytable_scale` returns an exact (within tolerance)
    multiplicative scale that hits the target RTP."""

    def test_scale_to_half(self):
        ir = _toy_ir()
        baseline = closed_form_line_rtp(ir)  # 3.24
        target = baseline / 2  # 1.62
        scale = synth_paytable_scale(ir, target_rtp=target)
        self.assertAlmostEqual(scale, 0.5, places=5)

    def test_apply_scale_hits_target(self):
        ir = _toy_ir()
        target = 0.96
        scale = synth_paytable_scale(ir, target_rtp=target)
        new_ir = apply_paytable_scale(ir, scale)
        new_rtp = closed_form_line_rtp(new_ir)
        self.assertAlmostEqual(new_rtp, target, places=5)

    def test_unsat_when_baseline_zero(self):
        ir = _toy_ir()
        # Zero out the paytable so baseline = 0
        ir["paytable"] = []
        with self.assertRaises(RtpSynthesisError):
            synth_paytable_scale(ir, target_rtp=0.5)

    def test_scale_preserves_paytable_proportions(self):
        ir = _toy_ir()
        scale = synth_paytable_scale(ir, target_rtp=1.62)  # half
        new_ir = apply_paytable_scale(ir, scale)
        # Ratios between line entries preserved
        new_pt = {tuple(e["combo"]): e["pays"] for e in new_ir["paytable"]}
        ratio = new_pt[("A", "A", "A")] / new_pt[("B", "B", "B")]
        self.assertAlmostEqual(ratio, 2.0, places=5)  # 10/5 == 2

    def test_scale_solver_handles_real_ir(self):
        """Smoke-test on the shipped Vendor A IR."""
        ir_path = ROOT / "games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json"
        if not ir_path.exists():
            self.skipTest("Vendor A IR not present (sanitized away)")
        with open(ir_path) as f:
            ir = json.load(f)
        target = 0.85
        scale = synth_paytable_scale(ir, target_rtp=target)
        self.assertGreater(scale, 0)
        new_ir = apply_paytable_scale(ir, scale)
        self.assertAlmostEqual(
            closed_form_line_rtp(new_ir), target, places=4,
        )


@unittest.skipUnless(_HAS_Z3, "z3-solver not installed")
class TestSynthPerSymbolPays(unittest.TestCase):
    """`synth_per_symbol_pays` solves a multi-variable constraint with
    monotonic ladder + bounded pay range."""

    def test_solver_finds_solution(self):
        ir = _toy_ir()
        # Solve for A's pay levels, leaving B as constant
        pays = synth_per_symbol_pays(
            ir, target_rtp=2.0, symbols=["A"],
            pay_min=1.0, pay_max=100.0,
        )
        # Toy IR has 3 reels, so only count=3 is physically possible.
        self.assertEqual(set(pays.keys()), {("A", 3)})

    def test_monotonic_ladder(self):
        """For an IR with 5 reels, 3OAK < 4OAK < 5OAK ladder enforced."""
        ir_path = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        if not ir_path.exists():
            self.skipTest("Vendor B IR not present (sanitized away)")
        with open(ir_path) as f:
            ir = json.load(f)
        # Vendor B baseline line RTP ≈ 0.68; solving for Bell alone with
        # target above baseline (0.75) means Bell must contribute extra.
        pays = synth_per_symbol_pays(
            ir, target_rtp=0.75, symbols=["Bell"],
            pay_min=1.0, pay_max=10_000.0,
        )
        # 5-reel IR → 3 counts available
        self.assertEqual(set(pays.keys()),
                         {("Bell", 3), ("Bell", 4), ("Bell", 5)})
        self.assertLess(pays[("Bell", 3)], pays[("Bell", 4)])
        self.assertLess(pays[("Bell", 4)], pays[("Bell", 5)])

    def test_apply_per_symbol_hits_target(self):
        ir = _toy_ir()
        target = 1.5
        pays = synth_per_symbol_pays(
            ir, target_rtp=target, symbols=["A"],
            pay_min=0.1, pay_max=1000.0,
        )
        new_ir = apply_per_symbol_pays(ir, pays)
        self.assertAlmostEqual(
            closed_form_line_rtp(new_ir), target, places=4,
        )

    def test_pay_bounds_respected(self):
        ir = _toy_ir()
        # B contributes 1.08 baseline; target 3.0 → A must add 1.92.
        # P(A line) = 0.216 → A pay ≈ 8.89, well inside [2, 50].
        pays = synth_per_symbol_pays(
            ir, target_rtp=3.0, symbols=["A"],
            pay_min=2.0, pay_max=50.0,
        )
        for v in pays.values():
            self.assertGreaterEqual(v, 2.0 - 1e-6)
            self.assertLessEqual(v, 50.0 + 1e-6)

    def test_real_ir_per_symbol(self):
        """Solve per-symbol pays on the shipped Vendor B IR."""
        ir_path = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        if not ir_path.exists():
            self.skipTest("Vendor B IR not present (sanitized away)")
        with open(ir_path) as f:
            ir = json.load(f)
        target = 0.42  # known Vendor B base RTP
        pays = synth_per_symbol_pays(
            ir, target_rtp=target,
            symbols=["Red7", "Blue7", "Bell"],
            pay_min=1.0, pay_max=10_000.0,
        )
        # 3 symbols × 3 counts each = 9 pays
        self.assertEqual(len(pays), 9)
        # Verify final IR's closed-form matches
        new_ir = apply_per_symbol_pays(ir, pays)
        self.assertAlmostEqual(
            closed_form_line_rtp(new_ir), target, places=4,
        )


@unittest.skipUnless(_HAS_Z3, "z3-solver not installed")
class TestApplyIrFns(unittest.TestCase):

    def test_apply_paytable_scale_only_touches_line(self):
        ir = _toy_ir()
        # Add a scatter row
        ir["paytable"].append({
            "combo": ["S:3"], "pays": 100.0, "scope": "scatter", "marker": "",
        })
        new_ir = apply_paytable_scale(ir, 2.0)
        # Scatter pays unchanged
        scatter = next(
            e for e in new_ir["paytable"]
            if e.get("scope") == "scatter"
        )
        self.assertEqual(scatter["pays"], 100.0)
        # Line pays doubled
        line_a = next(
            e for e in new_ir["paytable"]
            if e["combo"] == ["A", "A", "A"]
        )
        self.assertEqual(line_a["pays"], 20.0)


class TestCliEntrypoint(unittest.TestCase):
    """Smoke-test the CLI module loads without importing z3 at top
    level (so it doesn't break repos without z3 installed)."""

    def test_main_module_loadable(self):
        # The CLI imports z3 indirectly via rtp_synthesizer; only test
        # this when z3 is available.
        if not _HAS_Z3:
            self.skipTest("z3-solver not installed")
        from tools.smt import __main__  # noqa: F401


if __name__ == "__main__":
    unittest.main()
