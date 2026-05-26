"""Main drift sentinel — scan a games directory, compute drift per IR.

Drift classification (absolute RTP delta vs baseline):
  • green   < 0.005     (within MC noise)
  • yellow  < 0.01      (advisory)
  • red     ≥ 0.01      (regression candidate — block CI)

Status classes per IR:
  • UNCHANGED  — fingerprint identical, RTP unchanged
  • NEW        — IR not seen before; baseline seeded
  • DRIFTED    — fingerprint or RTP changed; drift severity attached
  • REMOVED    — baseline entry exists but no file found this scan
  • ERROR      — IR could not be loaded / parsed
"""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Iterable

from tools.drift_sentinel.baselines import (
    load_baselines,
    save_baselines,
    DEFAULT_NAME,
)
from tools.drift_sentinel.scanner import (
    bernoulli_rtp_estimate,
    fingerprint,
)


class DriftClass(str, Enum):
    UNCHANGED = "unchanged"
    NEW = "new"
    DRIFTED = "drifted"
    REMOVED = "removed"
    ERROR = "error"


class DriftSeverity(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"
    NONE = "none"


def _classify_severity(delta_abs: float | None) -> DriftSeverity:
    if delta_abs is None:
        return DriftSeverity.NONE
    if delta_abs < 0.005:
        return DriftSeverity.GREEN
    if delta_abs < 0.01:
        return DriftSeverity.YELLOW
    return DriftSeverity.RED


@dataclass
class DriftEntry:
    rel_path: str
    status: DriftClass
    severity: DriftSeverity = DriftSeverity.NONE
    rtp_estimate: float | None = None
    baseline_rtp: float | None = None
    delta_abs: float | None = None
    fingerprint: str | None = None
    baseline_fingerprint: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rel_path": self.rel_path,
            "status": self.status.value,
            "severity": self.severity.value,
            "rtp_estimate": self.rtp_estimate,
            "baseline_rtp": self.baseline_rtp,
            "delta_abs": self.delta_abs,
            "fingerprint": self.fingerprint,
            "baseline_fingerprint": self.baseline_fingerprint,
            "error": self.error,
        }


@dataclass
class DriftReport:
    entries: list[DriftEntry] = field(default_factory=list)
    games_root: str = ""
    baseline_path: str = ""

    @property
    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {c.value: 0 for c in DriftClass}
        for e in self.entries:
            out[e.status.value] = out.get(e.status.value, 0) + 1
        return out

    @property
    def severity_counts(self) -> dict[str, int]:
        out: dict[str, int] = {s.value: 0 for s in DriftSeverity}
        for e in self.entries:
            out[e.severity.value] = out.get(e.severity.value, 0) + 1
        return out

    @property
    def has_red(self) -> bool:
        return any(e.severity == DriftSeverity.RED for e in self.entries)

    @property
    def has_error(self) -> bool:
        return any(e.status == DriftClass.ERROR for e in self.entries)

    @property
    def has_drift(self) -> bool:
        return any(e.status == DriftClass.DRIFTED for e in self.entries)

    def to_dict(self) -> dict[str, Any]:
        return {
            "games_root": self.games_root,
            "baseline_path": self.baseline_path,
            "counts": self.counts,
            "severity_counts": self.severity_counts,
            "has_red": self.has_red,
            "has_error": self.has_error,
            "has_drift": self.has_drift,
            "entries": [e.to_dict() for e in self.entries],
        }

    def to_markdown(self) -> str:
        lines: list[str] = []
        lines.append("# Drift Sentinel Report")
        lines.append("")
        lines.append(f"- games root: `{self.games_root}`")
        lines.append(f"- baseline: `{self.baseline_path}`")
        lines.append("")
        lines.append("## Counts")
        for k, v in self.counts.items():
            lines.append(f"- {k}: {v}")
        lines.append("")
        lines.append("## Severity")
        for k, v in self.severity_counts.items():
            lines.append(f"- {k}: {v}")
        lines.append("")
        lines.append("## Entries")
        lines.append("")
        lines.append("| IR | status | severity | rtp | base rtp | Δ |")
        lines.append("|---|---|---|---|---|---|")
        for e in self.entries:
            rtp = "—" if e.rtp_estimate is None else f"{e.rtp_estimate:.4f}"
            brtp = "—" if e.baseline_rtp is None else f"{e.baseline_rtp:.4f}"
            d = "—" if e.delta_abs is None else f"{e.delta_abs:.4f}"
            lines.append(
                f"| `{e.rel_path}` | {e.status.value} | {e.severity.value} "
                f"| {rtp} | {brtp} | {d} |"
            )
        return "\n".join(lines) + "\n"


