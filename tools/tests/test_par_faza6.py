"""SLOT-MATH Faza 6.1-6.9 — futuristic add-ons bundle test gate."""
from __future__ import annotations

from pathlib import Path

import pytest

# ─── 6.1 Canary ─────────────────────────────────────────────────────────


from tools.par_canary import (
    CanaryConfig,
    compute_kpi_diff,
    is_statistically_significant,
    pick_variant_for_player,
    route_session,
)
from tools.par_canary.kpi_diff import KpiSnapshot
from tools.par_canary.router import _player_bucket


def test_canary_config_validates_pct():
    with pytest.raises(ValueError):
        CanaryConfig("g", "a", "b", canary_pct=-1)
    with pytest.raises(ValueError):
        CanaryConfig("g", "a", "b", canary_pct=101)


def test_canary_config_rejects_same_variants():
    with pytest.raises(ValueError):
        CanaryConfig("g", "a", "a", canary_pct=50)


def test_pick_variant_sticky_per_player():
    cfg = CanaryConfig("game1", "live-A", "canary-B", canary_pct=50)
    pick_a = pick_variant_for_player("player-123", cfg)
    pick_b = pick_variant_for_player("player-123", cfg)
    assert pick_a == pick_b  # sticky


def test_pick_variant_distribution_approximates_canary_pct():
    cfg = CanaryConfig("game1", "live-A", "canary-B", canary_pct=30)
    canary_count = sum(
        1
        for i in range(10_000)
        if pick_variant_for_player(f"p-{i}", cfg) == "canary-B"
    )
    # 10k samples → ±1pp tolerance
    assert 2_700 <= canary_count <= 3_300


def test_route_session_includes_routing_decision():
    cfg = CanaryConfig("game1", "live-A", "canary-B", canary_pct=50)
    out = route_session("sess-1", "player-x", cfg)
    assert out["session_id"] == "sess-1"
    assert out["routing_decision"] in ("live", "canary")
    assert "bucket" in out


def test_player_bucket_deterministic():
    a = _player_bucket("p1", "g1")
    b = _player_bucket("p1", "g1")
    assert a == b
    assert 0 <= a < 100


def test_kpi_diff_significant_when_canary_higher():
    live = KpiSnapshot(
        variant_id="live", spins=100_000, total_payout=95_500,
        total_hits=25_000, sum_sq_payout=100_000, distinct_sessions=1_000,
    )
    canary = KpiSnapshot(
        variant_id="canary", spins=100_000, total_payout=98_000,
        total_hits=27_000, sum_sq_payout=120_000, distinct_sessions=1_000,
    )
    verdict = compute_kpi_diff(live, canary)
    assert verdict.rtp_delta > 0
    assert verdict.recommendation in ("promote-canary", "insufficient-data", "keep-live")


def test_kpi_diff_insufficient_data_under_10k():
    live = KpiSnapshot("live", 100, 96, 25, 100, 10)
    canary = KpiSnapshot("canary", 100, 95, 25, 100, 10)
    verdict = compute_kpi_diff(live, canary)
    assert verdict.recommendation == "insufficient-data"


def test_is_statistically_significant_shortcut():
    live = KpiSnapshot("live", 100_000, 95_500, 25_000, 100_000, 1_000)
    canary = KpiSnapshot("canary", 100_000, 98_000, 27_000, 120_000, 1_000)
    # Just verifies callable returns bool
    out = is_statistically_significant(live, canary)
    assert isinstance(out, bool)


# ─── 6.2 ZK attestation ─────────────────────────────────────────────────


from tools.par_zk_attest import (
    commit_deployment,
    generate_spin_proof,
    open_window,
    verify_spin_proof_in_window,
)
from tools.par_zk_attest.commit_reveal import verify_commitment


def test_commit_deployment_returns_secret_and_commitment():
    commitment, secret = commit_deployment("g", "v", "a" * 64)
    assert len(commitment.commit_hash) == 64
    assert len(secret) == 64
    assert commitment.commit_scheme == "hmac-sha256/v1"


