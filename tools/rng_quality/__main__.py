"""CLI entry for slot-rng-quality.

Example:
    slot-rng-quality stream.bin --json reports/rng.json
    slot-rng-quality stream.hex --hex --alpha 0.001
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.rng_quality.suite import (
    bits_from_bytes,
    bits_from_hex,
    run_full_suite,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-rng-quality",
        description=(
            "NIST-STS-style randomness mini-suite for slot RNG streams. "
            "Tests: monobit + frequency-block + runs + longest-run + "
            "cumulative-sum."
        ),
    )
    p.add_argument("stream", type=Path,
                   help="binary file (or hex text with --hex)")
    p.add_argument("--hex", action="store_true",
                   help="treat input as ASCII hex string")
    p.add_argument("--alpha", type=float, default=0.01)
    p.add_argument("--block-size", type=int, default=128)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--markdown", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    raw = args.stream.read_bytes()
    if args.hex:
        bits = bits_from_hex(raw.decode("ascii"))
    else:
        bits = bits_from_bytes(raw)

    report = run_full_suite(bits, alpha=args.alpha,
                              block_size=args.block_size)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2,
                                         sort_keys=True))
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(report.to_markdown())

    if not args.quiet:
        verdict = "PASS" if report.passed_all else "FAIL"
        sys.stdout.write(
            f"\n[rng-quality] {len(bits)} bits · α={args.alpha} · "
            f"verdict={verdict}\n"
        )
        for r in report.results:
            tag = "✅" if r.passed else "🔴"
            line = f"  {tag} {r.name:20s} p={r.p_value:.4f}"
            if r.note:
                line += f"  ({r.note})"
            sys.stdout.write(line + "\n")

    return 0 if report.passed_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
