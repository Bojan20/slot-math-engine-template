"""PHASE 18 — Cross-engine validation harness.

Runs a fixed IR through multiple engine implementations + compares
measured RTP / hit-freq / win-freq. Flags any engine that drifts more
than the configured tolerance from the cohort mean (consensus).

Engines registered here are pluggable: each one exposes
`measure(ir, spins, seed) → EngineResult`. The harness orchestrates
the run + emits a `ValidationResult` for downstream reporting.
"""

from __future__ import annotations

import json
import subprocess
import shutil
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Callable, Optional


# ─── Public types ──────────────────────────────────────────────────────────


@dataclass
class EngineResult:
    engine: str
    spins: int
    rtp: float
    hit_freq: float
    win_freq: float
    elapsed_seconds: float
    error: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationResult:
    ir_path: str
    spins_per_engine: int
    engines_run: list[str]
    engines_skipped: list[str]
    per_engine: dict[str, EngineResult]
    rtp_consensus: float
    max_rtp_abs_delta: float
    tolerance: float
    pass_: bool
    drifted_engines: list[str]
    schema_version: str = "urn:slotmath:cross-validate:v1"


# ─── Engine registry ───────────────────────────────────────────────────────


_ENGINE_REGISTRY: dict[str, Callable[[dict, int, int], EngineResult]] = {}


def _register(name: str):
    def deco(fn: Callable[[dict, int, int], EngineResult]):
        _ENGINE_REGISTRY[name] = fn
        return fn
    return deco


def list_available_engines() -> list[str]:
    """Return engines that can run NOW (not gated by absent binary etc.)."""
    out: list[str] = []
    for name, fn in _ENGINE_REGISTRY.items():
        if name == "rust_slot_sim":
            # Available iff the slot-sim binary can be found OR cargo present
            if _rust_slot_sim_available():
                out.append(name)
        else:
            out.append(name)
    return out


# ─── Python synthetic engine ───────────────────────────────────────────────


@_register("python_synthetic")
def _engine_python_synthetic(ir: dict, spins: int, seed: int) -> EngineResult:
    """Drive `spins` through tools.rgs_live.engine.engine_spin."""
    import time
    from tools.rgs_live.engine import engine_spin
    from tools.rgs_live.protocol import SpinRequest

    server_seed = f"{seed:064x}"
    total_payout = 0.0
    total_bet = 0.0
    hits = 0
    spin_wins = 0
    t0 = time.perf_counter()
    for i in range(spins):
        req = SpinRequest(
            request_id=str(i),
            session_id="xval",
            client_seed="xval",
            nonce=i,
            bet_amount=1.0,
        )
        result = engine_spin(
            ir, req, server_seed,
            running_total_payout=total_payout,
            running_total_bet=total_bet,
        )
        total_payout += result.total_payout
        total_bet += req.bet_amount
        if result.total_payout > 0:
            hits += 1
            spin_wins += len(result.lines_won)
    elapsed = time.perf_counter() - t0
    return EngineResult(
        engine="python_synthetic",
        spins=spins,
        rtp=round(total_payout / total_bet, 8) if total_bet else 0.0,
        hit_freq=round(hits / spins, 8),
        win_freq=round(spin_wins / spins, 8),
        elapsed_seconds=round(elapsed, 4),
    )


# ─── Python Bernoulli closed-form engine ───────────────────────────────────


@_register("python_bernoulli")
def _engine_python_bernoulli(ir: dict, spins: int, seed: int) -> EngineResult:
    """Engine-free Bernoulli closed-form RTP estimate.

    Independent of the synthetic engine path → distinct cross-check.
    Returns the analytic line-eval RTP as `rtp`; hit/win freq are
    derived from per-symbol grid probabilities.
    """
    import time
    from tools.slot_bench.runner import _bernoulli_rtp_estimate
    t0 = time.perf_counter()
    rtp = _bernoulli_rtp_estimate(ir)
    elapsed = time.perf_counter() - t0
    if rtp is None:
        return EngineResult(
            engine="python_bernoulli",
            spins=spins,
            rtp=0.0,
            hit_freq=0.0,
            win_freq=0.0,
            elapsed_seconds=round(elapsed, 6),
            error="bernoulli_estimator_no_data",
        )
    return EngineResult(
        engine="python_bernoulli",
        spins=spins,
        rtp=round(float(rtp), 8),
        hit_freq=0.0,  # closed-form does not produce per-grid hits
        win_freq=0.0,
        elapsed_seconds=round(elapsed, 6),
        extra={"derivation": "closed_form_line_eval"},
    )


# ─── Rust slot-sim engine (subprocess) ─────────────────────────────────────


def _rust_slot_sim_available() -> bool:
    """Detect whether the Rust slot-sim binary or cargo can run."""
    if shutil.which("slot-sim"):
        return True
    # If cargo binary is present + Cargo.toml exists, we could in principle
    # run `cargo run -p slot-sim` — but that's a multi-minute first-build
    # cost. Gate behind explicit env var.
    import os
    if os.environ.get("SLOTMATH_RUST_AVAILABLE") == "1" and shutil.which("cargo"):
        return True
    return False


