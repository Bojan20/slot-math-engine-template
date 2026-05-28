"""W4.15 — per-SWID regulator-ready cert bundle builder.

For each of the 12 SWIDs across the four shipped games (3 Skeleton Key
+ 4 Fortune Coin + 3 Cash Eruption + 2 Fort Knox Wolf Run) this package
emits an `operator-package.zip` shaped for a Tier-1 operator or a
BMM / GLI / iTechLabs auditor — i.e. a recipient with no access to our
toolchain who must still be able to verify the math.

The bundle layout (per the W4.15 mission spec):

    <game>.<swid>.operator-package.zip
    ├── README.md
    ├── MANIFEST.json
    ├── SIGNATURE.sig                ed25519 signature of MANIFEST.json
    ├── ir/<game>.<swid>.slot-sim.ir.json
    ├── verdict/<game>.<swid>.closed_form.json
    ├── verdict/<game>.<swid>.mc_verdict.json
    ├── verdict/<game>.<swid>.acceptance.json
    ├── paytable/<game>.<swid>.paytable.csv
    ├── reels/<game>.<swid>.reels_summary.json
    ├── cert/<game>.<swid>.cert.xml
    └── meta/version.json + meta/changelog.md

Reproducibility:
  • All ZIP entries pinned to a single epoch (default 1700000000).
  • All JSON serialised with sort_keys=True, no trailing whitespace.
  • MC seed is deterministic per SWID (int(swid.replace("-","")) mod 2**64).
  • Running `python3 -m tools.cert_bundle_swid all` twice yields ZIPs
    with identical sha256.

Offline-only — nothing in the bundle, the logs, or stdout reveals any
raw vendor PAR cell value (only derived aggregates such as RTP, hit
freq, weight totals, sha256 fingerprints).
"""

from tools.cert_bundle_swid.runner import (
    GAME_SWIDS,
    build_bundle_for_swid,
    build_all,
    SWID_TO_GAME,
)

__all__ = [
    "GAME_SWIDS",
    "build_bundle_for_swid",
    "build_all",
    "SWID_TO_GAME",
]
