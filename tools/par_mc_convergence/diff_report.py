"""SLOT-MATH Faza 3.5 — FAIL diff reporter.

Generates structured + human-readable diff report when MC sweep fails any
metric gate. Output: mc_diff_report.md + suspected-root hint.
"""
from __future__ import annotations

from typing import Any

from tools.par_mc_convergence.compare import ComparisonResult


# Heuristic: failed metric → suspected root cause
_FAILED_METRIC_TO_SUSPECTED_ROOT = {
    "rtp": "PAR paytable mapping bug, kernel composition drift, OR float-stable Welford accumulation issue",
    "hit_freq": "reel-strip mapping bug, or wild substitution wiring mismatch",
    "variance": "feature pay distribution mismapped, or max-win cap not enforced",
    "max_win_x": "max-win cap clamp missing, or feature payout overflow",
    "p99_9_win_x": "rare-event tail underrepresented — needs more seeds or larger tier",
}


def _suspected_root(metric_name: str) -> str:
    # Feature trigger pattern: feature.<kind>.trigger_freq
    if metric_name.startswith("feature.") and metric_name.endswith(".trigger_freq"):
        return "scatter/bonus symbol weight mismapped, or trigger threshold rule off-by-one"
    return _FAILED_METRIC_TO_SUSPECTED_ROOT.get(
        metric_name, "unknown — manual investigation required"
    )


def generate_diff_report(
    result: ComparisonResult,
    game_id: str,
    variant_id: str,
    par: dict[str, Any],
) -> dict[str, Any]:
    """Generate structured diff dict (serialisable to JSON)."""
    failed = result.failed_metrics()
    return {
        "report_type": "mc-sweep-diff",
        "game_id": game_id,
        "variant_id": variant_id,
        "tier": result.tier.value,
        "par_sha256": par.get("merkle_root_sha256", ""),
        "overall_pass": result.overall_pass,
        "failed_count": result.failed_count,
        "cross_seed_cv": result.cross_seed_cv,
        "deltas": [
            {
                "name": d.name,
                "target": d.target,
                "measured": d.measured,
                "delta_abs": d.measured - d.target,
                "delta_rel": (
                    (d.measured - d.target) / d.target if d.target != 0 else 0.0
                ),
                "tolerance": d.tolerance,
                "passed": d.passed,
                "notes": d.notes,
                "wilson_ci": (
                    {
                        "lower": d.wilson_ci.lower,
                        "upper": d.wilson_ci.upper,
                        "confidence": d.wilson_ci.confidence,
                        "n": d.wilson_ci.n,
                    }
                    if d.wilson_ci
                    else None
                ),
                "suspected_root": _suspected_root(d.name) if not d.passed else None,
            }
            for d in result.deltas
        ],
        "failed_metrics": [
            {
                "name": d.name,
                "suspected_root": _suspected_root(d.name),
            }
            for d in failed
        ],
    }


def diff_report_to_markdown(report: dict[str, Any]) -> str:
    """Render structured diff report as human-readable Markdown."""
    lines: list[str] = []
    lines.append(f"# MC Sweep Diff Report — {report['game_id']} / {report['variant_id']}")
    lines.append("")
    lines.append(f"**Tier:** {report['tier']}")
    lines.append(f"**Overall:** {'✅ PASS' if report['overall_pass'] else '🔴 FAIL'}")
    lines.append(f"**Failed metrics:** {report['failed_count']}")
    lines.append(f"**Cross-seed CV (RTP):** {report['cross_seed_cv']:.2e}")
    lines.append(f"**PAR Merkle:** `{report['par_sha256'][:16]}...`")
    lines.append("")
    lines.append("## Per-metric breakdown")
    lines.append("")
    lines.append("| Metric | Target | Measured | Δ | Tolerance | Pass |")
    lines.append("|--------|--------|----------|---|-----------|:----:|")
    for d in report["deltas"]:
        status = "✅" if d["passed"] else "🔴"
        delta_abs = d["delta_abs"]
        sign = "+" if delta_abs >= 0 else ""
        lines.append(
            f"| {d['name']} | {d['target']:.6f} | {d['measured']:.6f} "
            f"| {sign}{delta_abs:.6e} | {d['tolerance']:.6e} | {status} |"
        )

    failed = report["failed_metrics"]
    if failed:
        lines.append("")
        lines.append("## 🔴 Suspected root causes")
        lines.append("")
        for f in failed:
            lines.append(f"- **{f['name']}** → {f['suspected_root']}")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("**Action:** halt pipeline, do not deploy. Fix the implicated layer,")
    lines.append("re-run MC sweep at the same tier with the same seed set, verify all")
    lines.append("metrics pass before proceeding.")
    lines.append("")
    return "\n".join(lines)
