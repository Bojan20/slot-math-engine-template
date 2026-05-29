"""W6.x — GDD natural-language ingestion package.

Public API:
    from tools.gdd_nl_ingest.ingest import ingest_prompt
"""

from .ingest import ingest_prompt, IngestResult, IngestError, prompt_to_gdd

__all__ = ["ingest_prompt", "IngestResult", "IngestError", "prompt_to_gdd"]
