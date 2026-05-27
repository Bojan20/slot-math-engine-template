"""PHASE 12 — Real-Time RGS Live Engine tests."""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.rgs_live import (
    SpinRequest,
    SpinResponse,
    SpinResult,
    parse_request,
    serialize_response,
    engine_spin,
    default_synthetic_ir,
    SpinServer,
    LoadTestResult,
    run_load_test,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── protocol ──────────────────────────────────────────────────────────────


def test_parse_request_round_trip():
    raw = json.dumps({
        "type": "spin",
        "request_id": "r-1",
        "session_id": "s-1",
        "client_seed": "alice",
        "nonce": 0,
        "bet_amount": 2.5,
    })
    req = parse_request(raw)
    assert req.request_id == "r-1"
    assert req.session_id == "s-1"
    assert req.client_seed == "alice"
    assert req.nonce == 0
    assert req.bet_amount == 2.5


def test_parse_request_default_bet():
    raw = json.dumps({
        "type": "spin",
        "request_id": "r", "session_id": "s",
        "client_seed": "c", "nonce": 0,
    })
    req = parse_request(raw)
    assert req.bet_amount == 1.0


@pytest.mark.parametrize("payload", [
    "not-json",
    "{}",
    json.dumps({"type": "deposit"}),
    json.dumps({"type": "spin", "request_id": "r"}),
    json.dumps({"type": "spin", "request_id": "r", "session_id": "s",
                "client_seed": "c", "nonce": -1}),
    json.dumps([]),  # array, not object
])
def test_parse_request_rejects_malformed(payload):
    with pytest.raises(ValueError):
        parse_request(payload)


def test_serialize_response_omits_none():
    resp = SpinResponse(request_id="x", ok=False, error="bad")
    line = serialize_response(resp)
    assert '"result"' not in line
    assert '"error":"bad"' in line


def test_serialize_response_with_result():
    res = SpinResult(symbols=[["A"]], lines_won=[], total_payout=0.0,
                      rtp_running=0.0, spin_hash_hex="abc")
    resp = SpinResponse(request_id="x", ok=True, result=res, latency_us=42)
    line = serialize_response(resp)
    obj = json.loads(line)
    assert obj["ok"] is True
    assert obj["result"]["spin_hash_hex"] == "abc"
    assert "error" not in obj


# ─── engine determinism ────────────────────────────────────────────────────


def test_engine_spin_deterministic():
    ir = default_synthetic_ir()
    req = SpinRequest(request_id="r", session_id="s", client_seed="c", nonce=0)
    r1 = engine_spin(ir, req, "ab" * 32)
    r2 = engine_spin(ir, req, "ab" * 32)
    assert r1.spin_hash_hex == r2.spin_hash_hex
    assert r1.symbols == r2.symbols
    assert r1.total_payout == r2.total_payout


def test_engine_spin_nonce_changes_grid():
    ir = default_synthetic_ir()
    r0 = engine_spin(ir, SpinRequest("r", "s", "c", 0), "ab" * 32)
    r1 = engine_spin(ir, SpinRequest("r", "s", "c", 1), "ab" * 32)
    assert r0.spin_hash_hex != r1.spin_hash_hex


def test_engine_spin_grid_shape():
    ir = default_synthetic_ir()
    r = engine_spin(ir, SpinRequest("r", "s", "c", 0), "ab" * 32)
    assert len(r.symbols) == 5            # reels
    for col in r.symbols:
        assert len(col) == 3              # rows


def test_engine_spin_running_rtp_updates():
    ir = default_synthetic_ir()
    req = SpinRequest("r", "s", "c", 0, bet_amount=1.0)
    r = engine_spin(ir, req, "ab" * 32,
                     running_total_payout=10.0, running_total_bet=10.0)
    # rtp_running = (10 + total_payout) / (10 + 1.0)
    expected = (10.0 + r.total_payout) / 11.0
    assert abs(r.rtp_running - expected) < 1e-6


# ─── SpinServer ────────────────────────────────────────────────────────────


def test_spin_server_init_rejects_bad_seed():
    with pytest.raises(ValueError):
        SpinServer(server_seed_hex="")
    with pytest.raises(ValueError):
        SpinServer(server_seed_hex="abc")  # odd length


def test_spin_server_commit_hash_pinned():
    server = SpinServer(server_seed_hex="ab" * 32)
    import hashlib
    expected = hashlib.sha256(bytes.fromhex("ab" * 32)).hexdigest()
    assert server.server_seed_commit == expected


def test_spin_server_handle_spin_ok():
    server = SpinServer(server_seed_hex="ab" * 32)
    req = json.dumps({
        "type": "spin",
        "request_id": "r-1",
        "session_id": "s",
        "client_seed": "alice",
        "nonce": 0,
    })
    line = server.handle_spin(req)
    obj = json.loads(line)
    assert obj["ok"] is True
    assert obj["request_id"] == "r-1"
    assert "result" in obj
    assert obj["server_seed_commit"] == server.server_seed_commit


def test_spin_server_handle_spin_error():
    server = SpinServer(server_seed_hex="ab" * 32)
    line = server.handle_spin("not-json")
    obj = json.loads(line)
    assert obj["ok"] is False
    assert "error" in obj


def test_spin_server_running_rtp_per_session():
    server = SpinServer(server_seed_hex="ab" * 32)
    # First spin on session A; rtp_running starts after 1st spin's payout.
    line1 = json.loads(server.handle_spin(json.dumps({
        "type": "spin", "request_id": "1", "session_id": "A",
        "client_seed": "x", "nonce": 0,
    })))
    line2 = json.loads(server.handle_spin(json.dumps({
        "type": "spin", "request_id": "2", "session_id": "A",
        "client_seed": "x", "nonce": 1,
    })))
    # Same session — rtp_running should evolve between spins
    assert line1["result"]["rtp_running"] != line2["result"]["rtp_running"] or \
           line1["result"]["total_payout"] == line2["result"]["total_payout"]


def test_spin_server_swap_ir_resets_sessions():
    server = SpinServer(server_seed_hex="ab" * 32)
    server.handle_spin(json.dumps({
        "type": "spin", "request_id": "1", "session_id": "A",
        "client_seed": "x", "nonce": 0,
    }))
    assert "A" in server._sessions  # internal
    server.swap_ir(default_synthetic_ir(), reset_sessions=True)
    assert "A" not in server._sessions


def test_spin_server_stats_increment():
    server = SpinServer(server_seed_hex="ab" * 32)
    for i in range(10):
        server.handle_spin(json.dumps({
            "type": "spin", "request_id": str(i), "session_id": "A",
            "client_seed": "x", "nonce": i,
        }))
    assert server.stats.spins_served == 10
    assert server.stats.errors == 0
    assert server.avg_latency_us > 0


def test_spin_server_p99():
    server = SpinServer(server_seed_hex="ab" * 32)
    for i in range(100):
        server.handle_spin(json.dumps({
            "type": "spin", "request_id": str(i), "session_id": "A",
            "client_seed": "x", "nonce": i,
        }))
    p99 = server.p99_latency_us()
    assert p99 > 0
    assert p99 >= server.avg_latency_us  # p99 ≥ mean


# ─── load test harness ────────────────────────────────────────────────────


def test_run_load_test_small():
    r = run_load_test(spins=200)
    assert isinstance(r, LoadTestResult)
    assert r.total_spins == 200
    assert r.elapsed_seconds > 0
    assert r.throughput_spins_per_sec > 0
    assert r.errors == 0
    assert r.p99_latency_us >= r.p50_latency_us


def test_run_load_test_multi_session():
    r = run_load_test(spins=500, session_count=10)
    assert r.total_spins == 500


def test_run_load_test_rejects_zero_spins():
    with pytest.raises(ValueError):
        run_load_test(spins=0)


def test_run_load_test_rejects_zero_sessions():
    with pytest.raises(ValueError):
        run_load_test(spins=10, session_count=0)


def test_run_load_test_distribution_histogram():
    r = run_load_test(spins=200)
    assert isinstance(r.distribution_histogram, dict)
    # All bucket keys should map to >= 0 ints
    for k, v in r.distribution_histogram.items():
        assert isinstance(v, int)
        assert v >= 0


def test_run_load_test_throughput_realistic():
    """Sanity: in-process synthetic engine should sustain ≥ 1000 spins/sec
    on any modern dev machine. Generous threshold for CI variance."""
    r = run_load_test(spins=2000)
    assert r.throughput_spins_per_sec >= 1000


# ─── asyncio TCP integration ──────────────────────────────────────────────


def test_tcp_round_trip():
    """Spin up a real asyncio TCP server, send a request, parse response.

    Wrapped in `asyncio.run` so pytest doesn't need pytest-asyncio plugin.
    """
    async def _run():
        server = SpinServer(server_seed_hex="ab" * 32)
        tcp = await asyncio.start_server(server.handle_client, "127.0.0.1", 0)
        port = tcp.sockets[0].getsockname()[1]
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            request = json.dumps({
                "type": "spin", "request_id": "r-1", "session_id": "S",
                "client_seed": "alice", "nonce": 0,
            }) + "\n"
            writer.write(request.encode("utf-8"))
            await writer.drain()
            line = await reader.readline()
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass
        finally:
            tcp.close()
            await tcp.wait_closed()
        return line

    line = asyncio.run(_run())
    obj = json.loads(line.decode("utf-8"))
    assert obj["ok"] is True
    assert obj["request_id"] == "r-1"


def test_tcp_two_spins_same_connection():
    """Two consecutive spins on a single TCP connection — verify
    response correlation by request_id."""
    async def _run():
        server = SpinServer(server_seed_hex="cd" * 32)
        tcp = await asyncio.start_server(server.handle_client, "127.0.0.1", 0)
        port = tcp.sockets[0].getsockname()[1]
        responses = []
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            for i in range(2):
                req = json.dumps({
                    "type": "spin", "request_id": f"r-{i}",
                    "session_id": "S", "client_seed": "x", "nonce": i,
                }) + "\n"
                writer.write(req.encode("utf-8"))
                await writer.drain()
                line = await reader.readline()
                responses.append(json.loads(line.decode("utf-8")))
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass
        finally:
            tcp.close()
            await tcp.wait_closed()
        return responses

    responses = asyncio.run(_run())
    assert len(responses) == 2
    assert responses[0]["request_id"] == "r-0"
    assert responses[1]["request_id"] == "r-1"
    # Different nonces → different spin hashes
    assert responses[0]["result"]["spin_hash_hex"] != responses[1]["result"]["spin_hash_hex"]


# ─── CLI ──────────────────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.rgs_live", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def test_cli_load_test_human_output():
    rc = _run_cli(["load-test", "--spins", "200"])
    assert rc.returncode == 0
    assert "throughput" in rc.stdout.lower()


def test_cli_load_test_json_output():
    rc = _run_cli(["load-test", "--spins", "200", "--json"])
    assert rc.returncode == 0
    d = json.loads(rc.stdout)
    assert d["total_spins"] == 200
    assert d["schema_version"] == "urn:slotmath:rgs-live-loadtest:v1"


def test_cli_load_test_persists_json(tmp_path: Path):
    out = tmp_path / "out.json"
    rc = _run_cli([
        "load-test", "--spins", "100",
        "--out", str(out),
        "--quiet",
    ])
    assert rc.returncode == 0
    assert out.exists()
    d = json.loads(out.read_text())
    assert d["total_spins"] == 100
