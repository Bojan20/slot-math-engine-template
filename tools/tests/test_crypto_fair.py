"""PHASE 15 — Crypto-Native Provably-Fair tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.crypto_fair import (
    commit_server_seed,
    derive_spin_seed,
    verify_server_seed,
    build_spin_chain_merkle,
    sign_spin_chain,
    verify_spin_chain_signature,
    SpinReceipt,
    SpinChainRoot,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── commit / verify ──────────────────────────────────────────────────────


def test_commit_server_seed_returns_pair():
    commit, seed = commit_server_seed()
    assert isinstance(commit, str)
    assert isinstance(seed, str)
    assert len(commit) == 64  # SHA-256 hex
    assert len(seed) == 64    # 32 bytes hex


def test_commit_with_custom_seed_hex():
    commit, seed = commit_server_seed(seed_hex="deadbeef" * 8)
    assert seed == "deadbeef" * 8
    # SHA-256 of bytes.fromhex(seed) must match
    import hashlib
    expected = hashlib.sha256(bytes.fromhex(seed)).hexdigest()
    assert commit == expected


def test_commit_with_bad_hex_raises():
    with pytest.raises(ValueError):
        commit_server_seed(seed_hex="not-hex!")


def test_commit_custom_bytes_length():
    commit, seed = commit_server_seed(n_bytes=16)
    assert len(seed) == 32  # 16 bytes = 32 hex chars


def test_verify_server_seed_correct():
    commit, seed = commit_server_seed()
    assert verify_server_seed(commit, seed) is True


def test_verify_server_seed_wrong_seed():
    commit, _ = commit_server_seed()
    bogus = "00" * 32
    assert verify_server_seed(commit, bogus) is False


def test_verify_server_seed_bad_hex():
    assert verify_server_seed("anything", "not-hex!") is False


def test_verify_constant_time_compare():
    """Sanity: even with mismatching length we don't leak via exception."""
    commit, seed = commit_server_seed()
    assert verify_server_seed(commit[:60] + "abcd", seed) is False


# ─── derive_spin_seed ─────────────────────────────────────────────────────


def test_derive_spin_seed_deterministic():
    seed = "ab" * 32
    s1 = derive_spin_seed(seed, "client1", 0)
    s2 = derive_spin_seed(seed, "client1", 0)
    assert s1 == s2


def test_derive_spin_seed_nonce_varies():
    seed = "ab" * 32
    s0 = derive_spin_seed(seed, "client", 0)
    s1 = derive_spin_seed(seed, "client", 1)
    assert s0 != s1


def test_derive_spin_seed_client_varies():
    seed = "ab" * 32
    s_a = derive_spin_seed(seed, "alice", 0)
    s_b = derive_spin_seed(seed, "bob", 0)
    assert s_a != s_b


def test_derive_spin_seed_server_varies():
    s_a = derive_spin_seed("aa" * 32, "client", 0)
    s_b = derive_spin_seed("bb" * 32, "client", 0)
    assert s_a != s_b


def test_derive_spin_seed_u64_range():
    seed = derive_spin_seed("aa" * 32, "client", 0)
    assert 0 <= seed < 2**64


def test_derive_spin_seed_rejects_bad_nonce():
    with pytest.raises(ValueError):
        derive_spin_seed("aa" * 32, "client", -1)
    with pytest.raises(ValueError):
        derive_spin_seed("aa" * 32, "client", 2**64)


# ─── SpinReceipt + Merkle chain ───────────────────────────────────────────


def _mk_receipt(idx: int) -> SpinReceipt:
    return SpinReceipt(
        spin_index=idx,
        server_seed_commit="ab" * 32,
        client_seed="player1",
        nonce=idx,
        bet_amount=1.0,
        outcome_payload={"symbols": ["A", "B", "C", "D", "E"]},
    )


def test_spin_receipt_canonical_bytes_deterministic():
    r1 = _mk_receipt(0)
    r2 = _mk_receipt(0)
    assert r1.to_canonical_bytes() == r2.to_canonical_bytes()
    assert r1.spin_hash == r2.spin_hash


def test_spin_receipt_hash_changes_per_index():
    r0 = _mk_receipt(0)
    r1 = _mk_receipt(1)
    assert r0.spin_hash != r1.spin_hash


