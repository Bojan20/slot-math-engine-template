"""IR reels → per-reel-set summary JSON.

The full strip data is large (tens of thousands of symbol stops); the
summary keeps only the audit-grade aggregates a regulator needs:

  • strip length per reel
  • symbol → count map per reel (or per set, for ways/megaways)
  • weight total per reel
  • sha256 fingerprint of the canonical strip JSON, so the auditor can
    hash the full strip later and confirm bit-equality

Both `base` and `fs` (free-spins) banks are summarised when present.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from typing import Any


def _strip_fingerprint(strip: list[dict[str, Any]]) -> str:
    blob = json.dumps(strip, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(blob).hexdigest()


def _reel_summary(reel: list[dict[str, Any]]) -> dict[str, Any]:
    """One reel = list of {symbol, weight} stops."""
    counts: Counter[str] = Counter()
    weight_total = 0
    for stop in reel:
        sym = str(stop.get("symbol", ""))
        w = stop.get("weight", 1)
        try:
            w = int(w)
        except (TypeError, ValueError):
            w = 1
        counts[sym] += 1
        weight_total += w
    return {
        "stops": len(reel),
        "symbol_counts": dict(sorted(counts.items())),
        "weight_total": weight_total,
        "sha256_strip": _strip_fingerprint(reel),
    }


def _set_summary(rs: dict[str, Any]) -> dict[str, Any]:
    reels = rs.get("reels", [])
    return {
        "set": rs.get("set"),
        "label": rs.get("label", ""),
        "reels": [_reel_summary(r) for r in reels],
    }


def reels_summary_for_ir(ir: dict[str, Any]) -> dict[str, Any]:
    reels = ir.get("reels", {})
    out: dict[str, Any] = {
        "schema": "slotmath.reels-summary/v1",
        "swid": ir.get("meta", {}).get("swid"),
        "banks": {},
        "weights": {},
    }
    for bank in ("base", "fs"):
        sets = reels.get(bank)
        if not sets:
            continue
        out["banks"][bank] = [_set_summary(s) for s in sets]
    for wkey in ("base_weights", "fs_weights"):
        if wkey in reels:
            out["weights"][wkey] = reels[wkey]
    return out
