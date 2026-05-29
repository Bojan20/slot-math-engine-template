"""Changelog generator — parse `git log --pretty=...` over tools/.

Public surface:
  • `parse_log(log_text)` → list[ChangelogEntry]
  • `build_changelog(entries)` → Changelog (group + render markdown)
"""
from __future__ import annotations
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


GIT_PRETTY = "%H%x09%aI%x09%an%x09%s"
WAVE_RE = re.compile(
    r"^(?:feat|fix|refactor|perf|test|docs|chore|build|ci)"
    r"\(([^)]+)\)\s*:\s*(.+)$"
)
TYPE_RE = re.compile(
    r"^(feat|fix|refactor|perf|test|docs|chore|build|ci)"
    r"(?:\(([^)]+)\))?\s*:\s*(.+)$"
)


@dataclass
class ChangelogEntry:
    commit_hash: str
    iso_date: str
    author: str
    subject: str
    type: str = "other"
    scope: str | None = None

    def to_dict(self) -> dict:
        return {
            "commit_hash": self.commit_hash,
            "iso_date": self.iso_date,
            "author": self.author,
            "subject": self.subject,
            "type": self.type,
            "scope": self.scope,
        }


@dataclass
class Changelog:
    entries: list[ChangelogEntry] = field(default_factory=list)
    repo_root: str = ""

    def by_scope(self) -> dict[str, list[ChangelogEntry]]:
        out: dict[str, list[ChangelogEntry]] = {}
        for e in self.entries:
            key = e.scope or e.type or "other"
            out.setdefault(key, []).append(e)
        return out

    def by_type(self) -> dict[str, list[ChangelogEntry]]:
        out: dict[str, list[ChangelogEntry]] = {}
        for e in self.entries:
            out.setdefault(e.type, []).append(e)
        return out

    def to_dict(self) -> dict:
        return {
            "repo_root": self.repo_root,
            "n_entries": len(self.entries),
            "by_scope": {
                k: [e.to_dict() for e in v]
                for k, v in self.by_scope().items()
            },
        }

    def to_markdown(self) -> str:
        lines = [
            "# Changelog",
            "",
            f"_{len(self.entries)} commits_",
            "",
        ]
        scopes = self.by_scope()
        # Stable wave-id sort: Wxx numerically when possible
        def _scope_key(s: str) -> tuple:
            m = re.match(r"^W(\d+)(.*)$", s)
            if m:
                return (0, int(m.group(1)), m.group(2))
            return (1, 0, s)
        for scope in sorted(scopes.keys(), key=_scope_key):
            entries = scopes[scope]
            lines.append(f"## {scope}")
            lines.append("")
            for e in entries:
                short = e.commit_hash[:7]
                lines.append(
                    f"- `{short}` ({e.iso_date[:10]}) **{e.type}**: "
                    f"{e.subject}"
                )
            lines.append("")
        return "\n".join(lines) + "\n"


def parse_log(log_text: str) -> list[ChangelogEntry]:
    """Parse `git log --pretty='%H\\t%aI\\t%an\\t%s'` output."""
    entries: list[ChangelogEntry] = []
    for line in log_text.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 3)
        if len(parts) < 4:
            continue
        sha, iso_date, author, subject = parts
        m = WAVE_RE.match(subject)
        scope = None
        if m:
            scope_raw = m.group(1)
            # If scope smells like a wave id (e.g. W4.9, W4.9b, P1.6)
            if re.match(r"^[WP]\d", scope_raw):
                scope = scope_raw.split("+", 1)[0].strip()
        m2 = TYPE_RE.match(subject)
        if m2:
            ctype = m2.group(1)
        else:
            ctype = "other"
        entries.append(ChangelogEntry(
            commit_hash=sha.strip(),
            iso_date=iso_date.strip(),
            author=author.strip(),
            subject=subject.strip(),
            type=ctype,
            scope=scope,
        ))
    return entries


def _run_git(repo_root: Path, *, paths: Iterable[str] = ("tools/",),
              max_commits: int = 1000) -> str:
    cmd = [
        "git", "log", f"--pretty=format:{GIT_PRETTY}",
        "-n", str(max_commits), "--",
    ] + list(paths)
    try:
        out = subprocess.run(
            cmd, cwd=str(repo_root), capture_output=True,
            check=True, text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""
    return out.stdout


def build_changelog(
    repo_root: Path,
    *,
    paths: Iterable[str] = ("tools/",),
    max_commits: int = 1000,
    log_text: str | None = None,
) -> Changelog:
    """Run `git log` over `paths` inside `repo_root` (or use the
    provided `log_text` directly, useful for tests)."""
    repo_root = Path(repo_root)
    if log_text is None:
        log_text = _run_git(repo_root, paths=paths,
                              max_commits=max_commits)
    entries = parse_log(log_text)
    return Changelog(entries=entries, repo_root=str(repo_root))
