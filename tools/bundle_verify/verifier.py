"""Re-hash an export bundle and verify against manifest."""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class VerifyEntry:
    name: str
    rel_path: str
    expected_sha256: str
    actual_sha256: str | None
    expected_size: int
    actual_size: int | None
    status: str           # "ok" | "mismatch" | "missing"

    @property
    def passed(self) -> bool:
        return self.status == "ok"

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "rel_path": self.rel_path,
            "expected_sha256": self.expected_sha256,
            "actual_sha256": self.actual_sha256,
            "expected_size": self.expected_size,
            "actual_size": self.actual_size,
            "status": self.status,
        }


@dataclass
class VerifyReport:
    bundle_dir: str
    entries: list[VerifyEntry] = field(default_factory=list)

    @property
    def n_failed(self) -> int:
        return sum(1 for e in self.entries if not e.passed)

    @property
    def passed(self) -> bool:
        return self.n_failed == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "bundle_dir": self.bundle_dir,
            "n_entries": len(self.entries),
            "n_failed": self.n_failed,
            "passed": self.passed,
            "entries": [e.to_dict() for e in self.entries],
        }


def verify_bundle(bundle_dir: Path | str) -> VerifyReport:
    bundle_dir = Path(bundle_dir)
    manifest_path = bundle_dir / "manifest.json"
    report = VerifyReport(bundle_dir=str(bundle_dir))
    if not manifest_path.exists():
        return report
    manifest = json.loads(manifest_path.read_text())
    for entry in manifest.get("entries") or []:
        rel = entry.get("rel_path") or entry.get("name")
        p = bundle_dir / rel
        if not p.exists():
            report.entries.append(VerifyEntry(
                name=entry.get("name", rel),
                rel_path=rel,
                expected_sha256=entry.get("sha256", ""),
                actual_sha256=None,
                expected_size=int(entry.get("size_bytes", 0)),
                actual_size=None,
                status="missing",
            ))
            continue
        data = p.read_bytes()
        actual = hashlib.sha256(data).hexdigest()
        if actual == entry.get("sha256") and len(data) == entry.get("size_bytes"):
            status = "ok"
        else:
            status = "mismatch"
        report.entries.append(VerifyEntry(
            name=entry.get("name", rel),
            rel_path=rel,
            expected_sha256=entry.get("sha256", ""),
            actual_sha256=actual,
            expected_size=int(entry.get("size_bytes", 0)),
            actual_size=len(data),
            status=status,
        ))
    return report
