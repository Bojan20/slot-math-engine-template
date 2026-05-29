"""W6.3 — Render a CollectedData object into deterministic HTML.

The HTML is one file; CSS is inlined into `<style>` and ALSO emitted as
``assets/pitch.css`` for reviewer convenience. No external `<script>` /
`<link href="https://…">` references.

Determinism rules:
  • All loops iterate sorted keys / sorted lists.
  • Floats formatted via fixed-precision helpers (no locale).
  • SVG IDs not used (no auto-increment).
  • Generated banner uses the pinned epoch + 7-char repo SHA.
"""

from __future__ import annotations

import datetime as _dt
import html as _html
from typing import Any

from .data_collector import CollectedData
from .svg_charts import bar_chart_rtp_delta, verdict_pie_chart
from .templates import HTML_FOOT, PITCH_CSS, html_head


def _esc(s: Any) -> str:
    return _html.escape(str(s), quote=True)


def _fmt_pct(v: float) -> str:
    s = f"{v * 100:+.3f}%"
    if s == "+0.000%":
        s = "0.000%"
    return s


def _fmt_rtp(v: float) -> str:
    return f"{v:.6f}"


def _row_class(verdict: str) -> str:
    v = verdict.upper()
    if v == "PASS":
        return "pass"
    if v == "FAIL":
        return "fail"
    if v == "SKIP":
        return "skip"
    return "missing"


def _badge(verdict: str) -> str:
    v = verdict.upper()
    cls = "pass" if v == "PASS" else "fail" if v == "FAIL" else "skip" if v == "SKIP" else "missing"
    return f'<span class="badge {cls}">{_esc(v)}</span>'


def _epoch_to_str(epoch: int) -> str:
    return _dt.datetime.fromtimestamp(epoch, tz=_dt.timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S UTC",
    )


# ─── section renderers ─────────────────────────────────────────────────


def _section_vendor_swids(data: CollectedData) -> str:
    counts = {"PASS": 0, "FAIL": 0, "SKIP": 0, "MISSING": 0}
    for r in data.vendor_swids:
        key = r["verdict"].upper()
        counts[key] = counts.get(key, 0) + 1

    rows_html = []
    for r in data.vendor_swids:
        cls = _row_class(r["verdict"])
        rows_html.append(
            f'<tr class="{cls}">'
            f'<td><span class="tag-vendor">{_esc(r["game"])}</span></td>'
            f'<td>{_esc(r["swid"])}</td>'
            f'<td>{_fmt_rtp(r["target_rtp"])}</td>'
            f'<td>{_fmt_rtp(r["mc_rtp"])}</td>'
            f'<td>{_fmt_pct(r["delta_rtp"])}</td>'
            f'<td>{_fmt_pct(r["delta_hit_freq"])}</td>'
            f'<td>{_esc(r["zip_sha256"][:16])}…</td>'
            f'<td>{"OK" if r["signature_ok"] else "—"}</td>'
            f'<td>{_badge(r["verdict"])}</td>'
            f'</tr>'
        )
    chart_rows = sorted(
        ({"label": r["swid"], "value": r["delta_rtp"]} for r in data.vendor_swids),
        key=lambda d: d["label"],
    )
    chart_svg = bar_chart_rtp_delta(
        chart_rows, title="Vendor SWID — MC RTP delta vs target",
    )
    pie_svg = verdict_pie_chart(counts, title="Vendor verdicts")

    return f"""
<section id="vendor-swids">
  <h2>Vendor cert verdicts — 4 games × 12 SWIDs</h2>
  <div class="cols">
    <div>{chart_svg}</div>
    <div style="flex: 0 0 160px;">{pie_svg}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Game</th><th>SWID</th><th>Target RTP</th>
        <th>MC RTP</th><th>ΔRTP</th><th>ΔHitFreq</th>
        <th>ZIP sha256[:16]</th><th>Sig</th><th>Verdict</th>
      </tr>
    </thead>
    <tbody>
{chr(10).join("    " + r for r in rows_html)}
    </tbody>
  </table>
</section>
"""


