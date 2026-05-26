"""CLI entry for slot-ir-lock.

Two modes:

    slot-ir-lock lock   <ir.json> [--out <ir.lock.json>] [--key <pem>]
    slot-ir-lock verify <ir.json> [--lock <ir.lock.json>]

Exit codes:
    0  — success (lock written / verify passed)
    1  — verify failed (IR mismatch / signature invalid)
    2  — IO / configuration error
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.ir_lock.lock import (
    load_lock,
    lock_ir,
    save_lock,
    verify_ir,
)


def _cmd_lock(args: argparse.Namespace) -> int:
    try:
        ir = json.loads(Path(args.ir_path).read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2
    key_pem = None
    if args.key:
        key_pem = Path(args.key).read_bytes()
    lock = lock_ir(ir, ir_path=str(args.ir_path), private_key_pem=key_pem)
    out_path = Path(args.out) if args.out else Path(
        str(args.ir_path) + ".lock.json"
    )
    save_lock(lock, out_path)
    sys.stdout.write(
        f"wrote {out_path}\n"
        f"  ir_sha256:   {lock.ir_sha256}\n"
        f"  merkle_root: {lock.merkle_root}\n"
        f"  subtrees:    {len(lock.subtrees)}\n"
    )
    return 0


def _cmd_verify(args: argparse.Namespace) -> int:
    try:
        ir = json.loads(Path(args.ir_path).read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2
    lock_path = Path(args.lock) if args.lock else Path(
        str(args.ir_path) + ".lock.json"
    )
    try:
        lock = load_lock(lock_path)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read lock: {e}\n")
        return 2
    result = verify_ir(ir, lock)
    if args.json:
        sys.stdout.write(json.dumps(result.to_dict(), indent=2,
                                      sort_keys=True) + "\n")
    else:
        verdict = "PASSED" if result.passed else "FAILED"
        sys.stdout.write(
            f"verify {verdict}\n"
            f"  ir_hash_match:    {result.ir_hash_match}\n"
            f"  signature_valid:  {result.signature_valid}\n"
            f"  merkle_root:      {result.merkle_root_recomputed}\n"
        )
        for m in result.mismatches:
            sys.stdout.write(f"  ↳ {m}\n")
    return 0 if result.passed else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-ir-lock",
        description=(
            "Sign / verify a universal IR file. Emits a sidecar "
            "<ir>.lock.json containing per-subtree SHA-256 inventory, "
            "RFC-6962 Merkle root, and an ed25519 signature."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser("lock", help="lock + sign an IR")
    pl.add_argument("ir_path", type=Path)
    pl.add_argument("--out", type=Path, default=None)
    pl.add_argument("--key", type=Path, default=None,
                    help="ed25519 PEM private key (else ephemeral)")
    pl.set_defaults(handler=_cmd_lock)

    pv = sub.add_parser("verify", help="verify an IR against its lock")
    pv.add_argument("ir_path", type=Path)
    pv.add_argument("--lock", type=Path, default=None)
    pv.add_argument("--json", action="store_true")
    pv.set_defaults(handler=_cmd_verify)

    args = p.parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
