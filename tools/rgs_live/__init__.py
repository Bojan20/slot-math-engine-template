"""PHASE 12 — Real-Time RGS Live Engine.

Production-grade live spin protocol: JSON-line over asyncio TCP,
sub-100ms P99 latency target, hot-reloadable IR, per-spin RNG bound
to PHASE 15 commit-reveal.

Pure-stdlib only (asyncio + json + struct + hmac). Designed to be
plugged behind a thin WebSocket gateway by the operator, but the
core engine is transport-agnostic.

Public API:

    from tools.rgs_live import (
        SpinRequest, SpinResponse, SpinResult,
        engine_spin,                # deterministic engine: (ir, seed) → result
        SpinServer,                 # asyncio TCP/line server
        LoadTestResult,
        run_load_test,              # in-process load harness
    )

CLI:
    python -m tools.rgs_live serve --port 7777 --ir path/to/ir.json
    python -m tools.rgs_live load-test --spins 10000 --concurrency 100
"""

from __future__ import annotations

from tools.rgs_live.protocol import (
    SpinRequest,
    SpinResponse,
    SpinResult,
    parse_request,
    serialize_response,
)
from tools.rgs_live.engine import engine_spin, default_synthetic_ir
from tools.rgs_live.server import SpinServer
from tools.rgs_live.load_test import LoadTestResult, run_load_test
from tools.rgs_live.websocket_gateway import (
    WebSocketGateway,
    compute_accept_key,
    parse_http_request,
    build_handshake_response,
    encode_text_frame,
    encode_close_frame,
    encode_pong_frame,
    decode_frame,
    FrameDecodeError,
    serve_pool,
)

__all__ = [
    "SpinRequest",
    "SpinResponse",
    "SpinResult",
    "parse_request",
    "serialize_response",
    "engine_spin",
    "default_synthetic_ir",
    "SpinServer",
    "LoadTestResult",
    "run_load_test",
    "WebSocketGateway",
    "compute_accept_key",
    "parse_http_request",
    "build_handshake_response",
    "encode_text_frame",
    "encode_close_frame",
    "encode_pong_frame",
    "decode_frame",
    "FrameDecodeError",
    "serve_pool",
]
