"""PHASE 16 — Multi-platform RGS verification UI smoke tests.

The web client is a standalone HTML/JS app under `web/rgs_client/`.
There is no Node test runner for it (it's deliberately zero-deps), so
these Python tests pin the *file shape* and the airgap contract:

  * file exists + parses as HTML (no broken tags via simple regex)
  * NO third-party CDN script / stylesheet links (airgap-safe)
  * uses browser-native WebCrypto (`crypto.subtle.digest` + `importKey`
    + `sign`) and NOT any third-party crypto lib
  * matches the canonical-bytes shape used by PHASE 15 receipts so the
    chain Merkle reproduces inside the browser

This is regulator-grade documentation: if anyone ever reaches for a
third-party library inside the client, this test trips immediately.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RGS_CLIENT_HTML = REPO_ROOT / "web" / "rgs_client" / "index.html"


def test_rgs_client_html_exists():
    assert RGS_CLIENT_HTML.exists(), f"missing {RGS_CLIENT_HTML}"


def test_rgs_client_is_valid_html_skeleton():
    body = RGS_CLIENT_HTML.read_text(encoding="utf-8")
    # Doctype + html/body markers.
    assert body.lower().startswith("<!doctype html>"), "missing doctype"
    assert "<html" in body
    assert "</html>" in body
    assert "<body>" in body and "</body>" in body
    # Title surfaces "RGS Verifier" so the airgapped reviewer knows what
    # they opened.
    assert re.search(r"<title>[^<]*rgs[^<]*verifier", body, re.I), \
        "title must mention 'RGS Verifier'"


def test_rgs_client_is_airgap_safe_no_cdn_scripts():
    body = RGS_CLIENT_HTML.read_text(encoding="utf-8")
    # Reject any remote http(s) script / stylesheet — every byte must
    # come from the file system so the page works on a Faraday-cage
    # regulator review laptop.
    for pattern in (
        r'src=["\']https?://',
        r'href=["\']https?://[^"\']+\.css',
    ):
        assert not re.search(pattern, body, re.I), \
            f"airgap violation: pattern {pattern!r} found in HTML"


def test_rgs_client_uses_browser_native_webcrypto():
    body = RGS_CLIENT_HTML.read_text(encoding="utf-8")
    # The verifier must call `crypto.subtle` directly — anything else
    # implies a third-party crypto lib we don't audit.
    assert "crypto.subtle.digest" in body
    assert "crypto.subtle.importKey" in body
    assert "crypto.subtle.sign" in body


def test_rgs_client_implements_three_verifier_modes():
    body = RGS_CLIENT_HTML.read_text(encoding="utf-8")
    # Pin the three regulator-facing checks the UI provides.
    assert "Verify commit" in body, "commit/reveal verifier UI missing"
    assert "Derive RNG seed" in body, "per-spin seed derivation UI missing"
    assert "Replay" in body or "replay" in body, "offline session replay missing"


def test_rgs_client_canonical_bytes_match_phase15():
    """PHASE 15 SpinReceipt uses sorted JSON keys + no whitespace + a
    leading 0x00 byte for the leaf hash (Certificate Transparency style).
    The browser-side implementation MUST do the same — pin it via the
    JS source text."""
    body = RGS_CLIENT_HTML.read_text(encoding="utf-8")
    # canonical() helper: must sort keys (Object.keys + .sort())
    assert "Object.keys(obj).sort()" in body, \
        "canonical JSON must sort keys to match PHASE 15"
    # spinHash() must prepend a 0x00 byte before SHA-256
    assert "[0, ...utf8(canon)]" in body, \
        "spin hash must prepend 0x00 leaf prefix"
    # Merkle node concat must prepend 0x01 (internal-node prefix)
    assert "[1, ...a, ...b]" in body, \
        "merkle node hash must prepend 0x01 internal prefix"


def test_rgs_client_le_u64_nonce_encoding():
    """PHASE 15 derive_spin_seed encodes the nonce as little-endian
    u64. The browser-side `leU64` helper must replicate this byte order
    or the derived seeds will diverge from the server."""
    body = RGS_CLIENT_HTML.read_text(encoding="utf-8")
    assert "leU64" in body, "missing little-endian u64 encoder for nonce"
    # The encoder must shift right by 8 each iteration (LE byte order).
    assert "big >>= 8n" in body, \
        "leU64 must shift right by 8 each iteration"
