"""W4.9 — Vendor Parity Doctor.

Diagnose how cleanly a given vendor profile parses a set of PAR-test
files. Computes structural metrics per PAR (paytable rows, reel-set
counts, feature trigger detections, RTP closed-form estimate, parity
gap vs published target), aggregates per-vendor, emits an HTML
dashboard + JSON manifest for operators to review.

Pipeline:

    1. Walk a `<raw_dir>` discovering test PAR-sheets via
       `profile.sheets.main_par` glob (e.g. PAR-001.tsv, PAR-002.tsv …)
    2. For each PAR file:
         • parse_par(profile, raw_dir, sheet=NAME, strict=False)
         • measure paytable rows, reel set count, feature parses
         • derive a Bernoulli RTP estimate from the first base reel
           set (engine MC remains source of truth, this is an
           order-of-magnitude estimate)
    3. Compute parity gap vs `profile.meta.published_rtp` (when
       available) and color-code: green ≤0.5 %, yellow ≤1 %, red >1 %.
    4. Emit:
         • <out>/par_doctor.html  — interactive dashboard
         • <out>/par_doctor.json  — machine-readable manifest
         • <out>/par_doctor.md    — markdown summary (cert audit-trail)

CLI:
    slot-par-doctor <vendor_id> --raw <dir> --out <dir>
    slot-par-doctor --vendors vendor_c,vendor_d --raw <dir> --out <dir>
                                                              [--all]
                                                              [--quiet]
                                                              [--target-rtp 0.96]

Public API:
    from tools.diagnostics.par_doctor import (
        diagnose_vendor,
        emit_dashboard,
    )
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from tools.parse_par.core import parse_par
from tools.parse_par.profile import VendorProfile, load_profile


# ─── Per-PAR metrics ───────────────────────────────────────────────────────


@dataclass
class ParMetrics:
    """Metrics for a single PAR-sheet file."""

    sheet_name: str
    parsed: bool
    paytable_rows: int = 0
    reel_sets_base: int = 0
    reel_sets_fs: int = 0
    feature_count: int = 0
    feature_kinds: list[str] = field(default_factory=list)
    estimated_rtp: float | None = None
    rtp_gap: float | None = None
    gap_severity: str = "n/a"  # "green" | "yellow" | "red" | "n/a"
    error: str | None = None


@dataclass
class VendorReport:
    """Aggregate report for one vendor."""

    vendor_id: str
    profile_version: str
    published_rtp: float | None
    par_count: int
    parsed_count: int
    mean_paytable_rows: float
    mean_reel_sets_base: float
    feature_kinds_seen: list[str]
    mean_estimated_rtp: float | None
    mean_gap: float | None
    overall_severity: str
    per_par: list[ParMetrics]


# ─── Bernoulli RTP estimator (order-of-magnitude only) ─────────────────────


def _coerce_cell(cell: Any) -> str | None:
    """Normalize a reel-strip cell into a hashable symbol id (or None
    if the shape is not recognizable).

    Vendor profiles may store reel cells as plain strings (most
    common), `{"symbol": "X"}` dicts, or `["X", weight]` tuples. We
    coerce all into the bare symbol id so the Bernoulli frequency
    table can use it as a dict key.
    """
    if cell is None:
        return None
    if isinstance(cell, str):
        return cell
    if isinstance(cell, dict):
        for key in ("symbol", "id", "name"):
            v = cell.get(key)
            if isinstance(v, str):
                return v
        return None
    if isinstance(cell, (list, tuple)) and cell:
        first = cell[0]
        return first if isinstance(first, str) else None
    return None


def _flatten_reels(first: dict[str, Any]) -> list[list[str]]:
    """Pull reel strips out of a reel-set dict into list-of-list-of-str,
    coercing exotic per-cell shapes via `_coerce_cell`."""
    raw = first.get("reels") or first.get("reel_strips") or []
    out: list[list[str]] = []
    for reel in raw:
        strip: list[str] = []
        if isinstance(reel, dict):
            # `{sym: weight}` shape — expand to a flat strip.
            for sym, ct in reel.items():
                if isinstance(sym, str):
                    try:
                        strip.extend([sym] * int(ct))
                    except (TypeError, ValueError):
                        continue
        elif isinstance(reel, (list, tuple)):
            for cell in reel:
                norm = _coerce_cell(cell)
                if norm is not None:
                    strip.append(norm)
        out.append(strip)
    if not any(out):
        # `strip_weights` fallback (some profiles publish weight tables
        # alongside the strip itself)
        for w in first.get("strip_weights") or []:
            strip = []
            if isinstance(w, dict):
                for sym, ct in w.items():
                    if isinstance(sym, str):
                        try:
                            strip.extend([sym] * int(ct))
                        except (TypeError, ValueError):
                            continue
            out.append(strip)
    return out


def _estimate_rtp_bernoulli(ir: dict[str, Any]) -> float | None:
    """Order-of-magnitude RTP from first base reel set × paytable.

    For each line entry in the paytable, computes p_X^k × pay_X
    (Bernoulli per-cell approximation). Sums and divides by num_lines.
    Returns None if we cannot find a reel set.

    This is NOT a regulator-grade RTP — engine MC is. It is, however,
    a cheap sanity gate: if estimated_rtp is wildly off the published
    target, the parser likely dropped something.
    """
    bg = ir.get("bg_reel_sets") or []
    if not bg:
        return None
    first = bg[0]
    if not isinstance(first, dict):
        return None
    reels = _flatten_reels(first)
    if not any(reels):
        return None

    # Per-symbol frequency on each reel
    p_per_reel: list[dict[str, float]] = []
    for reel in reels:
        if not reel:
            p_per_reel.append({})
            continue
        c: dict[str, int] = {}
        for cell in reel:
            c[cell] = c.get(cell, 0) + 1
        n = len(reel)
        p_per_reel.append({k: v / n for k, v in c.items()})

    pt = ir.get("paytable") or []
    if not pt:
        return None

    total = 0.0
    for entry in pt:
        if not isinstance(entry, dict):
            continue
        combo = entry.get("combo") or entry.get("symbols") or []
        if not isinstance(combo, (list, tuple)) or not combo:
            continue
        first_sym = _coerce_cell(combo[0])
        if not first_sym or first_sym in ("--", "-", ""):
            continue
        run = 0
        for x in combo:
            if _coerce_cell(x) == first_sym:
                run += 1
            else:
                break
        if run < 3:
            continue
        prob = 1.0
        for r_idx in range(run):
            if r_idx >= len(p_per_reel):
                prob = 0.0
                break
            prob *= p_per_reel[r_idx].get(first_sym, 0.0)
        try:
            pay = float(entry.get("pays", 0) or entry.get("pay", 0) or 0)
        except (TypeError, ValueError):
            pay = 0.0
        if pay > 0 and prob > 0:
            total += prob * pay
    return total


def _classify_gap(gap_abs: float | None) -> str:
    if gap_abs is None:
        return "n/a"
    if gap_abs <= 0.005:
        return "green"
    if gap_abs <= 0.01:
        return "yellow"
    return "red"


# ─── Diagnose one vendor ───────────────────────────────────────────────────


def _discover_par_sheets(profile: VendorProfile, raw_dir: Path) -> list[str]:
    """Find every TSV in `raw_dir` matching the profile's main_par sheet
    base name (PAR-001, PAR-002, …) — returns list of sheet names
    without the .tsv suffix, sorted ascending."""
    if not raw_dir.is_dir():
        return []
    main = profile.sheets.get("main_par", "")
    # Many profiles list the canonical sheet as "PAR-001" (without TSV);
    # also accept e.g. "main", or any leading token.
    # We accept any *.tsv in raw_dir; sort by file name.
    sheets = sorted(p.stem for p in raw_dir.glob("*.tsv"))
    # If the profile has a specific prefix, prefer those
    if main and "-" in main:
        prefix = main.split("-", 1)[0]  # e.g. "PAR" from "PAR-001"
        prefixed = [s for s in sheets if s.startswith(prefix)]
        if prefixed:
            return prefixed
    return sheets


def diagnose_par(
    profile: VendorProfile,
    raw_dir: Path,
    sheet_name: str,
    published_rtp: float | None = None,
) -> ParMetrics:
    """Parse one PAR sheet + compute metrics."""
    try:
        ir = parse_par(profile, raw_dir, sheet=sheet_name, strict=False)
    except Exception as e:  # noqa: BLE001
        return ParMetrics(
            sheet_name=sheet_name,
            parsed=False,
            error=str(e),
        )

    bg = ir.get("bg_reel_sets") or []
    fs = ir.get("fg_reel_sets") or []
    pt = ir.get("paytable") or []
    feats = ir.get("features") or {}

    rtp = _estimate_rtp_bernoulli(ir)
    gap = abs(rtp - published_rtp) if rtp is not None and published_rtp is not None else None
    sev = _classify_gap(gap)

    return ParMetrics(
        sheet_name=sheet_name,
        parsed=True,
        paytable_rows=len(pt),
        reel_sets_base=len(bg),
        reel_sets_fs=len(fs),
        feature_count=len(feats) if isinstance(feats, dict) else 0,
        feature_kinds=sorted(feats.keys()) if isinstance(feats, dict) else [],
        estimated_rtp=rtp,
        rtp_gap=gap,
        gap_severity=sev,
    )


def diagnose_vendor(
    vendor_id: str,
    raw_dir: Path,
    *,
    target_rtp: float | None = None,
) -> VendorReport:
    """Full per-vendor diagnostic.

    `target_rtp` overrides the profile's published RTP — useful when
    a profile doesn't carry one and the operator wants to assess parity
    against an externally-published target.
    """
    profile = load_profile(vendor_id)
    published = target_rtp
    if published is None:
        meta = profile.data.get("meta") or {}
        if isinstance(meta, dict):
            v = meta.get("published_rtp") or meta.get("rtp")
            if isinstance(v, (int, float)):
                published = float(v)
    sheets = _discover_par_sheets(profile, raw_dir)
    per_par = [diagnose_par(profile, raw_dir, s, published) for s in sheets]
    parsed = [m for m in per_par if m.parsed]
    pt_rows = (
        sum(m.paytable_rows for m in parsed) / len(parsed) if parsed else 0.0
    )
    rs_base = (
        sum(m.reel_sets_base for m in parsed) / len(parsed) if parsed else 0.0
    )
    feat_kinds_seen = sorted({k for m in parsed for k in m.feature_kinds})
    rtps = [m.estimated_rtp for m in parsed if m.estimated_rtp is not None]
    gaps = [m.rtp_gap for m in parsed if m.rtp_gap is not None]
    mean_rtp = sum(rtps) / len(rtps) if rtps else None
    mean_gap = sum(gaps) / len(gaps) if gaps else None
    overall = _classify_gap(mean_gap)
    return VendorReport(
        vendor_id=vendor_id,
        profile_version=str(profile.data.get("profile_version", "?")),
        published_rtp=published,
        par_count=len(sheets),
        parsed_count=len(parsed),
        mean_paytable_rows=pt_rows,
        mean_reel_sets_base=rs_base,
        feature_kinds_seen=feat_kinds_seen,
        mean_estimated_rtp=mean_rtp,
        mean_gap=mean_gap,
        overall_severity=overall,
        per_par=per_par,
    )


# ─── Output emitters ───────────────────────────────────────────────────────


_COLORS = {
    "green": "#1e8e3e",
    "yellow": "#e9a73a",
    "red": "#d93025",
    "n/a": "#6c6c6c",
}


def _html_for(reports: list[VendorReport]) -> str:
    rows = []
    for r in reports:
        per_par_rows = []
        for m in r.per_par:
            color = _COLORS[m.gap_severity]
            rtp_str = f"{m.estimated_rtp:.4f}" if m.estimated_rtp is not None else "—"
            gap_str = f"{m.rtp_gap:.4f}" if m.rtp_gap is not None else "—"
            err = f"<span style='color:#d93025'> · {m.error}</span>" if m.error else ""
            per_par_rows.append(
                f"<tr><td>{m.sheet_name}</td>"
                f"<td>{'✅' if m.parsed else '❌'}{err}</td>"
                f"<td>{m.paytable_rows}</td>"
                f"<td>{m.reel_sets_base}</td>"
                f"<td>{m.reel_sets_fs}</td>"
                f"<td>{m.feature_count} ({', '.join(m.feature_kinds) or '—'})</td>"
                f"<td>{rtp_str}</td>"
                f"<td style='color:{color}'>{gap_str}</td></tr>"
            )
        overall = _COLORS[r.overall_severity]
        published = (
            f"{r.published_rtp:.4f}" if r.published_rtp is not None else "—"
        )
        mean_rtp = (
            f"{r.mean_estimated_rtp:.4f}" if r.mean_estimated_rtp is not None else "—"
        )
        mean_gap = (
            f"{r.mean_gap:.4f}" if r.mean_gap is not None else "—"
        )
        rows.append(f"""<section class="vendor" style="border-left: 6px solid {overall}">
  <h2>{r.vendor_id} <span class="tag">v{r.profile_version}</span></h2>
  <div class="summary">
    <div><span class="lbl">PAR sheets parsed</span><span class="val">{r.parsed_count}/{r.par_count}</span></div>
    <div><span class="lbl">Avg paytable rows</span><span class="val">{r.mean_paytable_rows:.1f}</span></div>
    <div><span class="lbl">Avg base reel sets</span><span class="val">{r.mean_reel_sets_base:.1f}</span></div>
    <div><span class="lbl">Published RTP</span><span class="val">{published}</span></div>
    <div><span class="lbl">Mean est. RTP</span><span class="val">{mean_rtp}</span></div>
    <div><span class="lbl">Mean gap</span><span class="val" style="color:{overall}">{mean_gap}</span></div>
    <div><span class="lbl">Feature kinds seen</span><span class="val">{', '.join(r.feature_kinds_seen) or '—'}</span></div>
  </div>
  <table>
    <thead><tr><th>Sheet</th><th>Parsed</th><th>Paytable</th>
      <th>Base reels</th><th>FS reels</th><th>Features</th>
      <th>Est. RTP</th><th>Gap</th></tr></thead>
    <tbody>{''.join(per_par_rows)}</tbody>
  </table>
