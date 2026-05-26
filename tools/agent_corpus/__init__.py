"""tools.agent_corpus — corpus normaliser for PHASE 8 agents (P8.5).

Each P8.x agent has a `corpus_root` pointing at a folder of raw artefacts
(JSON / Markdown / XLSX / HTML). This package provides one entry point
per agent that:

  1. Walks the source folders defined in the agent's manifest.yaml.
  2. Normalises every artefact into a unified JSONL line schema.
  3. Strips PII / NDA chunks (filters by manifest's nda_corpus flags).
  4. Emits `<corpus_root>/traces.jsonl` ready for either RAG ingest
     (Qdrant) or QLoRA training (P8.5 driver).

The driver itself is in `tools.agent_corpus.cli`. Importable functions:

    from tools.agent_corpus import load_manifest, build_corpus

Usage from CLI:

    python -m tools.agent_corpus refresh par-parser
    python -m tools.agent_corpus refresh math-debug
    python -m tools.agent_corpus refresh reg-oracle
    python -m tools.agent_corpus stats <agent>
    python -m tools.agent_corpus self-test
"""
from __future__ import annotations

from pathlib import Path
from .cli import (  # noqa: F401
    build_corpus,
    load_manifest,
    main,
)

__all__ = ["build_corpus", "load_manifest", "main"]
