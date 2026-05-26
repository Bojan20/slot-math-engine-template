"""W26 — Runtime Config Validator.

Cross-checks repo configuration for internal consistency:

  • Every `<game>/ir.json` declares a `meta.target_rtp` that falls
    inside the union of `meta.jurisdiction` profiles' rtp_range.
  • Every IR's `limits.max_win_x` is ≤ min(jurisdiction.max_win_x).
  • Every IR's `limits.min_spin_duration_ms` is ≥ max(jurisdiction.min_spin_duration_ms).
  • Every IR's `meta.vendor` is registered in `tools/vendor_profiles/`.
  • Every IR's `features[].kind` is one of `KNOWN_FEATURES`.
  • `pyproject.toml` entry points all resolve to importable callables.

Emits a `ConfigReport` with errors + warnings, per-game and global.
"""
from tools.config_validator.validator import (
    ConfigIssue,
    ConfigReport,
    validate_repo,
)

__all__ = [
    "ConfigIssue",
    "ConfigReport",
    "validate_repo",
]
