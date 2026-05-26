"""IR schema migration chain.

Each migration is a callable `(ir: dict) → dict` that transforms a
v(N) IR into a v(N+1) IR. Migrations are linear (not branching) and
idempotent on already-current IRs.

Adding a new migration:
    1. Bump CURRENT_SCHEMA_VERSION
    2. Append a `_migrate_v(N)_to_v(N+1)` function below
    3. Register it in `_MIGRATIONS`

The chain runs strictly forward; downgrade is not supported (would
risk silent data loss).
"""
from __future__ import annotations

import copy
from typing import Any, Callable


CURRENT_SCHEMA_VERSION = 3


# ─── Migrations ────────────────────────────────────────────────────────────


def _migrate_v1_to_v2(ir: dict[str, Any]) -> dict[str, Any]:
    """v1 → v2: hoist legacy `bg_reel_sets`/`fg_reel_sets` to canonical
    `reels.{base,fs}` shape, preserve old keys for back-compat readers.

    No data loss; both shapes coexist. Engines that only know v2 read
    `reels.base`; legacy readers still see the original keys.
    """
    out = copy.deepcopy(ir)
    reels = out.setdefault("reels", {})
    if "bg_reel_sets" in out and "base" not in reels:
        reels["base"] = out["bg_reel_sets"]
    if "fg_reel_sets" in out and "fs" not in reels:
        reels["fs"] = out["fg_reel_sets"]
    out.setdefault("meta", {})["schema_version"] = 2
    return out


def _migrate_v2_to_v3(ir: dict[str, Any]) -> dict[str, Any]:
    """v2 → v3: split monolithic `evaluation` shape.

    - If `evaluation.paylines` exists as flat list, also expose
      `evaluation.lines` (alias) for downstream solvers that prefer
      `lines`.
    - Ensure `meta.target_rtp` exists (default 0.96) so the SMT
      synthesizer + jurisdiction linter never KeyError on legacy IRs.
    """
    out = copy.deepcopy(ir)
    ev = out.setdefault("evaluation", {})
    if "paylines" in ev and "lines" not in ev:
        ev["lines"] = ev["paylines"]
    if "lines" in ev and "paylines" not in ev:
        ev["paylines"] = ev["lines"]
    meta = out.setdefault("meta", {})
    if "target_rtp" not in meta:
        # 0.96 is the industry mid-band default (UKGC + MGA + NV all
        # accept it as a base assumption when missing).
        meta["target_rtp"] = 0.96
    meta["schema_version"] = 3
    return out


_MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {
    1: _migrate_v1_to_v2,
    2: _migrate_v2_to_v3,
}


# ─── Public API ────────────────────────────────────────────────────────────


def detect_version(ir: dict[str, Any]) -> int:
    """Return the IR's declared schema version, defaulting to v1 when
    `meta.schema_version` is missing (legacy untouched IRs)."""
    meta = ir.get("meta") or {}
    v = meta.get("schema_version")
    if isinstance(v, int) and v >= 1:
        return v
    return 1


def list_migrations() -> list[tuple[int, int]]:
    """Return all available migration steps as `(from, to)` tuples."""
    return [(v, v + 1) for v in sorted(_MIGRATIONS.keys())]


def migrate(ir: dict[str, Any], target_version: int) -> dict[str, Any]:
    """Forward-migrate an IR to `target_version`.

    Raises `ValueError` if `target_version` < current version
    (downgrade unsupported).
    """
    cur = detect_version(ir)
    if target_version < cur:
        raise ValueError(
            f"downgrade unsupported: {cur} → {target_version}",
        )
    out = ir
    while cur < target_version:
        step = _MIGRATIONS.get(cur)
        if step is None:
            raise ValueError(
                f"no migration registered from v{cur} → v{cur + 1}",
            )
        out = step(out)
        cur += 1
    return out


def migrate_to_latest(ir: dict[str, Any]) -> dict[str, Any]:
    """Convenience wrapper: migrate to `CURRENT_SCHEMA_VERSION`."""
    return migrate(ir, CURRENT_SCHEMA_VERSION)
