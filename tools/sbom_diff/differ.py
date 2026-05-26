"""SBOM diff — compare two CycloneDX 1.4 documents."""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ComponentDelta:
    purl: str
    name: str
    old_version: str = ""
    new_version: str = ""
    old_sha256: str = ""
    new_sha256: str = ""
    hash_drift: bool = False
    version_drift: bool = False

    @property
    def is_breaking(self) -> bool:
        return self.hash_drift   # hash on existing component changed

    def to_dict(self) -> dict[str, Any]:
        return {
            "purl": self.purl,
            "name": self.name,
            "old_version": self.old_version,
            "new_version": self.new_version,
            "old_sha256": self.old_sha256,
            "new_sha256": self.new_sha256,
            "hash_drift": self.hash_drift,
            "version_drift": self.version_drift,
            "is_breaking": self.is_breaking,
        }


@dataclass
class SBOMDiffReport:
    old_project: str = ""
    new_project: str = ""
    old_version: str = ""
    new_version: str = ""
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    deltas: list[ComponentDelta] = field(default_factory=list)
    entry_points_added: list[str] = field(default_factory=list)
    entry_points_removed: list[str] = field(default_factory=list)

    @property
    def n_breaking(self) -> int:
        return (
            len(self.removed)
            + sum(1 for d in self.deltas if d.is_breaking)
            + len(self.entry_points_removed)
        )

    @property
    def passed(self) -> bool:
        return self.n_breaking == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "old_project": self.old_project,
            "new_project": self.new_project,
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
            "entry_points_added": list(self.entry_points_added),
            "entry_points_removed": list(self.entry_points_removed),
        }


def _component_index(doc: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for c in doc.get("components") or []:
        purl = c.get("purl") or c.get("bom-ref") or c.get("name")
        if purl:
            out[purl] = c
    return out


def _extract_sha256(component: dict[str, Any]) -> str:
    for h in component.get("hashes") or []:
        if (h.get("alg") or "").upper() == "SHA-256":
            return h.get("content", "")
    return ""


def _project_meta(doc: dict[str, Any]) -> tuple[str, str]:
    meta = (doc.get("metadata") or {}).get("component") or {}
    return str(meta.get("name", "")), str(meta.get("version", ""))


def _entry_points_from_annotations(doc: dict[str, Any]) -> dict[str, str]:
    for ann in doc.get("annotations") or []:
        text = ann.get("text") or ""
        if not text:
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        eps = data.get("entry_points")
        if isinstance(eps, dict):
            return {str(k): str(v) for k, v in eps.items()}
    return {}


def diff_sboms(old_doc: dict[str, Any], new_doc: dict[str, Any]) -> SBOMDiffReport:
    old_idx = _component_index(old_doc)
    new_idx = _component_index(new_doc)

    op, ov = _project_meta(old_doc)
    np_, nv = _project_meta(new_doc)
    report = SBOMDiffReport(
        old_project=op, new_project=np_,
        old_version=ov, new_version=nv,
        added=sorted(set(new_idx) - set(old_idx)),
        removed=sorted(set(old_idx) - set(new_idx)),
    )

    for purl in sorted(set(old_idx) & set(new_idx)):
        o = old_idx[purl]
        n = new_idx[purl]
        o_sha = _extract_sha256(o)
        n_sha = _extract_sha256(n)
        o_ver = str(o.get("version", ""))
        n_ver = str(n.get("version", ""))
        if (o_sha != n_sha) or (o_ver != n_ver):
            report.deltas.append(ComponentDelta(
                purl=purl,
                name=str(n.get("name", o.get("name", ""))),
                old_version=o_ver, new_version=n_ver,
                old_sha256=o_sha, new_sha256=n_sha,
                hash_drift=(o_sha != n_sha and bool(o_sha) and bool(n_sha)),
                version_drift=(o_ver != n_ver),
            ))

    old_eps = _entry_points_from_annotations(old_doc)
    new_eps = _entry_points_from_annotations(new_doc)
    report.entry_points_added = sorted(set(new_eps) - set(old_eps))
    report.entry_points_removed = sorted(set(old_eps) - set(new_eps))
    return report


def render_markdown(report: SBOMDiffReport) -> str:
    lines = [
        "# SBOM Diff",
        "",
        f"_Project:_ **{report.old_project or '—'}** → **{report.new_project or '—'}**",
        f"_Version:_ **{report.old_version or '—'}** → **{report.new_version or '—'}**",
        f"_Verdict:_ {'✅ COMPATIBLE' if report.passed else '🔴 BREAKING'}",
        "",
        "## Summary",
        "",
        f"- Added components: **{len(report.added)}**",
        f"- Removed components: **{len(report.removed)}** (🔴 breaking)",
        f"- Drift deltas: **{len(report.deltas)}**",
        f"- Entry-points added: **{len(report.entry_points_added)}**",
        f"- Entry-points removed: **{len(report.entry_points_removed)}** (🔴 breaking)",
        f"- Total breaking: **{report.n_breaking}**",
        "",
    ]
    if report.removed:
        lines.append("## Removed components (🔴)")
        lines.extend(f"- `{p}`" for p in report.removed)
        lines.append("")
    if report.deltas:
        lines.append("## Drift")
        lines.append("")
        lines.append("| purl | name | old ver | new ver | hash drift | version drift |")
        lines.append("|------|------|---------|---------|:----------:|:-------------:|")
        for d in report.deltas:
            lines.append(
                f"| `{d.purl}` | {d.name} | {d.old_version} | {d.new_version} | "
                f"{'🔴' if d.hash_drift else '—'} | "
                f"{'🟡' if d.version_drift else '—'} |"
            )
        lines.append("")
    if report.entry_points_removed:
        lines.append("## Entry points removed (🔴)")
        lines.extend(f"- `{e}`" for e in report.entry_points_removed)
        lines.append("")
    return "\n".join(lines) + "\n"
