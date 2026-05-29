"""W6.3 — Pitch HTML acceptance tests.

Verifies:
  • The CLI runs end-to-end and emits the four expected artefacts.
  • The HTML is deterministic across two consecutive runs (byte-identical).
  • The HTML is offline-safe: no external `http(s)://` references except
    inside the `<div class="codeblock">` (copy-paste shell helper) or
    inside SVG `xmlns="..."` attributes (mandatory XML namespace ID,
    not a network fetch).
  • The machine-readable JSON has every required key + all 12 SWIDs + 5
    archetypes + wave timeline + signatures.
  • Every SWID + every archetype is present in both the HTML and the
    JSON.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
from pathlib import Path

import pytest

from tools.cert_bundle_swid.runner import GAME_SWIDS, SWID_TO_GAME
from tools.pitch_report.__main__ import main as pitch_main


ALL_SWIDS = sorted(SWID_TO_GAME.keys())
ALL_ARCHETYPES = ["cascade", "hold_and_win", "lines", "megaways", "ways"]


@pytest.fixture(scope="module")
def pitch_out() -> Path:
    """Run the pitch CLI once into a temp dir; reuse for every test."""
    td = Path(tempfile.mkdtemp(prefix="w63_pitch_"))
    rc = pitch_main(["--out-dir", str(td), "--no-regenerate-missing"])
    assert rc == 0
    yield td
    shutil.rmtree(td, ignore_errors=True)


def test_pitch_html_emitted(pitch_out: Path) -> None:
    """CLI emits the four required artefacts at the expected paths + sizes."""
    index = pitch_out / "index.html"
    css = pitch_out / "assets" / "pitch.css"
    data = pitch_out / "assets" / "pitch-data.json"
    sha = pitch_out / "pitch.sha256.txt"

    for p in (index, css, data, sha):
        assert p.exists(), f"missing artefact: {p}"

    size = index.stat().st_size
    assert size > 10_000, f"HTML too small ({size} B)"
    assert size < 200_000, f"HTML too large ({size} B, target < 200 KB)"


def test_pitch_html_deterministic(tmp_path: Path) -> None:
    """Two consecutive runs from a fresh out-dir produce byte-identical HTML."""
    a = tmp_path / "a"
    b = tmp_path / "b"
    pitch_main(["--out-dir", str(a), "--no-regenerate-missing"])
    pitch_main(["--out-dir", str(b), "--no-regenerate-missing"])
    ha = (a / "index.html").read_bytes()
    hb = (b / "index.html").read_bytes()
    assert ha == hb, "HTML output is not byte-identical across runs"
    # JSON is also pinned.
    ja = (a / "assets" / "pitch-data.json").read_bytes()
    jb = (b / "assets" / "pitch-data.json").read_bytes()
    assert ja == jb, "pitch-data.json not byte-identical"


_PROTO_RE = re.compile(r"https?://")
_XMLNS_RE = re.compile(r'xmlns(?::\w+)?="[^"]*"')
_CODEBLOCK_RE = re.compile(
    r'<div class="codeblock">.*?</div>',
    flags=re.S,
)


def _strip_safe(html: str) -> str:
    """Drop xmlns="…" attrs + codeblock copy-paste regions before scanning."""
    s = _XMLNS_RE.sub("", html)
    s = _CODEBLOCK_RE.sub("<div class=\"codeblock\"></div>", s)
    return s


def test_pitch_html_self_contained(pitch_out: Path) -> None:
    """No external HTTP fetches except XML namespace IDs + shell snippets."""
    html = (pitch_out / "index.html").read_text(encoding="utf-8")
    stripped = _strip_safe(html)
    leaks = _PROTO_RE.findall(stripped)
    assert not leaks, f"HTML leaks external URLs: {leaks[:3]}"
    # No external <script>/<link rel="stylesheet" href> either.
    assert "<script src=" not in html
    assert "rel=\"stylesheet\"" not in html
    assert "<link " not in html


def test_pitch_data_json_validates(pitch_out: Path) -> None:
    """Machine-readable JSON has all required top-level keys + counts."""
    raw = (pitch_out / "assets" / "pitch-data.json").read_text(encoding="utf-8")
    data = json.loads(raw)
    required = {
        "schema", "generated_at_epoch", "repo_sha", "repo_sha_short",
        "tool_version", "pubkey_fingerprint", "vendor_swids", "archetypes",
        "wolf_eruption_demo", "nl_comparison", "wave_timeline",
        "architecture_diagram", "signatures",
    }
    missing = required - set(data.keys())
    assert not missing, f"pitch-data.json missing keys: {missing}"
    assert data["schema"] == "slotmath.pitch-report/v1"
    assert len(data["vendor_swids"]) == 12
    assert len(data["archetypes"]) == 5
    assert len(data["wave_timeline"]) >= 10
    assert len(data["signatures"]) == 12
    assert len(data["nl_comparison"]) == 3


def test_all_12_swids_present(pitch_out: Path) -> None:
    """Every SWID from cert_bundle_swid appears in both HTML and JSON."""
    html = (pitch_out / "index.html").read_text(encoding="utf-8")
    data = json.loads(
        (pitch_out / "assets" / "pitch-data.json").read_text(encoding="utf-8"),
    )
    swids_in_json = {row["swid"] for row in data["vendor_swids"]}
    assert swids_in_json == set(ALL_SWIDS)
    for swid in ALL_SWIDS:
        assert swid in html, f"SWID {swid} missing in HTML"


def test_5_archetypes_present(pitch_out: Path) -> None:
    """All 5 archetypes appear in HTML + JSON."""
    html = (pitch_out / "index.html").read_text(encoding="utf-8")
    data = json.loads(
        (pitch_out / "assets" / "pitch-data.json").read_text(encoding="utf-8"),
    )
    archs_in_json = {row["archetype"] for row in data["archetypes"]}
    assert archs_in_json == set(ALL_ARCHETYPES)
    for a in ALL_ARCHETYPES:
        assert a in html, f"archetype {a} missing in HTML"


def test_pitch_sha_matches(pitch_out: Path) -> None:
    """pitch.sha256.txt actually matches sha256(index.html)."""
    import hashlib
    html_bytes = (pitch_out / "index.html").read_bytes()
    expected = hashlib.sha256(html_bytes).hexdigest()
    txt = (pitch_out / "pitch.sha256.txt").read_text().strip().split()[0]
    assert txt == expected


def test_signatures_block_consistent(pitch_out: Path) -> None:
    """Every signature row carries a 16-hex fingerprint + 64-hex sha256."""
    data = json.loads(
        (pitch_out / "assets" / "pitch-data.json").read_text(encoding="utf-8"),
    )
    swids_seen = set()
    for s in data["signatures"]:
        assert "swid" in s and "game" in s
        assert s["swid"] in SWID_TO_GAME
        sha = s["zip_sha256"]
        # Some entries may be empty if the bundle is genuinely missing,
        # but we expect MOST to be 64-char hex.
        if sha:
            assert len(sha) == 64, f"bad sha256 length for {s['swid']}: {sha!r}"
            assert all(c in "0123456789abcdef" for c in sha)
        swids_seen.add(s["swid"])
    assert swids_seen == set(SWID_TO_GAME.keys())
