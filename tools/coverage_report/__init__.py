"""W25 — Repo Coverage Reporter.

Summarizes the repo's coverage across every dimension the slot math
toolkit exposes: solver kernels, jurisdiction profiles, vendor
profiles, console entry points, mission acceptance status, test
counts.

Output: Markdown report + JSON manifest.
"""
from .reporter import (
    Coverage,
    aggregate_coverage,
    emit_coverage,
)

__all__ = ["Coverage", "aggregate_coverage", "emit_coverage"]
