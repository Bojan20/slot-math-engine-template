"""W78 / P7.6 — Community Contributor Flow.

`slot-contribute` walks an external contributor through the steps
needed to land a new template into the marketplace:

  1. scaffold a starter IR via `slot-vendor-scaffold`-equivalent
  2. lint the IR (referential integrity, feature wiring)
  3. emit a PR-ready folder containing the IR + cert XML stub +
     CONTRIBUTING.md + a filled-in PR description template

Output: a ``contributions/<template-id>/`` folder ready for
``git add`` and ``gh pr create``.
"""
from tools.community_contribute.flow import (
    ContributionPackage,
    StarterParams,
    bootstrap_contribution,
)

__all__ = [
    "ContributionPackage",
    "StarterParams",
    "bootstrap_contribution",
]
