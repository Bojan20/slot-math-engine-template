"""CLI entry for slot-perf-budget — runs a default kernel timing budget."""
from __future__ import annotations
import argparse
import importlib
import json
import sys
from dataclasses import fields, is_dataclass
from pathlib import Path

from tools.perf_budget.gate import measure, run_budget


DEFAULT_BUDGET = [
    # (kernel module, params kwargs, analytical_ms_budget, mc_budget, mc_spins)
    ("tools.solvers.mystery_box_award_table",
        {"n_cells": 15, "p_box_per_cell": 0.02,
         "award_values": [1.0, 2.0, 5.0, 10.0, 50.0],
         "award_weights": [50, 30, 15, 4, 1]}, 1.0, 1500.0, 50_000),
    ("tools.solvers.respin_charge_meter",
        {"p_trigger": 0.05, "p_charge": 0.30, "meter_capacity": 5,
         "max_respins": 15, "fill_pay": 200.0}, 1.0, 1500.0, 50_000),
    ("tools.solvers.expanding_symbol_reel",
        {"reels": 5, "p_symbol_on_reel": 0.15,
         "min_reels_for_line": 3, "pay_5oak": 50.0}, 1.0, 1500.0, 50_000),
]


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
        prog="slot-perf-budget",
        description="Time analytical_rtp + mc_simulate for a curated kernel set.",
    )
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--reps", type=int, default=3)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    entries = []
    for module_name, params_kwargs, ana_budget, mc_budget, mc_spins in DEFAULT_BUDGET:
        try:
            mod, params = _build_params(module_name, params_kwargs)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"could not build {module_name}: {e}\n")
            continue
        ana = mod.analytical_rtp
        mc = mod.mc_simulate
        entries.append(measure(
            f"{module_name.split('.')[-1]}::analytical_rtp",
            lambda: ana(params), ana_budget, reps=args.reps,
        ))
        entries.append(measure(
            f"{module_name.split('.')[-1]}::mc_simulate({mc_spins})",
            lambda spins=mc_spins: mc(params, spins=spins, seed=42),
            mc_budget, reps=args.reps,
        ))

    report = run_budget(entries)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ PASS" if report.passed else "🔴 FAIL"
        sys.stdout.write(f"\n[perf-budget] {verdict}  n={len(report.entries)}  failed={report.n_failed}\n")
        for e in report.entries:
            tag = "✅" if e.passed else "🔴"
            sys.stdout.write(
                f"  {tag} {e.label:60s}  {e.elapsed_ms:8.2f}ms / {e.budget_ms:8.2f}ms\n"
            )
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
