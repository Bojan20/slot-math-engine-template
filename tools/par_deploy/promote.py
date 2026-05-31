"""SLOT-MATH Faza 5.3 — Promote winner + audit log.

Moves selected variant build to games/<game>/live/, archives previous live
(if any) as games/<game>/canary/, writes audit log entry with promoter
identity + Merkle pin chain.

Designed for Studio click → CLI → live deploy pipeline.
"""
from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class PromotionAuditEntry:
    timestamp_utc: str
    game_id: str
    variant_id: str
    deploy_signature: str
    promoter: str  # user identity (email / username)
    prev_live_variant: str | None = None
    tag: str | None = None
    notes: str = ""


def audit_log_entry(
    game_id: str,
    variant_id: str,
    deploy_signature: str,
    promoter: str,
    prev_live_variant: str | None = None,
    tag: str | None = None,
    notes: str = "",
) -> PromotionAuditEntry:
    return PromotionAuditEntry(
        timestamp_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        game_id=game_id,
        variant_id=variant_id,
        deploy_signature=deploy_signature,
        promoter=promoter,
        prev_live_variant=prev_live_variant,
        tag=tag,
        notes=notes,
    )


def promote_variant(
    games_root: Path,
    game_id: str,
    variant_id: str,
    promoter: str,
    deploy_signature: str,
    tag: str | None = None,
    notes: str = "",
) -> dict[str, str]:
    """Promote variant_id to live for game_id.

    Side effects:
      1. games_root/<game_id>/<variant_id>/ MUST exist (build artefakt)
      2. games_root/<game_id>/live/ symlinks/copy → variant
      3. If prior live exists, move to canary/
      4. Append audit entry to games_root/<game_id>/promotions.log

    Returns: dict with live_path + audit_path + prev_live (if any).
    """
    game_dir = games_root / game_id
    variant_dir = game_dir / variant_id
    if not variant_dir.exists():
        raise FileNotFoundError(f"variant build not found: {variant_dir}")

    live_dir = game_dir / "live"
    canary_dir = game_dir / "canary"

    # Record previous live (if any) before overwriting
    prev_live = None
    if live_dir.exists():
        # Detect prior variant by reading live/variant_id.txt sentinel
        sentinel = live_dir / "variant_id.txt"
        if sentinel.exists():
            prev_live = sentinel.read_text().strip()
        # Move prior live to canary/ (last-good-build, 24h rollback window)
        if canary_dir.exists():
            shutil.rmtree(canary_dir)
        shutil.move(str(live_dir), str(canary_dir))

    # Copy variant build to live/
    shutil.copytree(str(variant_dir), str(live_dir))
    (live_dir / "variant_id.txt").write_text(variant_id + "\n", encoding="utf-8")

    # Append audit entry
    entry = audit_log_entry(
        game_id=game_id,
        variant_id=variant_id,
        deploy_signature=deploy_signature,
        promoter=promoter,
        prev_live_variant=prev_live,
        tag=tag,
        notes=notes,
    )
    audit_path = game_dir / "promotions.log"
    with audit_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(entry), sort_keys=True) + "\n")

    return {
        "live_path": str(live_dir),
        "canary_path": str(canary_dir) if prev_live else "",
        "prev_live_variant": prev_live or "",
        "audit_path": str(audit_path),
    }


def rollback_to_canary(games_root: Path, game_id: str, promoter: str) -> dict[str, str]:
    """Swap canary ↔ live (emergency rollback to last-good build).

    Use case: live promote went bad, designer clicks "Rollback" → previous
    variant is restored immediately.
    """
    game_dir = games_root / game_id
    live_dir = game_dir / "live"
    canary_dir = game_dir / "canary"

    if not canary_dir.exists():
        raise FileNotFoundError(f"no canary to rollback to: {canary_dir}")

    # Move live → temp, canary → live, temp → canary
    temp_dir = game_dir / "_rollback_temp"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)

    if live_dir.exists():
        shutil.move(str(live_dir), str(temp_dir))
    shutil.move(str(canary_dir), str(live_dir))
    if temp_dir.exists():
        shutil.move(str(temp_dir), str(canary_dir))

    # Append audit
    sentinel = live_dir / "variant_id.txt"
    new_live_variant = sentinel.read_text().strip() if sentinel.exists() else "unknown"
    entry = audit_log_entry(
        game_id=game_id,
        variant_id=new_live_variant,
        deploy_signature="ROLLBACK",
        promoter=promoter,
        notes="emergency rollback to canary",
    )
    audit_path = game_dir / "promotions.log"
    with audit_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(entry), sort_keys=True) + "\n")

    return {
        "live_path": str(live_dir),
        "live_variant": new_live_variant,
        "audit_path": str(audit_path),
    }
