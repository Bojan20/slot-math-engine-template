"""PHASE 21 — Quantum-Inspired Parameter Optimization.

Simulated quantum annealing analog (Metropolis-Hastings w/ inverse-
temperature schedule that mimics quantum tunneling) for feature
parameter search. Vendor-neutral alternative to NSGA-II (W7.4).

Public API:
    from tools.quantum_opt import (
        QuantumAnnealer,
        OptimizationResult,
        anneal,
    )
"""

from __future__ import annotations

from tools.quantum_opt.annealer import (
    QuantumAnnealer,
    OptimizationResult,
    anneal,
)

__all__ = ["QuantumAnnealer", "OptimizationResult", "anneal"]
