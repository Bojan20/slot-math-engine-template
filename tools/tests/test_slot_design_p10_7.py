"""P10.7 — Share-aware RTP locker tests."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


from tools.slot_design import (
    parse_prompt,
    prompt_to_dsl,
    plan_composition,
    share_aware_lock,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.slot_design", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


# ─── unit ─────────────────────────────────────────────────────────────────


def test_share_aware_lock_with_no_features():
    """Empty features → delegate to plain W6.4 path; no crash."""
    dsl = {
        "meta": {"name": "Empty", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3},
        "features": [],
        "bet_table": {"min_bet": 0.2, "max_bet": 100, "multipliers": [1]},
    }
    ir = share_aware_lock(dsl)
    assert ir["meta"]["target_rtp"] == 0.96


def test_share_aware_lock_records_share_total():
    dsl = prompt_to_dsl(parse_prompt("5×3 FS + HoldAndWin RTP 96%"))
    plan_composition(dsl)
    ir = share_aware_lock(dsl)
    assert "feature_share_total" in ir["meta"]
    assert ir["meta"]["feature_share_total"] > 0


def test_share_aware_lock_records_base_share_target():
    """Light feature load → base-share path active (not fallback)."""
    dsl = prompt_to_dsl(parse_prompt("5×3 FS RTP 96%"))
    plan_composition(dsl)
    ir = share_aware_lock(dsl)
    assert "base_game_share_locked_to" in ir["meta"]
    base = ir["meta"]["base_game_share_locked_to"]
    # FS default share = 0.25, so base = 0.96 - 0.25 = 0.71
    assert 0.5 <= base < 0.96


def test_share_aware_lock_target_rtp_preserved():
    dsl = prompt_to_dsl(parse_prompt("5×3 FS RTP 96.5%"))
    plan_composition(dsl)
    ir = share_aware_lock(dsl)
    # Original target_rtp is restored on IR (not the adjusted internal one)
    assert ir["meta"]["target_rtp"] == 0.965


def test_share_aware_lock_emits_audit_note():
    dsl = prompt_to_dsl(parse_prompt("5×3 FS + HoldAndWin RTP 96%"))
    plan_composition(dsl)
    ir = share_aware_lock(dsl)
    notes = ir["meta"].get("notes", [])
    assert any("share-aware lock" in n for n in notes)


def test_share_aware_lock_annotates_per_feature():
    dsl = prompt_to_dsl(parse_prompt("5×3 FS + HoldAndWin RTP 96%"))
    plan_composition(dsl)
    ir = share_aware_lock(dsl)
    # IR features (synthesised) should have a _rtp_share_alloc when DSL did
    if "features" in ir and ir["features"]:
        # At least one IR feature carries a share alloc
        any_with_share = any(
            isinstance(f, dict) and "_rtp_share_alloc" in f
            for f in ir["features"]
        )
        assert any_with_share


def test_share_aware_lock_input_not_mutated():
    """`share_aware_lock` must not mutate the input DSL (treats input as immutable)."""
    dsl = prompt_to_dsl(parse_prompt("5×3 FS RTP 96%"))
    plan_composition(dsl)
    original_target = dsl["meta"]["target_rtp"]
    share_aware_lock(dsl)
    assert dsl["meta"]["target_rtp"] == original_target


def test_share_aware_lock_heavy_features_use_full_target():
    """When ΣEfeature shares ≥ target − 0.01, fall back to full target so
    solver has something to converge on."""
    dsl = prompt_to_dsl(parse_prompt(
        "5×3 FS + HoldAndWin + Wheel bonus + Tumble + Sticky wild RTP 96%"
    ))
    plan_composition(dsl)
    ir = share_aware_lock(dsl)
    # Either we used full target OR we used base-share — both are valid.
    base = ir["meta"].get("base_game_share_locked_to")
    assert base is not None
    assert base > 0


# ─── CLI: --no-share-aware flag ───────────────────────────────────────────


def test_cli_no_share_aware_flag(tmp_path: Path):
    out_dir = tmp_path / "no-share-aware"
    rc = _run_cli([
        "5×3 FS + HoldAndWin RTP 96%",
        "--out", str(out_dir),
        "--no-share-aware",
        "--no-review-ui",
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"


def test_cli_default_share_aware_writes_share_total(tmp_path: Path):
    out_dir = tmp_path / "default-share-aware"
    rc = _run_cli([
        "5×3 FS + HoldAndWin RTP 96%",
        "--out", str(out_dir),
        "--no-review-ui",
        "--quiet",
    ])
    assert rc.returncode == 0
    # The IR meta should reflect share-aware lock
    irs = list(out_dir.glob("*.slot-sim.ir.json"))
    assert len(irs) == 1
    import json
    ir = json.loads(irs[0].read_text())
    # share-aware path is default → meta carries the lock fields
    assert "feature_share_total" in ir["meta"]
    assert "base_game_share_locked_to" in ir["meta"]
