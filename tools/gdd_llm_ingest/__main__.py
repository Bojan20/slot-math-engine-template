"""W6.2 — LLM-assisted NL → GDD CLI.

Usage::

    python3 -m tools.gdd_llm_ingest \
        "design a 96% RTP wolf-themed lines slot with hold-and-win Fireball" \
        --out tools/greenfield_demo/wolf_holdwin_llm.gdd

    # Force-mocked offline demo (no API key needed):
    python3 -m tools.gdd_llm_ingest --demo-corpus

When ``ANTHROPIC_API_KEY`` is missing the CLI prints a clear fallback
message and shells out to ``tools.gdd_nl_ingest`` (W6.1 deterministic
ingest).  Exit codes::

    0 — GDD written successfully (or fallback succeeded)
    1 — schema validation / IO failure
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from tools.gdd_llm_ingest.client import build_default_client
from tools.gdd_llm_ingest.demo_prompts import DEMO_PROMPTS
from tools.gdd_llm_ingest.ingest import generate_gdd
from tools.gdd_llm_ingest.prompt import DEFAULT_MODEL


def _print_fallback(prompt: str | None) -> int:
    print(
        "set ANTHROPIC_API_KEY to use W6.2; falling back to W6.1 "
        "deterministic ingest",
        file=sys.stderr,
    )
    argv = [sys.executable, "-m", "tools.gdd_nl_ingest"]
    if prompt:
        argv += ["--prompt", prompt]
    return subprocess.call(argv)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m tools.gdd_llm_ingest",
        description=(
            "W6.2 — Anthropic-Claude-backed NL → GDD ingestion.  "
            "Deterministic (temperature=0, top_k=1) + disk-cached + "
            "schema-validated."
        ),
    )
    parser.add_argument(
        "prompt", nargs="?",
        help="Free-form NL prompt (single positional argument).",
    )
    parser.add_argument(
        "--out", "-o",
        help="Path to write the generated GDD YAML.",
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL,
        help=f"Anthropic model id (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--demo-corpus", action="store_true",
        help=(
            "Run every bundled archetype prompt with the offline "
            "demo fallback (no API key required)."
        ),
    )
    parser.add_argument(
        "--no-cache", action="store_true",
        help="Disable read+write of the disk cache.",
    )
    parser.add_argument(
        "--force-fallback", action="store_true",
        help=(
            "Skip the LLM path and use the bundled W6.1 deterministic "
            "ingest instead.  Useful for offline testing."
        ),
    )
    args = parser.parse_args(argv)

    if args.force_fallback:
        return _print_fallback(args.prompt)

    if args.demo_corpus:
        out_dir = Path("reports") / "gdd-llm-cache" / "demo-corpus"
        out_dir.mkdir(parents=True, exist_ok=True)
        for arch, prompt in DEMO_PROMPTS.items():
            print(f"▶ archetype={arch}: {prompt[:60]!r}...", file=sys.stderr)
            res = generate_gdd(
                prompt,
                client=None,
                model=args.model,
                use_cache=not args.no_cache,
                allow_demo_fallback=True,
            )
            gdd_path = out_dir / f"demo-{arch}.gdd"
            gdd_path.write_text(res.gdd_yaml, encoding="utf-8")
            print(f"  → wrote {gdd_path}", file=sys.stderr)
        return 0

    if not args.prompt:
        parser.print_help()
        return 1

    client = build_default_client()
    if client is None:
        # No API key — fall back to W6.1 deterministic ingest.
        return _print_fallback(args.prompt)

    try:
        res = generate_gdd(
            args.prompt,
            client=client,
            model=args.model,
            use_cache=not args.no_cache,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"× LLM ingest failed: {exc}", file=sys.stderr)
        return 1

    out_path = Path(args.out) if args.out else None
    if out_path is None:
        out_path = (
            Path("tools") / "greenfield_demo"
            / f"llm-ingest-{res.payload['archetype']}.gdd"
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(res.gdd_yaml, encoding="utf-8")
    print(
        f"  → wrote GDD: {out_path}  "
        f"(cache_hit={res.cache_hit}, "
        f"cache_key={res.cache_key[:12]}...)",
        file=sys.stderr,
    )
    if res.usage:
        print(f"  usage: {json.dumps(res.usage)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
