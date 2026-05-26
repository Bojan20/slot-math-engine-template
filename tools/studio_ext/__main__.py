"""CLI for `slot-studio-extend` — drop Mission #8 Studio extensions
into an existing W5.4 scaffold."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tools.studio_ext.extend import EXT_COMPONENTS, extend_studio


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-studio-extend",
        description="Mission #8 — Studio UI extensions "
                    "(WebWorker MC + paytable heatmap + IR editor)",
    )
    ap.add_argument(
        "studio_dir",
        help="path to an existing Studio scaffold root "
             "(contains index.html + app.js)",
    )
    ap.add_argument(
        "--components",
        default=",".join(EXT_COMPONENTS),
        help=f"comma-separated list of components to emit "
             f"(default: {','.join(EXT_COMPONENTS)})",
    )
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    target = Path(args.studio_dir)
    if not target.is_dir():
        print(f"error: {target} is not a directory", file=sys.stderr)
        return 2
    if not (target / "index.html").is_file():
        print(f"warn: {target}/index.html missing — "
              "extensions still emitted but may not auto-load",
              file=sys.stderr)

    comps = [c.strip() for c in args.components.split(",") if c.strip()]
    unknown = [c for c in comps if c not in EXT_COMPONENTS]
    if unknown:
        print(f"error: unknown components {unknown}; "
              f"valid: {EXT_COMPONENTS}", file=sys.stderr)
        return 2

    out = extend_studio(target, components=comps)
    if not args.quiet:
        for comp, files in out.items():
            print(f"{comp:8s} →")
            for f in files:
                print(f"  {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
