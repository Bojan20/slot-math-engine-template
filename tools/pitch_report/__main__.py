"""W6.3 — Pitch report CLI.

Usage::

    python3 -m tools.pitch_report

Emits::

    reports/pitch-report/index.html
    reports/pitch-report/assets/pitch.css
    reports/pitch-report/assets/pitch-data.json
    reports/pitch-report/pitch.sha256.txt
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from .data_collector import (
    DEFAULT_PITCH_OUT,
    PITCH_EPOCH,
    collect,
)
from .renderer import render_html
from .templates import PITCH_CSS


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m tools.pitch_report",
        description=(
            "Build a single-file static HTML pitch deck "
            "(vendor cert verdicts + greenfield archetypes + W5.7/W6.1/W6.2)."
        ),
    )
    parser.add_argument(
        "--out-dir", default=str(DEFAULT_PITCH_OUT),
        help=f"output directory (default: {DEFAULT_PITCH_OUT})",
    )
    parser.add_argument(
        "--epoch", type=int, default=PITCH_EPOCH,
        help=f"pinned generation epoch (default: {PITCH_EPOCH})",
    )
    parser.add_argument(
        "--bundles-dir", default=None,
        help="override the cert-bundle dir (default: reports/cert-bundle-swid/)",
    )
    parser.add_argument(
        "--greenfield-dir", default=None,
        help="override the greenfield-demo dir (default: reports/greenfield-demo/)",
    )
    parser.add_argument(
        "--no-regenerate-missing", action="store_true",
        help="do not auto-rebuild missing cert bundles (faster, can leave gaps)",
    )
    parser.add_argument(
        "--cert-mc-spins", type=int, default=50_000,
        help="MC spin budget used to rebuild missing bundles (default: 50000)",
    )
    args = parser.parse_args(argv)

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "assets").mkdir(parents=True, exist_ok=True)

    bundles_dir = Path(args.bundles_dir).resolve() if args.bundles_dir else None
    greenfield_dir = Path(args.greenfield_dir).resolve() if args.greenfield_dir else None

    data = collect(
        bundles_dir=bundles_dir,
        greenfield_dir=greenfield_dir,
        epoch=args.epoch,
        regenerate_missing=not args.no_regenerate_missing,
        cert_mc_spins=args.cert_mc_spins,
    )
    html = render_html(data)

    index_path = out_dir / "index.html"
    css_path = out_dir / "assets" / "pitch.css"
    data_path = out_dir / "assets" / "pitch-data.json"
    sha_path = out_dir / "pitch.sha256.txt"

    index_path.write_text(html, encoding="utf-8")
    css_path.write_text(PITCH_CSS, encoding="utf-8")
    data_path.write_text(
        json.dumps(data.to_dict(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    html_sha = hashlib.sha256(html.encode("utf-8")).hexdigest()
    sha_path.write_text(f"{html_sha}  index.html\n", encoding="utf-8")

    html_bytes = index_path.stat().st_size
    print(f"  → wrote {index_path} ({html_bytes} bytes, sha256={html_sha[:16]}…)",
          file=sys.stderr)
    print(f"  → wrote {css_path}", file=sys.stderr)
    print(f"  → wrote {data_path}", file=sys.stderr)
    print(f"  → wrote {sha_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
