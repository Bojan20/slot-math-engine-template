"""CLI entry for slot-ci-gate.

Example:
    slot-ci-gate games/ \\
        --jurisdiction ukgc --jurisdiction mga \\
        --update-baselines --run-matrix --matrix-spins 1000 \\
        --out reports/ci-gate/

Exit codes:
    0  — every enabled gate PASS or SKIP
    1  — at least one gate WARN / FAIL
    2  — at least one gate ERROR (tool crash / config issue)
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

from tools.ci_gate.aggregator import (
    CiGateConfig,
    run_ci_gate,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-ci-gate",
        description=(
            "Repo-wide CI gate aggregator. Chains drift sentinel + "
            "cert XML sanity + jurisdiction lint × IRs × profiles + "
            "optional 12x12 cert matrix sweep into one consolidated "
            "report ready for CI."
        ),
    )
    p.add_argument("games_root", type=Path, help="games/ root directory")
    p.add_argument("--out", type=Path, default=None,
                   help="output dir (default: <games_root>/.ci-gate/)")
    p.add_argument("--jurisdiction", action="append", default=None,
                   metavar="ID",
                   help="repeatable; lint every IR against this profile")
    p.add_argument("--update-baselines", action="store_true",
                   help="rewrite drift sentinel baseline this run")
    p.add_argument("--no-drift", action="store_true",
                   help="skip drift sentinel gate")
    p.add_argument("--no-cert-xml", action="store_true",
                   help="skip cert XML sanity gate")
    p.add_argument("--no-jurisdiction", action="store_true",
                   help="skip jurisdiction lint gate")
    p.add_argument("--run-matrix", action="store_true",
                   help="run 12x12 cert matrix sweep (requires slot-sim)")
    p.add_argument("--matrix-spins", type=int, default=500,
                   help="spins/cell for matrix sweep (default 500)")
    p.add_argument("--quiet", action="store_true",
                   help="suppress stdout summary table")
    args = p.parse_args(argv)

    cfg = CiGateConfig(
        games_root=args.games_root,
        out_dir=args.out,
        jurisdictions=args.jurisdiction or [],
        update_baselines=args.update_baselines,
        run_drift=not args.no_drift,
        run_cert_xml=not args.no_cert_xml,
        run_jurisdiction=not args.no_jurisdiction,
        run_matrix=args.run_matrix,
        matrix_spins=args.matrix_spins,
    )
    report = run_ci_gate(cfg)

    if not args.quiet:
        counts = report.counts
        verdict = "PASS" if report.passed else (
            "ERROR" if report.has_error else "FAIL"
        )
        sys.stdout.write(
            f"\n[ci-gate] verdict={verdict} · "
            f"pass={counts['pass']} warn={counts['warn']} "
            f"fail={counts['fail']} skip={counts['skip']} "
            f"error={counts['error']} · "
            f"wall={report.elapsed_total_ms:.0f}ms\n"
        )
        for r in report.results:
            sys.stdout.write(
                f"  {r.status.value.upper():6s} {r.name:24s} "
                f"{r.elapsed_ms:7.1f}ms  {r.detail}\n"
            )
            if r.findings:
                for f in r.findings[:5]:
                    sys.stdout.write(f"        ↳ {f}\n")
                if len(r.findings) > 5:
                    sys.stdout.write(
                        f"        ↳ … ({len(r.findings) - 5} more)\n"
                    )
        sys.stdout.write(
            f"\nreports written to: {report.config.out_dir}\n"
        )

    if report.has_error:
        return 2
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
