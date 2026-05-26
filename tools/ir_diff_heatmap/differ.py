"""Structural IR differ with per-field impact classification."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


# Prefixes whose changes always trigger HIGH impact rating.
HIGH_IMPACT_PREFIXES: tuple[str, ...] = (
    "paytable",
    "reels.base",
    "reels.free",
    "features.",
    "rng.",
    "topology.",
)

# Prefixes that are MEDIUM impact (configuration, not core math).
MEDIUM_IMPACT_PREFIXES: tuple[str, ...] = (
    "jurisdiction",
    "bet_table",
    "meta.target_rtp",
    "meta.volatility",
)


def _classify_impact(path: str) -> str:
    for pref in HIGH_IMPACT_PREFIXES:
        if path.startswith(pref):
            return "high"
    for pref in MEDIUM_IMPACT_PREFIXES:
        if path.startswith(pref):
            return "medium"
    return "low"


@dataclass
class Change:
    path: str
    kind: str            # "added" | "removed" | "modified"
    old_value: Any = None
    new_value: Any = None
    impact: str = "low"

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "kind": self.kind,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "impact": self.impact,
        }


@dataclass
class DiffReport:
    changes: list[Change] = field(default_factory=list)

    @property
    def n_high(self) -> int:
        return sum(1 for c in self.changes if c.impact == "high")

    @property
    def n_medium(self) -> int:
        return sum(1 for c in self.changes if c.impact == "medium")

    @property
    def n_low(self) -> int:
        return sum(1 for c in self.changes if c.impact == "low")

    @property
    def aggregate_score(self) -> int:
        """Weighted: high=5, medium=2, low=1."""
        return 5 * self.n_high + 2 * self.n_medium + self.n_low

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_changes": len(self.changes),
            "n_high": self.n_high,
            "n_medium": self.n_medium,
            "n_low": self.n_low,
            "aggregate_score": self.aggregate_score,
            "changes": [c.to_dict() for c in self.changes],
        }


def _walk(
    a: Any, b: Any, path: str, changes: list[Change],
) -> None:
    if type(a) is not type(b) and not (
        isinstance(a, (int, float)) and isinstance(b, (int, float))
    ):
        if a is None:
            changes.append(Change(path, "added", None, b,
                                    _classify_impact(path)))
        elif b is None:
            changes.append(Change(path, "removed", a, None,
                                    _classify_impact(path)))
        else:
            changes.append(Change(path, "modified", a, b,
                                    _classify_impact(path)))
        return

    if isinstance(a, dict):
        for k in sorted(set(a.keys()) | set(b.keys())):
            sub_path = f"{path}.{k}" if path else k
            if k not in a:
                changes.append(Change(sub_path, "added", None, b[k],
                                        _classify_impact(sub_path)))
            elif k not in b:
                changes.append(Change(sub_path, "removed", a[k], None,
                                        _classify_impact(sub_path)))
            else:
                _walk(a[k], b[k], sub_path, changes)
        return

    if isinstance(a, list):
        max_len = max(len(a), len(b))
        for i in range(max_len):
            sub_path = f"{path}[{i}]"
            if i >= len(a):
                changes.append(Change(sub_path, "added", None, b[i],
                                        _classify_impact(path)))
            elif i >= len(b):
                changes.append(Change(sub_path, "removed", a[i], None,
                                        _classify_impact(path)))
            else:
                _walk(a[i], b[i], sub_path, changes)
        return

    # Primitives
    if a != b:
        changes.append(Change(path, "modified", a, b,
                                _classify_impact(path)))


def diff_irs(ir_a: dict[str, Any], ir_b: dict[str, Any]) -> DiffReport:
    changes: list[Change] = []
    _walk(ir_a, ir_b, "", changes)
    return DiffReport(changes=changes)


def render_markdown(report: DiffReport) -> str:
    lines = [
        "# IR Diff Heatmap",
        "",
        f"- changes: **{len(report.changes)}**",
        f"- high impact: **{report.n_high}**",
        f"- medium impact: **{report.n_medium}**",
        f"- low impact: **{report.n_low}**",
        f"- aggregate score: **{report.aggregate_score}**",
        "",
        "| Impact | Kind | Path | Old | New |",
        "| --- | --- | --- | --- | --- |",
    ]
    for c in sorted(report.changes, key=lambda x: (-(["low", "medium", "high"].index(x.impact)), x.path)):
        emoji = {"high": "🔴", "medium": "🟡", "low": "⚪"}[c.impact]
        old_repr = "—" if c.old_value is None else repr(c.old_value)[:32]
        new_repr = "—" if c.new_value is None else repr(c.new_value)[:32]
        lines.append(
            f"| {emoji} | {c.kind} | `{c.path}` | {old_repr} | {new_repr} |"
        )
    return "\n".join(lines) + "\n"
