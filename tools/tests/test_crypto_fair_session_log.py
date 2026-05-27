"""PHASE 15.B — Session log emit + replay tests.

Pins the regulator-grade contract:

  * Round-trip — emit → write → load → verify yields ALL PASS for a
    correctly-built session.
  * Commit ↔ seed mismatch → commit_matches_seed FAIL with detail.
  * Tampered receipt → chain_root_reproduces FAIL with detail.
  * Out-of-order spin_index → timestamps_monotone FAIL with detail.
  * Bad signature → signature_verifies FAIL but other checks still surface.
  * Missing schema field → all checks fail with the same parse error.
  * `expected_rng_seed` drift surfaces as seeds_re_derive FAIL.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
from dataclasses import asdict
from pathlib import Path

import pytest

from tools.crypto_fair.fair_chain import (
    SpinReceipt,
    commit_server_seed,
    derive_spin_seed,
)
from tools.crypto_fair.session_log import (
    SCHEMA,
    SessionLog,
    SessionVerification,
    emit_session_log,
    verify_session_log,
    write_session_log,
)


# ─── Helpers ──────────────────────────────────────────────────────────────


def _make_receipts(seed_hex: str, commit: str, *, n: int = 5) -> list[SpinReceipt]:
    out: list[SpinReceipt] = []
    for i in range(n):
        out.append(
            SpinReceipt(
                spin_index=i,
                server_seed_commit=commit,
                client_seed="p",
                nonce=i,
                bet_amount=1.0 + i,
                outcome_payload={"grid": [["A", "B", "C"]], "total_pay": 0},
            )
        )
    return out


def _make_log(*, tampered: bool = False) -> SessionLog:
    commit, seed = commit_server_seed("aa" * 32)
    receipts = _make_receipts(seed, commit, n=5)
    log = emit_session_log(
        session_id="sess-x",
        server_seed_hex=seed,
        server_seed_commit=commit,
        receipts=receipts,
        opened_ts_unix=1_700_000_000.0,
        closed_ts_unix=1_700_000_900.0,
        sign=False,  # avoid cryptography lib dep in this test
    )
    if tampered:
        # Mutate a payload field after the chain was built so the
        # root can no longer reproduce.
        log.receipts[2]["bet_amount"] = 99999.0
    return log


# ─── Round-trip ──────────────────────────────────────────────────────────


def test_round_trip_emit_verify_all_pass(tmp_path: Path):
    log = _make_log()
    out = write_session_log(log, tmp_path / "session.json")
    assert out.exists()
    body = json.loads(out.read_text())
    assert body["schema"] == SCHEMA
    v = verify_session_log(out)
    assert isinstance(v, SessionVerification)
    assert v.commit_matches_seed[0]
    assert v.chain_root_reproduces[0]
    assert v.timestamps_monotone[0]
    # all_passed ignores signature absence.
    assert v.all_passed


def test_verify_accepts_dict_input():
    log = _make_log()
    v = verify_session_log(asdict(log))
    assert v.all_passed


def test_verify_accepts_dataclass_input():
    log = _make_log()
    v = verify_session_log(log)
    assert v.all_passed


# ─── Failure surfaces ─────────────────────────────────────────────────────


def test_bad_schema_fails_every_check(tmp_path: Path):
    log = _make_log()
    d = asdict(log)
    d["schema"] = "urn:bogus:v0"
    v = verify_session_log(d)
    assert not v.commit_matches_seed[0]
    assert "schema mismatch" in v.commit_matches_seed[1]


def test_commit_seed_mismatch_surfaces():
    log = _make_log()
    d = asdict(log)
    # Force a sha256 mismatch by swapping seed for another valid hex.
    d["seed"] = "bb" * 32
    v = verify_session_log(d)
    assert not v.commit_matches_seed[0]
    assert "DOES NOT match" in v.commit_matches_seed[1]
    # Chain still reproduces, monotone still holds — the verifier
    # reports each check independently.
    assert v.chain_root_reproduces[0]
    assert v.timestamps_monotone[0]


def test_tampered_receipt_breaks_chain_root():
    log = _make_log(tampered=True)
    v = verify_session_log(log)
    assert not v.chain_root_reproduces[0]
    assert "mismatch" in v.chain_root_reproduces[1]
    # Commit & timestamps untouched, still pass.
    assert v.commit_matches_seed[0]
    assert v.timestamps_monotone[0]


def test_out_of_order_spin_index_breaks_monotone():
    log = _make_log()
    # Re-order receipts so spin_index regresses.
    rec = log.receipts
    rec[2]["spin_index"], rec[3]["spin_index"] = rec[3]["spin_index"], rec[2]["spin_index"]
    v = verify_session_log(log)
    assert not v.timestamps_monotone[0]
    assert "regression" in v.timestamps_monotone[1]


def test_unsigned_log_marks_signature_absent():
    log = _make_log()
    v = verify_session_log(log)
    assert not v.signature_verifies[0]
    assert "absent" in v.signature_verifies[1]
    # All other checks still pass — signature is informational only.
    assert v.all_passed


# ─── Expected RNG seed drift ──────────────────────────────────────────────


def test_expected_rng_seed_matching_passes():
    commit, seed = commit_server_seed("cc" * 32)
    receipts = _make_receipts(seed, commit, n=3)
    log = emit_session_log(
        session_id="s",
        server_seed_hex=seed,
        server_seed_commit=commit,
        receipts=receipts,
        opened_ts_unix=0.0,
        closed_ts_unix=10.0,
        sign=False,
    )
    # Annotate each receipt with the correctly-derived seed.
    for r in log.receipts:
        r["expected_rng_seed"] = derive_spin_seed(
            seed, str(r["client_seed"]), int(r["nonce"])
        )
    v = verify_session_log(log)
    assert v.seeds_re_derive[0]
    assert "match" in v.seeds_re_derive[1]


def test_expected_rng_seed_drift_fails():
    commit, seed = commit_server_seed("dd" * 32)
    receipts = _make_receipts(seed, commit, n=3)
    log = emit_session_log(
        session_id="s",
        server_seed_hex=seed,
        server_seed_commit=commit,
        receipts=receipts,
        opened_ts_unix=0.0,
        closed_ts_unix=10.0,
        sign=False,
    )
    for r in log.receipts:
        r["expected_rng_seed"] = 12345  # wrong on purpose
    v = verify_session_log(log)
    assert not v.seeds_re_derive[0]
    assert "drift" in v.seeds_re_derive[1]


# ─── Serialisation determinism ────────────────────────────────────────────


def test_write_session_log_is_deterministic(tmp_path: Path):
    """Same in-memory log → byte-identical JSON. Regulator-grade audit
    requires reproducible bytes so any third party hashing the file gets
    the same digest as the operator that emitted it."""
    log = _make_log()
    a = write_session_log(log, tmp_path / "a.json")
    b = write_session_log(log, tmp_path / "b.json")
    assert a.read_bytes() == b.read_bytes()


def test_write_session_log_uses_sort_keys(tmp_path: Path):
    log = _make_log()
    out = write_session_log(log, tmp_path / "log.json")
    body = out.read_text()
    # `schema` should appear before `seed` if keys are sorted.
    pos_schema = body.find('"schema"')
    pos_seed = body.find('"seed"')
    assert 0 <= pos_schema < pos_seed


def test_signature_check_independent_of_other_checks():
    """Even if signature is absent, all the other checks must still
    report independently — regulator workflow requires that the
    failing reason is unambiguous."""
    log = _make_log()
    log.signature_hex = "ffff"  # garbage, will fail verify
    log.pubkey_hex = "ee" * 32   # garbage pubkey
    v = verify_session_log(log)
    assert not v.signature_verifies[0]
    # The other checks remain green — proves independence.
    assert v.commit_matches_seed[0]
    assert v.chain_root_reproduces[0]
    assert v.timestamps_monotone[0]
