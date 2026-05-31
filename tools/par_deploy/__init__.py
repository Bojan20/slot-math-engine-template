"""SLOT-MATH Faza 4 — auto-deploy pipeline (web playable + RGS + Merkle chain).

Posle Faze 3 (MC convergence PASS), pokreće deploy bundle:

    build/games/<game>/<variant>/
      web/                          ← static bundle (CDN)
        index.html
        bundle.js
        game.ir.json
        assets/                     ← from skin folder
      server/                       ← Node RGS (Docker)
        server.js
        Dockerfile
        api.openapi.json
      attestation/
        par.merkle
        ir.merkle
        mc_sweep.merkle
        kernel.merkle
        bundle.merkle
        deploy.signature.sha256     ← single root proves entire chain
      README.md                     ← regulator paper trail
"""
from tools.par_deploy.web_emit import emit_web_bundle, render_index_html
from tools.par_deploy.rgs_emit import emit_rgs_bundle, render_fastify_server
from tools.par_deploy.assets import copy_skin_assets, default_asset_manifest
from tools.par_deploy.attestation_chain import (
    DeployAttestation,
    build_deploy_attestation,
    write_attestation_chain,
)
from tools.par_deploy.jurisdiction import (
    JURISDICTIONS,
    JurisdictionProfile,
    clamp_rtp_for_jurisdiction,
)
from tools.par_deploy.promote import (
    promote_variant,
    audit_log_entry,
)

__all__ = [
    "emit_web_bundle",
    "render_index_html",
    "emit_rgs_bundle",
    "render_fastify_server",
    "copy_skin_assets",
    "default_asset_manifest",
    "DeployAttestation",
    "build_deploy_attestation",
    "write_attestation_chain",
    "JURISDICTIONS",
    "JurisdictionProfile",
    "clamp_rtp_for_jurisdiction",
    "promote_variant",
    "audit_log_entry",
]
