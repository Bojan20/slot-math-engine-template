"""CLI entry for slot-plugin-bundle."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.plugin_bundle.bundler import build_bundle, inspect_bundle


def _cmd_build(args: argparse.Namespace) -> int:
    key_pem = None
    if args.sign_key:
        key_pem = Path(args.sign_key).read_bytes()
    try:
        bundle = build_bundle(
            plugin_id=args.id,
            name=args.name,
            version=args.version,
            out_dir=args.out,
            games_dir=args.games,
            tools_dir=args.tools,
            profiles_dir=args.profiles,
            description=args.description or "",
            author=args.author or "",
            license_str=args.license or "proprietary",
            kind=args.kind,
            sign_with_pem=key_pem,
        )
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"build failed: {e}\n")
        return 2
    sys.stdout.write(
        f"wrote {bundle.zip_path}\n"
        f"  body_sha256: {bundle.body_sha256}\n"
        f"  files:       {len(bundle.manifest.files)}\n"
        f"  signed:      {'yes' if bundle.signature else 'no'}\n"
    )
    return 0


def _cmd_inspect(args: argparse.Namespace) -> int:
    try:
        out = inspect_bundle(args.zip_path)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"inspect failed: {e}\n")
        return 2
    if args.json:
        sys.stdout.write(json.dumps(out, indent=2, sort_keys=True) + "\n")
    else:
        m = out["manifest"]
        sys.stdout.write(
            f"plugin: {m['id']} v{m['version']} ({m['kind']})\n"
            f"  files:       {len(m.get('files') or {})}\n"
            f"  body_sha256: {out['body_sha256']}\n"
            f"  passed:      {out['passed']}\n"
        )
        for m_ in out["mismatches"]:
            sys.stdout.write(f"  🔴 {m_}\n")
    return 0 if out["passed"] else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-plugin-bundle",
        description=(
            "Pack a slot-math plugin (games + tools + profiles) into a "
            "versioned ZIP for marketplace upload."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pb = sub.add_parser("build")
    pb.add_argument("--id", required=True)
    pb.add_argument("--name", required=True)
    pb.add_argument("--version", required=True, help="SemVer 2.0.0")
    pb.add_argument("--out", required=True, type=Path)
    pb.add_argument("--games", type=Path, default=None)
    pb.add_argument("--tools", type=Path, default=None)
    pb.add_argument("--profiles", type=Path, default=None)
    pb.add_argument("--description", default="")
    pb.add_argument("--author", default="")
    pb.add_argument("--license", default="proprietary")
    pb.add_argument("--kind", default="slot-game",
                     choices=("slot-game", "tool", "profile-pack"))
    pb.add_argument("--sign-key", type=Path, default=None,
                     help="ed25519 PEM private key (optional)")
    pb.set_defaults(handler=_cmd_build)

    pi = sub.add_parser("inspect")
    pi.add_argument("zip_path", type=Path)
    pi.add_argument("--json", action="store_true")
    pi.set_defaults(handler=_cmd_inspect)

    args = p.parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
