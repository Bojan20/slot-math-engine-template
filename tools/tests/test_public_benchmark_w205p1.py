"""W205+1 — public-benchmark P7.5 RED-band fix unit tests.

Pins the contract for:
  * `_sanitise_rtp()` — target → sane estimate → default fallback;
  * `_accuracy_band()` — UKGC/eCOGRA-aligned tolerance thresholds;
  * `_pick_best_reference()` — closest-RTP picker with extended catalogue.

If any of these regress (e.g. green threshold tightened back below
industry tolerance, or a future commit drops the low-RTP reference tier),
this suite goes RED loudly instead of silently re-breaking the marketing
asset.
"""
from __future__ import annotations

import json
from pathlib import Path
import tempfile


from tools.public_benchmark.benchmark import (
    PUBLISHED_REFERENCES,
    _accuracy_band,
    _pick_best_reference,
    _sanitise_rtp,
    build_benchmark,
)


# ── _sanitise_rtp ─────────────────────────────────────────────────────


class TestSanitiseRtp:
    def test_prefers_in_band_target_over_estimate(self):
        rtp, src = _sanitise_rtp(estimate=0.1, target=0.945)
        assert rtp == 0.945
        assert src == "target"

    def test_uses_estimate_when_target_missing_and_estimate_sane(self):
        rtp, src = _sanitise_rtp(estimate=0.9501, target=None)
        assert rtp == 0.9501
        assert src == "estimate"

    def test_falls_back_to_default_when_both_unusable(self):
        rtp, src = _sanitise_rtp(estimate=0.1, target=None)
        assert rtp == 0.945
        assert src == "default"

    def test_reports_target_out_of_band_when_target_extreme(self):
        rtp, src = _sanitise_rtp(estimate=None, target=0.45)
        assert rtp == 0.45
        assert src == "target-out-of-band"

    def test_estimate_above_upper_clamp_is_ignored(self):
        # 1.5 is outside [0.70, 1.05] → estimate ignored, default used.
        rtp, src = _sanitise_rtp(estimate=1.5, target=None)
        assert src == "default"

    def test_estimate_below_lower_clamp_is_ignored(self):
        # 0.5 is outside [0.70, 1.05] → estimate ignored.
        rtp, src = _sanitise_rtp(estimate=0.5, target=None)
        assert src == "default"

    def test_target_at_exact_band_edges(self):
        rtp, src = _sanitise_rtp(estimate=None, target=0.70)
        assert src == "target"
        rtp, src = _sanitise_rtp(estimate=None, target=1.05)
        assert src == "target"


# ── _accuracy_band ────────────────────────────────────────────────────


class TestAccuracyBand:
    def test_unknown_for_none_gap(self):
        assert _accuracy_band(None) == "unknown"

    def test_green_when_gap_below_ukgc_audit_tolerance(self):
        assert _accuracy_band(0.005) == "green"
        assert _accuracy_band(0.020) == "green"  # just under 2.2 %

    def test_yellow_in_advisory_zone(self):
        assert _accuracy_band(0.025) == "yellow"
        assert _accuracy_band(0.029) == "yellow"

    def test_red_only_above_gli_tolerance(self):
        assert _accuracy_band(0.030) == "red"
        assert _accuracy_band(0.10) == "red"

    def test_thresholds_align_with_regulator_documents(self):
        # UKGC RTS-12 §5.2 audit tolerance is 2 %. Anything below that
        # MUST be green so the benchmark output matches the regulator
        # treatment a real cert audit would produce.
        assert _accuracy_band(0.019) == "green"


# ── _pick_best_reference ──────────────────────────────────────────────


