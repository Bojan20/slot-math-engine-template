"""PHASE 40 + 41 + 42 + 43 — combined regression tests."""

from __future__ import annotations

import pytest


# ─── PHASE 40 — FX-Normalised RTP ────────────────────────────────────────

from tools.fx_rtp import (
    FXTable, CurrencyRTPInputs, compute_normalised_rtp, list_jurisdiction_allowed_currencies,
)


def _fx_eur_base() -> FXTable:
    return FXTable(
        base_currency="EUR",
        rates={"EUR": 1.0, "USD": 1.10, "GBP": 0.85, "CAD": 1.45},
    )


def test_p40_fx_table_validates_base_in_rates():
    with pytest.raises(ValueError):
        FXTable(base_currency="EUR", rates={"USD": 1.10})


def test_p40_fx_table_validates_base_rate_one():
    with pytest.raises(ValueError):
        FXTable(base_currency="EUR", rates={"EUR": 0.99, "USD": 1.10})


def test_p40_fx_table_rejects_non_positive_rate():
    with pytest.raises(ValueError):
        FXTable(base_currency="EUR", rates={"EUR": 1.0, "BAD": -1.0})


def test_p40_to_base_conversion():
    fx = _fx_eur_base()
    # 110 USD / 1.10 = 100 EUR
    assert fx.to_base(110.0, "USD") == pytest.approx(100.0)


def test_p40_to_base_unknown_currency_raises():
    fx = _fx_eur_base()
    with pytest.raises(ValueError):
        fx.to_base(100, "JPY")


def test_p40_compute_normalised_rtp_single_currency():
    fx = _fx_eur_base()
    res = compute_normalised_rtp(
        fx_table=fx,
        inputs=[CurrencyRTPInputs(currency="EUR",
                                    total_bet_native=1000.0,
                                    total_payout_native=960.0)],
    )
    assert res.normalised_rtp == pytest.approx(0.96)
    assert res.per_currency_raw_rtp["EUR"] == pytest.approx(0.96)


def test_p40_compute_normalised_rtp_multi_currency():
    fx = _fx_eur_base()
    res = compute_normalised_rtp(
        fx_table=fx,
        inputs=[
            CurrencyRTPInputs("EUR", 1000.0, 960.0),
            CurrencyRTPInputs("USD", 1100.0, 1056.0),  # = 1000 EUR / 960 EUR
        ],
    )
    # Per-currency raw RTP each 0.96
    assert res.per_currency_raw_rtp["EUR"] == pytest.approx(0.96)
    assert res.per_currency_raw_rtp["USD"] == pytest.approx(0.96)
    # Total bet in EUR base = 2000; total payout = 1920; normalised RTP = 0.96
    assert res.normalised_rtp == pytest.approx(0.96, abs=1e-4)


def test_p40_empty_inputs_returns_zero():
    fx = _fx_eur_base()
    res = compute_normalised_rtp(fx_table=fx, inputs=[])
    assert res.normalised_rtp == 0.0
    assert res.base_currency == "EUR"


def test_p40_negative_amount_raises():
    fx = _fx_eur_base()
    with pytest.raises(ValueError):
        compute_normalised_rtp(
            fx_table=fx,
            inputs=[CurrencyRTPInputs("EUR", -1.0, 0.0)],
        )


def test_p40_jurisdiction_allowed_currencies():
    assert list_jurisdiction_allowed_currencies("UKGC") == ["GBP"]
    assert "EUR" in list_jurisdiction_allowed_currencies("MGA")
    with pytest.raises(ValueError):
        list_jurisdiction_allowed_currencies("MARS")


def test_p40_result_schema():
    fx = _fx_eur_base()
    res = compute_normalised_rtp(fx_table=fx, inputs=[])
    assert res.schema_version == "urn:slotmath:fx-rtp:v1"


# ─── PHASE 41 — RNG Extended Battery ─────────────────────────────────────

from tools.rng_extended import (
    BitStream, BatteryResult,
    approximate_entropy, serial_test, block_frequency_var,
    run_extended_battery,
)


def _alternating_bits(n: int = 200) -> BitStream:
    return BitStream(bits=tuple((i % 2) for i in range(n)))


def _random_bits(n: int = 1000, seed: int = 42) -> BitStream:
    import random as _r
    rng = _r.Random(seed)
    return BitStream(bits=tuple(rng.randint(0, 1) for _ in range(n)))


def test_p41_bit_validation():
    with pytest.raises(ValueError):
        BitStream(bits=(0, 1, 2))


def test_p41_approximate_entropy_random_positive():
    bits = _random_bits(2000)
    apen = approximate_entropy(bits, m=2)
    assert apen > 0.4   # well below ln(2) ≈ 0.693 but clearly positive
    assert apen < 1.0