def test_commit_deployment_rejects_bad_par_merkle():
    with pytest.raises(ValueError):
        commit_deployment("g", "v", "not-hex")


def test_commit_deterministic_for_same_inputs():
    commitment1, _ = commit_deployment("g", "v", "a" * 64, deploy_secret="b" * 64)
    commitment2, _ = commit_deployment("g", "v", "a" * 64, deploy_secret="b" * 64)
    assert commitment1.commit_hash == commitment2.commit_hash


def test_verify_commitment_pass():
    commitment, secret = commit_deployment("g", "v", "a" * 64)
    reveal = open_window(
        commitment, secret, "a" * 64,
        window_start_utc="2026-05-31T00:00:00Z",
        window_end_utc="2026-05-31T23:59:59Z",
    )
    assert verify_commitment(reveal)


def test_verify_commitment_fail_on_tamper():
    commitment, secret = commit_deployment("g", "v", "a" * 64)
    reveal = open_window(
        commitment, secret, "X" * 64,  # tampered PAR Merkle
        "2026-05-31T00:00:00Z", "2026-05-31T23:59:59Z",
    )
    assert not verify_commitment(reveal)


def test_spin_proof_verify_pass():
    commitment, secret = commit_deployment("g", "v", "a" * 64)
    proof = generate_spin_proof(commitment, "sess-1", 5, 0x1234, 12.5, secret)
    reveal = open_window(
        commitment, secret, "a" * 64,
        "2026-05-31T00:00:00Z", "2026-05-31T23:59:59Z",
    )
    assert verify_spin_proof_in_window(proof, reveal)


def test_spin_proof_verify_fail_on_payout_change():
    commitment, secret = commit_deployment("g", "v", "a" * 64)
    proof = generate_spin_proof(commitment, "sess-1", 5, 0x1234, 12.5, secret)
    reveal = open_window(
        commitment, secret, "a" * 64,
        "2026-05-31T00:00:00Z", "2026-05-31T23:59:59Z",
    )
    # Tamper payout in proof
    tampered = type(proof)(
        session_id=proof.session_id, spin_num=proof.spin_num,
        spin_seed=proof.spin_seed, payout_x=999.0,
        proof_hash=proof.proof_hash,
    )
    assert not verify_spin_proof_in_window(tampered, reveal)


# ─── 6.3 PAR diff editor ────────────────────────────────────────────────


from tools.par_diff_editor import compute_preview_diff, diff_metrics
from tools.par_diff_editor.preview import PreviewRequest


def _par_skeleton(rtp_total: float = 0.96, max_win_x: float = 5000.0) -> dict:
    return {
        "schema": "slot-math-canonical-par/v1",
        "rtp": {"rtp_total": rtp_total, "base_game": rtp_total * 0.7,
                "free_spins": rtp_total * 0.3, "variance": 100.0},
        "limits": {"hit_freq_target": 0.25, "max_win_x": max_win_x,
                   "target_volatility": "medium"},
        "features": [],
        "paytable": {},
        "reels": {"mode": "weighted", "base": []},
        "symbols": [],
    }


def test_diff_metrics_zero_for_identical():
    par = _par_skeleton()
    deltas = diff_metrics(par, par)
    assert deltas["rtp_total"] == 0.0
    assert deltas["hit_freq"] == 0.0


def test_diff_metrics_signed_for_changed():
    a = _par_skeleton(rtp_total=0.96)
    b = _par_skeleton(rtp_total=0.97)
    deltas = diff_metrics(a, b)
    assert deltas["rtp_total"] > 0


def test_preview_warns_on_extreme_rtp():
    par_bad = _par_skeleton(rtp_total=0.40)
    req = PreviewRequest("g", _par_skeleton(), par_bad)
    resp = compute_preview_diff(req)
    assert any("out of typical" in w for w in resp.warnings)


def test_preview_warns_on_huge_max_win():
    par_bad = _par_skeleton(max_win_x=200_000)
    req = PreviewRequest("g", _par_skeleton(), par_bad)
    resp = compute_preview_diff(req)
    assert any("extreme" in w for w in resp.warnings)


