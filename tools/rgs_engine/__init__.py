"""PHASE 12 — Real-Time RGS Live Engine.

A production-grade spin server that turns the slot-math engine from an
offline audit / cert tool into a live RGS endpoint:

  * Deterministic in-process spin core (`spin_engine.py`) with bit-
    identical Mulberry32 PRNG and PHASE 15 seed derivation.
  * NDJSON wire protocol (`protocol.py`) with `hello` / `spin` /
    `spin_result` / `error` frames.
  * Async TCP server (`server.py`) — one session per connection,
    auto-issued `server_seed_commit`, receipts accumulated for the
    chain Merkle proof.
  * Load-test harness (`load_test.py`) — drives N concurrent clients,
    reports throughput + p50/p95/p99 latency + marketing grade.
  * CLI (`__main__.py`) — `python -m tools.rgs_engine serve <ir>` and
    `python -m tools.rgs_engine load-test <ir>`.

PHASE 16 (multi-platform UI) ships a browser client at
`web/rgs_client/index.html` that talks the same frames over WebSocket
when fronted by a tiny TCP↔WebSocket bridge.
"""

from tools.rgs_engine.protocol import (
    ErrorFrame,
    HelloFrame,
    SpinRequestFrame,
    SpinResultFrame,
    decode_frame,
    encode_frame,
)
from tools.rgs_engine.server import RgsServer, ServerStats, SessionState
from tools.rgs_engine.spin_engine import Mulberry32, SpinOutcome, SpinRequest, spin

__all__ = [
    "ErrorFrame",
    "HelloFrame",
    "Mulberry32",
    "RgsServer",
    "ServerStats",
    "SessionState",
    "SpinOutcome",
    "SpinRequest",
    "SpinRequestFrame",
    "SpinResultFrame",
    "decode_frame",
    "encode_frame",
    "spin",
]
