"""W7.1 — Self-Evolving Math Genome implementation.

Pure-Python NSGA-II-flavored multi-objective genetic algorithm for
reel-weight tuning. No external deps.

Pipeline per generation:

  1. **Evaluate** — closed-form RTP + volatility CV + hit frequency
     per individual.
  2. **Multi-objective fitness** — 4 components clamped to [0, ∞)
     with target-relative error so they're commensurable:
       (a) RTP target distance:  |rtp - target_rtp| / target_rtp
       (b) volatility distance:  |cv - target_cv| / max(target_cv, 1e-6)
       (c) hit-freq distance:    |hf - target_hf| / max(target_hf, 1e-6)
       (d) fairness penalty:     concentration index over reel weights
           (prevents degenerate solutions that put all mass on one
            symbol per reel).
  3. **Non-dominated sort** — assign Pareto rank 1..K.
  4. **Crowding distance** — favors individuals on uncrowded fronts.
  5. **Selection** — binary tournament on (rank, -crowd).
  6. **Crossover** — uniform on per-reel weight vectors.
  7. **Mutation** — Gaussian jitter on weights, clipped to [w_min, w_max].

Determinism comes from a single `random.Random` instance seeded once.
"""

from __future__ import annotations

import dataclasses
import math
import random
from typing import Sequence


# ─── Spec & config ──────────────────────────────────────────────────


@dataclasses.dataclass
class GenomeSpec:
    """The fixed parts of the slot — paytable + topology + targets."""

    n_reels: int
    n_symbols: int
    """Number of symbol ids; index 0 is the anchor (paying) symbol."""
    paytable: list[list[float]]
    """``paytable[symbol_id][match_len - min_match]`` → payout multiplier."""
    min_match: int
    paylines: int
    anchor: int

    target_rtp: float
    target_cv: float
    target_hit_freq: float

    weight_min: float = 1.0
    weight_max: float = 50.0

    def validate(self) -> None:
        if self.n_reels < 3:
            raise ValueError("n_reels must be >= 3 for a lines slot")
        if self.n_symbols < 2:
            raise ValueError("n_symbols must be >= 2 (anchor + non-anchor)")
        if self.anchor < 0 or self.anchor >= self.n_symbols:
            raise ValueError(f"anchor index {self.anchor} out of range")
        if not (0.0 < self.target_rtp <= 100.0):
            raise ValueError("target_rtp must be in (0, 100]")
        if self.weight_min <= 0 or self.weight_max <= self.weight_min:
            raise ValueError("require 0 < weight_min < weight_max")


@dataclasses.dataclass
class GenomeConfig:
    """GA hyper-parameters."""

    population_size: int = 32
    generations: int = 40
    crossover_prob: float = 0.8
    mutation_prob: float = 0.2
    mutation_sigma: float = 2.5
    tournament_k: int = 2
    seed: int = 12345

    def validate(self) -> None:
        if self.population_size < 4:
            raise ValueError("population_size must be >= 4")
        if self.generations < 1:
            raise ValueError("generations must be >= 1")
        if not (0.0 <= self.crossover_prob <= 1.0):
            raise ValueError("crossover_prob must be in [0, 1]")
        if not (0.0 <= self.mutation_prob <= 1.0):
            raise ValueError("mutation_prob must be in [0, 1]")
        if self.mutation_sigma <= 0:
            raise ValueError("mutation_sigma must be positive")


# ─── Genome (Individual) ─────────────────────────────────────────────


@dataclasses.dataclass
class Individual:
    """One slot configuration — reel weights only."""

    weights: list[list[float]]
    """``weights[r][s]`` is the relative weight of symbol s on reel r."""
    rtp: float = 0.0
    cv: float = 0.0
    hit_freq: float = 0.0
    fitness: tuple[float, float, float, float] = dataclasses.field(
        default_factory=lambda: (0.0, 0.0, 0.0, 0.0)
    )
    rank: int = 0
    crowd: float = 0.0

    def clone(self) -> "Individual":
        return Individual(weights=[list(r) for r in self.weights])

    def to_dict(self) -> dict:
        return {
            "weights": self.weights,
            "rtp": self.rtp,
            "cv": self.cv,
            "hit_freq": self.hit_freq,
            "fitness": list(self.fitness),
            "rank": self.rank,
            "crowd": self.crowd if math.isfinite(self.crowd) else 1e18,
        }


# ─── Closed-form RTP + volatility + hit-freq ─────────────────────────