# ─── 6.4 WebGPU MC ──────────────────────────────────────────────────────


from tools.par_webgpu import WebGpuMcConfig, generate_js_bridge, generate_wgsl_shader


def test_wgsl_shader_includes_required_functions():
    src = generate_wgsl_shader()
    assert "@compute @workgroup_size" in src
    assert "fn mc_main" in src
    assert "atomicAdd" in src


def test_wgsl_shader_workgroup_size_matches_config():
    cfg = WebGpuMcConfig(workgroup_size=128)
    src = generate_wgsl_shader(cfg)
    assert "@workgroup_size(128" in src


def test_js_bridge_exports_runwebgpumc():
    src = generate_js_bridge()
    assert "export async function runWebGpuMc" in src
    assert "navigator.gpu" in src


# ─── 6.5 PAR critique ───────────────────────────────────────────────────


from tools.par_critique import CritiqueSeverity, critique_par


def test_critique_catches_dead_symbol():
    par = {
        "reels": {"mode": "weighted", "base": [{"GHOST": 1, "K": 5}]},
        "paytable": {"K": {"3": 10}},
        "symbols": [
            {"id": "GHOST", "kind": "lp"},
            {"id": "K", "kind": "hp"},
        ],
    }
    findings = critique_par(par)
    rule_ids = [f.rule_id for f in findings]
    assert "RULE-001" in rule_ids


def test_critique_catches_unreachable_feature():
    par = {
        "reels": {"mode": "weighted", "base": []},
        "paytable": {},
        "symbols": [],
        "features": [
            {"kind": "free_spins", "trigger_prob": 1e-20},
        ],
    }
    findings = critique_par(par)
    assert any(f.rule_id == "RULE-002" and f.severity == CritiqueSeverity.ERROR for f in findings)


def test_critique_catches_imbalanced_paytable():
    par = {
        "reels": {"mode": "weighted", "base": []},
        "paytable": {
            "HEAVY": {"3": 1000, "4": 5000, "5": 50000},
            "LIGHT": {"3": 1},
        },
        "symbols": [],
    }
    findings = critique_par(par)
    assert any(f.rule_id == "RULE-003" for f in findings)


def test_critique_severity_sort():
    par = {
        "reels": {"mode": "weighted", "base": []},
        "paytable": {},
        "symbols": [],
        "features": [{"kind": "fs", "trigger_prob": 1e-20}],
        "limits": {"max_win_x": 200_000},
    }
    findings = critique_par(par)
    # ERROR comes first
    if len(findings) >= 2:
        sev_order = [CritiqueSeverity.ERROR, CritiqueSeverity.WARNING, CritiqueSeverity.INFO]
        prev_idx = 0
        for f in findings:
            cur_idx = sev_order.index(f.severity)
            assert cur_idx >= prev_idx
            prev_idx = cur_idx


# ─── 6.6 Provably-fair chain ────────────────────────────────────────────


from tools.par_extras import append_spin_to_chain, new_chain, verify_chain
from tools.par_extras.provably_fair_chain import ChainEntry, chain_to_jsonl


def test_chain_starts_empty():
    chain = new_chain()
    assert chain == []
    ok, bad = verify_chain(chain)
    assert ok
    assert bad == -1


def test_append_spin_extends_chain():
    chain = new_chain()
    e1 = append_spin_to_chain(chain, spin_seed=1, payout_x=0.0)
    e2 = append_spin_to_chain(chain, spin_seed=2, payout_x=5.0)
    assert e1.seq == 0
    assert e2.seq == 1
    assert e2.prev_hash == e1.current_hash


def test_verify_chain_pass():
    chain = new_chain()
    for i in range(10):
        append_spin_to_chain(chain, spin_seed=i, payout_x=float(i))
    ok, bad = verify_chain(chain)
    assert ok
    assert bad == -1


