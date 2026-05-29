"""W4.15 — per-SWID cert bundle acceptance tests.

What we cover here:

  1. For every one of the 12 SWIDs, the CLI runs in-process and emits
     a ZIP whose:
       • MANIFEST.json sha256 commitments match each archived blob,
       • SIGNATURE.sig verifies against the bundle's public key,
       • every required path is present and non-empty.
     A pass/fail breakdown of the four W4.15 acceptance checks is also
     reported (we don't require pass — the spec says "if a SWID fails
     record it, don't pad").

  2. Reproducibility: running the CLI twice from a fresh output dir
     produces ZIPs with identical sha256.

  3. Tampering: flipping a byte inside MANIFEST.json makes signature
     verification fail.

These tests use a single class-scoped temp dir so we only pay the MC
runtime once across the whole suite (cached subsequent calls are
near-instant).
"""
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

import pytest

from tools.cert_bundle_swid import sign
from tools.cert_bundle_swid.manifest import sha256_bytes
from tools.cert_bundle_swid.runner import (
    DEFAULT_EPOCH,
    GAME_SWIDS,
    SWID_TO_GAME,
    build_bundle_for_swid,
)
from tools.cert_bundle_swid.zip_bundle import unpack_bundle


# A small MC budget is plenty for the integrity checks — the verdict
# numbers don't have to be production-grade for the acceptance shape
# tests, and the cached MC layer guarantees byte-identity on rerun
# regardless of spin count.
_TEST_MC_SPINS = 50_000


@pytest.fixture(scope="module")
def bundle_dir() -> Path:
    """Per-module scratch dir — wiped after the test session."""
    td = tempfile.mkdtemp(prefix="w415_cb_")
    yield Path(td)
    shutil.rmtree(td, ignore_errors=True)


def _flatten_swids() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for game, swids in GAME_SWIDS.items():
        for s in swids:
            out.append((game, s))
    return out


_ALL_SWIDS = _flatten_swids()
assert len(_ALL_SWIDS) == 12, "W4.15 ships exactly 12 SWIDs"


_REQUIRED_PATHS = (
    "README.md",
    "MANIFEST.json",
    "SIGNATURE.sig",
    "meta/version.json",
    "meta/changelog.md",
)


def _required_swid_paths(game: str, swid: str) -> list[str]:
    return [
        f"ir/{game}.{swid}.slot-sim.ir.json",
        f"verdict/{game}.{swid}.closed_form.json",
        f"verdict/{game}.{swid}.mc_verdict.json",
        f"verdict/{game}.{swid}.acceptance.json",
        f"paytable/{game}.{swid}.paytable.csv",
        f"reels/{game}.{swid}.reels_summary.json",
        f"cert/{game}.{swid}.cert.xml",
    ]