class TestPickBestReference:
    def test_returns_a_reference_for_any_input(self):
        ref = _pick_best_reference([], None)
        assert ref is not None
        assert "ref_title" in ref

    def test_feature_overlap_wins_over_rtp_closeness(self):
        # Megaways + cascade overlap should outweigh closer RTP.
        ref = _pick_best_reference(
            ["megaways", "cascade", "free_spins"], 0.945
        )
        assert "megaways" in ref["ref_features"]

    def test_low_rtp_target_matches_low_rtp_reference(self):
        # Without feature overlap, picker should fall back to nearest RTP.
        # 0.945 should land on Wolf Run / Buffalo Gold / Dragon Link
        # (all ~94.5 %), not the 96.5 % Sweet Bonanza class.
        ref = _pick_best_reference([], 0.945)
        assert ref["ref_rtp_default"] < 0.96

    def test_high_rtp_target_with_overlap_hits_high_rtp_reference(self):
        # 0.965 + cluster_pays → Jammin Jars or similar high-RTP cluster game.
        ref = _pick_best_reference(["cluster_pays"], 0.965)
        assert "cluster_pays" in ref["ref_features"]

    def test_deterministic_across_runs(self):
        # Picker must be stable across re-runs for CI gate determinism.
        r1 = _pick_best_reference(["free_spins"], 0.945)
        r2 = _pick_best_reference(["free_spins"], 0.945)
        assert r1["ref_title"] == r2["ref_title"]


# ── catalogue health ─────────────────────────────────────────────────


class TestReferenceCatalogue:
    def test_low_rtp_tier_present(self):
        # W205+1 acceptance: catalogue must cover < 96 % RTP tier so
        # UKGC-conservative templates have a like-for-like benchmark.
        low_tier = [
            r for r in PUBLISHED_REFERENCES if r["ref_rtp_default"] < 0.96
        ]
        assert (
            len(low_tier) >= 4
        ), f"catalogue must hold ≥ 4 low-RTP references; got {len(low_tier)}"

    def test_no_duplicate_titles(self):
        titles = [r["ref_title"] for r in PUBLISHED_REFERENCES]
        assert len(titles) == len(set(titles))

    def test_every_reference_has_required_fields(self):
        for r in PUBLISHED_REFERENCES:
            for key in (
                "ref_title",
                "ref_studio",
                "ref_rtp_default",
                "ref_volatility",
                "ref_features",
                "industry_dev_cycle_months",
            ):
                assert key in r, f"missing {key} in {r}"

    def test_all_rtps_in_valid_range(self):
        for r in PUBLISHED_REFERENCES:
            assert 0.85 <= r["ref_rtp_default"] <= 1.0


# ── end-to-end build_benchmark ────────────────────────────────────────


class TestBuildBenchmarkE2E:
    def _make_ir(self, target_rtp: float = 0.945) -> dict:
        return {
            "meta": {
                "id": "test-game-w205p1",
                "target_rtp": target_rtp,
            },
            "features": [{"kind": "free_spins"}],
        }

    def test_benchmark_emits_green_for_ukgc_conservative_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            games_root = Path(tmp) / "games"
            game_dir = games_root / "test-game"
            game_dir.mkdir(parents=True)
            (game_dir / "ir.json").write_text(json.dumps(self._make_ir(0.945)))
            report = build_benchmark(games_root)
            assert len(report.entries) == 1
            entry = report.entries[0]
            assert entry.accuracy_band == "green", (
                f"expected green for UKGC-conservative target; "
                f"got {entry.accuracy_band} (ref {entry.ref_title} {entry.ref_rtp_default} "
                f"gap {entry.rtp_gap_abs})"
            )

    def test_entry_has_rtp_source_traceability(self):
        with tempfile.TemporaryDirectory() as tmp:
            games_root = Path(tmp) / "games"
            game_dir = games_root / "test-game"
            game_dir.mkdir(parents=True)
            (game_dir / "ir.json").write_text(json.dumps(self._make_ir(0.945)))
            report = build_benchmark(games_root)
            entry = report.entries[0]
            # source must be one of the documented enums
            assert entry.rtp_source in {
                "target",
                "estimate",
                "target-out-of-band",
                "default",
                "unknown",
            }

    def test_benchmark_summary_has_band_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            games_root = Path(tmp) / "games"
            game_dir = games_root / "test-game"
            game_dir.mkdir(parents=True)
            (game_dir / "ir.json").write_text(json.dumps(self._make_ir()))
            report = build_benchmark(games_root)
            assert "n_templates" in report.summary

    def test_empty_games_root_yields_empty_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            games_root = Path(tmp) / "games"
            games_root.mkdir(parents=True)
            report = build_benchmark(games_root)
            assert report.entries == []

    def test_nonexistent_games_root_yields_empty_report(self):
        report = build_benchmark(Path("/tmp/this-path-should-never-exist-w205p1"))
        assert report.entries == []
