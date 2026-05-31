"""SLOT-MATH Faza 6.8 — Real-time bug-bounty hook.

Per-build automatic Stryker mutation runner + delta reporter.
If new commit introduces surviving mutants, file a bug report
into reports/bug-bounty/ for triage.

Stub implementation — actual Stryker integration lives in scripts/.
This module manages bug report DTOs + persistence.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path


class BugSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class BugBountyConfig:
    repo_root: Path
    reports_dir: Path
    mutation_score_threshold: float = 95.0  # below this → file bug


@dataclass
class BugReport:
    id: str                              # auto-derived from commit + module
    commit_sha: str
    module: str
    severity: BugSeverity
    title: str
    description: str
    suggested_fix: str = ""
    filed_at_unix: int = 0
    resolved_at_unix: int | None = None
    tags: list[str] = field(default_factory=list)


def _bug_id(commit_sha: str, module: str) -> str:
    return f"BB-{commit_sha[:7]}-{module.replace('/', '_').replace('.', '_')[:32]}"


def file_bug_report(
    config: BugBountyConfig,
    commit_sha: str,
    module: str,
    severity: BugSeverity,
    title: str,
    description: str,
    suggested_fix: str = "",
    tags: list[str] | None = None,
) -> BugReport:
    report = BugReport(
        id=_bug_id(commit_sha, module),
        commit_sha=commit_sha,
        module=module,
        severity=severity,
        title=title,
        description=description,
        suggested_fix=suggested_fix,
        filed_at_unix=int(time.time()),
        tags=tags or [],
    )
    config.reports_dir.mkdir(parents=True, exist_ok=True)
    path = config.reports_dir / f"{report.id}.json"
    path.write_text(json.dumps(asdict(report), sort_keys=True, indent=2) + "\n")
    return report


def list_open_bugs(config: BugBountyConfig) -> list[BugReport]:
    """List all bug reports where resolved_at_unix is None."""
    out: list[BugReport] = []
    if not config.reports_dir.exists():
        return out
    for p in sorted(config.reports_dir.glob("BB-*.json")):
        try:
            data = json.loads(p.read_text())
        except json.JSONDecodeError:
            continue
        if data.get("resolved_at_unix") is None:
            data["severity"] = BugSeverity(data["severity"])
            data.setdefault("tags", [])
            data.setdefault("suggested_fix", "")
            out.append(BugReport(**data))
    return out
