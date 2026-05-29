"""W7.5 — Provenance Mesh tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.provenance_mesh.mesh import (
    SignedSessionRoot,
    SpinReceipt,
    build_session_mesh,
    mint_spin_proof,
    sign_session_root,
    verify_session_signature,
    verify_spin_proof,
)


def _raw_spins(n: int) -> list[dict]:
    return [
        {
            "server_seed_hex": f"{i:064x}",
            "client_seed": f"client-{i}",
            "nonce": i,
            "outcome": {"reels": [i, i + 1, i + 2]},
        }
        for i in range(n)
    ]


# ─── SpinReceipt canonical encoding ─────────────────────────────────


def test_spin_receipt_canonical_bytes_are_sorted() -> None:
    a = SpinReceipt(
        session_id="S1", index=0,
        server_seed_hex="aa", client_seed="cli",
        nonce=1, outcome={"x": 1, "y": 2}, parent_sha256_hex="",
    )
    b = SpinReceipt(
        session_id="S1", index=0,
        server_seed_hex="aa", client_seed="cli",
        nonce=1, outcome={"y": 2, "x": 1}, parent_sha256_hex="",
    )
    assert a.canonical_bytes() == b.canonical_bytes()


def test_spin_receipt_sha256_changes_when_outcome_changes() -> None:
    a = SpinReceipt(
        session_id="S", index=0,
        server_seed_hex="aa", client_seed="cli",
        nonce=1, outcome={"x": 1}, parent_sha256_hex="",
    )
    b = SpinReceipt(
        session_id="S", index=0,
        server_seed_hex="aa", client_seed="cli",
        nonce=1, outcome={"x": 2}, parent_sha256_hex="",
    )
    assert a.sha256_hex() != b.sha256_hex()


# ─── build_session_mesh ─────────────────────────────────────────────


def test_build_session_mesh_links_receipts_into_chain() -> None:
    mesh = build_session_mesh("session-A", _raw_spins(5))
    assert mesh.receipt_count() == 5
    # First receipt parent is empty; every subsequent receipt's parent
    # equals the previous receipt's sha256.
    assert mesh.receipts[0].parent_sha256_hex == ""
    for i in range(1, 5):
        assert mesh.receipts[i].parent_sha256_hex == mesh.receipts[i - 1].sha256_hex()


def test_build_session_mesh_root_is_deterministic() -> None:
    a = build_session_mesh("session-A", _raw_spins(8))
    b = build_session_mesh("session-A", _raw_spins(8))
    assert a.merkle_root_hex == b.merkle_root_hex


def test_build_session_mesh_empty_session_has_empty_root() -> None:
    mesh = build_session_mesh("empty", [])
    assert mesh.merkle_root_hex == ""
    assert mesh.receipt_count() == 0


def test_build_session_mesh_root_depends_on_session_id() -> None:
    a = build_session_mesh("session-A", _raw_spins(3))
    b = build_session_mesh("session-B", _raw_spins(3))
    assert a.merkle_root_hex != b.merkle_root_hex


# ─── mint + verify spin proof ───────────────────────────────────────


def test_mint_and_verify_spin_proof_round_trip() -> None:
    mesh = build_session_mesh("S", _raw_spins(16))
    proof = mint_spin_proof(mesh, 7)
    assert verify_spin_proof(proof, mesh.receipts[7], mesh.merkle_root_hex) is True


def test_spin_proof_fails_for_modified_outcome() -> None:
    mesh = build_session_mesh("S", _raw_spins(16))
    proof = mint_spin_proof(mesh, 3)
    # Tamper: claim a different outcome — leaf hash diverges.
    tampered = SpinReceipt(
        session_id=mesh.receipts[3].session_id,
        index=mesh.receipts[3].index,
        server_seed_hex=mesh.receipts[3].server_seed_hex,
        client_seed=mesh.receipts[3].client_seed,
        nonce=mesh.receipts[3].nonce,
        outcome={"reels": [99, 99, 99]},
        parent_sha256_hex=mesh.receipts[3].parent_sha256_hex,
    )
    assert verify_spin_proof(proof, tampered, mesh.merkle_root_hex) is False


def test_spin_proof_fails_against_wrong_root() -> None:
    mesh = build_session_mesh("S", _raw_spins(8))
    proof = mint_spin_proof(mesh, 2)
    assert verify_spin_proof(proof, mesh.receipts[2], "0" * 64) is False


def test_mint_spin_proof_rejects_out_of_range() -> None:
    mesh = build_session_mesh("S", _raw_spins(4))
    with pytest.raises(IndexError):
        mint_spin_proof(mesh, 999)


def test_spin_proof_log_size_for_1024_receipts() -> None:
    mesh = build_session_mesh("S", _raw_spins(1024))
    proof = mint_spin_proof(mesh, 500)
    assert len(proof.siblings) <= 11  # log2(1024) = 10, +1 slack


# ─── ed25519 sign / verify ──────────────────────────────────────────


def test_sign_and_verify_session_root_round_trip(tmp_path: Path) -> None:
    from tools.cert_bundle_swid.sign import load_or_generate_key  # noqa: PLC0415
    keys_dir = tmp_path / "keys"
    keys_dir.mkdir()
    priv = keys_dir / "private.pem"
    pub = keys_dir / "public.pem"
    keypair = load_or_generate_key(private_pem=priv, public_pem=pub)
    if not priv.exists():
        priv = keypair.private_pem_path
        pub = keypair.public_pem_path

    mesh = build_session_mesh("S-sign", _raw_spins(4))
    signed = sign_session_root(mesh, private_pem=priv)
    assert signed.merkle_root_hex == mesh.merkle_root_hex
    assert verify_session_signature(signed, public_pem=pub) is True


def test_verify_session_signature_rejects_tampered_root(tmp_path: Path) -> None:
    from tools.cert_bundle_swid.sign import load_or_generate_key  # noqa: PLC0415
    keys_dir = tmp_path / "keys"
    keys_dir.mkdir()
    priv = keys_dir / "private.pem"
    pub = keys_dir / "public.pem"
    keypair = load_or_generate_key(private_pem=priv, public_pem=pub)
    if not priv.exists():
        priv = keypair.private_pem_path
        pub = keypair.public_pem_path

    mesh = build_session_mesh("S-tamper", _raw_spins(4))
    signed = sign_session_root(mesh, private_pem=priv)
    tampered = SignedSessionRoot(
        session_id=signed.session_id,
        merkle_root_hex="0" + signed.merkle_root_hex[1:],
        n_receipts=signed.n_receipts,
        signature_b64=signed.signature_b64,
    )
    assert verify_session_signature(tampered, public_pem=pub) is False


def test_verify_session_signature_rejects_changed_n_receipts(tmp_path: Path) -> None:
    from tools.cert_bundle_swid.sign import load_or_generate_key  # noqa: PLC0415
    keys_dir = tmp_path / "keys"
    keys_dir.mkdir()
    priv = keys_dir / "private.pem"
    pub = keys_dir / "public.pem"
    keypair = load_or_generate_key(private_pem=priv, public_pem=pub)
    if not priv.exists():
        priv = keypair.private_pem_path
        pub = keypair.public_pem_path

    mesh = build_session_mesh("S-len", _raw_spins(4))
    signed = sign_session_root(mesh, private_pem=priv)
    tampered = SignedSessionRoot(
        session_id=signed.session_id,
        merkle_root_hex=signed.merkle_root_hex,
        n_receipts=signed.n_receipts + 1,
        signature_b64=signed.signature_b64,
    )
    assert verify_session_signature(tampered, public_pem=pub) is False


# ─── Integration smoke ──────────────────────────────────────────────


def test_full_chain_end_to_end_proof_then_signature(tmp_path: Path) -> None:
    from tools.cert_bundle_swid.sign import load_or_generate_key  # noqa: PLC0415
    keys_dir = tmp_path / "keys"
    keys_dir.mkdir()
    priv = keys_dir / "private.pem"
    pub = keys_dir / "public.pem"
    keypair = load_or_generate_key(private_pem=priv, public_pem=pub)
    if not priv.exists():
        priv = keypair.private_pem_path
        pub = keypair.public_pem_path

    mesh = build_session_mesh("S-e2e", _raw_spins(64))
    signed = sign_session_root(mesh, private_pem=priv)

    # 1. Verify the session root signature.
    assert verify_session_signature(signed, public_pem=pub) is True
    # 2. Pick an arbitrary spin index and verify its inclusion in the
    #    signed root.
    proof = mint_spin_proof(mesh, 42)
    assert verify_spin_proof(proof, mesh.receipts[42], signed.merkle_root_hex) is True
