"""Vendor-profile package.

Each YAML/JSON file in this directory describes a vendor's PAR-sheet
layout convention. The Python loader lives in
`tools/parse_par/profile.py`; this package also exposes a CLI
scaffolder that emits fresh profile skeletons for new vendors.
"""
from tools.vendor_profiles.scaffold import (
    KNOWN_FEATURES,
    scaffold_profile,
)

__all__ = [
    "KNOWN_FEATURES",
    "scaffold_profile",
]
