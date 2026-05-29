"""PHASE 12 — asyncio TCP/line server.

Single-process asyncio loop; one connection per cabinet/client.
Each request is one JSON line; each response is one JSON line.

Connection-state: tracks (session_id) → running RTP across spins
so the response carries `rtp_running` for live UI gauges. Sessions
are isolated per connection by default; a single connection may
serve multiple session_ids if the operator chooses.

Hot-reload: call `server.swap_ir(new_ir)` from another coroutine
to atomically swap the IR served to subsequent spins. The change
is visible after the next spin starts; no in-flight spin sees the
new IR (atomic ref swap).

Sub-100ms P99 latency target: engine_spin is O(reels × rows) on the
synthetic engine (negligible) — overhead is dominated by JSON
encode/decode + TCP roundtrip. On localhost this lands in 50-200µs
range per spin (excluding TCP latency).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from tools.rgs_live.engine import engine_spin, default_synthetic_ir
from tools.rgs_live.protocol import (
    SpinResponse,
    parse_request,
    serialize_response,
)


@dataclass
class _SessionState:
    total_payout: float = 0.0
    total_bet: float = 0.0
    spins: int = 0


@dataclass
class _ServerStats:
    spins_served: int = 0
    errors: int = 0
    bytes_in: int = 0
    bytes_out: int = 0
    latency_us_sum: int = 0
    latency_us_max: int = 0
    latencies_us: list[int] = field(default_factory=list)


class SpinServer:
    """asyncio TCP spin server.

    Usage (in-process load test):

        async def run():
            server = SpinServer(server_seed_hex="ab"*32, ir=default_synthetic_ir())
            tcp = await asyncio.start_server(server.handle_client, "127.0.0.1", 0)
            port = tcp.sockets[0].getsockname()[1]
            # ... dispatch clients to port ...
            tcp.close()
            await tcp.wait_closed()
    """

    def __init__(
        self,
        *,
        server_seed_hex: str,
        ir: Optional[dict[str, Any]] = None,
        max_keep_latencies: int = 100_000,
    ) -> None:
        if not server_seed_hex or len(server_seed_hex) % 2 != 0:
            raise ValueError("server_seed_hex must be non-empty even-length hex")
        self.server_seed_hex = server_seed_hex
        self._ir = ir if ir is not None else default_synthetic_ir()
        self._sessions: dict[str, _SessionState] = {}
        self.stats = _ServerStats()
        self._max_keep_latencies = max_keep_latencies
        # PHASE 15 commit
        import hashlib
        self.server_seed_commit = hashlib.sha256(
            bytes.fromhex(server_seed_hex)
        ).hexdigest()

    # ── Hot-reload ────────────────────────────────────────────────────
    def swap_ir(self, new_ir: dict[str, Any], reset_sessions: bool = True) -> None:
        """Atomically swap the served IR. If `reset_sessions`, drop running
        per-session RTP counters (so they reflect the new IR)."""
        self._ir = new_ir
        if reset_sessions:
            self._sessions = {}

    # ── Single-spin handler (sync, in-process) ────────────────────────
    def handle_spin(self, line: str) -> str:
        """Process one JSON-line request → JSON-line response."""
        t0 = time.perf_counter_ns()
        try:
            req = parse_request(line)
        except ValueError as exc:
            self.stats.errors += 1
            latency_us = (time.perf_counter_ns() - t0) // 1000
            self._record_latency(latency_us)
            resp = SpinResponse(
                request_id="(unknown)",
                ok=False,
                error=str(exc),
                latency_us=int(latency_us),
                server_seed_commit=self.server_seed_commit,
            )
            return serialize_response(resp)

        sess = self._sessions.setdefault(req.session_id, _SessionState())
        result = engine_spin(
            self._ir,
            req,
            self.server_seed_hex,
            running_total_payout=sess.total_payout,
            running_total_bet=sess.total_bet,
        )
        sess.total_payout += result.total_payout
        sess.total_bet += req.bet_amount
        sess.spins += 1

        latency_us = (time.perf_counter_ns() - t0) // 1000
        self._record_latency(latency_us)
        self.stats.spins_served += 1
        resp = SpinResponse(
            request_id=req.request_id,
            ok=True,
            result=result,
            latency_us=int(latency_us),
            server_seed_commit=self.server_seed_commit,
        )
        return serialize_response(resp)

    # ── asyncio client handler ────────────────────────────────────────
    async def handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        try:
            while True:
                line_bytes = await reader.readline()
                if not line_bytes:
                    break
                self.stats.bytes_in += len(line_bytes)
                response = self.handle_spin(line_bytes.decode("utf-8").strip())
                payload = (response + "\n").encode("utf-8")
                self.stats.bytes_out += len(payload)
                writer.write(payload)
                await writer.drain()
        except (ConnectionResetError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass

    # ── Stats ─────────────────────────────────────────────────────────
    def _record_latency(self, us: int) -> None:
        s = self.stats
        s.latency_us_sum += us
        if us > s.latency_us_max:
            s.latency_us_max = us
        s.latencies_us.append(us)
        if len(s.latencies_us) > self._max_keep_latencies:
            # keep the most recent N
            s.latencies_us = s.latencies_us[-self._max_keep_latencies:]

    @property
    def avg_latency_us(self) -> float:
        if self.stats.spins_served == 0:
            return 0.0
        return self.stats.latency_us_sum / self.stats.spins_served

    def p99_latency_us(self) -> int:
        if not self.stats.latencies_us:
            return 0
        s = sorted(self.stats.latencies_us)
        idx = max(0, int(round(0.99 * len(s))) - 1)
        return s[idx]
