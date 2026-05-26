"""W76 / P7.4 — Pilot Outreach Package Generator.

Bundles every existing pilot artifact (cert ZIP + sign-off PDF + SBOM
+ pubkey bundle + marketplace card) into a "cold outreach kit" ready
to ship to a vendor or operator. Emits:

  * cover letter Markdown (templated with operator + game name)
  * one-page technical brief Markdown (+ optional PDF via W70)
  * pricing sheet CSV
  * outreach-kit.zip — bundle ZIP for hand-off

Public API: ``build_outreach_package(...) -> OutreachPackage``.
"""
from tools.pilot_outreach.package import (
    OutreachPackage,
    OutreachConfig,
    build_outreach_package,
)

__all__ = [
    "OutreachPackage",
    "OutreachConfig",
    "build_outreach_package",
]