def _section_archetypes(data: CollectedData) -> str:
    rows_html = []
    chart_rows = []
    for a in data.archetypes:
        cls = _row_class(a["verdict"])
        rows_html.append(
            f'<tr class="{cls}">'
            f'<td><span class="tag-greenfield">{_esc(a["archetype"])}</span></td>'
            f'<td>{_esc(a["swid"])}</td>'
            f'<td>{_fmt_rtp(a["target_rtp"])}</td>'
            f'<td>{_fmt_rtp(a["mc_rtp"])}</td>'
            f'<td>{_fmt_pct(a["delta_rtp"])}</td>'
            f'<td>{_fmt_pct(a["delta_hit_freq"])}</td>'
            f'<td>{_esc(a["cert_zip"]) or "—"}</td>'
            f'<td>{_badge(a["verdict"])}</td>'
            f'</tr>'
        )
        chart_rows.append({"label": a["archetype"], "value": a["delta_rtp"]})
    chart_svg = bar_chart_rtp_delta(
        sorted(chart_rows, key=lambda d: d["label"]),
        title="Greenfield archetype — MC RTP convergence (Δ vs target)",
    )
    return f"""
<section id="archetypes">
  <h2>Greenfield demos — 5 archetypes (lines, ways, megaways, H&amp;W, cascade)</h2>
  <div>{chart_svg}</div>
  <table>
    <thead>
      <tr>
        <th>Archetype</th><th>SWID</th><th>Target RTP</th>
        <th>MC RTP</th><th>ΔRTP</th><th>ΔHitFreq</th>
        <th>Cert ZIP</th><th>Verdict</th>
      </tr>
    </thead>
    <tbody>
{chr(10).join("    " + r for r in rows_html)}
    </tbody>
  </table>
</section>
"""


def _section_wolf(data: CollectedData) -> str:
    w = data.wolf_eruption_demo
    gates_html = []
    for g in w["gates"]:
        cls = _row_class(g["status"])
        gates_html.append(
            f'<tr class="{cls}"><td>{_esc(g["name"])}</td>'
            f'<td>{_badge(g["status"])}</td>'
            f'<td>{_fmt_pct(g["value"])}</td>'
            f'<td>{_fmt_pct(g["tolerance"])}</td>'
            f'<td>{_esc(g["reason"]) or "—"}</td></tr>'
        )
    stages = w.get("stages_present", {})
    pipeline = " → ".join(
        f"<b>{k}</b>" if stages.get(k) else k
        for k in ["dsl_spec", "smt_synth", "ir", "mc_verdict", "acceptance"]
    )
    return f"""
<section id="wolf-eruption">
  <h2>W5.7 Wolf Eruption Mythic — end-to-end demo</h2>
  <div class="kv">
    <div><span class="k">pipeline stages:</span><span class="v">{pipeline}</span></div>
    <div><span class="k">target RTP:</span><span class="v">{_fmt_rtp(w["target_rtp"])}</span></div>
    <div><span class="k">MC RTP:</span><span class="v">{_fmt_rtp(w["mc_rtp"])}</span></div>
    <div><span class="k">MC ΔRTP:</span><span class="v">{_fmt_pct(w["delta_rtp"])}</span></div>
    <div><span class="k">SMT closed-form ΔRTP:</span><span class="v">{_fmt_pct(w["smt_delta_rtp"])}</span></div>
    <div><span class="k">overall verdict:</span><span class="v">{_badge(w["verdict"])}</span></div>
  </div>
  <h3>Gate results</h3>
  <table>
    <thead><tr><th>Gate</th><th>Status</th><th>Δ</th><th>Tolerance</th><th>Reason</th></tr></thead>
    <tbody>
{chr(10).join("    " + r for r in gates_html) if gates_html else "    <tr><td colspan='5'><i>no gates recorded</i></td></tr>"}
    </tbody>
  </table>
</section>
"""


def _section_nl(data: CollectedData) -> str:
    rows_html = []
    for r in data.nl_comparison:
        d61 = r["w61_deterministic"]
        d62 = r["w62_llm"]
        rows_html.append(
            '<tr>'
            f'<td><span class="tag-llm">{_esc(r["archetype"])}</span></td>'
            f'<td class="nl-prompt">{_esc(r["prompt"])}</td>'
            f'<td>{_esc(d61["approach"])}<br/>archetype=<b>{_esc(d61["detected_archetype"])}</b></td>'
            f'<td>{_esc(d62["approach"])}<br/>archetype=<b>{_esc(d62["detected_archetype"])}</b>, '
            f'RTP={_fmt_rtp(d62["target_rtp"])}, max_win={d62["max_win_x"]}x, '
            f'features={d62["n_features"]}</td>'
            '</tr>'
        )
    return f"""
<section id="nl-comparison">
  <h2>W6.1 deterministic vs W6.2 LLM NL → GDD (3 sample prompts)</h2>
  <table class="nl-table">
    <thead>
      <tr><th>Archetype</th><th>NL prompt</th><th>W6.1 deterministic</th><th>W6.2 LLM</th></tr>
    </thead>
    <tbody>
{chr(10).join("    " + r for r in rows_html)}
    </tbody>
  </table>
</section>
"""


