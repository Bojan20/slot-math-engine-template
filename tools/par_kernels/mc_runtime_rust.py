"""SLOT-MATH W244 MC Runtime — Rust subprocess wrapper.

Drop-in replacement for `mc_runtime.run_mc()` that delegates the
per-spin sampling loop to the compiled Rust binary at
`target/release/mc_runtime_real`. 70-100× faster than pure-Python.

Build the binary once with:
    cargo build --release --bin mc_runtime_real

Then use this wrapper anywhere `run_mc()` was called:

    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    result = run_mc_rust(executor, spins=10_000_000, seed=42, cf_target_rtp=0.96136)

Falls back to pure-Python if the binary isn't built (no hard failure).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from tools.par_kernels.mc_runtime import McResult, WrathSpinExecutor, run_mc


_REPO = Path(__file__).resolve().parents[2]
_DEFAULT_BIN = _REPO / "target" / "release" / "mc_runtime_real"


class RustMcBinaryMissing(RuntimeError):
    """The mc_runtime_real binary is not built."""


def find_binary() -> Path | None:
    """Locate the mc_runtime_real binary; return None if missing."""
    override = os.environ.get("SLOT_MATH_MC_RUNTIME_BIN")
    if override:
        p = Path(override)
        if p.is_file() and os.access(p, os.X_OK):
            return p
        return None
    if _DEFAULT_BIN.is_file() and os.access(_DEFAULT_BIN, os.X_OK):
        return _DEFAULT_BIN
    on_path = shutil.which("mc_runtime_real")
    if on_path:
        return Path(on_path)
    return None


@dataclass
class RustMcExtra:
    """Extra Rust-side metrics not in Python McResult."""
    wallclock_seconds: float
    spins_per_sec: float


def run_mc_rust(
    executor: WrathSpinExecutor,
    spins: int,
    seed: int = 42,
    cf_target_rtp: float | None = None,
    fallback_to_python: bool = True,
    timeout_seconds: float = 600.0,
) -> tuple[McResult, RustMcExtra | None]:
    """Run MC via Rust binary; fall back to pure-Python if binary missing.

    Returns (McResult, RustMcExtra | None). The extra is None when the
    pure-Python fallback fires.
    """
    binary = find_binary()
    if binary is None:
        if not fallback_to_python:
            raise RustMcBinaryMissing(
                "mc_runtime_real not built. Run:\n"
                "  cargo build --release --bin mc_runtime_real"
            )
        py_result = run_mc(executor, spins=spins, seed=seed, cf_target_rtp=cf_target_rtp)
        return py_result, None

    # Build JSON input for the Rust binary
    payload = {
        "spins": int(spins),
        "seed": int(seed),
        "executor": {
            "base_rtp_per_spin": executor.base_rtp_per_spin,
            "base_hit_freq": executor.base_hit_freq,
            "fs_trigger_p": executor.fs_trigger_p,
            "fs_session_e": executor.fs_session_e,
            "fs_session_std": executor.fs_session_std,
            "hnw_trigger_p": executor.hnw_trigger_p,
            "hnw_session_e": executor.hnw_session_e,
            "hnw_session_std": executor.hnw_session_std,
            "max_win_cap_x": executor.max_win_cap_x,
        },
    }
    if cf_target_rtp is not None:
        payload["cf_target_rtp"] = cf_target_rtp

    proc = subprocess.run(
        [str(binary)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"mc_runtime_real exit {proc.returncode}: {proc.stderr.strip()[:300]}"
        )

    raw = json.loads(proc.stdout)
    mc = McResult(
        spins=int(raw["spins"]),
        seed=int(raw["seed"]),
        rtp=float(raw["rtp"]),
        std_error=float(raw["std_error"]),
        wilson_99_halfwidth=float(raw["wilson_99_halfwidth"]),
        hit_rate=float(raw["hit_rate"]),
        fs_trigger_rate=float(raw["fs_trigger_rate"]),
        hnw_trigger_rate=float(raw["hnw_trigger_rate"]),
        max_win_x=float(raw["max_win_x"]),
        cf_target_rtp=raw.get("cf_target_rtp"),
        delta_bps=raw.get("delta_bps"),
        convergence_pass=bool(raw.get("convergence_pass", True)),
    )
    extra = RustMcExtra(
        wallclock_seconds=float(raw.get("wallclock_seconds", 0.0)),
        spins_per_sec=float(raw.get("spins_per_sec", 0.0)),
    )
    return mc, extra
