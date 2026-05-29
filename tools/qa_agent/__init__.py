"""tools.qa_agent — infallible QA orchestrator for the slot-math build section.

Runs every automatic test surface the repo exposes (syntax, unit, integration,
property, mutation, regression, coverage) plus YAML-driven manual scenarios,
then emits a single unified verdict per layer + an aggregate exit code.

Layer model (see `agents/QA_AGENT.md` for the full spec):

  L0 selftest   · L1 antibody · L2 syntax  · L3 unit       · L4 integration
  L5 property   · L6 mutation · L7 regression · L8 coverage · L9 manual

CLI surface (delegated to `tools.qa_agent.cli`):

  python -m tools.qa_agent selftest
  python -m tools.qa_agent auto    [--quick] [--skip Lx ...]
  python -m tools.qa_agent manual  [--scenario <id> | --all]
  python -m tools.qa_agent full    [--baseline <sha>] [--seed 42]
  python -m tools.qa_agent status
  python -m tools.qa_agent antibody "<symptom>"

Exit codes:
  0 all green · 1 any FAIL · 2 bad input · 3 infra error · 4 antibody block.
"""
from __future__ import annotations

from .cli import main  # noqa: F401

__all__ = ["main"]
