"""PHASE 42 — Semantic IR diff kernel."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


_MATH_PREFIXES = (
    "paytable",
    "reels",
    "features",
    "topology.reels",
    "topology.rows",
    "topology.paylines",
    "topology.shape",
    "meta.target_rtp",
    "meta.max_win_x",
    "meta.target_volatility",
)

_COSMETIC_PREFIXES = (
    "meta.name",
    "meta.notes",
    "meta.design_audit",
    "meta.copilot_log",
    "meta._feature_share_total",
    "meta._base_game_share_target",
    "meta.vendor_style",
)


@dataclass(frozen=True)
class DiffEntry:
    path: str
    category: str       # "MATH" / "COSMETIC" / "UNKNOWN"
    kind: str           # "added" / "removed" / "changed"
    before: Any = None
    after: Any = None


@dataclass
class DiffReport:
    schema_version: str = "urn:slotmath:ir-diff-semantic:v1"
    math_entries: list[DiffEntry] = field(default_factory=list)
    cosmetic_entries: list[DiffEntry] = field(default_factory=list)
    unknown_entries: list[DiffEntry] = field(default_factory=list)

    @property
    def math_change_count(self) -> int:
        return len(self.math_entries)

    @property
    def total_changes(self) -> int:
        return (
            len(self.math_entries) + len(self.cosmetic_entries)
            + len(self.unknown_entries)
        )

    @property
    def verdict(self) -> str:
        if self.math_entries:
            return "MATH_CHANGED"
        if self.cosmetic_entries:
            return "COSMETIC_ONLY"
        if self.unknown_entries:
            return "UNKNOWN_FIELDS_ONLY"
        return "IDENTICAL"


def _classify(path: str) -> str:
    for p in _MATH_PREFIXES:
        if path == p or path.startswith(p + ".") or path.startswith(p + "["):
            return "MATH"
    for p in _COSMETIC_PREFIXES:
        if path == p or path.startswith(p + ".") or path.startswith(p + "["):
            return "COSMETIC"
    return "UNKNOWN"


def _walk(obj_a: Any, obj_b: Any, path: str, entries: list[DiffEntry]) -> None:
    if isinstance(obj_a, dict) and isinstance(obj_b, dict):
        keys = sorted(set(obj_a) | set(obj_b))
        for k in keys:
            new_path = f"{path}.{k}" if path else k
            if k not in obj_a:
                entries.append(DiffEntry(
                    path=new_path, category=_classify(new_path),
                    kind="added", before=None, after=obj_b[k],
                ))
            elif k not in obj_b:
                entries.append(DiffEntry(
                    path=new_path, category=_classify(new_path),
                    kind="removed", before=obj_a[k], after=None,
                ))
            else:
                _walk(obj_a[k], obj_b[k], new_path, entries)
        return
    if isinstance(obj_a, list) and isinstance(obj_b, list):
        max_len = max(len(obj_a), len(obj_b))
        for i in range(max_len):
            new_path = f"{path}[{i}]"
            if i >= len(obj_a):
                entries.append(DiffEntry(
                    path=new_path, category=_classify(new_path),
                    kind="added", before=None, after=obj_b[i],
                ))
            elif i >= len(obj_b):
                entries.append(DiffEntry(
                    path=new_path, category=_classify(new_path),
                    kind="removed", before=obj_a[i], after=None,
                ))
            else:
                _walk(obj_a[i], obj_b[i], new_path, entries)
        return
    if obj_a != obj_b:
        entries.append(DiffEntry(
            path=path or "", category=_classify(path),
            kind="changed", before=obj_a, after=obj_b,
        ))


def semantic_diff(ir_a: dict[str, Any], ir_b: dict[str, Any]) -> DiffReport:
    """Compare two IR dicts; return DiffReport."""
    if not isinstance(ir_a, dict) or not isinstance(ir_b, dict):
        raise TypeError("both IRs must be dicts")
    entries: list[DiffEntry] = []
    _walk(ir_a, ir_b, "", entries)
    report = DiffReport()
    for e in entries:
        if e.category == "MATH":
            report.math_entries.append(e)
        elif e.category == "COSMETIC":
            report.cosmetic_entries.append(e)
        else:
            report.unknown_entries.append(e)
    return report


def render_patch_md(report: DiffReport) -> str:
    out: list[str] = []
    out.append(f"# Semantic IR Diff")
    out.append("")
    out.append(f"> Schema: `{report.schema_version}`")
    out.append(f"> Verdict: **{report.verdict}**")
    out.append("")
    out.append(f"## Summary")
    out.append("")
    out.append(f"- MATH changes:     **{len(report.math_entries)}**")
    out.append(f"- COSMETIC changes: **{len(report.cosmetic_entries)}**")
    out.append(f"- UNKNOWN changes:  **{len(report.unknown_entries)}**")
    out.append("")
    for cat, entries in (
        ("MATH", report.math_entries),
        ("COSMETIC", report.cosmetic_entries),
        ("UNKNOWN", report.unknown_entries),
    ):
        if not entries:
            continue
        out.append(f"## {cat}")
        out.append("")
        out.append("| Path | Kind | Before | After |")
        out.append("|---|---|---|---|")
        for e in entries:
            out.append(
                f"| `{e.path}` | {e.kind} | `{e.before}` | `{e.after}` |"
            )
        out.append("")
    return "\n".join(out)