def _section_timeline(data: CollectedData) -> str:
    rows_html = []
    for r in data.wave_timeline:
        rows_html.append(
            f'<tr><td>{_esc(r["wave"])}</td><td>{_esc(r["summary"])}</td></tr>'
        )
    return f"""
<section id="timeline">
  <h2>Wave timeline — W4.13 → W6.3</h2>
  <table>
    <thead><tr><th>Wave</th><th>Summary</th></tr></thead>
    <tbody>
{chr(10).join("    " + r for r in rows_html)}
    </tbody>
  </table>
</section>
"""


def _section_architecture(data: CollectedData) -> str:
    diag = _esc(data.architecture_diagram)
    return f"""
<section id="architecture">
  <h2>Compiler pipeline architecture</h2>
  <div class="diagram">{diag}</div>
</section>
"""


def _section_signatures(data: CollectedData) -> str:
    rows_html = []
    for s in data.signatures:
        rows_html.append(
            f'<tr><td>{_esc(s["swid"])}</td><td>{_esc(s["game"])}</td>'
            f'<td>{_esc(s["zip_sha256"])}</td>'
            f'<td>{_esc(s["pubkey_fingerprint"])}</td></tr>'
        )
    return f"""
<section id="signatures">
  <h2>Cert ZIP signatures (sha256 + ed25519 pubkey fingerprint)</h2>
  <table>
    <thead><tr><th>SWID</th><th>Game</th><th>ZIP sha256</th><th>ed25519 pubkey</th></tr></thead>
    <tbody>
{chr(10).join("    " + r for r in rows_html)}
    </tbody>
  </table>
</section>
"""


def _section_verify(data: CollectedData) -> str:
    # Copy-paste shell commands. The note clarifies the references contain
    # protocol mentions only as instructions (not as JS / link fetches).
    cmds = (
        "# 1) Rebuild every cert bundle locally\n"
        "python3 -m tools.cert_bundle_swid all\n"
        "\n"
        "# 2) Re-emit this pitch HTML from the same checkout\n"
        "python3 -m tools.pitch_report\n"
        "\n"
        "# 3) Confirm bit-identical sha256 against the value recorded in pitch.sha256.txt\n"
        "shasum -a 256 reports/pitch-report/index.html\n"
        "\n"
        "# 4) Verify any cert bundle's signature against the bundled public PEM\n"
        "python3 - <<'PY'\n"
        "from pathlib import Path\n"
        "import json, zipfile\n"
        "from tools.cert_bundle_swid.sign import verify_signature, load_or_generate_key\n"
        "zp = next(Path('reports/cert-bundle-swid').glob('*.zip'))\n"
        "with zipfile.ZipFile(zp) as z:\n"
        "    manifest = z.read('MANIFEST.json')\n"
        "    sig = z.read('SIGNATURE.sig')\n"
        "keys = load_or_generate_key()\n"
        "print('verdict', verify_signature(manifest, sig, public_pem_path=keys.public_pem_path))\n"
        "PY\n"
    )
    return f"""
<section id="verify">
  <h2>How to verify (regulator copy-paste)</h2>
  <div class="codeblock">{_esc(cmds)}</div>
  <p class="small">All commands are offline. No network access required.</p>
</section>
"""


# ─── top-level render ──────────────────────────────────────────────────


def render_html(data: CollectedData) -> str:
    generated_meta = (
        f"Generated from commit {data.repo_sha_short} on "
        f"{_epoch_to_str(data.generated_at_epoch)} — {data.tool_version}"
    )
    head = html_head(
        title="Slot Math Engine — Pitch Report",
        css=PITCH_CSS,
        generated_meta=generated_meta,
    )
    body_parts = [
        _section_vendor_swids(data),
        _section_archetypes(data),
        _section_wolf(data),
        _section_nl(data),
        _section_timeline(data),
        _section_architecture(data),
        _section_signatures(data),
        _section_verify(data),
    ]
    return head + "".join(body_parts) + HTML_FOOT
