"""SLOT-MATH A6.11 — Skin marketplace registry + installer."""
from __future__ import annotations

import json
import shutil
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class SkinManifest:
    skin_id: str
    name: str
    author: str
    license: str
    version: str = "1.0.0"
    jurisdictions_ok: list[str] = field(default_factory=lambda: ["GENERIC"])
    preview_path: str = ""
    asset_count: int = 0


REQUIRED_KEYS = {"skin_id", "name", "author", "license", "version"}


def validate_skin_manifest(manifest: dict) -> list[str]:
    """Return list of validation errors (empty = pass)."""
    issues: list[str] = []
    missing = REQUIRED_KEYS - set(manifest.keys())
    if missing:
        issues.append(f"missing required keys: {sorted(missing)}")
    if "skin_id" in manifest and not manifest["skin_id"].replace("-", "").replace("_", "").isalnum():
        issues.append(f"skin_id must be alphanumeric+dashes, got {manifest['skin_id']!r}")
    return issues


def install_skin_from_folder(
    src_dir: Path,
    marketplace_dir: Path,
) -> SkinManifest:
    """Install skin from a source folder into marketplace registry.

    Source folder must contain manifest.json + at least one asset.
    """
    manifest_path = src_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json missing in {src_dir}")
    manifest_raw = json.loads(manifest_path.read_text())
    issues = validate_skin_manifest(manifest_raw)
    if issues:
        raise ValueError(
            f"skin manifest invalid in {src_dir}:\n  - " + "\n  - ".join(issues)
        )

    skin_id = manifest_raw["skin_id"]
    dest = marketplace_dir / skin_id
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src_dir, dest)

    # Count assets (everything in assets/ recursively)
    assets_dir = dest / "assets"
    asset_count = sum(1 for _ in assets_dir.rglob("*") if _.is_file()) if assets_dir.exists() else 0

    manifest = SkinManifest(
        skin_id=skin_id,
        name=manifest_raw["name"],
        author=manifest_raw["author"],
        license=manifest_raw["license"],
        version=manifest_raw.get("version", "1.0.0"),
        jurisdictions_ok=manifest_raw.get("jurisdictions_ok", ["GENERIC"]),
        preview_path=manifest_raw.get("preview", ""),
        asset_count=asset_count,
    )

    # Re-emit normalized manifest.json with computed asset_count
    (dest / "manifest.json").write_text(
        json.dumps(asdict(manifest), sort_keys=True, indent=2) + "\n"
    )
    return manifest


def load_marketplace(marketplace_dir: Path) -> list[SkinManifest]:
    """Return list of all installed skin manifests."""
    if not marketplace_dir.exists():
        return []
    out: list[SkinManifest] = []
    for skin_dir in sorted(marketplace_dir.iterdir()):
        manifest_path = skin_dir / "manifest.json"
        if not manifest_path.exists():
            continue
        try:
            data = json.loads(manifest_path.read_text())
            out.append(SkinManifest(**{k: v for k, v in data.items() if k in {
                "skin_id", "name", "author", "license", "version",
                "jurisdictions_ok", "preview_path", "asset_count",
            }}))
        except (json.JSONDecodeError, TypeError):
            continue
    return out


def list_marketplace(marketplace_dir: Path) -> str:
    """Render marketplace as human-readable table (Markdown)."""
    skins = load_marketplace(marketplace_dir)
    if not skins:
        return "_Empty marketplace — install skin via `slot-math skin install <folder>`_"
    lines = ["| Skin ID | Name | Author | License | Assets | Jurisdictions |", "|---|---|---|---|---|---|"]
    for s in skins:
        lines.append(
            f"| `{s.skin_id}` | {s.name} | {s.author} | {s.license} "
            f"| {s.asset_count} | {', '.join(s.jurisdictions_ok)} |"
        )
    return "\n".join(lines)
