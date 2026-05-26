"""P1.7 — Jurisdiction compliance linter.

Loads YAML jurisdiction profiles + validates a universal slot-sim IR
against the regulator's rules. Emits a `ComplianceReport` with
`error` / `warning` / `info` severities + optional auto-fix hints.

Re-uses the zero-dep mini-YAML loader from `tools/parse_par/profile.py`
to avoid PyYAML dependency (regulator-lab Python envs often pinned).
"""
from __future__ import annotations
import os
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from tools.parse_par.profile import _parse_yaml  # zero-dep mini-YAML

PROFILE_DIR = Path(__file__).resolve().parent / "profiles"


class ViolationSeverity(str, Enum):
    ERROR = "error"      # blocks cert
    WARNING = "warning"  # cert with caveat
    INFO = "info"        # advisory


@dataclass
class ComplianceViolation:
    rule_id: str
    jurisdiction: str
    severity: ViolationSeverity
    message: str
    field: str | None = None
    can_auto_fix: bool = False


@dataclass
class ComplianceReport:
    jurisdiction: str
    violations: list[ComplianceViolation] = field(default_factory=list)

    @property
    def is_compliant(self) -> bool:
        return not any(v.severity == ViolationSeverity.ERROR for v in self.violations)

    @property
    def auto_fixable(self) -> bool:
        return all(
            v.can_auto_fix for v in self.violations
            if v.severity == ViolationSeverity.ERROR
        )

    @property
    def error_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == ViolationSeverity.ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == ViolationSeverity.WARNING)

    @property
    def info_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == ViolationSeverity.INFO)


@dataclass
class JurisdictionProfile:
    """Validated jurisdiction profile loaded from YAML."""

    id: str
    name: str
    rtp_min: float
    rtp_max: float
    max_win_x: float | None = None
    min_spin_duration_ms: int | None = None
    max_stake_default: float | None = None
    age_tiered_stakes: list[dict[str, Any]] = field(default_factory=list)
    prohibited_features: list[str] = field(default_factory=list)
    require_ldw_disclosure: bool = False
    require_session_time_display: bool = False
    require_loss_limits: bool = False
    require_reality_checks: bool = False
    near_miss_rule: str | None = None
    informational_notes: list[str] = field(default_factory=list)
    source_data: dict = field(default_factory=dict)

    @classmethod
    def from_yaml_dict(cls, data: dict) -> "JurisdictionProfile":
        rtp_range = data.get("rtp_range") or [0.0, 1.0]
        return cls(
            id=data["id"],
            name=data["name"],
            rtp_min=float(rtp_range[0]),
            rtp_max=float(rtp_range[1]),
            max_win_x=data.get("max_win_x"),
            min_spin_duration_ms=data.get("min_spin_duration_ms"),
            max_stake_default=data.get("max_stake_default"),
            age_tiered_stakes=data.get("age_tiered_stakes") or [],
            prohibited_features=data.get("prohibited_features") or [],
            require_ldw_disclosure=bool(data.get("require_ldw_disclosure", False)),
            require_session_time_display=bool(
                data.get("require_session_time_display", False)
            ),
            require_loss_limits=bool(data.get("require_loss_limits", False)),
            require_reality_checks=bool(data.get("require_reality_checks", False)),
            near_miss_rule=data.get("near_miss_rule"),
            informational_notes=data.get("informational_notes") or [],
            source_data=data,
        )


def list_profiles(search_dir: Path | None = None) -> list[str]:
    d = search_dir or PROFILE_DIR
    if not d.exists():
        return []
    return sorted(
        p.stem for p in d.iterdir()
        if p.suffix in (".yaml", ".yml") and not p.name.startswith("_")
    )


def load_profile(name: str, search_dir: Path | None = None) -> JurisdictionProfile:
    """Load a jurisdiction profile by short id (e.g. 'ukgc', 'mga')."""
    d = search_dir or PROFILE_DIR
    candidate = d / f"{name}.yaml"
    if not candidate.exists():
        candidate = d / f"{name}.yml"
    if not candidate.exists():
        raise FileNotFoundError(
            f"jurisdiction profile {name!r} not found in {d} "
            f"(available: {list_profiles(d)})"
        )
    text = candidate.read_text()
    data = _parse_yaml(text)
    return JurisdictionProfile.from_yaml_dict(data)


