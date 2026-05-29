"""W5.3 — cell-level PAR provenance tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.par_cell_provenance.build import (
    build_cell_provenance,
    canonical_cell_bytes,
    collect_cells,
    mint_cell_proof,
    sign_cell_root,
    verify_cell_proof,
    verify_signed_root,
    _excel_ref_sort_key,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


def _make_fixture(tmp_path: Path, cells: dict[str, dict]) -> Path:
    """Write a synthetic PAR dump where ``cells`` is ``{sheet: {ref: value}}``."""
    par_dir = tmp_path / "raw"
    par_dir.mkdir()
    for sheet, data in cells.items():
        (par_dir / f"{sheet}.cells.json").write_text(json.dumps(data))
    return par_dir


# ─── canonical encoding ──────────────────────────────────────────────


def test_canonical_cell_bytes_is_deterministic() -> None:
    a = canonical_cell_bytes("PAR_001", "C3", "200-1775-001")
    b = canonical_cell_bytes("PAR_001", "C3", "200-1775-001")
    assert a == b


def test_canonical_cell_bytes_includes_sheet_and_ref_separators() -> None:
    raw = canonical_cell_bytes("PAR_001", "C3", "x")
    assert b"PAR_001\x00C3\x00" in raw


def test_canonical_cell_bytes_differs_per_value() -> None:
    a = canonical_cell_bytes("S", "A1", 1)
    b = canonical_cell_bytes("S", "A1", 2)
    assert a != b


def test_canonical_cell_bytes_uses_sort_keys_for_dicts() -> None:
    # Equal dict, different insertion order → same bytes.
    a = canonical_cell_bytes("S", "A1", {"x": 1, "y": 2})
    b = canonical_cell_bytes("S", "A1", {"y": 2, "x": 1})
    assert a == b


def test_canonical_cell_bytes_rejects_empty_sheet_or_ref() -> None:
    with pytest.raises(ValueError):
        canonical_cell_bytes("", "A1", "x")
    with pytest.raises(ValueError):
        canonical_cell_bytes("S", "", "x")


# ─── ref sort key (Excel column-then-row) ────────────────────────────


def test_excel_ref_sort_orders_columns_naturally() -> None:
    refs = ["AA1", "B1", "A1", "Z1", "AB1", "A2"]
    refs.sort(key=_excel_ref_sort_key)
    assert refs == ["A1", "A2", "B1", "Z1", "AA1", "AB1"]


def test_excel_ref_sort_rows_within_column() -> None:
    refs = ["A10", "A1", "A2", "A100"]
    refs.sort(key=_excel_ref_sort_key)
    assert refs == ["A1", "A2", "A10", "A100"]


def test_excel_ref_sort_malformed_goes_last() -> None:
    refs = ["A1", "weird", "B2"]
    refs.sort(key=_excel_ref_sort_key)
    assert refs[-1] == "weird"


# ─── collect_cells ───────────────────────────────────────────────────


def test_collect_cells_walks_sorted(tmp_path: Path) -> None:
    par = _make_fixture(tmp_path, {
        "PAR_002": {"A1": "x", "B1": 7},
        "PAR_001": {"A1": "y", "A2": 9},
    })
    triples = collect_cells(par)
    # Sorted by sheet first, then by Excel ref order.
    assert triples == [
        ("PAR_001", "A1", "y"),
        ("PAR_001", "A2", 9),
        ("PAR_002", "A1", "x"),
        ("PAR_002", "B1", 7),
    ]


def test_collect_cells_rejects_missing_dir(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        collect_cells(tmp_path / "no-such")


def test_collect_cells_rejects_non_dict_json(tmp_path: Path) -> None:
    par = tmp_path / "raw"
    par.mkdir()
    (par / "PAR_001.cells.json").write_text(json.dumps(["not", "a", "dict"]))
    with pytest.raises(ValueError):
        collect_cells(par)


def test_collect_cells_rejects_invalid_json(tmp_path: Path) -> None:
    par = tmp_path / "raw"
    par.mkdir()
    (par / "PAR_001.cells.json").write_text("{ not json")
    with pytest.raises(ValueError):
        collect_cells(par)


# ─── build_cell_provenance ───────────────────────────────────────────


def test_build_cell_provenance_returns_root_and_leaves(tmp_path: Path) -> None:
    par = _make_fixture(tmp_path, {
        "PAR_001": {"A1": 1, "B1": 2, "C1": 3},
    })
    prov = build_cell_provenance(par)
    assert prov.leaf_count == 3
    assert len(prov.merkle_root_hex) == 64
    assert all(len(leaf.leaf_hash_hex) == 64 for leaf in prov.leaves)


def test_build_cell_provenance_is_deterministic(tmp_path: Path) -> None:
    par = _make_fixture(tmp_path, {
        "PAR_001": {"A1": "x", "B1": 7},
        "PAR_002": {"A1": "y"},
    })
    p1 = build_cell_provenance(par)
    p2 = build_cell_provenance(par)
    assert p1.merkle_root_hex == p2.merkle_root_hex
    assert [(l.sheet, l.ref) for l in p1.leaves] == \
           [(l.sheet, l.ref) for l in p2.leaves]


def test_build_cell_provenance_empty_dir_yields_empty_root(tmp_path: Path) -> None:
    par = tmp_path / "raw"
    par.mkdir()
    prov = build_cell_provenance(par)
    assert prov.leaf_count == 0
    assert prov.merkle_root_hex == ""


# ─── mint + verify proof ─────────────────────────────────────────────


def test_mint_and_verify_inclusion_proof_round_trip(tmp_path: Path) -> None:
    par = _make_fixture(tmp_path, {
        "PAR_001": {f"A{i}": i * 10 for i in range(1, 33)},
    })
    prov = build_cell_provenance(par)
    proof = mint_cell_proof(prov, "PAR_001", "A17")
    assert proof.sheet == "PAR_001"
    assert proof.ref == "A17"
    assert proof.value == 170  # range starts at i=1 → A17 = 17*10
    assert verify_cell_proof(proof, 170, prov.merkle_root_hex) is True


def test_inclusion_proof_fails_for_wrong_claimed_value(tmp_path: Path) -> None:
    par = _make_fixture(tmp_path, {
        "PAR_001": {"A1": 1, "B1": 2, "C1": 3},
    })
    prov = build_cell_provenance(par)
    proof = mint_cell_proof(prov, "PAR_001", "B1")
    assert verify_cell_proof(proof, 99, prov.merkle_root_hex) is False


def test_inclusion_proof_fails_for_wrong_root(tmp_path: Path) -> None:
    par = _make_fixture(tmp_path, {
        "PAR_001": {"A1": 1, "B1": 2, "C1": 3},
    })
    prov = build_cell_provenance(par)
    proof = mint_cell_proof(prov, "PAR_001", "B1")
    wrong_root = "0" * 64
    assert verify_cell_proof(proof, 2, wrong_root) is False


def test_mint_proof_unknown_cell_raises_key_error(tmp_path: Path) -> None:
    par = _make_fixture(tmp_path, {"PAR_001": {"A1": 1}})
    prov = build_cell_provenance(par)
    with pytest.raises(KeyError):
        mint_cell_proof(prov, "PAR_001", "Z99")


def test_proof_size_scales_logarithmically(tmp_path: Path) -> None:
    """Sibling-path length is O(log2 N) — for 1024 cells we expect ≤ 11."""
    par = _make_fixture(tmp_path, {
        "PAR_001": {f"A{i}": i for i in range(1, 1025)},
    })
    prov = build_cell_provenance(par)
    proof = mint_cell_proof(prov, "PAR_001", "A500")
    assert len(proof.siblings) <= 11  # log2(1024) = 10, +1 slack for odd layers


# ─── ed25519 sign / verify ───────────────────────────────────────────


def test_sign_and_verify_root_round_trip(tmp_path: Path) -> None:
    from tools.cert_bundle_swid.sign import load_or_generate_key  # noqa: PLC0415
    keys_dir = tmp_path / "keys"
    keys_dir.mkdir()
    priv_pem = keys_dir / "private.pem"
    pub_pem = keys_dir / "public.pem"
    keypair = load_or_generate_key(private_pem=priv_pem, public_pem=pub_pem)
    # load_or_generate falls back to deterministic seed when paths empty,
    # but actually writes to its own DEFAULT path if explicit ones are
    # missing. Re-derive into our tmp paths if the helper didn't.
    if not priv_pem.exists():
        keys_dir = keypair.private_pem_path.parent
        priv_pem = keypair.private_pem_path
        pub_pem = keypair.public_pem_path

    par = _make_fixture(tmp_path, {"PAR_001": {"A1": 1, "B1": 2}})
    prov = build_cell_provenance(par)
    signed = sign_cell_root(prov.merkle_root_hex, private_pem=priv_pem)
    assert signed.merkle_root_hex == prov.merkle_root_hex
    assert verify_signed_root(signed, public_pem=pub_pem) is True


def test_verify_signed_root_rejects_tampered_root(tmp_path: Path) -> None:
    from tools.cert_bundle_swid.sign import load_or_generate_key  # noqa: PLC0415
    from tools.par_cell_provenance.build import SignedRoot  # noqa: PLC0415
    keys_dir = tmp_path / "keys"
    keys_dir.mkdir()
    priv_pem = keys_dir / "private.pem"
    pub_pem = keys_dir / "public.pem"
    keypair = load_or_generate_key(private_pem=priv_pem, public_pem=pub_pem)
    if not priv_pem.exists():
        priv_pem = keypair.private_pem_path
        pub_pem = keypair.public_pem_path

    par = _make_fixture(tmp_path, {"PAR_001": {"A1": 1}})
    prov = build_cell_provenance(par)
    signed = sign_cell_root(prov.merkle_root_hex, private_pem=priv_pem)
    # Tamper: swap one nibble in the root and re-package without re-sign.
    tampered = SignedRoot(
        merkle_root_hex="0" + signed.merkle_root_hex[1:],
        signature_b64=signed.signature_b64,
        public_pem_fingerprint=signed.public_pem_fingerprint,
    )
    assert verify_signed_root(tampered, public_pem=pub_pem) is False


# ─── Live FK Wolf Run integration ────────────────────────────────────


def test_live_fort_knox_cells_round_trip_smoke() -> None:
    """End-to-end: build, mint, verify against the shipping FK dump."""
    par_dir = REPO_ROOT / "games" / "fort-knox-wolf-run" / "raw"
    if not par_dir.exists():
        pytest.skip(f"FK raw dump missing at {par_dir}")
    prov = build_cell_provenance(par_dir)
    assert prov.leaf_count >= 1000
    # PAR_001!C3 holds the SWID 200-1775-001 — the canonical regulator
    # cell to spot-check.
    proof = mint_cell_proof(prov, "PAR_001", "C3")
    assert verify_cell_proof(proof, "200-1775-001", prov.merkle_root_hex) is True
    # Mutating the claimed SWID flips the verdict.
    assert verify_cell_proof(proof, "999-9999-999", prov.merkle_root_hex) is False


# ─── CLI smoke ───────────────────────────────────────────────────────


def test_cli_build_proof_verify_round_trip(tmp_path: Path) -> None:
    from tools.par_cell_provenance.__main__ import main as cli_main  # noqa: PLC0415
    par = _make_fixture(tmp_path, {
        "PAR_001": {"A1": "alpha", "B1": "beta", "C3": "200-1775-001"},
    })
    manifest = tmp_path / "out" / "manifest.json"
    rc = cli_main(["build", str(par), "--out", str(manifest)])
    assert rc == 0
    assert manifest.exists()

    proof_path = tmp_path / "out" / "proof.json"
    rc = cli_main([
        "proof", str(manifest), "--cell", "PAR_001!C3", "--out", str(proof_path),
    ])
    assert rc == 0
    assert proof_path.exists()

    rc = cli_main(["verify", str(proof_path)])
    assert rc == 0
