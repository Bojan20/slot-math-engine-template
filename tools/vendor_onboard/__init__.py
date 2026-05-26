"""W59 — Vendor Onboarding Wizard.

`slot-vendor-onboard` walks a new vendor through every step from
"no profile" to "shippable pilot folder" in one command:

  1. ``vendor_profiles.scaffold`` — emit a fresh YAML profile.
  2. ``parse_par.synth_par.SyntheticPAR`` — generate a synthetic PAR
     grid sized to the profile's coordinates (offline smoke data).
  3. ``parse_par`` round-trip — convert the synthesized PAR back to
     a universal IR and verify it round-trips structurally.
  4. ``cert_verify.verifier`` — re-hash the IR + verify the
     produced cert XML (if cert_xml_v2 is also emitted) end-to-end.

The wizard produces a ``pilot_<vendor_id>/`` directory containing
the profile YAML, the synthetic PAR TSV, the IR JSON, optional
cert XML, and a single ``ONBOARD_REPORT.md`` describing what
landed + what the vendor needs to calibrate next.
"""
from tools.vendor_onboard.wizard import (
    OnboardStep,
    OnboardReport,
    run_onboarding,
    render_report_md,
)

__all__ = [
    "OnboardStep",
    "OnboardReport",
    "run_onboarding",
    "render_report_md",
]
