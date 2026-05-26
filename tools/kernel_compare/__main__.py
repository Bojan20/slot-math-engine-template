"""CLI entry for slot-kernel-compare (proportionality between 2 kernels)."""
from __future__ import annotations
import argparse
import importlib
import json
import sys
from dataclasses import fields, is_dataclass, replace
from pathlib import Path

from tools.kernel_compare.comparator import compare_kernels, proportionality_test


def _build_params(module_name: str, base: dict):
    mod = importlib.import_module(module_name)
    cls = None
    for k in dir(mod):
        obj = getattr(mod, k)
        if is_dataclass(obj) and "Params" in k:
            cls = obj
            break
    if cls is None:
        raise ValueError(f"could not find Params dataclass in {module_name}")
    expected = {f.name for f in fields(cls)}
    safe = {k: v for k, v in base.items() if k in expected}
    return mod, cls(**safe)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-kernel-compare",
        description=(
            "Sweep `param` across xs and compare two kernels' analytical_rtp."
        ),
    )
    p.add_argument("kernel_a", help="e.g. tools.solvers.mystery_box_award_table")
    p.add_argument("kernel_b", help="e.g. tools.solvers.bonus_pick_geometric")
    p.add_argument("param", help="shared parameter to sweep")
    p.add_argument("--base-a", type=Path, required=True)
    p.add_argument("--base-b", type=Path, required=True)
    p.add_argument("--start", type=float, required=True)
    p.add_argument("--stop", type=float, required=True)
    p.add_argument("--n", type=int, default=11)
    p.add_argument("--mode", choices=["equivalence", "proportionality"],
                   default="equivalence")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        base_a = json.loads(args.base_a.read_text())
        base_b = json.loads(args.base_b.read_text())
        mod_a, params_a = _build_params(args.kernel_a, base_a)
        mod_b, params_b = _build_params(args.kernel_b, base_b)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to load kernels: {e}\n")
        return 2

    if not hasattr(mod_a, "analytical_rtp") or not hasattr(mod_b, "analytical_rtp"):
        sys.stderr.write("both kernels must export analytical_rtp\n")
        return 2

    xs = []
    if args.n == 1:
        xs = [args.start]
    else:
        step = (args.stop - args.start) / (args.n - 1)
        xs = [args.start + step * i for i in range(args.n)]

    def fn_a(x: float) -> float:
        return mod_a.analytical_rtp(replace(params_a, **{args.param: x}))

    def fn_b(x: float) -> float:
        return mod_b.analytical_rtp(replace(params_b, **{args.param: x}))

    if args.mode == "equivalence":
        result = compare_kernels(fn_a, fn_b, xs=xs)
    else:
        result = proportionality_test(fn_a, fn_b, xs=xs)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = (
            "✅ EQUIVALENT" if result.equivalent else
            "✅ PROPORTIONAL" if result.proportional else
            "🔴 DIVERGENT"
        )
        sys.stdout.write(
            f"\n[kernel-compare] {verdict}  n={result.n_points}  "
            f"max_abs={result.max_abs_diff:.6g}  max_rel={result.max_rel_diff:.6g}  "
            f"k={result.proportionality_ratio}\n"
        )
    return 0 if (result.equivalent or result.proportional) else 1


if __name__ == "__main__":
    raise SystemExit(main())
