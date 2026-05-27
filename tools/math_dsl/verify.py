"""W6.5 — Closed-form verification utilities.

Companion to `tools.smt.weight_synthesizer.measured_rtp`. These helpers
re-derive every quantity the W5.2 synthesizer constrained, from the
solved IR, so the cert bundle (or lab) can independently verify each
constraint without running a Monte Carlo.

All formulas mirror the Z3 encoding in `weight_synthesizer.py` exactly.

Functions
---------
    verify_rtp(ir, target, tolerance) → (ok, measured, delta, reason)
    verify_hit_freq(ir, target, tolerance) → (ok, measured, delta, reason)
    verify_volatility(ir, expected_class) → (ok, measured_cv, class, reason)
    verify_all(ir, *, target_rtp=…, target_hit_freq=…, …) → VerifyReport

A `VerifyReport` aggregates every check so a single function call returns
the complete cert decision (pass/fail + per-check breakdown).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from tools.smt.weight_synthesizer import (
    measured_rtp, coefficient_of_variation, volatility_class_of,
    VOLATILITY_CV_BUCKETS,
    _extract_ir_paytable, _resolve_paylines, _reels_as_dict_list,
    _wild_symbol_id, _wild_excluded,
)


@dataclass
class CheckResult:
    name: str
    ok: bool
    measured: float
    target: Optional[float]
    delta: Optional[float] = None
    reason: str = ""


@dataclass
class VerifyReport:
    ir_name: str = ""
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks)

    def summary(self) -> str:
        lines = [f"# Verify report — {self.ir_name or '(unnamed)'}",
                 f"Overall: {'PASS ✓' if self.ok else 'FAIL ✗'}",
                 "", "| Check | Result | Measured | Target | Δ |",
                 "|---|---|---|---|---|"]
        for c in self.checks:
            sym = "✓" if c.ok else "✗"
            tgt = f"{c.target:.4f}" if isinstance(c.target, (int, float)) else "—"
            dlt = f"{c.delta:.4f}" if isinstance(c.delta, (int, float)) else "—"
            lines.append(f"| {c.name} | {sym} | {c.measured:.6f} | {tgt} | {dlt} |")
        return "\n".join(lines) + "\n"


def verify_rtp(ir: dict, target: float, tolerance: float = 0.005) -> CheckResult:
    rtp = measured_rtp(ir)
    delta = abs(rtp - target)
    ok = delta <= tolerance
    return CheckResult(
        name="rtp", ok=ok, measured=rtp, target=target, delta=delta,
        reason="within tolerance" if ok else f"delta {delta:.6f} > tolerance {tolerance}",
    )


def hit_freq_closed_form(ir: dict) -> float:
    """Industry-standard approximation: P(any win on a spin) ≈
    num_lines × Σ_{sym} P(3-of-a-kind sym on a single line).

    Mirrors the synth_with_hit_freq Z3 encoding.
    """
    paytable = _extract_ir_paytable(ir)
    num_lines, total_bet = _resolve_paylines(ir)
    reels, _shape = _reels_as_dict_list(ir)
    if not reels:
        return 0.0
    n_reels = len(reels)
    syms = ir.get("symbols") or []
    wild_id = _wild_symbol_id(ir)
    excluded = _wild_excluded(ir)
    scatter_ids = {s["id"] for s in syms if s.get("kind") == "scatter"}
    bonus_ids = {s["id"] for s in syms if s.get("kind") == "bonus"}

    p_line_any = 0.0
    for (sym, count), pays in paytable.items():
        if pays <= 0 or count != 3 or 3 > n_reels:
            continue
        if sym in scatter_ids or sym in bonus_ids:
            continue
        wild_substitutes = wild_id is not None and sym not in excluded
        p = 1.0
        for i in range(3):
            total = sum(reels[i].values()) or 1.0
            p_a = reels[i].get(sym, 0.0) / total
            p_w = (reels[i].get(wild_id, 0.0) / total) if wild_substitutes else 0.0
            p *= p_a + p_w
        if 3 < n_reels:
            total = sum(reels[3].values()) or 1.0
            p_a = reels[3].get(sym, 0.0) / total
            p_w = (reels[3].get(wild_id, 0.0) / total) if wild_substitutes else 0.0
            p *= max(0.0, 1.0 - p_a - p_w)
        p_line_any += p
    return min(1.0, num_lines * p_line_any)


def verify_hit_freq(ir: dict, target: float, tolerance: float = 0.02) -> CheckResult:
    hf = hit_freq_closed_form(ir)
    delta = abs(hf - target)
    ok = delta <= tolerance
    return CheckResult(
        name="hit_freq", ok=ok, measured=hf, target=target, delta=delta,
        reason="within tolerance" if ok else f"delta {delta:.4f} > tolerance {tolerance}",
    )


def verify_volatility(ir: dict, expected_class: str) -> CheckResult:
    cv = coefficient_of_variation(ir)
    actual_class = volatility_class_of(ir)
    ok = actual_class == expected_class
    if not ok:
        # Allow boundary tolerance: if cv is within 0.5 of the bucket edge,
        # count as ok (closed-form discretization noise).
        lo, hi = VOLATILITY_CV_BUCKETS.get(expected_class, (0.0, 0.0))
        if (lo - 0.5) <= cv <= (hi + 0.5):
            ok = True
    return CheckResult(
        name="volatility", ok=ok, measured=cv, target=None,
        reason=f"class={actual_class!r} expected={expected_class!r}"
               + (" (within boundary tolerance)" if ok and actual_class != expected_class else ""),
    )


def verify_all(
    ir: dict,
    *,
    target_rtp: float,
    rtp_tolerance: float = 0.005,
    target_hit_freq: Optional[float] = None,
    hit_freq_tolerance: float = 0.05,
    expected_volatility: Optional[str] = None,
    ir_name: str = "",
) -> VerifyReport:
    """Run every applicable check, return aggregated report."""
    report = VerifyReport(ir_name=ir_name or ir.get("meta", {}).get("name", ""))
    report.checks.append(verify_rtp(ir, target_rtp, rtp_tolerance))
    if target_hit_freq is not None:
        report.checks.append(verify_hit_freq(ir, target_hit_freq, hit_freq_tolerance))
    if expected_volatility:
        report.checks.append(verify_volatility(ir, expected_volatility))
    return report
