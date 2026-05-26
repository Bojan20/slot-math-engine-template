"""CLI entry for slot-vendor-adapter."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.vendor_adapter import (
    DEFAULT_REGISTRY,
    detect_vendor,
    get as get_adapter,
    list_adapters,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-vendor-adapter",
        description="Vendor adapter SDK — list, detect, convert.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    sub_list = sub.add_parser("list", help="list registered adapters")
    sub_list.add_argument("--json", type=Path, default=None)

    sub_detect = sub.add_parser(
        "detect", help="sniff vendor_id from a raw PAR/spec file"
    )
    sub_detect.add_argument("path", type=Path)

    sub_conv = sub.add_parser(
        "convert", help="convert a PAR/spec to universal IR (via adapter)"
    )
    sub_conv.add_argument("path", type=Path)
    sub_conv.add_argument("--vendor", default=None,
                           help="force a specific vendor_id; else auto-detect")
    sub_conv.add_argument("--profile", type=Path, default=None)
    sub_conv.add_argument("--out", type=Path, default=None)

    args = p.parse_args(argv)

    if args.cmd == "list":
        adapters = list_adapters()
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(
                json.dumps([a.to_dict() for a in adapters], indent=2,
                            sort_keys=True)
            )
        sys.stdout.write(f"\n[vendor-adapter] {len(adapters)} registered\n")
        for a in adapters:
            sys.stdout.write(
                f"  • {a.vendor_id:12s} v{a.version}  {a.description}\n"
            )
        return 0

    if args.cmd == "detect":
        if not args.path.exists():
            sys.stderr.write(f"path not found: {args.path}\n")
            return 2
        vendor_id = detect_vendor(args.path.read_bytes())
        sys.stdout.write(f"{vendor_id or 'unknown'}\n")
        return 0 if vendor_id else 1

    if args.cmd == "convert":
        if not args.path.exists():
            sys.stderr.write(f"path not found: {args.path}\n")
            return 2
        raw = args.path.read_bytes()
        vendor_id = args.vendor or detect_vendor(raw)
        if not vendor_id:
            sys.stderr.write("could not detect vendor; pass --vendor explicitly\n")
            return 1
        try:
            adapter = get_adapter(vendor_id)
        except KeyError as e:
            sys.stderr.write(f"{e}\n")
            return 1
        profile: dict = {"vendor_id": vendor_id}
        if args.profile and args.profile.exists():
            try:
                profile.update(json.loads(args.profile.read_text()))
            except json.JSONDecodeError:
                profile["_profile_raw"] = args.profile.read_text()
        ir = adapter.convert(raw, profile)
        fp = adapter.fingerprint(ir)
        out_payload = {"adapter": vendor_id, "fingerprint": fp, "ir": ir}
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(
                json.dumps(out_payload, indent=2, sort_keys=True)
            )
        else:
            sys.stdout.write(json.dumps(out_payload, indent=2, sort_keys=True))
            sys.stdout.write("\n")
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
