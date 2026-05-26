"""CLI entry for slot-ir-fuzzer."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.ir_fuzzer.fuzzer import run_fuzz


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-ir-fuzzer",
        description=(
            "Mutate an IR with structured corruptions and confirm the "
            "invariant checker catches every hard break. Exit 1 on any "
            "false negative."
        ),
    )
    p.add_argument("ir", type=Path)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--iterations", type=int, default=5,
                   help="iterations per mutation class")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir = json.loads(args.ir.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    report = run_fuzz(
        ir, seed=args.seed,
        iterations_per_mutation=args.iterations,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(report.to_dict(), indent=2, sort_keys=True)
        )

    if not args.quiet:
        sys.stdout.write(
            f"\n[ir-fuzzer] seed={report.seed} "
            f"iters={report.iterations} "
            f"caught={report.n_caught}/{len(report.results)} "
            f"false_negatives={report.n_false_negatives}\n"
        )
        if report.n_false_negatives:
            sys.stdout.write("  ↳ uncaught mutations:\n")
            for r in report.results:
                if r.false_negative:
                    sys.stdout.write(f"    🔴 {r.mutation}\n")
    return 0 if report.n_false_negatives == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
