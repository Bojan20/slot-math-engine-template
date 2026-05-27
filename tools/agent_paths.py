"""Shared environment-driven path helpers for `tools/agent_*`.

Decouples the slot-math toolchain from any specific orchestration host.
All agent-related tools resolve their root from:

    1. `$SLOT_MATH_AGENTS_ROOT`  — explicit env override (highest)
    2. `${SLOT_MATH_HOME:-.}/agents`
    3. `<repo_root>/agents` (in-repo default, the agent specifications
       live there as Markdown twins of any external registry)

A caller can mount an alternate agent registry (e.g. a corporate
shared fleet) by exporting `SLOT_MATH_AGENTS_ROOT`. If the resolved
path lacks the expected per-agent sub-tree (`manifest.yaml`,
`examples/`, `jurisdictions/`, `eval/`, `corpus/`), each tool degrades
gracefully — empty corpus, no eval, no manifest — so a stock checkout
still passes its smoke tests.
"""
from __future__ import annotations

import os
from pathlib import Path


def agents_root() -> Path:
    """Resolve the agents-root directory. Always returns a Path; existence
    is the caller's responsibility (each tool degrades to empty results
    when the resolved path lacks the expected per-agent sub-tree)."""
    env = os.environ.get("SLOT_MATH_AGENTS_ROOT")
    if env:
        return Path(env).expanduser()
    home = os.environ.get("SLOT_MATH_HOME")
    if home:
        return Path(home).expanduser() / "agents"
    # In-repo default: `<repo_root>/agents`. We resolve relative to this
    # file so the helper works whether the repo is invoked from anywhere.
    return Path(__file__).resolve().parent.parent / "agents"


def antibody_db_path() -> Path:
    """Resolve the antibody SQLite DB. Order:

        1. `$SLOT_MATH_ANTIBODY_DB`
        2. `${SLOT_MATH_HOME:-.}/data/antibodies.db`
    """
    env = os.environ.get("SLOT_MATH_ANTIBODY_DB")
    if env:
        return Path(env).expanduser()
    home = Path(os.environ.get("SLOT_MATH_HOME") or ".")
    return home / "data" / "antibodies.db"
