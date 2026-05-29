"""W7 — Markdown / JSON / SVG report emitters.

The benchmark `runner` calls into `emit_results(record, out_dir)` once
per run.  Outputs:

    results.json            — record dict, sorted keys, 2-space indent
    results.md              — operator/auditor-facing summary
    benchmark.svg           — inline SVG bar chart of pre vs post deltas
    benchmark.sha256.txt    — sha256 of (results.json with timings
                              stripped) so the same input → same hash
                              regardless of wall-clock variation

Reuses ``tools.pitch_report.svg_charts._fmt`` for byte-stable float
formatting so the SVG is reproducible across machines.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from tools.pitch_report.svg_charts import _fmt


# ─── deterministic JSON serialization ───────────────────────────────────


def _canon_json(record: dict[str, Any]) -> bytes:
    """Sorted-keys, 2-space-indent JSON encoding with trailing newline.

    NaN / Infinity are forbidden — the runner clamps every numeric
    output to a real float before reaching here.  If a NaN sneaks
    through we replace it with the string `"nan"` so json.dumps doesn't
    emit non-JSON `NaN`.
    """
    def scrub(obj: Any) -> Any:
        if isinstance(obj, float):
            if math.isnan(obj):
                return "nan"
            if math.isinf(obj):
                return "inf" if obj > 0 else "-inf"
            return obj
        if isinstance(obj, dict):
            return {k: scrub(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [scrub(v) for v in obj]
        return obj

    blob = json.dumps(
        scrub(record), sort_keys=True, indent=2, ensure_ascii=False,
    )
    return (blob + "\n").encode("utf-8")


def _record_for_hash(record: dict[str, Any]) -> bytes:
    """Strip wall-clock-y fields so the handoff hash is timing-invariant.

    Hash covers: spec inputs (sample_id, archetype, target_rtp, paylines,
    symbol_count, hp_count, spec_sha256, mc_spins, mc_seed) plus
    deterministic outputs (rtp_uniform, rtp_fitted, target_rtp_delta_*,
    convergence_speedup, mc_rtp, mc_hit_freq, mc_rtp_delta, error).  It
    deliberately excludes `smt_solve_ms` and `mc_verify_ms` so a slow
    machine and a fast machine produce the same handoff hash — the
    intent of the hash is "did the math agree?" not "did the clock
    agree?".
    """
    timing_fields = {"smt_solve_ms", "mc_verify_ms"}
    scrubbed: dict[str, Any] = {}
    for k, v in record.items():
        if k == "samples":
            scrubbed[k] = [
                {kk: vv for kk, vv in s.items() if kk not in timing_fields}
                for s in v
            ]
        elif k == "aggregate":
            # Drop mean_smt_ms / mean_mc_ms from the per-arch + overall
            # buckets too.
            agg: dict[str, Any] = {}
            for ak, av in v.items():
                if ak in ("per_archetype",):
                    agg[ak] = {
                        arch: {
                            mk: mv for mk, mv in bucket.items()
                            if mk not in ("mean_smt_ms", "mean_mc_ms")
                        }
                        for arch, bucket in av.items()
                    }
                elif ak in ("overall",):
                    agg[ak] = {
                        mk: mv for mk, mv in av.items()
                        if mk not in ("mean_smt_ms", "mean_mc_ms")
                    }
                else:
                    agg[ak] = av
            scrubbed[k] = agg
        else:
            scrubbed[k] = v
    return _canon_json(scrubbed)


# ─── markdown ───────────────────────────────────────────────────────────


def _fmt_speedup(x: float) -> str:
    if math.isnan(x):
        return "—"
    if x >= 1000:
        return f"{x/1000:.1f}k×"
    return f"{x:.2f}×"


def _fmt_delta(x: float) -> str:
    if math.isnan(x):
        return "—"
    return f"{x:.4f}"


def _fmt_ms(x: float) -> str:
    if math.isnan(x):
        return "—"
    return f"{x:.0f} ms"


def _emit_markdown(record: dict[str, Any]) -> bytes:
    cfg = record.get("config") or {}
    agg = record.get("aggregate") or {}
    overall = agg.get("overall") or {}
    per_arch = agg.get("per_archetype") or {}
    samples = record.get("samples") or []

    out: list[str] = []
    out.append("# W7 — Public Math-Compiler Benchmark")
    out.append("")
    out.append(
        f"Generator tag: `{record.get('generator_tag', '?')}` · "
        f"epoch: `{record.get('epoch')}` · mode: "
        f"`{cfg.get('mode')}` · archetype: "
        f"`{cfg.get('archetype') or 'all'}`",
    )
    out.append("")
    out.append("## Aggregate (overall)")
    out.append("")
    out.append("| Samples (ok / errored / total) | Median speedup |"
               " Median Δ_rtp pre | Median Δ_rtp post | Median MC Δ_rtp |"
               " Mean SMT ms | Mean MC ms |")
    out.append("|---:|---:|---:|---:|---:|---:|---:|")
    out.append(
        f"| {overall.get('samples_ok', 0)} / "
        f"{overall.get('samples_errored', 0)} / "
        f"{overall.get('samples_total', 0)} | "
        f"{_fmt_speedup(overall.get('median_speedup', float('nan')))} | "
        f"{_fmt_delta(overall.get('median_delta_pre', float('nan')))} | "
        f"{_fmt_delta(overall.get('median_delta_post', float('nan')))} | "
        f"{_fmt_delta(overall.get('median_mc_delta', float('nan')))} | "
        f"{_fmt_ms(overall.get('mean_smt_ms', float('nan')))} | "
        f"{_fmt_ms(overall.get('mean_mc_ms', float('nan')))} |"
    )
    out.append("")
    out.append("## Per-archetype")
    out.append("")
    out.append(
        "| Archetype | Samples | Median speedup | Median Δ_rtp pre | "
        "Median Δ_rtp post | Median MC Δ_rtp | Mean SMT ms |"
    )
    out.append("|---|---:|---:|---:|---:|---:|---:|")
    for arch in sorted(per_arch.keys()):
        bucket = per_arch[arch]
        out.append(
            f"| `{arch}` | {bucket.get('samples', 0)} | "
            f"{_fmt_speedup(bucket.get('median_speedup', float('nan')))} | "
            f"{_fmt_delta(bucket.get('median_delta_pre', float('nan')))} | "
            f"{_fmt_delta(bucket.get('median_delta_post', float('nan')))} | "
            f"{_fmt_delta(bucket.get('median_mc_delta', float('nan')))} | "
            f"{_fmt_ms(bucket.get('mean_smt_ms', float('nan')))} |"
        )
    out.append("")

    # Per-archetype sample rows (up to 5 each, sorted by sample_id)
    out.append("## Sample rows (up to 5 per archetype)")
    out.append("")
    out.append(
        "| Sample | Archetype | Target | RTP uniform | RTP fitted | "
        "Δ pre | Δ post | Speedup | MC RTP | MC Δ |"
    )
    out.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    # Group samples by archetype, take first 5 per arch.
    by_arch: dict[str, list[dict[str, Any]]] = {}
    for s in samples:
        by_arch.setdefault(s["archetype"], []).append(s)
    for arch in sorted(by_arch.keys()):
        for s in by_arch[arch][:5]:
            out.append(
                f"| `{s['sample_id']}` | {s['archetype']} | "
                f"{s['target_rtp']:.4f} | "
                f"{s['rtp_uniform']:.4f} | "
                f"{s['rtp_fitted']:.4f} | "
                f"{s['target_rtp_delta_pre']:.4f} | "
                f"{s['target_rtp_delta_post']:.4f} | "
                f"{_fmt_speedup(s['convergence_speedup'])} | "
                f"{s['mc_rtp']:.4f} | "
                f"{s['mc_rtp_delta']:.4f} |"
            )
    out.append("")

    out.append("## Methodology (auditor crib-sheet)")
    out.append("")
    out.append("- Specs are generated deterministically from "
               f"`sha256({record.get('generator_tag', '?')})` — same "
               "tag always yields the same 50 (or 10, in `--quick`) specs.")
    out.append("- `target_rtp_delta_pre` = `|closed-form RTP "
               "with uniform weights − target|`.  No solver runs; this "
               "is what a designer sees on day 0.")
    out.append("- `target_rtp_delta_post` = `|closed-form RTP after Z3 "
               "Mode C-1 fit − target|`.  Solver budget: "
               f"{cfg.get('smt_timeout_ms', '?')} ms with tolerance "
               f"`{cfg.get('smt_tolerance', '?')}`.")
    out.append(f"- `mc_rtp_delta` = `|MC RTP − target|` over "
               f"{cfg.get('mc_spins', '?')} spins with the slot-sim "
               "release binary (same binary as the greenfield demo).")
    out.append("- Convergence speedup = `Δ_pre / max(Δ_post, 1e-6)`. "
               "Median across the sample set is the headline number.")
    out.append("- Everything offline: no HTTP, no external services. "
               "Re-runnable on any host with the engine binary built.")
    out.append("")
    return ("\n".join(out)).encode("utf-8")


# ─── inline SVG ─────────────────────────────────────────────────────────


def _emit_svg(record: dict[str, Any]) -> bytes:
    """Side-by-side bar chart of |Δ_pre| vs |Δ_post| per archetype on a
    log scale.  Deterministic — every coordinate rounded to 2 decimals
    via `pitch_report.svg_charts._fmt`.
    """
    per_arch = (record.get("aggregate") or {}).get("per_archetype") or {}
    cfg = record.get("config") or {}
    archs = sorted(per_arch.keys())
    rows: list[tuple[str, float, float]] = []
    for arch in archs:
        b = per_arch[arch]
        pre = float(b.get("median_delta_pre", 0.0) or 0.0)
        post = float(b.get("median_delta_post", 0.0) or 0.0)
        # Log-scale: floor at 1e-6 so log10 is finite.
        rows.append((arch, max(pre, 1e-6), max(post, 1e-6)))

    width = 720
    height = 280
    margin_left = 140
    margin_right = 40
    margin_top = 50
    margin_bottom = 40
    plot_w = width - margin_left - margin_right
    plot_h = height - margin_top - margin_bottom
    n = max(1, len(rows))
    bar_group_h = max(20, int(plot_h / n) - 4)
    bar_h = max(6, (bar_group_h - 4) // 2)

    log_min = -6.0
    log_max = 1.0  # ≥ 10× error

    def x_for(delta: float) -> float:
        v = math.log10(max(delta, 1e-6))
        v = max(log_min, min(log_max, v))
        frac = (v - log_min) / (log_max - log_min)
        return margin_left + frac * plot_w

    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
        f'height="{height}" role="img" '
        f'aria-label="W7 benchmark — convergence per archetype">'
    )
    parts.append(
        f'<text x="{margin_left}" y="22" font-family="monospace" '
        f'font-size="13" fill="#222">W7 — RTP delta vs target '
        f'(log scale): naive uniform vs SMT-fit</text>'
    )
    parts.append(
        f'<text x="{margin_left}" y="38" font-family="monospace" '
        f'font-size="10" fill="#555">mode={cfg.get("mode", "?")} · '
        f'spins={cfg.get("mc_spins", "?")} · '
        f'lower bar = post (better)</text>'
    )

    # Tick marks: 1e-6 .. 1e1
    for tick in range(int(log_min), int(log_max) + 1):
        frac = (tick - log_min) / (log_max - log_min)
        x = margin_left + frac * plot_w
        parts.append(
            f'<line x1="{_fmt(x)}" y1="{margin_top}" '
            f'x2="{_fmt(x)}" y2="{margin_top + plot_h}" '
            f'stroke="#ddd" stroke-width="0.5"/>'
        )
        parts.append(
            f'<text x="{_fmt(x)}" y="{height - 6}" font-family="monospace" '
            f'font-size="9" fill="#666" text-anchor="middle">'
            f'1e{tick:+d}</text>'
        )

    # Bars
    for i, (arch, pre, post) in enumerate(rows):
        group_y = margin_top + i * (bar_group_h + 4)
        # Pre (uniform baseline)
        x_pre_end = x_for(pre)
        parts.append(
            f'<rect x="{_fmt(margin_left)}" y="{group_y}" '
            f'width="{_fmt(x_pre_end - margin_left)}" height="{bar_h}" '
            f'fill="#c62828"/>'
        )
        parts.append(
            f'<text x="{_fmt(x_pre_end + 4)}" y="{group_y + bar_h - 1}" '
            f'font-family="monospace" font-size="10" fill="#444">'
            f'pre {pre:.4f}</text>'
        )
        # Post (SMT-fit)
        post_y = group_y + bar_h + 2
        x_post_end = x_for(post)
        parts.append(
            f'<rect x="{_fmt(margin_left)}" y="{post_y}" '
            f'width="{_fmt(x_post_end - margin_left)}" height="{bar_h}" '
            f'fill="#2e7d32"/>'
        )
        parts.append(
            f'<text x="{_fmt(x_post_end + 4)}" y="{post_y + bar_h - 1}" '
            f'font-family="monospace" font-size="10" fill="#444">'
            f'post {post:.4f}</text>'
        )
        parts.append(
            f'<text x="{margin_left - 6}" y="{group_y + bar_h}" '
            f'font-family="monospace" font-size="11" fill="#333" '
            f'text-anchor="end">{arch}</text>'
        )
    parts.append('</svg>')
    return "".join(parts).encode("utf-8")


# ─── orchestrator ───────────────────────────────────────────────────────


def emit_results(record: dict[str, Any], out_dir: Path) -> dict[str, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / "results.json"
    md_path = out_dir / "results.md"
    svg_path = out_dir / "benchmark.svg"
    sha_path = out_dir / "benchmark.sha256.txt"

    json_path.write_bytes(_canon_json(record))
    md_path.write_bytes(_emit_markdown(record))
    svg_path.write_bytes(_emit_svg(record))

    hash_bytes = _record_for_hash(record)
    digest = hashlib.sha256(hash_bytes).hexdigest()
    sha_path.write_bytes(
        f"{digest}  results.json (timing-invariant)\n".encode("utf-8"),
    )

    return {
        "json": json_path,
        "md": md_path,
        "svg": svg_path,
        "sha": sha_path,
    }
