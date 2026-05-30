"""W244 wave 43 — kernel-level lint pass.

Komplementaran W8 DSL spec lint (`tools/math_dsl/lint.py`). Ovaj
proverava strukturu samih kernel modula u `tools/math_dsl/`, hvata
designer-side typo greške BEFORE acceptance tests fire:

  KLINT001  error    — kernel module file missing
  KLINT002  error    — import fails (syntax / dep error)
  KLINT003  error    — no *_rtp() / *_audit() entry point
  KLINT004  error    — Params class has probability fields but no
                       __post_init__ validator
  KLINT005  error    — `def _init_` found (typo for `__post_init__`)
  KLINT006  warning  — Params dataclass without __post_init__ validator
  KLINT007  warning  — no Params/Spec dataclass found
  KLINT008  warning  — module docstring missing
  KLINT009  info     — module docstring short (< 100 chars)
  KLINT010  info     — pay_table field but no class docstring explaining
                       K → pay convention

Run:  python -m tools.math_dsl.kernel_lint
Exit: 0 ok, 1 if any blocking finding (error severity).

Pure-stdlib (ast + importlib).
"""
from __future__ import annotations

import ast
import importlib
import inspect
from dataclasses import fields, is_dataclass
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
MATH_DSL_DIR = REPO / "tools" / "math_dsl"


# Kernel-bearing modules (exclude pure tooling like compile, audit, etc.).
KERNEL_MODULES = [
    "asymmetric_paytable",
    "both_ways",
    "buy_feature",
    "cascade",
    "charge_meter",
    "cluster_pays",
    "crash_kernel",
    "expanding_symbol",
    "hold_and_win",
    "money_collect",
    "must_hit_by",
    "pay_anywhere",
    "persistent_multiplier",
    "pick_chain",
    "showcase_game",
    "stacked_wilds",
    "state_machine",
    "sticky_wilds",
    "ways_evaluator",
    "wheel",
    # Solver / helper modules (no Params class — checked accordingly)
    "inverse_solver",
    "multi_dim_inverse_solver",
]


class Finding:
    def __init__(
        self, severity: str, rule_id: str, kernel: str,
        message: str, location: str = "",
    ):
        self.severity = severity  # "error" | "warning" | "info"
        self.rule_id = rule_id
        self.kernel = kernel
        self.message = message
        self.location = location

    def __str__(self) -> str:
        loc = f" [{self.location}]" if self.location else ""
        return f"[{self.severity.upper()}] {self.rule_id} {self.kernel}: {self.message}{loc}"

    def to_dict(self) -> dict[str, str]:
        return {
            "severity": self.severity,
            "rule_id": self.rule_id,
            "kernel": self.kernel,
            "message": self.message,
            "location": self.location,
        }


# ─── Discovery helpers ──────────────────────────────────────────────────


def _discover_params_class(module: Any) -> type | None:
    for name in dir(module):
        if not (name.endswith("Params") or name.endswith("Spec")):
            continue
        obj = getattr(module, name)
        if inspect.isclass(obj) and is_dataclass(obj):
            return obj
    return None


def _discover_rtp_callables(module: Any) -> list[str]:
    out = []
    for name in dir(module):
        if name.startswith("_"):
            continue
        obj = getattr(module, name)
        if not callable(obj) or inspect.isclass(obj):
            continue
        if ("_rtp" in name) or name.endswith("_audit") or name in (
            "closed_form_total_rtp",
            "newton_raphson_1d", "bisection_1d", "newton_raphson_nd",
        ):
            out.append(name)
    return out


def _is_solver_module(name: str) -> bool:
    return name in {"inverse_solver", "multi_dim_inverse_solver"}


# ─── Checks ─────────────────────────────────────────────────────────────