@pytest.mark.parametrize("game,swid", _ALL_SWIDS)
def test_bundle_integrity_per_swid(bundle_dir: Path, game: str, swid: str) -> None:
    res = build_bundle_for_swid(
        game, swid,
        out_dir=bundle_dir,
        mc_spins=_TEST_MC_SPINS,
        mc_cache_dir=bundle_dir / "mc-cache",
    )
    zp = Path(res["zip_path"])
    assert zp.exists()
    assert res["zip_bytes"] == zp.stat().st_size
    blob = zp.read_bytes()
    assert sha256_bytes(blob) == res["zip_sha256"]

    entries = unpack_bundle(blob)

    # 1. Every required path is present and non-empty.
    for must in _REQUIRED_PATHS + tuple(_required_swid_paths(game, swid)):
        assert must in entries, f"missing {must}"
        assert len(entries[must]) > 0, f"empty {must}"

    # 2. MANIFEST commitments match every other archived blob.
    manifest = json.loads(entries["MANIFEST.json"])
    assert manifest["game"] == game
    assert manifest["swid"] == swid
    assert manifest["epoch"] == DEFAULT_EPOCH
    by_path = {e["path"]: e for e in manifest["files"]}
    # The manifest must not list itself / the signature (chicken-and-egg).
    assert "MANIFEST.json" not in by_path
    assert "SIGNATURE.sig" not in by_path
    for path, entry in by_path.items():
        assert path in entries, f"manifest references missing entry {path}"
        actual_sha = sha256_bytes(entries[path])
        assert actual_sha == entry["sha256"], f"sha mismatch for {path}"
        assert entry["size_bytes"] == len(entries[path])

    # 3. Signature verifies against the bundle's public key.
    keys = sign.load_or_generate_key()
    assert sign.verify_signature(
        entries["MANIFEST.json"], entries["SIGNATURE.sig"],
        public_pem_path=keys.public_pem_path,
    )

    # 4. acceptance.json shape: PASS or FAIL, with all four checks present.
    acc = json.loads(
        entries[f"verdict/{game}.{swid}.acceptance.json"],
    )
    assert acc["swid"] == swid
    assert acc["verdict"] in {"PASS", "FAIL"}
    for check in (
        "closed_form_delta_zero",
        "mc_rtp_within_1pct",
        "mc_hit_freq_within_1e-2",
        "rtp_source_unset",
    ):
        assert check in acc["checks"], f"acceptance missing check {check}"

    # 5. closed-form delta is exactly zero by construction.
    cf = json.loads(entries[f"verdict/{game}.{swid}.closed_form.json"])
    assert abs(cf["closed_form_delta_rtp"]) <= 1e-12


def test_reproducibility(bundle_dir: Path) -> None:
    """Running the same CLI twice must produce byte-identical ZIPs."""
    game, swid = _ALL_SWIDS[0]
    a = bundle_dir / "repro_a"
    b = bundle_dir / "repro_b"
    cache = bundle_dir / "mc-cache"
    r1 = build_bundle_for_swid(
        game, swid, out_dir=a, mc_spins=_TEST_MC_SPINS, mc_cache_dir=cache,
    )
    r2 = build_bundle_for_swid(
        game, swid, out_dir=b, mc_spins=_TEST_MC_SPINS, mc_cache_dir=cache,
    )
    assert r1["zip_sha256"] == r2["zip_sha256"]
    assert Path(r1["zip_path"]).read_bytes() == Path(r2["zip_path"]).read_bytes()


def test_signature_tamper_detected(bundle_dir: Path) -> None:
    """Flip a byte inside MANIFEST.json → ed25519 verify must fail."""
    game, swid = _ALL_SWIDS[0]
    res = build_bundle_for_swid(
        game, swid,
        out_dir=bundle_dir / "tamper",
        mc_spins=_TEST_MC_SPINS,
        mc_cache_dir=bundle_dir / "mc-cache",
    )
    blob = Path(res["zip_path"]).read_bytes()
    entries = unpack_bundle(blob)
    manifest = entries["MANIFEST.json"]
    signature = entries["SIGNATURE.sig"]
    keys = sign.load_or_generate_key()

    # First confirm the un-tampered bundle verifies fine.
    assert sign.verify_signature(
        manifest, signature, public_pem_path=keys.public_pem_path,
    )

    # Now flip the last meaningful byte before the trailing newline.
    tampered = bytearray(manifest)
    # Pick an index that's actually JSON content (not the trailing "\n").
    idx = len(tampered) - 2
    tampered[idx] ^= 0xFF
    assert not sign.verify_signature(
        bytes(tampered), signature, public_pem_path=keys.public_pem_path,
    )


def test_swid_to_game_map_covers_all() -> None:
    """Sanity: SWID_TO_GAME must round-trip with GAME_SWIDS."""
    flat = {s: g for g, swids in GAME_SWIDS.items() for s in swids}
    assert SWID_TO_GAME == flat
    assert len(SWID_TO_GAME) == 12
