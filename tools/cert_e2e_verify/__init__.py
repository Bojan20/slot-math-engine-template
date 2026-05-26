"""W71 — Cert Bundle E2E Verifier.

Single CLI that chains every existing verifier into one verdict:

  * ``tools.bundle_verify``        — manifest SHA-256 audit
  * ``tools.cert_verify``          — XML namespace + IR digest cross-check
  * ``tools.plugin_sign``          — ZIP ed25519 signature (when sidecar present)
  * ``tools.pubkey_bundle``        — registry signature batch verify
  * ``tools.plugin_marketplace``   — round-trip publish/download verify (opt)

Each step carries its own status + diagnostics. The aggregate verdict is
PASS only when every executed step passes; if any step is skipped the
aggregate is WARN; any failure yields FAIL.
"""
from tools.cert_e2e_verify.verifier import (
    E2EVerdict,
    E2EReport,
    E2EStep,
    verify_e2e,
)

__all__ = [
    "E2EVerdict",
    "E2EReport",
    "E2EStep",
    "verify_e2e",
]
