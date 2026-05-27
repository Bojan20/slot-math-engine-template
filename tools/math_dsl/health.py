"""W8.4 — Spec health check (combined lint + dry-run synth).

Designer-facing one-command sanity check before committing a spec:
  1. Lint pass (errors break the build)
  2. Compile to IR (catches structural problems lint missed)
  3. Dry-run Z3 synth (does the solver find ANY feasible weight set?
     Important for tight constraints — saves designer minutes vs running
     full acceptance suite)
  4. Aggregate PASS / WARN / FAIL with explanatory reason

Returns `HealthReport` dataclass + markdown summary.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from .spec import MathDslSpec
from .compile import compile_to_ir, CompileError
from .lint import lint_spec, LintFinding


@dataclass
class HealthCheck:
    name: str
    ok: bool
    severity: str  # error | warning | info
    detail: str
    elapsed_ms: float = 0.0


@dataclass
class HealthReport:
    spec_name: str
    checks: list[HealthCheck] = field(default_factory=list)
    lint_findings: list[LintFinding] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks if c.severity == "error")

    def summary(self) -> str:
        lines = [
            f"# Health check — {self.spec_name}",
            "Overall: " + ("PASS ✓" if self.ok else "FAIL ✗"),
            "",
            "| Check | Result | Severity | Detail | Elapsed |",
            "|---|---|---|---|---|",
        ]
        for c in self.checks:
            sym = "✓" if c.ok else "✗"
            lines.append(
                f"| {c.name} | {sym} | {c.severity} | {c.detail} | {c.elapsed_ms:.0f} ms |"
            )
        if self.lint_findings:
            lines.append("")
            lines.append("## Lint findings\n")
            from .lint import render_lint
            lines.append(render_lint(self.lint_findings))
        return "\n".join(lines) + "\n"


def health_check(
    spec: MathDslSpec,
    *,
    dry_run_synth: bool = True,
    timeout_ms: int = 10_000,
) -> HealthReport:
    """Run the full health check pipeline against `spec`."""
    report = HealthReport(spec_name=spec.meta.get("name") or "(unnamed)")

    # 1) Lint
    t0 = time.perf_counter()
    findings = lint_spec(spec)
    elapsed = (time.perf_counter() - t0) * 1000
    report.lint_findings = findings
    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warning"]
    report.checks.append(HealthCheck(
        name="lint",
        ok=len(errors) == 0,
        severity="error" if errors else ("warning" if warnings else "info"),
        detail=(
            f"{len(errors)} error(s), {len(warnings)} warning(s)"
            if findings else "0 findings"
        ),
        elapsed_ms=elapsed,
    ))

    # 2) Compile (catches issues lint missed — bad types, ill-formed IR)
    t0 = time.perf_counter()
    ir = None
    try:
        ir = compile_to_ir(spec)
        report.checks.append(HealthCheck(
            name="compile",
            ok=True,
            severity="info",
            detail=f"emitted SlotGameIR with {len(ir['symbols'])} symbols",
            elapsed_ms=(time.perf_counter() - t0) * 1000,
        ))
    except CompileError as e:
        report.checks.append(HealthCheck(
            name="compile",
            ok=False,
            severity="error",
            detail=f"compile error: {e}",
            elapsed_ms=(time.perf_counter() - t0) * 1000,
        ))
        return report   # can't proceed without IR

    # 3) Dry-run Z3 synth (fastest mode = C-1 uniform)
    if dry_run_synth and ir is not None:
        t0 = time.perf_counter()
        try:
            from tools.smt.weight_synthesizer import (
                synth_uniform_weights, RtpSynthesisError, measured_rtp,
            )
            reel_length = float(spec.hints.get("reel_length") or 60)
            tol = spec.constraints.rtp_tolerance + 0.005
            solved = synth_uniform_weights(
                ir, spec.constraints.target_rtp,
                reel_length=reel_length, tolerance=tol,
                timeout_ms=timeout_ms,
            )
            rtp_post = measured_rtp(solved)
            delta = abs(rtp_post - spec.constraints.target_rtp)
            report.checks.append(HealthCheck(
                name="z3_dry_run_C-1",
                ok=delta <= (spec.constraints.rtp_tolerance + 0.005),
                severity="error" if delta > 0.05 else "info",
                detail=(
                    f"target {spec.constraints.target_rtp:.4f}, "
                    f"solved RTP {rtp_post:.4f}, Δ {delta:.4f}"
                ),
                elapsed_ms=(time.perf_counter() - t0) * 1000,
            ))
        except RtpSynthesisError as e:
            report.checks.append(HealthCheck(
                name="z3_dry_run_C-1",
                ok=False,
                severity="error",
                detail=f"Z3 unsat: {e}",
                elapsed_ms=(time.perf_counter() - t0) * 1000,
            ))

    return report
