"""W8.5 — Stress-test Z3 synth across volatility classes.

For a given spec + base topology, run Mode C-4 against each of the
4 volatility buckets (low / medium / high / ultra) and report:
  • which buckets are reachable for the same target RTP
  • measured CV for each successful solve
  • per-bucket synth elapsed time

Use cases
=========
- Sales: "what's the range of game personas we can ship from one IR shape?"
- Designer: "is this spec's RTP target compatible with high volatility?"
- Compliance: "prove the same IR can be jurisdictioned for both
  low-volatility (UK B3 fruit machine) and high-volatility (MGA online)."
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from .spec import MathDslSpec
from .compile import compile_to_ir


@dataclass
class StressRow:
    volatility_class: str
    ok: bool
    measured_rtp: float
    measured_cv: float
    rtp_delta: float
    synth_ms: float
    reason: str = ""


@dataclass
class StressReport:
    spec_name: str
    target_rtp: float
    rows: list[StressRow] = field(default_factory=list)

    @property
    def reachable_classes(self) -> list[str]:
        return [r.volatility_class for r in self.rows if r.ok]

    def summary(self) -> str:
        lines = [
            f"# Stress synth report — {self.spec_name}",
            f"target_rtp: {self.target_rtp:.4f}",
            f"reachable classes: {', '.join(self.reachable_classes) or '(none)'}",
            "",
            "| Volatility | OK | Measured RTP | Δ RTP | Measured CV | Synth |",
            "|---|---|---|---|---|---|",
        ]
        for r in self.rows:
            sym = "✓" if r.ok else "✗"
            lines.append(
                f"| {r.volatility_class} | {sym} | {r.measured_rtp:.6f} | "
                f"{r.rtp_delta:.4f} | {r.measured_cv:.3f} | {r.synth_ms:.0f} ms |"
            )
            if r.reason:
                lines.append(f"|  └ reason | | {r.reason[:80]} | | | |")
        return "\n".join(lines) + "\n"


def stress_synth(
    spec: MathDslSpec,
    *,
    reel_length_override: Optional[float] = None,
    timeout_ms_per_class: int = 30_000,
) -> StressReport:
    """Run Mode C-4 against every volatility bucket for `spec`. The
    spec's own target_rtp + rtp_tolerance are honored. Returns
    `StressReport` with one `StressRow` per class.
    """
    from tools.smt.weight_synthesizer import (
        synth_with_volatility, RtpSynthesisError,
        measured_rtp, coefficient_of_variation, VOLATILITY_CV_BUCKETS,
    )
    ir = compile_to_ir(spec)
    report = StressReport(
        spec_name=spec.meta.get("name") or "(unnamed)",
        target_rtp=spec.constraints.target_rtp,
    )
    reel_length = reel_length_override or float(spec.hints.get("reel_length") or 60)
    tol = spec.constraints.rtp_tolerance + 0.005

    for vol_class in VOLATILITY_CV_BUCKETS:
        t0 = time.perf_counter()
        try:
            solved = synth_with_volatility(
                ir, spec.constraints.target_rtp, vol_class,
                reel_length=reel_length, tolerance=tol,
                timeout_ms=timeout_ms_per_class,
            )
            elapsed = (time.perf_counter() - t0) * 1000
            rtp = measured_rtp(solved)
            cv = coefficient_of_variation(solved)
            delta = abs(rtp - spec.constraints.target_rtp)
            report.rows.append(StressRow(
                volatility_class=vol_class,
                ok=delta <= tol,
                measured_rtp=rtp,
                measured_cv=cv,
                rtp_delta=delta,
                synth_ms=elapsed,
            ))
        except RtpSynthesisError as e:
            elapsed = (time.perf_counter() - t0) * 1000
            report.rows.append(StressRow(
                volatility_class=vol_class,
                ok=False,
                measured_rtp=0.0,
                measured_cv=0.0,
                rtp_delta=0.0,
                synth_ms=elapsed,
                reason=str(e)[:200],
            ))
    return report
