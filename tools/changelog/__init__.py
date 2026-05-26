"""W28 — Auto Changelog Generator.

Walks `git log` over the `tools/` subtree and emits a structured
CHANGELOG.md grouped by:

  • Wave id (W4.9, W5.6+, W11, W12, …) when the commit subject
    starts with `feat(W<id>)…` or `fix(W<id>)…`.
  • Conventional-commit type otherwise (feat / fix / refactor / docs /
    test / chore).
  • Author + ISO date.

Output is regulator-friendly Markdown that can be checked into the
repo or attached to a release artifact.
"""
from tools.changelog.generator import (
    ChangelogEntry,
    Changelog,
    build_changelog,
    parse_log,
)

__all__ = [
    "ChangelogEntry",
    "Changelog",
    "build_changelog",
    "parse_log",
]
