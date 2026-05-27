"""PHASE 21 — Quantum-inspired simulated annealing.

`QuantumAnnealer` mimics a quantum-annealing transverse-field schedule
via standard Metropolis-Hastings with an inverse-temperature β(t) that
grows from β_lo (warm — wide tunneling) to β_hi (cold — gradient-only).

Used to search per-feature parameter vectors against a user-supplied
objective(vector) → cost (lower = better). Compares against W7.4
NSGA-II only in conceptual role; this is a single-objective scalar
optimiser intended for fine-tune-around-target use cases.

Pure stdlib (math + random).
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, asdict, field
from typing import Any, Callable, Iterable, Optional


@dataclass
class OptimizationResult:
    schema_version: str = "urn:slotmath:quantum-opt:v1"
    best_x: list[float] = field(default_factory=list)
    best_cost: float = math.inf
    iterations: int = 0
    accepts: int = 0
    rejects: int = 0
    cost_trace: list[float] = field(default_factory=list)
    final_beta: float = 0.0


class QuantumAnnealer:
    """Single-objective Metropolis-Hastings with annealing schedule.

    Parameters:
      objective:   callable(x) → cost (lower = better)
      x0:          initial parameter vector
      bounds:      list of (lo, hi) per dimension
      step_sigma:  proposal std-dev per dimension (scaled to bounds width)
      iterations:  total iterations
      beta_lo:     initial inverse temperature (warm)
      beta_hi:     final inverse temperature (cold)
      seed:        RNG seed for determinism
    """

    def __init__(
        self,
        objective: Callable[[list[float]], float],
        x0: Iterable[float],
        bounds: list[tuple[float, float]],
        *,
        step_sigma: float = 0.1,
        iterations: int = 1000,
        beta_lo: float = 0.1,
        beta_hi: float = 10.0,
        seed: int = 0xa1_be,
    ) -> None:
        self.objective = objective
        self.x = [float(v) for v in x0]
        self.bounds = list(bounds)
        if len(self.x) != len(self.bounds):
            raise ValueError("x0 + bounds dimension mismatch")
        if iterations < 1:
            raise ValueError("iterations must be ≥ 1")
        if beta_lo <= 0 or beta_hi <= 0 or beta_hi <= beta_lo:
            raise ValueError("require 0 < beta_lo < beta_hi")
        self.step_sigma = step_sigma
        self.iterations = iterations
        self.beta_lo = beta_lo
        self.beta_hi = beta_hi
        self.rng = random.Random(seed)

    def _propose(self) -> list[float]:
        """Gaussian perturbation, clipped to bounds."""
        out: list[float] = []
        for v, (lo, hi) in zip(self.x, self.bounds, strict=True):
            width = hi - lo
            sigma = self.step_sigma * width
            new_v = v + self.rng.gauss(0.0, sigma)
            if new_v < lo:
                new_v = lo
            elif new_v > hi:
                new_v = hi
            out.append(new_v)
        return out

    def _schedule(self, t: int) -> float:
        """Log-linear interpolation of β from β_lo at t=0 to β_hi at t=N-1."""
        if self.iterations <= 1:
            return self.beta_hi
        progress = t / (self.iterations - 1)
        return math.exp(
            math.log(self.beta_lo)
            + progress * (math.log(self.beta_hi) - math.log(self.beta_lo))
        )

    def run(self) -> OptimizationResult:
        cur_cost = float(self.objective(self.x))
        best_x = list(self.x)
        best_cost = cur_cost
        accepts = 0
        rejects = 0
        trace: list[float] = [cur_cost]
        final_beta = self.beta_lo

        for t in range(self.iterations):
            beta = self._schedule(t)
            final_beta = beta
            proposal = self._propose()
            new_cost = float(self.objective(proposal))
            delta = new_cost - cur_cost
            if delta <= 0:
                accept = True
            else:
                # Metropolis: P(accept) = exp(-β·Δ)
                p = math.exp(-beta * delta)
                accept = self.rng.random() < p
            if accept:
                self.x = proposal
                cur_cost = new_cost
                accepts += 1
                if new_cost < best_cost:
                    best_cost = new_cost
                    best_x = list(proposal)
            else:
                rejects += 1
            trace.append(cur_cost)

        return OptimizationResult(
            best_x=best_x,
            best_cost=best_cost,
            iterations=self.iterations,
            accepts=accepts,
            rejects=rejects,
            cost_trace=trace,
            final_beta=final_beta,
        )


def anneal(
    objective: Callable[[list[float]], float],
    x0: Iterable[float],
    bounds: list[tuple[float, float]],
    **kwargs: Any,
) -> OptimizationResult:
    """Convenience wrapper: build QuantumAnnealer + .run() in one call."""
    return QuantumAnnealer(objective, x0, bounds, **kwargs).run()
