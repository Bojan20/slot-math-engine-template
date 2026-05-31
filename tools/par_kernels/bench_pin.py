"""SLOT-MATH bench-history — pin batch --bench JSON payloads to disk.

Long-running portfolio metric ledger. Every successful main run pin its
bench JSON to `reports/bench/portfolio-history/`, indexed by timestamp +
SHA-256 content digest + git SHA. The index file lets downstream tooling
(`bench-trend`, dashboards, sparklines, slope detection) query history
without re-parsing every file.

Storage layout:

    reports/bench/portfolio-history/
        INDEX.json                       — array of {ts, path, content_sha,
                                                     git_sha, summary}
        2026-05-31T143000Z-abc1234.json  — pinned payload (verbatim)
        2026-05-31T143012Z-def5678.json
        ...

Files are content-hashed-suffixed so the same payload pinned twice is a
no-op (idempotent). Old entries are NEVER deleted by this module —
retention is a separate concern (manual or via CI cleanup workflow).
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Default pin directory (override via env or CLI flag).
DEFAULT_PIN_DIR = Path("reports/bench/portfolio-history")
INDEX_NAME = "INDEX.json"


@dataclass
class PinResult:
    pinned: bool                # False = idempotent skip (already present)
    path: Path                  # absolute path to the pinned file
    content_sha: str            # SHA-256 of payload bytes (16-char prefix)
    index_entry: dict[str, Any]  # what was added to INDEX.json (or matched)


def _short_sha(payload_bytes: bytes) -> str:
    """16-char content digest — collision-safe for portfolio scale, compact."""
    return hashlib.sha256(payload_bytes).hexdigest()[:16]


def _detect_git_sha() -> str | None:
    """Read git HEAD SHA without shelling out — works in CI checkouts."""
    head = Path(".git/HEAD")
    if not head.is_file():
        return None
    ref = head.read_text().strip()
    if ref.startswith("ref: "):
        ref_path = Path(".git") / ref[5:]
        if ref_path.is_file():
            return ref_path.read_text().strip()
        # Packed-refs fallback
        packed = Path(".git/packed-refs")
        if packed.is_file():
            ref_name = ref[5:]
            for line in packed.read_text().splitlines():
                if line.endswith(" " + ref_name):
                    return line.split(" ")[0]
        return None
    return ref  # detached HEAD = raw SHA


def _load_index(pin_dir: Path) -> list[dict[str, Any]]:
    index_path = pin_dir / INDEX_NAME
    if not index_path.is_file():
        return []
    try:
        return json.loads(index_path.read_text())
    except json.JSONDecodeError:
        # Corrupt or partially-written; start over but preserve nothing.
        return []


def _save_index(pin_dir: Path, entries: list[dict[str, Any]]) -> None:
    pin_dir.mkdir(parents=True, exist_ok=True)
    (pin_dir / INDEX_NAME).write_text(json.dumps(entries, indent=2) + "\n")


def pin_bench(
    bench_path: Path | str,
    *,
    pin_dir: Path | str | None = None,
    git_sha: str | None = None,
) -> PinResult:
    """Pin one batch --bench JSON file into the portfolio-history ledger.

    Idempotent: if the same content_sha already lives in the index, returns
    `pinned=False` with the existing entry — no disk churn.
    """
    bench_p = Path(bench_path)
    if not bench_p.is_file():
        raise FileNotFoundError(bench_p)
    payload_bytes = bench_p.read_bytes()
    payload = json.loads(payload_bytes)

    sv = payload.get("schema_version", "")
    if not sv.startswith("1."):
        raise ValueError(f"unsupported bench schema_version: {sv!r}")

    content_sha = _short_sha(payload_bytes)
    pin_dir_p = Path(pin_dir) if pin_dir else DEFAULT_PIN_DIR
    pin_dir_p.mkdir(parents=True, exist_ok=True)

    index = _load_index(pin_dir_p)
    existing = next((e for e in index if e.get("content_sha") == content_sha), None)
    if existing:
        return PinResult(
            pinned=False,
            path=pin_dir_p / existing["filename"],
            content_sha=content_sha,
            index_entry=existing,
        )

    ts = payload.get("generated_at", "")  # already UTC ISO from batch --bench
    # Filename-safe timestamp (strip colons and the trailing Z punctuation)
    ts_safe = ts.replace(":", "").replace("-", "")
    fname = f"{ts_safe}-{content_sha}.json"
    out_path = pin_dir_p / fname
    out_path.write_bytes(payload_bytes)

    summary = payload.get("summary", {})
    config = payload.get("config", {})
    entry = {
        "ts": ts,
        "filename": fname,
        "content_sha": content_sha,
        "git_sha": git_sha or _detect_git_sha() or os.environ.get("GITHUB_SHA"),
        "wallclock_secs": payload.get("wallclock_secs"),
        "config": {
            "mc_spins": config.get("mc_spins"),
            "seed": config.get("seed"),
            "tolerance_bps": config.get("tolerance_bps"),
            "filter": config.get("filter"),
        },
        "summary": {
            "games_total": summary.get("games_total"),
            "games_passed": summary.get("games_passed"),
            "games_failed": summary.get("games_failed"),
            "overall_ok": summary.get("overall_ok"),
        },
    }
    index.append(entry)
    # Stable ordering by ts (lexicographic on ISO UTC = chronological)
    index.sort(key=lambda e: (e.get("ts") or "", e.get("content_sha") or ""))
    _save_index(pin_dir_p, index)
    return PinResult(pinned=True, path=out_path,
                     content_sha=content_sha, index_entry=entry)


def load_history(pin_dir: Path | str | None = None) -> list[dict[str, Any]]:
    """Return the index entries (oldest first)."""
    pin_dir_p = Path(pin_dir) if pin_dir else DEFAULT_PIN_DIR
    return _load_index(pin_dir_p)


def load_pinned_payload(
    pin_dir: Path | str | None, entry: dict[str, Any],
) -> dict[str, Any]:
    """Load the full bench payload for a given index entry."""
    pin_dir_p = Path(pin_dir) if pin_dir else DEFAULT_PIN_DIR
    return json.loads((pin_dir_p / entry["filename"]).read_text())


# ───────── trend analysis ─────────


def compute_trend(
    pin_dir: Path | str | None = None, *, last_n: int | None = None,
) -> dict[str, Any]:
    """Compute per-game trend metrics across pinned history.

    Returns a dict with:
      - n_entries:        number of runs analyzed
      - games:            { game/variant → { rtp_series, speed_series,
                            rtp_slope_bps_per_run, pass_streak } }
      - overall_pass_rate: fraction of runs with overall_ok=True
    """
    pin_dir_p = Path(pin_dir) if pin_dir else DEFAULT_PIN_DIR
    history = load_history(pin_dir_p)
    if last_n is not None:
        history = history[-last_n:]
    n = len(history)
    if n == 0:
        return {"n_entries": 0, "games": {}, "overall_pass_rate": None}

    # Walk each pinned payload, collect per-game series.
    by_game: dict[str, dict[str, list]] = {}
    overall_pass = 0
    for entry in history:
        try:
            payload = load_pinned_payload(pin_dir_p, entry)
        except FileNotFoundError:
            continue
        if payload.get("summary", {}).get("overall_ok"):
            overall_pass += 1
        for g in payload.get("games", []):
            key = f"{g['game']}/{g['variant']}"
            rec = by_game.setdefault(key, {
                "rtp_series": [], "speed_series": [],
                "composer_delta_series": [], "pass_series": [],
                "shape": g.get("shape"),
            })
            rec["rtp_series"].append((g.get("mc") or {}).get("rtp"))
            rec["speed_series"].append((g.get("mc") or {}).get("rounds_per_sec"))
            rec["composer_delta_series"].append(g.get("composer_delta_bps"))
            rec["pass_series"].append(bool(g.get("overall_ok")))

    # Slope: simple linear regression on RTP (bps/run) using OLS.
    def _slope_bps(series: list[float | None]) -> float | None:
        ys = [y * 10000.0 for y in series if y is not None]
        if len(ys) < 2:
            return None
        n = len(ys)
        xs = list(range(n))
        x_mean = sum(xs) / n
        y_mean = sum(ys) / n
        num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(n))
        den = sum((xs[i] - x_mean) ** 2 for i in range(n))
        return num / den if den > 0 else 0.0

    def _pass_streak(passes: list[bool]) -> int:
        # Number of consecutive True at the tail
        streak = 0
        for p in reversed(passes):
            if p:
                streak += 1
            else:
                break
        return streak

    games_summary = {}
    for key, rec in by_game.items():
        games_summary[key] = {
            "shape": rec["shape"],
            "rtp_series": rec["rtp_series"],
            "speed_series": rec["speed_series"],
            "composer_delta_series": rec["composer_delta_series"],
            "pass_series": rec["pass_series"],
            "rtp_slope_bps_per_run": _slope_bps(rec["rtp_series"]),
            "pass_streak": _pass_streak(rec["pass_series"]),
            "rtp_min": min((y for y in rec["rtp_series"] if y is not None), default=None),
            "rtp_max": max((y for y in rec["rtp_series"] if y is not None), default=None),
        }

    return {
        "n_entries": n,
        "first_ts": history[0].get("ts"),
        "last_ts": history[-1].get("ts"),
        "overall_pass_rate": overall_pass / n if n > 0 else None,
        "games": games_summary,
    }


def format_trend_markdown(trend: dict[str, Any]) -> str:
    """Render trend as a Markdown table with sparkline-ish RTP series."""
    n = trend["n_entries"]
    if n == 0:
        return "_No pinned bench history yet._\n"

    lines = [
        "# Portfolio Trend",
        "",
        f"_{n} pinned runs · "
        f"{trend['first_ts']} → {trend['last_ts']} · "
        f"overall pass-rate: {trend['overall_pass_rate']*100:.1f}%_",
        "",
        "| Game | Variant | Shape | Last RTP | RTP min..max | "
        "RTP slope (bps/run) | Pass streak |",
        "|---|---|---|---:|---|---:|---:|",
    ]
    for key, g in sorted(trend["games"].items()):
        game, variant = key.split("/", 1)
        last_rtp = next((r for r in reversed(g["rtp_series"]) if r is not None), None)
        last_rtp_s = f"{last_rtp*100:.4f}%" if last_rtp is not None else "—"
        rmin = g["rtp_min"]
        rmax = g["rtp_max"]
        range_s = (f"{rmin*100:.4f}% .. {rmax*100:.4f}%"
                   if rmin is not None and rmax is not None else "—")
        slope = g["rtp_slope_bps_per_run"]
        slope_s = f"{slope:+.4f}" if slope is not None else "—"
        lines.append(
            f"| {game} | {variant} | `{g['shape']}` | {last_rtp_s} | "
            f"{range_s} | {slope_s} | {g['pass_streak']}/{n} |"
        )
    return "\n".join(lines) + "\n"


# ───────── slope-based regression detection ─────────


def detect_trend_regression(
    trend: dict[str, Any], *,
    slope_threshold_bps: float = 20.0,
    min_runs: int = 5,
) -> dict[str, Any]:
    """Flag games whose RTP slope across pinned history exceeds threshold.

    A slope of ±20 bps/run over min_runs+ pinned runs is "drift" — even
    if no single run failed convergence, the long-run direction is wrong
    and the math is no longer Wilson-stable vs the pinned baseline.

    Returns a dict with `regressions` list (each game-key + slope) and
    `has_regression` boolean.
    """
    if trend["n_entries"] < min_runs:
        return {"has_regression": False, "regressions": [],
                "skipped": True, "reason": f"n_entries < min_runs ({min_runs})"}
    regressions = []
    for key, g in trend["games"].items():
        slope = g.get("rtp_slope_bps_per_run")
        if slope is None:
            continue
        n_valid = sum(1 for r in g.get("rtp_series", []) if r is not None)
        if n_valid < min_runs:
            continue
        if abs(slope) > slope_threshold_bps:
            regressions.append({
                "game_variant": key,
                "shape": g.get("shape"),
                "slope_bps_per_run": slope,
                "n_runs": n_valid,
                "rtp_min": g.get("rtp_min"),
                "rtp_max": g.get("rtp_max"),
                "direction": "drift up ⬆️" if slope > 0 else "drift down ⬇️",
            })
    return {
        "has_regression": len(regressions) > 0,
        "regressions": regressions,
        "skipped": False,
        "threshold_bps": slope_threshold_bps,
        "min_runs": min_runs,
    }


def format_regression_markdown(report: dict[str, Any]) -> str:
    """Render a trend-regression report as Markdown."""
    if report.get("skipped"):
        return (f"_Trend regression check skipped: {report.get('reason', 'unknown')}_\n")
    if not report["has_regression"]:
        return (
            f"## ✅ No trend regression\n\n"
            f"_Threshold: ±{report['threshold_bps']:.1f} bps/run over "
            f"≥{report['min_runs']} runs · all games within bounds._\n"
        )
    lines = [
        f"## 🔴 Trend regression detected ({len(report['regressions'])} games)",
        "",
        f"_Threshold: ±{report['threshold_bps']:.1f} bps/run over "
        f"≥{report['min_runs']} runs._",
        "",
        "| Game/Variant | Shape | Slope (bps/run) | Direction | "
        "n_runs | RTP min..max |",
        "|---|---|---:|:---:|---:|---|",
    ]
    for r in report["regressions"]:
        rmin = r["rtp_min"]
        rmax = r["rtp_max"]
        range_s = (f"{rmin*100:.4f}% .. {rmax*100:.4f}%"
                   if rmin is not None and rmax is not None else "—")
        lines.append(
            f"| `{r['game_variant']}` | `{r['shape']}` | "
            f"{r['slope_bps_per_run']:+.4f} | {r['direction']} | "
            f"{r['n_runs']} | {range_s} |"
        )
    return "\n".join(lines) + "\n"


# ───────── CLI hooks ─────────


def cmd_bench_pin(args) -> int:
    res = pin_bench(args.bench, pin_dir=args.pin_dir, git_sha=args.git_sha)
    if res.pinned:
        print(f"✓ Pinned to {res.path}")
        print(f"  content_sha: {res.content_sha}")
        print(f"  git_sha:     {res.index_entry.get('git_sha') or '(unknown)'}")
    else:
        print(f"= Already pinned (content_sha={res.content_sha}): {res.path}")
    return 0


def cmd_bench_trend(args) -> int:
    trend = compute_trend(pin_dir=args.pin_dir, last_n=args.last_n)
    md_parts = [format_trend_markdown(trend)]
    regression_ec = 0
    if getattr(args, "fail_on_slope", None) is not None:
        report = detect_trend_regression(
            trend,
            slope_threshold_bps=float(args.fail_on_slope),
            min_runs=int(getattr(args, "min_runs", 5)),
        )
        md_parts.append(format_regression_markdown(report))
        regression_ec = 1 if report.get("has_regression") else 0
    combined = "\n".join(md_parts)
    if args.out:
        Path(args.out).write_text(combined)
    else:
        print(combined)
    return regression_ec
