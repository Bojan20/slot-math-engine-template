"""tools.agent_eval — eval harness for PHASE 8 agents (P8.5).

Single entry point that runs the held-out acceptance eval for a P8.x agent
and emits a verdict matching the thresholds in the agent's manifest.

This harness does NOT call an LLM directly — it consumes a CSV/JSONL of
agent responses (produced by Corti via the Claude Code Agent tool) and
compares against the held-out expectations. This decouples the eval
runner from the model invocation so it can be re-run in CI without
burning API tokens.

CLI:
    python -m tools.agent_eval <agent> --responses <path>
    python -m tools.agent_eval <agent> --self-test
    python -m tools.agent_eval list
"""
from __future__ import annotations

from .cli import main  # noqa: F401

__all__ = ["main"]