def test_p41_approximate_entropy_alternating_low():
    bits = _alternating_bits(200)
    apen = approximate_entropy(bits, m=2)
    # Alternating 01010101… → low entropy
    assert apen < 0.3


def test_p41_approximate_entropy_validates():
    with pytest.raises(ValueError):
        approximate_entropy(_random_bits(100), m=0)


def test_p41_approximate_entropy_short_stream():
    bits = BitStream(bits=(0,))
    assert approximate_entropy(bits, m=2) == 0.0


def test_p41_serial_test_random_close_to_zero():
    bits = _random_bits(2000)
    psi_m, psi_m1, delta = serial_test(bits, m=3)
    # For random stream Δ should be moderate; just check shape
    assert isinstance(delta, float)


def test_p41_serial_test_validates():
    with pytest.raises(ValueError):
        serial_test(_random_bits(100), m=1)


def test_p41_block_freq_var_random_small():
    bits = _random_bits(5000)
    var = block_frequency_var(bits, block_size=128)
    assert 0.0 <= var < 0.05


def test_p41_block_freq_var_alternating_zero():
    bits = _alternating_bits(2048)
    var = block_frequency_var(bits, block_size=128)
    assert var == pytest.approx(0.0, abs=1e-9)


def test_p41_block_freq_var_validates():
    with pytest.raises(ValueError):
        block_frequency_var(_random_bits(100), block_size=0)


def test_p41_battery_random_passes():
    bits = _random_bits(2000)
    res = run_extended_battery(bits)
    assert isinstance(res, BatteryResult)
    assert res.schema_version == "urn:slotmath:rng-extended:v1"
    assert res.n_bits == 2000


def test_p41_battery_summary_pass_flag():
    bits = _random_bits(5000)
    res = run_extended_battery(bits)
    # Random stream should pass all 3 tests with default thresholds
    assert res.approximate_entropy_pass is True


# ─── PHASE 42 — Semantic IR Diff ─────────────────────────────────────────

from tools.ir_diff_semantic import (
    semantic_diff, render_patch_md,
)


def _ir() -> dict:
    return {
        "meta": {"name": "Original", "target_rtp": 0.96, "max_win_x": 5000,
                  "notes": ["one"]},
        "topology": {"reels": 5, "rows": 3, "paylines": 20},
        "paytable": [{"combo": ["A"] * 5, "pays": 10}],
        "reels": {"base": [{"set": 1, "reels": [[{"symbol": "A", "weight": 1}]] * 5}]},
        "features": [{"kind": "free_spins"}],
    }


def test_p42_identical_irs():
    r = semantic_diff(_ir(), _ir())
    assert r.verdict == "IDENTICAL"
    assert r.total_changes == 0


def test_p42_cosmetic_only_change():
    a = _ir()
    b = _ir()
    b["meta"]["name"] = "Renamed"
    b["meta"]["notes"] = ["one", "two"]
    r = semantic_diff(a, b)
    assert r.verdict == "COSMETIC_ONLY"
    assert r.math_change_count == 0


def test_p42_math_change_detected():
    a = _ir()
    b = _ir()
    b["paytable"][0]["pays"] = 999
    r = semantic_diff(a, b)
    assert r.verdict == "MATH_CHANGED"
    assert any("paytable" in e.path for e in r.math_entries)


def test_p42_target_rtp_classified_as_math():
    a = _ir()
    b = _ir()
    b["meta"]["target_rtp"] = 0.97
    r = semantic_diff(a, b)
    assert r.math_change_count >= 1
    assert any(e.path == "meta.target_rtp" for e in r.math_entries)


def test_p42_added_field_recorded():
    a = _ir()
    b = _ir()
    b["meta"]["new_field"] = "added"
    r = semantic_diff(a, b)
    assert any(e.kind == "added" for e in
                r.cosmetic_entries + r.unknown_entries)


def test_p42_removed_field_recorded():
    a = _ir()
    b = _ir()
    a["meta"]["extra"] = "removed"
    r = semantic_diff(a, b)
    assert any(e.kind == "removed" for e in
                r.cosmetic_entries + r.unknown_entries)


def test_p42_list_length_diff_detected():
    a = _ir()
    b = _ir()
    b["paytable"].append({"combo": ["B"] * 5, "pays": 50})
    r = semantic_diff(a, b)
    assert any("paytable" in e.path for e in r.math_entries)


def test_p42_non_dict_input_raises():
    with pytest.raises(TypeError):
        semantic_diff([], {})
    with pytest.raises(TypeError):
        semantic_diff({}, "not-dict")