def closed_form_rtp(
    spec: GenomeSpec, weights: Sequence[Sequence[float]]
) -> tuple[float, float, float]:
    """Return (rtp_pct, cv, hit_freq).

    Same semantics as ``rust-sim::qmc_estimator::LinesEvalSpec``:
    left-to-right longest-anchor run, marginal-iid per reel.
    """
    totals = [sum(r) for r in weights]
    if any(t <= 0 for t in totals):
        return (0.0, 0.0, 0.0)
    p_anchor = [
        (weights[r][spec.anchor] / totals[r]) if totals[r] > 0 else 0.0
        for r in range(spec.n_reels)
    ]
    prefix = 1.0
    ev_per_line = 0.0
    ev2_per_line = 0.0
    hit_prob = 0.0
    for k in range(spec.n_reels):
        prefix *= p_anchor[k]
        if k + 1 == spec.n_reels:
            p_exact_k = prefix
        else:
            p_exact_k = prefix * (1.0 - p_anchor[k + 1])
        payout = _paytable_payout(spec, k + 1)
        ev_per_line += p_exact_k * payout
        ev2_per_line += p_exact_k * payout * payout
        if k + 1 >= spec.min_match:
            hit_prob += p_exact_k
    rtp_pct = ev_per_line * 100.0
    var_per_line = ev2_per_line - ev_per_line * ev_per_line
    cv = math.sqrt(max(var_per_line, 0.0)) / max(ev_per_line, 1e-12)
    return rtp_pct, cv, hit_prob * spec.paylines


def _paytable_payout(spec: GenomeSpec, run_len: int) -> float:
    if run_len < spec.min_match:
        return 0.0
    row = spec.paytable[spec.anchor]
    col = run_len - spec.min_match
    if col < 0 or col >= len(row):
        return 0.0
    return max(row[col], 0.0)


# ─── Fitness ─────────────────────────────────────────────────────────


def compute_fitness(
    spec: GenomeSpec, ind: Individual
) -> tuple[float, float, float, float]:
    """Multi-objective fitness — lower is better on every axis."""
    rtp, cv, hit_freq = closed_form_rtp(spec, ind.weights)
    ind.rtp = rtp
    ind.cv = cv
    ind.hit_freq = hit_freq

    rtp_err = abs(rtp - spec.target_rtp) / max(spec.target_rtp, 1e-12)
    cv_err = abs(cv - spec.target_cv) / max(spec.target_cv, 1e-6)
    hf_err = abs(hit_freq - spec.target_hit_freq) / max(
        spec.target_hit_freq, 1e-6
    )

    # Fairness penalty: Herfindahl-Hirschman-style concentration index
    # over the reel weight distribution. If a single symbol monopolizes
    # a reel, HHI → 1.0; uniform distribution → 1/n_symbols. We invert
    # so the cost grows with concentration above 0.5.
    fairness_penalty = 0.0
    for reel in ind.weights:
        total = sum(reel)
        if total <= 0:
            fairness_penalty += 1.0
            continue
        hhi = sum((w / total) ** 2 for w in reel)
        fairness_penalty += max(0.0, hhi - 0.5)
    fairness_penalty /= spec.n_reels

    fitness = (rtp_err, cv_err, hf_err, fairness_penalty)
    ind.fitness = fitness
    return fitness


# ─── Non-dominated sort + crowding ───────────────────────────────────


def dominates(a: tuple[float, ...], b: tuple[float, ...]) -> bool:
    """Pareto dominance — `a` dominates `b` iff `a` ≤ `b` componentwise
    AND there exists at least one strictly-less component."""
    if len(a) != len(b):
        raise ValueError("fitness tuples must have same arity")
    not_worse = all(ax <= bx for ax, bx in zip(a, b))
    strict = any(ax < bx for ax, bx in zip(a, b))
    return not_worse and strict


def fast_non_dominated_sort(pop: list[Individual]) -> list[list[Individual]]:
    """NSGA-II canonical fast non-dominated sort. Returns list of fronts."""
    fronts: list[list[Individual]] = [[]]
    dominated: dict[int, list[Individual]] = {i: [] for i in range(len(pop))}
    dom_count: list[int] = [0] * len(pop)
    for i, p in enumerate(pop):
        for j, q in enumerate(pop):
            if i == j:
                continue
            if dominates(p.fitness, q.fitness):
                dominated[i].append(q)
            elif dominates(q.fitness, p.fitness):
                dom_count[i] += 1
        if dom_count[i] == 0:
            p.rank = 1
            fronts[0].append(p)
    rank = 0
    while fronts[rank]:
        next_front: list[Individual] = []
        for p in fronts[rank]:
            # Locate p's index in pop to walk its dominated list.
            idx = pop.index(p)
            for q in dominated[idx]:
                qi = pop.index(q)
                dom_count[qi] -= 1
                if dom_count[qi] == 0:
                    q.rank = rank + 2
                    next_front.append(q)
        rank += 1
        fronts.append(next_front)
    if not fronts[-1]:
        fronts.pop()
    return fronts


