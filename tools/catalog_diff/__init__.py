"""W63 — Catalog Diff Reporter.

Compares two ``INDEX.json`` snapshots emitted by W61
``catalog_sync``; produces a structured diff:

  * **added** — kernels in new but not old
  * **removed** — kernels in old but not new
  * **field_schema_changes** — same kernel, different params_fields
    (regulator-relevant: any field schema change is a breaking
    contract update)
  * **docstring_drift** — same kernel, different module docstring
  * **helper_additions / helper_removals**
  * **version_change** — version string delta

CI gate: exit 1 if any breaking change (removed kernel OR field
schema change) is detected; warn otherwise.
"""
from tools.catalog_diff.differ import (
    KernelDelta,
    CatalogDiffReport,
    diff_indices,
    render_markdown,
)

__all__ = [
    "KernelDelta",
    "CatalogDiffReport",
    "diff_indices",
    "render_markdown",
]
