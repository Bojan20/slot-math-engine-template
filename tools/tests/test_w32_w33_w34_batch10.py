"""W32 + W33 + W34 + P1.6 batch 10 combined tests."""
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

# W32
from tools.ir_fuzzer import (
    DEFAULT_MUTATIONS,
    FuzzReport,
    run_fuzz,
)
from tools.ir_fuzzer.__main__ import main as fuzz_main

# W33
from tools.vendor_adapter import (
    DEFAULT_REGISTRY,
    AdapterRegistry,
    VendorAdapter,
    detect_vendor,
    get,
    list_adapters,
    register,
)
from tools.vendor_adapter.__main__ import main as adapter_main

# W34
from tools.spec_compliance import (
    extract_doc_facts,
    extract_ir_facts,
    diff_facts,
    run_gate,
)
from tools.spec_compliance.__main__ import main as compliance_main

# P1.6 batch 10
from tools.solvers.replicating_wild_random_walk import (
    ReplicatingWildParams,
    analytical_rtp as rw_rtp,
    mc_simulate as rw_mc,
)
from tools.solvers.gamble_double_or_nothing import (
    GambleParams,
    analytical_rtp as gd_rtp,
    mc_simulate as gd_mc,
)
from tools.solvers.super_symbol_megablock import (
    MegablockParams,
    analytical_rtp as mb_rtp,
    mc_simulate as mb_mc,
)
from tools.solvers.mystery_box_award_table import (
    MysteryBoxParams,
    analytical_rtp as box_rtp,
    mc_simulate as box_mc,
)


def _ir(*, target_rtp: float = 0.96, pay: int = 100) -> dict:
    return {
        "meta": {
            "id": "test_game",
            "vendor": "vendor_c",
            "swid": "S-W34-0001",
            "target_rtp": target_rtp,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [
            ["A", "B", "C", "D"] for _ in range(5)
        ]},
        "paytable": [
            {"combo": ["A", "A", "A", "A", "A"], "pays": pay},
            {"combo": ["B", "B", "B", "B", "B"], "pays": 20},
        ],
        "features": [{"kind": "free_spins"}],
    }


# ─── W32: IR Mutation Fuzzer ───────────────────────────────────────


