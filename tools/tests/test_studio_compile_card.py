"""SLOT-MATH — Studio Compile-from-PAR card test gate."""
from __future__ import annotations

from pathlib import Path


REPO = Path(__file__).resolve().parent.parent.parent
CARD_DIR = REPO / "web" / "studio" / "par-compile-card"


def test_compile_card_html_exists():
    assert (CARD_DIR / "index.html").exists()


def test_compile_card_js_exists():
    assert (CARD_DIR / "compile.js").exists()


def test_html_includes_drag_drop_zone():
    html = (CARD_DIR / "index.html").read_text(encoding="utf-8")
    assert 'id="drop"' in html
    assert "drag-over" in html
    assert "drop PAR" in html.lower() or "drag par" in html.lower()


def test_html_includes_pipeline_steps():
    html = (CARD_DIR / "index.html").read_text(encoding="utf-8")
    # 5 pipeline steps: normalize, ir, mc, deploy, attest
    for step in ("normalize", "ir", "mc", "deploy", "attest"):
        assert f'data-step="{step}"' in html


def test_html_includes_mc_tier_select():
    html = (CARD_DIR / "index.html").read_text(encoding="utf-8")
    for tier in ("T1", "T2", "T3", "T4", "T5"):
        assert f'value="{tier}"' in html


def test_js_posts_to_api_compile():
    js = (CARD_DIR / "compile.js").read_text(encoding="utf-8")
    assert "/api/compile" in js
    assert "FormData" in js
    assert "par_file" in js


def test_js_walks_pipeline_steps():
    js = (CARD_DIR / "compile.js").read_text(encoding="utf-8")
    assert "setStep" in js
    for step in ("normalize", "ir", "mc", "deploy", "attest"):
        assert step in js


def test_js_has_cli_fallback():
    js = (CARD_DIR / "compile.js").read_text(encoding="utf-8")
    assert "slot-math par add" in js
    assert "slot-math ir build" in js
    assert "slot-math mc run" in js
    assert "slot-math deploy" in js


def test_html_includes_skin_select():
    html = (CARD_DIR / "index.html").read_text(encoding="utf-8")
    assert 'id="skin-select"' in html
    assert "default text-glyph" in html


def test_html_compile_button_starts_disabled():
    html = (CARD_DIR / "index.html").read_text(encoding="utf-8")
    assert 'id="compile-btn"' in html
    assert "disabled" in html


def test_js_enables_button_when_ready():
    js = (CARD_DIR / "compile.js").read_text(encoding="utf-8")
    assert "checkReady" in js
    assert "compileBtn.disabled" in js
