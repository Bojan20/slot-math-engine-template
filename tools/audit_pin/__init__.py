"""W31 — Audit Hash Pinner.

Auto-pins canonical IR SHA-256 into `meta.lock_root_hash` so:
  • The IR file carries proof of its own current hash → regulators
    can compare against an external audit log without touching git.
  • Drift Sentinel (W11) + Replay Gate (W21) can cross-check the
    in-file hash against their independent fingerprints.

Also exposes a pre-commit-hook script that runs on every commit and
fails the commit when an IR's `meta.lock_root_hash` doesn't match
its current canonical hash (i.e. the operator changed math but
forgot to re-pin).
"""
from tools.audit_pin.pinner import (
    canonical_hash,
    is_pinned_current,
    pin_ir,
    pin_repo,
    PinResult,
    PinRunReport,
)

__all__ = [
    "canonical_hash",
    "is_pinned_current",
    "pin_ir",
    "pin_repo",
    "PinResult",
    "PinRunReport",
]
