"""SLOT-MATH multi-game W244 evaluator gate.

Proves the composer + generic params_builder is GAME-AGNOSTIC by
running the same evaluation against multiple games (Wrath, Oracle of
Delphi). If any game drops out of sub-bps composer parity, the gate
catches it.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]


def _game_paths(game: str, variant: str) -> tuple[Path, Path]:
    base = REPO / "reports" / "par-library" / game / variant
    return base / "game.ir.json", base / "closed-form-rtp.json"


GAMES = [
    ("wrath-of-olympus", "v12.0.0"),
    ("oracle-of-delphi", "v1.0.0"),
]


@pytest.mark.parametrize("game,variant", GAMES)
def test_composer_sub_bps_parity_per_game(game: str, variant: str):
    """Composer + delegated baseline ≡ CF target to ≤ 1 bps for each game."""
    ir_path, cf_path = _game_paths(game, variant)
    if not (ir_path.is_file() and cf_path.is_file()):
        pytest.skip(f"{game}/{variant} not in PAR library")

    from tools.par_kernels.composer import compose
    from tools.par_kernels.generic_params import (
        delegated_baseline_rtp,
        make_params_builder,
    )

    ir = json.loads(ir_path.read_text())
    cf = json.loads(cf_path.read_text())
    target = cf["total_rtp"]
    par = {"rtp": {"rtp_total": target}}

    result = compose(ir, par=par, params_builder=make_params_builder(cf))
    delegated = delegated_baseline_rtp(cf)
    composed_total = result.composed_rtp + delegated
    delta_bps = (composed_total - target) * 10000.0

    assert abs(delta_bps) <= 1.0, (
        f"{game}/{variant} composer off by {delta_bps:+.4f} bps "
        f"(composed={composed_total:.6%}, target={target:.6%})\n"
        f"{result.summary()}"
    )


@pytest.mark.parametrize("game,variant", GAMES)
def test_mc_runtime_convergence_per_game(game: str, variant: str):
    """MC runtime converges to CF target within Wilson 99% CI for each game."""
    ir_path, cf_path = _game_paths(game, variant)
    if not (ir_path.is_file() and cf_path.is_file()):
        pytest.skip(f"{game}/{variant} not in PAR library")

    from tools.par_kernels.mc_runtime import (
        build_wrath_executor_from_cf,
        run_mc,
    )

    cf = json.loads(cf_path.read_text())
    target = cf["total_rtp"]
    # NB: build_wrath_executor_from_cf works for any CF that has the
    # same field shape — name is historical, not Wrath-specific.
    executor = build_wrath_executor_from_cf(cf)
    result = run_mc(executor, spins=200_000, seed=42, cf_target_rtp=target)

    assert result.convergence_pass, (
        f"{game}/{variant} MC RTP {result.rtp:.4%} outside Wilson 99% CI "
        f"of CF target {target:.4%}. Δ={result.delta_bps:+.2f} bps, "
        f"CI half-width={result.wilson_99_halfwidth:.4%}"
    )


def test_oracle_of_delphi_par_library_present():
    """Sentinel: the synthetic 2nd-game must exist to prove genericity."""
    ir, cf = _game_paths("oracle-of-delphi", "v1.0.0")
    assert ir.is_file(), "Oracle of Delphi IR missing — re-run par-library import"
    assert cf.is_file(), "Oracle of Delphi CF source missing"


def test_cli_evaluate_exits_zero_for_known_games():
    """CLI smoke test — must exit 0 for both registered games."""
    import subprocess
    for game, variant in GAMES:
        ir, cf = _game_paths(game, variant)
        if not (ir.is_file() and cf.is_file()):
            continue
        proc = subprocess.run(
            ["python3", "-m", "tools.par_kernels.cli", "evaluate",
             "--game", game, "--variant", variant, "--tolerance-bps", "1.0"],
            capture_output=True, text=True, timeout=30, check=False,
            cwd=REPO,
        )
        assert proc.returncode == 0, (
            f"CLI exit {proc.returncode} for {game}/{variant}\n"
            f"stderr: {proc.stderr[:500]}"
        )
