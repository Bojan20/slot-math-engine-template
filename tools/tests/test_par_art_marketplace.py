"""SLOT-MATH A6.11 — Art marketplace test gate."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.par_art_marketplace import (
    install_skin_from_folder,
    list_marketplace,
    load_marketplace,
    validate_skin_manifest,
)


def _make_skin_folder(root: Path, skin_id: str = "neon-fortune") -> Path:
    skin = root / "skin-src"
    skin.mkdir(parents=True)
    (skin / "manifest.json").write_text(json.dumps({
        "skin_id": skin_id,
        "name": "Neon Fortune",
        "author": "vanvinkl-studio",
        "license": "MIT",
        "version": "1.0.0",
        "jurisdictions_ok": ["GENERIC", "UKGC"],
        "preview": "preview.png",
    }))
    (skin / "preview.png").write_bytes(b"\x89PNG\r\n\x1a\nFAKE")
    assets = skin / "assets"
    assets.mkdir()
    (assets / "wild.png").write_bytes(b"WILD")
    (assets / "spin.mp3").write_bytes(b"AUDIO")
    return skin


def test_validate_skin_manifest_clean():
    issues = validate_skin_manifest({
        "skin_id": "abc123", "name": "n", "author": "a", "license": "MIT", "version": "1.0.0",
    })
    assert issues == []


def test_validate_skin_manifest_missing_keys():
    issues = validate_skin_manifest({"skin_id": "x"})
    assert any("missing required keys" in i for i in issues)


def test_validate_skin_manifest_bad_id():
    issues = validate_skin_manifest({
        "skin_id": "with spaces!", "name": "n", "author": "a", "license": "MIT", "version": "1.0",
    })
    assert any("alphanumeric" in i for i in issues)


def test_install_skin_copies_files(tmp_path: Path):
    src = _make_skin_folder(tmp_path)
    marketplace = tmp_path / "marketplace"
    manifest = install_skin_from_folder(src, marketplace)
    assert manifest.skin_id == "neon-fortune"
    assert (marketplace / "neon-fortune" / "manifest.json").exists()
    assert (marketplace / "neon-fortune" / "assets" / "wild.png").exists()
    assert manifest.asset_count == 2  # wild.png + spin.mp3


def test_install_skin_rejects_missing_manifest(tmp_path: Path):
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(FileNotFoundError):
        install_skin_from_folder(empty, tmp_path / "marketplace")


def test_install_skin_rejects_invalid_manifest(tmp_path: Path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "manifest.json").write_text(json.dumps({"skin_id": "x"}))  # missing fields
    with pytest.raises(ValueError):
        install_skin_from_folder(src, tmp_path / "marketplace")


def test_install_overwrites_existing(tmp_path: Path):
    src = _make_skin_folder(tmp_path)
    marketplace = tmp_path / "marketplace"
    install_skin_from_folder(src, marketplace)
    # Re-install (overwrite)
    install_skin_from_folder(src, marketplace)
    skins = load_marketplace(marketplace)
    assert len(skins) == 1
    assert skins[0].skin_id == "neon-fortune"


def test_load_marketplace_empty(tmp_path: Path):
    skins = load_marketplace(tmp_path / "empty")
    assert skins == []


def test_load_marketplace_skips_invalid_manifest(tmp_path: Path):
    marketplace = tmp_path / "marketplace"
    marketplace.mkdir()
    bad = marketplace / "broken"
    bad.mkdir()
    (bad / "manifest.json").write_text("not json")
    skins = load_marketplace(marketplace)
    assert skins == []


def test_list_marketplace_empty_message(tmp_path: Path):
    out = list_marketplace(tmp_path / "empty")
    assert "Empty marketplace" in out


def test_list_marketplace_renders_markdown_table(tmp_path: Path):
    src = _make_skin_folder(tmp_path)
    marketplace = tmp_path / "marketplace"
    install_skin_from_folder(src, marketplace)
    out = list_marketplace(marketplace)
    assert "neon-fortune" in out
    assert "Neon Fortune" in out
    assert "vanvinkl-studio" in out
    assert "MIT" in out
