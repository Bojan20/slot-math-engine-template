"""SLOT-MATH A6.11 — Art asset import + skin marketplace.

Boki request: import art assets from external sources, per-jurisdiction
skin swap, marketplace listing/installation. Math stays frozen — only
visual/audio surface changes.

Pipeline:
  1. designer drops skin folder (PNG/SVG/MP3/etc) into ~/skin-inbox/
  2. fswatch detects → registers skin in marketplace.json
  3. studio shows "Apply skin X to <game>/<variant>" button
  4. slot-math deploy --skin <skin_id> regenerates web/assets/ only
  5. attestation chain unchanged: math + PAR Merkle unaffected

Skin metadata format:
  reports/skin-marketplace/<skin_id>/
    manifest.json    (name, author, license, jurisdictions_ok, version)
    preview.png      (thumbnail)
    assets/          (actual PNG/SVG/audio files)
"""
from tools.par_art_marketplace.marketplace import (
    SkinManifest,
    install_skin_from_folder,
    list_marketplace,
    load_marketplace,
    validate_skin_manifest,
)

__all__ = [
    "SkinManifest",
    "install_skin_from_folder",
    "list_marketplace",
    "load_marketplace",
    "validate_skin_manifest",
]
