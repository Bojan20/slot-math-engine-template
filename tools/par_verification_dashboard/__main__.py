"""CLI for the W6.2 multi-SWID PAR verification dashboard.

Usage:
    python -m tools.par_verification_dashboard \\
        --bundles "reports/cert-bundle-swid/*.operator-package.zip" \\
        --out reports/dashboards/par-verification.html
"""

from __future__ import annotations

import argparse
import glob
import sys
from pathlib import Path

from .build import write_dashboard


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="par_verification_dashboard",
        description="Render an offline multi-SWID PAR verification HTML dashboard",
    )
    parser.add_argument(
        "--bundles",
        action="append",
        default=[],
        help="Glob (or repeated path) for operator-package.zip bundles. Repeatable.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("reports/dashboards/par-verification.html"),
        help="Output HTML path (parent created on demand)",
    )
    args = parser.parse_args(argv)

    if not args.bundles:
        # Default to the conventional cert-bundle output location.
        args.bundles = ["reports/cert-bundle-swid/*.operator-package.zip"]

    paths: list[Path] = []
    for pattern in args.bundles:
        matched = sorted(glob.glob(pattern))
        if not matched:
            # Allow literal paths even if no glob matched.
            p = Path(pattern)
            if p.exists():
                matched = [str(p)]
        for m in matched:
            paths.append(Path(m))

    if not paths:
        print(
            "no operator-package.zip bundles found — pass --bundles <glob>",
            file=sys.stderr,
        )
        return 2

    out = write_dashboard(paths, args.out)
    print(f"Wrote dashboard with {len(paths)} bundle(s) → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