# ─── core scan ─────────────────────────────────────────────────────


DEFAULT_GLOBS = ("**/*.ir.json", "**/ir.json", "**/universal_ir.json")


def _discover_irs(games_root: Path, globs: Iterable[str]) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for pat in globs:
        for p in sorted(games_root.glob(pat)):
            if p.is_file() and p not in seen:
                seen.add(p)
                out.append(p)
    return out


def scan_directory(
    games_root: Path,
    *,
    baseline_path: Path | None = None,
    update_baseline: bool = False,
    globs: Iterable[str] | None = None,
) -> DriftReport:
    """Walk `games_root`, fingerprint every matched IR, compare to
    baseline, emit a DriftReport.

    When `update_baseline=True`, the baseline file is rewritten to
    reflect the current scan (NEW IRs seeded, DRIFTED IRs updated to
    the new fingerprint+rtp).
    """
    games_root = Path(games_root)
    baseline_path = (
        baseline_path or (games_root / DEFAULT_NAME)
    )
    baseline_path = Path(baseline_path)
    store = load_baselines(baseline_path)

    glob_list = list(globs) if globs is not None else list(DEFAULT_GLOBS)
    ir_paths = _discover_irs(games_root, glob_list)
    seen_rels: set[str] = set()
    entries: list[DriftEntry] = []

    for path in ir_paths:
        rel = str(path.relative_to(games_root))
        seen_rels.add(rel)
        try:
            ir = json.loads(path.read_text())
        except Exception as e:  # noqa: BLE001 — IO/JSON error
            entries.append(DriftEntry(
                rel_path=rel,
                status=DriftClass.ERROR,
                error=str(e),
            ))
            continue

        fp = fingerprint(ir)
        rtp = bernoulli_rtp_estimate(ir)
        prior = store.get(rel)
        if prior is None:
            entries.append(DriftEntry(
                rel_path=rel,
                status=DriftClass.NEW,
                rtp_estimate=rtp,
                fingerprint=fp,
            ))
            if update_baseline:
                store.upsert(rel, fingerprint=fp, rtp_estimate=rtp)
            continue

        # Same fingerprint AND same rtp → unchanged
        fp_same = prior.fingerprint == fp
        rtp_same = (
            prior.rtp_estimate is None and rtp is None
        ) or (
            prior.rtp_estimate is not None
            and rtp is not None
            and abs(prior.rtp_estimate - rtp) < 1e-12
        )
        if fp_same and rtp_same:
            entries.append(DriftEntry(
                rel_path=rel,
                status=DriftClass.UNCHANGED,
                rtp_estimate=rtp,
                baseline_rtp=prior.rtp_estimate,
                fingerprint=fp,
                baseline_fingerprint=prior.fingerprint,
                delta_abs=0.0 if rtp_same else None,
                severity=DriftSeverity.NONE,
            ))
            continue

        # Drifted
        delta = None
        if prior.rtp_estimate is not None and rtp is not None:
            delta = abs(prior.rtp_estimate - rtp)
        severity = _classify_severity(delta)
        entries.append(DriftEntry(
            rel_path=rel,
            status=DriftClass.DRIFTED,
            severity=severity,
            rtp_estimate=rtp,
            baseline_rtp=prior.rtp_estimate,
            delta_abs=delta,
            fingerprint=fp,
            baseline_fingerprint=prior.fingerprint,
        ))
        if update_baseline:
            store.upsert(rel, fingerprint=fp, rtp_estimate=rtp)

    # Removed entries
    for known in sorted(store.known_keys() - seen_rels):
        prior = store.get(known)
        entries.append(DriftEntry(
            rel_path=known,
            status=DriftClass.REMOVED,
            baseline_rtp=prior.rtp_estimate if prior else None,
            baseline_fingerprint=prior.fingerprint if prior else None,
        ))
        if update_baseline:
            store.entries.pop(known, None)

    if update_baseline:
        save_baselines(store, baseline_path)

    report = DriftReport(
        entries=entries,
        games_root=str(games_root),
        baseline_path=str(baseline_path),
    )
    return report
