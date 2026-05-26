"""P5.9 — slot-studio-e2e CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.studio_e2e.emitter import write_studio_e2e


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-studio-e2e",
        description="Emit a Playwright E2E test suite for a Studio "
                    "scaffold (P5.9 codegen). The generator is pure-Python; "
                    "running the suite requires `npm install` + "
                    "`npx playwright install` separately.",
    )
    p.add_argument("--out", required=True, help="suite output directory")
    p.add_argument("--slug", required=True, help="game slug (matches Studio)")
    p.add_argument("--studio-url", default=None,
                   help="optional base URL hint baked into README")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    artifacts = write_studio_e2e(
        Path(args.out),
        slug=args.slug,
        studio_url=args.studio_url,
    )
    payload = artifacts.to_dict()
    if args.json:
        sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    else:
        sys.stdout.write(f"[studio-e2e] wrote suite to {artifacts.out_dir}\n")
        for k, v in payload.items():
            sys.stdout.write(f"  {k}: {v}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
