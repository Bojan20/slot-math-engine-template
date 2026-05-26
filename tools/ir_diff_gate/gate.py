"""W58 — IR Diff CI Gate (rules + verdict aggregator)."""
from __future__ import annotations
import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from tools.diagnostics.ir_diff import IrDiff, compute_diff


class GateSeverity(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"


@dataclass
class GateConfig:
    max_rtp_delta: float = 0.005
    max_paytable_changes: int = 0
    allow_feature_additions: bool = False
    allow_feature_removals: bool = False
    allow_meta_drift: bool = True
    allow_topology_change: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class GateFinding:
    rule: str
    severity: GateSeverity
    detail: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule": self.rule,
            "severity": self.severity.value,
            "detail": self.detail,
        }


@dataclass
class GateReport:
    config: GateConfig
    diff: IrDiff
    findings: list[GateFinding] = field(default_factory=list)

    @property
    def verdict(self) -> GateSeverity:
        if any(f.severity == GateSeverity.FAIL for f in self.findings):
            return GateSeverity.FAIL
        if any(f.severity == GateSeverity.WARN for f in self.findings):
            return GateSeverity.WARN
        return GateSeverity.PASS

    def exit_code(self) -> int:
        v = self.verdict
        if v == GateSeverity.PASS:
            return 0
        if v == GateSeverity.WARN:
            return 1
        return 2

    def to_dict(self) -> dict[str, Any]:
        return {
            "config": self.config.to_dict(),
            "verdict": self.verdict.value,
            "exit_code": self.exit_code(),
            "findings": [f.to_dict() for f in self.findings],
            "diff": {
                "a_path": self.diff.a_path,
                "b_path": self.diff.b_path,
                "rtp_estimate_a": self.diff.rtp_estimate_a,
                "rtp_estimate_b": self.diff.rtp_estimate_b,
                "rtp_estimate_delta": self.diff.rtp_estimate_delta,
                "paytable_added": len(self.diff.paytable_added),
                "paytable_removed": len(self.diff.paytable_removed),
                "paytable_changed": len(self.diff.paytable_changed),
                "features_a_only": list(self.diff.features_a_only),
                "features_b_only": list(self.diff.features_b_only),
                "meta_delta": dict(self.diff.meta_delta),
                "topology_delta": dict(self.diff.topology_delta),
                "reel_set_count_delta": dict(self.diff.reel_set_count_delta),
                "has_changes": self.diff.has_changes,
            },
        }


def _rule_rtp_delta(diff: IrDiff, cfg: GateConfig) -> GateFinding | None:
    if diff.rtp_estimate_delta is None:
        return None
    delta = abs(diff.rtp_estimate_delta)
    if delta > cfg.max_rtp_delta:
        return GateFinding(
            rule="max_rtp_delta",
            severity=GateSeverity.FAIL,
            detail=f"|ΔRTP|={delta:.5f} > limit {cfg.max_rtp_delta:.5f}",
        )
    return None


def _rule_paytable_changes(diff: IrDiff, cfg: GateConfig) -> GateFinding | None:
    total = (
        len(diff.paytable_added)
        + len(diff.paytable_removed)
        + len(diff.paytable_changed)
    )
    if total > cfg.max_paytable_changes:
        return GateFinding(
            rule="max_paytable_changes",
            severity=GateSeverity.FAIL,
            detail=(
                f"paytable changes={total} > limit "
                f"{cfg.max_paytable_changes} "
                f"(+{len(diff.paytable_added)} -{len(diff.paytable_removed)} "
                f"~{len(diff.paytable_changed)})"
            ),
        )
    return None


def _rule_feature_additions(diff: IrDiff, cfg: GateConfig) -> GateFinding | None:
    if cfg.allow_feature_additions:
        return None
    if diff.features_b_only:
        return GateFinding(
            rule="feature_additions",
            severity=GateSeverity.FAIL,
            detail=f"new features only in B: {diff.features_b_only}",
        )
    return None


def _rule_feature_removals(diff: IrDiff, cfg: GateConfig) -> GateFinding | None:
    if cfg.allow_feature_removals:
        return None
    if diff.features_a_only:
        return GateFinding(
            rule="feature_removals",
            severity=GateSeverity.FAIL,
            detail=f"features removed in B: {diff.features_a_only}",
        )
    return None


def _rule_meta_drift(diff: IrDiff, cfg: GateConfig) -> GateFinding | None:
    if cfg.allow_meta_drift:
        return None
    if diff.meta_delta:
        return GateFinding(
            rule="meta_drift",
            severity=GateSeverity.WARN,
            detail=f"meta drift: {sorted(diff.meta_delta)}",
        )
    return None


def _rule_topology_change(diff: IrDiff, cfg: GateConfig) -> GateFinding | None:
    if cfg.allow_topology_change:
        return None
    if diff.topology_delta:
        return GateFinding(
            rule="topology_change",
            severity=GateSeverity.FAIL,
            detail=f"topology change: {sorted(diff.topology_delta)}",
        )
    return None


_RULES = (
    _rule_rtp_delta,
    _rule_paytable_changes,
    _rule_feature_additions,
    _rule_feature_removals,
    _rule_meta_drift,
    _rule_topology_change,
)


def run_gate(
    a_ir: dict[str, Any] | Path,
    b_ir: dict[str, Any] | Path,
    *,
    config: GateConfig | None = None,
) -> GateReport:
    cfg = config or GateConfig()
    a = json.loads(Path(a_ir).read_text()) if isinstance(a_ir, (str, Path)) else a_ir
    b = json.loads(Path(b_ir).read_text()) if isinstance(b_ir, (str, Path)) else b_ir
    a_label = str(a_ir) if isinstance(a_ir, (str, Path)) else "A"
    b_label = str(b_ir) if isinstance(b_ir, (str, Path)) else "B"
    diff = compute_diff(a, b, a_label, b_label)
    findings: list[GateFinding] = []
    for rule in _RULES:
        f = rule(diff, cfg)
        if f is not None:
            findings.append(f)
    return GateReport(config=cfg, diff=diff, findings=findings)
