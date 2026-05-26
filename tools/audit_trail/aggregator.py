"""Audit trail aggregator implementation.

The aggregator is intentionally tolerant — every source is optional,
and the function never raises on a missing/corrupt file (instead it
emits an `AuditEntry` of kind="warning" so the operator sees it in
the timeline).
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class AuditEntry:
    """One row in the audit trail."""

    kind: str            # "git" | "ir_note" | "mc_report" | "cert_zip" |
                          # "drift" | "jurisdiction" | "operator_pilot" |
                          # "warning"
    timestamp: str       # ISO-8601 UTC
    source: str          # file path / git ref / ...
    summary: str
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class AuditTrail:
    game_dir: str
    entries: list[AuditEntry] = field(default_factory=list)
    sources_scanned: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ─── Sources ───────────────────────────────────────────────────────────────


def _git_log(game_dir: Path) -> list[AuditEntry]:
    """Pull git log for the game directory."""
    try:
        result = subprocess.run(
            ["git", "log", "--pretty=format:%H|%aI|%s", "--", str(game_dir)],
            capture_output=True, text=True, timeout=10, check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []
    out: list[AuditEntry] = []
    for line in result.stdout.splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        sha, iso, msg = parts
        out.append(AuditEntry(
            kind="git", timestamp=iso,
            source=f"git:{sha[:8]}", summary=msg,
            detail={"sha": sha, "subject": msg},
        ))
    return out


def _ir_notes(game_dir: Path) -> list[AuditEntry]:
    """Scrape `meta.notes` from every IR JSON in the game dir."""
    out: list[AuditEntry] = []
    for ir_path in sorted(game_dir.rglob("*.ir.json")):
        try:
            data = json.loads(ir_path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        meta = data.get("meta") or {}
        notes = meta.get("notes") or []
        if not isinstance(notes, list):
            continue
        # IR timestamps aren't directly stored; fall back to file mtime
        try:
            mtime = ir_path.stat().st_mtime
            ts = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        except OSError:
            ts = datetime.now(timezone.utc).isoformat()
        for note in notes:
            out.append(AuditEntry(
                kind="ir_note", timestamp=ts,
                source=str(ir_path.relative_to(game_dir.parent)),
                summary=str(note),
                detail={"file": str(ir_path)},
            ))
    return out


def _mc_reports(game_dir: Path) -> list[AuditEntry]:
    out: list[AuditEntry] = []
    for mc_path in sorted(game_dir.rglob("*mc*report*.json")):
        try:
            data = json.loads(mc_path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        rtp = data.get("rtp") or data.get("measured_rtp")
        spins = data.get("spins") or data.get("sample_size")
        try:
            mtime = mc_path.stat().st_mtime
            ts = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        except OSError:
            ts = datetime.now(timezone.utc).isoformat()
        out.append(AuditEntry(
            kind="mc_report", timestamp=ts,
            source=str(mc_path.relative_to(game_dir.parent)),
            summary=f"MC RTP={rtp} @ spins={spins}",
            detail={"rtp": rtp, "spins": spins},
        ))
    return out


def _cert_zips(game_dir: Path) -> list[AuditEntry]:
    out: list[AuditEntry] = []
    for zip_path in sorted(game_dir.rglob("*cert*.zip")):
        try:
            stat = zip_path.stat()
        except OSError:
            continue
        ts = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        out.append(AuditEntry(
            kind="cert_zip", timestamp=ts,
            source=str(zip_path.relative_to(game_dir.parent)),
            summary=f"Cert ZIP @ {stat.st_size} bytes",
            detail={"size_bytes": stat.st_size},
        ))
    return out


def _drift_reports(game_dir: Path) -> list[AuditEntry]:
    out: list[AuditEntry] = []
    for d in sorted(game_dir.rglob("drift*.json")):
        try:
            data = json.loads(d.read_text())
            mtime = d.stat().st_mtime
        except (json.JSONDecodeError, OSError):
            continue
        ts = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        severity = data.get("severity") or data.get("verdict") or "?"
        out.append(AuditEntry(
            kind="drift", timestamp=ts,
            source=str(d.relative_to(game_dir.parent)),
            summary=f"Drift report severity={severity}",
            detail=data if isinstance(data, dict) else {"raw": data},
        ))
    return out


def _jurisdiction_reports(game_dir: Path) -> list[AuditEntry]:
    out: list[AuditEntry] = []
    for j in sorted(game_dir.rglob("jurisdiction*.json")):
        try:
            data = json.loads(j.read_text())
            mtime = j.stat().st_mtime
        except (json.JSONDecodeError, OSError):
            continue
        ts = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        # Support both single and {reports:[...]} shapes
        if isinstance(data, dict) and "reports" in data:
            for r in data["reports"]:
                pid = (r or {}).get("profile_id") or "?"
                passed = (r or {}).get("passed", "?")
                out.append(AuditEntry(
                    kind="jurisdiction", timestamp=ts,
                    source=str(j.relative_to(game_dir.parent)),
                    summary=f"{pid}: passed={passed}",
                    detail=r,
                ))
        else:
            pid = (data or {}).get("profile_id") or "?"
            passed = (data or {}).get("passed", "?")
            out.append(AuditEntry(
                kind="jurisdiction", timestamp=ts,
                source=str(j.relative_to(game_dir.parent)),
                summary=f"{pid}: passed={passed}",
                detail=data if isinstance(data, dict) else {},
            ))
    return out


def _operator_pilot_runs(game_dir: Path) -> list[AuditEntry]:
    out: list[AuditEntry] = []
    for log_path in sorted(game_dir.rglob("operator_pilot*.json")):
        try:
            data = json.loads(log_path.read_text())
            mtime = log_path.stat().st_mtime
        except (json.JSONDecodeError, OSError):
            continue
        ts = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        verdict = data.get("verdict") if isinstance(data, dict) else "?"
        out.append(AuditEntry(
            kind="operator_pilot", timestamp=ts,
            source=str(log_path.relative_to(game_dir.parent)),
            summary=f"Operator pilot verdict={verdict}",
            detail=data if isinstance(data, dict) else {},
        ))
    return out


# ─── Top-level driver ─────────────────────────────────────────────────────


def aggregate_game_trail(game_dir: Path) -> AuditTrail:
    """Aggregate all known audit sources for the given game dir.

    Returns an `AuditTrail` with entries sorted ascending by timestamp.
    """
    game_dir = Path(game_dir)
    trail = AuditTrail(game_dir=str(game_dir))
    if not game_dir.is_dir():
        trail.warnings.append(f"{game_dir} is not a directory")
        return trail

    sources = [
        ("git", _git_log),
        ("ir_note", _ir_notes),
        ("mc_report", _mc_reports),
        ("cert_zip", _cert_zips),
        ("drift", _drift_reports),
        ("jurisdiction", _jurisdiction_reports),
        ("operator_pilot", _operator_pilot_runs),
    ]
    for name, fn in sources:
        try:
            entries = fn(game_dir)
            trail.entries.extend(entries)
            trail.sources_scanned.append(name)
        except Exception as e:  # noqa: BLE001
            trail.warnings.append(f"{name}: {e}")

    trail.entries.sort(key=lambda e: e.timestamp)
    return trail


# ─── Output ────────────────────────────────────────────────────────────────


def _md_for(trail: AuditTrail) -> str:
    out: list[str] = []
    out.append(f"# Audit Trail — `{trail.game_dir}`")
    out.append("")
    out.append(f"- Sources scanned: {', '.join(trail.sources_scanned) or '—'}")
    if trail.warnings:
        out.append("- Warnings:")
        for w in trail.warnings:
            out.append(f"  - {w}")
    out.append(f"- Total entries: **{len(trail.entries)}**")
    out.append("")
    out.append("| Timestamp | Kind | Source | Summary |")
    out.append("|---|---|---|---|")
    for e in trail.entries:
        out.append(
            f"| `{e.timestamp}` | {e.kind} | "
            f"`{e.source}` | {e.summary} |"
        )
    return "\n".join(out) + "\n"


def emit_trail(trail: AuditTrail, out_dir: Path) -> dict[str, Path]:
    """Write JSON + Markdown summaries to `out_dir`."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "audit_trail.json"
    md_path = out_dir / "audit_trail.md"
    json_path.write_text(
        json.dumps(
            {
                "game_dir": trail.game_dir,
                "entries": [asdict(e) for e in trail.entries],
                "sources_scanned": trail.sources_scanned,
                "warnings": trail.warnings,
            },
            indent=2, ensure_ascii=False,
        ),
    )
    md_path.write_text(_md_for(trail))
    return {"json": json_path, "md": md_path}
