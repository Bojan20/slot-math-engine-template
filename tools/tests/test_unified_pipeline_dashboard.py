"""Tests for the W7.11 unified audit dashboard renderer."""

from __future__ import annotations

from pathlib import Path


from tools.gdd_asset_pipeline.pipeline import GddSpec
from tools.symbolic_slot_math.model import RtpModel
from tools.unified_pipeline.dashboard import (
    render_unified_audit_dashboard,
    write_unified_audit_dashboard,
)
from tools.unified_pipeline.pipeline import (
    UnifiedAuditConfig,
    run_unified_pipeline,
)


def _classic_cfg() -> UnifiedAuditConfig:
    return UnifiedAuditConfig(
        gdd=GddSpec(
            game_id="DASH-TEST", name="Dash Test", theme="jungle", mood="epic",
            volatility_class="high",
            symbols=["A", "B", "C", "Wild", "Scatter"],
            features=["free_spins", "hold_and_win"],
        ),
        rtp_model=RtpModel(
            n_reels=5, n_symbols=2,
            paytable=[[1.0, 4.0, 10.0], []],
            min_match=3, paylines=20, anchor=0,
            weights=[[4.0, 6.0] for _ in range(5)],
        ),
        n_genome_population=6, n_genome_generations=2,
        n_rl_players=2, n_rl_sessions=2,
        n_session_mesh_spins=4,
    )


def test_dashboard_contains_doctype_and_title() -> None:
    report = run_unified_pipeline(_classic_cfg())
    html = render_unified_audit_dashboard(report)
    assert "<!doctype html>" in html
    assert "Unified Audit Pipeline (W7.11)" in html


def test_dashboard_embeds_consolidated_hash() -> None:
    report = run_unified_pipeline(_classic_cfg())
    html = render_unified_audit_dashboard(report)
    assert report.consolidated_hash in html
    assert report.session_mesh_root in html
    assert report.pareto_hash in html


def test_dashboard_has_no_cdn_references() -> None:
    report = run_unified_pipeline(_classic_cfg())
    html = render_unified_audit_dashboard(report)
    for marker in [
        "cdn.jsdelivr.net", "cdnjs.cloudflare.com",
        "googleapis.com", "unpkg.com", "<script src=\"http",
    ]:
        assert marker not in html, f"unexpected CDN ref: {marker}"


def test_dashboard_pareto_table_includes_every_member() -> None:
    report = run_unified_pipeline(_classic_cfg())
    html = render_unified_audit_dashboard(report)
    # The Pareto JSON is embedded; every member's RTP appears via the
    # data array. We do a substring count check on the rounded RTP
    # values for at least a sample.
    assert "id=\"pareto-body\"" in html
    assert "PARETO" in html
    # At least one numeric token from each member's fitness appears in
    # the embedded data (we look for "rtp": which appears N times if N
    # members are serialized).
    rtp_keys = html.count("\"rtp\":")
    assert rtp_keys >= len(report.pareto_summary)


def test_dashboard_rl_kpi_card_values_match_report() -> None:
    report = run_unified_pipeline(_classic_cfg())
    html = render_unified_audit_dashboard(report)
    assert str(report.rl_kpi["sessions"]) in html


def test_write_dashboard_round_trip(tmp_path: Path) -> None:
    report = run_unified_pipeline(_classic_cfg())
    out = tmp_path / "dash.html"
    written = write_unified_audit_dashboard(report, out)
    assert written == out
    body = out.read_text(encoding="utf-8")
    assert "<!doctype html>" in body
    assert report.consolidated_hash in body


def test_dashboard_html_escapes_special_chars() -> None:
    """If a GDD field smuggles HTML into a visible chrome slot, the
    dashboard must escape it. We check the gdd_id field — it's rendered
    in the summary header + asset KPI tile."""
    cfg = _classic_cfg()
    cfg.gdd.game_id = "DASH-<script>alert(1)</script>"
    report = run_unified_pipeline(cfg)
    html_out = render_unified_audit_dashboard(report)
    # The escaped form is present, the raw payload must NOT execute.
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html_out
    # The only legit <script> tag is the one we author at the bottom of
    # the template. Counting `<script>` against the expected 1 catches
    # any XSS injection.
    assert html_out.count("<script>") == 1


def test_dashboard_size_bounded_for_small_audit() -> None:
    report = run_unified_pipeline(_classic_cfg())
    html = render_unified_audit_dashboard(report)
    # Small audit (6 pop × 2 gen) should fit comfortably under 40 KB.
    assert 5_000 < len(html) < 40_000
