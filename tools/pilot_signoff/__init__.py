"""W64 — Pilot Sign-off Report.

Aggregates the artifacts produced by:
  * W59 onboarding (``ONBOARD_REPORT.md`` + ``MANIFEST.json``)
  * W51 cert XML v2 (``cert.v2.xml``)
  * W53 multi-territory (``jurisdictions/<id>.compliance.json``,
    one per profile)

…and emits a single ANSI-formatted plain-text "sign-off page" that
operators print, sign, and ship to the regulator alongside the
underlying artifacts. Pure stdlib — no PDF library.

The report includes:

  • Game meta (id, vendor, swid, version)
  • IR digest (SHA-256) cross-checked against cert.v2.xml
  • Per-jurisdiction PASS/FAIL with error counts
  • Onboarding step ledger
  • Final verdict block + signature lines (regulator + studio)
"""
from tools.pilot_signoff.report import (
    PilotSignoffReport,
    build_signoff,
    render_ansi,
)

__all__ = [
    "PilotSignoffReport",
    "build_signoff",
    "render_ansi",
]
