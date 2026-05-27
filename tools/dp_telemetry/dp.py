"""PHASE 28 — Differential privacy primitives."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field


class PrivacyBudgetExhausted(Exception):
    pass


@dataclass
class PrivacyBudget:
    """Track cumulative ε spend; raises when over cap."""

    epsilon_cap: float
    delta_cap: float = 0.0
    epsilon_spent: float = 0.0
    delta_spent: float = 0.0
    query_log: list[tuple[str, float, float]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.epsilon_cap <= 0:
            raise ValueError("epsilon_cap must be > 0")
        if self.delta_cap < 0:
            raise ValueError("delta_cap must be ≥ 0")

    def charge(self, epsilon: float, delta: float = 0.0,
                query_label: str = "") -> None:
        if epsilon <= 0:
            raise ValueError("epsilon must be > 0")
        if delta < 0:
            raise ValueError("delta must be ≥ 0")
        new_eps = self.epsilon_spent + epsilon
        new_delta = self.delta_spent + delta
        if new_eps > self.epsilon_cap + 1e-12:
            raise PrivacyBudgetExhausted(
                f"epsilon spend {new_eps:.6f} > cap {self.epsilon_cap:.6f}"
            )
        if new_delta > self.delta_cap + 1e-12:
            raise PrivacyBudgetExhausted(
                f"delta spend {new_delta:.6f} > cap {self.delta_cap:.6f}"
            )
        self.epsilon_spent = new_eps
        self.delta_spent = new_delta
        self.query_log.append((query_label, epsilon, delta))

    @property
    def remaining_epsilon(self) -> float:
        return max(0.0, self.epsilon_cap - self.epsilon_spent)


def laplace_mechanism(
    true_value: float,
    sensitivity: float,
    epsilon: float,
    *,
    budget: PrivacyBudget | None = None,
    query_label: str = "",
    rng: random.Random | None = None,
) -> float:
    """Add Laplace(0, Δ/ε) noise to `true_value`.

    Returns: noisy_value
    """
    if sensitivity <= 0:
        raise ValueError("sensitivity must be > 0")
    if epsilon <= 0:
        raise ValueError("epsilon must be > 0")
    if budget is not None:
        budget.charge(epsilon, delta=0.0, query_label=query_label)
    rng = rng or random.Random()
    # Laplace(0, b) sampling via inverse CDF
    u = rng.random() - 0.5
    b = sensitivity / epsilon
    sign = 1 if u >= 0 else -1
    noise = -sign * b * math.log(1 - 2 * abs(u))
    return true_value + noise


def gaussian_mechanism(
    true_value: float,
    sensitivity: float,
    epsilon: float,
    delta: float,
    *,
    budget: PrivacyBudget | None = None,
    query_label: str = "",
    rng: random.Random | None = None,
) -> float:
    """Add Normal(0, σ²) noise where σ = Δ·√(2·ln(1.25/δ))/ε.

    (ε, δ)-differential privacy via the standard Gaussian mechanism.
    """
    if sensitivity <= 0:
        raise ValueError("sensitivity must be > 0")
    if epsilon <= 0:
        raise ValueError("epsilon must be > 0")
    if not 0 < delta < 1:
        raise ValueError("delta must be in (0, 1)")
    if budget is not None:
        budget.charge(epsilon, delta=delta, query_label=query_label)
    rng = rng or random.Random()
    sigma = sensitivity * math.sqrt(2 * math.log(1.25 / delta)) / epsilon
    return true_value + rng.gauss(0.0, sigma)
