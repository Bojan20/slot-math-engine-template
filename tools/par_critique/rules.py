"""SLOT-MATH Faza 6.5 — Heuristic PAR critique rules."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class CritiqueSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass(frozen=True)
class CritiqueFinding:
    rule_id: str
    severity: CritiqueSeverity
    message: str
    path: str = ""


def _check_dead_symbols(par: dict[str, Any]) -> list[CritiqueFinding]:
    """RULE-001: symbols that appear in reels but have no paytable entry."""
    findings: list[CritiqueFinding] = []
    paytable_syms = set(par.get("paytable", {}).keys())
    reel_syms: set[str] = set()
    reels = par.get("reels", {})
    if reels.get("mode") == "weighted":
        for reel in reels.get("base", []):
            for s in reel.keys():
                reel_syms.add(s)
    elif reels.get("mode") == "strips":
        for reel in reels.get("base", []):
            for s in reel:
                reel_syms.add(s)

    declared_syms = {s.get("id") for s in par.get("symbols", [])}
    # Find symbols on reels but never in paytable (and not a wild/scatter/bonus)
    for s in reel_syms - paytable_syms:
        if s in declared_syms:
            sym_kinds = {ss["id"]: ss.get("kind") for ss in par.get("symbols", [])}
            kind = sym_kinds.get(s, "")
            if kind not in ("wild", "scatter", "bonus", "mystery"):
                findings.append(CritiqueFinding(
                    rule_id="RULE-001",
                    severity=CritiqueSeverity.WARNING,
                    message=f"symbol {s!r} appears on reels but has no paytable entry — dead symbol",
                    path=f"/symbols/{s}",
                ))
    return findings


def _check_unreachable_features(par: dict[str, Any]) -> list[CritiqueFinding]:
    """RULE-002: features with trigger probability < 1e-9 are unreachable."""
    findings: list[CritiqueFinding] = []
    features = par.get("features", [])
    for i, feat in enumerate(features):
        tp = feat.get("trigger_prob") or feat.get("trigger", {}).get("trigger_prob")
        if tp is not None and float(tp) < 1e-9:
            findings.append(CritiqueFinding(
                rule_id="RULE-002",
                severity=CritiqueSeverity.ERROR,
                message=f"feature {feat.get('kind')!r} has trigger_prob {tp} (effectively unreachable)",
                path=f"/features/{i}/trigger_prob",
            ))
    return findings


def _check_rtp_imbalance(par: dict[str, Any]) -> list[CritiqueFinding]:
    """RULE-003: single symbol responsible for > 80% of paytable RTP contribution."""
    findings: list[CritiqueFinding] = []
    paytable = par.get("paytable", {})
    if not paytable:
        return findings
    # Approximate contribution = sum of multipliers per symbol
    contrib_sum: dict[str, float] = {}
    for sym, table in paytable.items():
        contrib_sum[sym] = sum(float(v) for v in table.values())
    total = sum(contrib_sum.values()) or 1.0
    for sym, c in contrib_sum.items():
        if c / total > 0.80:
            findings.append(CritiqueFinding(
                rule_id="RULE-003",
                severity=CritiqueSeverity.WARNING,
                message=f"symbol {sym!r} accounts for {100 * c / total:.1f}% of paytable mass — imbalanced",
                path=f"/paytable/{sym}",
            ))
    return findings


def _check_volatility_mismatch(par: dict[str, Any]) -> list[CritiqueFinding]:
    """RULE-004: declared volatility class disagrees with declared variance + max_win."""
    findings: list[CritiqueFinding] = []
    vol = par.get("rtp", {}).get("volatility")
    if not vol:
        return findings
    declared_class = (par.get("limits", {}).get("target_volatility") or "").lower()
    if not declared_class:
        return findings
    variance = float(vol.get("variance", 0.0))
    cv = float(vol.get("cv", 0.0))
    # Heuristic mapping:
    expected_class = "low"
    if cv > 8 or variance > 5000:
        expected_class = "ultra"
    elif cv > 4 or variance > 1000:
        expected_class = "high"
    elif cv > 2 or variance > 200:
        expected_class = "medium"
    if declared_class and expected_class != declared_class:
        findings.append(CritiqueFinding(
            rule_id="RULE-004",
            severity=CritiqueSeverity.INFO,
            message=(
                f"declared target_volatility={declared_class!r} disagrees with "
                f"computed (CV={cv}, var={variance}) → expected {expected_class!r}"
            ),
            path="/limits/target_volatility",
        ))
    return findings


def _check_hit_freq_consistency(par: dict[str, Any]) -> list[CritiqueFinding]:
    """RULE-005: declared hit_freq target outside plausible range from paytable density."""
    findings: list[CritiqueFinding] = []
    hf = float(par.get("limits", {}).get("hit_freq_target", 0.0))
    if hf <= 0:
        return findings
    if not 0.01 <= hf <= 0.70:
        findings.append(CritiqueFinding(
            rule_id="RULE-005",
            severity=CritiqueSeverity.WARNING,
            message=f"hit_freq_target {hf:.4f} outside plausible range [0.01, 0.70]",
            path="/limits/hit_freq_target",
        ))
    return findings


def _check_max_win_extremes(par: dict[str, Any]) -> list[CritiqueFinding]:
    """RULE-006: max_win_x absurdly high (>100k) or zero."""
    findings: list[CritiqueFinding] = []
    mx = float(par.get("limits", {}).get("max_win_x", 0.0))
    if mx == 0:
        findings.append(CritiqueFinding(
            rule_id="RULE-006",
            severity=CritiqueSeverity.WARNING,
            message="max_win_x is 0 — no cap; verify intentional",
            path="/limits/max_win_x",
        ))
    elif mx > 100_000:
        findings.append(CritiqueFinding(
            rule_id="RULE-006",
            severity=CritiqueSeverity.INFO,
            message=f"max_win_x {mx} extreme; many jurisdictions cap at 10000x",
            path="/limits/max_win_x",
        ))
    return findings


_ALL_RULES = [
    _check_dead_symbols,
    _check_unreachable_features,
    _check_rtp_imbalance,
    _check_volatility_mismatch,
    _check_hit_freq_consistency,
    _check_max_win_extremes,
]


def critique_par(par: dict[str, Any]) -> list[CritiqueFinding]:
    """Run all critique rules. Returns aggregated findings (sorted by severity)."""
    findings: list[CritiqueFinding] = []
    for rule in _ALL_RULES:
        findings.extend(rule(par))
    sev_order = {
        CritiqueSeverity.ERROR: 0,
        CritiqueSeverity.WARNING: 1,
        CritiqueSeverity.INFO: 2,
    }
    findings.sort(key=lambda f: (sev_order[f.severity], f.rule_id))
    return findings
