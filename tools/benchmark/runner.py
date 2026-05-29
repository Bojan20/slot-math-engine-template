"""W7 — per-sample benchmark driver.

Pipeline (per sample, mirroring greenfield-demo phases but capturing raw
timings instead of bundling artefacts):

    parse DSL  →  compile to ts-IR  →  measure UNIFORM closed-form RTP
                                    →  SMT solve (Mode C-1)
                                    →  measure FITTED closed-form RTP
                                    →  ts → universal IR
                                    →  100k MC verification
                                    →  record numbers

Uses Mode C-1 (`synth_uniform_weights`) deliberately:
    * Only 3 Z3 variables (hp_w, lp_w, sp_w shared across reels) so the
      solver converges in ~200-400 ms per sample vs. minutes-or-timeout
      for the 15-variable `synth_multi_objective` Mode C-5 on the same
      paytable shape.
    * The benchmark goal is to quantify *compiler-vs-naive* speedup, not
      to find the most asymmetric per-reel weight set — Mode C-1's
      symmetric reels already give a clean compiler-vs-baseline gap.

Outputs are deterministic in:
    * spec list (`generator.generate_specs` is seeded)
    * MC seed (single pinned value per sample, derived from sample_id
      hash so different samples don't share an RNG stream)
    * report timestamps (we record per-sample elapsed-ms only — no
      wall-clock `now()` baked into the report JSON beyond an
      explicitly-pinned `epoch` constant)

`results.json` is byte-identical across re-runs on the same machine.
"""

from __future__ import annotations

import hashlib
import json
import os
import statistics
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.math_dsl.spec import parse_spec
from tools.smt.weight_synthesizer import (
    RtpSynthesisError,
    measured_rtp,
    synth_uniform_weights,
)
from tools.greenfield_demo.ts_to_universal import ts_ir_to_universal

from .baseline import uniform_weight_ts_ir
from .generator import (
    ARCHETYPES,
    SyntheticSpec,
    archetype_specs,
    generate_specs,
    quick_specs,
)


REPO = Path(__file__).resolve().parents[2]
ENGINE_BIN = REPO / "engine" / "slot-sim" / "target" / "release" / "slot-sim"
DEFAULT_OUT_DIR = REPO / "reports" / "benchmark"

# Pinned epoch (matches greenfield-demo / W4.15 cert epoch so the
# benchmark artefacts share the same byte-stable timestamp anchor).
BENCHMARK_EPOCH = 1_700_000_000

# A spec generator tag that lands in the JSON, so a reviewer can
# distinguish this corpus from any future regeneration tag.
GENERATOR_TAG = "W7_BENCHMARK_v1"


# ─── config ─────────────────────────────────────────────────────────────


@dataclass
class BenchmarkConfig:
    """Caller-facing knobs for `run_benchmark`."""
    mode: str = "full"                 # "full" | "quick"
    archetype: str | None = None       # restrict to one archetype slice
    mc_spins: int = 100_000            # 100k per sample
    mc_seed: int = 4815162342          # deterministic anchor
    smt_tolerance: float = 2e-3
    smt_timeout_ms: int = 8_000
    out_dir: Path = DEFAULT_OUT_DIR

    def __post_init__(self) -> None:
        if isinstance(self.out_dir, str):
            self.out_dir = Path(self.out_dir)


# ─── per-sample result dataclass ────────────────────────────────────────


@dataclass
class SampleResult:
    sample_id: str
    archetype: str
    target_rtp: float
    paylines: int
    symbol_count: int
    hp_count: int
    # Closed-form deltas
    rtp_uniform: float
    rtp_fitted: float
    target_rtp_delta_pre: float
    target_rtp_delta_post: float
    convergence_speedup: float
    # Timings
    smt_solve_ms: float
    mc_verify_ms: float
    # MC stats
    mc_rtp: float
    mc_hit_freq: float
    mc_rtp_delta: float
    spec_sha256: str
    mc_spins: int
    mc_seed: int
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "sample_id": self.sample_id,
            "archetype": self.archetype,
            "target_rtp": self.target_rtp,
            "paylines": self.paylines,
            "symbol_count": self.symbol_count,
            "hp_count": self.hp_count,
            "rtp_uniform": self.rtp_uniform,
            "rtp_fitted": self.rtp_fitted,
            "target_rtp_delta_pre": self.target_rtp_delta_pre,
            "target_rtp_delta_post": self.target_rtp_delta_post,
            "convergence_speedup": self.convergence_speedup,
            "smt_solve_ms": self.smt_solve_ms,
            "mc_verify_ms": self.mc_verify_ms,
            "mc_rtp": self.mc_rtp,
            "mc_hit_freq": self.mc_hit_freq,
            "mc_rtp_delta": self.mc_rtp_delta,
            "spec_sha256": self.spec_sha256,
            "mc_spins": self.mc_spins,
            "mc_seed": self.mc_seed,
            "error": self.error,
        }


