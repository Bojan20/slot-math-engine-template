"""Catalog diff — compare two INDEX.json snapshots."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class KernelDelta:
    kernel_id: str
    field_added: list[str] = field(default_factory=list)
    field_removed: list[str] = field(default_factory=list)
    helpers_added: list[str] = field(default_factory=list)
    helpers_removed: list[str] = field(default_factory=list)
    docstring_changed: bool = False
    feature_kinds_added: list[str] = field(default_factory=list)
    feature_kinds_removed: list[str] = field(default_factory=list)

    @property
    def is_breaking(self) -> bool:
        # Field removals + helper removals are contract breakers.
        return bool(self.field_removed) or bool(self.helpers_removed)

    @property
    def has_change(self) -> bool:
        return (
            bool(self.field_added)
            or bool(self.field_removed)
            or bool(self.helpers_added)
            or bool(self.helpers_removed)
            or self.docstring_changed
            or bool(self.feature_kinds_added)
            or bool(self.feature_kinds_removed)
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "kernel_id": self.kernel_id,
            "field_added": list(self.field_added),
            "field_removed": list(self.field_removed),
            "helpers_added": list(self.helpers_added),
            "helpers_removed": list(self.helpers_removed),
            "docstring_changed": self.docstring_changed,
            "feature_kinds_added": list(self.feature_kinds_added),
            "feature_kinds_removed": list(self.feature_kinds_removed),
            "is_breaking": self.is_breaking,
        }


@dataclass
class CatalogDiffReport:
    old_version: str = ""
    new_version: str = ""
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    deltas: list[KernelDelta] = field(default_factory=list)

    @property
    def n_breaking(self) -> int:
        return (
            len(self.removed)
            + sum(1 for d in self.deltas if d.is_breaking)
        )

    @property
    def passed(self) -> bool:
        return self.n_breaking == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "old_version": self.old_version,
            "new_version": self.new_version,
            "n_added": len(self.added),
            "n_removed": len(self.removed),
            "n_deltas": len(self.deltas),
            "n_breaking": self.n_breaking,
            "passed": self.passed,
            "added": list(self.added),
            "removed": list(self.removed),
            "deltas": [d.to_dict() for d in self.deltas],
        }


def _index_entries_by_id(index: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for entry in index.get("entries") or []:
        if isinstance(entry, dict) and entry.get("kernel_id"):
            out[entry["kernel_id"]] = entry
    return out


def diff_indices(
    old_index: dict[str, Any],
    new_index: dict[str, Any],
) -> CatalogDiffReport:
    old_by_id = _index_entries_by_id(old_index)
    new_by_id = _index_entries_by_id(new_index)

    report = CatalogDiffReport(
        old_version=str(old_index.get("version", "")),
        new_version=str(new_index.get("version", "")),
        added=sorted(set(new_by_id) - set(old_by_id)),
        removed=sorted(set(old_by_id) - set(new_by_id)),
    )

    for kid in sorted(set(new_by_id) & set(old_by_id)):
        o = old_by_id[kid]
        n = new_by_id[kid]
        of = set(o.get("params_fields") or [])
        nf = set(n.get("params_fields") or [])
        oh = set(o.get("helpers") or [])
        nh = set(n.get("helpers") or [])
        ofk = set(o.get("feature_kinds") or [])
        nfk = set(n.get("feature_kinds") or [])
        delta = KernelDelta(
            kernel_id=kid,
            field_added=sorted(nf - of),
            field_removed=sorted(of - nf),
            helpers_added=sorted(nh - oh),
            helpers_removed=sorted(oh - nh),
            docstring_changed=(o.get("docstring") or "")
                              != (n.get("docstring") or ""),
            feature_kinds_added=sorted(nfk - ofk),
            feature_kinds_removed=sorted(ofk - nfk),
        )
        if delta.has_change:
            report.deltas.append(delta)
    return report


def render_markdown(report: CatalogDiffReport) -> str:
    lines = [
        "# Catalog Diff",
        "",
        f"_Old version:_ **{report.old_version or '—'}**",
        f"_New version:_ **{report.new_version or '—'}**",
        f"_Verdict:_ {'✅ COMPATIBLE' if report.passed else '🔴 BREAKING'}",
        "",
        "## Summary",
        "",
        f"- Added kernels: **{len(report.added)}**",
        f"- Removed kernels: **{len(report.removed)}**",
        f"- Deltas: **{len(report.deltas)}**",
        f"- Breaking total: **{report.n_breaking}**",
        "",
    ]
    if report.added:
        lines.append("## Added")
        lines.extend(f"- `{k}`" for k in report.added)
        lines.append("")
    if report.removed:
        lines.append("## Removed (🔴 breaking)")
        lines.extend(f"- `{k}`" for k in report.removed)
        lines.append("")
    if report.deltas:
        lines.append("## Per-kernel deltas")
        lines.append("")
        lines.append("| Kernel | Fields ± | Helpers ± | Doc | Feature kinds ± | Breaking |")
        lines.append("|--------|----------|-----------|:---:|-----------------|:--------:|")
        for d in report.deltas:
            ftxt = (
                ("+" + ",".join(d.field_added) if d.field_added else "")
                + (" -" + ",".join(d.field_removed) if d.field_removed else "")
            ) or "—"
            htxt = (
                ("+" + ",".join(d.helpers_added) if d.helpers_added else "")
                + (" -" + ",".join(d.helpers_removed) if d.helpers_removed else "")
            ) or "—"
            ftk = (
                ("+" + ",".join(d.feature_kinds_added)
                 if d.feature_kinds_added else "")
                + (" -" + ",".join(d.feature_kinds_removed)
                   if d.feature_kinds_removed else "")
            ) or "—"
            doc = "🔄" if d.docstring_changed else "—"
            brk = "🔴" if d.is_breaking else "—"
            lines.append(
                f"| `{d.kernel_id}` | {ftxt} | {htxt} | {doc} | {ftk} | {brk} |"
            )
        lines.append("")
    return "\n".join(lines) + "\n"