</section>""")

    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><title>Vendor Parity Doctor — W4.9</title>
<style>
  body {{ background: #0e0e10; color: #f0f0f0; font: 13px/1.5 sans-serif;
         margin: 0; padding: 16px; }}
  h1 {{ margin: 0 0 16px 0; color: #6cf; }}
  .vendor {{ background: #1a1a20; margin-bottom: 16px; padding: 12px 16px;
             border-radius: 4px; }}
  .vendor h2 {{ margin: 0 0 8px 0; color: #f0f0f0; }}
  .tag {{ background: #333; padding: 2px 6px; border-radius: 3px;
          font-size: 11px; color: #aaa; }}
  .summary {{ display: grid; grid-template-columns: repeat(4, 1fr);
              gap: 8px; padding: 8px 0; }}
  .summary > div {{ background: #0e0e10; padding: 6px 8px; border-radius: 3px; }}
  .summary .lbl {{ display: block; color: #888; font-size: 11px; }}
  .summary .val {{ display: block; font-family: monospace;
                   color: #6cf; font-size: 14px; margin-top: 2px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th {{ background: #0e0e10; padding: 6px; text-align: left; color: #888;
        font-weight: normal; font-size: 11px; border-bottom: 1px solid #333; }}
  td {{ padding: 4px 6px; border-bottom: 1px solid #222;
        font-family: monospace; font-size: 12px; }}
</style>
</head><body>
<h1>Vendor Parity Doctor — W4.9</h1>
<p>Per-vendor PAR-sheet diagnostic. Gap = |measured Bernoulli RTP − published target|.
   <span style="color:#1e8e3e">green ≤0.005</span> ·
   <span style="color:#e9a73a">yellow ≤0.01</span> ·
   <span style="color:#d93025">red &gt;0.01</span>.</p>
{''.join(rows)}
</body></html>"""


