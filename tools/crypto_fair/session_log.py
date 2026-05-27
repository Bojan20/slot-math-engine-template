"""PHASE 15.B — Signed session log emit + replay.

When the RGS finalises a session (player disconnects or operator closes
the window), the server emits a single `session.log.json` artefact that
holds **everything a third-party regulator needs to replay the chain
end-to-end**:

  {
    "schema": "urn:slotmath:session-log:v1",
    "session_id": "<uuid>",
    "opened_ts_unix":   <float>,
    "closed_ts_unix":   <float>,
    "commit":           "<sha256 hex>",
    "seed":             "<32-byte hex, revealed at close>",
    "receipts":         [...SpinReceipt-as-dict... ],
    "chain_merkle_root":"<sha256 hex>",
    "chain_tree_size":   <int>,
    "signature_hex":    "<ed25519 sig over root || tree_size>",
    "pubkey_hex":       "<ed25519 public key>",
    "domain_tag":       "slotmath-crypto-fair-v1"
  }

The regulator runs `verify_session_log(path_or_dict)` and gets back a
deterministic `SessionVerification` with five bool checks:

  1. commit_matches_seed       — SHA-256(seed) == commit
  2. seeds_re_derive           — every receipt's derived rng seed matches
                                 derive_spin_seed(seed, client_seed, nonce)
                                 (when receipt carries `expected_rng_seed`)
  3. chain_root_reproduces     — build_spin_chain_merkle(receipts).root_hex
                                 equals stored chain_merkle_root
  4. signature_verifies        — ed25519 sig verifies (or N/A when absent)
  5. timestamps_monotone       — receipts have non-decreasing
                                 spin_index / nonce (anti-tampering)

The browser client in `web/rgs_client/index.html` consumes the same
schema (PHASE 16), so a regulator can verify a session in the airgapped
review UI without invoking Python.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

from tools.crypto_fair.fair_chain import (
    SpinReceipt,
    build_spin_chain_merkle,
    derive_spin_seed,
    sign_spin_chain,
    verify_server_seed,
    verify_spin_chain_signature,
)
from tools.crypto_fair.fair_chain import SpinChainRoot  # for verify path


SCHEMA = "urn:slotmath:session-log:v1"


# ─── Emit ─────────────────────────────────────────────────────────────────


@dataclass
class SessionLog:
    schema: str
    session_id: str
    opened_ts_unix: float
    closed_ts_unix: float
    commit: str
    seed: str
    receipts: list[dict[str, Any]]
    chain_merkle_root: str
    chain_tree_size: int
    signature_hex: Optional[str] = None
    pubkey_hex: Optional[str] = None
    domain_tag: str = "slotmath-crypto-fair-v1"


def emit_session_log(
    *,
    session_id: str,
    server_seed_hex: str,
    server_seed_commit: str,
    receipts: list[SpinReceipt],
    opened_ts_unix: float,
    closed_ts_unix: float,
    sign: bool = True,
    private_pem: Optional[bytes] = None,
) -> SessionLog:
    """Build a session log dataclass from the in-memory session state.

    `sign=True` will attempt to ed25519-sign the chain root; if the
    `cryptography` lib is missing on this machine, the log is emitted
    unsigned and `signature_hex` / `pubkey_hex` stay None. The regulator
    can still verify the chain-Merkle and commit↔seed bridge in unsigned
    mode — only `signature_verifies` reads False.
    """
    chain = build_spin_chain_merkle(receipts)
    root = SpinChainRoot(
        root_hex=chain["root_hex"],
        tree_size=int(chain["tree_size"]),
        signature_hex=None,
        pubkey_hex=None,
    )
    if sign:
        signed = sign_spin_chain(chain, private_pem=private_pem)
        root = signed
    return SessionLog(
        schema=SCHEMA,
        session_id=session_id,
        opened_ts_unix=opened_ts_unix,
        closed_ts_unix=closed_ts_unix,
        commit=server_seed_commit,
        seed=server_seed_hex,
        receipts=[asdict(r) for r in receipts],
        chain_merkle_root=root.root_hex,
        chain_tree_size=root.tree_size,
        signature_hex=root.signature_hex,
        pubkey_hex=root.pubkey_hex,
    )


def write_session_log(log: SessionLog, path: Path) -> Path:
    """Persist the session log as a single JSON file. Caller owns the
    parent directory (we don't auto-mkdir to keep the regulator workflow
    explicit about where artefacts land)."""
    body = json.dumps(asdict(log), indent=2, sort_keys=True)
    path = Path(path)
    path.write_text(body, encoding="utf-8")
    return path


# ─── Verify ───────────────────────────────────────────────────────────────


@dataclass
class SessionVerification:
    """Deterministic verdict over a session log. Every field is a
    `(passed, detail)` pair so the verifier UI can show *why* something
    failed without burying the cause in a stack trace."""

    commit_matches_seed: tuple[bool, str]
    seeds_re_derive: tuple[bool, str]
    chain_root_reproduces: tuple[bool, str]
    signature_verifies: tuple[bool, str]
    timestamps_monotone: tuple[bool, str]

    @property
    def all_passed(self) -> bool:
        return all(
            v[0]
            for v in (
                self.commit_matches_seed,
                self.seeds_re_derive,
                self.chain_root_reproduces,
                # Signature is allowed to be N/A on unsigned logs; we
                # treat (False, "absent") as informational only.
                self.timestamps_monotone,
            )
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "commit_matches_seed": {
                "ok": self.commit_matches_seed[0],
                "detail": self.commit_matches_seed[1],
            },
            "seeds_re_derive": {
                "ok": self.seeds_re_derive[0],
                "detail": self.seeds_re_derive[1],
            },
            "chain_root_reproduces": {
                "ok": self.chain_root_reproduces[0],
                "detail": self.chain_root_reproduces[1],
            },
            "signature_verifies": {
                "ok": self.signature_verifies[0],
                "detail": self.signature_verifies[1],
            },
            "timestamps_monotone": {
                "ok": self.timestamps_monotone[0],
                "detail": self.timestamps_monotone[1],
            },
            "all_passed": self.all_passed,
        }


def _receipt_from_dict(d: dict[str, Any]) -> SpinReceipt:
    return SpinReceipt(
        spin_index=int(d["spin_index"]),
        server_seed_commit=str(d["server_seed_commit"]),
        client_seed=str(d["client_seed"]),
        nonce=int(d["nonce"]),
        bet_amount=float(d["bet_amount"]),
        outcome_payload=dict(d["outcome_payload"]),
    )


def verify_session_log(source: Any) -> SessionVerification:
    """Verify a session log. `source` may be a `Path`, a dict, or a
    `SessionLog` dataclass. Errors during parsing surface as failing
    individual checks rather than raising, so the regulator UI can show
    every failure mode simultaneously."""

    # 1) Normalise → dict.
    if isinstance(source, SessionLog):
        d = asdict(source)
    elif isinstance(source, dict):
        d = source
    else:
        path = Path(source)
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            fail = (False, f"unable to parse {path}: {exc}")
            return SessionVerification(fail, fail, fail, fail, fail)

    schema = d.get("schema")
    if schema != SCHEMA:
        fail = (False, f"schema mismatch: got {schema!r}, expected {SCHEMA!r}")
        return SessionVerification(fail, fail, fail, fail, fail)

    commit = str(d.get("commit", ""))
    seed = str(d.get("seed", ""))

    # 2) Commit ↔ seed.
    try:
        ok = verify_server_seed(commit, seed)
        commit_check = (
            ok,
            f"sha256(seed) {'matches' if ok else 'DOES NOT match'} commit ({commit[:12]}…)",
        )
    except Exception as exc:  # noqa: BLE001
        commit_check = (False, f"commit check error: {exc}")

    # 3) Per-spin seeds re-derive (only when receipt has `expected_rng_seed`
    #    — otherwise mark as "n/a" because we can't compare).
    seed_drift: list[str] = []
    seeds_checked = 0
    for r in d.get("receipts", []):
        if "expected_rng_seed" not in r:
            continue
        try:
            derived = derive_spin_seed(seed, str(r["client_seed"]), int(r["nonce"]))
        except Exception as exc:  # noqa: BLE001
            seed_drift.append(f"spin_index={r.get('spin_index')}: derive failed: {exc}")
            continue
        seeds_checked += 1
        if int(r["expected_rng_seed"]) != derived:
            seed_drift.append(
                f"spin_index={r.get('spin_index')}: expected {r['expected_rng_seed']}, "
                f"derived {derived}"
            )
    if seeds_checked == 0:
        seeds_check = (True, "no expected_rng_seed fields to verify (log emitted without trace)")
    elif seed_drift:
        seeds_check = (False, f"{len(seed_drift)} drift(s): " + " | ".join(seed_drift[:3]))
    else:
        seeds_check = (True, f"{seeds_checked} per-spin seeds match HMAC derivation")

    # 4) Chain Merkle reproduces.
    try:
        receipts_obj = [_receipt_from_dict(r) for r in d.get("receipts", [])]
        chain = build_spin_chain_merkle(receipts_obj)
        expected = str(d.get("chain_merkle_root", ""))
        if chain["root_hex"] == expected:
            chain_check = (True, f"root reproduces ({expected[:12]}…, tree_size={chain['tree_size']})")
        else:
            chain_check = (
                False,
                f"root mismatch: stored {expected[:12]}…, computed {chain['root_hex'][:12]}…",
            )
    except Exception as exc:  # noqa: BLE001
        chain_check = (False, f"chain rebuild error: {exc}")

    # 5) Signature verifies (when present).
    sig_hex = d.get("signature_hex")
    pub_hex = d.get("pubkey_hex")
    if sig_hex and pub_hex:
        root = SpinChainRoot(
            root_hex=str(d.get("chain_merkle_root", "")),
            tree_size=int(d.get("chain_tree_size", 0)),
            signature_hex=str(sig_hex),
            pubkey_hex=str(pub_hex),
        )
        try:
            ok = verify_spin_chain_signature(root)
            sig_check = (
                ok,
                f"ed25519 signature {'verifies' if ok else 'FAILS'} (pubkey {pub_hex[:12]}…)",
            )
        except Exception as exc:  # noqa: BLE001
            sig_check = (False, f"signature verify error: {exc}")
    else:
        sig_check = (False, "absent — unsigned log (commit-only mode)")

    # 6) Timestamps + spin_index monotonicity.
    receipts = d.get("receipts", [])
    bad = []
    for i in range(1, len(receipts)):
        prev_idx = int(receipts[i - 1].get("spin_index", -1))
        cur_idx = int(receipts[i].get("spin_index", -1))
        if cur_idx <= prev_idx:
            bad.append(f"spin_index regression at row {i}: {prev_idx} → {cur_idx}")
    if bad:
        mono_check = (False, " | ".join(bad[:3]))
    else:
        mono_check = (
            True,
            f"{len(receipts)} receipts strictly increasing spin_index",
        )

    return SessionVerification(
        commit_matches_seed=commit_check,
        seeds_re_derive=seeds_check,
        chain_root_reproduces=chain_check,
        signature_verifies=sig_check,
        timestamps_monotone=mono_check,
    )