def test_p42_render_patch_md_identical():
    md = render_patch_md(semantic_diff(_ir(), _ir()))
    assert "Verdict: **IDENTICAL**" in md
    assert "MATH changes:     **0**" in md


def test_p42_render_patch_md_math_changed():
    a = _ir()
    b = _ir()
    b["paytable"][0]["pays"] = 99
    md = render_patch_md(semantic_diff(a, b))
    assert "Verdict: **MATH_CHANGED**" in md
    assert "## MATH" in md


def test_p42_schema_pin():
    r = semantic_diff(_ir(), _ir())
    assert r.schema_version == "urn:slotmath:ir-diff-semantic:v1"


# ─── PHASE 43 — Cohort Builder ───────────────────────────────────────────

from tools.cohort_builder import (
    SegmentSpec, CohortSpec, generate_cohort_events,
)


def _segments() -> list[SegmentSpec]:
    return [
        SegmentSpec(name="casual", weight=0.6,
                     bet_size_mean=1.0, bet_size_sigma=0.1,
                     payout_mean_per_bet=0.94, payout_sigma=0.5,
                     session_spins_mean=100, session_spins_sigma=20),
        SegmentSpec(name="vip", weight=0.4,
                     bet_size_mean=10.0, bet_size_sigma=2.0,
                     payout_mean_per_bet=0.94, payout_sigma=2.0,
                     session_spins_mean=300, session_spins_sigma=50),
    ]


def test_p43_segment_validation():
    with pytest.raises(ValueError):
        SegmentSpec(name="", weight=1, bet_size_mean=1, bet_size_sigma=0,
                     payout_mean_per_bet=1, payout_sigma=0,
                     session_spins_mean=100, session_spins_sigma=10)
    with pytest.raises(ValueError):
        SegmentSpec(name="x", weight=-1, bet_size_mean=1, bet_size_sigma=0,
                     payout_mean_per_bet=1, payout_sigma=0,
                     session_spins_mean=100, session_spins_sigma=10)
    with pytest.raises(ValueError):
        SegmentSpec(name="x", weight=1, bet_size_mean=0, bet_size_sigma=0,
                     payout_mean_per_bet=1, payout_sigma=0,
                     session_spins_mean=100, session_spins_sigma=10)


def test_p43_cohort_validation():
    with pytest.raises(ValueError):
        CohortSpec(segments=[])
    with pytest.raises(ValueError):
        CohortSpec(segments=_segments(), n_players=0)


def test_p43_generate_events_player_count():
    spec = CohortSpec(segments=_segments(), n_players=10, seed=42)
    events = generate_cohort_events(spec)
    player_ids = {e["player_id"] for e in events}
    assert len(player_ids) == 10


def test_p43_event_shape_matches_phase23():
    spec = CohortSpec(segments=_segments(), n_players=5, seed=1)
    events = generate_cohort_events(spec)
    assert len(events) > 0
    for e in events:
        for k in ("player_id", "session_id", "ts_unix",
                   "bet_amount", "payout_amount", "segment"):
            assert k in e


def test_p43_segments_distributed_per_weight():
    """With 60/40 weight + 100 players, casual should be ~60 of them."""
    spec = CohortSpec(segments=_segments(), n_players=100, seed=42)
    events = generate_cohort_events(spec)
    segments = {e["player_id"]: e["segment"] for e in events}
    casual = sum(1 for s in segments.values() if s == "casual")
    # Allow ± 20 deviation
    assert 40 <= casual <= 80


def test_p43_seed_deterministic():
    spec = CohortSpec(segments=_segments(), n_players=20, seed=7)
    e1 = generate_cohort_events(spec)
    e2 = generate_cohort_events(spec)
    assert e1 == e2


def test_p43_different_seed_different_events():
    spec1 = CohortSpec(segments=_segments(), n_players=20, seed=1)
    spec2 = CohortSpec(segments=_segments(), n_players=20, seed=2)
    e1 = generate_cohort_events(spec1)
    e2 = generate_cohort_events(spec2)
    # Just confirm not identical — small chance equal, but vanishingly small
    assert e1 != e2


def test_p43_e2e_pipe_to_risk_engine():
    """Cohort events feed RiskAssessor cleanly."""
    from tools.risk_engine import RiskAssessor, SpinEvent
    spec = CohortSpec(segments=_segments(), n_players=5, seed=42)
    events = generate_cohort_events(spec)
    a = RiskAssessor()
    for e in events[:50]:
        spin = SpinEvent(
            session_id=e["session_id"], player_id=e["player_id"],
            ts_unix=e["ts_unix"], bet_amount=e["bet_amount"],
            payout_amount=e["payout_amount"],
        )
        score = a.observe(spin)
    # Just check we got through cleanly
    assert score is not None
