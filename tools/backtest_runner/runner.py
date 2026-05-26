"""Historical jurisdiction backtest runner.

Rule shape (per-snapshot):
{
  "snapshot_date": "2025-Q1",
  "jurisdiction": "UKGC",
  "rules": {
    "min_rtp": 0.85,
    "max_rtp": 1.00,
    "max_volatility": "high",
    "allowed_features": ["free_spins", "wild_expand", ...],
    "disallowed_features": ["autoplay_unlimited", ...]
  }
}
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


_VOL_RANK = {"low": 1, "medium": 2, "high": 3, "extreme": 4}


@dataclass
class JurisdictionSnapshot:
    snapshot_date: str
    jurisdiction: str
    rules: dict[str, Any] = field(default_factory=dict)


@dataclass
class BacktestEntry:
    snapshot_date: str
    jurisdiction: str
    issues: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.issues

    def to_dict(self) -> dict[str, Any]:
        return {
            "snapshot_date": self.snapshot_date,
            "jurisdiction": self.jurisdiction,
            "passed": self.passed,
            "issues": list(self.issues),
        }


@dataclass
class BacktestReport:
    game_id: str
    entries: list[BacktestEntry] = field(default_factory=list)

    @property
    def n_failed(self) -> int:
        return sum(1 for e in self.entries if not e.passed)

    @property
    def passed(self) -> bool:
        return self.n_failed == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "n_entries": len(self.entries),
            "n_failed": self.n_failed,
            "passed": self.passed,
            "entries": [e.to_dict() for e in self.entries],
        }


def check_against_rules(
    ir: dict[str, Any], rules: dict[str, Any]
) -> list[str]:
    issues: list[str] = []
    meta = ir.get("meta") or {}
    target_rtp = meta.get("target_rtp")
    if isinstance(target_rtp, (int, float)) and target_rtp > 1.5:
        target_rtp = target_rtp / 100.0
    if isinstance(target_rtp, (int, float)):
        if "min_rtp" in rules and target_rtp < rules["min_rtp"]:
            issues.append(
                f"target_rtp {target_rtp:.4f} below min_rtp {rules['min_rtp']:.4f}"
            )
        if "max_rtp" in rules and target_rtp > rules["max_rtp"]:
            issues.append(
                f"target_rtp {target_rtp:.4f} above max_rtp {rules['max_rtp']:.4f}"
            )

    volatility = meta.get("volatility")
    if isinstance(volatility, str) and "max_volatility" in rules:
        cap = rules["max_volatility"]
        if _VOL_RANK.get(volatility.lower(), 0) > _VOL_RANK.get(str(cap).lower(), 0):
            issues.append(
                f"volatility {volatility} exceeds cap {cap}"
            )

    feature_kinds = {
        f.get("kind") for f in (ir.get("features") or [])
        if isinstance(f, dict)
    }
    if "disallowed_features" in rules:
        for f in feature_kinds:
            if f in rules["disallowed_features"]:
                issues.append(f"disallowed feature {f}")
    if "allowed_features" in rules:
        allowed = set(rules["allowed_features"])
        for f in feature_kinds:
            if f and f not in allowed:
                issues.append(f"feature {f} not in allowlist")

    return issues


def backtest(
    ir: dict[str, Any], snapshots: list[JurisdictionSnapshot],
) -> BacktestReport:
    meta = ir.get("meta") or {}
    report = BacktestReport(game_id=str(meta.get("id", "unknown")))
    for snap in snapshots:
        report.entries.append(BacktestEntry(
            snapshot_date=snap.snapshot_date,
            jurisdiction=snap.jurisdiction,
            issues=check_against_rules(ir, snap.rules),
        ))
    return report
