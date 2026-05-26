"""tools.agent_rag — RAG ingest / search for PHASE 8 agents (P8.6a).

Each P8.x agent has a `traces.jsonl` corpus (produced by
`tools.agent_corpus`). This package threads those traces into a vector
store so the dispatcher / Claude subagent can do retrieval-augmented
inference.

Two backends, automatically selected:

  • Qdrant   — preferred, configured per-agent in manifest.rag.
                Used when the Qdrant endpoint is reachable.
  • Mock     — local JSONL "store" with deterministic BM25-style
                lexical scoring. Used when Qdrant is offline. This
                makes the harness CI-safe and lets the dispatcher
                surface relevant few-shots without a running daemon.

CLI:

  python -m tools.agent_rag ingest <agent>
  python -m tools.agent_rag search <agent> "<query>"  [--k 5]
  python -m tools.agent_rag self-test
"""
from __future__ import annotations

from .cli import main  # noqa: F401

__all__ = ["main"]
