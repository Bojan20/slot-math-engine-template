"""PHASE 12 — Async RGS spin server.

`asyncio` TCP server that frames the `tools.rgs_engine.protocol` NDJSON
schema and serves real-time spins from an in-process slot-sim IR. One
session = one TCP connection = one `server_seed_commit` published in
the opening `hello` frame; every spin in that session derives its RNG
seed from the chain via `crypto_fair.derive_spin_seed`, so the regulator
can replay the entire session post-reveal.

The hot path:
  1. Client opens TCP → server generates `(commit, server_seed)` via
     `crypto_fair.commit_server_seed`. Commit is published in `hello`;
     server_seed stays in the session struct (revealed when the session
     closes via `--reveal-on-close`, mirroring vendor practice).
  2. Client sends `spin` frame.
  3. Server validates, derives the per-spin seed, runs the spin via
     `tools.rgs_engine.spin_engine.spin`, frames the `spin_result`,
     and writes it back.
  4. Receipts are accumulated server-side so `build_spin_chain_merkle`
     can be asked for the inclusion proof of any spin.

Throughput notes:
  - Spin engine runs sync but is ≤ 50 µs / spin on M2 Max for a 5×3
    20-payline IR. We invoke it directly without `run_in_executor`
    because the work is short enough that the GIL hand-off would cost
    more than it saves.
  - One connection processes spins sequentially (single-session order);
    concurrent throughput comes from many simultaneous connections.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from tools.crypto_fair.fair_chain import (
    SpinReceipt,
    build_spin_chain_merkle,
    commit_server_seed,
)
from tools.rgs_engine.protocol import (
    ErrorFrame,
    HelloFrame,
    SpinRequestFrame,
    SpinResultFrame,
    decode_frame,
    encode_frame,
)
from tools.rgs_engine.spin_engine import SpinRequest, spin


# ─── Session state ─────────────────────────────────────────────────────────


@dataclass
class SessionState:
    session_id: str
    server_seed_hex: str
    server_seed_commit: str
    receipts: list[SpinReceipt] = field(default_factory=list)
    spin_count: int = 0


# ─── Server ────────────────────────────────────────────────────────────────


@dataclass
class ServerStats:
    """Live counters; exposed to load test harness and the optional
    `--metrics-after` print on shutdown."""

    sessions_opened: int = 0
    sessions_closed: int = 0
    spins_total: int = 0
    spin_errors: int = 0
    bytes_in: int = 0
    bytes_out: int = 0
    latency_us_sum: int = 0
    latency_us_max: int = 0


class RgsServer:
    """Single-IR async RGS spin server."""

    def __init__(self, ir: dict[str, Any]) -> None:
        self._ir = ir
        self._stats = ServerStats()
        self._sessions: dict[str, SessionState] = {}

    # ── public ────────────────────────────────────────────────────────────

    @property
    def stats(self) -> ServerStats:
        return self._stats

    def session(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)

    def chain_merkle(self, session_id: str) -> dict[str, Any]:
        s = self._sessions.get(session_id)
        if not s:
            return {"root": "", "leaves": 0, "tree_depth": 0}
        return build_spin_chain_merkle(s.receipts)

    async def serve(
        self, host: str = "127.0.0.1", port: int = 0
    ) -> asyncio.base_events.Server:
        """Start serving. Returns the asyncio Server; caller controls
        lifetime via `server.close()` + `await server.wait_closed()`."""
        return await asyncio.start_server(self._handle_client, host=host, port=port)

    # ── internal ──────────────────────────────────────────────────────────

    async def _handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        sess = self._open_session()
        try:
            # Hello frame.
            hello = HelloFrame(
                session_id=sess.session_id,
                server_seed_commit=sess.server_seed_commit,
            )
            await self._write_frame(writer, hello.to_json())

            while True:
                line = await reader.readline()
                if not line:
                    break  # client disconnected
                self._stats.bytes_in += len(line)
                try:
                    frame = decode_frame(line.rstrip(b"\r\n"))
                except Exception as exc:  # noqa: BLE001
                    await self._write_frame(
                        writer,
                        ErrorFrame(
                            code="bad_request",
                            detail=f"frame parse: {exc}",
                            session_id=sess.session_id,
                        ).to_json(),
                    )
                    self._stats.spin_errors += 1
                    continue

                if frame.get("type") != "spin":
                    await self._write_frame(
                        writer,
                        ErrorFrame(
                            code="bad_request",
                            detail=f"unknown frame type: {frame.get('type')!r}",
                            session_id=sess.session_id,
                        ).to_json(),
                    )
                    self._stats.spin_errors += 1
                    continue

                # Forge session_id to the server's authoritative copy so
                # a misbehaving client can't impersonate a different
                # session by writing arbitrary IDs into the frame.
                frame["session_id"] = sess.session_id
                try:
                    req = SpinRequestFrame.from_json(frame)
                except Exception as exc:  # noqa: BLE001
                    await self._write_frame(
                        writer,
                        ErrorFrame(
                            code="bad_request",
                            detail=str(exc),
                            session_id=sess.session_id,
                        ).to_json(),
                    )
                    self._stats.spin_errors += 1
                    continue
                if req.bet <= 0:
                    await self._write_frame(
                        writer,
                        ErrorFrame(
                            code="bet_invalid",
                            detail=f"bet must be > 0; got {req.bet}",
                            session_id=sess.session_id,
                        ).to_json(),
                    )
                    self._stats.spin_errors += 1
                    continue

                # Run the spin.
                t0 = time.perf_counter_ns()
                try:
                    outcome = spin(
                        self._ir,
                        SpinRequest(
                            server_seed_hex=sess.server_seed_hex,
                            client_seed=req.client_seed,
                            nonce=req.nonce,
                            bet=req.bet,
                        ),
                        server_seed_commit=sess.server_seed_commit,
                    )
                except Exception as exc:  # noqa: BLE001
                    await self._write_frame(
                        writer,
                        ErrorFrame(
                            code="internal",
                            detail=f"spin failed: {exc}",
                            session_id=sess.session_id,
                        ).to_json(),
                    )
                    self._stats.spin_errors += 1
                    continue
                latency_us = max(1, (time.perf_counter_ns() - t0) // 1000)

                if outcome.receipt is not None:
                    sess.receipts.append(outcome.receipt)
                sess.spin_count += 1
                self._stats.spins_total += 1
                self._stats.latency_us_sum += latency_us
                if latency_us > self._stats.latency_us_max:
                    self._stats.latency_us_max = latency_us

                spin_hash_hex = (
                    outcome.receipt.spin_hash.hex()
                    if outcome.receipt is not None
                    else ""
                )
                resp = SpinResultFrame(
                    session_id=sess.session_id,
                    spin_index=outcome.spin_index,
                    rng_seed=outcome.rng_seed,
                    grid=outcome.grid,
                    total_pay=outcome.total_pay,
                    hits=outcome.hits,
                    server_seed_commit=sess.server_seed_commit,
                    spin_hash_hex=spin_hash_hex,
                    latency_us=latency_us,
                )
                await self._write_frame(writer, resp.to_json())
        finally:
            self._stats.sessions_closed += 1
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass

    def _open_session(self) -> SessionState:
        commit, seed_hex = commit_server_seed()
        session_id = str(uuid.uuid4())
        state = SessionState(
            session_id=session_id,
            server_seed_hex=seed_hex,
            server_seed_commit=commit,
        )
        self._sessions[session_id] = state
        self._stats.sessions_opened += 1
        return state

    async def _write_frame(
        self, writer: asyncio.StreamWriter, payload: dict[str, Any]
    ) -> None:
        data = encode_frame(payload)
        self._stats.bytes_out += len(data)
        writer.write(data)
        await writer.drain()
