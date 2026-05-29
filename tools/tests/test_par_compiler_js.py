"""W7.7 — Live PAR Compiler JS bundle tests."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest

from tools.par_compiler_js.compile import (
    JS_RUNTIME,
    build_js_bundle,
    build_studio_html,
    canonical_js_runtime,
    write_studio_html,
)


# ─── Bundle integrity ───────────────────────────────────────────────


def test_bundle_sha256_matches_runtime_bytes() -> None:
    bundle = build_js_bundle()
    expected = hashlib.sha256(canonical_js_runtime().encode("utf-8")).hexdigest()
    assert bundle.sha256_hex == expected


def test_bundle_is_deterministic_across_calls() -> None:
    a = build_js_bundle()
    b = build_js_bundle()
    assert a.sha256_hex == b.sha256_hex
    assert a.n_bytes == b.n_bytes


def test_bundle_contains_canonical_entrypoints() -> None:
    js = build_js_bundle().js
    for marker in [
        "function closedFormRtp",
        "function mulberry32",
        "function runMcSimulation",
        "function compileAndEvaluate",
        "window.ParCompiler",
        "module.exports",
    ]:
        assert marker in js


def test_bundle_n_bytes_matches_utf8_encoding() -> None:
    bundle = build_js_bundle()
    assert bundle.n_bytes == len(bundle.js.encode("utf-8"))


def test_canonical_js_strips_outer_whitespace() -> None:
    raw = canonical_js_runtime()
    assert not raw.startswith("\n")
    assert not raw.endswith("\n\n")


# ─── Studio HTML ────────────────────────────────────────────────────


def test_studio_html_embeds_js_bundle() -> None:
    html, bundle = build_studio_html()
    assert "<!doctype html>" in html
    assert "<title>SLOT-MATH-ENGINE — Live PAR Compiler</title>" in html
    assert bundle.sha256_hex in html
    assert "function closedFormRtp" in html


def test_studio_html_no_cdn_references() -> None:
    html, _ = build_studio_html()
    for marker in [
        "cdn.jsdelivr.net",
        "cdnjs.cloudflare.com",
        "googleapis.com",
        "unpkg.com",
        '<script src="http',
    ]:
        assert marker not in html, f"unexpected remote ref: {marker}"


def test_write_studio_html_round_trip(tmp_path: Path) -> None:
    out = tmp_path / "studio" / "live-par.html"
    written, bundle = write_studio_html(out)
    assert written == out
    body = out.read_text(encoding="utf-8")
    assert bundle.sha256_hex in body
    assert "function compileAndEvaluate" in body


def test_default_spec_in_html_parses_as_json() -> None:
    html, _ = build_studio_html()
    m = re.search(
        r'<textarea id="spec-input">(.*?)</textarea>', html, re.DOTALL,
    )
    assert m, "expected spec textarea"
    spec_json = m.group(1)
    parsed = json.loads(spec_json)
    assert "reels" in parsed
    assert "paytable" in parsed
    assert parsed["paylines"] == 20


# ─── Cross-check JS math against the Python reference ──────────────


def test_js_runtime_constant_starts_with_version_comment() -> None:
    assert "PAR_COMPILER_VERSION" in JS_RUNTIME
    assert "Live PAR Compiler runtime" in JS_RUNTIME


def test_js_bundle_size_within_sane_bounds() -> None:
    """The hand-written JS runtime is ~3-5 KB. If a change blows past
    20 KB we want to know — the bundle is supposed to stay tiny so
    that an air-gapped regulator can re-paste it from an audit ticket."""
    bundle = build_js_bundle()
    assert 1_500 < bundle.n_bytes < 20_000


# ─── Node smoke (best-effort) ───────────────────────────────────────


def test_js_runtime_evaluates_in_node_if_available(tmp_path: Path) -> None:
    """If Node is on PATH, execute the bundle and verify closedFormRtp
    matches the Python `qmc_estimator` benchmark of 0.20224."""
    import shutil
    import subprocess

    node = shutil.which("node")
    if node is None:
        pytest.skip("node binary not on PATH")
    bundle = build_js_bundle()
    js_path = tmp_path / "runtime.js"
    test_path = tmp_path / "test.cjs"
    js_path.write_text(bundle.js + "\n", encoding="utf-8")
    test_path.write_text(
        "const r = require('./runtime.js');\n"
        "const spec = {reels:[[4,6],[4,6],[4,6],[4,6],[4,6]],"
        "paytable:[[1,4,10],[]],min_match:3,paylines:20,bet:1,anchor:0};\n"
        "const out = r.closedFormRtp(spec);\n"
        "console.log(JSON.stringify(out));\n",
        encoding="utf-8",
    )
    res = subprocess.run(
        [node, str(test_path)], capture_output=True, text=True, check=False,
    )
    assert res.returncode == 0, res.stderr
    out = json.loads(res.stdout.strip())
    assert out["rtp"] == pytest.approx(0.20224, abs=1e-6)