def lint_ir(ir: dict, profile: JurisdictionProfile) -> ComplianceReport:
    """Validate `ir` (universal slot-sim IR) against `profile`.

    Returns a `ComplianceReport` with all detected violations.
    """
    report = ComplianceReport(jurisdiction=profile.id)
    meta = ir.get("meta") or {}

    # ─── RTP range check ───────────────────────────────────────────
    rtp = meta.get("rtp_total")
    if rtp is None:
        report.violations.append(ComplianceViolation(
            rule_id=f"{profile.id}.rtp.missing",
            jurisdiction=profile.id,
            severity=ViolationSeverity.WARNING,
            message="meta.rtp_total not declared",
            field="meta.rtp_total",
        ))
    else:
        if rtp < profile.rtp_min:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.rtp.below_min",
                jurisdiction=profile.id,
                severity=ViolationSeverity.ERROR,
                message=f"RTP {rtp:.4f} below minimum {profile.rtp_min}",
                field="meta.rtp_total",
            ))
        if rtp > profile.rtp_max:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.rtp.above_max",
                jurisdiction=profile.id,
                severity=ViolationSeverity.ERROR,
                message=f"RTP {rtp:.4f} above maximum {profile.rtp_max}",
                field="meta.rtp_total",
            ))

    # ─── Max win cap ───────────────────────────────────────────────
    if profile.max_win_x is not None:
        declared_cap = (ir.get("limits") or {}).get("max_win_x")
        if declared_cap is None:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.max_win.missing",
                jurisdiction=profile.id,
                severity=ViolationSeverity.WARNING,
                message=(
                    f"limits.max_win_x not declared; jurisdiction caps at "
                    f"{profile.max_win_x}×"
                ),
                field="limits.max_win_x",
                can_auto_fix=True,
            ))
        elif declared_cap > profile.max_win_x:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.max_win.exceeds_cap",
                jurisdiction=profile.id,
                severity=ViolationSeverity.ERROR,
                message=(
                    f"limits.max_win_x={declared_cap} exceeds "
                    f"jurisdiction cap {profile.max_win_x}"
                ),
                field="limits.max_win_x",
                can_auto_fix=True,
            ))

    # ─── Prohibited features ───────────────────────────────────────
    if profile.prohibited_features:
        for feat in ir.get("features") or []:
            kind = feat.get("kind", "")
            if kind in profile.prohibited_features:
                report.violations.append(ComplianceViolation(
                    rule_id=f"{profile.id}.feature.prohibited",
                    jurisdiction=profile.id,
                    severity=ViolationSeverity.ERROR,
                    message=f"feature {kind!r} prohibited in this jurisdiction",
                    field=f"features.{kind}",
                ))

    # ─── Spin duration / responsible gambling ─────────────────────
    if profile.min_spin_duration_ms is not None:
        decl = (ir.get("compliance") or {}).get("min_spin_duration_ms")
        if decl is None:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.spin_duration.missing",
                jurisdiction=profile.id,
                severity=ViolationSeverity.WARNING,
                message=(
                    f"min_spin_duration_ms not declared; jurisdiction requires "
                    f"≥ {profile.min_spin_duration_ms}ms (RG pacing)"
                ),
                field="compliance.min_spin_duration_ms",
                can_auto_fix=True,
            ))
        elif decl < profile.min_spin_duration_ms:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.spin_duration.too_fast",
                jurisdiction=profile.id,
                severity=ViolationSeverity.ERROR,
                message=(
                    f"min_spin_duration_ms={decl} below jurisdiction "
                    f"minimum {profile.min_spin_duration_ms}ms"
                ),
                field="compliance.min_spin_duration_ms",
            ))

    # ─── Max stake default ────────────────────────────────────────
    if profile.max_stake_default is not None:
        decl_stake = (ir.get("bet") or {}).get("base_bet")
        if decl_stake is not None and decl_stake > profile.max_stake_default:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.stake.exceeds_default_cap",
                jurisdiction=profile.id,
                severity=ViolationSeverity.WARNING,
                message=(
                    f"bet.base_bet={decl_stake} exceeds default cap "
                    f"{profile.max_stake_default} (age tier checks apply)"
                ),
                field="bet.base_bet",
            ))

    # ─── Disclosure / display flags ────────────────────────────────
    compl = ir.get("compliance") or {}
    if profile.require_ldw_disclosure and not compl.get("ldw_disclosure"):
        report.violations.append(ComplianceViolation(
            rule_id=f"{profile.id}.ldw_disclosure.required",
            jurisdiction=profile.id,
            severity=ViolationSeverity.ERROR,
            message="losses-disguised-as-wins (LDW) disclosure not enabled",
            field="compliance.ldw_disclosure",
            can_auto_fix=True,
        ))
    if profile.require_session_time_display and not compl.get("session_time_display"):
        report.violations.append(ComplianceViolation(
            rule_id=f"{profile.id}.session_time.required",
            jurisdiction=profile.id,
            severity=ViolationSeverity.ERROR,
            message="session time display not enabled",
            field="compliance.session_time_display",
            can_auto_fix=True,
        ))
    if profile.require_loss_limits and not compl.get("loss_limits"):
        report.violations.append(ComplianceViolation(
            rule_id=f"{profile.id}.loss_limits.required",
            jurisdiction=profile.id,
            severity=ViolationSeverity.WARNING,
            message=(
                "player-set loss limits not enabled (operator-side feature; "
                "expected at platform level)"
            ),
            field="compliance.loss_limits",
        ))
    if profile.require_reality_checks and not compl.get("reality_checks"):
        report.violations.append(ComplianceViolation(
            rule_id=f"{profile.id}.reality_checks.required",
            jurisdiction=profile.id,
            severity=ViolationSeverity.WARNING,
            message=(
                "reality-check pop-ups not enabled (operator-side feature)"
            ),
            field="compliance.reality_checks",
        ))

    # ─── Near-miss rule ──────────────────────────────────────────
    if profile.near_miss_rule:
        nm = compl.get("near_miss_rule")
        if nm and nm != profile.near_miss_rule:
            report.violations.append(ComplianceViolation(
                rule_id=f"{profile.id}.near_miss.mismatch",
                jurisdiction=profile.id,
                severity=ViolationSeverity.WARNING,
                message=(
                    f"near_miss_rule={nm!r} differs from jurisdiction "
                    f"requirement {profile.near_miss_rule!r}"
                ),
                field="compliance.near_miss_rule",
            ))

    return report


