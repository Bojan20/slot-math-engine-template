"""W48 — Kernel Comparator.

Compares 2 closed-form kernels under the same input domain to test
whether they produce equivalent (or proportional) outputs. Useful
for:

  • Refactoring sanity (old vs new implementation)
  • Cross-validation between similar patterns (e.g. cluster_pays vs
    cluster_consolidation under matching parameter mapping)
  • Stability of analytical formulas across parameter perturbations
"""
from tools.kernel_compare.comparator import (
    KernelComparisonResult,
    compare_kernels,
    proportionality_test,
)

__all__ = [
    "KernelComparisonResult",
    "compare_kernels",
    "proportionality_test",
]
