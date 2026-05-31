"""SLOT-MATH Faza 5.4 — Compare report HTML emitter.

Generates a single static HTML page at
`reports/dossier/variant-compare-<game>.html` that shows N variants
side-by-side with:
  - Per-variant KPI table (RTP, hit_freq, variance, max_win, vol class)
  - Per-metric DELTA from a baseline variant (default: lowest RTP)
  - Full Merkle attestation chain per variant (par → ir → mc → deploy)
  - Promote-CTA stub (links to runtime promote.py)

Designed for regulator handover: every number on the page maps back to
a content-addressed merkle hash, so a third party can `sha256sum` any
artefakt and grep the report to verify chain integrity.

No JS runtime dependency. Pure HTML+CSS so it renders inside a regulator
sandbox or printed PDF.
"""
from __future__ import annotations

import html
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class VariantSnapshot:
    """One variant's data slice for the compare report."""

    variant_id: str
    par: dict[str, Any]
    ir: dict[str, Any]
    mc_attestation: dict[str, Any]
    build_manifest: dict[str, Any] | None = None  # from assemble.py


_CSS = """\
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0f1c;
    color: #e0e4eb;
    padding: 24px;
}
h1 { color: #00d4ff; font-size: 24px; margin-bottom: 8px; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
.variants-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    margin-bottom: 32px;
}
.variant-card {
    background: #131826;
    border: 1px solid #2a3245;
    border-radius: 8px;
    padding: 16px;
}
.variant-card h2 {
    color: #00d4ff;
    font-size: 18px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #2a3245;
}
.kpi { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.kpi .label { color: #888; }
.kpi .value { color: #e0e4eb; font-family: ui-monospace, monospace; }
.kpi .delta-pos { color: #4caf50; }
.kpi .delta-neg { color: #f44336; }
.kpi .delta-zero { color: #888; }
.merkle-chain {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #2a3245;
}
.merkle-chain h3 {
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
}
.merkle-row {
    display: flex;
    justify-content: space-between;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    padding: 2px 0;
}
.merkle-row .stage { color: #888; }
.merkle-row .hash { color: #00d4ff; }
.promote-cta {
    margin-top: 16px;
    background: #00d4ff;
    color: #0a0f1c;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
}
.promote-cta:hover { background: #00b8e0; }
table.metric-table {
    width: 100%;
    border-collapse: collapse;
    background: #131826;
    border: 1px solid #2a3245;
    border-radius: 8px;
    overflow: hidden;
}
table.metric-table th, table.metric-table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid #2a3245;
    font-size: 13px;
}
table.metric-table th {
    background: #1a2030;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
}
table.metric-table td.numeric {
    font-family: ui-monospace, monospace;
    text-align: right;
}
.footer {
    margin-top: 32px;
    padding: 16px;
    background: #131826;
    border: 1px solid #2a3245;
    border-radius: 8px;
    font-size: 11px;
    color: #888;
    font-family: ui-monospace, monospace;
}
"""


def _fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def _fmt_num(x: float, decimals: int = 4) -> str:
    return f"{x:.{decimals}f}"


def _short_hash(h: str, n: int = 8) -> str:
    return h[:n] + "…" if len(h) > n else h


def _delta_class(delta: float) -> str:
    if delta > 1e-9:
        return "delta-pos"
    if delta < -1e-9:
        return "delta-neg"
    return "delta-zero"


def _render_variant_card(
    v: VariantSnapshot,
    baseline: VariantSnapshot | None,
) -> str:
    rtp = v.par.get("rtp", {}).get("rtp_total", 0.0)
    hf = v.par.get("limits", {}).get("hit_freq_target", 0.0)
    variance = v.par.get("rtp", {}).get("variance", 0.0)
    max_win = v.par.get("limits", {}).get("max_win_x", 0.0)
    vol = "MED-HI" if variance > 50 else ("MED" if variance > 20 else "LOW")

    # Deltas vs baseline (if not baseline itself)
    delta_rows = ""
    if baseline and baseline.variant_id != v.variant_id:
        base_rtp = baseline.par.get("rtp", {}).get("rtp_total", 0.0)
        base_hf = baseline.par.get("limits", {}).get("hit_freq_target", 0.0)
        delta_rtp = rtp - base_rtp
        delta_hf = hf - base_hf
        delta_rows = f"""
            <div class="kpi">
              <span class="label">Δ RTP vs {html.escape(baseline.variant_id)}</span>
              <span class="value {_delta_class(delta_rtp)}">{delta_rtp:+.4f}</span>
            </div>
            <div class="kpi">
              <span class="label">Δ hit_freq</span>
              <span class="value {_delta_class(delta_hf)}">{delta_hf:+.4f}</span>
            </div>
        """

    par_merkle = v.par.get("merkle_root_sha256", "")
    ir_sha = v.ir.get("provenance", {}).get("ir_sha256", "")
    mc_sha = v.mc_attestation.get("attestation_sha256", "")
    deploy_sig = (
        v.build_manifest.get("deploy_signature", "")
        if v.build_manifest
        else ""
    )

    merkle_rows = "".join([
        f'<div class="merkle-row"><span class="stage">par</span><span class="hash" title="{html.escape(par_merkle)}">{html.escape(_short_hash(par_merkle, 16))}</span></div>',
        f'<div class="merkle-row"><span class="stage">ir</span><span class="hash" title="{html.escape(ir_sha)}">{html.escape(_short_hash(ir_sha, 16))}</span></div>',
        f'<div class="merkle-row"><span class="stage">mc_sweep</span><span class="hash" title="{html.escape(mc_sha)}">{html.escape(_short_hash(mc_sha, 16))}</span></div>',
        f'<div class="merkle-row"><span class="stage">deploy</span><span class="hash" title="{html.escape(deploy_sig)}">{html.escape(_short_hash(deploy_sig, 16) if deploy_sig else "—")}</span></div>',
    ])

    return f"""
        <div class="variant-card">
          <h2>variant_{html.escape(v.variant_id)}</h2>
          <div class="kpi"><span class="label">RTP</span><span class="value">{_fmt_pct(rtp)}</span></div>
          <div class="kpi"><span class="label">Hit Freq</span><span class="value">{_fmt_pct(hf)}</span></div>
          <div class="kpi"><span class="label">Variance</span><span class="value">{_fmt_num(variance, 1)}</span></div>
          <div class="kpi"><span class="label">Max Win</span><span class="value">{_fmt_num(max_win, 0)}×</span></div>
          <div class="kpi"><span class="label">Vol Class</span><span class="value">{vol}</span></div>
          {delta_rows}
          <div class="merkle-chain">
            <h3>Merkle attestation chain</h3>
            {merkle_rows}
          </div>
          <button class="promote-cta" onclick="promoteVariant('{html.escape(v.variant_id)}')">Promote to production</button>
        </div>
    """


