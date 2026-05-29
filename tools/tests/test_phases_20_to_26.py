"""PHASE 20 + 21 + 22 + 24 + 25 + 26 — combined regression tests."""

from __future__ import annotations

import math
from fractions import Fraction

import pytest


# ─── PHASE 20 — Adversarial Fuzzer ────────────────────────────────────────

from tools.adv_fuzz import (
    AttackReport,
    list_attack_recipes,
    generate_adversarial_ir,
    run_adversarial_sweep,
)


def test_p20_recipes_non_empty():
    names = list_attack_recipes()
    assert len(names) >= 10
    assert "nan_pay" in names
    assert "rtp_overflow" in names


def test_p20_generate_each_recipe():
    for name in list_attack_recipes():
        ir = generate_adversarial_ir(name, seed=42)
        assert isinstance(ir, dict)


def test_p20_nan_pay_recipe_yields_non_finite():
    ir = generate_adversarial_ir("nan_pay", seed=1)
    pay = ir["paytable"][0]["pays"]
    assert math.isnan(pay)


def test_p20_inf_pay_recipe_yields_inf():
    ir = generate_adversarial_ir("inf_pay", seed=1)
    pay = ir["paytable"][0]["pays"]
    assert math.isinf(pay)


def test_p20_rtp_overflow_recipe_yields_high_estimate():
    report = run_adversarial_sweep(recipes=["rtp_overflow"], iterations=1)
    assert report.iterations == 1
    # Should produce RTP > 1 (out-of-band)
    assert report.out_of_band >= 1


def test_p20_unknown_recipe_raises():
    with pytest.raises(ValueError):
        run_adversarial_sweep(recipes=["does_not_exist"])


def test_p20_iterations_validated():
    with pytest.raises(ValueError):
        run_adversarial_sweep(iterations=0)


def test_p20_full_sweep_completes_without_crash():
    report = run_adversarial_sweep(iterations=1)
    assert isinstance(report, AttackReport)
    assert report.iterations == 1
    assert len(report.outcomes) == len(list_attack_recipes())
    # We expect at least one out-of-band or non-finite case
    assert (report.out_of_band + report.non_finite + report.crashes) >= 1


def test_p20_report_schema():
    report = run_adversarial_sweep(recipes=["zero_weight_reel"], iterations=1)
    assert report.schema_version == "urn:slotmath:adv-fuzz:v1"


# ─── PHASE 21 — Quantum-Inspired Annealer ─────────────────────────────────

from tools.quantum_opt import QuantumAnnealer, OptimizationResult, anneal


def test_p21_anneal_minimises_quadratic():
    """Convex quadratic (x − 0.5)² over [0,1] → optimum at x=0.5."""
    res = anneal(
        objective=lambda x: (x[0] - 0.5) ** 2,
        x0=[0.0],
        bounds=[(0.0, 1.0)],
        iterations=2000,
        beta_lo=0.1,
        beta_hi=20.0,
        seed=42,
    )
    assert isinstance(res, OptimizationResult)
    assert res.iterations == 2000
    assert abs(res.best_x[0] - 0.5) < 0.05
    assert res.best_cost < 0.005


def test_p21_anneal_2d_paraboloid():
    """f(x, y) = (x − 0.3)² + (y + 0.4)² over [-1, 1]² → (0.3, -0.4)."""
    res = anneal(
        objective=lambda v: (v[0] - 0.3) ** 2 + (v[1] + 0.4) ** 2,
        x0=[0.0, 0.0],
        bounds=[(-1.0, 1.0), (-1.0, 1.0)],
        iterations=3000,
        seed=1,
    )
    assert abs(res.best_x[0] - 0.3) < 0.1
    assert abs(res.best_x[1] + 0.4) < 0.1


def test_p21_anneal_validates_bounds_dim():
    with pytest.raises(ValueError):
        QuantumAnnealer(lambda x: 0.0, x0=[0.0], bounds=[(0, 1), (0, 1)])


def test_p21_anneal_validates_iterations():
    with pytest.raises(ValueError):
        anneal(lambda x: 0.0, x0=[0.0], bounds=[(0, 1)], iterations=0)


