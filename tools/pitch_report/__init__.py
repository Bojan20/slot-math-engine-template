"""W6.3 — Pitch report generator.

Ultimate single-HTML pitch deck for Tier-1 operators, lab auditors and
regulators.  All data is collected from existing cert bundles, IRs,
acceptance JSONs, and recent commit log; rendered into one deterministic
offline-safe HTML file.

Entry point: ``python3 -m tools.pitch_report``.
"""

from __future__ import annotations

__all__ = ["__main__"]
