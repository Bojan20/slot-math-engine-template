"""PHASE 12 — synthetic deterministic engine for live spin protocol.

Plays the role of a production engine in the load-test + smoke harness.
Wire to a real engine via the same `engine_spin(ir, request, seed)`
signature when integrating with the universal slot-sim Rust engine.

Determinism contract:
  - same (ir, request, server_seed) ⇒ bit-identical SpinResult
  - server_seed pins via PHASE 15 commit-reveal
  - per-spin RNG = HMAC-SHA256(server_seed, client_seed || nonce)

Hot-reload contract:
  - new IR can be swapped in mid-session; subsequent spins use new IR
  - session state (running RTP) is reset on IR swap (operator policy)
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from tools.crypto_fair.fair_chain import derive_spin_seed
from tools.rgs_live.protocol import SpinRequest, SpinResult


def default_synthetic_ir() -> dict[str, Any]:
    """Tiny 5×3 IR for load-test harness when no real IR available."""
    return {
        "meta": {"name": "Synthetic", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3, "paylines": 20},
        "symbols": [
            {"id": "A", "weight": 8},
            {"id": "B", "weight": 6},
            {"id": "C", "weight": 5},
            {"id": "D", "weight": 4},
            {"id": "E", "weight": 3},
        ],
        "paytable": [
            {"combo": ["A"] * 5, "pays": 50},
            {"combo": ["B"] * 5, "pays": 100},
            {"combo": ["C"] * 5, "pays": 200},
            {"combo": ["D"] * 5, "pays": 500},
            {"combo": ["E"] * 5, "pays": 1000},
            {"combo": ["A"] * 4 + ["-"], "pays": 10},
            {"combo": ["B"] * 4 + ["-"], "pays": 20},
            {"combo": ["C"] * 4 + ["-"], "pays": 50},
            {"combo": ["A"] * 3 + ["-", "-"], "pays": 2},
            {"combo": ["B"] * 3 + ["-", "-"], "pays": 4},
        ],
    }


def _mulberry32(state: int) -> tuple[int, int]:
    """Return (next_u32, new_state). Pure-int Mulberry32."""
    state = (state + 0x6d2b79f5) & 0xffffffff
    t = state
    t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
    t ^= (t + ((t ^ (t >> 7)) * (t | 61))) & 0xffffffff
    out = ((t ^ (t >> 14)) & 0xffffffff)
    return out, state


def _spin_grid(ir: dict[str, Any], seed: int) -> list[list[str]]:
    """Build a reels×rows grid from the symbol weights + seed."""
    symbols = ir.get("symbols") or [{"id": "?", "weight": 1}]
    weights = [int(s.get("weight", 1)) for s in symbols]
    total_w = sum(weights)
    ids = [str(s.get("id", "?")) for s in symbols]
    reels = int(ir.get("topology", {}).get("reels", 5))
    rows = int(ir.get("topology", {}).get("rows", 3))

    state = seed & 0xffffffff
    grid: list[list[str]] = []
    for _r in range(reels):
        col: list[str] = []
        for _y in range(rows):
            u, state = _mulberry32(state)
            pick = u % total_w
            cum = 0
            chosen = ids[-1]
            for i, w in enumerate(weights):
                cum += w
                if pick < cum:
                    chosen = ids[i]
                    break
            col.append(chosen)
        grid.append(col)
    return grid


def _evaluate_lines(grid: list[list[str]], ir: dict[str, Any]) -> tuple[list[dict[str, Any]], float]:
    """Cheap straight-line eval across `paylines` middle rows.

    For the synthetic harness we evaluate ONE payline (middle row) — that
    keeps engine_spin O(1) and the load-test number reproducible.
    """
    if not grid:
        return [], 0.0
    rows_count = len(grid[0])
    middle = rows_count // 2
    line = [col[middle] for col in grid]

    lines_won: list[dict[str, Any]] = []
    total = 0.0
    for entry in ir.get("paytable", []):
        combo = entry.get("combo", [])
        if not isinstance(combo, list):
            continue
        match = True
        match_len = 0
        for sym, c in zip(line, combo, strict=False):
            if c == "-" or c == "*":
                continue
            if sym != c:
                match = False
                break
            match_len += 1
        if match and match_len > 0:
            pay = float(entry.get("pays", 0))
            lines_won.append({"line": 0, "combo": combo, "pay": pay})
            total += pay
    return lines_won, total


def engine_spin(
    ir: dict[str, Any],
    request: SpinRequest,
    server_seed_hex: str,
    *,
    running_total_payout: float = 0.0,
    running_total_bet: float = 0.0,
) -> SpinResult:
    """Deterministic one-spin evaluation.

    Returns SpinResult with:
        symbols           grid filled from seeded weighted-sample
        lines_won         winning lines on middle payline
        total_payout      Σ pays of winning lines × bet
        rtp_running       updated running RTP after this spin
        spin_hash_hex     SHA-256 of canonical (request, result) bytes
    """
    seed = derive_spin_seed(server_seed_hex, request.client_seed, request.nonce)
    grid = _spin_grid(ir, seed)
    lines_won, base_pay = _evaluate_lines(grid, ir)
    total_payout = base_pay * request.bet_amount

    new_total_payout = running_total_payout + total_payout
    new_total_bet = running_total_bet + request.bet_amount
    rtp_running = new_total_payout / new_total_bet if new_total_bet > 0 else 0.0

    # Spin commitment hash
    canonical = json.dumps(
        {
            "request_id": request.request_id,
            "session_id": request.session_id,
            "client_seed": request.client_seed,
            "nonce": request.nonce,
            "bet": request.bet_amount,
            "grid": grid,
            "total_payout": total_payout,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    spin_hash = hashlib.sha256(b"\x00" + canonical).hexdigest()

    return SpinResult(
        symbols=grid,
        lines_won=lines_won,
        total_payout=round(total_payout, 6),
        rtp_running=round(rtp_running, 6),
        spin_hash_hex=spin_hash,
    )
