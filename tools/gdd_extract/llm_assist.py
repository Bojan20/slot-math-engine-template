"""W6.3 — LLM-assisted GDD → DSL synthesis (provider-pluggable).

Wraps the W6.1 + W6.2 deterministic pipeline with a `Provider` abstraction
that can optionally consult an LLM (Anthropic Claude, OpenAI GPT,
local Ollama, …) to refine fields the regex parser couldn't recover.

Default behavior — no LLM
─────────────────────────
When called without a configured `Provider`, this module is a pure
pass-through to W6.1 + W6.2:

    extracted = extract_gdd(pdf)
    dsl       = gdd_json_to_dsl(extracted)

This guarantees deterministic, reproducible output for CI/regulator
audits — the LLM step is optional gravy.

With a Provider
───────────────
If a `Provider` is supplied, the workflow becomes:

    1. extract_gdd(pdf)             → semi-structured GDD JSON
    2. gdd_json_to_dsl(extracted)   → baseline DSL (regex-derived)
    3. provider.refine(extracted,
                       baseline_dsl) → refined DSL
                       (the provider sees the raw sections + the
                        baseline DSL and may overlay corrections)
    4. dsl_validate(refined)        → assert shape
    5. (optional) dsl_to_ir_via_smt → SMT-locked IR

The Provider protocol is a single async method:

    class Provider(Protocol):
        def refine(self, extracted: dict, baseline: dict) -> dict: ...

We ship two stub providers:
  • `DeterministicEchoProvider`   — returns baseline unchanged (used
                                    by tests and as a no-op)
  • `EnvOpenAIProvider`           — uses OPENAI_API_KEY if present;
                                    falls back to deterministic if not.

External providers (Anthropic, local Ollama) are easy to add: subclass
`Provider` and implement `refine`.

Public API:
    from tools.gdd_extract.llm_assist import (
        Provider,
        DeterministicEchoProvider,
        gdd_to_dsl_assisted,
    )

    dsl = gdd_to_dsl_assisted(pdf_path,
                               provider=DeterministicEchoProvider())
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Protocol


class Provider(Protocol):
    """Provider protocol — any LLM that refines a baseline DSL."""

    def refine(self,
                extracted: dict[str, Any],
                baseline: dict[str, Any]) -> dict[str, Any]:
        ...


class DeterministicEchoProvider:
    """No-op provider. Returns the baseline unchanged.

    Used as the default + in tests to verify the pipeline integrity
    without any external dependency.
    """

    def refine(self,
                extracted: dict[str, Any],
                baseline: dict[str, Any]) -> dict[str, Any]:
        return baseline


class EnvOpenAIProvider:
    """Calls OpenAI if `OPENAI_API_KEY` is set in the environment.

    Falls back to `DeterministicEchoProvider` if:
        • the env var is missing
        • the `openai` package is not installed
        • the API call raises

    This is a thin guard — operators bring their own LLM provider /
    auth / rate-limit policy.  We never write credentials anywhere.
    """

    def __init__(self,
                 model: str = "gpt-4o-mini",
                 system_prompt: str | None = None) -> None:
        self.model = model
        self.system_prompt = system_prompt or (
            "You are a slot-math compliance reviewer. Given a "
            "regex-extracted GDD JSON and a baseline DSL, return the "
            "corrected DSL preserving the same TOML schema."
        )

    def refine(self,
                extracted: dict[str, Any],
                baseline: dict[str, Any]) -> dict[str, Any]:
        if not os.environ.get("OPENAI_API_KEY"):
            return baseline
        try:
            from openai import OpenAI  # type: ignore
        except ImportError:
            return baseline
        try:
            import json
            client = OpenAI()
            user_msg = (
                "GDD extraction (raw sections):\n"
                + json.dumps(extracted, ensure_ascii=False)
                + "\n\nBaseline DSL:\n"
                + json.dumps(baseline, ensure_ascii=False)
                + "\n\nReturn the corrected DSL as a JSON object with the "
                  "same shape (meta, topology, paytable, features, …)."
            )
            resp = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or ""
            refined = json.loads(raw)
            # Must be a dict — otherwise fall back
            if not isinstance(refined, dict):
                return baseline
            return refined
        except Exception:  # noqa: BLE001
            return baseline


def gdd_to_dsl_assisted(
    pdf_path: Path,
    provider: Provider | None = None,
) -> dict[str, Any]:
    """Run the GDD → DSL pipeline with optional LLM refinement.

    Returns the (possibly refined) DSL dict.

    Args:
        pdf_path: GDD PDF path
        provider: optional Provider; if None, no LLM consulted
                  (deterministic fallback identical to W6.1+W6.2)

    Raises FileNotFoundError if pdf missing; ImportError if pypdf
    not installed.
    """
    from tools.gdd_extract.dsl import dsl_validate, gdd_json_to_dsl
    from tools.gdd_extract.extract import extract_gdd

    extracted = extract_gdd(Path(pdf_path))
    baseline = gdd_json_to_dsl(extracted)

    if provider is None:
        dsl_validate(baseline)
        return baseline

    refined = provider.refine(extracted, baseline)
    # If the provider returns something malformed, fall back to
    # baseline (and stash a notes entry so reviewers see the lift
    # was attempted).
    try:
        dsl_validate(refined)
    except Exception:  # noqa: BLE001
        refined = baseline
        refined.setdefault("meta", {}).setdefault("notes", []).append(
            "W6.3: provider returned malformed DSL; using baseline"
        )
    else:
        refined.setdefault("meta", {}).setdefault("notes", []).append(
            f"W6.3: refined via {type(provider).__name__}"
        )
    return refined


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys
    import tomllib  # py3.11+

    from tools.gdd_extract.dsl import dump_dsl_toml

    ap = argparse.ArgumentParser(
        prog="slot-gdd-llm",
        description="W6.3 — GDD → DSL with optional LLM refinement",
    )
    ap.add_argument("pdf", help="path to GDD PDF")
    ap.add_argument("--out", default=None,
                    help="output DSL TOML path (default: stdout)")
    ap.add_argument("--provider",
                    choices=("none", "deterministic", "openai-env"),
                    default="none",
                    help="LLM provider (default: none = deterministic)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if args.provider == "none":
        provider: Provider | None = None
    elif args.provider == "deterministic":
        provider = DeterministicEchoProvider()
    else:
        provider = EnvOpenAIProvider()

    try:
        dsl = gdd_to_dsl_assisted(Path(args.pdf), provider=provider)
    except FileNotFoundError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    except ImportError as e:
        print(f"error: {e} (install pypdf for GDD extraction)",
              file=sys.stderr)
        return 2

    toml = dump_dsl_toml(dsl)
    if args.out:
        Path(args.out).write_text(toml)
        if not args.quiet:
            print(f"wrote {args.out}")
    else:
        sys.stdout.write(toml)
    # Reference tomllib to silence "imported but unused" if no out path
    # forces TOML round-trip
    _ = tomllib  # noqa: F841
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