# ─── CLI ─────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    import argparse
    import json
    import sys

    ap = argparse.ArgumentParser(
        prog="slot-jurisdiction-check",
        description="P1.7 — Validate IR against a jurisdiction profile.",
    )
    ap.add_argument("ir_path", nargs="?", help="path to *.slot-sim.ir.json")
    ap.add_argument("--profile", help="jurisdiction id (ukgc, mga, gli16, …)")
    ap.add_argument(
        "--list", action="store_true",
        help="list available profiles and exit",
    )
    ap.add_argument(
        "--all", action="store_true",
        help="lint against ALL profiles (regulator multi-cert pre-check)",
    )
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--json", action="store_true", help="emit JSON report")
    args = ap.parse_args(argv)

    if args.list:
        profiles = list_profiles()
        print(f"Available profiles ({len(profiles)}):")
        for pid in profiles:
            try:
                p = load_profile(pid)
                print(f"  {pid:8s}  {p.name}")
            except Exception as e:  # pragma: no cover
                print(f"  {pid:8s}  ERROR: {e}")
        return 0

    if not args.ir_path:
        ap.error("ir_path is required (or use --list)")
    ir = json.loads(Path(args.ir_path).read_text())

    if args.all:
        targets = list_profiles()
    elif args.profile:
        targets = [args.profile]
    else:
        ap.error("--profile <id> or --all is required")

    all_reports: list[ComplianceReport] = []
    overall_ok = True
    for pid in targets:
        profile = load_profile(pid)
        report = lint_ir(ir, profile)
        all_reports.append(report)
        if not report.is_compliant:
            overall_ok = False
        if not args.quiet and not args.json:
            verdict = "✅" if report.is_compliant else "❌"
            print(
                f"{verdict} {pid:8s}  {profile.name}  "
                f"(errors={report.error_count} warnings={report.warning_count} "
                f"infos={report.info_count})"
            )
            for v in report.violations:
                icon = {"error": "❌", "warning": "⚠️ ", "info": "ℹ️ "}[v.severity.value]
                print(f"    {icon} [{v.rule_id}] {v.message}")

    if args.json:
        out = {
            "ir": args.ir_path,
            "overall_ok": overall_ok,
            "reports": [
                {
                    "jurisdiction": r.jurisdiction,
                    "is_compliant": r.is_compliant,
                    "auto_fixable": r.auto_fixable,
                    "violations": [
                        {
                            "rule_id": v.rule_id,
                            "severity": v.severity.value,
                            "message": v.message,
                            "field": v.field,
                            "can_auto_fix": v.can_auto_fix,
                        }
                        for v in r.violations
                    ],
                }
                for r in all_reports
            ],
        }
        print(json.dumps(out, indent=2, default=str))

    return 0 if overall_ok else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
