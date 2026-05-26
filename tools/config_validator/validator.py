"""Repo configuration validator — internal-consistency gate.

Reads every game IR + jurisdiction overlay + vendor registry +
pyproject entry points; emits a `ConfigReport` with cross-reference
violations.

Doesn't simulate spins or compute RTP — strictly metadata checks.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from tools.jurisdiction.linter import (
    JurisdictionProfile,
    list_profiles as list_jurisdictions,
    load_profile as load_jurisdiction,
)
from tools.parse_par.profile import list_profiles as list_vendors


KNOWN_FEATURE_KINDS = (
    "free_spins", "pick_bonus", "hold_and_win", "wild_expand",
    "pattern_win", "linear_progressive", "cascade", "mystery_reveal",
    "sticky_wild", "symbol_upgrade", "buy_feature", "bonus_wheel",
    "cash_eruption_pages", "ways_evaluation",
)


@dataclass
class ConfigIssue:
    severity: str   # "error" | "warning" | "info"
    rule: str
    message: str
    game: str | None = None
    field: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "rule": self.rule,
            "message": self.message,
            "game": self.game,
            "field": self.field,
        }


@dataclass
class ConfigReport:
    issues: list[ConfigIssue] = field(default_factory=list)
    games_root: str = ""
    n_games: int = 0
    n_jurisdictions: int = 0
    n_vendors: int = 0

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")

    @property
    def passed(self) -> bool:
        return self.error_count == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "games_root": self.games_root,
            "n_games": self.n_games,
            "n_jurisdictions": self.n_jurisdictions,
            "n_vendors": self.n_vendors,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "passed": self.passed,
            "issues": [i.to_dict() for i in self.issues],
        }

    def to_markdown(self) -> str:
        lines = [
            "# Config Validator Report",
            "",
            f"- games_root: `{self.games_root}`",
            f"- games: {self.n_games} · "
            f"vendors: {self.n_vendors} · "
            f"jurisdictions: {self.n_jurisdictions}",
            f"- verdict: {'✅ PASS' if self.passed else '🔴 FAIL'}",
            f"- errors: {self.error_count} · warnings: {self.warning_count}",
            "",
        ]
        if self.issues:
            lines += [
                "| severity | rule | game | field | message |",
                "|---|---|---|---|---|",
            ]
            for i in self.issues:
                lines.append(
                    f"| {i.severity} | {i.rule} | "
                    f"{i.game or '—'} | {i.field or '—'} | {i.message} |"
                )
        return "\n".join(lines) + "\n"


# ─── helpers ────────────────────────────────────────────────────────


DEFAULT_GLOBS = ("**/*.ir.json", "**/ir.json", "**/universal_ir.json")


def _discover_irs(games_root: Path,
                  globs: Iterable[str] = DEFAULT_GLOBS) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for pat in globs:
        for p in sorted(games_root.glob(pat)):
            if p.is_file() and p not in seen:
                seen.add(p)
                out.append(p)
    return out


def _load_juris_profiles(
    ids: Iterable[str],
) -> dict[str, JurisdictionProfile]:
    out: dict[str, JurisdictionProfile] = {}
    for jid in ids:
        try:
            out[jid] = load_jurisdiction(jid)
        except FileNotFoundError:
            continue
    return out


def _check_rtp_in_range(
    ir: dict[str, Any], profiles: list[JurisdictionProfile],
    *, game: str, report: ConfigReport,
) -> None:
    meta = ir.get("meta") or {}
    target = meta.get("target_rtp") or meta.get("rtp_total")
    if target is None:
        return
    try:
        target = float(target)
    except (TypeError, ValueError):
        return
    for profile in profiles:
        if not (profile.rtp_min <= target <= profile.rtp_max):
            report.issues.append(ConfigIssue(
                severity="error",
                rule="rtp.range",
                message=(
                    f"target_rtp {target:.4f} outside "
                    f"{profile.id} range [{profile.rtp_min:.2f}, "
                    f"{profile.rtp_max:.2f}]"
                ),
                game=game, field="meta.target_rtp",
            ))


def _check_max_win_x(
    ir: dict[str, Any], profiles: list[JurisdictionProfile],
    *, game: str, report: ConfigReport,
) -> None:
    limits = ir.get("limits") or {}
    mw = limits.get("max_win_x")
    if mw is None:
        return
    try:
        mw = float(mw)
    except (TypeError, ValueError):
        return
    for profile in profiles:
        if profile.max_win_x is not None and mw > profile.max_win_x:
            report.issues.append(ConfigIssue(
                severity="error",
                rule="limits.max_win_x",
                message=(
                    f"max_win_x {mw:.0f} exceeds "
                    f"{profile.id} cap {profile.max_win_x:.0f}"
                ),
                game=game, field="limits.max_win_x",
            ))


def _check_spin_duration(
    ir: dict[str, Any], profiles: list[JurisdictionProfile],
    *, game: str, report: ConfigReport,
) -> None:
    limits = ir.get("limits") or {}
    msd = limits.get("min_spin_duration_ms")
    if msd is None:
        return
    try:
        msd = int(msd)
    except (TypeError, ValueError):
        return
    for profile in profiles:
        if (profile.min_spin_duration_ms is not None
                and msd < profile.min_spin_duration_ms):
            report.issues.append(ConfigIssue(
                severity="error",
                rule="limits.min_spin_duration_ms",
                message=(
                    f"min_spin_duration_ms {msd} below "
                    f"{profile.id} floor {profile.min_spin_duration_ms}"
                ),
                game=game, field="limits.min_spin_duration_ms",
            ))


def _check_vendor_registered(
    ir: dict[str, Any], *, game: str, report: ConfigReport,
    known_vendors: set[str],
) -> None:
    vendor = (ir.get("meta") or {}).get("vendor")
    if vendor and vendor not in known_vendors and vendor != "unknown":
        report.issues.append(ConfigIssue(
            severity="warning",
            rule="vendor.registered",
            message=(
                f"vendor {vendor!r} not in registry "
                f"(known: {sorted(known_vendors)})"
            ),
            game=game, field="meta.vendor",
        ))


def _check_feature_kinds(
    ir: dict[str, Any], *, game: str, report: ConfigReport,
) -> None:
    feats = ir.get("features") or []
    if isinstance(feats, dict):
        kinds = list(feats.keys())
    else:
        kinds = [
            f.get("kind") or f.get("type")
            for f in feats if isinstance(f, dict)
        ]
    for k in kinds:
        if k and k not in KNOWN_FEATURE_KINDS:
            report.issues.append(ConfigIssue(
                severity="warning",
                rule="feature.kind",
                message=(
                    f"unknown feature kind: {k!r} "
                    f"(known: {len(KNOWN_FEATURE_KINDS)} kinds)"
                ),
                game=game, field="features[].kind",
            ))


# ─── top-level ─────────────────────────────────────────────────────


def validate_repo(
    games_root: Path,
    *,
    jurisdictions: Iterable[str] | None = None,
) -> ConfigReport:
    games_root = Path(games_root)
    report = ConfigReport(games_root=str(games_root))

    juris_ids = list(jurisdictions or list_jurisdictions())
    juris_profiles = _load_juris_profiles(juris_ids)
    report.n_jurisdictions = len(juris_profiles)

    known_vendors = set(list_vendors())
    report.n_vendors = len(known_vendors)

    ir_paths = _discover_irs(games_root)
    report.n_games = len(ir_paths)

    profile_list = list(juris_profiles.values())

    for path in ir_paths:
        try:
            ir = json.loads(path.read_text())
        except Exception as e:  # noqa: BLE001
            report.issues.append(ConfigIssue(
                severity="error", rule="ir.parse",
                message=str(e),
                game=str(path.relative_to(games_root)),
            ))
            continue
        try:
            rel = str(path.relative_to(games_root))
        except ValueError:
            rel = str(path)

        # If the IR pins specific jurisdictions, only those gate the
        # numeric checks; else we check against the union.
        meta = ir.get("meta") or {}
        pinned = meta.get("jurisdictions") or []
        if pinned:
            pin_profiles = [juris_profiles[j] for j in pinned
                            if j in juris_profiles]
        else:
            pin_profiles = profile_list

        _check_rtp_in_range(ir, pin_profiles, game=rel, report=report)
        _check_max_win_x(ir, pin_profiles, game=rel, report=report)
        _check_spin_duration(ir, pin_profiles, game=rel, report=report)
        _check_vendor_registered(
            ir, game=rel, report=report, known_vendors=known_vendors,
        )
        _check_feature_kinds(ir, game=rel, report=report)

    return report
