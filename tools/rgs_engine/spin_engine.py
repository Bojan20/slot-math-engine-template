"""PHASE 12 — Deterministic in-process spin engine.

A thin, allocation-light spin core that:

  1. Derives a per-spin 64-bit RNG seed from the PHASE 15 crypto-fair
     commit/reveal chain (`server_seed_hex` + `client_seed` + `nonce`).
  2. Runs one spin against a slot-sim IR using a vendor-neutral
     Mulberry32 PRNG (bit-identical to the TS / Rust kernels).
  3. Emits a structured `SpinOutcome` (grid + payouts + features) plus
     the canonical PHASE 15 `SpinReceipt` so the RGS server can chain
     every spin into the Merkle audit trail.

The engine is **synchronous + thread-safe** — no shared mutable state,
no allocations on the hot path beyond the grid array. The asyncio
server (`tools.rgs_engine.server`) wraps it with `run_in_executor`
so the event loop never blocks on a long spin.

This implementation deliberately avoids importing the full TS / Rust
universal IR evaluator: those crates require Node / cargo at runtime.
Instead we model the canonical IR slice the cert pipeline produces
(symbols + reels + paytable + paylines) and re-implement the small
linear-pays evaluator in pure Python. End-to-end determinism is
verified by the regression tests against the same IR's `theoretical_rtp`
output (within tail-noise tolerance for short-MC runs).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from tools.crypto_fair.fair_chain import SpinReceipt, derive_spin_seed


# ─── PRNG — Mulberry32 (bit-identical to TS / Rust kernels) ────────────────


class Mulberry32:
    """Tiny PRNG used by the TS / Rust slot-sim cores. Identical state +
    next-u32 layout so a spin emitted by this engine can be byte-replayed
    by either kernel given the same seed."""

    __slots__ = ("_state",)

    def __init__(self, seed: int) -> None:
        self._state = seed & 0xFFFFFFFF

    def next_u32(self) -> int:
        self._state = (self._state + 0x6D2B79F5) & 0xFFFFFFFF
        z = self._state
        z = ((z ^ (z >> 15)) * (z | 1)) & 0xFFFFFFFF
        z = (z ^ (z + ((z ^ (z >> 7)) * (z | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return (z ^ (z >> 14)) & 0xFFFFFFFF

    def next_float(self) -> float:
        # Uniform on [0, 1) with 32-bit resolution — matches TS engine.
        return self.next_u32() / 0x1_0000_0000


# ─── Reel sampling ─────────────────────────────────────────────────────────


def _weighted_pick(rng: Mulberry32, weights: list[float]) -> int:
    """Pick an index in proportion to `weights`. O(n) draw; n ≤ ~24 in
    real PARs so this is fast enough at >100k spins/sec on M2 Max."""
    total = sum(weights)
    if total <= 0:
        return 0
    u = rng.next_float() * total
    acc = 0.0
    for i, w in enumerate(weights):
        acc += w
        if u < acc:
            return i
    return len(weights) - 1


def _sample_reels(rng: Mulberry32, ir: dict[str, Any]) -> list[list[str]]:
    """Return a `reels × rows` grid of symbol IDs. Falls back to a
    deterministic round-robin when IR has no `reels.base` weights, which
    keeps the engine usable on minimal smoke IRs."""
    topology = ir.get("topology", {})
    rows = int(topology.get("rows", 3))
    reels_n = int(topology.get("reels", 5))
    reels_cfg = ir.get("reels", {})
    base = reels_cfg.get("base") if isinstance(reels_cfg, dict) else None
    symbols = [s.get("id") for s in ir.get("symbols", []) if isinstance(s, dict)]
    if not symbols:
        symbols = [f"S{i}" for i in range(8)]

    grid: list[list[str]] = []
    if isinstance(base, list) and len(base) == reels_n and all(isinstance(d, dict) for d in base):
        # Weighted reel strips per the IR.
        for reel_idx in range(reels_n):
            weights_map = base[reel_idx]
            wsyms = list(weights_map.keys())
            wvals = [float(weights_map[s]) for s in wsyms]
            col: list[str] = []
            for _ in range(rows):
                idx = _weighted_pick(rng, wvals)
                col.append(wsyms[idx])
            grid.append(col)
    else:
        # Deterministic uniform fallback over the symbol list.
        for _ in range(reels_n):
            col = [symbols[rng.next_u32() % len(symbols)] for _ in range(rows)]
            grid.append(col)
    return grid


# ─── Paytable evaluation ───────────────────────────────────────────────────


def _evaluate_paylines(grid: list[list[str]], ir: dict[str, Any], bet: float) -> tuple[float, list[dict[str, Any]]]:
    """Score the grid against IR paytable + paylines. Linear pays only —
    matches the W6.2 baseline IR shape. Returns (total_pay, hits)."""
    paytable = ir.get("paytable") or []
    paylines = ir.get("paylines") or []
    wild_id: Optional[str] = None
    for s in ir.get("symbols", []):
        if isinstance(s, dict) and s.get("kind") == "wild":
            wild_id = s.get("id")
            break

    hits: list[dict[str, Any]] = []
    total_pay = 0.0
    # Build a fast lookup: payout per (symbol_id, run_length).
    pay_index: dict[tuple[str, int], float] = {}
    for row in paytable:
        if not isinstance(row, dict):
            continue
        sym = row.get("symbol")
        for k, v in row.items():
            if k == "symbol" or not isinstance(v, (int, float)):
                continue
            if k.startswith("pay"):
                try:
                    run = int(k[3:])
                except ValueError:
                    continue
                pay_index[(str(sym), run)] = float(v)

    for line_idx, line in enumerate(paylines):
        if not isinstance(line, list) or not line:
            continue
        # Walk symbols along the line; count the run starting at reel 0.
        line_syms: list[str] = []
        for reel_idx, row_pos in enumerate(line):
            if reel_idx >= len(grid):
                break
            col = grid[reel_idx]
            if not (0 <= int(row_pos) < len(col)):
                break
            line_syms.append(col[int(row_pos)])
        if not line_syms:
            continue
        first = line_syms[0]
        if wild_id is not None and first == wild_id:
            # Take the first non-wild as the run target.
            non_wild = next((s for s in line_syms if s != wild_id), wild_id)
            first = non_wild
        run = 0
        for s in line_syms:
            if s == first or (wild_id is not None and s == wild_id):
                run += 1
            else:
                break
        if run < 3:
            continue
        pay = pay_index.get((first, run)) or 0.0
        if pay <= 0:
            continue
        amount = pay * bet
        total_pay += amount
        hits.append({"line": line_idx, "symbol": first, "run": run, "pay": amount})
    return total_pay, hits


# ─── Data shapes ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SpinRequest:
    server_seed_hex: str
    client_seed: str
    nonce: int
    bet: float


@dataclass
class SpinOutcome:
    spin_index: int
    rng_seed: int
    grid: list[list[str]]
    total_pay: float
    hits: list[dict[str, Any]] = field(default_factory=list)
    receipt: Optional[SpinReceipt] = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "spin_index": self.spin_index,
            "rng_seed": self.rng_seed,
            "grid": self.grid,
            "total_pay": self.total_pay,
            "hits": list(self.hits),
        }


# ─── Public entry ──────────────────────────────────────────────────────────


def spin(ir: dict[str, Any], req: SpinRequest, *, server_seed_commit: str) -> SpinOutcome:
    """Run one deterministic spin.

    `server_seed_commit` is the SHA-256 of the server seed — published
    pre-session per PHASE 15 commit-reveal. We pass it through into the
    receipt so the chain Merkle can be assembled without the secret seed
    leaving this module.
    """
    if req.bet <= 0:
        raise ValueError("bet must be > 0")
    if req.nonce < 0:
        raise ValueError("nonce must be ≥ 0")
    seed = derive_spin_seed(req.server_seed_hex, req.client_seed, req.nonce)
    rng = Mulberry32(seed)
    grid = _sample_reels(rng, ir)
    total_pay, hits = _evaluate_paylines(grid, ir, req.bet)
    receipt = SpinReceipt(
        spin_index=req.nonce,
        server_seed_commit=server_seed_commit,
        client_seed=req.client_seed,
        nonce=req.nonce,
        bet_amount=req.bet,
        outcome_payload={"grid": grid, "total_pay": total_pay, "hits": hits},
    )
    return SpinOutcome(
        spin_index=req.nonce,
        rng_seed=seed,
        grid=grid,
        total_pay=total_pay,
        hits=hits,
        receipt=receipt,
    )
