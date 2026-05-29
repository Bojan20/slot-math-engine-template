"""W6.3 — LLM demo recorder.

Drives the W6.2 LLM NL → GDD demo on 5 archetype prompts, records:
  • asciinema-cast (`.cast`) terminal sessions
  • plain-text transcripts
  • per-prompt wall-clock + token-usage timing
  • machine-readable transcript.json
  • markdown SUMMARY.md for pitch decks

Default mode = mock (CI-safe, no API key).
"""

from __future__ import annotations

__all__ = ["__main__"]
