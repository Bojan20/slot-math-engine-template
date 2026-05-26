"""W79 + W80 + W81 — math depth tests."""
from __future__ import annotations
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

# W79
from tools.smt_multi import (
    ConstraintSpec,
    synthesize_paytable_scale,
    estimate_rtp,
    estimate_variance,
    estimate_max_win,
    estimate_hit_freq,
)
from tools.smt_multi.__main__ import main as smt_main

# W80
from tools.provenance_chain import (
    build_chain,
    verify_chain,
    merkle_proof,
    verify_merkle_proof,
    ChainCommitment,
)
from tools.provenance_chain.__main__ import main as pc_main

# W81
from tools.exact_enum import (
    combination_count,
    enumerate_exact,
)
from tools.exact_enum.__main__ import main as ee_main
from tools.exact_enum.engine import ExactEnumerationLimitExceeded


def _ir(pay: float = 100.0) -> dict:
    return {
        "meta": {"id": "g", "vendor": "v", "swid": "S", "target_rtp": 0.96},
        "topology": {"kind": "rectangular", "reels": 3, "rows": 1},
        "reels": {"base": [
            ["A", "A", "B", "C"],   # P(A) = 0.5, P(B) = 0.25, P(C) = 0.25
            ["A", "A", "B", "C"],
            ["A", "A", "B", "C"],
        ]},
        "paytable": [
            {"combo": ["A", "A", "A"], "pays": pay},
            {"combo": ["B", "B", "B"], "pays": pay / 4},
        ],
        "features": [],
    }


# ─── W79: Multi-Constraint SMT ─────────────────────────────────────


