"""W42 — Release Notes Synthesizer.

Builds a release notes Markdown document from a sequence of commits
plus a structured change inventory:

  • Groups commits by Conventional Commit type (feat/fix/refactor/…).
  • Surfaces breaking changes (! suffix or BREAKING CHANGE: footer).
  • Adds a "Stats" block (kernel count, entry point count, test
    count) if provided by the caller.
  • Optional regulatory footer (audit pin hashes, signed-by).
"""
from tools.release_notes.synthesizer import (
    CommitEntry,
    ReleaseNotes,
    parse_commits,
    render_markdown,
)

__all__ = [
    "CommitEntry",
    "ReleaseNotes",
    "parse_commits",
    "render_markdown",
]
