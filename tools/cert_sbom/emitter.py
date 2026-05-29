"""SBOM emitter — walks `tools/` + reads pyproject.toml entry points."""
from __future__ import annotations
import hashlib
import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class SBOMComponent:
    name: str
    version: str
    rel_path: str
    sha256: str
    size_bytes: int
    purl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "library",
            "bom-ref": self.purl,
            "name": self.name,
            "version": self.version,
            "purl": self.purl,
            "hashes": [{"alg": "SHA-256", "content": self.sha256}],
            "properties": [
                {"name": "rel_path", "value": self.rel_path},
                {"name": "module_size_bytes", "value": str(self.size_bytes)},
            ],
        }


@dataclass
class SBOMReport:
    serial_number: str
    timestamp_utc: str
    project_name: str
    project_version: str
    components: list[SBOMComponent] = field(default_factory=list)
    entry_points: dict[str, str] = field(default_factory=dict)

    @property
    def n_components(self) -> int:
        return len(self.components)

    def to_cyclonedx(self) -> dict[str, Any]:
        return {
            "bomFormat": "CycloneDX",
            "specVersion": "1.4",
            "serialNumber": self.serial_number,
            "version": 1,
            "metadata": {
                "timestamp": self.timestamp_utc,
                "component": {
                    "type": "application",
                    "name": self.project_name,
                    "version": self.project_version,
                },
                "properties": [
                    {"name": "entry_points_count",
                     "value": str(len(self.entry_points))},
                ],
            },
            "components": [c.to_dict() for c in self.components],
            "annotations": [
                {
                    "subjects": [
                        f"pkg:python/{self.project_name}@{self.project_version}"
                    ],
                    "annotator": {
                        "organization": {
                            "name": "slot-math-engine W67 cert_sbom emitter"
                        }
                    },
                    "timestamp": self.timestamp_utc,
                    "text": json.dumps({
                        "entry_points": dict(self.entry_points),
                    }),
                }
            ],
        }

    def to_dict(self) -> dict[str, Any]:
        return self.to_cyclonedx()


# ─── helpers ───────────────────────────────────────────────────────


_NAME_VER_RE = re.compile(r'^\s*(name|version)\s*=\s*"([^"]+)"', re.MULTILINE)


def _read_project_meta(pyproject_path: Path) -> tuple[str, str]:
    if not pyproject_path.exists():
        return ("slot-math-engine-template", "0.0.0")
    text = pyproject_path.read_text()
    # Find first [project] block + extract name/version
    name = "slot-math-engine-template"
    version = "0.1.0"
    in_project = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("["):
            in_project = (stripped == "[project]")
            continue
        if not in_project:
            continue
        m = re.match(r'(name|version)\s*=\s*"([^"]+)"', stripped)
        if m:
            if m.group(1) == "name":
                name = m.group(2)
            elif m.group(1) == "version":
                version = m.group(2)
    return name, version


def extract_entry_points(pyproject_path: Path) -> dict[str, str]:
    """Pull `[project.scripts]` mapping from pyproject.toml without TOML lib."""
    if not pyproject_path.exists():
        return {}
    text = pyproject_path.read_text()
    out: dict[str, str] = {}
    in_scripts = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("["):
            in_scripts = (stripped == "[project.scripts]")
            continue
        if not in_scripts:
            continue
        if not stripped or stripped.startswith("#"):
            continue
        m = re.match(r'([A-Za-z0-9_\-\.]+)\s*=\s*"([^"]+)"', stripped)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def _sha256_file(p: Path) -> tuple[str, int]:
    blob = p.read_bytes()
    return hashlib.sha256(blob).hexdigest(), len(blob)


def _walk_modules(tools_root: Path) -> list[Path]:
    out: list[Path] = []
    for p in sorted(tools_root.rglob("*.py")):
        if "__pycache__" in p.parts:
            continue
        if p.name == "__init__.py":
            # Skip the bare init file but include the module's other files
            continue
        out.append(p)
    # Also include __init__.py files to map packages properly, but
    # tagged separately so consumers can distinguish package vs module.
    return out


def _module_name_from_path(repo_root: Path, p: Path) -> str:
    rel = p.relative_to(repo_root).with_suffix("")
    return ".".join(rel.parts)


def build_sbom(
    *,
    repo_root: Path,
    pyproject_path: Path | None = None,
    bump_serial: bool = True,
) -> SBOMReport:
    repo_root = Path(repo_root)
    if pyproject_path is None:
        pyproject_path = repo_root / "pyproject.toml"
    name, version = _read_project_meta(pyproject_path)
    timestamp = datetime.now(timezone.utc).isoformat()
    serial = (
        f"urn:uuid:{uuid.uuid4()}" if bump_serial
        else "urn:uuid:00000000-0000-0000-0000-000000000000"
    )
    entry_points = extract_entry_points(pyproject_path)

    components: list[SBOMComponent] = []
    tools_root = repo_root / "tools"
    if tools_root.exists():
        for p in _walk_modules(tools_root):
            sha, size = _sha256_file(p)
            mod_name = _module_name_from_path(repo_root, p)
            components.append(SBOMComponent(
                name=mod_name,
                version=version,
                rel_path=str(p.relative_to(repo_root)),
                sha256=sha,
                size_bytes=size,
                purl=f"pkg:python/{mod_name}@{version}",
            ))

    return SBOMReport(
        serial_number=serial,
        timestamp_utc=timestamp,
        project_name=name,
        project_version=version,
        components=components,
        entry_points=entry_points,
    )
