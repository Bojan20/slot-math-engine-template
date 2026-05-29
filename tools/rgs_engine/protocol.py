"""PHASE 12 — RGS wire protocol (NDJSON frames over TCP / WebSocket).

Single line of newline-delimited JSON per message. Schema:

  request → {
      "type":         "spin",
      "session_id":   "<uuid>",          # opaque server-issued
      "client_seed":  "<utf-8>",         # player choice
      "nonce":        <uint64>,          # monotonic per session
      "bet":          <number>           # > 0
  }

  response (success) → {
      "type":         "spin_result",
      "session_id":   "<uuid>",
      "spin_index":   <uint64>,
      "rng_seed":     <uint64>,
      "grid":         [[...], [...], ...],
      "total_pay":    <number>,
      "hits":         [ { "line": int, "symbol": str, "run": int, "pay": number }, ... ],
      "commit_chain": {                  # PHASE 15 wire
          "server_seed_commit": "<hex>",
          "spin_hash":          "<hex>"
      },
      "latency_us":   <int>              # server-side spin latency
  }

  response (error) → {
      "type":   "error",
      "code":   "bad_request" | "no_session" | "bet_invalid" | "internal",
      "detail": "<utf-8>",
      "session_id": "<uuid?>"
  }

  hello (sent server→client immediately after session open) → {
      "type":           "hello",
      "session_id":     "<uuid>",
      "server_seed_commit": "<hex>",     # PHASE 15 pre-session commit
      "protocol_version": 1
  }

The protocol is deliberately tiny + framed-by-newline so the server can
sit behind any transport (raw TCP, websocket, HTTP/2 SSE) with the same
encoder/decoder. The reference server in `server.py` ships TCP for the
load test; PHASE 16 (multi-platform UI runtime) wraps the same frames
in a fetch-based polyfill for browser clients.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional


PROTOCOL_VERSION = 1


# ─── Request shapes ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SpinRequestFrame:
    session_id: str
    client_seed: str
    nonce: int
    bet: float

    @classmethod
    def from_json(cls, raw: dict[str, Any]) -> "SpinRequestFrame":
        if raw.get("type") != "spin":
            raise ValueError(f"expected type=spin, got {raw.get('type')!r}")
        for field_name in ("session_id", "client_seed", "nonce", "bet"):
            if field_name not in raw:
                raise ValueError(f"spin frame missing required field {field_name!r}")
        return cls(
            session_id=str(raw["session_id"]),
            client_seed=str(raw["client_seed"]),
            nonce=int(raw["nonce"]),
            bet=float(raw["bet"]),
        )

    def to_json(self) -> dict[str, Any]:
        return {
            "type": "spin",
            "session_id": self.session_id,
            "client_seed": self.client_seed,
            "nonce": self.nonce,
            "bet": self.bet,
        }


# ─── Response shapes ───────────────────────────────────────────────────────


@dataclass
class HelloFrame:
    session_id: str
    server_seed_commit: str
    protocol_version: int = PROTOCOL_VERSION

    def to_json(self) -> dict[str, Any]:
        return {
            "type": "hello",
            "session_id": self.session_id,
            "server_seed_commit": self.server_seed_commit,
            "protocol_version": self.protocol_version,
        }


@dataclass
class SpinResultFrame:
    session_id: str
    spin_index: int
    rng_seed: int
    grid: list[list[str]]
    total_pay: float
    hits: list[dict[str, Any]]
    server_seed_commit: str
    spin_hash_hex: str
    latency_us: int

    def to_json(self) -> dict[str, Any]:
        return {
            "type": "spin_result",
            "session_id": self.session_id,
            "spin_index": self.spin_index,
            "rng_seed": self.rng_seed,
            "grid": self.grid,
            "total_pay": self.total_pay,
            "hits": list(self.hits),
            "commit_chain": {
                "server_seed_commit": self.server_seed_commit,
                "spin_hash": self.spin_hash_hex,
            },
            "latency_us": self.latency_us,
        }


@dataclass
class ErrorFrame:
    code: str
    detail: str
    session_id: Optional[str] = None

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "type": "error",
            "code": self.code,
            "detail": self.detail,
        }
        if self.session_id is not None:
            out["session_id"] = self.session_id
        return out


# ─── Encoder / decoder helpers ─────────────────────────────────────────────


def encode_frame(payload: dict[str, Any]) -> bytes:
    """Encode a JSON dict into one NDJSON frame (trailing newline)."""
    return (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")


def decode_frame(line: bytes) -> dict[str, Any]:
    """Decode one NDJSON line (without the trailing newline)."""
    if not line:
        raise ValueError("empty frame")
    return json.loads(line.decode("utf-8"))
