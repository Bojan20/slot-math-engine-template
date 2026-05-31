"""SLOT-MATH Faza 6.7 — Self-healing kernel composition.

If a kernel fails during MC sweep (returns NaN, raises, or exceeds timeout),
the orchestrator picks a fallback kernel from the FallbackPlan and logs
root cause. Pipeline continues instead of halting.

Used by Faza 3 MC orchestrator when running adapter-driven games where
one kernel might mis-fit a corner-case PAR.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class KernelHealth:
    """Per-kernel health state observed during runtime."""
    kernel_id: str
    invocations: int
    failures: int
    last_error: str = ""

    @property
    def failure_rate(self) -> float:
        return self.failures / self.invocations if self.invocations else 0.0


@dataclass
class FallbackPlan:
    """Ordered fallback list for a single (feature_kind, primary_kernel) pair."""
    primary: str
    fallbacks: list[str] = field(default_factory=list)
    failure_threshold: float = 0.05  # if primary fails > 5% → try first fallback


def build_fallback_plan(feature_kind: str) -> FallbackPlan:
    """Default fallback plans per feature kind (curated, conservative)."""
    plans = {
        "free_spins": FallbackPlan(
            primary="expanding_symbol",
            fallbacks=["state_machine"],
        ),
        "hold_and_win": FallbackPlan(
            primary="hold_and_win",  # composed kernel
            fallbacks=["money_collect", "must_hit_by"],  # individual components
        ),
        "cascade": FallbackPlan(
            primary="cascade",
            fallbacks=["state_machine"],  # generic state-machine fallback
        ),
        "cluster_pays": FallbackPlan(
            primary="cluster_pays",
            fallbacks=["ways_evaluator"],  # ways is closest semantic alternative
        ),
        "ways": FallbackPlan(
            primary="ways_evaluator",
            fallbacks=["asymmetric_paytable"],  # generic line eval w/ ways shape
        ),
        "buy_feature": FallbackPlan(
            primary="buy_feature",
            fallbacks=[],  # no fallback — buy feature is atomic
        ),
        "pick": FallbackPlan(
            primary="pick_chain",
            fallbacks=["state_machine"],
        ),
        "wheel": FallbackPlan(
            primary="wheel",
            fallbacks=[],
        ),
    }
    return plans.get(
        feature_kind,
        FallbackPlan(primary="asymmetric_paytable", fallbacks=[]),
    )


def pick_kernel_with_fallback(
    feature_kind: str,
    health: dict[str, KernelHealth],
) -> str:
    """Return the kernel that should run, considering health stats."""
    plan = build_fallback_plan(feature_kind)
    if plan.primary not in health:
        return plan.primary
    if health[plan.primary].failure_rate <= plan.failure_threshold:
        return plan.primary
    for fb in plan.fallbacks:
        if fb not in health or health[fb].failure_rate <= plan.failure_threshold:
            return fb
    return plan.primary  # all unhealthy → still try primary, let upper layer catch
