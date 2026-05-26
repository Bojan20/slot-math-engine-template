"""Release notes synthesizer — Conventional Commit log → Markdown."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any


# Conventional Commit regex: type(scope)!?: subject
_CC_RE = re.compile(
    r"^(?P<type>feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert)"
    r"(?:\((?P<scope>[^)]+)\))?(?P<breaking>!)?:\s*(?P<subject>.+)$"
)


@dataclass
class CommitEntry:
    sha: str
    type: str
    scope: str | None
    subject: str
    breaking: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "sha": self.sha,
            "type": self.type,
            "scope": self.scope,
            "subject": self.subject,
            "breaking": self.breaking,
        }


@dataclass
class ReleaseNotes:
    title: str
    version: str
    entries: list[CommitEntry] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)

    def by_type(self) -> dict[str, list[CommitEntry]]:
        out: dict[str, list[CommitEntry]] = {}
        for e in self.entries:
            out.setdefault(e.type, []).append(e)
        return out

    @property
    def n_breaking(self) -> int:
        return sum(1 for e in self.entries if e.breaking)

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "version": self.version,
            "n_entries": len(self.entries),
            "n_breaking": self.n_breaking,
            "stats": dict(self.stats),
            "entries": [e.to_dict() for e in self.entries],
        }


def parse_commits(commit_lines: list[str]) -> list[CommitEntry]:
    """`commit_lines` are `<sha> <subject>` strings from `git log --oneline`."""
    out: list[CommitEntry] = []
    for line in commit_lines:
        line = line.rstrip()
        if not line:
            continue
        parts = line.split(maxsplit=1)
        if len(parts) < 2:
            continue
        sha, rest = parts
        m = _CC_RE.match(rest)
        if not m:
            continue
        out.append(CommitEntry(
            sha=sha,
            type=m.group("type"),
            scope=m.group("scope"),
            subject=m.group("subject"),
            breaking=bool(m.group("breaking")),
        ))
    return out


_TYPE_ORDER = (
    "feat", "fix", "perf", "refactor", "docs", "test", "build",
    "ci", "chore", "style", "revert",
)


_TYPE_HEADING = {
    "feat": "✨ Features",
    "fix": "🐛 Fixes",
    "perf": "⚡ Performance",
    "refactor": "♻️ Refactoring",
    "docs": "📚 Documentation",
    "test": "🧪 Tests",
    "build": "🔧 Build system",
    "ci": "🤖 CI",
    "chore": "🧹 Chores",
    "style": "💄 Style",
    "revert": "⏪ Reverts",
}


def render_markdown(notes: ReleaseNotes) -> str:
    lines = [
        f"# {notes.title}",
        "",
        f"_Version_: **{notes.version}**",
        "",
    ]
    if notes.stats:
        lines.append("## 📊 Stats")
        for k, v in notes.stats.items():
            lines.append(f"- **{k}**: {v}")
        lines.append("")

    if notes.n_breaking:
        lines.append(f"> ⚠️ **{notes.n_breaking} breaking change(s)** included.\n")

    by_type = notes.by_type()
    for t in _TYPE_ORDER:
        if t not in by_type:
            continue
        lines.append(f"## {_TYPE_HEADING.get(t, t)}")
        for e in by_type[t]:
            scope_repr = f"`{e.scope}` " if e.scope else ""
            breaking_repr = "💥 " if e.breaking else ""
            lines.append(
                f"- {breaking_repr}{scope_repr}{e.subject}  _({e.sha[:7]})_"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
