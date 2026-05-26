"""CLI entry for slot-replay-gate."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.replay_gate.gate import (
    load_baseline,
    record_baseline,
    replay_check,
    save_baseline,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-replay-gate",
        description=(
            "Replay determinism gate. `record` captures a baseline spin "
            "output stream from (IR, seed, n_spins); `check` re-runs "
            "and asserts identical output."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pr = sub.add_parser("record")
    pr.add_argument("ir_path", type=Path)
    pr.add_argument("--seed", type=int, default=42)
    pr.add_argument("--spins", type=int, default=200)
    pr.add_argument("--target-rtp", type=float, default=0.95)
    pr.add_argument("--out", type=Path, default=None)
    pr.set_defaults(handler="record")

    pc = sub.add_parser("check")
    pc.add_argument("ir_path", type=Path)
    pc.add_argument("--baseline", type=Path, default=None)
    pc.add_argument("--json", action="store_true")
    pc.set_defaults(handler="check")

    args = p.parse_args(argv)
    try:
        ir = json.loads(args.ir_path.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    if args.handler == "record":
        bl = record_baseline(
            ir, ir_path=str(args.ir_path),
            seed=args.seed, n_spins=args.spins,
            target_rtp=args.target_rtp,
        )
        out_path = (Path(args.out) if args.out
                    else Path(str(args.ir_path) + ".replay.json"))
        save_baseline(bl, out_path)
        sys.stdout.write(
            f"wrote {out_path}\n"
            f"  ir_sha256:     {bl.ir_sha256}\n"
            f"  seed:          {bl.seed}\n"
            f"  n_spins:       {bl.n_spins}\n"
            f"  output_sha256: {bl.output_sha256}\n"
        )
        return 0

    # check
    bl_path = (Path(args.baseline) if args.baseline
               else Path(str(args.ir_path) + ".replay.json"))
    try:
        bl = load_baseline(bl_path)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read baseline: {e}\n")
        return 2
    result = replay_check(ir, bl)
    if args.json:
        sys.stdout.write(json.dumps(result.to_dict(), indent=2,
                                      sort_keys=True) + "\n")
    else:
        verdict = "PASSED" if result.passed else "FAILED"
        sys.stdout.write(
            f"replay {verdict}\n"
            f"  expected_sha256: {result.expected_sha256}\n"
            f"  actual_sha256:   {result.actual_sha256}\n"
            f"  mismatches:      {result.mismatch_count}"
            + (
                f" (first @ index {result.first_mismatch_index})"
                if result.mismatch_count else ""
            )
            + "\n"
        )
    return 0 if result.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