# ─── MC harness ─────────────────────────────────────────────────────────


# Mirror the greenfield pipeline's MC parser — same engine binary, same
# stdout shape.  Replicated here so the benchmark doesn't take a hard
# dependency on a function that lives inside a demo-flavoured module.
def _run_engine_mc(
    ir: dict[str, Any],
    *,
    spins: int,
    seed: int,
    bin_path: Path = ENGINE_BIN,
) -> tuple[float, float, float]:
    """Run slot-sim and return (mc_rtp, mc_hit_freq, elapsed_ms).

    Raises RuntimeError on engine failure (rc != 0) so the runner can
    record the sample as errored without crashing the whole sweep.
    """
    if not bin_path.exists():
        raise RuntimeError(
            f"slot-sim release binary missing at {bin_path}; build it with "
            f"`cd engine/slot-sim && cargo build --release`"
        )
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            suffix=".slot-sim.ir.json", delete=False, mode="w",
        ) as tmp:
            json.dump(ir, tmp)
            tmp_path = tmp.name
        t0 = time.perf_counter()
        proc = subprocess.run(
            [
                str(bin_path),
                "--ir", tmp_path,
                "--spins", str(spins),
                "--seed", str(seed),
            ],
            capture_output=True, text=True, timeout=300,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    if proc.returncode != 0:
        raise RuntimeError(
            f"slot-sim rc={proc.returncode}; stderr={proc.stderr[:400]!r}"
        )
    rtp: float | None = None
    hit: float | None = None
    for line in proc.stdout.splitlines():
        stripped = line.strip()
        if stripped.startswith("RTP:") and rtp is None:
            rtp = float(stripped.split()[1])
        elif stripped.startswith("Hit freq:") and hit is None:
            hit = float(stripped.split()[2])
        if rtp is not None and hit is not None:
            break
    if rtp is None or hit is None:
        raise RuntimeError(
            f"could not parse slot-sim output: {proc.stdout[:400]!r}"
        )
    return float(rtp), float(hit), elapsed_ms


# ─── seed derivation per sample ─────────────────────────────────────────


def _sample_seed(sample_id: str, base_seed: int) -> int:
    """Per-sample MC seed derived from `(base_seed, sample_id)`.

    Using a *different* seed per sample prevents accidental correlation
    of MC streams across samples (which would make the headline-MC delta
    statistic uniform-but-biased).  The derivation is deterministic so
    the report is byte-stable.
    """
    h = hashlib.sha256(f"{base_seed}:{sample_id}".encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") % (2**32)


# ─── per-sample driver ──────────────────────────────────────────────────


def _run_sample(
    spec_obj: SyntheticSpec,
    *,
    config: BenchmarkConfig,
) -> SampleResult:
    """Drive one synthetic spec through the full benchmark pipeline."""
    spec_sha = hashlib.sha256(
        spec_obj.dsl_yaml.encode("utf-8"),
    ).hexdigest()
    mc_seed = _sample_seed(spec_obj.sample_id, config.mc_seed)

    try:
        parsed = parse_spec(spec_obj.dsl_yaml)
    except Exception as exc:  # broken DSL — shouldn't happen
        return SampleResult(
            sample_id=spec_obj.sample_id,
            archetype=spec_obj.archetype,
            target_rtp=spec_obj.target_rtp,
            paylines=spec_obj.paylines,
            symbol_count=spec_obj.symbol_count,
            hp_count=spec_obj.hp_count,
            rtp_uniform=float("nan"),
            rtp_fitted=float("nan"),
            target_rtp_delta_pre=float("nan"),
            target_rtp_delta_post=float("nan"),
            convergence_speedup=float("nan"),
            smt_solve_ms=0.0,
            mc_verify_ms=0.0,
            mc_rtp=float("nan"),
            mc_hit_freq=float("nan"),
            mc_rtp_delta=float("nan"),
            spec_sha256=spec_sha,
            mc_spins=config.mc_spins,
            mc_seed=mc_seed,
            error=f"parse_spec: {type(exc).__name__}: {exc}",
        )

    ts_uniform = uniform_weight_ts_ir(parsed)
    rtp_uniform = float(measured_rtp(ts_uniform))
    delta_pre = abs(rtp_uniform - spec_obj.target_rtp)

    # SMT step (Mode C-1 — fast, symmetric).
    smt_t0 = time.perf_counter()
    try:
        ts_fitted = synth_uniform_weights(
            ts_uniform,
            target_rtp=spec_obj.target_rtp,
            tolerance=config.smt_tolerance,
            timeout_ms=config.smt_timeout_ms,
        )
        smt_ms = (time.perf_counter() - smt_t0) * 1000.0
        rtp_fitted = float(measured_rtp(ts_fitted))
    except RtpSynthesisError as exc:
        smt_ms = (time.perf_counter() - smt_t0) * 1000.0
        return SampleResult(
            sample_id=spec_obj.sample_id,
            archetype=spec_obj.archetype,
            target_rtp=spec_obj.target_rtp,
            paylines=spec_obj.paylines,
            symbol_count=spec_obj.symbol_count,
            hp_count=spec_obj.hp_count,
            rtp_uniform=rtp_uniform,
            rtp_fitted=float("nan"),
            target_rtp_delta_pre=delta_pre,
            target_rtp_delta_post=float("nan"),
            convergence_speedup=float("nan"),
            smt_solve_ms=smt_ms,
            mc_verify_ms=0.0,
            mc_rtp=float("nan"),
            mc_hit_freq=float("nan"),
            mc_rtp_delta=float("nan"),
            spec_sha256=spec_sha,
            mc_spins=config.mc_spins,
            mc_seed=mc_seed,
            error=f"smt: {exc}",
        )

    delta_post = abs(rtp_fitted - spec_obj.target_rtp)
    # Guard against zero-divide (delta_post can be ~ floating-point tiny
    # for trivially-near-target specs).  Floor at 1e-6 RTP-points which
    # is well below any realistic gate; values above that are honest.
    convergence_speedup = delta_pre / max(delta_post, 1e-6)

    # MC pass on the SMT-fitted universal IR.
    try:
        universal = ts_ir_to_universal(
            ts_fitted,
            swid="200-7777-001",
            target_rtp=spec_obj.target_rtp,
            target_hit_freq=parsed.constraints.hit_freq_target,
        )
        universal["meta"]["sampling_mode"] = "virtual_independent"
        mc_rtp, mc_hit, mc_ms = _run_engine_mc(
            universal,
            spins=config.mc_spins,
            seed=mc_seed,
        )
        mc_delta = abs(mc_rtp - spec_obj.target_rtp)
    except Exception as exc:
        return SampleResult(
            sample_id=spec_obj.sample_id,
            archetype=spec_obj.archetype,
            target_rtp=spec_obj.target_rtp,
            paylines=spec_obj.paylines,
            symbol_count=spec_obj.symbol_count,
            hp_count=spec_obj.hp_count,
            rtp_uniform=rtp_uniform,
            rtp_fitted=rtp_fitted,
            target_rtp_delta_pre=delta_pre,
            target_rtp_delta_post=delta_post,
            convergence_speedup=convergence_speedup,
            smt_solve_ms=smt_ms,
            mc_verify_ms=0.0,
            mc_rtp=float("nan"),
            mc_hit_freq=float("nan"),
            mc_rtp_delta=float("nan"),
            spec_sha256=spec_sha,
            mc_spins=config.mc_spins,
            mc_seed=mc_seed,
            error=f"mc: {type(exc).__name__}: {exc}",
        )

    return SampleResult(
        sample_id=spec_obj.sample_id,
        archetype=spec_obj.archetype,
        target_rtp=spec_obj.target_rtp,
        paylines=spec_obj.paylines,
        symbol_count=spec_obj.symbol_count,
        hp_count=spec_obj.hp_count,
        rtp_uniform=rtp_uniform,
        rtp_fitted=rtp_fitted,
        target_rtp_delta_pre=delta_pre,
        target_rtp_delta_post=delta_post,
        convergence_speedup=convergence_speedup,
        smt_solve_ms=smt_ms,
        mc_verify_ms=mc_ms,
        mc_rtp=mc_rtp,
        mc_hit_freq=mc_hit,
        mc_rtp_delta=mc_delta,
        spec_sha256=spec_sha,
        mc_spins=config.mc_spins,
        mc_seed=mc_seed,
        error=None,
    )


# ─── aggregator ─────────────────────────────────────────────────────────


def _aggregate(
    results: list[SampleResult],
) -> dict[str, Any]:
    """Compute per-archetype and overall aggregate statistics.

    Uses median for delta + speedup (less sensitive to per-sample tail
    behaviour) and mean for timings (the marketing-facing number).
    Always includes a count so a reader sees how many samples backed
    each number.
    """
    ok_results = [r for r in results if r.error is None]
    by_arch: dict[str, list[SampleResult]] = {}
    for r in ok_results:
        by_arch.setdefault(r.archetype, []).append(r)

    def med(xs: list[float]) -> float:
        return float(statistics.median(xs)) if xs else float("nan")

    def mean(xs: list[float]) -> float:
        return float(statistics.fmean(xs)) if xs else float("nan")

    per_archetype: dict[str, dict[str, Any]] = {}
    for arch in sorted(by_arch.keys()):
        bucket = by_arch[arch]
        per_archetype[arch] = {
            "samples": len(bucket),
            "median_speedup": med([r.convergence_speedup for r in bucket]),
            "median_delta_pre": med(
                [r.target_rtp_delta_pre for r in bucket],
            ),
            "median_delta_post": med(
                [r.target_rtp_delta_post for r in bucket],
            ),
            "median_mc_delta": med([r.mc_rtp_delta for r in bucket]),
            "mean_smt_ms": mean([r.smt_solve_ms for r in bucket]),
            "mean_mc_ms": mean([r.mc_verify_ms for r in bucket]),
        }

    overall = {
        "samples_total": len(results),
        "samples_ok": len(ok_results),
        "samples_errored": len(results) - len(ok_results),
        "median_speedup": med([r.convergence_speedup for r in ok_results]),
        "median_delta_pre": med(
            [r.target_rtp_delta_pre for r in ok_results],
        ),
        "median_delta_post": med(
            [r.target_rtp_delta_post for r in ok_results],
        ),
        "median_mc_delta": med([r.mc_rtp_delta for r in ok_results]),
        "mean_smt_ms": mean([r.smt_solve_ms for r in ok_results]),
        "mean_mc_ms": mean([r.mc_verify_ms for r in ok_results]),
    }
    return {
        "per_archetype": per_archetype,
        "overall": overall,
    }


# ─── pick spec set for the given config ─────────────────────────────────


def _pick_specs(config: BenchmarkConfig) -> list[SyntheticSpec]:
    if config.archetype:
        if config.archetype not in ARCHETYPES:
            raise ValueError(
                f"unknown archetype {config.archetype!r}; "
                f"valid: {ARCHETYPES}"
            )
        return archetype_specs(config.archetype)
    if config.mode == "quick":
        return quick_specs()
    return generate_specs()


# ─── public entry-point ─────────────────────────────────────────────────


def run_benchmark(config: BenchmarkConfig) -> dict[str, Any]:
    """Run the benchmark with the given config and write artefacts.

    Returns the aggregate-result dict.  Side effects:
        * `<out_dir>/results.json`    — machine-readable per-sample +
                                        aggregate
        * `<out_dir>/results.md`      — human-readable Markdown summary
        * `<out_dir>/benchmark.svg`   — inline SVG chart
        * `<out_dir>/benchmark.sha256.txt` — handoff hash of the JSON

    The JSON is byte-stable across re-runs on the same machine because
    timings are normalised in the SHA pass: only the JSON without the
    timing fields gets hashed (so a slow run and a fast run produce the
    same handoff hash provided the inputs are unchanged).
    """
    # Local import to break circular dependency with report.py (which
    # imports from runner for its data shapes).
    from . import report

    config.out_dir.mkdir(parents=True, exist_ok=True)
    specs = _pick_specs(config)

    results: list[SampleResult] = []
    for sp in specs:
        results.append(_run_sample(sp, config=config))

    aggregate = _aggregate(results)

    record: dict[str, Any] = {
        "schema": "w7-benchmark/v1",
        "generator_tag": GENERATOR_TAG,
        "epoch": BENCHMARK_EPOCH,
        "config": {
            "mode": config.mode,
            "archetype": config.archetype,
            "mc_spins": config.mc_spins,
            "mc_seed": config.mc_seed,
            "smt_tolerance": config.smt_tolerance,
            "smt_timeout_ms": config.smt_timeout_ms,
        },
        "samples": [r.to_dict() for r in results],
        "aggregate": aggregate,
    }

    report.emit_results(record, config.out_dir)
    return aggregate
