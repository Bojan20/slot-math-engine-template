"""slot-math-engine-template universal PAR parser.

W4.2 — vendor-profile-driven parser. Replaces game-specific scripts with
a single engine that consumes a YAML vendor profile (column/row layout,
feature sheet conventions) plus a directory of raw TSV/cells.json dumps,
and emits a canonical IR JSON that the universal `slot-sim` Rust engine
consumes.

Public API:

    from tools.parse_par import parse_par, load_profile
    profile = load_profile("lw")   # or "igt", "netent", ...
    ir = parse_par(profile, raw_dir, sheet="PAR-001")

CLI:

    python -m tools.parse_par <vendor> <raw_dir> --out <ir_dir>
"""

from .profile import VendorProfile, load_profile
from .core import parse_par, parse_paylines

__all__ = ["VendorProfile", "load_profile", "parse_par", "parse_paylines"]
