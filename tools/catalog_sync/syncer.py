"""Catalog syncer — introspect tools.solvers + W48/W41 metadata."""
from __future__ import annotations
import hashlib
import importlib
import json
import pkgutil
from dataclasses import dataclass, field, is_dataclass, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class CatalogEntry:
    kernel_id: str
    module: str
    params_class: str = ""
    params_fields: list[str] = field(default_factory=list)
    has_analytical_rtp: bool = False
    has_mc_simulate: bool = False
    helpers: list[str] = field(default_factory=list)
    docstring: str = ""
    feature_kinds: list[str] = field(default_factory=list)
    related_kernels: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kernel_id": self.kernel_id,
            "module": self.module,
            "params_class": self.params_class,
            "params_fields": list(self.params_fields),
            "has_analytical_rtp": self.has_analytical_rtp,
            "has_mc_simulate": self.has_mc_simulate,
            "helpers": list(self.helpers),
            "docstring": self.docstring,
            "feature_kinds": list(self.feature_kinds),
            "related_kernels": list(self.related_kernels),
        }


@dataclass
class CatalogReport:
    version: str
    generated_at_utc: str
    entries: list[CatalogEntry] = field(default_factory=list)

    @property
    def n_kernels(self) -> int:
        return len(self.entries)

    @property
    def n_with_analytical(self) -> int:
        return sum(1 for e in self.entries if e.has_analytical_rtp)

    @property
    def n_with_mc(self) -> int:
        return sum(1 for e in self.entries if e.has_mc_simulate)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "generated_at_utc": self.generated_at_utc,
            "n_kernels": self.n_kernels,
            "n_with_analytical": self.n_with_analytical,
            "n_with_mc": self.n_with_mc,
            "entries": [e.to_dict() for e in self.entries],
        }


_SEMVER_SEP = "."


def next_semver(prev: str | None, *, bump: str = "patch") -> str:
    """Compute the next SemVer string. Defaults to patch-bump on every
    sync; pass ``bump='minor'`` or ``'major'`` when shipping a real
    breaking change."""
    if not prev:
        return "0.1.0"
    try:
        major, minor, patch = [int(x) for x in prev.split(_SEMVER_SEP)[:3]]
    except (ValueError, IndexError):
        return "0.1.0"
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scan_solvers(*, include_docstrings: bool) -> list[CatalogEntry]:
    """Walk `tools.solvers` and introspect every kernel module."""
    pkg = importlib.import_module("tools.solvers")
    entries: list[CatalogEntry] = []
    for mod_info in pkgutil.iter_modules(pkg.__path__):
        name = mod_info.name
        if name.startswith("_"):
            continue
        try:
            mod = importlib.import_module(f"tools.solvers.{name}")
        except Exception:
            continue
        params_cls = None
        for k in dir(mod):
            obj = getattr(mod, k)
            if is_dataclass(obj) and "Params" in k:
                params_cls = obj
                break
        if params_cls is None:
            continue
        fnames = [f.name for f in fields(params_cls)]
        helpers = sorted(
            k for k in dir(mod)
            if (
                callable(getattr(mod, k))
                and not k.startswith("_")
                and k not in ("analytical_rtp", "mc_simulate", params_cls.__name__)
            )
        )
        doc = (mod.__doc__ or "").strip() if include_docstrings else ""
        entries.append(CatalogEntry(
            kernel_id=name,
            module=f"tools.solvers.{name}",
            params_class=params_cls.__name__,
            params_fields=fnames,
            has_analytical_rtp=hasattr(mod, "analytical_rtp"),
            has_mc_simulate=hasattr(mod, "mc_simulate"),
            helpers=helpers,
            docstring=doc,
        ))
    entries.sort(key=lambda e: e.kernel_id)
    return entries


def _attach_feature_kinds(entries: list[CatalogEntry]) -> None:
    """Best-effort: link each kernel to feature kinds via W41 catalog."""
    try:
        from tools.feature_coverage.auditor import FEATURE_KIND_TO_KERNEL
    except Exception:
        return
    rev: dict[str, list[str]] = {}
    for kind, kernel in FEATURE_KIND_TO_KERNEL.items():
        rev.setdefault(kernel, []).append(kind)
    for e in entries:
        e.feature_kinds = sorted(rev.get(e.kernel_id, []))


def _attach_related(entries: list[CatalogEntry]) -> None:
    """Cheap heuristic — kernels sharing a Params field name are
    candidates for kernel-compare proportionality checks."""
    by_field: dict[str, list[str]] = {}
    for e in entries:
        for f in e.params_fields:
            by_field.setdefault(f, []).append(e.kernel_id)
    for e in entries:
        related: set[str] = set()
        for f in e.params_fields:
            for other in by_field.get(f, []):
                if other != e.kernel_id:
                    related.add(other)
        # Cap at 10 to keep the index compact
        e.related_kernels = sorted(related)[:10]


def _checksum_lines(out_dir: Path) -> list[str]:
    lines: list[str] = []
    for p in sorted(out_dir.iterdir()):
        if not p.is_file() or p.name == "checksums.txt":
            continue
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        lines.append(f"{digest}  {p.name}")
    return lines


def build_catalog(
    out_dir: Path,
    *,
    bump: str = "patch",
    include_docstrings: bool = True,
    prev_version: str | None = None,
) -> CatalogReport:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if prev_version is None:
        vpath = out_dir / "version.txt"
        if vpath.exists():
            prev_version = vpath.read_text().strip()
    new_version = next_semver(prev_version, bump=bump)

    entries = _scan_solvers(include_docstrings=include_docstrings)
    _attach_feature_kinds(entries)
    _attach_related(entries)

    report = CatalogReport(
        version=new_version,
        generated_at_utc=_now_utc(),
        entries=entries,
    )

    (out_dir / "INDEX.json").write_text(
        json.dumps(report.to_dict(), indent=2, sort_keys=True)
    )
    (out_dir / "INDEX.md").write_text(render_index_md(report))
    (out_dir / "version.txt").write_text(new_version + "\n")

    checksums = _checksum_lines(out_dir)
    (out_dir / "checksums.txt").write_text("\n".join(checksums) + "\n")

    return report


def render_index_md(report: CatalogReport) -> str:
    lines = [
        "# Slot-Math Solver Catalog",
        "",
        f"_Version:_ **{report.version}**",
        f"_Generated:_ {report.generated_at_utc}",
        "",
        "## Summary",
        "",
        f"- Kernels: **{report.n_kernels}**",
        f"- With `analytical_rtp`: **{report.n_with_analytical}**",
        f"- With `mc_simulate`: **{report.n_with_mc}**",
        "",
        "## Kernels",
        "",
        "| # | Kernel id | Params | Helpers | Feature kinds |",
        "|---|-----------|--------|---------|---------------|",
    ]
    for i, e in enumerate(report.entries, 1):
        feat = ", ".join(e.feature_kinds) if e.feature_kinds else "—"
        helpers = ", ".join(e.helpers[:5]) + (
            f" (+{len(e.helpers) - 5} more)" if len(e.helpers) > 5 else ""
        ) if e.helpers else "—"
        lines.append(
            f"| {i} | `{e.kernel_id}` | `{e.params_class}` "
            f"({len(e.params_fields)} fields) | {helpers} | {feat} |"
        )
    lines.append("")
    return "\n".join(lines) + "\n"
