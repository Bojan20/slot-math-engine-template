"""SLOT-MATH Faza 4.5 — Asset pipeline (skin folder → web bundle).

Copies skin assets (reel symbols, line glyphs, sounds) from a designer-
supplied folder into the build's web/assets/ tree. If no skin folder is
provided, emits a default_asset_manifest.json with placeholder symbol
metadata so the runtime still renders (text glyphs).

Future (A6.11): full art asset marketplace + per-jurisdiction asset
swap (e.g. UK regulator-approved animation timing).
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


def default_asset_manifest(ir: dict[str, Any]) -> dict[str, Any]:
    """Generate placeholder asset manifest from IR symbols (text-glyph mode)."""
    symbols = ir.get("symbols", [])
    manifest = {
        "schema": "slot-math-asset-manifest/v1",
        "skin_id": "default-text-glyph",
        "symbols": [
            {
                "id": s.get("id"),
                "label": s.get("name", s.get("id", "?")),
                "glyph": s.get("id", "?")[:2].upper(),  # 2-char glyph
                "color": _color_for_kind(s.get("kind", "lp")),
                "asset_url": None,
            }
            for s in symbols
        ],
        "sounds": {
            "spin": None,
            "win_small": None,
            "win_big": None,
            "win_jackpot": None,
        },
        "animations": {
            "spin_duration_ms": 800,
            "reel_stop_stagger_ms": 120,
            "win_celebrate_ms": 1500,
        },
    }
    return manifest


def _color_for_kind(kind: str) -> str:
    return {
        "wild": "#ffd700",
        "scatter": "#ff4444",
        "bonus": "#9b59b6",
        "hp": "#00d4ff",
        "lp": "#888888",
        "multiplier": "#00ff88",
        "sticky": "#e67e22",
        "expanding": "#3498db",
        "mystery": "#666666",
        "transform": "#ff69b4",
        "chain_wild": "#f1c40f",
    }.get(kind, "#cccccc")


def copy_skin_assets(skin_dir: Path | None, out_dir: Path, ir: dict[str, Any]) -> dict[str, Any]:
    """Copy skin assets from skin_dir → out_dir/web/assets/. If skin_dir is
    None or doesn't exist, emit default text-glyph manifest only.

    Returns dict with copied file count + manifest content + total bytes.
    """
    assets_dir = out_dir / "web" / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    copied_files: list[str] = []
    total_bytes = 0

    if skin_dir and skin_dir.exists() and skin_dir.is_dir():
        for src in skin_dir.rglob("*"):
            if src.is_file():
                rel = src.relative_to(skin_dir)
                dst = assets_dir / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                copied_files.append(str(rel))
                total_bytes += src.stat().st_size

    # Always emit asset manifest (designer/auditor reads it)
    manifest = default_asset_manifest(ir)
    manifest_path = assets_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    copied_files.append("manifest.json")
    total_bytes += manifest_path.stat().st_size

    return {
        "assets_dir": str(assets_dir),
        "skin_source": str(skin_dir) if skin_dir else "default-text-glyph",
        "files_copied": copied_files,
        "file_count": len(copied_files),
        "total_bytes": total_bytes,
        "manifest_sha256": hashlib.sha256(
            (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode("utf-8")
        ).hexdigest(),
    }
