"""SLOT-MATH W244 MC Runtime — Rust subprocess wrapper for cluster/ways/crash shapes.

Companion to `mc_runtime_rust.py` (which wraps lines+FS+HW shape only).
This module dispatches to the `mc_extended_real` binary via JSON-on-stdin
with a `shape` discriminator.

Drop-in helpers:
  - run_cluster_rust(cf, ir, n_rounds, seed, cf_target_rtp)
  - run_ways_rust(cf, ir, n_rounds, seed, cf_target_rtp)
  - run_crash_rust(cf, ir, n_rounds, seed, cf_target_rtp)

Auto-fallback to pure-Python if `mc_extended_real` binary missing.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


_REPO = Path(__file__).resolve().parents[2]
_DEFAULT_BIN = _REPO / "target" / "release" / "mc_extended_real"


def find_extended_binary() -> Path | None:
    """Locate mc_extended_real; None if missing."""
    override = os.environ.get("SLOT_MATH_MC_EXTENDED_BIN")
    if override:
        p = Path(override)
        if p.is_file() and os.access(p, os.X_OK):
            return p
        return None
    if _DEFAULT_BIN.is_file() and os.access(_DEFAULT_BIN, os.X_OK):
        return _DEFAULT_BIN
    return Path(shutil.which("mc_extended_real")) if shutil.which("mc_extended_real") else None


@dataclass
class ExtendedMcResult:
    """Unified result for cluster/ways/crash Rust MC."""
    shape: str
    rounds: int
    seed: int
    rtp: float
    std_error: float
    wilson_99_halfwidth: float
    hit_rate: float
    cascade_rate: float
    extra_per_round_avg: float
    max_observed: float
    cf_target_rtp: float | None = None
    delta_bps: float | None = None
    convergence_pass: bool = True
    wallclock_seconds: float = 0.0
    rounds_per_sec: float = 0.0
    threads_used: int = 1
    parallel: bool = False


def _invoke(payload: dict[str, Any], timeout: float = 600.0) -> ExtendedMcResult:
    binary = find_extended_binary()
    if binary is None:
        raise RuntimeError(
            "mc_extended_real not built. Run:\n"
            "  cargo build --release --bin mc_extended_real"
        )
    proc = subprocess.run(
        [str(binary)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"mc_extended_real exit {proc.returncode}: {proc.stderr.strip()[:300]}"
        )
    raw = json.loads(proc.stdout)
    return ExtendedMcResult(**raw)


def _calibrate_cascade_p(cf: dict[str, Any], base_key: str) -> float:
    """Same algebraic inverse used in pure-Python cluster/ways runtimes."""
    base = float(cf.get("components", {}).get(base_key, 0.0))
    casc = float(cf.get("components", {}).get("cascade_uplift", 0.0))
    if base <= 0 or casc <= 0:
        return 0.0
    R = casc / base
    return max(0.0, min(R / (0.6 * (1.0 + R)), 0.95))


def run_cluster_rust(
    cf: dict[str, Any],
    ir: dict[str, Any] | None,
    n_rounds: int,
    seed: int = 42,
    cf_target_rtp: float | None = None,
) -> ExtendedMcResult:
    bet = (ir or {}).get("bet", {})
    payload = {
        "shape": "cluster",
        "n_rounds": int(n_rounds),
        "seed": int(seed),
        "cluster_distribution": cf.get("cluster_distribution", {}),
        "pay_table": cf.get("pay_table", {}),
        "min_cluster_size": int((ir or {}).get("evaluation", {}).get("min_cluster_size", 5)),
        "cascade_continue_p": _calibrate_cascade_p(cf, "cluster_pays_base"),
        "max_win_cap_x": float(bet.get("max_win_x", 10_000.0)),
    }
    if cf_target_rtp is not None:
        payload["cf_target_rtp"] = float(cf_target_rtp)
    return _invoke(payload)


def run_ways_rust(
    cf: dict[str, Any],
    ir: dict[str, Any] | None,
    n_rounds: int,
    seed: int = 42,
    cf_target_rtp: float | None = None,
) -> ExtendedMcResult:
    bet = (ir or {}).get("bet", {})
    payload = {
        "shape": "ways",
        "n_rounds": int(n_rounds),
        "seed": int(seed),
        "row_distribution_per_reel": cf.get("row_distribution_per_reel", []),
        "per_way_rtp_x_bet": float(cf.get("per_way_rtp_x_bet", 0.0)),
        "hit_probability": 0.30,
        "cascade_continue_p": _calibrate_cascade_p(cf, "ways_base"),
        "max_win_cap_x": float(bet.get("max_win_x", 15_000.0)),
    }
    if cf_target_rtp is not None:
        payload["cf_target_rtp"] = float(cf_target_rtp)
    return _invoke(payload)


def run_crash_rust(
    cf: dict[str, Any],
    ir: dict[str, Any] | None,
    n_rounds: int,
    seed: int = 42,
    cf_target_rtp: float | None = None,
) -> ExtendedMcResult:
    bet = (ir or {}).get("bet", {})
    payload = {
        "shape": "crash",
        "n_rounds": int(n_rounds),
        "seed": int(seed),
        "house_edge": float(cf.get("house_edge", 0.01)),
        "cashout_multiplier": float(cf.get("cashout_multiplier", 2.0)),
        "max_win_cap_x": float(bet.get("max_win_x", 1_000_000.0)),
    }
    if cf_target_rtp is not None:
        payload["cf_target_rtp"] = float(cf_target_rtp)
    return _invoke(payload)