def test_build_spin_chain_merkle_single_receipt():
    chain = build_spin_chain_merkle([_mk_receipt(0)])
    assert chain["tree_size"] == 1
    assert len(chain["root_hex"]) == 64
    assert len(chain["leaf_hashes_hex"]) == 1


def test_build_spin_chain_merkle_multiple():
    receipts = [_mk_receipt(i) for i in range(8)]
    chain = build_spin_chain_merkle(receipts)
    assert chain["tree_size"] == 8
    # Different content → different root
    chain2 = build_spin_chain_merkle([_mk_receipt(i) for i in range(7)])
    assert chain["root_hex"] != chain2["root_hex"]


def test_build_spin_chain_merkle_odd_size():
    """Odd tree size must still produce a valid root (duplicate-last)."""
    receipts = [_mk_receipt(i) for i in range(5)]
    chain = build_spin_chain_merkle(receipts)
    assert chain["tree_size"] == 5
    assert len(chain["root_hex"]) == 64


def test_build_spin_chain_merkle_empty_raises():
    with pytest.raises(ValueError):
        build_spin_chain_merkle([])


def test_chain_root_is_deterministic():
    r = [_mk_receipt(i) for i in range(4)]
    c1 = build_spin_chain_merkle(r)
    c2 = build_spin_chain_merkle(r)
    assert c1["root_hex"] == c2["root_hex"]


# ─── ed25519 signing ──────────────────────────────────────────────────────


def test_sign_spin_chain_either_signs_or_unsigned():
    receipts = [_mk_receipt(i) for i in range(4)]
    chain = build_spin_chain_merkle(receipts)
    root = sign_spin_chain(chain)
    assert isinstance(root, SpinChainRoot)
    assert root.root_hex == chain["root_hex"]
    assert root.tree_size == chain["tree_size"]
    # signature_hex may be None when cryptography missing
    if root.signature_hex is not None:
        assert len(root.signature_hex) == 128  # 64 bytes hex


def test_verify_spin_chain_signature_round_trip():
    """If cryptography lib present, sign+verify is a closed loop."""
    receipts = [_mk_receipt(i) for i in range(4)]
    chain = build_spin_chain_merkle(receipts)
    root = sign_spin_chain(chain)
    if root.signature_hex is None:
        pytest.skip("cryptography lib not available — skipping signature verify")
    assert verify_spin_chain_signature(root) is True


def test_verify_spin_chain_rejects_tampered():
    receipts = [_mk_receipt(i) for i in range(4)]
    chain = build_spin_chain_merkle(receipts)
    root = sign_spin_chain(chain)
    if root.signature_hex is None:
        pytest.skip("cryptography lib not available")
    # Tamper the root
    tampered = SpinChainRoot(
        root_hex="00" * 32,
        tree_size=root.tree_size,
        signature_hex=root.signature_hex,
        pubkey_hex=root.pubkey_hex,
    )
    assert verify_spin_chain_signature(tampered) is False


def test_verify_unsigned_chain_returns_false():
    root = SpinChainRoot(root_hex="ab" * 32, tree_size=1,
                          signature_hex=None, pubkey_hex=None)
    assert verify_spin_chain_signature(root) is False


# ─── CLI ──────────────────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.crypto_fair", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def test_cli_commit_emits_pair():
    rc = _run_cli(["commit", "--json"])
    assert rc.returncode == 0
    data = json.loads(rc.stdout)
    assert "commit_hash" in data
    assert "server_seed_hex" in data


def test_cli_commit_human_output():
    rc = _run_cli(["commit"])
    assert rc.returncode == 0
    assert "commit:" in rc.stdout
    assert "server_seed:" in rc.stdout


def test_cli_verify_pass():
    # First commit; capture both
    rc1 = _run_cli(["commit", "--json"])
    data = json.loads(rc1.stdout)
    rc2 = _run_cli(["verify", data["commit_hash"], data["server_seed_hex"]])
    assert rc2.returncode == 0
    assert "PASS" in rc2.stdout


def test_cli_verify_fail():
    rc = _run_cli(["verify", "00" * 32, "11" * 32])
    assert rc.returncode == 1


def test_cli_derive():
    rc = _run_cli(["derive", "aa" * 32, "player1", "0", "--json"])
    assert rc.returncode == 0
    data = json.loads(rc.stdout)
    assert "spin_seed" in data
    assert 0 <= data["spin_seed"] < 2**64
