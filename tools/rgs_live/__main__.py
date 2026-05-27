"""PHASE 12 — `slot-rgs-live` CLI.

Subcommands:
    serve       run asyncio TCP spin server
    load-test   in-process throughput / latency benchmark
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from tools.crypto_fair.fair_chain import commit_server_seed
from tools.rgs_live.engine import default_synthetic_ir
from tools.rgs_live.load_test import run_load_test, load_test_as_dict
from tools.rgs_live.server import SpinServer


def cmd_serve(args: argparse.Namespace) -> int:
    if args.ir:
        ir = json.loads(Path(args.ir).read_text())
    else:
        ir = default_synthetic_ir()

    if args.server_seed:
        commit, seed = args.server_seed.split(":") if ":" in args.server_seed else ("", args.server_seed)
        seed_hex = seed
    else:
        commit, seed_hex = commit_server_seed()

    server = SpinServer(server_seed_hex=seed_hex, ir=ir)

    async def serve():
        tcp = await asyncio.start_server(
            server.handle_client, args.host, args.port,
        )
        addr = tcp.sockets[0].getsockname()
        if not args.quiet:
            print(f"[slot-rgs-live] listening on {addr[0]}:{addr[1]}")
            print(f"  server_seed_commit: {server.server_seed_commit}")
        async with tcp:
            await tcp.serve_forever()

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        if not args.quiet:
            print("[slot-rgs-live] stopped")
    return 0


def cmd_load_test(args: argparse.Namespace) -> int:
    ir = None
    if args.ir:
        ir = json.loads(Path(args.ir).read_text())
    result = run_load_test(
        spins=args.spins,
        session_count=args.sessions,
        bet_amount=args.bet,
        ir=ir,
    )
    d = load_test_as_dict(result)
    if args.json:
        print(json.dumps(d, indent=2))
    else:
        print(f"[load-test] spins={result.total_spins}")
        print(f"  elapsed:        {result.elapsed_seconds:.4f} s")
        print(f"  throughput:     {result.throughput_spins_per_sec:,.0f} spins/sec")
        print(f"  avg latency:    {result.avg_latency_us:.2f} µs")
        print(f"  p50 / p95 / p99: {result.p50_latency_us} / {result.p95_latency_us} / {result.p99_latency_us} µs")
        print(f"  max latency:    {result.max_latency_us} µs")
        print(f"  errors:         {result.errors}")
        print(f"  commit:         {result.server_seed_commit}")
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(d, indent=2))
        if not args.quiet:
            print(f"  json saved:     {args.out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-rgs-live",
        description="PHASE 12 — Real-Time RGS Live Engine.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_serve = sub.add_parser("serve", help="Run asyncio TCP spin server.")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=7777)
    p_serve.add_argument("--ir", help="Path to IR JSON; default synthetic.")
    p_serve.add_argument("--server-seed",
                          help="Server seed hex; default random commit.")
    p_serve.add_argument("--quiet", action="store_true")
    p_serve.set_defaults(func=cmd_serve)

    p_lt = sub.add_parser("load-test", help="In-process throughput benchmark.")
    p_lt.add_argument("--spins", type=int, default=10_000)
    p_lt.add_argument("--sessions", type=int, default=1)
    p_lt.add_argument("--bet", type=float, default=1.0)
    p_lt.add_argument("--ir", help="Path to IR JSON; default synthetic.")
    p_lt.add_argument("--json", action="store_true",
                       help="Emit full JSON to stdout.")
    p_lt.add_argument("--out", help="Persist JSON to this path.")
    p_lt.add_argument("--quiet", action="store_true")
    p_lt.set_defaults(func=cmd_load_test)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
