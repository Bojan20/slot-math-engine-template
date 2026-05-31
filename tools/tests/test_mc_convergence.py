"""SLOT-MATH Faza 3.7 — MC convergence test gate."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.par_mc_convergence import (
    TIERS,
    Tier,
    attestation_merkle_sha256,
    compare_measured_to_par,
    diff_report_to_markdown,
    emit_attestation,
    generate_diff_report,
    rtp_tolerance_for_tier,
    tier_seeds,
    wilson_ci,
    within_tolerance,
)
from tools.par_mc_convergence.compare import MeasuredMetrics
from tools.par_mc_convergence.orchestrator import (
    SeedResult,
    _aggregate_seed_results,
    run_sweep,
    write_sweep_artefacts,
)


# ─── Tier matrix ────────────────────────────────────────────────────────


def test_all_5_tiers_defined():
    assert set(TIERS.keys()) == {Tier.T1, Tier.T2, Tier.T3, Tier.T4, Tier.T5}


def test_tier_t1_is_fast():
    c = TIERS[Tier.T1]
    assert c.spins_per_seed == 1_000_000
    assert c.seed_count == 32
    assert c.expected_wallclock_seconds <= 60


def test_tier_t5_is_ultimate():
    c = TIERS[Tier.T5]
    assert c.spins_per_seed == 100_000_000_000
    assert c.total_spins == 200_000_000_000  # 200B


def test_tier_seeds_are_deterministic():
    a = tier_seeds(Tier.T1, "game-x", "variant-a")
    b = tier_seeds(Tier.T1, "game-x", "variant-a")
    assert a == b


def test_tier_seeds_differ_across_games():
    a = tier_seeds(Tier.T1, "game-x", "variant-a")
    b = tier_seeds(Tier.T1, "game-y", "variant-a")
    assert a != b


def test_tier_seeds_differ_across_variants():
    a = tier_seeds(Tier.T1, "game-x", "variant-a")
    b = tier_seeds(Tier.T1, "game-x", "variant-b")
    assert a != b


def test_tier_seeds_count_matches_config():
    for t in Tier:
        seeds = tier_seeds(t, "g", "v")
        assert len(seeds) == TIERS[t].seed_count


# ─── Wilson CI ──────────────────────────────────────────────────────────


def test_wilson_ci_contains_point_estimate():
    ci = wilson_ci(50, 100, confidence=0.95)
    assert ci.lower <= ci.point <= ci.upper


def test_wilson_ci_tightens_with_more_samples():
    small = wilson_ci(50, 100, confidence=0.95)
    big = wilson_ci(5000, 10000, confidence=0.95)
    assert big.half_width < small.half_width


def test_wilson_ci_rejects_invalid_n():
    with pytest.raises(ValueError):
        wilson_ci(5, 0)
    with pytest.raises(ValueError):
        wilson_ci(5, -1)


def test_wilson_ci_rejects_invalid_successes():
    with pytest.raises(ValueError):
        wilson_ci(-1, 100)
    with pytest.raises(ValueError):
        wilson_ci(101, 100)


def test_rtp_tolerance_strictens_with_tier():
    t1 = rtp_tolerance_for_tier(Tier.T1)
    t3 = rtp_tolerance_for_tier(Tier.T3)
    t5 = rtp_tolerance_for_tier(Tier.T5)
    assert t1 > t3 > t5


def test_within_tolerance_pass_at_exact():
    assert within_tolerance(0.96, 0.96, 0.01)


def test_within_tolerance_fail_when_outside():
    # 0.005 absolute diff = 0.5 pp; tolerance 0.1 pp → fail
    assert not within_tolerance(0.965, 0.96, 0.1)


# ─── Comparator ─────────────────────────────────────────────────────────


def _synthetic_par() -> dict:
    return {
        "schema": "slot-math-canonical-par/v1",
        "merkle_root_sha256": "p" * 64,
        "rtp": {"rtp_total": 0.96, "variance": 100.0},
        "limits": {"hit_freq_target": 0.25, "max_win_x": 5000.0},
        "features": [],
    }


def _passing_measurement() -> MeasuredMetrics:
    """Measurement that should pass T1 gates."""
    return MeasuredMetrics(
        tier=Tier.T1,
        total_spins=32_000_000,
        seed_count=32,
        rtp=0.96005,  # within 0.05 pp tolerance
        hits=8_000_000,
        hit_freq=0.25,  # exact
        variance=99.5,  # within 5%
        max_win_x=4500.0,  # under cap
        p99_9_win_x=2000.0,
        per_seed_rtps=[0.96 + i * 0.0001 for i in range(32)],
    )


def test_compare_passing_measurement_passes():
    par = _synthetic_par()
    measured = _passing_measurement()
    result = compare_measured_to_par(measured, par, Tier.T1)
    assert result.overall_pass


def test_compare_catches_rtp_drift():
    par = _synthetic_par()
    measured = _passing_measurement()
    measured.rtp = 0.97  # 1 pp drift → fail T1 tolerance 0.05 pp
    result = compare_measured_to_par(measured, par, Tier.T1)
    assert not result.overall_pass
    rtp_delta = next(d for d in result.deltas if d.name == "rtp")
    assert not rtp_delta.passed


def test_compare_catches_max_win_exceed():
    par = _synthetic_par()
    measured = _passing_measurement()
    measured.max_win_x = 6000.0  # exceeds cap
    result = compare_measured_to_par(measured, par, Tier.T1)
    cap_delta = next(d for d in result.deltas if d.name == "max_win_x")
    assert not cap_delta.passed


def test_compare_returns_cross_seed_cv():
    par = _synthetic_par()
    measured = _passing_measurement()
    result = compare_measured_to_par(measured, par, Tier.T1)
    # CV across per_seed_rtps should be very small (all near 0.96)
    assert result.cross_seed_cv >= 0.0
    assert result.cross_seed_cv < 0.01


# ─── Diff report ────────────────────────────────────────────────────────


def test_diff_report_serialises_failure():
    par = _synthetic_par()
    measured = _passing_measurement()
    measured.rtp = 0.97
    result = compare_measured_to_par(measured, par, Tier.T1)
    report = generate_diff_report(result, "game-x", "variant-a", par)
    assert report["overall_pass"] is False
    assert report["failed_count"] >= 1
    assert report["par_sha256"] == "p" * 64


def test_diff_report_markdown_render_includes_metric_table():
    par = _synthetic_par()
    measured = _passing_measurement()
    measured.rtp = 0.97
    result = compare_measured_to_par(measured, par, Tier.T1)
    report = generate_diff_report(result, "game-x", "variant-a", par)
    md = diff_report_to_markdown(report)
    assert "MC Sweep Diff Report" in md
    assert "Per-metric breakdown" in md
    assert "Suspected root causes" in md
    assert "🔴" in md  # FAIL marker


def test_diff_report_includes_suspected_root():
    par = _synthetic_par()
    measured = _passing_measurement()
    measured.rtp = 0.97
    result = compare_measured_to_par(measured, par, Tier.T1)
    report = generate_diff_report(result, "g", "v", par)
    rtp_delta = next(d for d in report["deltas"] if d["name"] == "rtp")
    assert rtp_delta["suspected_root"] is not None
    assert "PAR" in rtp_delta["suspected_root"] or "kernel" in rtp_delta["suspected_root"]


# ─── Attestation ────────────────────────────────────────────────────────


def test_attestation_emit_includes_required_fields():
    par = _synthetic_par()
    measured = _passing_measurement()
    comparison = compare_measured_to_par(measured, par, Tier.T1)
    seeds = tier_seeds(Tier.T1, "game-x", "variant-a")
    att = emit_attestation(
        game_id="game-x",
        variant_id="variant-a",
        tier=Tier.T1,
        seeds=seeds,
        measured=measured,
        comparison=comparison,
        par_merkle="p" * 64,
        ir_merkle="i" * 64,
    )
    for key in ("schema", "game_id", "variant_id", "tier", "tier_config",
                "seeds", "measured", "comparison", "runtime", "attestation_sha256"):
        assert key in att
    assert att["schema"] == "slot-math-mc-attestation/v1"
    assert att["par_merkle_sha256"] == "p" * 64


def test_attestation_sha256_is_deterministic():
    par = _synthetic_par()
    measured = _passing_measurement()
    comparison = compare_measured_to_par(measured, par, Tier.T1)
    seeds = tier_seeds(Tier.T1, "game-x", "variant-a")
    att1 = emit_attestation(
        "g", "v", Tier.T1, seeds, measured, comparison,
        "p" * 64, "i" * 64,
    )
    att2 = emit_attestation(
        "g", "v", Tier.T1, seeds, measured, comparison,
        "p" * 64, "i" * 64,
    )
    assert att1["attestation_sha256"] == att2["attestation_sha256"]


def test_attestation_sha256_excludes_self_field():
    par = _synthetic_par()
    measured = _passing_measurement()
    comparison = compare_measured_to_par(measured, par, Tier.T1)
    seeds = tier_seeds(Tier.T1, "g", "v")
    att = emit_attestation("g", "v", Tier.T1, seeds, measured, comparison, "p" * 64, "i" * 64)
    # Recompute should match
    recomputed = attestation_merkle_sha256(att)
    assert recomputed == att["attestation_sha256"]


# ─── Orchestrator e2e ───────────────────────────────────────────────────


def _stub_worker(ir, seed, spins) -> SeedResult:
    """Stub worker: returns deterministic synthetic measurement."""
    return SeedResult(
        seed=seed,
        spins=spins,
        total_won_x=spins * 0.96,
        hits=int(spins * 0.25),
        sum_sq_payout=spins * 100.0,
        max_win_x=4500.0,
        p99_9_win_x=2000.0,
        feature_trigger_counts={"free_spins": int(spins * 0.005)},
    )


def _synthetic_ir() -> dict:
    return {
        "meta": {"id": "test-game"},
        "limits": {"target_rtp": 0.96, "hit_freq_target": 0.25, "max_win_x": 5000.0},
        "features": [{"kind": "free_spins"}],
        "provenance": {"par_source": "test_variant", "ir_sha256": "i" * 64},
    }


def test_aggregate_seed_results_sums_correctly():
    results = [_stub_worker({}, i, 1000) for i in range(4)]
    measured = _aggregate_seed_results(results, Tier.T1)
    assert measured.total_spins == 4000
    assert measured.seed_count == 4
    assert abs(measured.rtp - 0.96) < 1e-9
    assert abs(measured.hit_freq - 0.25) < 1e-9


def test_aggregate_rejects_empty():
    with pytest.raises(ValueError, match="no seed results"):
        _aggregate_seed_results([], Tier.T1)


def test_orchestrator_runs_t1_smoke():
    """T1 smoke test with stub worker — no real MC, just plumbing."""
    par = _synthetic_par()
    ir = _synthetic_ir()
    result = run_sweep(ir, par, Tier.T1, worker=_stub_worker)
    assert result.attestation["schema"] == "slot-math-mc-attestation/v1"
    assert result.attestation["tier"] == "T1"
    # Stub gives perfect 96% RTP → should pass T1 0.05pp tolerance
    assert result.overall_pass
    assert result.diff_report is None


def test_orchestrator_emits_diff_on_failure():
    """Inject failing worker, verify diff report fires."""
    par = _synthetic_par()
    ir = _synthetic_ir()

    def bad_worker(ir, seed, spins):
        # Return RTP at 1.0 (way over target) → fails
        return SeedResult(
            seed=seed,
            spins=spins,
            total_won_x=spins * 1.0,  # 100% RTP
            hits=int(spins * 0.25),
            sum_sq_payout=spins * 100.0,
            max_win_x=4500.0,
            p99_9_win_x=2000.0,
            feature_trigger_counts={},
        )

    result = run_sweep(ir, par, Tier.T1, worker=bad_worker)
    assert not result.overall_pass
    assert result.diff_report is not None
    assert result.diff_report["failed_count"] >= 1


def test_orchestrator_writes_artefacts(tmp_path: Path):
    par = _synthetic_par()
    ir = _synthetic_ir()
    result = run_sweep(ir, par, Tier.T1, worker=_stub_worker)
    paths = write_sweep_artefacts(result, tmp_path)
    assert "attestation" in paths
    assert paths["attestation"].exists()
    loaded = json.loads(paths["attestation"].read_text())
    assert loaded["schema"] == "slot-math-mc-attestation/v1"


def test_orchestrator_writes_diff_when_fail(tmp_path: Path):
    par = _synthetic_par()
    ir = _synthetic_ir()

    def bad_worker(ir, seed, spins):
        return SeedResult(
            seed=seed, spins=spins, total_won_x=spins * 1.0, hits=int(spins * 0.25),
            sum_sq_payout=spins * 100.0, max_win_x=4500.0, p99_9_win_x=2000.0,
            feature_trigger_counts={},
        )

    result = run_sweep(ir, par, Tier.T1, worker=bad_worker)
    paths = write_sweep_artefacts(result, tmp_path)
    assert "diff_report" in paths
    assert paths["diff_report"].exists()
    assert "MC Sweep Diff Report" in paths["diff_report"].read_text()
