"""W6.2 — tests for the multi-SWID PAR verification HTML dashboard."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from tools.par_verification_dashboard.build import (
    build_dataset,
    render_dashboard,
    write_dashboard,
)


# ─── Fixture helpers ─────────────────────────────────────────────────────


def _make_bundle(
    tmp_path: Path,
    *,
    game_id: str,
    swid: str,
    target_rtp: float,
    measured_rtp: float,
    jurisdictions: list[str],
    passed: bool = True,
    fingerprint: str = "deadbeefcafebabe",
) -> Path:
    """Synthesize a minimal operator-package.zip that matches the real shape."""
    manifest = {
        "ed25519_pubkey_fingerprint": fingerprint,
        "epoch": 1700000000,
        "files": [
            {"path": "README.md", "sha256": "00" * 32, "size_bytes": 100},
            {
                "path": f"cert/{game_id}.{swid}.cert.xml",
                "sha256": "11" * 32,
                "size_bytes": 600,
            },
        ],
    }
    juris_xml = "\n    ".join(f"<Jurisdiction>{j}</Jurisdiction>" for j in jurisdictions)
    cert_xml = f"""<?xml version='1.0' encoding='utf-8'?>
<CertV3 xmlns="urn:slotmath:cert:v3">
  <Meta>
    <GameId>{game_id}</GameId>
    <Swid>{swid}</Swid>
  </Meta>
  <Topology>
    <Reels>5</Reels>
    <Rows>3</Rows>
  </Topology>
  <Rtp>
    <Target>{target_rtp}</Target>
    <Measured>{measured_rtp}</Measured>
  </Rtp>
  <TypeCheck>
    <Passed>{"true" if passed else "false"}</Passed>
  </TypeCheck>
  <Jurisdictions>
    {juris_xml}
  </Jurisdictions>
