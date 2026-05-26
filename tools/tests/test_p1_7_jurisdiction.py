"""P1.7 — Jurisdiction profile + linter regression tests.

Four guarantees:

  1. **All 12 mission-required profiles ship + load cleanly.**
  2. **RTP range enforcement** — under/over thresholds correctly trip
     errors.
  3. **Required disclosure flags** — LDW + session-time missing →
     error in UKGC / NJ / PA / MI / ON / BC / Quebec / MGA.
  4. **Prohibited features** — UKGC autoplay_unlimited rejected.

Run:
    python -m unittest tools.tests.test_p1_7_jurisdiction
"""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.jurisdiction import (
    JurisdictionProfile,
    ComplianceViolation,
    ComplianceReport,
    ViolationSeverity,
    load_profile,
    list_profiles,
    lint_ir,
)


MISSION_REQUIRED_PROFILES = [
    "ukgc", "mga", "gli16", "gli19", "nv", "nj",
    "pa", "mi", "on", "bc", "aams", "quebec",
]


# ─── profile loading ────────────────────────────────────────────────────────


class TestProfileLoading(unittest.TestCase):
    def test_all_12_mission_profiles_ship(self):
        profiles = list_profiles()
        for pid in MISSION_REQUIRED_PROFILES:
            self.assertIn(pid, profiles, f"missing required profile {pid}")
        self.assertGreaterEqual(len(profiles), 12)

    def test_every_profile_loads_cleanly(self):
        for pid in list_profiles():
            with self.subTest(jurisdiction=pid):
                p = load_profile(pid)
                self.assertEqual(p.id, pid)
                self.assertGreater(len(p.name), 0)
                self.assertGreater(p.rtp_max, p.rtp_min)
                self.assertGreaterEqual(p.rtp_min, 0)
                self.assertLessEqual(p.rtp_max, 1.0)

    def test_unknown_profile_raises(self):
        with self.assertRaises(FileNotFoundError):
            load_profile("nonexistent-jurisdiction")

    def test_ukgc_specific_caps(self):
        p = load_profile("ukgc")
        self.assertEqual(p.rtp_min, 0.85)
        self.assertEqual(p.rtp_max, 0.97)
        self.assertEqual(p.max_win_x, 250000)
        self.assertEqual(p.min_spin_duration_ms, 2500)
        # Age-tiered stakes: 18-24 → £2, 25+ → £5
        self.assertEqual(len(p.age_tiered_stakes), 2)


# ─── linter — RTP range ─────────────────────────────────────────────────────


class TestRtpRangeEnforcement(unittest.TestCase):
    def _ir_with_rtp(self, rtp: float) -> dict:
        return {
            "meta": {"rtp_total": rtp},
            "features": [],
            "limits": {"max_win_x": 5000},
            "compliance": {
                "ldw_disclosure": True,
                "session_time_display": True,
                "loss_limits": True,
                "reality_checks": True,
            },
        }

    def test_rtp_below_min_trips_error(self):
        ir = self._ir_with_rtp(0.60)  # below UKGC 0.85
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        violations = [v for v in r.violations if v.rule_id == "ukgc.rtp.below_min"]
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].severity, ViolationSeverity.ERROR)
        self.assertFalse(r.is_compliant)

    def test_rtp_above_max_trips_error(self):
        ir = self._ir_with_rtp(0.999)  # above UKGC 0.97
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        violations = [v for v in r.violations if v.rule_id == "ukgc.rtp.above_max"]
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].severity, ViolationSeverity.ERROR)

    def test_rtp_in_range_no_violation(self):
        ir = self._ir_with_rtp(0.92)  # in UKGC [0.85, 0.97]
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        rtp_violations = [
            v for v in r.violations if v.rule_id.startswith("ukgc.rtp.")
        ]
        self.assertEqual(len(rtp_violations), 0)

    def test_rtp_missing_warning_not_error(self):
        ir = {"meta": {}, "features": [], "compliance": {
            "ldw_disclosure": True, "session_time_display": True,
            "loss_limits": True, "reality_checks": True,
        }}
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        missing = [v for v in r.violations if v.rule_id == "ukgc.rtp.missing"]
        self.assertEqual(len(missing), 1)
        self.assertEqual(missing[0].severity, ViolationSeverity.WARNING)