def _check_dunder_underscore_init(
    kernel: str, source: str, findings: list[Finding]
) -> None:
    """KLINT005 — `def _init_` typo (would silently skip __post_init__)."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # Caught by KLINT002 later
        return
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_init_":
            findings.append(Finding(
                "error", "KLINT005", kernel,
                "found `def _init_` (single underscore) — typo for `__post_init__`",
                location=f"line {node.lineno}",
            ))


def _check_module(kernel: str, findings: list[Finding]) -> None:
    py_path = MATH_DSL_DIR / f"{kernel}.py"
    if not py_path.exists():
        findings.append(Finding(
            "error", "KLINT001", kernel, f"file not found: {py_path}",
        ))
        return

    source = py_path.read_text(encoding="utf-8")
    _check_dunder_underscore_init(kernel, source, findings)

    try:
        module = importlib.import_module(f"tools.math_dsl.{kernel}")
    except Exception as exc:
        findings.append(Finding(
            "error", "KLINT002", kernel,
            f"import failed: {type(exc).__name__}: {exc}",
        ))
        return

    # KLINT008/009 — docstring
    doc = (module.__doc__ or "").strip()
    if not doc:
        findings.append(Finding(
            "warning", "KLINT008", kernel, "no module docstring",
        ))
    elif len(doc) < 100:
        findings.append(Finding(
            "info", "KLINT009", kernel,
            f"module docstring is short ({len(doc)} chars)",
        ))

    # KLINT003 — *_rtp() / *_audit() / solver entry point exists
    fns = _discover_rtp_callables(module)
    if not fns:
        findings.append(Finding(
            "error", "KLINT003", kernel,
            "no *_rtp() / *_audit() / solver callable — kernel can't be invoked",
        ))

    # Params class checks (solver modules don't have one — that's OK)
    params_cls = _discover_params_class(module)
    if not params_cls:
        if _is_solver_module(kernel):
            # Solver modules don't need Params (they're functional)
            pass
        else:
            findings.append(Finding(
                "warning", "KLINT007", kernel, "no Params/Spec dataclass found",
            ))
        return

    has_post_init = "__post_init__" in vars(params_cls)
    if not has_post_init:
        findings.append(Finding(
            "warning", "KLINT006", kernel,
            f"{params_cls.__name__} has no __post_init__ validator",
            location=f"class {params_cls.__name__}",
        ))

    # KLINT004 — probability fields without validator
    prob_fields = [
        f for f in fields(params_cls)
        if f.name.startswith("p_") or f.name.endswith("_p")
        or "probability" in f.name
    ]
    if prob_fields and not has_post_init:
        names = ", ".join(f.name for f in prob_fields)
        findings.append(Finding(
            "error", "KLINT004", kernel,
            f"probability fields {names} but no __post_init__ to bound-check",
            location=f"class {params_cls.__name__}",
        ))

    # KLINT010 — pay_table without class docstring
    has_pay_table = any(
        f.name in ("pay_table", "pay_per_wild_count", "value_table")
        for f in fields(params_cls)
    )
    cls_doc = (params_cls.__doc__ or "").strip()
    if has_pay_table and not cls_doc:
        findings.append(Finding(
            "info", "KLINT010", kernel,
            f"{params_cls.__name__} carries pay_table but no docstring",
        ))


# ─── Orchestrator ───────────────────────────────────────────────────────


def lint_all() -> tuple[list[Finding], int]:
    """Run lint across all known kernels. Returns (findings, exit_code)."""
    findings: list[Finding] = []
    for kernel in KERNEL_MODULES:
        _check_module(kernel, findings)
    errors = sum(1 for f in findings if f.severity == "error")
    return findings, (1 if errors > 0 else 0)


def main() -> int:
    findings, exit_code = lint_all()
    if not findings:
        print(f"[w244-kernel-lint] All {len(KERNEL_MODULES)} kernel modules pass.")
        return 0

    severity_count: dict[str, int] = {}
    for f in findings:
        severity_count[f.severity] = severity_count.get(f.severity, 0) + 1
        print(str(f))

    print()
    print("[w244-kernel-lint] Summary:")
    for sev in ("error", "warning", "info"):
        print(f"  {sev}: {severity_count.get(sev, 0)}")
    print(f"  kernels checked: {len(KERNEL_MODULES)}")
    print(f"  exit code: {exit_code}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