@_register("rust_slot_sim")
def _engine_rust_slot_sim(ir: dict, spins: int, seed: int) -> EngineResult:
    """Subprocess-call the Rust slot-sim binary.

    Auto-skipped via `list_available_engines()` when not present.
    """
    import os
    import tempfile
    import time

    if not _rust_slot_sim_available():
        return EngineResult(
            engine="rust_slot_sim",
            spins=spins,
            rtp=0.0,
            hit_freq=0.0,
            win_freq=0.0,
            elapsed_seconds=0.0,
            error="rust_slot_sim_binary_absent",
        )

    binary = shutil.which("slot-sim")
    if binary is None and os.environ.get("SLOTMATH_RUST_AVAILABLE") == "1":
        # Fallback: invoke via cargo run (slow but deterministic).
        cmd_prefix = ["cargo", "run", "--release", "--quiet", "-p", "slot-sim", "--"]
    else:
        cmd_prefix = [binary]

    with tempfile.NamedTemporaryFile("w", suffix=".ir.json", delete=False) as fp:
        json.dump(ir, fp)
        ir_path = fp.name

    cmd = cmd_prefix + [
        "--ir", ir_path,
        "--spins", str(spins),
        "--seed", str(seed),
        "--json",
    ]
    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        return EngineResult(
            engine="rust_slot_sim",
            spins=spins,
            rtp=0.0,
            hit_freq=0.0,
            win_freq=0.0,
            elapsed_seconds=round(time.perf_counter() - t0, 4),
            error=f"rust_slot_sim_invocation_failed: {exc}",
        )
    elapsed = time.perf_counter() - t0

    if proc.returncode != 0:
        return EngineResult(
            engine="rust_slot_sim",
            spins=spins,
            rtp=0.0,
            hit_freq=0.0,
            win_freq=0.0,
            elapsed_seconds=round(elapsed, 4),
            error=f"rust_slot_sim_exit_{proc.returncode}: {proc.stderr[:200]}",
        )

    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return EngineResult(
            engine="rust_slot_sim",
            spins=spins,
            rtp=0.0,
            hit_freq=0.0,
            win_freq=0.0,
            elapsed_seconds=round(elapsed, 4),
            error=f"rust_slot_sim_bad_json: {exc}",
        )

    return EngineResult(
        engine="rust_slot_sim",
        spins=spins,
        rtp=float(out.get("rtp_estimate", 0.0)),
        hit_freq=float(out.get("hit_freq_estimate", 0.0)),
        win_freq=float(out.get("win_freq_estimate", 0.0)),
        elapsed_seconds=round(elapsed, 4),
        extra=out,
    )


# ─── Main harness ──────────────────────────────────────────────────────────


def run_cross_validate(
    *,
    ir_path: str | Path,
    engines: Optional[tuple[str, ...]] = None,
    spins: int = 10_000,
    seed: int = 0xabcd_1234,
    tolerance: float = 0.01,
) -> ValidationResult:
    """Cross-validate `ir_path` across `engines`. Returns ValidationResult.

    Default `engines = None` → uses `list_available_engines()`.
    """
    path = Path(ir_path)
    if not path.exists():
        raise FileNotFoundError(f"ir_path not found: {ir_path}")
    if spins < 1:
        raise ValueError("spins must be ≥ 1")
    if tolerance < 0:
        raise ValueError("tolerance must be ≥ 0")

    ir = json.loads(path.read_text())

    if engines is None:
        engine_names = list_available_engines()
    else:
        engine_names = list(engines)

    if not engine_names:
        raise RuntimeError("no engines available; specify at least one")

    per_engine: dict[str, EngineResult] = {}
    engines_run: list[str] = []
    engines_skipped: list[str] = []
    for name in engine_names:
        fn = _ENGINE_REGISTRY.get(name)
        if fn is None:
            engines_skipped.append(name)
            continue
        try:
            res = fn(ir, spins, seed)
        except Exception as exc:  # noqa: BLE001
            res = EngineResult(
                engine=name, spins=spins, rtp=0.0, hit_freq=0.0,
                win_freq=0.0, elapsed_seconds=0.0, error=f"exception: {exc}",
            )
        per_engine[name] = res
        if res.error:
            engines_skipped.append(name)
        else:
            engines_run.append(name)

    # Consensus = mean RTP across non-erroring engines
    rtps = [per_engine[n].rtp for n in engines_run]
    if rtps:
        consensus = sum(rtps) / len(rtps)
        max_delta = max(abs(rtp - consensus) for rtp in rtps)
    else:
        consensus = 0.0
        max_delta = 0.0

    drifted = [n for n in engines_run
                if abs(per_engine[n].rtp - consensus) > tolerance]
    passed = (max_delta <= tolerance) and len(engines_run) >= 2

    return ValidationResult(
        ir_path=str(path),
        spins_per_engine=spins,
        engines_run=engines_run,
        engines_skipped=engines_skipped,
        per_engine=per_engine,
        rtp_consensus=round(consensus, 8),
        max_rtp_abs_delta=round(max_delta, 8),
        tolerance=tolerance,
        pass_=passed,
        drifted_engines=drifted,
    )


def validation_to_dict(result: ValidationResult) -> dict[str, Any]:
    d = asdict(result)
    # Replace dataclass-asdict-of-EngineResult per-engine entries
    d["per_engine"] = {k: asdict(v) for k, v in result.per_engine.items()}
    d["pass"] = d.pop("pass_")  # JSON friendly
    return d
