"""PAR adapters — vendor-specific importers."""
from __future__ import annotations
from pathlib import Path
from typing import Callable, Dict

import json

from tools.par_normalize.detect import FormatKind, detect_format

# Registry: format -> adapter function(path) -> canonical dict
_ADAPTERS: Dict[FormatKind, Callable[[Path], dict]] = {}


def register(kind: FormatKind, fn: Callable[[Path], dict]) -> None:
    _ADAPTERS[kind] = fn


def _json_adapter(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _yaml_adapter(path: Path) -> dict:
    import yaml
    return yaml.safe_load(path.read_text(encoding="utf-8"))


# Built-in text adapters
register("json", _json_adapter)
register("yaml", _yaml_adapter)


def adapt(path: Path | str) -> dict:
    """Auto-detect format and run registered adapter.

    Returns canonical dict ready for schema validation / Merkle pinning.
    """
    p = Path(path)
    kind = detect_format(p)
    if kind == "unknown":
        raise ValueError(f"Cannot detect format for {p}")
    if kind not in _ADAPTERS:
        raise NotImplementedError(f"No adapter registered for format '{kind}'")
    canonical = _ADAPTERS[kind](p)
    # Inject provenance
    canonical.setdefault("source", {})
    canonical["source"]["format"] = kind
    canonical["source"]["filename"] = p.name
    return canonical
