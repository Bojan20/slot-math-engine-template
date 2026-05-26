"""Operator dashboard live-stream — watch-mode re-aggregator."""
from __future__ import annotations
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from tools.operator_dashboard.aggregator import (
    DashboardReport,
    aggregate,
    emit_dashboard,
)


@dataclass
class LivestreamConfig:
    games_root: Path
    out_dir: Path
    interval_seconds: float = 5.0
    max_iterations: int | None = None
    glob: str = "*.ir.json"


@dataclass
class LivestreamIteration:
    sequence: int
    started_at_utc: str
    finished_at_utc: str
    counts: dict[str, int]
    html_bytes: int
    json_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "sequence": self.sequence,
            "started_at_utc": self.started_at_utc,
            "finished_at_utc": self.finished_at_utc,
            "counts": dict(self.counts),
            "html_bytes": self.html_bytes,
            "json_bytes": self.json_bytes,
        }


@dataclass
class LivestreamReport:
    config: LivestreamConfig
    iterations: list[LivestreamIteration] = field(default_factory=list)
    stopped_by: str = "max_iterations"

    @property
    def n_iterations(self) -> int:
        return len(self.iterations)

    def to_dict(self) -> dict[str, Any]:
        return {
            "games_root": str(self.config.games_root),
            "out_dir": str(self.config.out_dir),
            "interval_seconds": self.config.interval_seconds,
            "max_iterations": self.config.max_iterations,
            "glob": self.config.glob,
            "n_iterations": self.n_iterations,
            "stopped_by": self.stopped_by,
            "iterations": [it.to_dict() for it in self.iterations],
        }


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_emit(report: DashboardReport, out_dir: Path) -> tuple[int, int]:
    """Emit HTML + JSON via tmp + os.replace for atomic visibility.

    `emit_dashboard` writes the files directly; we wrap it so a
    browser polling the URL never sees a half-written HTML.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir = out_dir / "_livestream_tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    paths = emit_dashboard(report, tmp_dir)
    html_src = paths["html"]
    json_src = paths["json"]
    html_dst = out_dir / Path(html_src).name
    json_dst = out_dir / Path(json_src).name
    os.replace(str(html_src), str(html_dst))
    os.replace(str(json_src), str(json_dst))
    # Clean up tmp dir
    try:
        tmp_dir.rmdir()
    except OSError:
        # Non-empty (e.g. extra emit) — leave it
        pass
    return html_dst.stat().st_size, json_dst.stat().st_size


def run_livestream(
    config: LivestreamConfig,
    *,
    sleep_fn: Callable[[float], None] | None = None,
) -> LivestreamReport:
    """Run the live-stream loop. Returns a report on exit.

    `sleep_fn` is injectable so tests can run zero-sleep iterations.
    """
    report = LivestreamReport(config=config)
    sleep_fn = sleep_fn or time.sleep
    seq = 0
    try:
        while True:
            seq += 1
            started = _now_utc()
            dash_report = aggregate(config.games_root, glob=config.glob)
            html_bytes, json_bytes = _atomic_emit(dash_report, config.out_dir)
            finished = _now_utc()
            report.iterations.append(LivestreamIteration(
                sequence=seq,
                started_at_utc=started,
                finished_at_utc=finished,
                counts=dict(dash_report.counts),
                html_bytes=html_bytes,
                json_bytes=json_bytes,
            ))
            # Always emit the most recent ledger snapshot as well
            (config.out_dir / "livestream_ledger.json").write_text(
                json.dumps(report.to_dict(), indent=2, sort_keys=True)
            )
            if (
                config.max_iterations is not None
                and seq >= config.max_iterations
            ):
                report.stopped_by = "max_iterations"
                break
            sleep_fn(config.interval_seconds)
    except KeyboardInterrupt:
        report.stopped_by = "keyboard_interrupt"
    return report
