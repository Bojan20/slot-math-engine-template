#!/usr/bin/env python3
"""W244 wave 55 — regenerate `packages/slot-math-kernels/API_SURFACE.json`.

Walks the vendored slot_math_kernels package and dumps a JSON snapshot
of the public API surface (dataclass field lists + function param lists).

This snapshot is the source of truth for the `test_w244_pypi_api_contract`
gate. Run after intentionally changing any kernel signature.

Usage:
  python3 tools/refresh_api_surface.py
  git diff packages/slot-math-kernels/API_SURFACE.json   # review carefully
  # If breaking: bump MAJOR in pyproject.toml + document in CHANGELOG.md
"""
from __future__ import annotations

import importlib
import importlib.util
import inspect
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG_SRC = ROOT / "packages" / "slot-math-kernels" / "src"
OUT = ROOT / "packages" / "slot-math-kernels" / "API_SURFACE.json"


def main() -> int:
    sys.path.insert(0, str(PKG_SRC))
    # Force re-import in case of stale modules
    for k in list(sys.modules):
        if k.startswith("slot_math_kernels"):
            del sys.modules[k]
    smk = importlib.import_module("slot_math_kernels")

    surface: dict[str, dict] = {}
    for mod_name in smk.__all__:
        mod = getattr(smk, mod_name)
        functions: dict[str, list[str]] = {}
        classes: dict[str, list[str]] = {}
        for name in dir(mod):
            if name.startswith("_"):
                continue
            obj = getattr(mod, name)
            # Skip imports — only public members defined in this module
            if hasattr(obj, "__module__") and obj.__module__ != mod.__name__:
                continue
            if inspect.isfunction(obj):
                try:
                    params = list(inspect.signature(obj).parameters.keys())
                    functions[name] = params
                except (ValueError, TypeError):
                    pass
            elif inspect.isclass(obj) and hasattr(obj, "__dataclass_fields__"):
                classes[name] = list(obj.__dataclass_fields__.keys())
        surface[mod_name] = {"classes": classes, "functions": functions}

    OUT.write_text(json.dumps(surface, indent=2, sort_keys=True) + "\n")
    print(f"[api-surface] wrote {OUT.relative_to(ROOT)}")
    print(f"  kernels:   {len(surface)}")
    total_fns = sum(len(s["functions"]) for s in surface.values())
    total_cls = sum(len(s["classes"]) for s in surface.values())
    print(f"  functions: {total_fns}")
    print(f"  classes:   {total_cls}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
