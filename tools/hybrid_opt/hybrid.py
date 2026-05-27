"""PHASE 30 — Hybrid GA + Quantum Annealer optimizer.

Each generation:
  1. Evaluate population
  2. Select top-k elites
  3. Polish elites via PHASE 21 quantum annealer (short local refinement)
  4. Generate offspring via crossover + Gaussian mutation
  5. Replace worst with offspring + elites

Pure stdlib.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Callable, Optional

from tools.quantum_opt import anneal


@dataclass
class HybridConfig:
    population_size: int = 20
    elite_count: int = 4
    generations: int = 30
    mutation_sigma: float = 0.1
    anneal_iterations_per_elite: int = 50
    seed: int = 0xfa1_caf3

    def __post_init__(self) -> None:
        if self.population_size < 4:
            raise ValueError("population_size must be ≥ 4")
        if not 1 <= self.elite_count <= self.population_size // 2:
            raise ValueError("elite_count must be in [1, pop/2]")
        if self.generations < 1:
            raise ValueError("generations must be ≥ 1")
        if self.mutation_sigma <= 0:
            raise ValueError("mutation_sigma must be > 0")
        if self.anneal_iterations_per_elite < 1:
            raise ValueError("anneal_iterations_per_elite must be ≥ 1")


@dataclass
class HybridResult:
    schema_version: str = "urn:slotmath:hybrid-opt:v1"
    best_x: list[float] = field(default_factory=list)
    best_cost: float = math.inf
    generations_run: int = 0
    final_population_costs: list[float] = field(default_factory=list)
    cost_trace_per_generation: list[float] = field(default_factory=list)


def _crossover(p1: list[float], p2: list[float], rng: random.Random) -> list[float]:
    """Uniform crossover."""
    return [p1[i] if rng.random() < 0.5 else p2[i] for i in range(len(p1))]


def _mutate(
    x: list[float], bounds: list[tuple[float, float]], sigma: float,
    rng: random.Random,
) -> list[float]:
    out: list[float] = []
    for v, (lo, hi) in zip(x, bounds, strict=True):
        width = hi - lo
        new = v + rng.gauss(0, sigma * width)
        out.append(max(lo, min(hi, new)))
    return out


def _random_individual(
    bounds: list[tuple[float, float]], rng: random.Random,
) -> list[float]:
    return [rng.uniform(lo, hi) for lo, hi in bounds]


def hybrid_optimize(
    objective: Callable[[list[float]], float],
    bounds: list[tuple[float, float]],
    *,
    config: Optional[HybridConfig] = None,
) -> HybridResult:
    """Run hybrid GA+annealing optimization."""
    cfg = config or HybridConfig()
    if not bounds:
        raise ValueError("bounds list must be non-empty")
    rng = random.Random(cfg.seed)

    # Initial population
    population: list[list[float]] = [
        _random_individual(bounds, rng) for _ in range(cfg.population_size)
    ]
    costs: list[float] = [float(objective(x)) for x in population]

    result = HybridResult(generations_run=0)
    best_x = list(population[min(range(len(costs)), key=lambda i: costs[i])])
    best_cost = min(costs)

    for gen in range(cfg.generations):
        # Sort population by cost
        order = sorted(range(len(population)), key=lambda i: costs[i])
        elites = [population[i] for i in order[: cfg.elite_count]]
        elite_costs = [costs[i] for i in order[: cfg.elite_count]]

        # Anneal each elite (local refinement)
        refined_elites: list[tuple[list[float], float]] = []
        for elite in elites:
            res = anneal(
                objective, elite, bounds,
                iterations=cfg.anneal_iterations_per_elite,
                seed=cfg.seed + gen * 1000 + len(refined_elites),
                step_sigma=cfg.mutation_sigma * 0.5,
            )
            refined_elites.append((res.best_x, res.best_cost))

        # Build next generation: refined elites + offspring
        next_pop: list[list[float]] = [e[0] for e in refined_elites]
        next_costs: list[float] = [e[1] for e in refined_elites]
        while len(next_pop) < cfg.population_size:
            p1 = rng.choice(elites)
            p2 = rng.choice(elites)
            child = _crossover(p1, p2, rng)
            child = _mutate(child, bounds, cfg.mutation_sigma, rng)
            next_pop.append(child)
            next_costs.append(float(objective(child)))

        population = next_pop
        costs = next_costs

        # Track global best
        cur_best_idx = min(range(len(costs)), key=lambda i: costs[i])
        if costs[cur_best_idx] < best_cost:
            best_cost = costs[cur_best_idx]
            best_x = list(population[cur_best_idx])
        result.cost_trace_per_generation.append(best_cost)
        result.generations_run = gen + 1

    result.best_x = best_x
    result.best_cost = best_cost
    result.final_population_costs = sorted(costs)
    return result
