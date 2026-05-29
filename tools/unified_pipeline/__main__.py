"""CLI for the W7.11 Unified Audit Pipeline.

Example::

    python -m tools.unified_pipeline \\
        --gdd-id CRIMSON-TIGER \\
        --gdd-name "Crimson Tiger" \\
        --gdd-theme jungle \\
        --gdd-mood epic \\
        --gdd-volatility high \\
        --gdd-symbols Tiger,Lotus,Bamboo,Wild,Scatter \\
        --gdd-features free_spins,hold_and_win \\
        --population 32 \\
        --generations 12 \\
        --rl-players 6 \\
        --out reports/acceptance/UNIFIED_AUDIT.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tools.gdd_asset_pipeline.pipeline import GddSpec
from tools.symbolic_slot_math.model import RtpModel

from .pipeline import (
    UnifiedAuditConfig,
    run_unified_pipeline,
    write_unified_report,
)


def _default_rtp_model() -> RtpModel:
    """Standard 5×3 / 20-line reference spec (matches QMC convergence
    benchmark) — designers override via JSON file in production."""
    return RtpModel(
        n_reels=5,
        n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3,
        paylines=20,
        anchor=0,
        weights=[[4.0, 6.0] for _ in range(5)],
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="unified_pipeline",
        description="W7.11 unified audit pipeline (all 8 W7.x kernels in one call)",
    )
    parser.add_argument("--gdd-id", default="GAME-001")
    parser.add_argument("--gdd-name", default="Reference Slot")
    parser.add_argument("--gdd-theme", default="jungle")
    parser.add_argument("--gdd-mood", default="epic")
    parser.add_argument("--gdd-volatility", default="high")
    parser.add_argument(
        "--gdd-symbols",
        default="Tiger,Lotus,Bamboo,Wild,Scatter",
        help="Comma-separated symbol names.",
    )
    parser.add_argument(
        "--gdd-features",
        default="free_spins,hold_and_win",
        help="Comma-separated feature kinds.",
    )
    parser.add_argument("--population", type=int, default=16)
    parser.add_argument("--generations", type=int, default=8)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--target-rtp-pct", type=float, default=96.0)
    parser.add_argument("--target-cv", type=float, default=8.0)
    parser.add_argument("--target-hit-freq", type=float, default=0.27)
    parser.add_argument("--rl-players", type=int, default=4)
    parser.add_argument("--rl-sessions", type=int, default=3)
    parser.add_argument("--rl-seed", type=int, default=999)
    parser.add_argument("--n-mesh-spins", type=int, default=32)
    parser.add_argument("--session-id", default="unified-audit-session")
    parser.add_argument("--out", type=Path, required=True)

    args = parser.parse_args(argv)
    gdd = GddSpec(
        game_id=args.gdd_id,
        name=args.gdd_name,
        theme=args.gdd_theme,
        mood=args.gdd_mood,
        volatility_class=args.gdd_volatility,
        symbols=[s.strip() for s in args.gdd_symbols.split(",") if s.strip()],
        features=[f.strip() for f in args.gdd_features.split(",") if f.strip()],
    )
    rtp_model = _default_rtp_model()
    cfg = UnifiedAuditConfig(
        gdd=gdd,
        rtp_model=rtp_model,
        n_genome_population=args.population,
        n_genome_generations=args.generations,
        n_genome_seed=args.seed,
        target_rtp_pct=args.target_rtp_pct,
        target_cv=args.target_cv,
        target_hit_freq=args.target_hit_freq,
        n_rl_players=args.rl_players,
        n_rl_sessions=args.rl_sessions,
        rl_seed=args.rl_seed,
        n_session_mesh_spins=args.n_mesh_spins,
        session_id=args.session_id,
    )
    report = run_unified_pipeline(cfg)
    out = write_unified_report(report, args.out)
    print(
        f"unified_pipeline: consolidated_hash={report.consolidated_hash[:16]}…\n"
        f"  pareto frontier members: {len(report.pareto_summary)}\n"
        f"  RL KPI sessions: {report.rl_kpi['sessions']}\n"
        f"  session mesh root: {report.session_mesh_root[:16]}…\n"
        f"  JS bundle SHA-256: {report.js_bundle_sha256[:16]}…\n"
        f"  → {out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
