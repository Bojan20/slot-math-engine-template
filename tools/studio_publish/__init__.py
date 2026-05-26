"""W73 — Studio → Marketplace Pipeline.

End-to-end orchestrator for taking a built game folder (with IR,
optional cert ZIP, optional cert XML) and producing a fully signed,
verified plugin bundle in a marketplace registry, with a complete
provenance trail.

Pipeline steps:

  1. ``plugin_bundle.build_bundle``   — pack games_dir into a ZIP
  2. ``plugin_sign.sign_zip``         — ed25519 sign the body
  3. ``plugin_marketplace.publish``   — push into a FilesystemMarketplace
  4. ``plugin_marketplace.verifier``  — download + re-verify
  5. ``cert_sbom.emit``                — emit CycloneDX SBOM (best-effort)
  6. ``cert_e2e_verify``               — final unified gate

Returns ``PublishReport`` with every step's status. Skips gracefully
when a dependency (e.g. cert XML) is absent.

CLI: ``slot-studio-publish <games_dir> --out <staging>
                          --plugin-id X --version Y
                          [--private-pem ... --public-pem ...]
                          [--registry-dir ...]``.
"""
from tools.studio_publish.pipeline import (
    PublishReport,
    PublishStep,
    publish_studio,
)

__all__ = [
    "PublishReport",
    "PublishStep",
    "publish_studio",
]
