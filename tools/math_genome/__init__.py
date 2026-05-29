"""W7.1 — Self-Evolving Math Genome (multi-objective genetic reel-weight tuner).

A slot game is treated as DNA:

* **Genes** — per-reel symbol weights `weights[r][s]`.
* **Enzymes** — paytable entries (held fixed during evolution; the genome
  searches reel weights, not payouts).
* **Traits** — derived RTP, volatility class, hit frequency.

The genetic algorithm evolves a population of `N` candidate reel-weight
vectors over `G` generations under a **multi-objective fitness**
function: `(rtp_target_err, volatility_class_err, hit_freq_err,
fairness_penalty)`. Selection uses a fast non-dominated sort (NSGA-II
style) so the output is the Pareto frontier of the final generation
rather than a single "best" candidate — designers pick from a slate
of mathematically distinct games that all satisfy the spec.

The whole module is **pure Python stdlib** — no DEAP / numpy / scipy.
Determinism: seed the constructor with a `seed` and the same call
produces the same Pareto frontier byte-for-byte.

Why this matters commercially: a single designer can now generate a
**catalog** of N math configurations from one constraint spec instead
of tuning one reel set by hand. Kimi research (W181 batch) confirmed
no incumbent vendor ships a multi-objective genetic reel-weight tuner
with closed-form RTP fitness — this is an industry-first.
"""

from .genome import (
    GenomeConfig,
    GenomeSpec,
    Individual,
    ParetoFrontier,
    SelfEvolvingMathGenome,
    closed_form_rtp,
    compute_fitness,
    evolve_population,
)

__all__ = [
    "GenomeConfig",
    "GenomeSpec",
    "Individual",
    "ParetoFrontier",
    "SelfEvolvingMathGenome",
    "closed_form_rtp",
    "compute_fitness",
    "evolve_population",
]
