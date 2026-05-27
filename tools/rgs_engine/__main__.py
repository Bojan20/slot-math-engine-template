"""PHASE 12 — `rgs-engine` CLI.

Subcommands:

  serve <ir.json> [--host 127.0.0.1] [--port 0] [--quiet]
      Boot the spin server on `host:port`. Prints the bound port on
      stdout (useful when port=0 = auto-allocate). Runs until Ctrl-C.

  load-test <ir.json> [--clients N] [--spins M] [--bet B]
                       [--out-md PATH] [--out-json PATH] [--quiet]
      Spin up an in-process server, drive N concurrent clients each
      emitting M spins, print the load-test report.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from tools.rgs_engine.load_test import run_load_test
from tools.rgs_engine.server import RgsServer


def _load_ir(path: str) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"IR not found: {p}")
    return json.loads(p.read_text())


# ─── serve ────────────────────────────────────────────────────────────────


async def _serve(args: argparse.Namespace) -> int:
    ir = _load_ir(args.ir)
    srv = RgsServer(ir)
    server = await srv.serve(host=args.host, port=args.port)
    bound = server.sockets[0].getsockname() if server.sockets else (args.host, args.port)
    if not args.quiet:
        print(f"[rgs-engine] listening on {bound[0]}:{bound[1]}")
    try:
        async with server:
            await server.serve_forever()
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    return asyncio.run(_serve(args))


# ─── load-test ────────────────────────────────────────────────────────────


async def _load_test(args: argparse.Namespace) -> int:
    ir = _load_ir(args.ir)
    srv = RgsServer(ir)
    server = await srv.serve(host="127.0.0.1", port=0)
    host, port = server.sockets[0].getsockname()[:2]
    try:
        report = await run_load_test(
            host=host,
            port=int(port),
            n_clients=args.clients,
            spins_per_client=args.spins,
            bet=args.bet,
        )
    finally:
        server.close()
        await server.wait_closed()

    if args.out_md:
        Path(args.out_md).write_text(report.to_markdown())
    if args.out_json:
        Path(args.out_json).write_text(json.dumps(report.to_dict(), indent=2))
    if not args.quiet:
        print(report.to_markdown())
    return 0 if report.spins_failed == 0 else 1


def cmd_load_test(args: argparse.Namespace) -> int:
    return asyncio.run(_load_test(args))


# ─── main ─────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="rgs-engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("serve", help="run the spin server")
    sp.add_argument("ir", help="path to *.slot-sim.ir.json")
    sp.add_argument("--host", default="127.0.0.1")
    sp.add_argument("--port", type=int, default=0)
    sp.add_argument("--quiet", action="store_true")
    sp.set_defaults(func=cmd_serve)

    lp = sub.add_parser("load-test", help="run the load-test harness")
    lp.add_argument("ir", help="path to *.slot-sim.ir.json")
    lp.add_argument("--clients", type=int, default=16, help="concurrent clients")
    lp.add_argument("--spins", type=int, default=200, help="spins per client")
    lp.add_argument("--bet", type=float, default=1.0)
    lp.add_argument("--out-md", default=None)
    lp.add_argument("--out-json", default=None)
    lp.add_argument("--quiet", action="store_true")
    lp.set_defaults(func=cmd_load_test)

    args = p.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
