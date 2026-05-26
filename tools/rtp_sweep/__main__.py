"""CLI entry for slot-rtp-sweep — sweeps a kernel's analytical RTP."""
from __future__ import annotations
import argparse
import importlib
import json
import sys
from dataclasses import fields, is_dataclass, replace
from pathlib import Path

from tools.rtp_sweep.sweeper import ascii_chart, sweep


def _build_params(module_name: str, base: dict) -> object:
    mod = importlib.import_module(module_name)
    cls = None
    for k in dir(mod):
        obj = getattr(mod, k)
        if is_dataclass(obj) and "Params" in k:
            cls = obj
            break
    if cls is None:
        raise ValueError(
            f"could not find a *Params dataclass in {module_name}"
        )
    expected = {f.name for f in fields(cls)}
    safe = {k: v for k, v in base.items() if k in expected}
    return cls(**safe)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-rtp-sweep",
        description=(
            "Sweep one parameter of a closed-form kernel and emit (x, y) "
            "points + ASCII chart."
        ),
    )
    p.add_argument("kernel", help="dotted module name e.g. tools.solvers.respin_charge_meter")
    p.add_argument("param", help="parameter name to sweep (must be numeric)")
    p.add_argument("--start", type=float, required=True)
    p.add_argument("--stop", type=float, required=True)
    p.add_argument("--n", type=int, default=21)
    p.add_argument("--base", type=Path, default=None,
                   help="JSON file with base params; missing fields raise")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    base: dict = {}
    if args.base is not None:
        try:
            base = json.loads(args.base.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read base: {e}\n")
            return 2

    try:
        params = _build_params(args.kernel, base)
        mod = importlib.import_module(args.kernel)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"could not load kernel: {e}\n")
        return 2

    fn = getattr(mod, "analytical_rtp", None)
    if fn is None:
        sys.stderr.write(f"{args.kernel} has no analytical_rtp\n")
        return 2

    def eval_at(x: float) -> float:
        return fn(replace(params, **{args.param: x}))

    result = sweep(
        eval_at, param_name=args.param,
        start=args.start, stop=args.stop, n=args.n,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(result.to_dict(), indent=2, sort_keys=True)
        )
    if not args.quiet:
        sys.stdout.write(ascii_chart(result))
        sys.stdout.write(
            f"  Δy across sweep = {result.y_range:.6f}\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
