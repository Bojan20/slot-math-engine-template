"""W7-B — Performance benchmark implementation."""

from __future__ import annotations

import dataclasses
import json
import statistics
import time
from pathlib import Path
from typing import Any, Callable


# ─── Bench primitive ────────────────────────────────────────────────


@dataclasses.dataclass
class BenchRow:
    name: str
    n_runs: int
    min_ns: int
    median_ns: int
    p95_ns: int
    p99_ns: int
    max_ns: int
    mean_throughput_ops_per_s: float

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def bench_kernel(
    name: str, fn: Callable[[], Any], *, n_runs: int = 5,
) -> BenchRow:
    """Run `fn` `n_runs` times (no warmup discard) and return a
    BenchRow with min / median / p95 / p99 / max / mean throughput.

    The first call is included — we want to measure realistic
    cold-start cost on first invocation, not just hot-loop steady
    state. For warmup-sensitive workloads pass a higher `n_runs` so
    the median is robust to one slow outlier.
    """
    if n_runs < 2:
        raise ValueError("n_runs must be >= 2 for quantile estimation")
    samples: list[int] = []
    for _ in range(n_runs):
        t0 = time.perf_counter_ns()
        fn()
        elapsed = time.perf_counter_ns() - t0
        samples.append(elapsed)
    samples.sort()
    median = int(statistics.median(samples))
    # Custom percentile to avoid statistics.quantiles edge-case behaviour.
    def _pct(p: float) -> int:
        idx = max(0, min(len(samples) - 1, int(round(p * (len(samples) - 1)))))
        return samples[idx]
    p95 = _pct(0.95)
    p99 = _pct(0.99)
    mean_ns = statistics.mean(samples)
    throughput = 1e9 / mean_ns if mean_ns > 0 else 0.0
    return BenchRow(
        name=name,
        n_runs=n_runs,
        min_ns=samples[0],
        median_ns=median,
        p95_ns=p95,
        p99_ns=p99,
        max_ns=samples[-1],
        mean_throughput_ops_per_s=throughput,
    )


# ─── Suite ─────────────────────────────────────────────────────────


@dataclasses.dataclass
class PerfReport:
    rows: list[BenchRow]
    n_runs: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_runs": self.n_runs,
            "rows": [r.to_dict() for r in self.rows],
        }


def _w71_workload():
    from tools.math_genome.genome import (
        GenomeConfig, GenomeSpec, SelfEvolvingMathGenome,
    )
    spec = GenomeSpec(
        n_reels=5, n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3, paylines=20, anchor=0,
        target_rtp=20.224, target_cv=8.0, target_hit_freq=0.27,
    )
    cfg = GenomeConfig(population_size=8, generations=2, seed=1)
    return lambda: SelfEvolvingMathGenome(spec, cfg).evolve()


def _w73_workload():
    from tools.rl_player_emulator.player import casual_archetype, run_cohort
    from tools.symbolic_slot_math.model import RtpModel
    arche = casual_archetype()
    model = RtpModel(
        n_reels=5, n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3, paylines=20, anchor=0,
        weights=[[4.0, 6.0] for _ in range(5)],
    )
    return lambda: run_cohort(arche, model, n_players=2, sessions_per_player=2, base_seed=1)


def _w74_workload():
    from tools.gdd_asset_pipeline.pipeline import GddSpec, build_asset_manifest
    gdd = GddSpec(
        game_id="PERF-001", name="Perf", theme="jungle", mood="epic",
        volatility_class="high",
        symbols=["A", "B", "C", "Wild", "Scatter"],
        features=["free_spins", "hold_and_win"],
    )
    return lambda: build_asset_manifest(gdd)


def _w75_workload():
    import hashlib
    from tools.provenance_mesh.mesh import build_session_mesh
    spins = [
        {
            "server_seed_hex": hashlib.sha256(f"perf:{i}".encode()).hexdigest(),
            "client_seed": f"c-{i}",
            "nonce": i,
            "outcome": {"reels": [i, i + 1]},
        }
        for i in range(32)
    ]
    return lambda: build_session_mesh("perf-session", spins)


def _w76_workload():
    from tools.symbolic_slot_math.model import RtpModel, build_derivative_manifest
    model = RtpModel(
        n_reels=5, n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3, paylines=20, anchor=0,
        weights=[[4.0, 6.0] for _ in range(5)],
    )
    return lambda: build_derivative_manifest(model)


def _w77_workload():
    from tools.par_compiler_js.compile import build_js_bundle
    return lambda: build_js_bundle()


def _w79_workload():
    from tools.vendor_graph.graph import ingest_repo
    profiles = Path("tools/vendor_profiles")
    return lambda: ingest_repo(profiles_dir=profiles, games_glob=[])


def _w710_workload():
    from tools.symbolic_slot_math.model import RtpModel as _Model  # noqa: F401
    # We exercise W7.10 via the Rust binary in real CI; pure-Python
    # fallback below times the closed-form sweep equivalent so the
    # report has a representative row even when the Rust bin isn't
    # pre-built.
    from tools.symbolic_slot_math.model import RtpModel
    model = RtpModel(
        n_reels=5, n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3, paylines=20, anchor=0,
        weights=[[4.0, 6.0] for _ in range(5)],
    )

    def _probe() -> None:
        for anchor_weight in (1.0, 2.0, 4.0, 8.0, 16.0):
            for r in range(5):
                model.weights[r][model.anchor] = anchor_weight
            _ = model.rtp()
    return _probe


def _w711_workload():
    from tools.gdd_asset_pipeline.pipeline import GddSpec
    from tools.symbolic_slot_math.model import RtpModel
    from tools.unified_pipeline.pipeline import (
        UnifiedAuditConfig, run_unified_pipeline,
    )
    cfg = UnifiedAuditConfig(
        gdd=GddSpec(
            game_id="PERF", name="Perf", theme="jungle", mood="epic",
            volatility_class="high",
            symbols=["A", "B", "C", "Wild", "Scatter"],
            features=["free_spins"],
        ),
        rtp_model=RtpModel(
            n_reels=5, n_symbols=2,
            paytable=[[1.0, 4.0, 10.0], []],
            min_match=3, paylines=20, anchor=0,
            weights=[[4.0, 6.0] for _ in range(5)],
        ),
        n_genome_population=6, n_genome_generations=2,
        n_rl_players=1, n_rl_sessions=1,
        n_session_mesh_spins=4,
    )
    return lambda: run_unified_pipeline(cfg)


_KERNELS = [
    ("W7.1 Math Genome", _w71_workload),
    ("W7.3 RL Cohort", _w73_workload),
    ("W7.4 Asset Manifest", _w74_workload),
    ("W7.5 Session Mesh", _w75_workload),
    ("W7.6 Derivative Manifest", _w76_workload),
    ("W7.7 JS Bundle", _w77_workload),
    ("W7.9 Vendor Graph Ingest", _w79_workload),
    ("W7.10 Self-Play Probe", _w710_workload),
    ("W7.11 Unified Pipeline", _w711_workload),
]


def run_perf_suite(*, n_runs: int = 5) -> PerfReport:
    rows: list[BenchRow] = []
    for name, ctor in _KERNELS:
        workload = ctor()
        rows.append(bench_kernel(name, workload, n_runs=n_runs))
    return PerfReport(rows=rows, n_runs=n_runs)


def write_perf_report(report: PerfReport, out_path: Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    return out_path
