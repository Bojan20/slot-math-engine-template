"""PHASE 12 — Real-Time RGS Live Engine tests.

Covers:
  * Deterministic spin core — same seed inputs → byte-identical outcome
  * Mulberry32 PRNG parity with known reference values
  * Protocol frame round-trip (request + response + error)
  * Async server hello + single-spin round-trip
  * Server enforces session_id authority (client cannot impersonate)
  * Server rejects malformed / bet-invalid frames with structured error
  * Receipt chain Merkle root is reproducible from accumulated receipts
  * Load test harness produces a sensible report on a tiny IR
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import socket
from pathlib import Path

import pytest

from tools.crypto_fair.fair_chain import (
    build_spin_chain_merkle,
    commit_server_seed,
    derive_spin_seed,
)
from tools.rgs_engine import (
    Mulberry32,
    RgsServer,
    SpinRequest,
    decode_frame,
    encode_frame,
    spin,
)
from tools.rgs_engine.load_test import run_load_test
from tools.rgs_engine.protocol import (
    ErrorFrame,
    HelloFrame,
    SpinRequestFrame,
    SpinResultFrame,
)


# ─── Fixture IR (minimal valid slot-sim IR) ────────────────────────────────


def _tiny_ir() -> dict:
    return {
        "meta": {"name": "test-game", "vendor": "synth"},
        "topology": {"kind": "rectangular", "reels": 3, "rows": 3, "shape": "lines"},
        "symbols": [
            {"id": "S_LO", "kind": "lo"},
            {"id": "S_HI", "kind": "hi"},
            {"id": "S_WILD", "kind": "wild"},
        ],
        "reels": {
            "base": [
                {"S_LO": 6, "S_HI": 3, "S_WILD": 1},
                {"S_LO": 6, "S_HI": 3, "S_WILD": 1},
                {"S_LO": 6, "S_HI": 3, "S_WILD": 1},
            ]
        },
        "paytable": [
            {"symbol": "S_LO", "pay3": 5},
            {"symbol": "S_HI", "pay3": 20},
        ],
        "paylines": [
            [1, 1, 1],
            [0, 0, 0],
            [2, 2, 2],
        ],
    }


# ─── Mulberry32 reference ──────────────────────────────────────────────────


def test_mulberry32_known_first_outputs():
    """Pin first 4 u32 outputs against the current engine baseline so
    any future-self refactor of the PRNG body trips immediately. The
    full TS / Rust parity check lives in `tests/rng_parity.test.ts`."""
    rng = Mulberry32(12345)
    expected = [4207900869, 1317490944, 2079646450, 3513001552]
    got = [rng.next_u32() for _ in range(4)]
    assert got == expected, f"PRNG drift: got {got}, expected {expected}"


def test_mulberry32_float_range():
    rng = Mulberry32(42)
    for _ in range(2000):
        x = rng.next_float()
        assert 0.0 <= x < 1.0


# ─── Deterministic spin core ───────────────────────────────────────────────


def test_spin_is_deterministic_for_same_inputs():
    ir = _tiny_ir()
    commit, seed_hex = commit_server_seed("aa" * 32)
    req = SpinRequest(server_seed_hex=seed_hex, client_seed="player-x", nonce=7, bet=1.0)
    o1 = spin(ir, req, server_seed_commit=commit)
    o2 = spin(ir, req, server_seed_commit=commit)
    assert o1.rng_seed == o2.rng_seed
    assert o1.grid == o2.grid
    assert o1.total_pay == o2.total_pay
    assert o1.hits == o2.hits


def test_spin_changes_with_nonce():
    ir = _tiny_ir()
    commit, seed_hex = commit_server_seed("bb" * 32)
    r1 = SpinRequest(server_seed_hex=seed_hex, client_seed="p", nonce=1, bet=1.0)
    r2 = SpinRequest(server_seed_hex=seed_hex, client_seed="p", nonce=2, bet=1.0)
    o1 = spin(ir, r1, server_seed_commit=commit)
    o2 = spin(ir, r2, server_seed_commit=commit)
    assert o1.rng_seed != o2.rng_seed


def test_spin_seed_matches_crypto_fair_derive():
    """Bridge contract: the engine MUST use crypto_fair.derive_spin_seed
    so the regulator can replay any spin without engine-side state."""
    ir = _tiny_ir()
    commit, seed_hex = commit_server_seed("cc" * 32)
    req = SpinRequest(server_seed_hex=seed_hex, client_seed="player-x", nonce=42, bet=1.0)
    o = spin(ir, req, server_seed_commit=commit)
    expected = derive_spin_seed(seed_hex, "player-x", 42)
    assert o.rng_seed == expected


def test_spin_rejects_zero_bet():
    ir = _tiny_ir()
    commit, seed_hex = commit_server_seed()
    with pytest.raises(ValueError):
        spin(
            ir,
            SpinRequest(server_seed_hex=seed_hex, client_seed="p", nonce=0, bet=0),
            server_seed_commit=commit,
        )


def test_spin_rejects_negative_nonce():
    ir = _tiny_ir()
    commit, seed_hex = commit_server_seed()
    with pytest.raises(ValueError):
        spin(
            ir,
            SpinRequest(server_seed_hex=seed_hex, client_seed="p", nonce=-1, bet=1),
            server_seed_commit=commit,
        )


def test_spin_receipt_carries_session_chain_data():
    ir = _tiny_ir()
    commit, seed_hex = commit_server_seed()
    req = SpinRequest(server_seed_hex=seed_hex, client_seed="p", nonce=3, bet=2.5)
    o = spin(ir, req, server_seed_commit=commit)
    r = o.receipt
    assert r is not None
    assert r.spin_index == 3
    assert r.bet_amount == 2.5
    assert r.server_seed_commit == commit
    assert r.nonce == 3


# ─── Protocol frames ───────────────────────────────────────────────────────


def test_spin_request_frame_round_trip():
    f = SpinRequestFrame(session_id="abc", client_seed="p", nonce=9, bet=1.5)
    encoded = encode_frame(f.to_json())
    decoded = decode_frame(encoded.rstrip(b"\n"))
    back = SpinRequestFrame.from_json(decoded)
    assert back == f


def test_spin_request_frame_rejects_wrong_type():
    with pytest.raises(ValueError):
        SpinRequestFrame.from_json({"type": "bogus", "session_id": "x"})


def test_spin_request_frame_rejects_missing_field():
    with pytest.raises(ValueError):
        SpinRequestFrame.from_json({"type": "spin", "session_id": "x"})


def test_hello_frame_to_json_shape():
    h = HelloFrame(session_id="s1", server_seed_commit="aa" * 32)
    j = h.to_json()
    assert j["type"] == "hello"
    assert j["protocol_version"] == 1
    assert j["server_seed_commit"] == "aa" * 32


def test_error_frame_to_json_no_session_id():
    e = ErrorFrame(code="bad_request", detail="malformed")
    j = e.to_json()
    assert "session_id" not in j


def test_spin_result_frame_shape():
    s = SpinResultFrame(
        session_id="s",
        spin_index=0,
        rng_seed=1,
        grid=[["A"]],
        total_pay=0.0,
        hits=[],
        server_seed_commit="aa",
        spin_hash_hex="bb",
        latency_us=10,
    )
    j = s.to_json()
    assert j["commit_chain"] == {"server_seed_commit": "aa", "spin_hash": "bb"}
    assert j["latency_us"] == 10


# ─── Async server end-to-end ───────────────────────────────────────────────


async def _async_test_server_hello_then_single_spin():
    ir = _tiny_ir()
    srv = RgsServer(ir)
    server = await srv.serve(host="127.0.0.1", port=0)
    host, port = server.sockets[0].getsockname()[:2]
    try:
        reader, writer = await asyncio.open_connection(host, port)
        try:
            hello_line = await reader.readline()
            hello = decode_frame(hello_line.rstrip(b"\r\n"))
            assert hello["type"] == "hello"
            assert "server_seed_commit" in hello
            sid = hello["session_id"]
            # Send one spin frame.
            frame = SpinRequestFrame(
                session_id=sid, client_seed="p", nonce=0, bet=1.0
            )
            writer.write(encode_frame(frame.to_json()))
            await writer.drain()
            result_line = await reader.readline()
            result = decode_frame(result_line.rstrip(b"\r\n"))
            assert result["type"] == "spin_result"
            assert result["session_id"] == sid
            assert result["spin_index"] == 0
            assert "grid" in result
            assert "commit_chain" in result
            assert result["commit_chain"]["server_seed_commit"] == hello["server_seed_commit"]
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
    finally:
        server.close()
        await server.wait_closed()
    assert srv.stats.spins_total == 1


async def _async_test_server_overrides_session_id_from_client():
    """Client cannot impersonate a different session by forging the
    session_id field in the spin frame."""
    ir = _tiny_ir()
    srv = RgsServer(ir)
    server = await srv.serve(host="127.0.0.1", port=0)
    host, port = server.sockets[0].getsockname()[:2]
    try:
        reader, writer = await asyncio.open_connection(host, port)
        hello = decode_frame((await reader.readline()).rstrip(b"\r\n"))
        true_sid = hello["session_id"]
        forged = {
            "type": "spin",
            "session_id": "FAKE-SESSION-ID",
            "client_seed": "p",
            "nonce": 0,
            "bet": 1.0,
        }
        writer.write(encode_frame(forged))
        await writer.drain()
        result = decode_frame((await reader.readline()).rstrip(b"\r\n"))
        assert result["type"] == "spin_result"
        assert result["session_id"] == true_sid
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
    finally:
        server.close()
        await server.wait_closed()


async def _async_test_server_rejects_bet_zero():
    ir = _tiny_ir()
    srv = RgsServer(ir)
    server = await srv.serve(host="127.0.0.1", port=0)
    host, port = server.sockets[0].getsockname()[:2]
    try:
        reader, writer = await asyncio.open_connection(host, port)
        await reader.readline()  # hello
        writer.write(
            encode_frame(
                {
                    "type": "spin",
                    "session_id": "x",
                    "client_seed": "p",
                    "nonce": 0,
                    "bet": 0,
                }
            )
        )
        await writer.drain()
        err = decode_frame((await reader.readline()).rstrip(b"\r\n"))
        assert err["type"] == "error"
        assert err["code"] == "bet_invalid"
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
    finally:
        server.close()
        await server.wait_closed()
    assert srv.stats.spin_errors >= 1


async def _async_test_server_rejects_malformed_frame():
    ir = _tiny_ir()
    srv = RgsServer(ir)
    server = await srv.serve(host="127.0.0.1", port=0)
    host, port = server.sockets[0].getsockname()[:2]
    try:
        reader, writer = await asyncio.open_connection(host, port)
        await reader.readline()  # hello
        writer.write(b"{not-json\n")
        await writer.drain()
        err = decode_frame((await reader.readline()).rstrip(b"\r\n"))
        assert err["type"] == "error"
        assert err["code"] == "bad_request"
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
    finally:
        server.close()
        await server.wait_closed()


async def _async_test_server_chain_merkle_grows_per_spin():
    ir = _tiny_ir()
    srv = RgsServer(ir)
    server = await srv.serve(host="127.0.0.1", port=0)
    host, port = server.sockets[0].getsockname()[:2]
    try:
        reader, writer = await asyncio.open_connection(host, port)
        hello = decode_frame((await reader.readline()).rstrip(b"\r\n"))
        sid = hello["session_id"]
        for n in range(4):
            writer.write(
                encode_frame(
                    {
                        "type": "spin",
                        "session_id": sid,
                        "client_seed": "p",
                        "nonce": n,
                        "bet": 1.0,
                    }
                )
            )
            await writer.drain()
            await reader.readline()
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        sess = srv.session(sid)
        assert sess is not None
        assert len(sess.receipts) == 4
        merkle = srv.chain_merkle(sid)
        assert merkle["tree_size"] == 4
        assert merkle["root_hex"]  # non-empty
        # Same root if we rebuild externally from the same receipts.
        rebuilt = build_spin_chain_merkle(sess.receipts)
        assert rebuilt["root_hex"] == merkle["root_hex"]
    finally:
        server.close()
        await server.wait_closed()


# ─── Load test harness ─────────────────────────────────────────────────────


async def _async_test_load_test_smoke_report_is_sensible():
    """Drive a tiny load (4 clients × 10 spins) — must produce a clean
    report with zero errors and a positive throughput."""
    ir = _tiny_ir()
    srv = RgsServer(ir)
    server = await srv.serve(host="127.0.0.1", port=0)
    host, port = server.sockets[0].getsockname()[:2]
    try:
        report = await run_load_test(
            host=host,
            port=int(port),
            n_clients=4,
            spins_per_client=10,
            bet=1.0,
        )
    finally:
        server.close()
        await server.wait_closed()
    assert report.spins_attempted == 40
    assert report.spins_completed == 40
    assert report.spins_failed == 0
    assert report.throughput_per_s > 0
    assert report.server_seed_commits_unique == 4  # one commit per session
    assert report.grade in {"A+", "A", "B", "C", "D"}


# ─── Sync wrappers for the async helpers (no pytest-asyncio dep) ──────────


def test_server_hello_then_single_spin():
    asyncio.run(_async_test_server_hello_then_single_spin())


def test_server_overrides_session_id_from_client():
    asyncio.run(_async_test_server_overrides_session_id_from_client())


def test_server_rejects_bet_zero():
    asyncio.run(_async_test_server_rejects_bet_zero())


def test_server_rejects_malformed_frame():
    asyncio.run(_async_test_server_rejects_malformed_frame())


def test_server_chain_merkle_grows_per_spin():
    asyncio.run(_async_test_server_chain_merkle_grows_per_spin())


def test_load_test_smoke_report_is_sensible():
    asyncio.run(_async_test_load_test_smoke_report_is_sensible())
