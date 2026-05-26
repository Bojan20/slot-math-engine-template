"""W6.5 — `slot-build --gdd` entry: GDD PDF → universal IR end-to-end.

Standalone CLI module that orchestrates W6.1 (PDF extractor) + W6.2
(DSL synthesizer) + W6.4 (SMT-locked RTP) into a single command:

    python -m tools.slot_build.gdd_mode <game.gdd.pdf>
                                         [--out <slug>.slot-sim.ir.json]
                                         [--dsl <slug>.dsl.toml]
                                         [--summary <slug>.gdd.json]
                                         [--no-smt-lock]
                                         [--mc-spins N]
                                         [--quiet]

Pipeline:
    1. extract_gdd(pdf)              → semi-structured GDD JSON
    2. gdd_json_to_dsl(extracted)    → DSL spec
    3. dsl_to_ir_via_smt(dsl)        → universal IR (RTP-locked)
    4. (optional) MC sanity run to confirm closed-form match
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from tools.gdd_extract.dsl import (
    dump_dsl_toml,
    gdd_json_to_dsl,
)


def _ensure_pdf_libs():
    """Helper to surface a clear error if pypdf missing."""
    try:
        from tools.gdd_extract.extract import extract_gdd  # noqa: F401
        return True
    except ImportError as e:
        print(f"error: pypdf not installed ({e}); "
              "install with `pip install pypdf`", file=sys.stderr)
        return False


def run_gdd_pipeline(
    pdf_path: Path,
    smt_lock: bool = True,
    verbose: bool = True,
) -> dict[str, Any]:
    """Execute the GDD → IR pipeline. Returns the synthesized IR dict.

    Raises `FileNotFoundError` if the PDF doesn't exist.
    Raises `ImportError` if pypdf missing (caller should `_ensure_pdf_libs`).
    """
    from tools.gdd_extract.extract import extract_gdd
    from tools.gdd_extract.smt_synth import dsl_to_ir_via_smt
    from tools.gdd_extract.dsl import dsl_to_slot_sim_ir

    if not pdf_path.is_file():
        raise FileNotFoundError(f"GDD PDF {pdf_path} not found")

    if verbose:
        print(f"[1/3] extract_gdd({pdf_path.name})")
    extracted = extract_gdd(pdf_path)
    if verbose:
        sections = extracted.get("raw_sections") or {}
        print(f"  → {len(sections)} sections detected: "
              f"{', '.join(sorted(sections.keys()))}")

    if verbose:
        print("[2/3] gdd_json_to_dsl")
    dsl = gdd_json_to_dsl(extracted)
    if verbose:
        topo = dsl.get("topology") or {}
        meta = dsl.get("meta") or {}
        print(f"  → topology: {topo.get('reels')}×{topo.get('rows')} / "
              f"{topo.get('paylines')} lines · "
              f"target RTP: {meta.get('target_rtp')}")

    if verbose:
        print(f"[3/3] dsl_to_ir{'_via_smt' if smt_lock else ''}")
    if smt_lock:
        ir = dsl_to_ir_via_smt(dsl)
        if verbose:
            notes = ir["meta"].get("notes") or []
            lock_note = next(
                (n for n in notes if "SMT-locked" in n or "already within" in n),
                None,
            )
            if lock_note:
                print(f"  → {lock_note}")
    else:
        ir = dsl_to_slot_sim_ir(dsl)
        if verbose:
            print("  → default IR (no SMT lock)")

    # Attach the original extraction + DSL to ir.meta.notes for audit
    ir["meta"].setdefault("notes", []).append(
        f"W6.5 GDD pipeline: source={pdf_path.name}, "
        f"smt_locked={smt_lock}"
    )
    return ir, dsl, extracted


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-build-gdd",
        description="W6.5 — GDD PDF → universal IR pipeline",
    )
    ap.add_argument("pdf", help="path to GDD PDF")
    ap.add_argument("--out", default=None,
                    help="output IR JSON path "
                         "(default: <stem>.slot-sim.ir.json)")
    ap.add_argument("--dsl", default=None,
                    help="also write intermediate DSL TOML path")
    ap.add_argument("--summary", default=None,
                    help="also write GDD JSON extraction "
                         "(W6.1 output)")
    ap.add_argument("--no-smt-lock", action="store_true",
                    help="skip W7.3 SMT RTP lock; use default paytable")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if not _ensure_pdf_libs():
        return 2

    pdf_path = Path(args.pdf)
    if not pdf_path.is_file():
        print(f"error: PDF {pdf_path} not found", file=sys.stderr)
        return 2

    try:
        ir, dsl, extracted = run_gdd_pipeline(
            pdf_path,
            smt_lock=not args.no_smt_lock,
            verbose=not args.quiet,
        )
    except Exception as e:  # noqa: BLE001
        print(f"error: pipeline failed: {e}", file=sys.stderr)
        return 1

    # Write outputs
    out_ir = Path(args.out) if args.out else pdf_path.with_suffix(
        ".slot-sim.ir.json"
    )
    out_ir.write_text(json.dumps(ir, indent=2, ensure_ascii=False))
    if not args.quiet:
        print(f"wrote IR    → {out_ir}")

    if args.dsl:
        Path(args.dsl).write_text(dump_dsl_toml(dsl))
        if not args.quiet:
            print(f"wrote DSL   → {args.dsl}")

    if args.summary:
        Path(args.summary).write_text(
            json.dumps(extracted, indent=2, ensure_ascii=False)
        )
        if not args.quiet:
            print(f"wrote GDD   → {args.summary}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
