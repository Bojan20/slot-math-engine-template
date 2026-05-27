"""PHASE 30 — Hybrid Genetic+Annealing Optimizer.

Combines W7.4 NSGA-II-style genetic search w/ PHASE 21 quantum-annealed
local refinement: GA explores parameter space, annealer polishes each
generation's elite via Metropolis-Hastings.

Public API:
    from tools.hybrid_opt import (
        HybridConfig,
        HybridResult,
        hybrid_optimize,
    )
"""

from __future__ import annotations

from tools.hybrid_opt.hybrid import HybridConfig, HybridResult, hybrid_optimize

__all__ = ["HybridConfig", "HybridResult", "hybrid_optimize"]
