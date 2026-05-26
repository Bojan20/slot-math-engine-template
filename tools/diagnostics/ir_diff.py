"""W4.9b — Cross-IR diff tool.

Compares two universal IR JSON files side-by-side and reports
structural + numeric deltas. Use cases:

  • A/B compare two engine builds of the same game (regression catch)
  • Vendor cross-check: same SWID, two reel-set-tweak revisions
  • SMT-locked vs unlocked IR (closed-form scale audit trail)
  • Studio "Compare A/B" backend

Computes:
  • meta deltas (name, swid, vendor, target_rtp)
  • topology deltas (reels, rows, paylines)
  • paytable diff (added / removed / changed rows)
  • feature presence diff (kinds A only, kinds B only)
  • reel-set count + total-strip-length deltas
  • Bernoulli closed-form RTP estimate delta (reuses par_doctor helper)

Output: JSON delta + HTML side-by-side dashboard.

CLI:
    slot-ir-diff <a.ir.json> <b.ir.json>
        [--out-dir <dir>]   # writes diff.json + diff.html
        [--out-json <p>]    # explicit JSON-only path
        [--quiet]
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from tools.diagnostics.par_doctor import _estimate_rtp_bernoulli


@dataclass
class IrDiff:
    """Side-by-side diff between two IRs."""

    a_path: str
    b_path: str
    meta_delta: dict[str, dict[str, Any]] = field(default_factory=dict)
    topology_delta: dict[str, dict[str, Any]] = field(default_factory=dict)
    paytable_added: list[dict[str, Any]] = field(default_factory=list)
    paytable_removed: list[dict[str, Any]] = field(default_factory=list)
    paytable_changed: list[dict[str, Any]] = field(default_factory=list)
    features_a_only: list[str] = field(default_factory=list)
    features_b_only: list[str] = field(default_factory=list)
    reel_set_count_delta: dict[str, int] = field(default_factory=dict)
    rtp_estimate_a: float | None = None
    rtp_estimate_b: float | None = None
    rtp_estimate_delta: float | None = None
    has_changes: bool = False


def _diff_dict(a: dict[str, Any] | None,
                b: dict[str, Any] | None,
                keys: list[str]) -> dict[str, dict[str, Any]]:
    """Per-key delta between two flat dicts, restricted to `keys`."""
    out: dict[str, dict[str, Any]] = {}
    a = a or {}
    b = b or {}
    for k in keys:
        av, bv = a.get(k), b.get(k)
        if av != bv:
            out[k] = {"a": av, "b": bv}
    return out


def _paytable_signature(entry: dict[str, Any]) -> str:
    """Canonical key for a paytable row: combo + scope."""
    combo = entry.get("combo") or entry.get("symbols") or []
    scope = entry.get("scope") or "line"
    return f"{scope}::{','.join(str(x) for x in combo)}"


def _diff_paytable(
    pt_a: list[dict[str, Any]],
    pt_b: list[dict[str, Any]],
) -> tuple[list[dict], list[dict], list[dict]]:
    """Returns (added in B, removed in B, changed pay)."""
    sig_a = {_paytable_signature(e): e for e in pt_a or []}
    sig_b = {_paytable_signature(e): e for e in pt_b or []}
    added = [sig_b[k] for k in sig_b if k not in sig_a]
    removed = [sig_a[k] for k in sig_a if k not in sig_b]
    changed = []
    for k in sig_a:
        if k not in sig_b:
            continue
        a, b = sig_a[k], sig_b[k]
        pa = float(a.get("pays", 0) or 0)
        pb = float(b.get("pays", 0) or 0)
        if abs(pa - pb) > 1e-9:
            changed.append({
                "combo_signature": k,
                "pays_a": pa,
                "pays_b": pb,
                "delta": pb - pa,
            })
    return added, removed, changed


def _feature_kinds(ir: dict[str, Any]) -> set[str]:
    f = ir.get("features")
    if isinstance(f, dict):
        return set(f.keys())
    if isinstance(f, list):
        return {(x.get("kind") or x.get("type") or "?") for x in f
                if isinstance(x, dict)}
    return set()


def _reel_set_counts(ir: dict[str, Any]) -> dict[str, int]:
    """{base, fs} reel set counts."""
    return {
        "base": len(ir.get("bg_reel_sets")
                     or ir.get("reels", {}).get("base", [])
                     or []),
        "fs": len(ir.get("fg_reel_sets")
                   or ir.get("reels", {}).get("fs", [])
                   or []),
    }


def compute_diff(a: dict[str, Any], b: dict[str, Any],
                  a_label: str = "A", b_label: str = "B") -> IrDiff:
    """Compute the full delta between two IRs."""
    meta_delta = _diff_dict(
        a.get("meta"), b.get("meta"),
        ["name", "swid", "vendor", "version", "target_rtp"],
    )
    topo_delta = _diff_dict(
        a.get("topology"), b.get("topology"),
        ["reels", "rows", "paylines", "kind"],
    )
    pt_added, pt_removed, pt_changed = _diff_paytable(
        a.get("paytable") or [], b.get("paytable") or [],
    )
    a_kinds = _feature_kinds(a)
    b_kinds = _feature_kinds(b)
    rs_a = _reel_set_counts(a)
    rs_b = _reel_set_counts(b)
    rs_delta = {k: rs_b[k] - rs_a.get(k, 0) for k in rs_b}
    rtp_a = _estimate_rtp_bernoulli(a)
    rtp_b = _estimate_rtp_bernoulli(b)
    rtp_delta = (rtp_b - rtp_a) if (rtp_a is not None and rtp_b is not None) else None
    diff = IrDiff(
        a_path=a_label,
        b_path=b_label,
        meta_delta=meta_delta,
        topology_delta=topo_delta,
        paytable_added=pt_added,
        paytable_removed=pt_removed,
        paytable_changed=pt_changed,
        features_a_only=sorted(a_kinds - b_kinds),
        features_b_only=sorted(b_kinds - a_kinds),
        reel_set_count_delta=rs_delta,
        rtp_estimate_a=rtp_a,
        rtp_estimate_b=rtp_b,
        rtp_estimate_delta=rtp_delta,
    )
    diff.has_changes = bool(
        meta_delta or topo_delta or pt_added or pt_removed or pt_changed
        or diff.features_a_only or diff.features_b_only
        or any(v != 0 for v in rs_delta.values())
        or (rtp_delta is not None and abs(rtp_delta) > 1e-9)
    )
    return diff


def _html_for_diff(d: IrDiff) -> str:
    def kv(label: str, a: Any, b: Any) -> str:
        a_s = "—" if a is None else str(a)
        b_s = "—" if b is None else str(b)
        c = "#f0f0f0" if a == b else "#e9a73a"
        return (f"<tr style='color:{c}'>"
                f"<td>{label}</td><td>{a_s}</td><td>{b_s}</td></tr>")

    meta_rows = "".join(
        kv(k, d.meta_delta[k]["a"], d.meta_delta[k]["b"])
        for k in d.meta_delta
    ) or "<tr><td colspan='3' style='color:#1e8e3e'>no meta delta</td></tr>"
    topo_rows = "".join(
        kv(k, d.topology_delta[k]["a"], d.topology_delta[k]["b"])
        for k in d.topology_delta
    ) or "<tr><td colspan='3' style='color:#1e8e3e'>no topology delta</td></tr>"

    pt_added_rows = "".join(
        f"<tr><td>{_paytable_signature(e)}</td><td>{e.get('pays', '—')}</td></tr>"
        for e in d.paytable_added
    ) or "<tr><td colspan='2' style='color:#1e8e3e'>none</td></tr>"
    pt_removed_rows = "".join(
        f"<tr><td>{_paytable_signature(e)}</td><td>{e.get('pays', '—')}</td></tr>"
        for e in d.paytable_removed
    ) or "<tr><td colspan='2' style='color:#1e8e3e'>none</td></tr>"
    pt_changed_rows = "".join(
        f"<tr><td>{r['combo_signature']}</td>"
        f"<td>{r['pays_a']}</td><td>{r['pays_b']}</td>"
        f"<td style='color:{'#1e8e3e' if r['delta'] > 0 else '#d93025'}'>"
        f"{r['delta']:+.4f}</td></tr>"
        for r in d.paytable_changed
    ) or "<tr><td colspan='4' style='color:#1e8e3e'>none</td></tr>"

    rtp_a = "—" if d.rtp_estimate_a is None else f"{d.rtp_estimate_a:.4f}"
    rtp_b = "—" if d.rtp_estimate_b is None else f"{d.rtp_estimate_b:.4f}"
    rtp_delta = "—" if d.rtp_estimate_delta is None else f"{d.rtp_estimate_delta:+.4f}"
    rtp_color = "#f0f0f0"
    if d.rtp_estimate_delta is not None and abs(d.rtp_estimate_delta) > 1e-9:
        rtp_color = "#e9a73a"

    features_only = (
        f"<p><b>Features only in A:</b> {', '.join(d.features_a_only) or '—'}</p>"
        f"<p><b>Features only in B:</b> {', '.join(d.features_b_only) or '—'}</p>"
    )

    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><title>IR Diff — A vs B</title>
<style>
  body {{ background: #0e0e10; color: #f0f0f0;
         font: 13px/1.5 sans-serif; margin: 0; padding: 16px; }}
  h1 {{ margin: 0 0 16px 0; color: #6cf; }}
  h2 {{ color: #6cf; margin: 16px 0 8px 0; }}
  section {{ background: #1a1a20; padding: 12px 16px;
             border-radius: 4px; margin-bottom: 16px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ background: #0e0e10; padding: 6px; text-align: left;
        color: #888; font-weight: normal; font-size: 11px;
        border-bottom: 1px solid #333; }}
  td {{ padding: 4px 6px; border-bottom: 1px solid #222;
        font-family: monospace; font-size: 12px; }}
  .rtp-delta {{ font-size: 16px; color: {rtp_color}; }}
</style></head><body>
<h1>IR Diff — A vs B</h1>
<p><b>A:</b> {d.a_path}</p>
<p><b>B:</b> {d.b_path}</p>
<p><b>Has changes:</b> {"YES" if d.has_changes else "no"}</p>

<section>
  <h2>Bernoulli RTP estimate</h2>
  <p>A: <code>{rtp_a}</code> · B: <code>{rtp_b}</code> ·
     Δ: <code class="rtp-delta">{rtp_delta}</code></p>
</section>

<section>
  <h2>Meta delta</h2>
  <table><thead><tr><th>Key</th><th>A</th><th>B</th></tr></thead>
    <tbody>{meta_rows}</tbody></table>
</section>

<section>
  <h2>Topology delta</h2>
  <table><thead><tr><th>Key</th><th>A</th><th>B</th></tr></thead>
    <tbody>{topo_rows}</tbody></table>
</section>

<section>
  <h2>Features</h2>
  {features_only}
</section>

<section>
  <h2>Paytable added in B</h2>
  <table><thead><tr><th>Signature</th><th>Pays</th></tr></thead>
    <tbody>{pt_added_rows}</tbody></table>
</section>

<section>
  <h2>Paytable removed in B</h2>
  <table><thead><tr><th>Signature</th><th>Pays</th></tr></thead>
    <tbody>{pt_removed_rows}</tbody></table>
</section>

<section>
  <h2>Paytable pay changes</h2>
  <table><thead><tr><th>Signature</th><th>A pays</th>
    <th>B pays</th><th>Δ</th></tr></thead>
    <tbody>{pt_changed_rows}</tbody></table>
</section>

<section>
  <h2>Reel-set count delta</h2>
  <table><thead><tr><th>Set</th><th>Δ</th></tr></thead><tbody>
    {''.join(f'<tr><td>{k}</td><td>{v:+d}</td></tr>'
              for k, v in d.reel_set_count_delta.items())}
  </tbody></table>
</section>
</body></html>"""