def _markdown_for(reports: list[VendorReport]) -> str:
    out = ["# Vendor Parity Doctor — W4.9 report", ""]
    for r in reports:
        out.append(f"## {r.vendor_id} (profile v{r.profile_version})")
        out.append("")
        out.append(f"- PAR sheets parsed: **{r.parsed_count}/{r.par_count}**")
        if r.published_rtp is not None:
            out.append(f"- Published RTP: `{r.published_rtp:.4f}`")
        if r.mean_estimated_rtp is not None:
            out.append(f"- Mean est. RTP: `{r.mean_estimated_rtp:.4f}`")
        if r.mean_gap is not None:
            out.append(
                f"- Mean gap: `{r.mean_gap:.4f}` ({r.overall_severity.upper()})"
            )
        out.append(f"- Feature kinds: {', '.join(r.feature_kinds_seen) or '—'}")
        out.append("")
        out.append("| Sheet | Parsed | Paytable | Base reels | FS reels | Features | Est. RTP | Gap |")
        out.append("|---|---|---|---|---|---|---|---|")
        for m in r.per_par:
            rtp = f"{m.estimated_rtp:.4f}" if m.estimated_rtp is not None else "—"
            gap = f"{m.rtp_gap:.4f}" if m.rtp_gap is not None else "—"
            out.append(
                f"| `{m.sheet_name}` | {'✅' if m.parsed else '❌ ' + (m.error or '')} | "
                f"{m.paytable_rows} | {m.reel_sets_base} | {m.reel_sets_fs} | "
                f"{m.feature_count} | {rtp} | {gap} |"
            )
        out.append("")
    return "\n".join(out)


