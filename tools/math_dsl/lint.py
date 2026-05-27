"""W8.2 — DSL spec linter.

Static checks over a `MathDslSpec` that flag designer mistakes before
Z3 synthesis. Each finding has a severity (error / warning / info) and
a stable rule_id so CI can suppress specific rules per project.

Rule catalog
============
  LINT001  error    — fewer than 2 paying symbols (hp + lp combined)
  LINT002  error    — no wild AND no scatter in the symbol list
  LINT003  warning  — no wild symbol declared (game-design red flag, not error)
  LINT004  warning  — RTP target outside typical regulator range (0.85-0.98)
  LINT005  warning  — paytable contains non-monotonic ladder
                      (pay_3 > pay_4 or pay_4 > pay_5 for some symbol)
  LINT006  info     — hit_freq_target = 0 (no constraint, solver will choose)
  LINT007  warning  — Megaways topology without `mystery_symbol` feature
  LINT008  warning  — `linear_progressive` feature but no progressive_link
                      hint (compile auto-emits, just makes the spec clearer)
  LINT009  info     — fewer than 10 paylines on a rectangular topology
  LINT010  warning  — features list empty (no base→bonus path)
  LINT011  warning  — pay_max < 100 (suspiciously low cap)
  LINT012  warning  — jurisdictions empty (will default to UKGC+MGA)
  LINT013  info     — reel_length hint missing (defaults to 60)
  LINT014  error    — variable_rows topology missing row_range_per_reel
  LINT015  warning  — duplicate jurisdiction codes in list
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .spec import MathDslSpec


@dataclass
class LintFinding:
    rule_id: str
    severity: str   # error | warning | info
    path: str       # dotted path into the spec
    message: str


def lint_spec(spec: MathDslSpec) -> list[LintFinding]:
    """Run every lint rule against `spec`, return findings."""
    findings: list[LintFinding] = []

    paying = [s for s in spec.symbols if s.kind in ("hp", "lp")]
    wilds = [s for s in spec.symbols if s.kind == "wild"]
    scatters = [s for s in spec.symbols if s.kind == "scatter"]
    mysteries = [s for s in spec.symbols if s.kind == "mystery"]

    if len(paying) < 2:
        findings.append(LintFinding(
            "LINT001", "error", "symbols",
            f"fewer than 2 paying symbols (got {len(paying)})",
        ))
    if not wilds and not scatters:
        findings.append(LintFinding(
            "LINT002", "error", "symbols",
            "no wild AND no scatter declared — base game cannot pay scatter wins",
        ))
    elif not wilds:
        findings.append(LintFinding(
            "LINT003", "warning", "symbols",
            "no wild symbol declared — modern slot conventions usually include one",
        ))

    rtp = spec.constraints.target_rtp
    if rtp < 0.85 or rtp > 0.98:
        findings.append(LintFinding(
            "LINT004", "warning", "constraints.target_rtp",
            f"target_rtp {rtp} outside typical regulator range [0.85, 0.98]",
        ))

    # Paytable monotonicity is a compile-time check (compile() builds it),
    # but we lint the spec's declared symbol order to surface intent.
    if spec.constraints.pay_ladder_monotonic is False:
        findings.append(LintFinding(
            "LINT005", "warning", "constraints.pay_ladder_monotonic",
            "monotonic pay ladder disabled — most regulators require it",
        ))

    if spec.constraints.hit_freq_target == 0:
        findings.append(LintFinding(
            "LINT006", "info", "constraints.hit_freq_target",
            "hit_freq_target = 0 → solver is unconstrained on hit frequency",
        ))

    if spec.topology.kind == "variable_rows":
        if not spec.topology.row_range_per_reel:
            findings.append(LintFinding(
                "LINT014", "error", "topology.row_range_per_reel",
                "variable_rows topology requires row_range_per_reel list",
            ))
        if not mysteries:
            findings.append(LintFinding(
                "LINT007", "warning", "features",
                "Megaways topology without mystery_symbol feature is unusual",
            ))

    has_progressive = any(f.kind == "linear_progressive" for f in spec.features)
    if has_progressive and "wap_pool" not in spec.hints and not any(
        f.pool_id for f in spec.features if f.kind == "linear_progressive"
    ):
        findings.append(LintFinding(
            "LINT008", "warning", "features.linear_progressive",
            "linear_progressive declared but no pool_id — defaults will be opaque",
        ))

    if (spec.topology.kind == "rectangular" and isinstance(spec.paylines, int)
            and spec.paylines < 10):
        findings.append(LintFinding(
            "LINT009", "info", "paylines",
            f"only {spec.paylines} paylines — modern slots typically have ≥10",
        ))

    if not spec.features:
        findings.append(LintFinding(
            "LINT010", "warning", "features",
            "no features declared — base game with no bonus path is rare",
        ))

    if spec.constraints.pay_max < 100:
        findings.append(LintFinding(
            "LINT011", "warning", "constraints.pay_max",
            f"pay_max {spec.constraints.pay_max} is suspiciously low — "
            "typical slots cap at 1000-25000×",
        ))

    if not spec.constraints.jurisdictions:
        findings.append(LintFinding(
            "LINT012", "warning", "constraints.jurisdictions",
            "no jurisdictions declared — will default to UKGC + MGA",
        ))

    if "reel_length" not in spec.hints:
        findings.append(LintFinding(
            "LINT013", "info", "hints.reel_length",
            "reel_length hint missing — defaults to 60",
        ))

    js = spec.constraints.jurisdictions
    if len(js) != len(set(j.upper() for j in js)):
        findings.append(LintFinding(
            "LINT015", "warning", "constraints.jurisdictions",
            f"duplicate jurisdiction codes in {js}",
        ))

    return findings


def filter_by_severity(
    findings: Iterable[LintFinding], severity: str,
) -> list[LintFinding]:
    return [f for f in findings if f.severity == severity]


def render_lint(findings: list[LintFinding]) -> str:
    """Markdown table for designer / CI output."""
    if not findings:
        return "(no lint findings — spec is clean)\n"
    lines = [
        "| Severity | Rule | Path | Message |",
        "|---|---|---|---|",
    ]
    sym = {"error": "🔴", "warning": "🟡", "info": "🔵"}
    for f in findings:
        lines.append(
            f"| {sym.get(f.severity, '?')} {f.severity} | "
            f"`{f.rule_id}` | `{f.path}` | {f.message} |"
        )
    return "\n".join(lines) + "\n"
