"""PHASE 18 — `slot-cross-validate` CLI."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.cross_validate.harness import (
    run_cross_validate,
    list_available_engines,
    validation_to_dict,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-cross-validate",
        description="PHASE 18 — Multi-Engine Cross-Validation.",
    )
    parser.add_argument("--ir", required=True,
                         help="Path to IR JSON.")
    parser.add_argument("--engines",
                         help="Comma-separated list of engines (default: all available).")
    parser.add_argument("--spins", type=int, default=10_000)
    parser.add_argument("--seed", type=lambda s: int(s, 0), default=0xabcd_1234,
                         help="Engine seed (hex or decimal).")
    parser.add_argument("--tolerance", type=float, default=0.01,
                         help="Max |Δrtp| from cohort mean (default 0.01).")
    parser.add_argument("--out", help="Persist JSON report.")
    parser.add_argument("--json", action="store_true",
                         help="Print JSON report to stdout.")
    parser.add_argument("--list-engines", action="store_true",
                         help="Print available engines and exit.")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    if args.list_engines:
        for name in list_available_engines():
            print(name)
        return 0

    ir_path = Path(args.ir)
    if not ir_path.exists():
        print(f"error: ir not found: {ir_path}", file=sys.stderr)
        return 2

    engines = tuple(args.engines.split(",")) if args.engines else None
    try:
        result = run_cross_validate(
            ir_path=ir_path,
            engines=engines,
            spins=args.spins,
            seed=args.seed,
            tolerance=args.tolerance,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"error: cross-validate failed: {exc}", file=sys.stderr)
        return 1

    d = validation_to_dict(result)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(d, indent=2))
    if args.json:
        print(json.dumps(d, indent=2))
    elif not args.quiet:
        verdict = "PASS" if result.pass_ else "FAIL"
        print(f"[cross-validate] {verdict} · max Δrtp = {result.max_rtp_abs_delta:.6f}")
        print(f"  ir: {result.ir_path}")
        print(f"  engines run: {', '.join(result.engines_run) or '(none)'}")
        if result.engines_skipped:
            print(f"  skipped:    {', '.join(result.engines_skipped)}")
        print(f"  consensus rtp: {result.rtp_consensus:.6f}")
        for name, m in result.per_engine.items():
            err = f" [{m.error}]" if m.error else ""
            print(f"    {name}: rtp={m.rtp:.6f} hit={m.hit_freq:.4f} "
                  f"elapsed={m.elapsed_seconds:.3f}s{err}")
        if result.drifted_engines:
            print(f"  drifted: {', '.join(result.drifted_engines)}")
        if args.out:
            print(f"  json saved: {args.out}")

    return 0 if result.pass_ else 1


if __name__ == "__main__":
    sys.exit(main())
