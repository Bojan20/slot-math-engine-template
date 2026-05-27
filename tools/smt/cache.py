"""W5.5 — Z3 solver result cache.

Z3 synthesis is deterministic for a given (IR shape, mode, target).
Re-solving identical specs in a long designer iteration loop wastes
seconds. This module wraps the existing `synth_*` kernels with a
content-addressed JSON cache so repeat calls return in microseconds.

Key derivation
==============
The cache key is the SHA-256 of canonical JSON of:
    {
        "ir_skeleton": <IR with `reels.base` zeroed out — only shape>,
        "mode": "C-1" | "C-3" | "C-4",
        "target_rtp": float,
        "target_hit_freq": Optional[float],
        "volatility_class": Optional[str],
        "reel_length": float,
        "tolerance": float,
    }

We strip `reels.base` because the synthesizer overwrites it — keeping
the seeded values in the key would defeat caching for re-runs against
slightly different seeds that the solver maps to the same answer.

Cache layout
============
Default path: `~/.cache/cortex/slot-math-engine/z3_synth/<key>.json`
override via `CORTEX_Z3_CACHE_DIR` env var.

Each entry stores the FULL solved IR + a `_cache_meta` block with:
    {
        "cached_at": ISO-8601 UTC,
        "spec_hash": "<sha256>",
        "z3_version": "x.y.z",
        "hit_count": <int incremented on retrieval>
    }
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import z3


def _default_cache_dir() -> Path:
    env = os.environ.get("CORTEX_Z3_CACHE_DIR")
    if env:
        return Path(env)
    home = Path(os.environ.get("HOME") or os.path.expanduser("~"))
    return home / ".cache" / "cortex" / "slot-math-engine" / "z3_synth"


def _canonical_ir_shape(ir: dict) -> dict:
    """Strip `reels.base` numeric values (keep keys only) so the cache
    key keys to shape-equivalence, not value-equivalence."""
    shape = {
        "schema_version": ir.get("schema_version"),
        "topology": ir.get("topology"),
        "symbols": [
            {"id": s["id"], "kind": s["kind"]}
            for s in (ir.get("symbols") or [])
        ],
        "evaluation": ir.get("evaluation"),
        "paytable": ir.get("paytable"),  # paytable values are inputs
        "features": [{"kind": f.get("kind")} for f in (ir.get("features") or [])],
        "limits": {k: ir.get("limits", {}).get(k) for k in ("target_rtp", "rtp_tolerance", "max_win_x", "target_volatility")},
    }
    return shape


def cache_key(
    ir: dict,
    *,
    mode: str,
    target_rtp: float,
    target_hit_freq: Optional[float] = None,
    volatility_class: Optional[str] = None,
    reel_length: float = 60.0,
    tolerance: float = 1e-4,
) -> str:
    """SHA-256 hex of canonical-JSON of all solver inputs."""
    payload = {
        "ir_skeleton": _canonical_ir_shape(ir),
        "mode": mode,
        "target_rtp": float(target_rtp),
        "target_hit_freq": float(target_hit_freq) if target_hit_freq is not None else None,
        "volatility_class": volatility_class,
        "reel_length": float(reel_length),
        "tolerance": float(tolerance),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def load_cached(key: str, cache_dir: Optional[Path] = None) -> Optional[dict]:
    d = cache_dir or _default_cache_dir()
    p = d / f"{key}.json"
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    # Bump hit_count + persist
    meta = data.setdefault("_cache_meta", {})
    meta["hit_count"] = int(meta.get("hit_count", 0)) + 1
    meta["last_hit_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        p.write_text(json.dumps(data, indent=2, sort_keys=False), encoding="utf-8")
    except Exception:
        pass
    return data


def store_cached(key: str, ir: dict, cache_dir: Optional[Path] = None) -> Path:
    d = cache_dir or _default_cache_dir()
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{key}.json"
    # Inject metadata
    out = dict(ir)
    out["_cache_meta"] = {
        "cached_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "spec_hash": key,
        "z3_version": z3.get_version_string(),
        "hit_count": 0,
    }
    p.write_text(json.dumps(out, indent=2, sort_keys=False), encoding="utf-8")
    return p


def cached_synth(
    func: Callable[..., dict],
    ir: dict,
    *,
    mode: str,
    target_rtp: float,
    target_hit_freq: Optional[float] = None,
    volatility_class: Optional[str] = None,
    reel_length: float = 60.0,
    tolerance: float = 1e-4,
    cache_dir: Optional[Path] = None,
    bypass: bool = False,
    **kwargs: Any,
) -> tuple[dict, dict]:
    """Wrap a `synth_*` function with content-addressed JSON cache.

    Returns (solved_ir, info) where `info` carries:
        cache_hit: bool
        cache_key: str
        cache_path: str
        elapsed_ms: float
    """
    key = cache_key(
        ir, mode=mode, target_rtp=target_rtp,
        target_hit_freq=target_hit_freq,
        volatility_class=volatility_class,
        reel_length=reel_length, tolerance=tolerance,
    )
    d = cache_dir or _default_cache_dir()
    if not bypass:
        hit = load_cached(key, cache_dir=d)
        if hit is not None:
            return hit, {
                "cache_hit": True,
                "cache_key": key,
                "cache_path": str(d / f"{key}.json"),
                "elapsed_ms": 0.0,
            }

    t0 = time.perf_counter()
    # Build kwargs the underlying func expects
    call_kwargs: dict[str, Any] = {
        "reel_length": reel_length,
        "tolerance": tolerance,
        **kwargs,
    }
    if mode == "C-1":
        solved = func(ir, target_rtp, **call_kwargs)
    elif mode == "C-3":
        solved = func(ir, target_rtp, target_hit_freq, **call_kwargs)
    elif mode == "C-4":
        solved = func(ir, target_rtp, volatility_class, **call_kwargs)
    else:
        raise ValueError(f"unknown cached_synth mode {mode!r}")
    elapsed = (time.perf_counter() - t0) * 1000.0

    store_cached(key, solved, cache_dir=d)
    return solved, {
        "cache_hit": False,
        "cache_key": key,
        "cache_path": str(d / f"{key}.json"),
        "elapsed_ms": elapsed,
    }
