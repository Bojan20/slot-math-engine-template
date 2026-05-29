"""W6.x — GDD NL ingestion CLI.

Usage
-----

    # Process a single prompt from a file:
    python3 -m tools.gdd_nl_ingest prompt.txt

    # Process a single prompt from stdin:
    echo "5x3 lines, RTP 95, free spins" | python3 -m tools.gdd_nl_ingest -

    # Process a single prompt from the command line:
    python3 -m tools.gdd_nl_ingest --prompt "megaways, RTP 96, high vol"

    # Process every prompt in the bundled test corpus:
    python3 -m tools.gdd_nl_ingest --test-corpus

Output:
  reports/greenfield-demo/nl-ingest-<archetype>-<swid>.gdd   (GDD YAML)
  reports/greenfield-demo/<slug>.<swid>.cert.zip             (cert bundle)
  reports/greenfield-demo/<slug>.acceptance.json             (acceptance)
  reports/greenfield-demo/nl-ingest-summary.json             (roll-up)

Exit codes:
  0 — all prompts produced PASS
  1 — any prompt FAIL / AMBIGUOUS / ERROR
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .ingest import (
    ingest_prompt,
    DEFAULT_OUT_DIR,
    DEMO_SPINS,
    ENGINE_BIN,
)


REPO = Path(__file__).resolve().parents[2]


# Test corpus — 5 hand-written NL prompts covering different
# complexity levels and all five archetypes.
_TEST_CORPUS = [
    # 1. Minimal lines spec
    "5x3 lines slot, 20 paylines, RTP 95, medium volatility, free spins.",
    # 2. Detailed ways spec
    "5x3 slot with 243 ways, RTP 96, medium volatility, free spins triggered by 3 scatters. Name 'Tiger Ways'.",
    # 3. Megaways spec
    "Megaways slot, RTP 95, high volatility, free spins, max win 25000x. Vendor: studio-internal. Name 'Storm Megaways NL'.",
    # 4. Hold & Win spec
    "5x3 hold-and-win slot, 20 paylines, RTP 94, high volatility, free spins. Name 'Golden Vault NL'.",
    # 5. Cascade spec
    "5x3 cascade slot, RTP 96, medium volatility, free spins, max win 10000. Name 'Cascade Demo NL'.",
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m tools.gdd_nl_ingest",
        description=(
            "W6.x — Natural-language prompt → GDD → archetype pipeline. "
            "Deterministic regex + keyword extraction (no LLM API calls)."
        ),
    )
    parser.add_argument(
        "prompt_file", nargs="?",
        help="Path to a .txt/.md file containing the NL prompt, "
             "or '-' to read from stdin.",
    )
    parser.add_argument(
        "--prompt", "-p",
        help="NL prompt string passed on the command line.",
    )
    parser.add_argument(
        "--test-corpus", action="store_true",
        help="Run the 5-prompt bundled test corpus.",
    )
    parser.add_argument(
        "--out-dir", default=str(DEFAULT_OUT_DIR),
        help=f"output directory (default: {DEFAULT_OUT_DIR})",
    )
    parser.add_argument(
        "--spins", type=int, default=DEMO_SPINS,
        help=f"MC spin budget (default: {DEMO_SPINS})",
    )
    parser.add_argument(
        "--engine-bin", default=str(ENGINE_BIN),
        help=f"slot-sim release binary (default: {ENGINE_BIN})",
    )
    args = parser.parse_args(argv)

    out_dir = Path(args.out_dir).resolve()
    engine_bin = Path(args.engine_bin)

    prompts: list[str] = []
    if args.test_corpus:
        prompts = list(_TEST_CORPUS)
    elif args.prompt:
        prompts = [args.prompt]
    elif args.prompt_file == "-":
        prompts = [sys.stdin.read().strip()]
    elif args.prompt_file:
        p = Path(args.prompt_file)
        if not p.exists():
            print(f"error: prompt file not found: {p}", file=sys.stderr)
            return 1
        prompts = [p.read_text(encoding="utf-8").strip()]
    else:
        parser.print_help()
        return 1

    summary: list[dict] = []
    any_fail = False
    for idx, prompt in enumerate(prompts, start=1):
        prompt_one_line = " ".join(prompt.split())
        print(f"▶ Prompt {idx}/{len(prompts)}: {prompt_one_line[:80]!r}",
              file=sys.stderr)
        result = ingest_prompt(
            prompt, out_dir=out_dir, spins=args.spins, engine_bin=engine_bin,
        )
        row: dict = {
            "prompt_index": idx,
            "prompt_snippet": prompt_one_line[:140],
            "archetype": result.archetype,
            "detected_fields": result.detected_fields,
            "verdict": result.verdict,
            "mc_rtp": result.mc_rtp,
            "mc_hit_freq": result.mc_hit_freq,
            "target_rtp": result.target_rtp,
            "gdd_path": str(result.gdd_path) if result.gdd_path else None,
            "cert_zip": str(result.cert_zip) if result.cert_zip else None,
            "ambiguous_questions": result.ambiguous_questions,
        }
        summary.append(row)
        if result.verdict != "PASS":
            any_fail = True
        msg = (
            f"  archetype={result.archetype} verdict={result.verdict}  "
            f"mc_rtp={result.mc_rtp:.4f}  target={result.target_rtp:.4f}"
            if result.mc_rtp is not None and result.target_rtp is not None
            else f"  archetype={result.archetype} verdict={result.verdict}"
        )
        print(msg, file=sys.stderr)
        if result.ambiguous_questions:
            for q in result.ambiguous_questions:
                print(f"    ? {q}", file=sys.stderr)

    summary_path = out_dir / "nl-ingest-summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps({
        "schema": "nl-ingest-summary/v1",
        "n_prompts": len(summary),
        "n_pass": sum(1 for r in summary if r["verdict"] == "PASS"),
        "n_fail": sum(1 for r in summary if r["verdict"] != "PASS"),
        "results": summary,
    }, indent=2, sort_keys=True))
    print(f"  → summary: {summary_path}", file=sys.stderr)
    print(f"  OVERALL: {'PASS' if not any_fail else 'FAIL'}", file=sys.stderr)

    return 0 if not any_fail else 1


if __name__ == "__main__":
    raise SystemExit(main())