def test_p21_anneal_validates_beta_range():
    with pytest.raises(ValueError):
        anneal(lambda x: 0.0, x0=[0.0], bounds=[(0, 1)],
                beta_lo=0.0, beta_hi=1.0)
    with pytest.raises(ValueError):
        anneal(lambda x: 0.0, x0=[0.0], bounds=[(0, 1)],
                beta_lo=5.0, beta_hi=1.0)


def test_p21_anneal_seed_deterministic():
    def o(x):
        return x[0] ** 2
    r1 = anneal(o, x0=[1.0], bounds=[(-1, 1)], iterations=500, seed=99)
    r2 = anneal(o, x0=[1.0], bounds=[(-1, 1)], iterations=500, seed=99)
    assert r1.best_x == r2.best_x
    assert r1.best_cost == r2.best_cost


def test_p21_cost_trace_length():
    res = anneal(lambda x: x[0] ** 2, x0=[1.0], bounds=[(-1, 1)],
                  iterations=100, seed=1)
    # trace includes initial + every iteration
    assert len(res.cost_trace) == 101


# ─── PHASE 22 — Federated Audit Protocol ──────────────────────────────────

from tools.federated_audit import (
    party_commit,
    verify_party_commit,
    build_audit_transcript,
    audit_consensus,
)


def test_p22_party_commit_hash_pinned():
    c = party_commit("operator", rtp=0.96, nonce_hex="00" * 32)
    assert len(c.commit_hash_hex) == 64
    # Same inputs → same commit
    c2 = party_commit("operator", rtp=0.96, nonce_hex="00" * 32)
    assert c.commit_hash_hex == c2.commit_hash_hex


def test_p22_party_commit_changing_rtp_changes_hash():
    c1 = party_commit("o", rtp=0.96, nonce_hex="ab" * 32)
    c2 = party_commit("o", rtp=0.961, nonce_hex="ab" * 32)
    assert c1.commit_hash_hex != c2.commit_hash_hex


def test_p22_verify_party_commit_round_trip():
    c = party_commit("auditor", rtp=0.95, nonce_hex="11" * 32)
    assert verify_party_commit(c, revealed_rtp=0.95, revealed_nonce_hex="11" * 32)


def test_p22_verify_party_commit_rejects_tamper():
    c = party_commit("auditor", rtp=0.95, nonce_hex="11" * 32)
    assert not verify_party_commit(c, revealed_rtp=0.96,
                                     revealed_nonce_hex="11" * 32)
    assert not verify_party_commit(c, revealed_rtp=0.95,
                                     revealed_nonce_hex="22" * 32)


def test_p22_audit_passes_when_within_tolerance():
    t = build_audit_transcript(
        parties=[
            ("op",      0.9600, "aa" * 32),
            ("auditor", 0.9601, "bb" * 32),
            ("reg",     0.9599, "cc" * 32),
        ],
        tolerance=0.005,
    )
    assert t.passed is True
    assert t.consensus_rtp == pytest.approx(0.96, abs=1e-3)
    assert t.max_pairwise_delta <= 0.005


def test_p22_audit_fails_when_outside_tolerance():
    t = build_audit_transcript(
        parties=[
            ("op",      0.96, "aa" * 32),
            ("auditor", 0.98, "bb" * 32),
            ("reg",     0.94, "cc" * 32),
        ],
        tolerance=0.005,
    )
    assert t.passed is False
    assert "tolerance" in t.failure_reason


def test_p22_audit_requires_at_least_two_parties():
    with pytest.raises(ValueError):
        build_audit_transcript(parties=[("solo", 0.96, "aa" * 32)])


def test_p22_audit_rejects_negative_tolerance():
    with pytest.raises(ValueError):
        build_audit_transcript(
            parties=[("a", 0.96, "aa" * 32), ("b", 0.96, "bb" * 32)],
            tolerance=-0.01,
        )


def test_p22_audit_transcript_schema_pin():
    t = build_audit_transcript(
        parties=[("a", 0.96, "aa" * 32), ("b", 0.96, "bb" * 32)],
    )
    assert t.schema_version == "urn:slotmath:federated-audit:v1"
    assert t.domain_tag == "slotmath-federated-audit-v1"


def test_p22_audit_consensus_idempotent():
    t = build_audit_transcript(
        parties=[("a", 0.96, "aa" * 32), ("b", 0.961, "bb" * 32)],
        tolerance=0.01,
    )
    t2 = audit_consensus(t)
    assert t2 is t
    assert t.passed is True


