"""PHASE 12.B — WebSocket gateway tests."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import struct

import pytest

from tools.rgs_live import (
    WebSocketGateway,
    SpinServer,
    compute_accept_key,
    parse_http_request,
    build_handshake_response,
    encode_text_frame,
    encode_close_frame,
    encode_pong_frame,
    decode_frame,
    FrameDecodeError,
)


_WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


# ─── handshake helpers ────────────────────────────────────────────────────


def test_compute_accept_key_rfc_example():
    """RFC 6455 §1.3 example: 'dGhlIHNhbXBsZSBub25jZQ==' →
    's3pPLMBiTxaQ9kYGzzhZRbK+xOo='"""
    assert compute_accept_key("dGhlIHNhbXBsZSBub25jZQ==") == \
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="


def test_compute_accept_key_deterministic():
    key = "abc123"
    assert compute_accept_key(key) == compute_accept_key(key)


def test_parse_http_request_basic():
    raw = (
        b"GET /ws HTTP/1.1\r\n"
        b"Host: example.com\r\n"
        b"Upgrade: websocket\r\n"
        b"Connection: Upgrade\r\n"
        b"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
        b"\r\n"
    )
    h = parse_http_request(raw)
    assert h["method"] == "GET"
    assert h["path"] == "/ws"
    assert h["upgrade"] == "websocket"
    assert h["sec-websocket-key"] == "dGhlIHNhbXBsZSBub25jZQ=="


def test_parse_http_request_empty_raises():
    with pytest.raises(ValueError):
        parse_http_request(b"")


def test_parse_http_request_bad_request_line_raises():
    with pytest.raises(ValueError):
        parse_http_request(b"BADLINE\r\n\r\n")


def test_build_handshake_response_has_accept_header():
    resp = build_handshake_response("dGhlIHNhbXBsZSBub25jZQ==")
    assert b"HTTP/1.1 101 Switching Protocols" in resp
    assert b"Upgrade: websocket" in resp
    assert b"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" in resp


# ─── frame encode/decode ──────────────────────────────────────────────────


def test_encode_text_frame_short():
    frame = encode_text_frame("hi")
    # FIN=1, opcode=1 → 0x81; len=2; "hi"
    assert frame[0] == 0x81
    assert frame[1] == 2
    assert frame[2:] == b"hi"


def test_encode_text_frame_medium():
    payload = "x" * 200  # > 125, < 65536
    frame = encode_text_frame(payload)
    assert frame[0] == 0x81
    assert frame[1] == 126
    assert struct.unpack("!H", frame[2:4])[0] == 200


def test_encode_text_frame_large():
    payload = "x" * 70000  # > 65536 → 64-bit length
    frame = encode_text_frame(payload)
    assert frame[0] == 0x81
    assert frame[1] == 127
    assert struct.unpack("!Q", frame[2:10])[0] == 70000


def test_encode_close_frame():
    frame = encode_close_frame(code=1000)
    assert frame[0] == 0x88  # FIN + close opcode
    assert frame[1] == 2


def test_encode_pong_frame_echo():
    frame = encode_pong_frame(b"ping-data")
    assert frame[0] == 0x8A  # FIN + pong opcode
    assert frame[2:] == b"ping-data"


def test_decode_frame_unmasked_text():
    frame = encode_text_frame("hello")
    opcode, payload, consumed = decode_frame(frame)
    assert opcode == 0x1
    assert payload == b"hello"
    assert consumed == len(frame)


def test_decode_frame_short_buffer_raises():
    with pytest.raises(FrameDecodeError):
        decode_frame(b"\x81")


def test_decode_frame_masked_payload():
    """Client-to-server frames MUST be masked; emulate the masking."""
    payload = b"hi"
    mask = bytes([0xa1, 0xb2, 0xc3, 0xd4])
    masked = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
    frame = bytes([0x81, 0x80 | len(payload)]) + mask + masked
    opcode, payload_out, consumed = decode_frame(frame)
    assert opcode == 0x1
    assert payload_out == b"hi"
    assert consumed == len(frame)


def test_decode_frame_16bit_length():
    payload = b"x" * 300
    frame = bytes([0x81, 126]) + struct.pack("!H", 300) + payload
    op, p, _ = decode_frame(frame)
    assert op == 0x1
    assert p == payload


# ─── E2E asyncio handshake + frame ────────────────────────────────────────


def test_websocket_handshake_and_one_spin():
    """Spin up real asyncio WebSocketGateway server; complete handshake
    + send one masked text frame; verify response is a valid text frame."""
    async def _run():
        spin_server = SpinServer(server_seed_hex="ab" * 32)
        gateway = WebSocketGateway(spin_server=spin_server)
        tcp = await asyncio.start_server(gateway.handle_client, "127.0.0.1", 0)
        port = tcp.sockets[0].getsockname()[1]
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            handshake = (
                f"GET /ws HTTP/1.1\r\n"
                f"Host: 127.0.0.1\r\n"
                f"Upgrade: websocket\r\n"
                f"Connection: Upgrade\r\n"
                f"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                f"\r\n"
            ).encode("iso-8859-1")
            writer.write(handshake)
            await writer.drain()
            handshake_resp = await reader.readuntil(b"\r\n\r\n")
            assert b"HTTP/1.1 101" in handshake_resp
            assert b"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" in handshake_resp

            # Send one masked text frame
            req = json.dumps({
                "type": "spin", "request_id": "r-1", "session_id": "ws",
                "client_seed": "ws-client", "nonce": 0,
            }).encode("utf-8")
            mask = bytes([0xa, 0xb, 0xc, 0xd])
            masked = bytes(b ^ mask[i & 3] for i, b in enumerate(req))
            frame = bytes([0x81, 0x80 | len(req)]) + mask + masked
            writer.write(frame)
            await writer.drain()

            # Read response frame
            head = await reader.readexactly(2)
            opcode = head[0] & 0x0F
            length = head[1] & 0x7F
            if length == 126:
                ext = await reader.readexactly(2)
                length = struct.unpack("!H", ext)[0]
            elif length == 127:
                ext = await reader.readexactly(8)
                length = struct.unpack("!Q", ext)[0]
            payload = await reader.readexactly(length)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass
            return opcode, payload
        finally:
            tcp.close()
            await tcp.wait_closed()

    opcode, payload = asyncio.run(_run())
    assert opcode == 0x1  # text frame
    obj = json.loads(payload.decode("utf-8"))
    assert obj["ok"] is True
    assert obj["request_id"] == "r-1"


def test_websocket_handshake_rejects_non_upgrade():
    """If the request is missing Upgrade header → 400."""
    async def _run():
        spin_server = SpinServer(server_seed_hex="ab" * 32)
        gateway = WebSocketGateway(spin_server=spin_server)
        tcp = await asyncio.start_server(gateway.handle_client, "127.0.0.1", 0)
        port = tcp.sockets[0].getsockname()[1]
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.write(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")
            await writer.drain()
            data = await reader.read(64)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass
            return data
        finally:
            tcp.close()
            await tcp.wait_closed()

    data = asyncio.run(_run())
    assert b"400 Bad Request" in data


def test_websocket_ping_pong():
    """Server must respond to ping with pong of same payload."""
    async def _run():
        spin_server = SpinServer(server_seed_hex="cd" * 32)
        gateway = WebSocketGateway(spin_server=spin_server)
        tcp = await asyncio.start_server(gateway.handle_client, "127.0.0.1", 0)
        port = tcp.sockets[0].getsockname()[1]
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            handshake = (
                b"GET / HTTP/1.1\r\n"
                b"Host: x\r\n"
                b"Upgrade: websocket\r\n"
                b"Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n"
                b"\r\n"
            )
            writer.write(handshake)
            await writer.drain()
            await reader.readuntil(b"\r\n\r\n")

            # Send masked ping with payload "ping-payload"
            payload = b"pingdata"
            mask = bytes([0x01, 0x02, 0x03, 0x04])
            masked = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
            frame = bytes([0x89, 0x80 | len(payload)]) + mask + masked  # ping opcode 0x9
            writer.write(frame)
            await writer.drain()

            # Read pong
            head = await reader.readexactly(2)
            opcode = head[0] & 0x0F
            length = head[1] & 0x7F
            resp_payload = await reader.readexactly(length)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass
            return opcode, resp_payload
        finally:
            tcp.close()
            await tcp.wait_closed()

    opcode, payload = asyncio.run(_run())
    assert opcode == 0xA  # pong
    assert payload == b"pingdata"