</CertV3>"""
    zip_path = tmp_path / f"{game_id}.{swid}.operator-package.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("MANIFEST.json", json.dumps(manifest))
        zf.writestr(f"cert/{game_id}.{swid}.cert.xml", cert_xml)
        zf.writestr("meta/version.json", json.dumps({"engine_version": "1.0.0"}))
        zf.writestr("README.md", "# Test bundle")
    return zip_path


# ─── Tests ────────────────────────────────────────────────────────────────


def test_build_dataset_parses_minimal_bundle(tmp_path: Path) -> None:
    bundle = _make_bundle(
        tmp_path,
        game_id="alpha",
        swid="100-0001-001",
        target_rtp=0.95,
        measured_rtp=0.951,
        jurisdictions=["UKGC", "MGA"],
    )
    entries = build_dataset([bundle])
    assert len(entries) == 1
    e = entries[0]
    assert e.game_id == "alpha"
    assert e.swid == "100-0001-001"
    assert e.reels == 5
    assert e.rows == 3
    assert e.target_rtp == pytest.approx(0.95)
    assert e.measured_rtp == pytest.approx(0.951)
    assert e.delta_pp == pytest.approx(0.1, abs=1e-6)
    assert e.jurisdictions == ["UKGC", "MGA"]
    assert e.type_check_passed is True


def test_verdict_pass_warn_fail(tmp_path: Path) -> None:
    a = _make_bundle(
        tmp_path, game_id="a", swid="1", target_rtp=0.95, measured_rtp=0.951,
        jurisdictions=["UKGC"]
    )
    b = _make_bundle(
        tmp_path, game_id="b", swid="2", target_rtp=0.95, measured_rtp=0.960,
        jurisdictions=["UKGC"]
    )
    c = _make_bundle(
        tmp_path, game_id="c", swid="3", target_rtp=0.95, measured_rtp=0.95,
        jurisdictions=["UKGC"], passed=False
    )
    entries = build_dataset([a, b, c])
    by_swid = {e.swid: e.verdict for e in entries}
    assert by_swid["1"] == "pass"  # |0.1pp| ≤ 0.5pp
    assert by_swid["2"] == "warn"  # |1.0pp| > 0.5pp
    assert by_swid["3"] == "fail"  # TypeCheck.Passed = false


def test_dataset_is_sorted_deterministically(tmp_path: Path) -> None:
    z = _make_bundle(tmp_path, game_id="zeta", swid="200", target_rtp=0.95,
                     measured_rtp=0.95, jurisdictions=[])
    a = _make_bundle(tmp_path, game_id="alpha", swid="100", target_rtp=0.95,
                     measured_rtp=0.95, jurisdictions=[])
    m = _make_bundle(tmp_path, game_id="mu", swid="050", target_rtp=0.95,
                     measured_rtp=0.95, jurisdictions=[])
    # Pass them in random order; dataset must sort by (game_id, swid).
    entries = build_dataset([z, a, m])
    assert [e.game_id for e in entries] == ["alpha", "mu", "zeta"]


def test_missing_manifest_is_skipped(tmp_path: Path) -> None:
    zip_path = tmp_path / "bogus.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("some/random/file.txt", "hi")
    entries = build_dataset([zip_path])
    assert entries == []


def test_missing_cert_xml_is_skipped(tmp_path: Path) -> None:
    zip_path = tmp_path / "no-cert.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("MANIFEST.json", json.dumps({"files": []}))
    entries = build_dataset([zip_path])
    assert entries == []


def test_render_dashboard_contains_required_chunks(tmp_path: Path) -> None:
    bundle = _make_bundle(
        tmp_path, game_id="gamma", swid="200-9999-001", target_rtp=0.96,
        measured_rtp=0.961, jurisdictions=["UKGC", "MGA"]
    )
    html = render_dashboard(build_dataset([bundle]))
    assert "<!doctype html>" in html
    assert "PAR Verification Dashboard" in html
    assert "gamma" in html
    assert "200-9999-001" in html
    # Filter selects render the jurisdiction options.
    assert "UKGC" in html
    assert "MGA" in html
    # Embedded JSON data is present.
    assert "const DATA" in html


def test_render_dashboard_no_cdn_references(tmp_path: Path) -> None:
    bundle = _make_bundle(
        tmp_path, game_id="g", swid="1", target_rtp=0.95, measured_rtp=0.95,
        jurisdictions=["UKGC"]
    )
    html = render_dashboard(build_dataset([bundle]))
    # Dashboard must be air-gap safe — no remote scripts/styles/fonts.
    for marker in ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "googleapis.com",
                    "unpkg.com", "<script src", "<link rel=\"stylesheet\" href=\"http"]:
        assert marker not in html, f"unexpected remote reference: {marker}"


def test_render_dashboard_deterministic(tmp_path: Path) -> None:
    bundle = _make_bundle(
        tmp_path, game_id="det", swid="1", target_rtp=0.95, measured_rtp=0.95,
        jurisdictions=["UKGC"]
    )
    entries = build_dataset([bundle])
    a = render_dashboard(entries)
    b = render_dashboard(entries)
    assert a == b


def test_write_dashboard_emits_file(tmp_path: Path) -> None:
    bundle = _make_bundle(
        tmp_path, game_id="w", swid="1", target_rtp=0.95, measured_rtp=0.95,
        jurisdictions=["UKGC"]
    )
    out = tmp_path / "nested" / "dash.html"
    written = write_dashboard([bundle], out)
    assert written == out
    assert out.exists()
    text = out.read_text(encoding="utf-8")
    assert "<!doctype html>" in text


def test_cli_main_returns_2_when_no_bundles(tmp_path: Path) -> None:
    from tools.par_verification_dashboard.__main__ import main as cli_main
    rc = cli_main([
        "--bundles", str(tmp_path / "nothing-*.zip"),
        "--out", str(tmp_path / "out.html"),
    ])
    assert rc == 2


def test_cli_main_renders_when_bundle_exists(tmp_path: Path) -> None:
    from tools.par_verification_dashboard.__main__ import main as cli_main
    bundle = _make_bundle(
        tmp_path, game_id="cli", swid="1", target_rtp=0.95, measured_rtp=0.95,
        jurisdictions=["UKGC"]
    )
    out = tmp_path / "cli_dash.html"
    rc = cli_main([
        "--bundles", str(bundle),
        "--out", str(out),
    ])
    assert rc == 0
    assert out.exists()


def test_multi_jurisdiction_aggregation(tmp_path: Path) -> None:
    a = _make_bundle(tmp_path, game_id="a", swid="1", target_rtp=0.95,
                     measured_rtp=0.95, jurisdictions=["UKGC", "MGA"])
    b = _make_bundle(tmp_path, game_id="b", swid="2", target_rtp=0.95,
                     measured_rtp=0.95, jurisdictions=["MGA", "NJ-DGE"])
    html = render_dashboard(build_dataset([a, b]))
    # All three jurisdictions show up as filter options.
    for j in ["UKGC", "MGA", "NJ-DGE"]:
        assert f'value="{j}"' in html


def test_entry_to_dict_round_trips_through_json(tmp_path: Path) -> None:
    bundle = _make_bundle(
        tmp_path, game_id="rt", swid="1", target_rtp=0.95, measured_rtp=0.949,
        jurisdictions=["UKGC"]
    )
    e = build_dataset([bundle])[0]
    d = e.to_dict()
    j = json.dumps(d)
    parsed = json.loads(j)
    assert parsed["game_id"] == "rt"
    assert parsed["verdict"] == "pass"
    assert parsed["delta_pp"] == pytest.approx(-0.1, abs=1e-6)