class TestIRFuzzer(unittest.TestCase):
    def test_all_hard_mutations_detected(self):
        report = run_fuzz(_ir(), iterations_per_mutation=3)
        self.assertEqual(
            report.n_false_negatives, 0,
            f"uncaught: {[r.mutation for r in report.results if r.false_negative]}",
        )

    def test_soft_mutation_does_not_break(self):
        report = run_fuzz(_ir(), iterations_per_mutation=5)
        soft = [r for r in report.results if r.mutation == "perturb_pays_soft"]
        self.assertTrue(soft)
        # Soft mutations may still detect issues only if pays goes negative;
        # we expect no false negatives — soft is not marked as hard.
        for r in soft:
            self.assertFalse(r.false_negative)

    def test_serialization_roundtrip(self):
        report = run_fuzz(_ir(), iterations_per_mutation=2)
        d = report.to_dict()
        self.assertIn("results", d)
        self.assertIn("n_false_negatives", d)

    def test_cli_runs_clean(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "ir.json"
            p.write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = fuzz_main([str(p), "--quiet"])
            self.assertEqual(rc, 0)

    def test_default_mutations_count(self):
        # 8 default mutations
        self.assertEqual(len(DEFAULT_MUTATIONS), 8)


# ─── W33: Vendor Adapter SDK ───────────────────────────────────────


class TestVendorAdapter(unittest.TestCase):
    def test_builtin_adapters_registered(self):
        adapters = list_adapters()
        ids = {a.vendor_id for a in adapters}
        self.assertIn("vendor_a", ids)
        self.assertIn("vendor_b", ids)
        self.assertIn("vendor_c", ids)

    def test_detect_vendor_b(self):
        raw = b"swid=S-001\nsome other content"
        self.assertEqual(detect_vendor(raw), "vendor_b")

    def test_detect_unknown_returns_none(self):
        raw = b"completely random unrelated content"
        self.assertIsNone(detect_vendor(raw))

    def test_get_missing_raises(self):
        with self.assertRaises(KeyError):
            get("vendor_nonexistent_xyz")

    def test_register_duplicate_without_override_raises(self):
        local = AdapterRegistry()
        a = VendorAdapter(
            vendor_id="v_test", description="t",
            detect=lambda b: False, convert=lambda b, p: {},
        )
        local.register(a)
        with self.assertRaises(ValueError):
            local.register(a)
        local.register(a, override=True)  # ok with override

    def test_convert_flow(self):
        adapter = get("vendor_b")
        ir = adapter.convert(b"swid=S-XYZ-9999\n", {"vendor_id": "vendor_b"})
        self.assertEqual(ir["meta"]["swid"], "S-XYZ-9999")
        fp = adapter.fingerprint(ir)
        self.assertEqual(len(fp), 64)  # sha256 hex

    def test_cli_list(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = adapter_main(["list"])
        self.assertEqual(rc, 0)
        self.assertIn("vendor_a", buf.getvalue())


# ─── W34: Spec Compliance Gate ─────────────────────────────────────


_DOC_OK = """\
# Test Game — Math Documentation

Target RTP: 96.00%

## Paytable

| Combo | Pays |
| --- | --- |
| A+A+A+A+A | 100 |
| B+B+B+B+B | 20 |
"""

_DOC_DRIFT_RTP = """\
# Test Game

Target RTP: 95.00%

## Paytable

| Combo | Pays |
| --- | --- |
| A+A+A+A+A | 100 |
| B+B+B+B+B | 20 |
"""

_DOC_MISSING_ROW = """\
# Test Game

Target RTP: 96.00%

## Paytable

| Combo | Pays |
| --- | --- |
| A+A+A+A+A | 100 |
"""


class TestSpecCompliance(unittest.TestCase):
    def test_doc_parser_finds_rtp(self):
        facts = extract_doc_facts(_DOC_OK)
        self.assertAlmostEqual(facts.target_rtp, 0.96, places=4)
        self.assertEqual(len(facts.paytable_rows), 2)

    def test_ir_facts_normalize_percent(self):
        ir = _ir(target_rtp=96.0)  # caller passes percent
        facts = extract_ir_facts(ir)
        self.assertAlmostEqual(facts.target_rtp, 0.96, places=4)

    def test_diff_passes_on_aligned_specs(self):
        report = run_gate(ir_path=None, doc_path=None,
                          ir=_ir(), doc_text=_DOC_OK)
        self.assertTrue(report.passed, [i.message for i in report.issues])

    def test_diff_flags_rtp_drift(self):
        report = run_gate(ir_path=None, doc_path=None,
                          ir=_ir(), doc_text=_DOC_DRIFT_RTP)
        self.assertFalse(report.passed)
        cats = {i.category for i in report.issues}
        self.assertIn("target_rtp", cats)

    def test_diff_flags_missing_paytable_row(self):
        report = run_gate(ir_path=None, doc_path=None,
                          ir=_ir(), doc_text=_DOC_MISSING_ROW)
        self.assertFalse(report.passed)
        cats = {i.category for i in report.issues}
        self.assertIn("paytable_in_ir_not_doc", cats)

    def test_kernel_rtp_drift(self):
        # kernel 0.80 vs target 0.96 is way out of tolerance
        report = run_gate(ir_path=None, doc_path=None,
                          ir=_ir(), doc_text=_DOC_OK,
                          kernel_rtp=0.80)
        cats = {i.category for i in report.issues}
        self.assertIn("kernel_rtp_drift", cats)

    def test_cli_passes(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_p = d / "ir.json"
            doc_p = d / "MATH.md"
            ir_p.write_text(json.dumps(_ir()))
            doc_p.write_text(_DOC_OK)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = compliance_main([
                    "--ir", str(ir_p),
                    "--doc", str(doc_p),
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── P1.6 batch 10 ─────────────────────────────────────────────────


class TestReplicatingWild(unittest.TestCase):
    REF = ReplicatingWildParams(
        n_cells=15, p_wild_seed=0.05, p_step=0.40, max_steps=4,
        marginal_pay_per_wild=0.50,
    )

    def test_rtp_positive(self):
        self.assertGreater(rw_rtp(self.REF), 0)

    def test_zero_chain_collapses(self):
        p = ReplicatingWildParams(
            n_cells=15, p_wild_seed=0.05, p_step=0.0, max_steps=4,
            marginal_pay_per_wild=0.50,
        )
        self.assertAlmostEqual(rw_rtp(p), 15 * 0.05 * 0.50, places=6)

    def test_chain_monotonic_in_p_step(self):
        a = rw_rtp(ReplicatingWildParams(
            n_cells=15, p_wild_seed=0.05, p_step=0.10, max_steps=4,
            marginal_pay_per_wild=0.50,
        ))
        b = rw_rtp(ReplicatingWildParams(
            n_cells=15, p_wild_seed=0.05, p_step=0.50, max_steps=4,
            marginal_pay_per_wild=0.50,
        ))
        self.assertGreater(b, a)

    def test_mc_within_tolerance(self):
        a = rw_rtp(self.REF)
        mc = rw_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestGamble(unittest.TestCase):
    REF = GambleParams(
        base_hit_freq=0.25, base_avg_win=2.0, p_enter=0.5,
        p_win_per_round=0.45, p_continue=0.7, max_rounds=5,
    )

    def test_no_enter_collapses_to_base(self):
        p = GambleParams(
            base_hit_freq=0.25, base_avg_win=2.0, p_enter=0.0,
            p_win_per_round=0.45, p_continue=0.7, max_rounds=5,
        )
        self.assertAlmostEqual(gd_rtp(p), 0.25 * 2.0, places=6)

    def test_p_enter_decreases_rtp_when_unfair(self):
        # unfair gamble: 2*p_win < 1 → entering loses EV
        unfair = GambleParams(
            base_hit_freq=0.25, base_avg_win=2.0, p_enter=0.0,
            p_win_per_round=0.40, p_continue=0.7, max_rounds=5,
        )
        entered = GambleParams(
            base_hit_freq=0.25, base_avg_win=2.0, p_enter=1.0,
            p_win_per_round=0.40, p_continue=0.7, max_rounds=5,
        )
        self.assertGreater(gd_rtp(unfair), gd_rtp(entered))

    def test_mc_within_tolerance(self):
        a = gd_rtp(self.REF)
        mc = gd_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestMegablock(unittest.TestCase):
    REF = MegablockParams(
        rows=5, cols=5, block_side=3, p_megablock=0.02,
        pay_per_block=50.0, lines_evaluated_mult=1.0,
    )

    def test_block_too_large_returns_zero(self):
        too_big = MegablockParams(
            rows=3, cols=5, block_side=5, p_megablock=0.01,
            pay_per_block=100.0,
        )
        self.assertEqual(mb_rtp(too_big), 0.0)

    def test_rtp_positive_when_block_fits(self):
        self.assertGreater(mb_rtp(self.REF), 0)

    def test_mc_aligns_with_analytical(self):
        a = mb_rtp(self.REF)
        mc = mb_mc(self.REF, spins=100_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.9)
        self.assertLess(ratio, 1.1)


class TestMysteryBox(unittest.TestCase):
    REF = MysteryBoxParams(
        n_cells=15, p_box_per_cell=0.02,
        award_values=[1.0, 2.0, 5.0, 10.0, 50.0],
        award_weights=[50, 30, 15, 4, 1],
    )

    def test_rtp_positive(self):
        self.assertGreater(box_rtp(self.REF), 0)

    def test_zero_p_box_collapses(self):
        p = MysteryBoxParams(
            n_cells=15, p_box_per_cell=0.0,
            award_values=[1.0, 2.0],
            award_weights=[1, 1],
        )
        self.assertEqual(box_rtp(p), 0.0)

    def test_award_doubles_when_values_double(self):
        ref2 = MysteryBoxParams(
            n_cells=15, p_box_per_cell=0.02,
            award_values=[2.0, 4.0, 10.0, 20.0, 100.0],
            award_weights=[50, 30, 15, 4, 1],
        )
        self.assertAlmostEqual(box_rtp(ref2), 2 * box_rtp(self.REF), places=6)

    def test_mc_within_tolerance(self):
        a = box_rtp(self.REF)
        mc = box_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


if __name__ == "__main__":
    unittest.main()
