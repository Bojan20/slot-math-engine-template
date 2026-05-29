"""tools.qa_agent.cli — argparse + subcommand dispatch.

Subcommands (introspected by `tools.qa_agent.selftest.check_cli_surface`):
  selftest    Run L0 only (validates every scenario YAML + helpers).
  auto        Run automatic layers (L0,L1,L2,L3,L4,L5,L8). Pair `--quick`
              to run the lightweight set (L0,L1,L2,L3,L9).
  manual      Run L0 + L9. `--scenario <id>` restricts to one scenario.
  full        Run every layer L0..L9 (L6 SKIP if cargo-mutants/mutmut absent).
  status      Print summary of the last persisted report (no run).
  antibody    Ad-hoc query against the antibody DB.

Exit code map (per QA_AGENT.md):
  0 all pass · 1 any FAIL · 2 bad input · 3 infra error · 4 antibody block.

The runner is responsible for layer execution + report write; this module
only translates argparse → `QaConfig` and forwards.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Optional

from . import antibody as antibody_mod
from .runner import QaConfig, QaScope, run_qa


REPO_ROOT = Path(__file__).resolve().parents[2]

EXIT_OK = 0
EXIT_FAIL = 1
EXIT_BAD_INPUT = 2
EXIT_INFRA = 3
EXIT_ANTIBODY = 4


# ── shared option installers ─────────────────────────────────────────────


def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--seed",
        type=int,
        default=int(os.environ.get("SLOT_QA_SEED", "42")),
        help="deterministic seed (also exported as SLOT_QA_SEED)",
    )
    p.add_argument(
        "--out",
        default=None,
        help="report output root (default: reports/qa_agent)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="print the report JSON to stdout in addition to writing files",
    )
    p.add_argument(
        "--allow-dirty",
        action="store_true",
        help="permit running with a dirty working tree (otherwise exit 2)",
    )


# ── parser ───────────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m tools.qa_agent",
        description="QA Agent — automatic + manual test orchestrator (PHASE 8).",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    p_self = sub.add_parser("selftest", help="L0 selftest only")
    _add_common(p_self)

    p_auto = sub.add_parser("auto", help="run automatic layers")
    p_auto.add_argument(
        "--quick",
        action="store_true",
        help="run the lightweight set (L0,L1,L2,L3,L9) instead of full auto",
    )
    p_auto.add_argument("--baseline", default="", help="git ref for L7 regression baseline")
    p_auto.add_argument(
        "--skip",
        default="",
        help="comma-separated layer ids to skip, e.g. L6,L7",
    )
    _add_common(p_auto)

    p_manual = sub.add_parser("manual", help="run manual scenarios (L0 + L9)")
    p_manual.add_argument("--scenario", default=None, help="single scenario id")
    p_manual.add_argument("--all", action="store_true", help="run every scenario")
    p_manual.add_argument(
        "--scenarios",
        default=None,
        help="optional extra directory of scenario YAMLs",
    )
    _add_common(p_manual)

    p_full = sub.add_parser("full", help="run every layer L0-L9")
    p_full.add_argument("--baseline", default="", help="git ref for L7 regression baseline")
    p_full.add_argument(
        "--skip",
        default="",
        help="comma-separated layer ids to skip, e.g. L6",
    )
    p_full.add_argument(
        "--verify-determinism",
        action="store_true",
        help="re-run a fast subset and assert canonical_hash matches",
    )
    _add_common(p_full)

    sub.add_parser("status", help="print summary of last persisted report")

    p_ab = sub.add_parser("antibody", help="ad-hoc antibody DB query")
    p_ab.add_argument("symptom", help="free-form symptom text to tokenise")

    return p


# ── subcommand handlers ───────────────────────────────────────────────────


def _cfg_from(args: argparse.Namespace, scope: QaScope) -> QaConfig:
    skip_raw = getattr(args, "skip", "") or ""
    skip = {s.strip().upper() for s in skip_raw.split(",") if s.strip()}
    out_root = Path(args.out) if getattr(args, "out", None) else None
    return QaConfig(
        scope=scope,
        baseline=getattr(args, "baseline", "") or "",
        seed=int(getattr(args, "seed", 42)),
        only_scenario=getattr(args, "scenario", None),
        extra_scenarios_dir=Path(args.scenarios) if getattr(args, "scenarios", None) else None,
        skip=skip,
        allow_dirty=bool(getattr(args, "allow_dirty", False)),
        out_root=out_root,
        repo=REPO_ROOT,
        verify_determinism=bool(getattr(args, "verify_determinism", False)),
    )


def _emit(args: argparse.Namespace, report, run_dir: Path) -> None:
    if getattr(args, "json", False):
        print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    else:
        # Compact human summary; report.json/md persisted by runner.
        print(f"verdict: {report.verdict}  exit_code: {report.exit_code}")
        for lyr in report.layers:
            status = lyr.status.value if hasattr(lyr.status, "value") else str(lyr.status)
            print(f"  {lyr.layer:<8} {status:<6} {lyr.name:<13} {(lyr.detail or '')[:80]}")
        print(f"report: {run_dir}")


def cmd_selftest(args: argparse.Namespace) -> int:
    cfg = _cfg_from(args, QaScope.SELFTEST)
    cfg.allow_dirty = True  # selftest is read-only, dirty-tree-safe
    report, run_dir = run_qa(cfg)
    _emit(args, report, run_dir)
    return int(report.exit_code)


def cmd_auto(args: argparse.Namespace) -> int:
    scope = QaScope.QUICK if args.quick else QaScope.AUTO
    cfg = _cfg_from(args, scope)
    report, run_dir = run_qa(cfg)
    _emit(args, report, run_dir)
    return int(report.exit_code)


def cmd_manual(args: argparse.Namespace) -> int:
    cfg = _cfg_from(args, QaScope.MANUAL)
    if not args.all and args.scenario is None:
        # `manual` without --all and without --scenario runs every scenario.
        cfg.only_scenario = None
    elif args.all:
        cfg.only_scenario = None
    report, run_dir = run_qa(cfg)
    _emit(args, report, run_dir)
    return int(report.exit_code)


def cmd_full(args: argparse.Namespace) -> int:
    cfg = _cfg_from(args, QaScope.FULL)
    report, run_dir = run_qa(cfg)
    _emit(args, report, run_dir)
    return int(report.exit_code)


def cmd_status(args: argparse.Namespace) -> int:
    cfg = _cfg_from(args, QaScope.STATUS)
    cfg.allow_dirty = True
    report, _run_dir = run_qa(cfg)
    print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    # status reports the verdict it found; never fail unless infra error reading the file.
    return EXIT_OK if report.exit_code != 3 else EXIT_INFRA


def cmd_antibody(args: argparse.Namespace) -> int:
    result = antibody_mod.gate(args.symptom, repo=REPO_ROOT)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return EXIT_ANTIBODY if result.get("status") == "BLOCK" else EXIT_OK


HANDLERS = {
    "selftest": cmd_selftest,
    "auto": cmd_auto,
    "manual": cmd_manual,
    "full": cmd_full,
    "status": cmd_status,
    "antibody": cmd_antibody,
}


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        code = exc.code
        if code is None or code == 0:
            return EXIT_OK
        if isinstance(code, int):
            return EXIT_BAD_INPUT if code != 0 else EXIT_OK
        return EXIT_BAD_INPUT
    handler = HANDLERS.get(args.cmd)
    if handler is None:
        parser.print_help()
        return EXIT_BAD_INPUT
    try:
        return int(handler(args))
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return EXIT_INFRA
    except Exception as exc:
        print(f"qa-agent crashed: {exc!r}", file=sys.stderr)
        return EXIT_INFRA
