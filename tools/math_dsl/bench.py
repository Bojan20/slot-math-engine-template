"""W9.4 — Performance benchmark of the math compiler.

Measures end-to-end latency for the pipeline stages on a fixed corpus
of specs. Useful for:
  • CI regression: did the last Z3 refactor double synth time?
  • Sales pitch: "we can re-balance 50 games per minute in our
    backoffice" (concrete numbers)
  • Provisioning: how much CPU does a designer's iteration loop need?

Bench report shape:
    BenchReport
      ├ entries: [BenchEntry per spec]
      └ summary(): markdown table with median + std-dev per stage

Stages measured:
  parse_ms / compile_ms / synth_c1_ms / sign_ms / cert_bundle_ms / mc_100k_ms

All numbers in milliseconds. Each stage timed across `repeats` runs
with `statistics.median` to dampen jitter.
"""

from __future__ import annotations

import statistics
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .spec import parse_spec


@dataclass
class BenchEntry:
    spec_name: str
    parse_ms: float = 0.0
    compile_ms: float = 0.0
    synth_c1_ms: float = 0.0
    sign_ms: float = 0.0
    mc_100k_ms: float = 0.0


@dataclass
class BenchReport:
    entries: list[BenchEntry] = field(default_factory=list)
    repeats: int = 3

    def median_across_specs(self, stage: str) -> float:
        vals = [getattr(e, stage) for e in self.entries]
        if not vals:
            return 0.0
        return float(statistics.median(vals))

    def summary(self) -> str:
        if not self.entries:
            return "(no bench entries)\n"
        lines = [
            f"# Performance benchmark (median over {self.repeats} runs)",
            "",
            "| Spec | parse | compile | synth C-1 | sign | mc 100k |",
            "|---|---|---|---|---|---|",
        ]
        for e in self.entries:
            lines.append(
                f"| {e.spec_name} | "
                f"{e.parse_ms:.2f} ms | {e.compile_ms:.2f} ms | "
                f"{e.synth_c1_ms:.1f} ms | {e.sign_ms:.2f} ms | "
                f"{e.mc_100k_ms:.0f} ms |"
            )
        lines.append("")
        lines.append("## Aggregate median across all specs")
        lines.append("")
        lines.append("| Stage | Median |")
        lines.append("|---|---|")
        for stage in ("parse_ms", "compile_ms", "synth_c1_ms", "sign_ms", "mc_100k_ms"):
            lines.append(f"| {stage} | {self.median_across_specs(stage):.2f} ms |")
        return "\n".join(lines) + "\n"


def _time(fn, *args, repeats: int = 3, **kwargs) -> tuple[object, float]:
    """Run `fn` `repeats` times, return (last_result, median_ms)."""
    times: list[float] = []
    result = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        result = fn(*args, **kwargs)
        times.append((time.perf_counter() - t0) * 1000.0)
    return result, statistics.median(times)


def bench_corpus(
    specs_dir: Path | str,
    *,
    repeats: int = 3,
    include_mc: bool = True,
    mc_spins: int = 50_000,
) -> BenchReport:
    """Run the benchmark over every *.yaml in `specs_dir`. Returns
    `BenchReport` with per-spec timings + per-stage medians.
    """
    from .compile import compile_to_ir
    from .provenance import sign_and_inject_provenance
    from tools.smt.weight_synthesizer import synth_uniform_weights

    specs_dir = Path(specs_dir)
    report = BenchReport(repeats=repeats)

    for p in sorted(specs_dir.rglob("*.yaml")) + sorted(specs_dir.rglob("*.yml")):
        text = p.read_text(encoding="utf-8")
        entry = BenchEntry(spec_name=p.stem)

        # parse
        spec, t = _time(parse_spec, text, repeats=repeats)
        entry.parse_ms = t

        # compile
        ir, t = _time(compile_to_ir, spec, repeats=repeats)
        entry.compile_ms = t

        # synth C-1 (single run, since cache could distort repeats)
        target = spec.constraints.target_rtp
        reel_length = float(spec.hints.get("reel_length") or 60)
        t0 = time.perf_counter()
        try:
            solved = synth_uniform_weights(
                ir, target, reel_length=reel_length,
                tolerance=spec.constraints.rtp_tolerance + 0.005,
            )
            entry.synth_c1_ms = (time.perf_counter() - t0) * 1000
        except Exception:
            entry.synth_c1_ms = -1.0
            report.entries.append(entry)
            continue

        # sign
        _, t = _time(sign_and_inject_provenance, solved,
                     vendor="bench", par_source=str(p), repeats=repeats)
        entry.sign_ms = t

        # mc validate (single run, deterministic seed)
        if include_mc:
            from .mc_validate import mc_validate
            t0 = time.perf_counter()
            mc_validate(solved, spins=mc_spins, seed=42)
            entry.mc_100k_ms = (time.perf_counter() - t0) * 1000
        else:
            entry.mc_100k_ms = 0.0

        report.entries.append(entry)

    return report
