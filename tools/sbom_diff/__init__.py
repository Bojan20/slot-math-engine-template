"""W69 — SBOM Diff Reporter.

Compares two CycloneDX 1.4 snapshots emitted by W67 ``cert_sbom``:

  * **added** — components in new but not old (purl key)
  * **removed** — components in old but not new
  * **hash_drift** — same purl, different SHA-256
  * **version_drift** — same name, different version
  * **entry_point_changes** — added/removed `[project.scripts]`

CI gate: exit 1 if any **breaking** delta exists. Breaking =
removed component OR hash drift on a still-present component OR
removed entry point.
"""
from tools.sbom_diff.differ import (
    ComponentDelta,
    SBOMDiffReport,
    diff_sboms,
    render_markdown,
)

__all__ = [
    "ComponentDelta",
    "SBOMDiffReport",
    "diff_sboms",
    "render_markdown",
]
