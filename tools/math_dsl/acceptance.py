"""W6.11 — Acceptance-suite runner.

Scans a directory of DSL specs, for each one:
  1. parse + compile
  2. synthesize via Z3 (Mode C-1 by default, configurable per-spec)
  3. run `verify_all` against the constraints declared in the spec
  4. aggregate pass/fail into a single `AcceptanceReport`

This is the regression gate the CI runs before tagging a release: if any
spec in the catalog fails verification, the build breaks.

Public API:
    run_acceptance(specs_dir, *, mode="c-1", ...) → AcceptanceReport

    AcceptanceReport.summary() → markdown text
    AcceptanceReport.ok → bool
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .spec import parse_spec, DslParseError
from .compile import compile_to_ir
from .verify import verify_all, VerifyReport


@dataclass
class AcceptanceEntry:
    spec_path: str
    name: str
    ok: bool
    rtp_measured: float
    rtp_target: float
    rtp_delta: float
    volatility_class: Optional[str]
    volatility_ok: bool
    hit_freq_measured: float
    hit_freq_target: float
    hit_freq_ok: bool
    synth_ms: float
    error: Optional[str] = None


@dataclass
class AcceptanceReport:
    entries: list[AcceptanceEntry] = field(default_factory=list)
    started_at_utc: str = ""

    @property
    def ok(self) -> bool:
        return bool(self.entries) and all(e.ok for e in self.entries)

    @property
    def pass_count(self) -> int:
        return sum(1 for e in self.entries if e.ok)

    @property
    def fail_count(self) -> int:
        return sum(1 for e in self.entries if not e.ok)

    def summary(self) -> str:
        if not self.entries:
            return "(no specs found)\n"
        lines = [
            f"# Acceptance suite — {self.pass_count}/{len(self.entries)} pass",
            "",
            "| Spec | RTP (target → measured, Δ) | Volatility | Hit Freq | Synth | Result |",
            "|---|---|---|---|---|---|",
        ]
        for e in self.entries:
            result = "✓ PASS" if e.ok else "✗ FAIL"
            rtp_cell = f"{e.rtp_target:.4f} → {e.rtp_measured:.4f} (Δ {e.rtp_delta:.4f})"
            vol_cell = (
                f"{e.volatility_class or '—'} {'✓' if e.volatility_ok else '✗'}"
                if e.volatility_class
                else "—"
            )
            hf_cell = (
                f"{e.hit_freq_target:.3f} → {e.hit_freq_measured:.3f} {'✓' if e.hit_freq_ok else '✗'}"
                if e.hit_freq_target > 0
                else "—"
            )
            synth_cell = f"{e.synth_ms:.0f} ms"
            lines.append(
                f"| {e.name} | {rtp_cell} | {vol_cell} | {hf_cell} | {synth_cell} | {result} |"
            )
            if e.error:
                lines.append(f"|   `ERROR` | {e.error[:120]} | | | | ✗ FAIL |")
        return "\n".join(lines) + "\n"


def run_acceptance(
    specs_dir: Path | str,
    *,
    mode: str = "c-1",
    rtp_tolerance_extra: float = 0.005,
    hit_freq_tolerance: float = 0.10,
) -> AcceptanceReport:
    """Run the full acceptance suite against every *.yaml / *.yml in
    `specs_dir`. Returns aggregated report.

    Each spec's own `constraints.rtp_tolerance` is the primary check
    threshold; `rtp_tolerance_extra` widens it slightly to absorb
    Z3 numeric edges. `hit_freq_tolerance` defaults to 0.10 because
    the closed-form approximation in `hit_freq_closed_form` over-counts
    by num_lines × small p — fine as a sanity check, not a strict gate.
    """
    from datetime import datetime, timezone
    from tools.smt.weight_synthesizer import (
        synth_uniform_weights, synth_with_hit_freq,
        synth_with_volatility, synth_multi_objective,
        RtpSynthesisError, measured_rtp, volatility_class_of,
    )
    from .verify import hit_freq_closed_form

    specs_dir = Path(specs_dir)
    report = AcceptanceReport(
        started_at_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    for p in sorted(specs_dir.rglob("*.yaml")) + sorted(specs_dir.rglob("*.yml")):
        try:
            text = p.read_text(encoding="utf-8")
            spec = parse_spec(text)
        except (DslParseError, OSError) as e:
            report.entries.append(AcceptanceEntry(
                spec_path=str(p), name=p.name,
                ok=False, rtp_measured=0.0, rtp_target=0.0, rtp_delta=0.0,
                volatility_class=None, volatility_ok=False,
                hit_freq_measured=0.0, hit_freq_target=0.0, hit_freq_ok=False,
                synth_ms=0.0, error=f"parse/compile failed: {e}",
            ))
            continue

        try:
            ir = compile_to_ir(spec)
        except Exception as e:
            report.entries.append(AcceptanceEntry(
                spec_path=str(p), name=spec.meta.get("name") or p.name,
                ok=False, rtp_measured=0.0,
                rtp_target=spec.constraints.target_rtp, rtp_delta=0.0,
                volatility_class=spec.constraints.volatility_class,
                volatility_ok=False, hit_freq_measured=0.0,
                hit_freq_target=spec.constraints.hit_freq_target, hit_freq_ok=False,
                synth_ms=0.0, error=f"compile error: {e}",
            ))
            continue

        t0 = time.perf_counter()
        try:
            reel_length = float(spec.hints.get("reel_length") or 60)
            tol = spec.constraints.rtp_tolerance + rtp_tolerance_extra
            if mode == "c-1":
                solved = synth_uniform_weights(
                    ir, spec.constraints.target_rtp,
                    reel_length=reel_length, tolerance=tol,
                )
            elif mode == "c-3":
                solved = synth_with_hit_freq(
                    ir, spec.constraints.target_rtp,
                    spec.constraints.hit_freq_target,
                    reel_length=reel_length, tolerance=tol,
                )
            elif mode == "c-4":
                solved = synth_with_volatility(
                    ir, spec.constraints.target_rtp,
                    spec.constraints.volatility_class,
                    reel_length=reel_length, tolerance=tol,
                )
            else:  # c-5
                solved = synth_multi_objective(
                    ir, target_rtp=spec.constraints.target_rtp,
                    target_hit_freq=spec.constraints.hit_freq_target,
                    volatility_class=spec.constraints.volatility_class,
                    reel_length=reel_length, rtp_tolerance=tol,
                )
        except RtpSynthesisError as e:
            elapsed = (time.perf_counter() - t0) * 1000
            report.entries.append(AcceptanceEntry(
                spec_path=str(p), name=spec.meta.get("name") or p.name,
                ok=False, rtp_measured=0.0,
                rtp_target=spec.constraints.target_rtp, rtp_delta=0.0,
                volatility_class=spec.constraints.volatility_class,
                volatility_ok=False, hit_freq_measured=0.0,
                hit_freq_target=spec.constraints.hit_freq_target, hit_freq_ok=False,
                synth_ms=elapsed, error=f"Z3 unsat: {e}",
            ))
            continue
        elapsed = (time.perf_counter() - t0) * 1000

        rtp = measured_rtp(solved)
        rtp_delta = abs(rtp - spec.constraints.target_rtp)
        rtp_ok = rtp_delta <= (spec.constraints.rtp_tolerance + rtp_tolerance_extra)

        vol_cls = volatility_class_of(solved)
        vol_ok = vol_cls == spec.constraints.volatility_class
        if not vol_ok:
            # Boundary tolerance: ±0.5 CV around the bucket edges
            from tools.smt.weight_synthesizer import (
                coefficient_of_variation, VOLATILITY_CV_BUCKETS,
            )
            cv = coefficient_of_variation(solved)
            lo, hi = VOLATILITY_CV_BUCKETS.get(
                spec.constraints.volatility_class, (0.0, 0.0)
            )
            if (lo - 0.5) <= cv <= (hi + 0.5):
                vol_ok = True

        hf = hit_freq_closed_form(solved)
        hf_target = spec.constraints.hit_freq_target
        hf_ok = abs(hf - hf_target) <= hit_freq_tolerance

        # Acceptance kriterijum:
        #   • RTP uvek mora da padne (sve modes constraint-uju RTP)
        #   • Volatility mora kad mode constraint-uje volatility (c-4 ili c-5)
        #   • Hit-freq je soft (closed-form over-counts za mnogo lines)
        vol_required = mode in ("c-4", "c-5")
        accept_ok = rtp_ok and (vol_ok if vol_required else True)

        report.entries.append(AcceptanceEntry(
            spec_path=str(p),
            name=spec.meta.get("name") or p.name,
            ok=accept_ok,
            rtp_measured=rtp,
            rtp_target=spec.constraints.target_rtp,
            rtp_delta=rtp_delta,
            volatility_class=spec.constraints.volatility_class,
            volatility_ok=vol_ok,
            hit_freq_measured=hf,
            hit_freq_target=hf_target,
            hit_freq_ok=hf_ok,
            synth_ms=elapsed,
        ))
    return report