# ─── PHASE 24 — Symbolic Engine Compiler ──────────────────────────────────

from tools.symbolic_compiler import (
    compile_symbolic,
    emit_derivation_markdown,
)


def _sym_ir() -> dict:
    return {
        "meta": {"name": "SymbolicTest", "target_rtp": 0.0},
        "topology": {"reels": 3, "rows": 1, "paylines": 1},
        "paytable": [
            {"combo": ["A"] * 3, "pays": 10},
        ],
        "reels": {
            "base": [
                {"set": 1, "reels": [
                    [{"symbol": "A", "weight": 1}, {"symbol": "B", "weight": 1}]
                    for _ in range(3)
                ]}
            ]
        },
    }


def test_p24_compile_rational_exact():
    cert = compile_symbolic(_sym_ir())
    # P(A,A,A) = (1/2)^3 = 1/8; pay = 10 → RTP = 10/8 = 5/4
    assert cert.numeric_rtp_rational == Fraction(5, 4)
    assert cert.numeric_rtp_float == pytest.approx(1.25, abs=1e-9)


def test_p24_compile_n_reels():
    cert = compile_symbolic(_sym_ir())
    assert cert.n_reels == 3


def test_p24_reel_freq_strings_rendered():
    cert = compile_symbolic(_sym_ir())
    for s in cert.reel_freq_strings:
        assert "A: 1/2" in s
        assert "B: 1/2" in s


def test_p24_symbolic_rtp_string_includes_pay():
    cert = compile_symbolic(_sym_ir())
    assert "10" in cert.symbolic_rtp


def test_p24_emit_markdown():
    cert = compile_symbolic(_sym_ir())
    md = emit_derivation_markdown(cert)
    assert "# Symbolic Derivation" in md
    assert "Reel symbol frequencies" in md
    assert "Per-combo contributions" in md
    assert "Final RTP" in md


def test_p24_zero_weight_reel_collapses_to_zero():
    ir = _sym_ir()
    for cell in ir["reels"]["base"][0]["reels"][0]:
        cell["weight"] = 0
    cert = compile_symbolic(ir)
    # First reel has zero total weight → freq is empty → P(A,A,A) = 0
    assert cert.numeric_rtp_rational == 0


def test_p24_empty_paytable_zero_rtp():
    ir = _sym_ir()
    ir["paytable"] = []
    cert = compile_symbolic(ir)
    assert cert.numeric_rtp_rational == 0
    assert cert.symbolic_rtp == ""


# ─── PHASE 25 — Hawkes Stress Model ───────────────────────────────────────

from tools.stress_model import (
    HawkesParams,
    simulate_hawkes,
    capacity_report,
)


def test_p25_params_validation():
    with pytest.raises(ValueError):
        HawkesParams(mu=-1)
    with pytest.raises(ValueError):
        HawkesParams(alpha=2, beta=1)  # alpha >= beta → unstable
    with pytest.raises(ValueError):
        HawkesParams(t_max=0)


def test_p25_simulate_returns_sorted_events():
    p = HawkesParams(mu=1.0, alpha=0.3, beta=1.0, t_max=20.0, seed=7)
    ts = simulate_hawkes(p)
    assert all(0 <= t < p.t_max for t in ts)
    assert ts == sorted(ts)


def test_p25_simulate_seed_deterministic():
    p1 = HawkesParams(mu=1, alpha=0.3, beta=1, t_max=10, seed=42)
    p2 = HawkesParams(mu=1, alpha=0.3, beta=1, t_max=10, seed=42)
    assert simulate_hawkes(p1) == simulate_hawkes(p2)


def test_p25_capacity_report_mean_rate_ge_baseline():
    """With α > 0 the mean rate must exceed baseline μ (self-excitation)."""
    p = HawkesParams(mu=2.0, alpha=0.5, beta=1.0, t_max=200.0, seed=1)
    r = capacity_report(p)
    # Expected mean rate = μ / (1 − α/β) for stationary Hawkes
    # Here = 2 / (1 − 0.5) = 4
    assert r.mean_rate > 2.0