def emit_diff(d: IrDiff, out_dir: Path | None = None,
               out_json: Path | None = None,
               out_html: Path | None = None) -> dict[str, Path]:
    """Persist the diff to disk. At least one of `out_dir`, `out_json`,
    or `out_html` must be supplied.

    `out_dir` writes both `diff.json` and `diff.html`. Explicit paths
    take precedence over the dir-default.
    """
    paths: dict[str, Path] = {}
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        paths["json"] = out_dir / "diff.json"
        paths["html"] = out_dir / "diff.html"
    if out_json is not None:
        paths["json"] = out_json
        out_json.parent.mkdir(parents=True, exist_ok=True)
    if out_html is not None:
        paths["html"] = out_html
        out_html.parent.mkdir(parents=True, exist_ok=True)
    if "json" in paths:
        paths["json"].write_text(
            json.dumps(asdict(d), indent=2, ensure_ascii=False),
        )
    if "html" in paths:
        paths["html"].write_text(_html_for_diff(d))
    return paths


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-ir-diff",
        description="Cross-IR diff: structural + numeric delta between "
                    "two universal IR JSONs (HTML + JSON output).",
    )
    ap.add_argument("a", help="path to IR A")
    ap.add_argument("b", help="path to IR B")
    ap.add_argument("--out-dir",
                    help="write diff.json + diff.html into this dir")
    ap.add_argument("--out-json", help="explicit JSON output path")
    ap.add_argument("--out-html", help="explicit HTML output path")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    a_path, b_path = Path(args.a), Path(args.b)
    if not a_path.is_file():
        print(f"error: A {a_path} not found", file=sys.stderr)
        return 2
    if not b_path.is_file():
        print(f"error: B {b_path} not found", file=sys.stderr)
        return 2
    a_ir = json.loads(a_path.read_text())
    b_ir = json.loads(b_path.read_text())
    diff = compute_diff(a_ir, b_ir,
                         a_label=str(a_path), b_label=str(b_path))

    if not (args.out_dir or args.out_json or args.out_html):
        # Default: write JSON to stdout
        sys.stdout.write(json.dumps(asdict(diff), indent=2, ensure_ascii=False))
        sys.stdout.write("\n")
        return 0 if not diff.has_changes else 1
    paths = emit_diff(
        diff,
        out_dir=Path(args.out_dir) if args.out_dir else None,
        out_json=Path(args.out_json) if args.out_json else None,
        out_html=Path(args.out_html) if args.out_html else None,
    )
    if not args.quiet:
        for kind, path in paths.items():
            print(f"wrote {kind:5s} → {path}")
        print(f"has_changes: {diff.has_changes}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
