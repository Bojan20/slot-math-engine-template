"""W7.1 — Self-Evolving Math Genome.

Genetic algorithm that perturbs a baseline universal IR until its
Monte-Carlo RTP matches a designer-supplied target. The slot's
"genome" is composed of three loci that the solver can mutate:

  ▸ Paytable pay values (scale factor per row, ε bounded)
  ▸ Reel weight distributions (Dirichlet-perturbed; preserves total)
  ▸ Feature trigger probabilities (HoldAndWin, LinearProgressive)

Public API:

    from tools.evolution.genetic_solver import evolve_to_target
    best = evolve_to_target(
        baseline_ir_path, target_rtp=0.95,
        population=10, generations=20, spins_per_eval=20_000,
    )

Industry-first per Kimi research — no commercial slot studio publishes
a genome-based math optimizer. SMT/Z3 alternative tracked as W7.3.
"""
from .genetic_solver import evolve_to_target, Genome, Population

__all__ = ["evolve_to_target", "Genome", "Population"]
