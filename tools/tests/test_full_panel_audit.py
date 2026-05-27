"""PHASE 48 — Ultra Deep Build Panel Audit tests.

Pins the contract that EVERY interactive element in `<section id=
"panel-build">` is wired to a real, non-stub handler. If anyone adds
a button / slider / select inside the build panel without a handler,
this suite trips immediately.

Scope: 15 canonical inventory entries (6 main action buttons + 4
secondary buttons + topology select + tier slider block + 3 dynamic
families: weight sliders, name inputs, icon picker buttons).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.build_audit.full_panel_auditor import (
    PANEL_BUILD_INVENTORY,
    PanelElementFinding,
    TIER_DATA_VALUES,
    audit_full_panel,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── Inventory shape ──────────────────────────────────────────────────────


def test_inventory_covers_six_main_buttons():
    ids = {row[0] for row in PANEL_BUILD_INVENTORY}
    for required in (
        "btn-quickstart", "btn-validate", "btn-autobalance",
        "btn-compute", "btn-play-template", "btn-build-more",
    ):
        assert required in ids, f"main action button {required!r} missing from inventory"


def test_inventory_covers_four_secondary_buttons():
    ids = {row[0] for row in PANEL_BUILD_INVENTORY}
    for required in (
        "preset-custom-toggle", "my-icons-export", "my-icons-import", "show-grid",
    ):
        assert required in ids, f"secondary button {required!r} missing from inventory"


def test_inventory_covers_topology_select():
    ids = {row[0] for row in PANEL_BUILD_INVENTORY}
    assert "topology" in ids


def test_inventory_covers_dynamic_slider_families():
    ids = {row[0] for row in PANEL_BUILD_INVENTORY}
    assert "[data-w]" in ids
    assert ".sym-name" in ids
    assert ".sym-icon-btn" in ids


def test_tier_data_values_match_html_markup():
    """Every TIER_DATA_VALUES entry must exist as `data-tier=` in the
    build panel HTML — otherwise the tier slider block is incomplete."""
    html = (REPO_ROOT / "web" / "studio" / "index.html").read_text(encoding="utf-8")
    # Restrict search to panel-build section.
    import re
    m = re.search(r'<section[^>]*id="panel-build"', html)
    assert m is not None
    panel_start = m.start()
    end_marker = html.find("</section>", panel_start)
    panel = html[panel_start:end_marker if end_marker > 0 else len(html)]
    for tier in TIER_DATA_VALUES:
        assert f'data-tier="{tier}"' in panel, \
            f"tier {tier!r} slider markup missing from panel-build"


# ─── Live audit — every element passes on main ────────────────────────────


def test_every_panel_element_passes_audit():
    """Regression bar: every element in PANEL_BUILD_INVENTORY must
    return verdict=PASS on the current main branch. If any FAIL or
    WARN survives merge, this test trips."""
    findings = audit_full_panel(REPO_ROOT)
    fails = [f for f in findings if f.verdict == "FAIL"]
    warns = [f for f in findings if f.verdict == "WARN"]
    assert not fails, f"FAILED elements: {[(f.element_id, f.fix) for f in fails]}"
    assert not warns, f"WARN elements: {[(f.element_id, f.fix) for f in warns]}"


def test_show_grid_button_now_has_a_handler():
    """PHASE 48 fix landed: show-grid is wired to a real toggle."""
    js = (REPO_ROOT / "web" / "studio" / "app.js").read_text(encoding="utf-8")
    assert 'querySelector("#show-grid")' in js
    assert "grid overlay ON" in js or "grid overlay OFF" in js, \
        "show-grid handler must log the toggle direction"


def test_show_grid_handler_surfaces_error_path():
    """PHASE 48 fix: show-grid handler emits a toast OR console.warn on
    error path (no silent catch)."""
    js = (REPO_ROOT / "web" / "studio" / "app.js").read_text(encoding="utf-8")
    # The handler block is small — pin the error surface.
    assert "console.warn(\"[show-grid]\"" in js or 'msg: "Grid toggle failed' in js


# ─── Per-element independent audits ───────────────────────────────────────


@pytest.mark.parametrize("inv_row", PANEL_BUILD_INVENTORY)
def test_each_element_is_in_panel(inv_row):
    """Per-element: element must be present inside the build panel."""
    ident, kind, label, event = inv_row
    findings = audit_full_panel(REPO_ROOT)
    f = next(x for x in findings if x.element_id == ident)
    assert f.in_panel_build, f"{ident!r} not in panel-build"


@pytest.mark.parametrize("inv_row", PANEL_BUILD_INVENTORY)
def test_each_element_has_handler_reachable(inv_row):
    """Per-element: handler reachable from app.js."""
    ident, kind, label, event = inv_row
    findings = audit_full_panel(REPO_ROOT)
    f = next(x for x in findings if x.element_id == ident)
    assert f.handler_reachable, f"{ident!r} handler not reachable"


@pytest.mark.parametrize("inv_row", PANEL_BUILD_INVENTORY)
def test_each_element_handler_is_non_stub(inv_row):
    """Per-element: handler is not an empty arrow / no-op stub."""
    ident, kind, label, event = inv_row
    findings = audit_full_panel(REPO_ROOT)
    f = next(x for x in findings if x.element_id == ident)
    assert f.handler_non_stub, f"{ident!r} handler appears to be a stub"


# ─── Stock-checkout safety ────────────────────────────────────────────────


def test_audit_handles_missing_studio_bundle(tmp_path: Path):
    """When the studio bundle is missing, the auditor surfaces every
    element as FAIL with a clear fix — no crash."""
    findings = audit_full_panel(tmp_path)
    assert all(f.verdict == "FAIL" for f in findings)
    assert all("studio bundle" in f.fix for f in findings)