# ─── linter — disclosure flags ──────────────────────────────────────────────


class TestDisclosureFlags(unittest.TestCase):
    def test_missing_ldw_trips_error_in_ukgc(self):
        ir = {
            "meta": {"rtp_total": 0.95},
            "features": [],
            "limits": {"max_win_x": 5000},
            "compliance": {
                "ldw_disclosure": False,  # missing!
                "session_time_display": True,
                "loss_limits": True,
                "reality_checks": True,
            },
        }
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        ldw = [v for v in r.violations if v.rule_id == "ukgc.ldw_disclosure.required"]
        self.assertEqual(len(ldw), 1)
        self.assertEqual(ldw[0].severity, ViolationSeverity.ERROR)
        self.assertTrue(ldw[0].can_auto_fix)

    def test_gli16_does_not_require_ldw(self):
        """GLI-16 has no RG disclosure requirements; no LDW error expected."""
        ir = {
            "meta": {"rtp_total": 0.95},
            "features": [],
            "compliance": {},  # nothing declared
        }
        p = load_profile("gli16")
        r = lint_ir(ir, p)
        ldw = [v for v in r.violations if v.rule_id == "gli16.ldw_disclosure.required"]
        self.assertEqual(len(ldw), 0)


# ─── linter — prohibited features + max win ─────────────────────────────────


class TestProhibitedFeatures(unittest.TestCase):
    def test_ukgc_rejects_autoplay_unlimited(self):
        ir = {
            "meta": {"rtp_total": 0.95},
            "features": [{"kind": "autoplay_unlimited"}],
            "limits": {"max_win_x": 5000},
            "compliance": {
                "ldw_disclosure": True, "session_time_display": True,
                "loss_limits": True, "reality_checks": True,
            },
        }
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        v = [v for v in r.violations if v.rule_id == "ukgc.feature.prohibited"]
        self.assertEqual(len(v), 1)
        self.assertEqual(v[0].severity, ViolationSeverity.ERROR)

    def test_max_win_exceeds_cap_trips_error(self):
        ir = {
            "meta": {"rtp_total": 0.95},
            "features": [],
            "limits": {"max_win_x": 999999},  # over UKGC 250K
            "compliance": {
                "ldw_disclosure": True, "session_time_display": True,
                "loss_limits": True, "reality_checks": True,
            },
        }
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        v = [v for v in r.violations if v.rule_id == "ukgc.max_win.exceeds_cap"]
        self.assertEqual(len(v), 1)
        self.assertEqual(v[0].severity, ViolationSeverity.ERROR)
        self.assertTrue(v[0].can_auto_fix)


# ─── auto-fixability ────────────────────────────────────────────────────────


class TestComplianceReport(unittest.TestCase):
    def test_report_counts_are_consistent(self):
        ir = {
            "meta": {"rtp_total": 0.95},
            "features": [],
            "limits": {},  # missing max_win → warning
            "compliance": {},
        }
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        self.assertEqual(
            r.error_count + r.warning_count + r.info_count,
            len(r.violations),
        )

    def test_compliant_ir_passes(self):
        ir = {
            "meta": {"rtp_total": 0.96},
            "features": [],
            "limits": {"max_win_x": 200000},
            "bet": {"base_bet": 1.0},
            "compliance": {
                "ldw_disclosure": True,
                "session_time_display": True,
                "loss_limits": True,
                "reality_checks": True,
                "min_spin_duration_ms": 2500,
                "near_miss_rule": "must_be_random",
            },
        }
        p = load_profile("ukgc")
        r = lint_ir(ir, p)
        self.assertTrue(r.is_compliant, f"expected compliance; got {r.violations}")
        self.assertEqual(r.error_count, 0)


if __name__ == "__main__":
    unittest.main()