def emit_dashboard(
    reports: list[VendorReport],
    out_dir: Path,
) -> dict[str, Path]:
    """Write HTML + JSON + Markdown into out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    html = out_dir / "par_doctor.html"
    json_p = out_dir / "par_doctor.json"
    md = out_dir / "par_doctor.md"
    html.write_text(_html_for(reports))
    json_p.write_text(
        json.dumps([asdict(r) for r in reports], indent=2, ensure_ascii=False)
    )
    md.write_text(_markdown_for(reports))
    return {"html": html, "json": json_p, "md": md}


# ─── CLI ───────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-par-doctor",
        description="W4.9 — vendor parity doctor: parse PAR sheets, "
                    "estimate RTP, emit dashboard (HTML+JSON+MD).",
    )
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("vendor_id", nargs="?",
                   help="single vendor short id (e.g. vendor_c)")
    g.add_argument("--vendors",
                   help="comma-separated list of vendor ids "
                        "(e.g. vendor_c,vendor_d,vendor_e)")
    g.add_argument("--all", action="store_true",
                   help="diagnose every vendor profile bundled under "
                        "tools/vendor_profiles/")
    ap.add_argument("--raw", required=True,
                    help="raw PAR directory (contains *.tsv test fixtures)")
    ap.add_argument("--out", required=True,
                    help="output directory for dashboard artifacts")
    ap.add_argument("--target-rtp", type=float, default=None,
                    help="override published RTP for gap calculation")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    raw = Path(args.raw)
    out = Path(args.out)
    if not raw.is_dir():
        print(f"error: --raw {raw} is not a directory", file=sys.stderr)
        return 2

    if args.all:
        from importlib.resources import files
        try:
            profiles_dir = files("tools.vendor_profiles")  # type: ignore[arg-type]
            vendor_ids = sorted(
                p.stem for p in Path(str(profiles_dir)).glob("*.yaml")
            )
        except Exception:
            profiles_dir = Path(__file__).resolve().parent.parent / "vendor_profiles"
            vendor_ids = sorted(p.stem for p in profiles_dir.glob("*.yaml"))
    elif args.vendors:
        vendor_ids = [v.strip() for v in args.vendors.split(",") if v.strip()]
    else:
        vendor_ids = [args.vendor_id]

    reports: list[VendorReport] = []
    for vid in vendor_ids:
        try:
            r = diagnose_vendor(vid, raw, target_rtp=args.target_rtp)
        except Exception as e:  # noqa: BLE001
            print(f"warn: diagnose {vid} failed: {e}", file=sys.stderr)
            continue
        reports.append(r)

    if not reports:
        print("error: no vendor profiles diagnosed", file=sys.stderr)
        return 2

    paths = emit_dashboard(reports, out)
    if not args.quiet:
        for kind, path in paths.items():
            print(f"wrote {kind:5s} → {path}")
        for r in reports:
            sev = r.overall_severity.upper()
            print(f"  {r.vendor_id:12s}  {r.parsed_count}/{r.par_count} PARs  · "
                  f"gap={r.mean_gap if r.mean_gap is not None else 'n/a':<8} [{sev}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
