"""W41 — Feature Coverage Audit.

Cross-checks the closed-form solver catalog (`tools/solvers/`)
against the feature kinds present in an IR portfolio:

  • Which IR features have a matching closed-form kernel?
  • Which kernels exist in the catalog but are not used by any IR?
  • Coverage % per vendor.

Produces a coverage matrix + actionable gap list.
"""
from tools.feature_coverage.auditor import (
    CoverageEntry,
    CoverageReport,
    FEATURE_KIND_TO_KERNEL,
    audit,
    audit_irs,
)

__all__ = [
    "CoverageEntry",
    "CoverageReport",
    "FEATURE_KIND_TO_KERNEL",
    "audit",
    "audit_irs",
]