class TestSMTMulti(unittest.TestCase):
    def test_estimators(self):
        ir = _ir(pay=100.0)
        # P(AAA) = 0.5^3 = 0.125, contributes 100 * 0.125 = 12.5
        # P(BBB) = 0.25^3 = 0.015625, contributes 25 * 0.015625 = 0.390625
        # Total RTP = 12.890625
        self.assertAlmostEqual(estimate_rtp(ir), 12.890625, places=5)
        self.assertGreater(estimate_variance(ir), 0)
        self.assertEqual(estimate_max_win(ir), 100.0)
        self.assertAlmostEqual(
            estimate_hit_freq(ir), 0.125 + 0.015625, places=6
        )

    def test_synthesize_hits_target_rtp(self):
        ir = _ir()
        spec = ConstraintSpec(target_rtp=0.95, rtp_epsilon=1e-3)
        result = synthesize_paytable_scale(ir, spec)
        self.assertTrue(result.sat, result.reason)
        # k ≈ 0.95 / 12.890625 ≈ 0.0737
        self.assertAlmostEqual(result.scale_k, 0.95 / 12.890625, places=3)
        self.assertAlmostEqual(result.achieved_rtp, 0.95, places=3)

    def test_variance_cap_can_unsat(self):
        ir = _ir()
        # Variance scales as k^2; impossible to hit target_rtp=1 with
        # var_max=0 (would force k=0 → RTP=0)
        spec = ConstraintSpec(target_rtp=1.0, rtp_epsilon=1e-6, var_max=0.0)
        result = synthesize_paytable_scale(ir, spec)
        self.assertFalse(result.sat)
        self.assertIn("variance", result.reason.lower())

    def test_max_win_cap_can_unsat(self):
        ir = _ir()
        # Force win_max way below what target RTP needs
        spec = ConstraintSpec(target_rtp=50.0, rtp_epsilon=1e-3, win_max=1.0)
        result = synthesize_paytable_scale(ir, spec)
        self.assertFalse(result.sat)

    def test_hit_freq_min_unsat(self):
        ir = _ir()
        # Sym A on reels gives hit freq 0.125 + 0.015625 ≈ 0.140
        spec = ConstraintSpec(target_rtp=0.95, hit_freq_min=0.9)
        result = synthesize_paytable_scale(ir, spec)
        self.assertFalse(result.sat)
        self.assertIn("hit_freq", result.reason)

    def test_degenerate_ir(self):
        ir = {"meta": {}, "topology": {}, "reels": {"base": []}, "paytable": []}
        spec = ConstraintSpec(target_rtp=0.96)
        result = synthesize_paytable_scale(ir, spec)
        self.assertFalse(result.sat)

    def test_cli_sat(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "ir.json"
            p.write_text(json.dumps(_ir()))
            out = d / "scaled.json"
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = smt_main([
                    str(p),
                    "--target-rtp", "0.95",
                    "--rtp-eps", "1e-3",
                    "--apply-out", str(out),
                    "--quiet",
                ])
            self.assertEqual(rc, 0)
            scaled = json.loads(out.read_text())
            # scale applied to pays
            self.assertNotEqual(
                scaled["paytable"][0]["pays"], _ir()["paytable"][0]["pays"]
            )


# ─── W80: Provenance Chain ─────────────────────────────────────────


class TestProvenanceChain(unittest.TestCase):
    def _make_par(self, root: Path, n: int = 4) -> list[bytes]:
        root.mkdir(parents=True, exist_ok=True)
        cells = []
        for i in range(n):
            blob = f"par cell {i}".encode()
            (root / f"cell_{i:03d}.txt").write_bytes(blob)
            cells.append(blob)
        return cells

    def test_build_then_verify_intact(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            par = d / "par"
            self._make_par(par, n=5)
            ir = _ir()
            chain, leaves = build_chain(ir=ir, par_dir=par)
            self.assertEqual(chain.par_leaves_count, 5)
            self.assertEqual(len(leaves), 5)
            report = verify_chain(ir=ir, chain=chain, par_dir=par)
            self.assertTrue(report.passed)

    def test_tampered_par_breaks_chain(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            par = d / "par"
            self._make_par(par, n=3)
            ir = _ir()
            chain, _ = build_chain(ir=ir, par_dir=par)
            # Tamper one cell
            (par / "cell_001.txt").write_bytes(b"TAMPERED")
            report = verify_chain(ir=ir, chain=chain, par_dir=par)
            self.assertFalse(report.passed)
            self.assertFalse(report.merkle_match)

    def test_tampered_ir_breaks_chain(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            par = d / "par"
            self._make_par(par, n=3)
            ir = _ir()
            chain, _ = build_chain(ir=ir, par_dir=par)
            tampered_ir = json.loads(json.dumps(ir))
            tampered_ir["paytable"][0]["pays"] = 999999
            report = verify_chain(ir=tampered_ir, chain=chain, par_dir=par)
            self.assertFalse(report.passed)
            self.assertFalse(report.ir_match)

    def test_merkle_proof_roundtrip(self):
        # Inline bytes — easier to control leaf index
        cells = [f"leaf {i}".encode() for i in range(8)]
        ir = _ir()
        chain, leaves = build_chain(ir=ir, par_cells=cells)
        for idx in range(len(leaves)):
            proof = merkle_proof(leaves, idx)
            ok = verify_merkle_proof(
                leaf_hash_hex=leaves[idx].hex(),
                proof=proof,
                root_hex=chain.par_merkle_root_hex,
            )
            self.assertTrue(ok, f"proof for leaf {idx} failed")

    def test_merkle_proof_wrong_root_fails(self):
        cells = [f"leaf {i}".encode() for i in range(4)]
        ir = _ir()
        _, leaves = build_chain(ir=ir, par_cells=cells)
        proof = merkle_proof(leaves, 1)
        bogus_root = "f" * 64
        ok = verify_merkle_proof(
            leaf_hash_hex=leaves[1].hex(),
            proof=proof,
            root_hex=bogus_root,
        )
        self.assertFalse(ok)

    def test_odd_number_of_leaves(self):
        # Last-leaf duplication should still validate
        cells = [f"leaf {i}".encode() for i in range(7)]
        ir = _ir()
        chain, leaves = build_chain(ir=ir, par_cells=cells)
        proof = merkle_proof(leaves, 6)
        ok = verify_merkle_proof(
            leaf_hash_hex=leaves[6].hex(),
            proof=proof,
            root_hex=chain.par_merkle_root_hex,
        )
        self.assertTrue(ok)

    def test_empty_par_dir(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir = _ir()
            chain, leaves = build_chain(ir=ir, par_dir=d / "empty_par")
            self.assertEqual(chain.par_leaves_count, 0)
            self.assertEqual(leaves, [])

    def test_cli_build_and_verify(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            par = d / "par"
            self._make_par(par, n=4)
            ir_p = d / "ir.json"
            ir_p.write_text(json.dumps(_ir()))
            out_d = d / "chain_out"
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc1 = pc_main([
                    "build",
                    "--ir", str(ir_p),
                    "--par-dir", str(par),
                    "--out", str(out_d),
                    "--quiet",
                ])
            self.assertEqual(rc1, 0)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc2 = pc_main([
                    "verify",
                    "--ir", str(ir_p),
                    "--par-dir", str(par),
                    "--chain", str(out_d / "chain.json"),
                    "--quiet",
                ])
            self.assertEqual(rc2, 0)


# ─── W81: Exact Enumeration ───────────────────────────────────────


class TestExactEnumeration(unittest.TestCase):
    def test_combination_count(self):
        ir = _ir()
        # 4 × 4 × 4 = 64
        self.assertEqual(combination_count(ir), 64)

    def test_combination_count_zero_when_no_reels(self):
        self.assertEqual(combination_count({"reels": {"base": []}}), 0)
        self.assertEqual(
            combination_count({"reels": {"base": [[], ["A"]]}}), 0
        )

    def test_enumerate_exact_matches_closed_form(self):
        ir = _ir(pay=100.0)
        report = enumerate_exact(ir)
        # AAA: 2*2*2 = 8 lines out of 64 = 0.125, pay 100 → contrib 12.5
        # BBB: 1*1*1 = 1 line out of 64 = 0.015625, pay 25 → contrib 0.390625
        # Total RTP = 12.890625
        self.assertEqual(report.combinations, 64)
        self.assertAlmostEqual(report.exact_rtp, 12.890625, places=10)
        self.assertEqual(report.max_pay, 100.0)
        self.assertEqual(report.n_paying, 8 + 1)
        self.assertAlmostEqual(report.hit_freq, 9 / 64, places=10)

    def test_exact_vs_closed_form_agree(self):
        """W79 closed-form RTP MUST match W81 exact RTP for the same IR."""
        ir = _ir(pay=200.0)
        cf_rtp = estimate_rtp(ir)
        report = enumerate_exact(ir)
        self.assertAlmostEqual(report.exact_rtp, cf_rtp, places=10)

    def test_variance_positive(self):
        ir = _ir()
        report = enumerate_exact(ir)
        self.assertGreater(report.exact_variance, 0)

    def test_pay_histogram_top_entries(self):
        ir = _ir()
        report = enumerate_exact(ir)
        self.assertGreater(len(report.histogram), 0)
        # Probabilities sum to hit_freq (= 9/64 here)
        total_prob = sum(h.probability for h in report.histogram)
        self.assertAlmostEqual(total_prob, report.hit_freq, places=10)

    def test_limit_exceeded(self):
        ir = _ir()
        with self.assertRaises(ExactEnumerationLimitExceeded):
            enumerate_exact(ir, max_combinations=10)

    def test_empty_paytable_raises(self):
        ir = _ir()
        ir["paytable"] = []
        with self.assertRaises(ValueError):
            enumerate_exact(ir)

    def test_cli_runs(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "ir.json"
            p.write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ee_main([str(p), "--quiet"])
            self.assertEqual(rc, 0)

    def test_cli_count_only(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "ir.json"
            p.write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ee_main([str(p), "--count-only"])
            self.assertEqual(rc, 0)
            self.assertIn("64", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
