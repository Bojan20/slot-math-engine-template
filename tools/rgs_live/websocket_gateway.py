"""PHASE 12.B — WebSocket gateway for the spin server.

Thin RFC 6455 frame adapter that wraps `SpinServer.handle_spin` so a
browser client can talk to it directly. Pure stdlib (asyncio + base64 +
hashlib + struct) — no `websockets` dep.

Supported features:
  - RFC 6455 handshake (Sec-WebSocket-Key/Sec-WebSocket-Accept)
  - Frames: text (0x1) / close (0x8) / ping (0x9) / pong (0xA)
  - Masked client frames decoded; server frames emitted unmasked
  - Payload lengths: 7-bit / 16-bit / 64-bit extended
  - Auto-respond to ping with pong; honour close opcode
  - One spin per text frame (line-delimited JSON same as TCP path)

NOT supported (intentional scope cut):
  - Binary frames (server sends text-only)
  - Fragmented frames (single-frame-per-message convention)
  - Per-message-deflate extension

Threat surface: only intended for trusted gateway/operator deployment;
production exposure should sit behind nginx/cloudflare with TLS.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import struct
from typing import Any

from tools.rgs_live.server import SpinServer


_WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


# ─── Handshake ─────────────────────────────────────────────────────────────


def compute_accept_key(client_key: str) -> str:
    """Compute Sec-WebSocket-Accept header from client's Sec-WebSocket-Key.

    Per RFC 6455 §4.2.2:
        base64( sha1( client_key + GUID ) )
    """
    sha = hashlib.sha1(client_key.encode("utf-8") + _WS_GUID).digest()
    return base64.b64encode(sha).decode("ascii")


def parse_http_request(raw: bytes) -> dict[str, str]:
    """Parse a minimal HTTP request into a header dict.

    Returns: {method, path, version, header_lowercase_name: value, ...}
    """
    text = raw.decode("iso-8859-1")
    lines = text.split("\r\n")
    if not lines or not lines[0]:
        raise ValueError("empty HTTP request")
    request_line = lines[0]
    parts = request_line.split(" ")
    if len(parts) != 3:
        raise ValueError(f"bad request line: {request_line!r}")
    out: dict[str, str] = {
        "method": parts[0],
        "path": parts[1],
        "version": parts[2],
    }
    for line in lines[1:]:
        if not line:
            break
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        out[k.strip().lower()] = v.strip()
    return out


def build_handshake_response(client_key: str) -> bytes:
    """Build the HTTP 101 Switching Protocols response."""
    accept = compute_accept_key(client_key)
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n"
        "\r\n"
    )
    return response.encode("iso-8859-1")


# ─── Frame I/O ─────────────────────────────────────────────────────────────


def encode_text_frame(payload: str) -> bytes:
    """Encode an unmasked server→client text frame (opcode 0x1, FIN=1)."""
    body = payload.encode("utf-8")
    return _encode_frame(opcode=0x1, payload=body)


def encode_close_frame(code: int = 1000, reason: str = "") -> bytes:
    body = struct.pack(">H", code) + reason.encode("utf-8")
    return _encode_frame(opcode=0x8, payload=body)


def encode_pong_frame(payload: bytes = b"") -> bytes:
    return _encode_frame(opcode=0xA, payload=payload)


def _encode_frame(opcode: int, payload: bytes) -> bytes:
    fin_and_op = 0x80 | (opcode & 0x0F)
    length = len(payload)
    if length < 126:
        header = struct.pack("!BB", fin_and_op, length)
    elif length < (1 << 16):
        header = struct.pack("!BBH", fin_and_op, 126, length)
    else:
        header = struct.pack("!BBQ", fin_and_op, 127, length)
    return header + payload


class FrameDecodeError(Exception):
    pass


def decode_frame(raw: bytes) -> tuple[int, bytes, int]:
    """Decode a single frame from `raw` (may contain trailing bytes).

    Returns (opcode, payload_bytes, consumed_bytes). Raises FrameDecodeError
    if the buffer is incomplete or the frame is malformed.
    """
    if len(raw) < 2:
        raise FrameDecodeError("buffer < 2 bytes")
    b0, b1 = raw[0], raw[1]
    opcode = b0 & 0x0F
    masked = (b1 & 0x80) != 0
    length = b1 & 0x7F
    offset = 2
    if length == 126:
        if len(raw) < offset + 2:
            raise FrameDecodeError("buffer short for 16-bit length")
        length = struct.unpack("!H", raw[offset:offset + 2])[0]
        offset += 2
    elif length == 127:
        if len(raw) < offset + 8:
            raise FrameDecodeError("buffer short for 64-bit length")
        length = struct.unpack("!Q", raw[offset:offset + 8])[0]
        offset += 8

    if masked:
        if len(raw) < offset + 4:
            raise FrameDecodeError("buffer short for mask key")
        mask = raw[offset:offset + 4]
        offset += 4
    else:
        mask = None

    if len(raw) < offset + length:
        raise FrameDecodeError("buffer short for payload")
    payload = raw[offset:offset + length]
    offset += length

    if mask is not None:
        payload = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))

    return opcode, payload, offset


# ─── asyncio adapter ───────────────────────────────────────────────────────


class WebSocketGateway:
    """Wrap a SpinServer so a WebSocket client can talk to it.

    Usage:
        server = SpinServer(server_seed_hex="ab"*32)
        gateway = WebSocketGateway(spin_server=server)
        tcp = await asyncio.start_server(gateway.handle_client, host, port)
    """

    def __init__(self, *, spin_server: SpinServer) -> None:
        self.spin_server = spin_server
        # Per-connection scratch buffer
        self._buffers: dict[int, bytearray] = {}

    async def handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        try:
            # 1. HTTP handshake
            handshake_raw = await asyncio.wait_for(
                reader.readuntil(b"\r\n\r\n"), timeout=10.0,
            )
            try:
                headers = parse_http_request(handshake_raw)
            except ValueError:
                writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
                await writer.drain()
                return
            if headers.get("upgrade", "").lower() != "websocket":
                writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
                await writer.drain()
                return
            client_key = headers.get("sec-websocket-key", "")
            if not client_key:
                writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
                await writer.drain()
                return
            writer.write(build_handshake_response(client_key))
            await writer.drain()

            # 2. Frame loop
            buffer = bytearray()
            while True:
                chunk = await reader.read(8192)
                if not chunk:
                    break
                buffer.extend(chunk)
                # Drain as many complete frames as possible
                while buffer:
                    try:
                        opcode, payload, consumed = decode_frame(bytes(buffer))
                    except FrameDecodeError:
                        break  # need more bytes
                    del buffer[:consumed]
                    if opcode == 0x8:  # close
                        writer.write(encode_close_frame())
                        await writer.drain()
                        return
                    if opcode == 0x9:  # ping
                        writer.write(encode_pong_frame(payload))
                        await writer.drain()
                        continue
                    if opcode == 0xA:  # pong — ignore
                        continue
                    if opcode == 0x1:  # text
                        text = payload.decode("utf-8", errors="replace")
                        response = self.spin_server.handle_spin(text)
                        writer.write(encode_text_frame(response))
                        await writer.drain()
                    # any other opcode → ignore (no binary support)
        except (asyncio.IncompleteReadError, asyncio.TimeoutError,
                ConnectionResetError, BrokenPipeError):
            pass
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass


# ─── Helper: standalone-mode pool ──────────────────────────────────────────


async def serve_pool(
    *,
    host: str,
    port: int,
    spin_server: SpinServer,
) -> Any:
    """Convenience: start a single WebSocketGateway server on (host, port).

    Returns the asyncio Server. Caller is responsible for `.close()` +
    `await wait_closed()` lifecycle.
    """
    gateway = WebSocketGateway(spin_server=spin_server)
    tcp = await asyncio.start_server(gateway.handle_client, host, port)
    return tcp