def _render_metric_table(variants: list[VariantSnapshot]) -> str:
    headers = (
        "<thead><tr><th>Metric</th>"
        + "".join(
            f'<th class="numeric">variant_{html.escape(v.variant_id)}</th>'
            for v in variants
        )
        + "</tr></thead>"
    )

    def row(label: str, getter, fmt) -> str:
        cells = "".join(
            f'<td class="numeric">{fmt(getter(v))}</td>' for v in variants
        )
        return f"<tr><td>{html.escape(label)}</td>{cells}</tr>"

    rows = [
        row("RTP", lambda v: v.par.get("rtp", {}).get("rtp_total", 0.0), _fmt_pct),
        row("Hit Freq", lambda v: v.par.get("limits", {}).get("hit_freq_target", 0.0), _fmt_pct),
        row("Variance", lambda v: v.par.get("rtp", {}).get("variance", 0.0), lambda x: _fmt_num(x, 2)),
        row("Max Win (x)", lambda v: v.par.get("limits", {}).get("max_win_x", 0.0), lambda x: _fmt_num(x, 0)),
        row("PAR SHA-256", lambda v: v.par.get("merkle_root_sha256", ""), lambda h: f'<span style="font-family:ui-monospace,monospace;font-size:10px">{html.escape(_short_hash(h, 12))}</span>'),
        row("MC tier",
            lambda v: v.mc_attestation.get("tier", ""),
            lambda s: html.escape(str(s))),
    ]
    return f'<table class="metric-table">{headers}<tbody>{"".join(rows)}</tbody></table>'


def render_compare_report(
    game_id: str,
    variants: list[VariantSnapshot],
    baseline_variant_id: str | None = None,
) -> str:
    """Render the full HTML compare report.

    Args:
        game_id: Game identifier (shown in title).
        variants: List of VariantSnapshot, in display order.
        baseline_variant_id: Which variant to delta-against. Defaults to
            the lowest-RTP variant.
    """
    if not variants:
        raise ValueError("at least one variant required")

    if baseline_variant_id is None:
        baseline_variant = min(
            variants,
            key=lambda v: v.par.get("rtp", {}).get("rtp_total", float("inf")),
        )
    else:
        match = [v for v in variants if v.variant_id == baseline_variant_id]
        if not match:
            raise ValueError(
                f"baseline_variant_id={baseline_variant_id!r} not in variants"
            )
        baseline_variant = match[0]

    cards = "".join(_render_variant_card(v, baseline_variant) for v in variants)
    table = _render_metric_table(variants)

    # Footer paper trail
    chain_summary = json.dumps(
        {
            "game_id": game_id,
            "baseline_variant": baseline_variant.variant_id,
            "variants": [
                {
                    "variant_id": v.variant_id,
                    "par_sha256": v.par.get("merkle_root_sha256", ""),
                    "ir_sha256": v.ir.get("provenance", {}).get("ir_sha256", ""),
                    "mc_sha256": v.mc_attestation.get("attestation_sha256", ""),
                    "deploy_signature": (
                        v.build_manifest.get("deploy_signature", "")
                        if v.build_manifest
                        else ""
                    ),
                }
                for v in variants
            ],
        },
        sort_keys=True,
        indent=2,
    )

    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(game_id)} — Variant Compare</title>
  <style>{_CSS}</style>
</head>
<body>
  <h1>{html.escape(game_id)} · Variant Compare</h1>
  <div class="subtitle">{len(variants)} variants · baseline: <code>variant_{html.escape(baseline_variant.variant_id)}</code></div>
  <div class="variants-grid">{cards}</div>
  {table}
  <div class="footer">
    <strong>Paper trail (regulator-grade):</strong>
    <pre style="margin-top:8px;white-space:pre-wrap">{html.escape(chain_summary)}</pre>
  </div>
  <script>
    function promoteVariant(id) {{
      alert('Promotion request for variant_' + id + ' — invoke tools/par_deploy/promote.py');
    }}
  </script>
</body>
</html>
"""


def emit_compare_report(
    game_id: str,
    variants: list[VariantSnapshot],
    out_path: Path,
    baseline_variant_id: str | None = None,
) -> Path:
    """Render and write the compare report. Returns the written path."""
    html_str = render_compare_report(game_id, variants, baseline_variant_id)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_str, encoding="utf-8")
    return out_path
