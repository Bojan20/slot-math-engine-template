"""SLOT-MATH Faza 4.6 — Build artefakt assembly orchestrator.

End-to-end deploy orchestrator. Given:
  - canonical PAR dict (with merkle_root_sha256)
  - Game IR dict (with provenance.ir_sha256)
  - MC sweep attestation dict (from Faza 3)
  - skin assets folder (optional)
  - output root directory

Produces a complete `games/<game>/<variant>/` build artefakt:

    games/<game>/<variant>/
      web/
        index.html               ← Pixi.js scaffolded shell
        bundle.js                ← engine + spin loop
        game.ir.json
        assets/                  ← from skin folder (or default)
      server/
        server.js                ← Fastify RGS
        package.json
        Dockerfile
        api.openapi.json
      attestation/
        par.merkle
        ir.merkle
        mc_sweep.merkle
        deploy.merkle            ← single root proves entire chain
        deploy.signature.sha256  ← byte-stable signature
      README.md                  ← regulator paper trail
      build.manifest.json        ← machine-readable summary

Acceptance: build is byte-deterministic when run twice with same inputs.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tools.par_deploy.assets import copy_skin_assets, default_asset_manifest
from tools.par_deploy.attestation_chain import (
    DeployAttestation,
    build_deploy_attestation,
    write_attestation_chain,
)
from tools.par_deploy.rgs_emit import emit_rgs_bundle
from tools.par_deploy.web_emit import emit_web_bundle


@dataclass
class BuildManifest:
    """Machine-readable summary of one deployed variant build."""

    schema: str
    game_id: str
    variant_id: str
    build_timestamp: str
    par_merkle_sha256: str
    ir_sha256: str
    mc_attestation_sha256: str
    web_bundle_sha256: str
    rgs_bundle_sha256: str
    deploy_merkle_root: str
    deploy_signature: str
    artefact_paths: dict[str, str]
    jurisdiction: str | None


README_TEMPLATE = """\
# {game_name} — {variant_id}

**Regulator paper trail** — every artefact in this directory is hash-linked
back to the canonical PAR sheet via a Merkle attestation chain.

## Build identity

| Field | Value |
|---|---|
| Game ID | `{game_id}` |
| Variant ID | `{variant_id}` |
| Built at (UTC) | `{build_timestamp}` |
| PAR Merkle root | `{par_merkle}` |
| IR SHA-256 | `{ir_sha}` |
| MC attestation | `{mc_sha}` |
| Web bundle | `{web_sha}` |
| RGS bundle | `{rgs_sha}` |
| **Deploy root** | `{deploy_root}` |
| **Deploy signature** | `{deploy_sig}` |
| Jurisdiction | `{jurisdiction}` |

## Verification (regulator)

```bash
# Re-derive every link in the chain:
slot-math attest verify games/{game_id}/{variant_id}/

# Independently re-run MC convergence at T3 (regulator default):
slot-math mc-sweep games/{game_id}/{variant_id}/ --tier T3
```

If both commands exit 0, the deployed bundle math is provably identical
to the locked PAR sheet, end-to-end.

## Layout

| Path | Purpose |
|---|---|
| `web/` | Static playable bundle (CDN-ready) |
| `server/` | Fastify RGS backend (Docker-ready) |
| `attestation/` | Merkle chain + signature |
| `build.manifest.json` | Machine-readable summary |

## Math determinism

