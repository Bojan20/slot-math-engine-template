"""Designer sanity linter — catch typical mistakes before MC."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class LintIssue:
    rule: str
    severity: str           # "error" | "warning"
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule": self.rule,
            "severity": self.severity,
            "message": self.message,
        }


@dataclass
class LintReport:
    issues: list[LintIssue] = field(default_factory=list)

    @property
    def n_errors(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")

    @property
    def n_warnings(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")

    @property
    def passed(self) -> bool:
        return self.n_errors == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "n_errors": self.n_errors,
            "n_warnings": self.n_warnings,
            "issues": [i.to_dict() for i in self.issues],
        }


# ─── Rules ─────────────────────────────────────────────────────────


Rule = Callable[[dict[str, Any]], list[LintIssue]]


def _r_target_rtp_present(ir: dict[str, Any]) -> list[LintIssue]:
    meta = ir.get("meta") or {}
    if "target_rtp" not in meta:
        return [LintIssue(
            "target_rtp_present", "error",
            "meta.target_rtp missing — every IR must declare its target RTP",
        )]
    return []


def _r_target_rtp_in_range(ir: dict[str, Any]) -> list[LintIssue]:
    meta = ir.get("meta") or {}
    t = meta.get("target_rtp")
    if isinstance(t, (int, float)):
        norm = t / 100.0 if t > 1.5 else t
        if norm < 0.5 or norm > 1.0:
            return [LintIssue(
                "target_rtp_in_range", "error",
                f"meta.target_rtp {t} unrealistic (0.5 ≤ rtp ≤ 1.0 expected)",
            )]
    return []


def _r_paytable_nonempty(ir: dict[str, Any]) -> list[LintIssue]:
    if not ir.get("paytable"):
        return [LintIssue(
            "paytable_nonempty", "error",
            "paytable must have at least one row",
        )]
    return []


def _r_no_duplicate_paytable_rows(ir: dict[str, Any]) -> list[LintIssue]:
    pt = ir.get("paytable") or []
    seen: set[tuple] = set()
    dupes: list[tuple] = []
    for row in pt:
        if not isinstance(row, dict):
            continue
        combo = tuple(row.get("combo") or [])
        if combo in seen:
            dupes.append(combo)
        seen.add(combo)
    return [
        LintIssue("no_duplicate_paytable_rows", "warning",
                   f"duplicate combo {list(c)} in paytable")
        for c in dupes
    ]


def _r_no_orphan_symbols(ir: dict[str, Any]) -> list[LintIssue]:
    """Symbols appearing in paytable combos must appear on at least one reel."""
    reels = (ir.get("reels") or {}).get("base") or []
    on_reels: set[str] = set()
    for strip in reels:
        for s in strip:
            on_reels.add(s)
    if not on_reels:
        return []
    issues: list[LintIssue] = []
    for row in ir.get("paytable") or []:
        if not isinstance(row, dict):
            continue
        for s in row.get("combo") or []:
            if s not in on_reels:
                issues.append(LintIssue(
                    "no_orphan_symbols", "warning",
                    f"symbol {s!r} pays in paytable but never appears on a reel",
                ))
    return issues


def _r_volatility_label_known(ir: dict[str, Any]) -> list[LintIssue]:
    meta = ir.get("meta") or {}
    v = meta.get("volatility")
    if v is None:
        return []
    if str(v).lower() not in ("low", "medium", "high", "extreme"):
        return [LintIssue(
            "volatility_label_known", "warning",
            f"meta.volatility {v!r} is not a standard tier label",
        )]
    return []


def _r_feature_kinds_unique(ir: dict[str, Any]) -> list[LintIssue]:
    feats = ir.get("features") or []
    kinds: list[str] = []
    for f in feats:
        if isinstance(f, dict) and f.get("kind"):
            kinds.append(f["kind"])
    dupes = {k for k in kinds if kinds.count(k) > 1}
    return [LintIssue(
        "feature_kinds_unique", "warning",
        f"feature kind {k!r} declared more than once",
    ) for k in dupes]


DEFAULT_RULES: list[tuple[str, Rule]] = [
    ("target_rtp_present", _r_target_rtp_present),
    ("target_rtp_in_range", _r_target_rtp_in_range),
    ("paytable_nonempty", _r_paytable_nonempty),
    ("no_duplicate_paytable_rows", _r_no_duplicate_paytable_rows),
    ("no_orphan_symbols", _r_no_orphan_symbols),
    ("volatility_label_known", _r_volatility_label_known),
    ("feature_kinds_unique", _r_feature_kinds_unique),
]


def lint_ir(
    ir: dict[str, Any],
    *,
    rules: list[tuple[str, Rule]] | None = None,
) -> LintReport:
    rules = rules or DEFAULT_RULES
    out: list[LintIssue] = []
    for _name, rule in rules:
        out.extend(rule(ir))
    return LintReport(issues=out)
