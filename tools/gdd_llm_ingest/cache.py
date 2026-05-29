"""W6.2 — Tiny disk LRU keyed on sha256(prompt + model + schema_version).

Layout::

    reports/gdd-llm-cache/<sha256>.json

Each cache file stores the raw LLM tool_use payload PLUS metadata so
debugging is trivial::

    {
      "schema": "gdd-llm-cache/v1",
      "cache_key": "<sha256>",
      "model": "claude-opus-4-5-20250929",
      "schema_version": "w6.2-llm-gdd-v1",
      "prompt": "<original prompt>",
      "payload": { ... GDD tool_use JSON ... },
      "usage": { ... token counts ... }
    }

The cache dir lives under ``reports/`` so it doesn't pollute source
trees + is git-ignored by the W6.2 patch.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[2]
CACHE_DIR = REPO / "reports" / "gdd-llm-cache"


def cache_key(prompt: str, model: str, schema_version: str) -> str:
    """sha256(prompt|model|schema_version) — hex digest, 64 chars."""
    blob = f"{prompt}\x1f{model}\x1f{schema_version}".encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def cache_path(key: str, *, cache_dir: Path | None = None) -> Path:
    base = Path(cache_dir) if cache_dir else CACHE_DIR
    return base / f"{key}.json"


def load_cached(
    key: str,
    *,
    cache_dir: Path | None = None,
) -> dict[str, Any] | None:
    """Return the cached entry dict or ``None`` if the file does not
    exist OR is corrupt.

    Corrupt files do NOT raise — they're treated as a cache miss so a
    fresh API call can repair the cache transparently.
    """
    path = cache_path(key, cache_dir=cache_dir)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_cached(
    key: str,
    entry: dict[str, Any],
    *,
    cache_dir: Path | None = None,
) -> Path:
    """Write the entry atomically (write to a tmp file, then rename).

    Returns the final path.
    """
    base = Path(cache_dir) if cache_dir else CACHE_DIR
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{key}.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(entry, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    tmp.replace(path)
    return path
