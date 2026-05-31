"""SLOT-MATH Faza 6.6 — Provably-fair chain across full spin sequence.

Per-spin entry chains by hash: entry[i].prev_hash = sha256(entry[i-1]).
Any tampering with one spin breaks the chain from that point forward.
Regulator can re-verify entire session by walking the chain.

Extends Stake-style single-spin provably-fair to full session continuity.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass


_ZERO_HASH = "0" * 64


@dataclass(frozen=True)
class ChainEntry:
    seq: int
    spin_seed: int
    payout_x: float
    prev_hash: str
    current_hash: str


def _hash_entry(seq: int, spin_seed: int, payout_x: float, prev_hash: str) -> str:
    payload = json.dumps(
        {"seq": seq, "spin_seed": spin_seed, "payout_x": payout_x, "prev": prev_hash},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def new_chain() -> list[ChainEntry]:
    """Start an empty chain (no genesis entry; first append uses ZERO_HASH)."""
    return []


def append_spin_to_chain(
    chain: list[ChainEntry],
    spin_seed: int,
    payout_x: float,
) -> ChainEntry:
    """Append one spin; returns the new entry. Mutates chain in place."""
    seq = len(chain)
    prev = chain[-1].current_hash if chain else _ZERO_HASH
    entry = ChainEntry(
        seq=seq,
        spin_seed=spin_seed,
        payout_x=payout_x,
        prev_hash=prev,
        current_hash=_hash_entry(seq, spin_seed, payout_x, prev),
    )
    chain.append(entry)
    return entry


def verify_chain(chain: list[ChainEntry]) -> tuple[bool, int]:
    """Walk chain; return (ok, first_bad_seq).

    first_bad_seq = -1 if all entries verify.
    """
    prev = _ZERO_HASH
    for i, e in enumerate(chain):
        if e.seq != i:
            return False, i
        if e.prev_hash != prev:
            return False, i
        recomputed = _hash_entry(e.seq, e.spin_seed, e.payout_x, e.prev_hash)
        if recomputed != e.current_hash:
            return False, i
        prev = e.current_hash
    return True, -1


def chain_to_jsonl(chain: list[ChainEntry]) -> str:
    """Serialize chain as newline-delimited JSON for audit log storage."""
    return "\n".join(
        json.dumps(asdict(e), sort_keys=True, separators=(",", ":")) for e in chain
    )
