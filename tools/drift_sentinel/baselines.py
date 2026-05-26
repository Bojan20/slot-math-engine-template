"""Baseline store for Drift Sentinel.

A baseline is a flat dict:
    {
      "<rel_path>": {
        "fingerprint": "<hex>",
        "rtp_estimate": <float | null>,
        "seen_at_utc": "<iso8601>",
      },
      ...
    }

Persisted as JSON (default `.drift-baselines.json` in the games root).
Loader/saver tolerate missing files and malformed entries.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_NAME = ".drift-baselines.json"


@dataclass
class BaselineEntry:
    fingerprint: str
    rtp_estimate: float | None
    seen_at_utc: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "fingerprint": self.fingerprint,
            "rtp_estimate": self.rtp_estimate,
            "seen_at_utc": self.seen_at_utc,
        }


@dataclass
class BaselineStore:
    """In-memory keyed store of `<rel_path> → BaselineEntry`."""

    entries: dict[str, BaselineEntry] = field(default_factory=dict)

    def get(self, rel_path: str) -> BaselineEntry | None:
        return self.entries.get(rel_path)

    def upsert(self, rel_path: str, *, fingerprint: str,
               rtp_estimate: float | None) -> None:
        self.entries[rel_path] = BaselineEntry(
            fingerprint=fingerprint,
            rtp_estimate=rtp_estimate,
            seen_at_utc=datetime.now(timezone.utc).isoformat(),
        )

    def known_keys(self) -> set[str]:
        return set(self.entries.keys())

    def to_dict(self) -> dict[str, Any]:
        return {k: v.to_dict() for k, v in self.entries.items()}


def load_baselines(path: Path) -> BaselineStore:
    """Read baselines from `path`. Missing or malformed file → empty store."""
    if not path.exists():
        return BaselineStore()
    try:
        raw = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return BaselineStore()
    if not isinstance(raw, dict):
        return BaselineStore()
    store = BaselineStore()
    for k, v in raw.items():
        if not isinstance(v, dict):
            continue
        fp = v.get("fingerprint")
        if not isinstance(fp, str) or not fp:
            continue
        rtp = v.get("rtp_estimate")
        if rtp is not None and not isinstance(rtp, (int, float)):
            rtp = None
        seen = v.get("seen_at_utc") or ""
        store.entries[k] = BaselineEntry(
            fingerprint=fp,
            rtp_estimate=float(rtp) if rtp is not None else None,
            seen_at_utc=str(seen),
        )
    return store


def save_baselines(store: BaselineStore, path: Path) -> None:
    """Persist `store` to `path` atomically (write-then-rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(store.to_dict(), indent=2, sort_keys=True))
    tmp.replace(path)
