"""W6.3 — LLM demo recorder CLI.

Usage::

    python3 -m tools.llm_demo_recorder                # mock mode (default)
    python3 -m tools.llm_demo_recorder --live         # real API if key set
    python3 -m tools.llm_demo_recorder --archetype hold_and_win
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.gdd_llm_ingest.demo_prompts import DEMO_PROMPTS
from tools.gdd_llm_ingest.ingest import generate_gdd

from .live import have_api_key, run_live_prompt
from .mock_timing import synth_timing
from .recorder import (
    DemoRecord,
    sha256_text,
    write_cast,
    write_transcript,
)
from .summary import build_summary_md


REPO = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO / "reports" / "llm-demo"
MOCK_MODEL = "claude-sonnet-4-7-20260306"  # canonical mock id; not called


def _build_mock_record(archetype: str, prompt: str) -> DemoRecord:
    timing = synth_timing(archetype, prompt)
    res = generate_gdd(
        prompt,
        client=None,
        use_cache=False,
        allow_demo_fallback=True,
    )
    yaml = res.gdd_yaml
    return DemoRecord(
        archetype=archetype,
        mode="mock",
        prompt=prompt,
        wall_clock_ms=timing.wall_clock_ms,
        model=MOCK_MODEL,
        input_tokens=timing.input_tokens,
        output_tokens=timing.output_tokens,
        cache_creation_input_tokens=timing.cache_creation_input_tokens,
        cache_read_input_tokens=timing.cache_read_input_tokens,
        gdd_yaml=yaml,
        gdd_sha256=sha256_text(yaml),
    )


def _build_live_record(archetype: str, prompt: str) -> DemoRecord | None:
    live = run_live_prompt(archetype, prompt)
    if live is None:
        return None
    return DemoRecord(
        archetype=archetype,
        mode="live",
        prompt=prompt,
        wall_clock_ms=live.wall_clock_ms,
        model=live.model or "claude-sonnet-4-7",
        input_tokens=live.input_tokens,
        output_tokens=live.output_tokens,
        cache_creation_input_tokens=live.cache_creation_input_tokens,
        cache_read_input_tokens=live.cache_read_input_tokens,
        gdd_yaml=live.gdd_yaml,
        gdd_sha256=live.gdd_sha256,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m tools.llm_demo_recorder",
        description=(
            "Record W6.2 LLM NL → GDD demo across 5 archetype prompts. "
            "Default mode = mock (CI-safe, no API key required)."
        ),
    )
    parser.add_argument(
        "--live", action="store_true",
        help=(
            "Use real Anthropic API (requires ANTHROPIC_API_KEY). "
            "Falls back to mock if the key is missing."
        ),
    )
    parser.add_argument(
        "--archetype",
        choices=sorted(DEMO_PROMPTS.keys()),
        default=None,
        help="run only one archetype prompt instead of all 5",
    )
    parser.add_argument(
        "--out-dir", default=str(DEFAULT_OUT),
        help=f"output directory (default: {DEFAULT_OUT})",
    )
    args = parser.parse_args(argv)

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    use_live = bool(args.live)
    if use_live and not have_api_key():
        print(
            "warning: --live requested but ANTHROPIC_API_KEY not set; "
            "falling back to mock mode.",
            file=sys.stderr,
        )
        use_live = False

    arch_list = (
        [args.archetype]
        if args.archetype is not None
        else sorted(DEMO_PROMPTS.keys())
    )

    records: list[DemoRecord] = []
    for arch in arch_list:
        prompt = DEMO_PROMPTS[arch]
        rec: DemoRecord | None = None
        if use_live:
            rec = _build_live_record(arch, prompt)
            if rec is None:
                print(
                    f"warning: live call for {arch!r} returned no result; "
                    f"using mock fallback.",
                    file=sys.stderr,
                )
        if rec is None:
            rec = _build_mock_record(arch, prompt)
        records.append(rec)
        cast_path = write_cast(out_dir, rec)
        trs_path = write_transcript(out_dir, rec)
        print(
            f"▶ {rec.archetype:14s} mode={rec.mode:4s} "
            f"wall={rec.wall_clock_ms:5d}ms "
            f"tokens={rec.input_tokens}/{rec.output_tokens}  "
            f"→ {cast_path.name}, {trs_path.name}",
            file=sys.stderr,
        )

    # Summary + machine-readable transcript json.
    summary_md = build_summary_md(records)
    (out_dir / "SUMMARY.md").write_text(summary_md, encoding="utf-8")

    transcript = {
        "schema": "slotmath.llm-demo-transcript/v1",
        "mode": "live" if use_live else "mock",
        "n_records": len(records),
        "records": [r.to_dict() for r in records],
    }
    (out_dir / "transcript.json").write_text(
        json.dumps(transcript, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(f"  → wrote {out_dir / 'SUMMARY.md'}", file=sys.stderr)
    print(f"  → wrote {out_dir / 'transcript.json'}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
