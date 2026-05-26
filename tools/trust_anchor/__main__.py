"""W72 — slot-trust-anchor CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.trust_anchor.anchor import (
    record_revocation,
    rotate_anchor,
    verify_rotation,
)


def cmd_rotate(args) -> int:
    res = rotate_anchor(
        old_master_private_pem=args.old_private,
        out_dir=args.out_dir,
        overlap_days=args.overlap_days,
        notes=args.note or [],
    )
    sys.stdout.write(json.dumps(res.to_dict(), indent=2) + "\n")
    return 0


def cmd_revoke(args) -> int:
    log = record_revocation(
        args.log,
        plugin_id=args.plugin_id,
        version=args.version,
        reason=args.reason or "",
    )
    sys.stdout.write(json.dumps(log.to_dict(), indent=2) + "\n")
    return 0


def cmd_verify(args) -> int:
    rep = verify_rotation(
        manifest_path=args.manifest,
        old_master_public_pem=args.old_public,
        new_master_public_pem=args.new_public,
    )
    sys.stdout.write(json.dumps(rep, indent=2) + "\n")
    return 0 if rep.get("passed") else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="slot-trust-anchor")
    sub = p.add_subparsers(dest="cmd", required=True)

    pr = sub.add_parser("rotate")
    pr.add_argument("--old-private", type=Path, required=True)
    pr.add_argument("--out-dir", type=Path, required=True)
    pr.add_argument("--overlap-days", type=int, default=30)
    pr.add_argument("--note", action="append")
    pr.set_defaults(func=cmd_rotate)

    pv = sub.add_parser("revoke")
    pv.add_argument("--log", type=Path, required=True)
    pv.add_argument("--plugin-id", required=True)
    pv.add_argument("--version", required=True)
    pv.add_argument("--reason", default="")
    pv.set_defaults(func=cmd_revoke)

    pverify = sub.add_parser("verify")
    pverify.add_argument("--manifest", type=Path, required=True)
    pverify.add_argument("--old-public", type=Path, required=True)
    pverify.add_argument("--new-public", type=Path, required=True)
    pverify.set_defaults(func=cmd_verify)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
