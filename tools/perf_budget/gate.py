"""Performance budget gate — time kernel ops against thresholds."""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class BudgetEntry:
    label: str
    elapsed_ms: float
    budget_ms: float
    error: str | None = None

    @property
    def passed(self) -> bool:
        return self.error is None and self.elapsed_ms <= self.budget_ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "elapsed_ms": self.elapsed_ms,
            "budget_ms": self.budget_ms,
            "passed": self.passed,
            "error": self.error,
        }


@dataclass
class BudgetReport:
    entries: list[BudgetEntry] = field(default_factory=list)

    @property
    def n_failed(self) -> int:
        return sum(1 for e in self.entries if not e.passed)

    @property
    def passed(self) -> bool:
        return self.n_failed == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_entries": len(self.entries),
            "n_failed": self.n_failed,
            "passed": self.passed,
            "entries": [e.to_dict() for e in self.entries],
        }


def measure(
    label: str, fn: Callable[[], Any], budget_ms: float,
    *, reps: int = 1,
) -> BudgetEntry:
    """Run `fn` `reps` times; record average elapsed_ms vs budget."""
    if reps <= 0:
        return BudgetEntry(label=label, elapsed_ms=0.0,
                            budget_ms=budget_ms, error="reps must be > 0")
    try:
        t0 = time.perf_counter()
        for _ in range(reps):
            fn()
        elapsed_ms = (time.perf_counter() - t0) * 1000.0 / reps
        return BudgetEntry(
            label=label, elapsed_ms=elapsed_ms, budget_ms=budget_ms,
        )
    except Exception as e:  # noqa: BLE001
        return BudgetEntry(
            label=label, elapsed_ms=0.0, budget_ms=budget_ms, error=str(e),
        )


def run_budget(measurements: list[BudgetEntry]) -> BudgetReport:
    return BudgetReport(entries=list(measurements))
