"""W43 — Performance Budget Gate.

Runs a closed-form kernel + MC simulation timing budget and fails
if any measured operation exceeds its budget. Useful as CI guard
for performance regressions (e.g. analytical_rtp must complete in
< 1ms; mc_simulate(50k) in < 1s).
"""
from tools.perf_budget.gate import (
    BudgetEntry,
    BudgetReport,
    run_budget,
    measure,
)

__all__ = [
    "BudgetEntry",
    "BudgetReport",
    "run_budget",
    "measure",
]