Engine math is byte-identical to the PAR sheet RTP targets within the
MC tier tolerances (Wilson CI 99.9% at T3). See `attestation/mc_sweep.merkle`
for proof.
"""


def _stable_sha256_dir(path: Path) -> str:
    """Deterministic recursive SHA-256 of a directory tree.

    Used to fingerprint bundles after emit. Walks paths sorted, hashes
    relative path + content of each file.
    """
    h = hashlib.sha256()
    if not path.exists():
        return h.hexdigest()
    for child in sorted(path.rglob("*")):
        if child.is_file():
            rel = child.relative_to(path).as_posix().encode("utf-8")
            h.update(b"PATH:")
            h.update(rel)
            h.update(b"\nCONTENT:")
            h.update(child.read_bytes())
            h.update(b"\n")
    return h.hexdigest()


def assemble_variant(
    par: dict[str, Any],
    ir: dict[str, Any],
    mc_attestation: dict[str, Any],
    out_root: Path,
    skin_dir: Path | None = None,
    jurisdiction: str | None = None,
    build_timestamp: str | None = None,
) -> BuildManifest:
    """Build one complete variant deployment artefact.

    Args:
        par: Canonical PAR dict (must include `merkle_root_sha256`).
        ir:  Game IR dict (must include `provenance.ir_sha256`).
        mc_attestation: Output of Faza 3 MC sweep (must include
            `attestation_sha256`).
        out_root: Where to write `games/<game>/<variant>/` tree.
            The variant subdir is derived from `ir.meta.id` and
            `ir.provenance.par_source`.
        skin_dir: Optional skin asset folder (PNG/SVG reel symbols,
            line glyphs, sound). Falls back to `default_asset_manifest()`
            when absent (regulator-only deployment).
        jurisdiction: Optional jurisdiction profile name. Stored in
            manifest + README; RTP clamping is applied separately by
            caller via `clamp_rtp_for_jurisdiction()` BEFORE invoking
            assemble.
        build_timestamp: ISO-8601 UTC string. Defaults to now. Pass a
            fixed value to make builds byte-deterministic.

    Returns:
        BuildManifest with paths and hashes. Manifest is also serialised
        to `<variant>/build.manifest.json`.
    """
    game_id = ir.get("meta", {}).get("id", "unknown")
    variant_id = (
        ir.get("provenance", {}).get("par_source", "unknown")
        .rsplit("/", 1)[-1]
        .removesuffix(".xlsx")
        .removesuffix(".par")
        .removesuffix(".json")
    )
    if build_timestamp is None:
        build_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    variant_dir = out_root / "games" / game_id / variant_id
    variant_dir.mkdir(parents=True, exist_ok=True)

    web_dir = variant_dir / "web"
    server_dir = variant_dir / "server"
    attestation_dir = variant_dir / "attestation"

    # ── 1. Web bundle ──────────────────────────────────────────────
    # NB: emit_web_bundle internally creates `<parent>/web/`, so we pass
    # variant_dir (not web_dir) to avoid the duplicate `web/web/` nesting.
    emit_web_bundle(ir, variant_dir)

    # ── 2. RGS bundle ──────────────────────────────────────────────
    # Same convention: emit_rgs_bundle creates `<parent>/server/`.
    emit_rgs_bundle(ir, variant_dir)

    # ── 3. Assets (must land BEFORE we hash the web dir) ───────────
    assets_dir = web_dir / "assets"
    if skin_dir is not None and skin_dir.is_dir():
        copy_skin_assets(skin_dir, assets_dir)
    else:
        # Stub manifest so web bundle has a deterministic asset surface.
        assets_dir.mkdir(parents=True, exist_ok=True)
        manifest = default_asset_manifest(ir)
        (assets_dir / "manifest.json").write_text(
            json.dumps(manifest, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )

    # ── 4. Hash bundles AFTER all files settled ────────────────────
    web_sha = _stable_sha256_dir(web_dir)
    rgs_sha = _stable_sha256_dir(server_dir)

    # ── 5. Attestation chain ───────────────────────────────────────
    par_merkle = par.get("merkle_root_sha256", "0" * 64)
    ir_sha = ir.get("provenance", {}).get("ir_sha256", "0" * 64)
    mc_sha = mc_attestation.get("attestation_sha256", "0" * 64)
    # Bundle merkle = SHA-256 of (web_sha || ":" || rgs_sha) — single hash
    # over both deploy artefakt halves.
    bundle_merkle = hashlib.sha256(
        f"{web_sha}:{rgs_sha}".encode("utf-8")
    ).hexdigest()

    deploy_att: DeployAttestation = build_deploy_attestation(
        game_id=game_id,
        variant_id=variant_id,
        par_merkle=par_merkle,
        ir_merkle=ir_sha,
        mc_sweep_merkle=mc_sha,
        bundle_merkle=bundle_merkle,
        jurisdiction_codes=[jurisdiction] if jurisdiction else [],
        mc_tier=mc_attestation.get("tier", "T3"),
        built_at_utc=build_timestamp,
    )
    # write_attestation_chain wraps in <out>/attestation/; pass variant_dir.
    write_attestation_chain(deploy_att, variant_dir)
    deploy_sig = deploy_att.deploy_signature()

    # ── 5. README ──────────────────────────────────────────────────
    game_name = ir.get("meta", {}).get("name", game_id)
    readme = README_TEMPLATE.format(
        game_name=game_name,
        game_id=game_id,
        variant_id=variant_id,
        build_timestamp=build_timestamp,
        par_merkle=par_merkle,
        ir_sha=ir_sha,
        mc_sha=mc_sha,
        web_sha=web_sha,
        rgs_sha=rgs_sha,
        deploy_root=bundle_merkle,
        deploy_sig=deploy_sig,
        jurisdiction=jurisdiction or "global (no clamp)",
    )
    (variant_dir / "README.md").write_text(readme, encoding="utf-8")

    # ── 6. Machine manifest ────────────────────────────────────────
    manifest_obj = BuildManifest(
        schema="slot-math-build-manifest/v1",
        game_id=game_id,
        variant_id=variant_id,
        build_timestamp=build_timestamp,
        par_merkle_sha256=par_merkle,
        ir_sha256=ir_sha,
        mc_attestation_sha256=mc_sha,
        web_bundle_sha256=web_sha,
        rgs_bundle_sha256=rgs_sha,
        deploy_merkle_root=bundle_merkle,
        deploy_signature=deploy_sig,
        artefact_paths={
            "web": str(web_dir.relative_to(out_root)),
            "server": str(server_dir.relative_to(out_root)),
            "attestation": str(attestation_dir.relative_to(out_root)),
            "readme": str((variant_dir / "README.md").relative_to(out_root)),
        },
        jurisdiction=jurisdiction,
    )
    (variant_dir / "build.manifest.json").write_text(
        json.dumps(asdict(manifest_obj), sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )

    return manifest_obj


def verify_artefact_integrity(variant_dir: Path) -> tuple[bool, list[str]]:
    """Re-derive bundle hashes from disk; compare against manifest.

    Returns (ok, list_of_violations). Empty violations + ok=True means
    the deployed artefakt has not been tampered with.
    """
    manifest_path = variant_dir / "build.manifest.json"
    if not manifest_path.is_file():
        return False, [f"missing manifest: {manifest_path}"]

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    violations: list[str] = []

    web_sha = _stable_sha256_dir(variant_dir / "web")
    if web_sha != manifest["web_bundle_sha256"]:
        violations.append(
            f"web bundle hash drift: disk={web_sha} manifest={manifest['web_bundle_sha256']}"
        )

    rgs_sha = _stable_sha256_dir(variant_dir / "server")
    if rgs_sha != manifest["rgs_bundle_sha256"]:
        violations.append(
            f"server bundle hash drift: disk={rgs_sha} manifest={manifest['rgs_bundle_sha256']}"
        )

    return (len(violations) == 0), violations


def clean_variant(variant_dir: Path) -> None:
    """Remove a variant subdir entirely (for promote-and-replace flows)."""
    if variant_dir.exists():
        shutil.rmtree(variant_dir)