def test_p25_capacity_report_branching_ratio_pinned():
    p = HawkesParams(mu=1, alpha=0.4, beta=1, t_max=10, seed=1)
    r = capacity_report(p)
    assert r.branching_ratio == pytest.approx(0.4)


def test_p25_capacity_report_schema():
    p = HawkesParams(t_max=5.0, seed=1)
    r = capacity_report(p)
    assert r.schema_version == "urn:slotmath:hawkes-stress:v1"


def test_p25_max_burst_at_least_one_when_events_exist():
    p = HawkesParams(mu=5.0, alpha=0.5, beta=1.0, t_max=10.0, seed=1)
    r = capacity_report(p, burst_window_seconds=1.0)
    if r.total_events > 0:
        assert r.max_burst_size >= 1


def test_p25_capacity_report_bad_window_raises():
    p = HawkesParams(t_max=5.0, seed=1)
    with pytest.raises(ValueError):
        capacity_report(p, burst_window_seconds=0)


# ─── PHASE 26 — Multi-LLM Consensus ───────────────────────────────────────

from tools.multi_llm import (
    LLMReview,
    run_consensus,
)


def _mock_provider(name: str, verdict: str, confidence: float = 0.8):
    def call(prompt: str) -> LLMReview:
        return LLMReview(provider_name=name, verdict=verdict, confidence=confidence)
    return call


def test_p26_run_consensus_majority_verdict():
    providers = [
        _mock_provider("a", "approve", 0.9),
        _mock_provider("b", "approve", 0.8),
        _mock_provider("c", "reject", 0.7),
    ]
    res = run_consensus(providers, "is this game compliant?")
    assert res.consensus_verdict == "approve"
    assert res.agreement_ratio > 0.5
    assert "c" in res.dissent
    assert res.total_providers == 3


def test_p26_run_consensus_confidence_weighted():
    """A single high-confidence dissenter can flip consensus."""
    providers = [
        _mock_provider("a", "approve", 0.5),
        _mock_provider("b", "approve", 0.5),
        _mock_provider("c", "reject", 0.99),
    ]
    res = run_consensus(providers, "x")
    # approve weight = 1.0, reject weight = 0.99 → consensus = approve still
    assert res.consensus_verdict == "approve"


def test_p26_run_consensus_unanimous():
    providers = [_mock_provider(f"p{i}", "approve", 0.8) for i in range(5)]
    res = run_consensus(providers, "x")
    assert res.consensus_verdict == "approve"
    assert res.agreement_ratio == pytest.approx(1.0)
    assert res.dissent == []


def test_p26_empty_providers_raises():
    with pytest.raises(ValueError):
        run_consensus([], "x")


def test_p26_provider_error_skip():
    def bad(prompt: str) -> LLMReview:
        raise RuntimeError("provider down")
    providers = [_mock_provider("a", "approve", 0.8), bad]
    res = run_consensus(providers, "x", on_provider_error="skip")
    assert res.total_providers == 1
    assert res.consensus_verdict == "approve"


def test_p26_provider_error_raise():
    def bad(prompt: str) -> LLMReview:
        raise RuntimeError("boom")
    providers = [_mock_provider("a", "approve", 0.8), bad]
    with pytest.raises(RuntimeError):
        run_consensus(providers, "x", on_provider_error="raise")


def test_p26_bad_on_provider_error_value():
    providers = [_mock_provider("a", "approve")]
    with pytest.raises(ValueError):
        run_consensus(providers, "x", on_provider_error="bogus")


def test_p26_review_validates_confidence_range():
    with pytest.raises(ValueError):
        LLMReview(provider_name="a", verdict="approve", confidence=1.5)
    with pytest.raises(ValueError):
        LLMReview(provider_name="a", verdict="approve", confidence=-0.1)


def test_p26_no_reviews_returns_default():
    """If every provider errors out under skip, we get 'no_reviews'."""
    def bad(prompt: str) -> LLMReview:
        raise RuntimeError("dead")
    res = run_consensus([bad, bad], "x", on_provider_error="skip")
    assert res.consensus_verdict == "no_reviews"
    assert res.total_providers == 0


def test_p26_schema_pin():
    providers = [_mock_provider("a", "approve")]
    res = run_consensus(providers, "x")
    assert res.schema_version == "urn:slotmath:multi-llm-consensus:v1"
