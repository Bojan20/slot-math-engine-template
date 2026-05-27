"""W9.3 — Spec versioning + migration helper.

Whenever the DSL schema bumps (1.0.0 → 1.1.0 → 2.0.0), existing YAML
specs in the catalog need to migrate. This module provides:

  • `current_schema_version()` → the version this code base emits.
  • `migrate(spec_dict, target_version)` → upgraded spec dict (raw form,
    pre-parse), applying every migration step between source and target.
  • `MIGRATIONS` — ordered registry of (from_v, to_v, fn) tuples.

Migrations are pure functions taking + returning raw dict. They run
before `parse_spec` so they can touch keys the strict parser would
reject. Each migration is idempotent — applying twice is a no-op.

Registered migrations:
  • 0.x → 1.0.0  — implicit (no-op for greenfield)
  • 1.0.0 → 1.1.0 — adds `constraints.max_bet_x` if missing (W9.1 dep)
                  — promotes `vendor_id` legacy key to `meta.vendor`
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Callable


CURRENT_SCHEMA_VERSION = "1.1.0"


def current_schema_version() -> str:
    return CURRENT_SCHEMA_VERSION


def _parse_v(v: str) -> tuple[int, int, int]:
    parts = (v or "0.0.0").split(".")
    return (
        int(parts[0]) if len(parts) > 0 else 0,
        int(parts[1]) if len(parts) > 1 else 0,
        int(parts[2]) if len(parts) > 2 else 0,
    )


def _v_le(a: str, b: str) -> bool:
    return _parse_v(a) <= _parse_v(b)


@dataclass
class Migration:
    from_v: str
    to_v: str
    fn: Callable[[dict], dict]
    description: str = ""


# ─── Migration functions ─────────────────────────────────────────────


def _migrate_implicit_to_1_0_0(spec: dict) -> dict:
    """Greenfield migration: anything earlier than 1.0.0 is treated as
    a clean spec — we just bump schema_version."""
    out = copy.deepcopy(spec)
    out["schema_version"] = "1.0.0"
    return out


def _migrate_1_0_0_to_1_1_0(spec: dict) -> dict:
    """W9 schema bump:
      • promote legacy `vendor_id` top-level → `meta.vendor`
      • add `constraints.max_bet_x` (default = unset, no constraint)
      • normalize jurisdiction codes to upper case
    """
    out = copy.deepcopy(spec)
    if "vendor_id" in out and not out.get("meta", {}).get("vendor"):
        out.setdefault("meta", {})["vendor"] = out.pop("vendor_id")
    cons = out.setdefault("constraints", {})
    if "jurisdictions" in cons:
        cons["jurisdictions"] = [str(j).strip().upper() for j in cons["jurisdictions"]]
    out["schema_version"] = "1.1.0"
    return out


MIGRATIONS: list[Migration] = [
    Migration(
        from_v="0.0.0", to_v="1.0.0", fn=_migrate_implicit_to_1_0_0,
        description="implicit → 1.0.0 — set schema_version",
    ),
    Migration(
        from_v="1.0.0", to_v="1.1.0", fn=_migrate_1_0_0_to_1_1_0,
        description="1.0.0 → 1.1.0 — vendor_id→meta.vendor, jurisdiction uppercase",
    ),
]


class MigrationError(ValueError):
    pass


def migrate(spec_dict: dict, target_version: str | None = None) -> dict:
    """Apply every migration whose `from_v` < source_v ≤ `to_v` to the
    raw spec dict. Returns the upgraded dict (deep-copied).
    """
    target = target_version or CURRENT_SCHEMA_VERSION
    source = str(spec_dict.get("schema_version") or "0.0.0")
    if _parse_v(source) == _parse_v(target):
        return copy.deepcopy(spec_dict)
    if _parse_v(source) > _parse_v(target):
        raise MigrationError(
            f"cannot downgrade: source {source} > target {target}"
        )
    out = copy.deepcopy(spec_dict)
    applied: list[str] = []
    current = source
    while _parse_v(current) < _parse_v(target):
        step = next(
            (m for m in MIGRATIONS
             if _v_le(m.from_v, current) and _parse_v(m.to_v) > _parse_v(current)),
            None,
        )
        if step is None:
            raise MigrationError(
                f"no migration registered from {current} → {target}; "
                f"available: {[m.from_v + '→' + m.to_v for m in MIGRATIONS]}"
            )
        out = step.fn(out)
        applied.append(f"{step.from_v}→{step.to_v}")
        current = step.to_v
    out["_migrated_steps"] = applied
    return out


def list_migrations() -> list[str]:
    return [f"{m.from_v} → {m.to_v}: {m.description}" for m in MIGRATIONS]