def assign_crowding_distance(front: list[Individual]) -> None:
    """NSGA-II crowding distance per objective dimension."""
    if not front:
        return
    n_obj = len(front[0].fitness)
    for ind in front:
        ind.crowd = 0.0
    if len(front) <= 2:
        for ind in front:
            ind.crowd = math.inf
        return
    for m in range(n_obj):
        front.sort(key=lambda ind: ind.fitness[m])
        front[0].crowd = math.inf
        front[-1].crowd = math.inf
        f_min = front[0].fitness[m]
        f_max = front[-1].fitness[m]
        denom = f_max - f_min
        if denom == 0:
            continue
        for i in range(1, len(front) - 1):
            front[i].crowd += (
                front[i + 1].fitness[m] - front[i - 1].fitness[m]
            ) / denom


# ─── Variation operators ─────────────────────────────────────────────


def tournament_select(
    pop: list[Individual], rng: random.Random, k: int
) -> Individual:
    contenders = rng.sample(pop, k=min(k, len(pop)))
    contenders.sort(key=lambda ind: (ind.rank, -ind.crowd))
    return contenders[0]


def uniform_crossover(
    a: Individual, b: Individual, rng: random.Random
) -> Individual:
    child_weights: list[list[float]] = []
    for r in range(len(a.weights)):
        reel = []
        for s in range(len(a.weights[r])):
            if rng.random() < 0.5:
                reel.append(a.weights[r][s])
            else:
                reel.append(b.weights[r][s])
        child_weights.append(reel)
    return Individual(weights=child_weights)


def gaussian_mutate(
    ind: Individual, spec: GenomeSpec, rng: random.Random, sigma: float, prob: float
) -> None:
    for r in range(len(ind.weights)):
        for s in range(len(ind.weights[r])):
            if rng.random() < prob:
                jitter = rng.gauss(0.0, sigma)
                w = ind.weights[r][s] + jitter
                ind.weights[r][s] = min(spec.weight_max, max(spec.weight_min, w))


# ─── Driver ──────────────────────────────────────────────────────────


@dataclasses.dataclass
class ParetoFrontier:
    generation: int
    members: list[Individual]

    def to_dict(self) -> dict:
        return {
            "generation": self.generation,
            "members": [m.to_dict() for m in self.members],
        }


def _initialize_population(
    spec: GenomeSpec, cfg: GenomeConfig, rng: random.Random
) -> list[Individual]:
    pop: list[Individual] = []
    for _ in range(cfg.population_size):
        weights = [
            [rng.uniform(spec.weight_min, spec.weight_max) for _ in range(spec.n_symbols)]
            for _ in range(spec.n_reels)
        ]
        pop.append(Individual(weights=weights))
    return pop


def evolve_population(
    spec: GenomeSpec, cfg: GenomeConfig, on_generation=None,
) -> ParetoFrontier:
    """Run NSGA-II for `cfg.generations` and return the final Pareto frontier."""
    spec.validate()
    cfg.validate()
    rng = random.Random(cfg.seed)

    pop = _initialize_population(spec, cfg, rng)
    for ind in pop:
        compute_fitness(spec, ind)

    for gen in range(cfg.generations):
        fronts = fast_non_dominated_sort(pop)
        for front in fronts:
            assign_crowding_distance(front)
        # Create offspring of same size.
        offspring: list[Individual] = []
        while len(offspring) < cfg.population_size:
            a = tournament_select(pop, rng, cfg.tournament_k)
            b = tournament_select(pop, rng, cfg.tournament_k)
            if rng.random() < cfg.crossover_prob:
                child = uniform_crossover(a, b, rng)
            else:
                child = a.clone()
            gaussian_mutate(child, spec, rng, cfg.mutation_sigma, cfg.mutation_prob)
            compute_fitness(spec, child)
            offspring.append(child)
        # Combine parents + offspring; truncate to population size by rank/crowd.
        combined = pop + offspring
        fronts = fast_non_dominated_sort(combined)
        for front in fronts:
            assign_crowding_distance(front)
        new_pop: list[Individual] = []
        for front in fronts:
            if len(new_pop) + len(front) <= cfg.population_size:
                new_pop.extend(front)
            else:
                front.sort(key=lambda ind: -ind.crowd)
                new_pop.extend(front[: cfg.population_size - len(new_pop)])
                break
        pop = new_pop
        if on_generation is not None:
            on_generation(gen, pop)

    fronts = fast_non_dominated_sort(pop)
    for front in fronts:
        assign_crowding_distance(front)
    pareto = fronts[0] if fronts else []
    return ParetoFrontier(generation=cfg.generations - 1, members=pareto)


# ─── High-level facade ───────────────────────────────────────────────


class SelfEvolvingMathGenome:
    """One-shot evolve-and-extract Pareto frontier helper."""

    def __init__(self, spec: GenomeSpec, cfg: GenomeConfig | None = None) -> None:
        spec.validate()
        self.spec = spec
        self.cfg = cfg or GenomeConfig()
        self.cfg.validate()

    def evolve(self, on_generation=None) -> ParetoFrontier:
        return evolve_population(self.spec, self.cfg, on_generation=on_generation)
