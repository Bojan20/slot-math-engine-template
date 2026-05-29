"""CLI for the W7.1 Self-Evolving Math Genome.

Example::

    python -m tools.math_genome \\
        --target-rtp 96 \\
        --target-cv 7.5 \\
        --target-hit-freq 0.27 \\
        --population 32 \\
        --generations 40 \\
        --seed 12345 \\
        --out reports/acceptance/MATH_GENOME.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .genome import (
    GenomeConfig,
    GenomeSpec,
    SelfEvolvingMathGenome,
)


def default_spec(args: argparse.Namespace) -> GenomeSpec:
    """Classic 5×3 / 20-line single-class anchor spec — same as the
    QMC convergence benchmark so the two reports are comparable."""
    return GenomeSpec(
        n_reels=5,
        n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3,
        paylines=20,
        anchor=0,
        target_rtp=args.target_rtp,
        target_cv=args.target_cv,
        target_hit_freq=args.target_hit_freq,
        weight_min=args.weight_min,
        weight_max=args.weight_max,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="math_genome",
        description="Multi-objective genetic reel-weight tuner (W7.1)",
    )
    parser.add_argument("--target-rtp", type=float, default=96.0,
                        help="Target RTP (percent). Default 96.")
    parser.add_argument("--target-cv", type=float, default=7.5,
                        help="Target coefficient of variation. Default 7.5.")
    parser.add_argument("--target-hit-freq", type=float, default=0.27,
                        help="Target hit frequency. Default 0.27.")
    parser.add_argument("--weight-min", type=float, default=1.0)
    parser.add_argument("--weight-max", type=float, default=50.0)
    parser.add_argument("--population", type=int, default=32)
    parser.add_argument("--generations", type=int, default=40)
    parser.add_argument("--crossover-prob", type=float, default=0.8)
    parser.add_argument("--mutation-prob", type=float, default=0.2)
    parser.add_argument("--mutation-sigma", type=float, default=2.5)
    parser.add_argument("--tournament-k", type=int, default=2)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--out", type=Path, required=True,
                        help="Output Pareto frontier JSON path.")
    args = parser.parse_args(argv)

    spec = default_spec(args)
    cfg = GenomeConfig(
        population_size=args.population,
        generations=args.generations,
        crossover_prob=args.crossover_prob,
        mutation_prob=args.mutation_prob,
        mutation_sigma=args.mutation_sigma,
        tournament_k=args.tournament_k,
        seed=args.seed,
    )

    genome = SelfEvolvingMathGenome(spec, cfg)
    pareto = genome.evolve()
    doc = {
        "spec": {
            "n_reels": spec.n_reels,
            "n_symbols": spec.n_symbols,
            "paytable": spec.paytable,
            "min_match": spec.min_match,
            "paylines": spec.paylines,
            "anchor": spec.anchor,
            "target_rtp": spec.target_rtp,
            "target_cv": spec.target_cv,
            "target_hit_freq": spec.target_hit_freq,
            "weight_min": spec.weight_min,
            "weight_max": spec.weight_max,
        },
        "config": {
            "population_size": cfg.population_size,
            "generations": cfg.generations,
            "crossover_prob": cfg.crossover_prob,
            "mutation_prob": cfg.mutation_prob,
            "mutation_sigma": cfg.mutation_sigma,
            "tournament_k": cfg.tournament_k,
            "seed": cfg.seed,
        },
        "pareto": pareto.to_dict(),
        "frontier_size": len(pareto.members),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2, sort_keys=True))
    print(
        f"math_genome: Pareto frontier with {len(pareto.members)} members "
        f"→ {args.out}",
        file=sys.stderr,
    )
    # Markdown summary for PR comments.
    print("| # | RTP | CV | hit_freq | rtp_err | cv_err | hf_err | fairness |")
    print("|---:|---:|---:|---:|---:|---:|---:|---:|")
    for i, m in enumerate(pareto.members[:10]):
        print(
            f"| {i} | {m.rtp:.4f} | {m.cv:.4f} | {m.hit_freq:.4f} | "
            f"{m.fitness[0]:.4e} | {m.fitness[1]:.4e} | "
            f"{m.fitness[2]:.4e} | {m.fitness[3]:.4e} |"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
