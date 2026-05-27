"""PHASE 12 — Spin protocol shapes.

JSON-line: each request is a single JSON object on one line,
each response is a single JSON object on one line. \\n delimited.

Request shape:
    {
      "type": "spin",
      "request_id": "uuid-or-monotonic-int",
      "session_id": "...",
      "client_seed": "...",
      "nonce": 0,
      "bet_amount": 1.0
    }

Response shape:
    {
      "type": "spin_response",
      "request_id": "...",
      "ok": true,
      "result": {
        "symbols": [[...]],
        "lines_won": [...],
        "total_payout": 0.0,
        "rtp_running": 0.0,
        "spin_hash_hex": "..."
      },
      "latency_us": 1234,
      "server_seed_commit": "..."
    }

Error shape:
    {
      "type": "spin_response",
      "request_id": "...",
      "ok": false,
      "error": "...",
      "latency_us": 1234
    }
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from typing import Any, Optional


@dataclass
class SpinRequest:
    request_id: str
    session_id: str
    client_seed: str
    nonce: int
    bet_amount: float = 1.0


@dataclass
class SpinResult:
    symbols: list[list[str]]            # grid: reels × rows
    lines_won: list[dict[str, Any]]     # winning lines + pay
    total_payout: float
    rtp_running: float                   # running RTP for the session
    spin_hash_hex: str                   # spin commitment


@dataclass
class SpinResponse:
    request_id: str
    ok: bool
    result: Optional[SpinResult] = None
    error: Optional[str] = None
    latency_us: int = 0
    server_seed_commit: str = ""
    type: str = "spin_response"


# ─── Parsers ───────────────────────────────────────────────────────────────


def parse_request(line: str | bytes) -> SpinRequest:
    """Parse a single JSON line into a SpinRequest.

    Raises ValueError on malformed input.
    """
    if isinstance(line, (bytes, bytearray)):
        line = line.decode("utf-8")
    try:
        obj = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON: {exc}") from None
    if not isinstance(obj, dict):
        raise ValueError("request must be JSON object")
    if obj.get("type") != "spin":
        raise ValueError(f"unsupported type: {obj.get('type')}")
    for required in ("request_id", "session_id", "client_seed", "nonce"):
        if required not in obj:
            raise ValueError(f"missing field: {required}")
    nonce = obj["nonce"]
    if not isinstance(nonce, int) or nonce < 0:
        raise ValueError("nonce must be non-negative int")
    return SpinRequest(
        request_id=str(obj["request_id"]),
        session_id=str(obj["session_id"]),
        client_seed=str(obj["client_seed"]),
        nonce=nonce,
        bet_amount=float(obj.get("bet_amount", 1.0)),
    )


def serialize_response(resp: SpinResponse) -> str:
    """Serialise SpinResponse to a JSON line (no trailing newline)."""
    d = asdict(resp)
    if d.get("result") is None:
        d.pop("result", None)
    if d.get("error") is None:
        d.pop("error", None)
    return json.dumps(d, separators=(",", ":"))