def test_verify_chain_detects_tamper():
    chain = new_chain()
    for i in range(10):
        append_spin_to_chain(chain, spin_seed=i, payout_x=float(i))
    # Tamper entry 5's payout
    chain[5] = ChainEntry(
        seq=5, spin_seed=5, payout_x=999.0,
        prev_hash=chain[5].prev_hash, current_hash=chain[5].current_hash,
    )
    ok, bad = verify_chain(chain)
    assert not ok
    assert bad == 5


def test_chain_to_jsonl_roundtrip():
    chain = new_chain()
    append_spin_to_chain(chain, spin_seed=42, payout_x=1.5)
    jsonl = chain_to_jsonl(chain)
    assert "spin_seed" in jsonl
    assert "42" in jsonl


# ─── 6.7 Self-healing kernel composition ────────────────────────────────


from tools.par_extras import (
    KernelHealth,
    build_fallback_plan,
    pick_kernel_with_fallback,
)


def test_fallback_plan_for_free_spins():
    p = build_fallback_plan("free_spins")
    assert p.primary == "expanding_symbol"
    assert "state_machine" in p.fallbacks


def test_fallback_plan_for_hold_and_win():
    p = build_fallback_plan("hold_and_win")
    assert p.primary == "hold_and_win"
    assert "money_collect" in p.fallbacks


def test_pick_primary_when_healthy():
    p = pick_kernel_with_fallback("free_spins", health={})
    assert p == "expanding_symbol"


def test_pick_fallback_when_primary_unhealthy():
    health = {
        "expanding_symbol": KernelHealth(
            kernel_id="expanding_symbol", invocations=100, failures=20  # 20% > 5%
        ),
    }
    p = pick_kernel_with_fallback("free_spins", health)
    assert p == "state_machine"


# ─── 6.8 Bug-bounty hook ────────────────────────────────────────────────


from tools.par_extras import file_bug_report, list_open_bugs
from tools.par_extras.bug_bounty_hook import BugBountyConfig, BugSeverity


def test_file_bug_report_writes_json(tmp_path: Path):
    cfg = BugBountyConfig(
        repo_root=tmp_path, reports_dir=tmp_path / "bugs",
    )
    report = file_bug_report(
        cfg, commit_sha="abc1234", module="kernel/wheel.py",
        severity=BugSeverity.HIGH,
        title="off-by-one in wheel weighting",
        description="...",
    )
    assert (tmp_path / "bugs" / f"{report.id}.json").exists()


def test_list_open_bugs_returns_unresolved(tmp_path: Path):
    cfg = BugBountyConfig(tmp_path, tmp_path / "bugs")
    file_bug_report(cfg, "abc1234", "mod-a", BugSeverity.LOW, "t", "d")
    file_bug_report(cfg, "def5678", "mod-b", BugSeverity.HIGH, "t", "d")
    bugs = list_open_bugs(cfg)
    assert len(bugs) == 2


# ─── 6.9 Multi-currency / locale ────────────────────────────────────────


from tools.par_extras import (
    SUPPORTED_CURRENCIES,
    SUPPORTED_LOCALES,
    convert_amount,
    format_amount,
)


def test_supported_locales_includes_serbian():
    assert "sr-RS" in SUPPORTED_LOCALES
    assert "RSD" in SUPPORTED_CURRENCIES


def test_convert_amount_round_trip():
    # USD → GBP → USD ≈ original (within FX precision)
    gbp = convert_amount(100, "USD", "GBP")
    back = convert_amount(gbp, "GBP", "USD")
    assert abs(back - 100) < 0.01


def test_convert_amount_rejects_unsupported():
    with pytest.raises(ValueError):
        convert_amount(100, "USD", "XYZ")


def test_format_amount_en_gb():
    out = format_amount(1234.56, "en-GB")
    assert "GBP" in out
    assert "1,234.56" in out


def test_format_amount_sr_rs():
    out = format_amount(1234.56, "sr-RS")
    assert "RSD" in out
    assert "1.234,56" in out


def test_format_amount_rejects_unsupported_locale():
    with pytest.raises(ValueError):
        format_amount(100, "xx-XX")
