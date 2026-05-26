"""tools.agent_corpus.expand — grow agent corpora beyond the few-shot seed.

For each P8.x agent we have a way to pull *more* training data without
human labour:

  par-parser  → run `slot-synth-par` for every vendor profile × seed,
                emit a labelled (vendor, IR-target) trace per run.
  reg-oracle  → snapshot the 12 jurisdiction stubs into rich
                "explainer" traces (one per jurisdiction × category).
  math-debug  → ingest cargo-mutants `outcomes.json` from
                `target/mutants-w240-*` and the latest
                `reports/mutation/scoped-*.json` (Stryker output).
                Every missed/timeout mutant is one labelled
                training trace.

Invocation:

  python -m tools.agent_corpus.expand par-parser   [--seeds 12]
  python -m tools.agent_corpus.expand reg-oracle
  python -m tools.agent_corpus.expand math-debug
  python -m tools.agent_corpus.expand all
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:
    import yaml  # type: ignore
except ImportError:
    print("ERR: pyyaml required", file=sys.stderr)
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parents[2]
AGENTS_ROOT = Path.home() / "Projects/cortex/agents"
PROFILES_DIR = REPO_ROOT / "tools" / "vendor_profiles"
MUTANTS_TARGET_DIR = REPO_ROOT / "target"
MUTATION_REPORTS_DIR = REPO_ROOT / "reports" / "mutation"


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _stable_uuid(*parts: str) -> str:
    h = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _append_jsonl(p: Path, rows: Iterable[Dict[str, Any]]) -> int:
    p.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with p.open("a") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


# ── par-parser expansion ───────────────────────────────────────────────


def expand_par_parser(n_seeds: int = 12) -> Dict[str, Any]:
    profiles = sorted(p.stem for p in PROFILES_DIR.glob("*.yaml") if p.stem not in {"__init__", "scaffold"})
    if not profiles:
        return {"agent": "par-parser", "ok": False, "reason": f"no profiles in {PROFILES_DIR}"}

    rows: List[Dict[str, Any]] = []
    workdir = Path(tempfile.mkdtemp(prefix="corpus_par_"))
    try:
        for vendor in profiles:
            for seed in range(1000, 1000 + n_seeds):
                out_dir = workdir / f"{vendor}_{seed}" / "raw"
                cmd = [
                    sys.executable, "-m", "tools.parse_par.synth_par",
                    vendor,
                    "--seed", str(seed),
                    "--rtp", "0.955",
                    "--out", str(out_dir),
                ]
                rc = subprocess.run(cmd, cwd=str(REPO_ROOT), check=False,
                                    capture_output=True, text=True).returncode
                if rc != 0:
                    continue
                # Read main TSV + paylines, package as a single labelled trace.
                tsvs: List[Path] = sorted(out_dir.glob("*.tsv"))
                if not tsvs:
                    continue
                payload = []
                for tsv in tsvs:
                    payload.append(f"# {tsv.name}\n{tsv.read_text()[:50_000]}")
                trace_id = _stable_uuid("par-parser", "synth_expand", vendor, str(seed))
                rows.append({
                    "trace_id": trace_id,
                    "agent": "par-parser",
                    "source": "synth_par_expansion",
                    "path": str(out_dir),
                    "kind": "synthetic",
                    "text": "\n\n".join(payload),
                    "metadata": {"vendor": vendor, "seed": seed, "rtp_target": 0.955},
                    "license": "internal",
                    "ingested_at": _now_iso(),
                })
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    n = _append_jsonl(AGENTS_ROOT / "par-parser" / "corpus" / "traces.jsonl", rows)
    return {"agent": "par-parser", "ok": True, "appended": n, "profiles": len(profiles), "seeds_per_profile": n_seeds}


# ── reg-oracle expansion ───────────────────────────────────────────────


def expand_reg_oracle() -> Dict[str, Any]:
    jur_dir = AGENTS_ROOT / "reg-oracle" / "jurisdictions"
    rows: List[Dict[str, Any]] = []
    for p in sorted(jur_dir.glob("*.yaml")):
        meta = yaml.safe_load(p.read_text()) or {}
        code = meta.get("code", p.stem)
        for cat in meta.get("categories_supported", []) or []:
            text_blob = (
                f"# {meta.get('name')} ({code}) — {cat}\n\n"
                f"Country: {meta.get('country')}\n"
                f"Homepage: {meta.get('homepage')}\n"
                f"Profile binding: {meta.get('profile_binding')}\n\n"
                "## Primary documents\n"
                + "\n".join(
                    f"- [{d.get('title', d.get('id'))}]({d.get('url')}) — strategy: {d.get('fetch_strategy')}"
                    for d in (meta.get("primary_docs") or [])
                )
                + f"\n\nReview cadence: {meta.get('review_cadence')}\n"
                + (f"\nNotes: {meta.get('notes')}\n" if meta.get("notes") else "")
            )
            rows.append({
                "trace_id": _stable_uuid("reg-oracle", "category_explainer", code, cat),
                "agent": "reg-oracle",
                "source": "category_explainer",
                "path": str(p),
                "kind": "real",
                "text": text_blob,
                "metadata": {"jurisdiction": code, "category": cat},
                "license": "public",
                "ingested_at": _now_iso(),
            })
    n = _append_jsonl(AGENTS_ROOT / "reg-oracle" / "corpus" / "traces.jsonl", rows)
    return {"agent": "reg-oracle", "ok": True, "appended": n}


# ── math-debug expansion ───────────────────────────────────────────────


def _classify_mutant_path(p: str) -> str:
    """Map a file path / module name to a taxonomy class."""
    s = (p or "").lower()
    if any(k in s for k in ("reel", "strip", "iter")):
        return "reel_map"
    if any(k in s for k in ("paytable", "cluster", "canonical", "symbol")):
        return "paytable"
    if any(k in s for k in ("wild", "scatter", "bonus", "free_spin", "hold_win", "buy_feature")):
        return "wild_scatter_bonus"
    if any(k in s for k in ("session", "rg", "jurisdiction", "max_win", "stake")):
        return "bonus_round"
    return "paytable"  # default fallback


def expand_math_debug() -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    # cargo mutants outcomes.json per run dir
    if MUTANTS_TARGET_DIR.exists():
        for run_dir in sorted(MUTANTS_TARGET_DIR.glob("mutants-*")):
            outcomes = run_dir / "mutants.out" / "outcomes.json"
            if not outcomes.exists():
                continue
            try:
                data = json.loads(outcomes.read_text())
            except json.JSONDecodeError:
                continue
            outcomes_list = (data.get("outcomes") or []) if isinstance(data, dict) else []
            for entry in outcomes_list:
                scenario = entry.get("scenario") if isinstance(entry, dict) else None
                # Baseline scenarios are bare strings — skip.
                if not isinstance(scenario, dict):
                    continue
                mutant = scenario.get("Mutant") or {}
                file_pointer = mutant.get("file", "")
                func = (mutant.get("function") or {})
                fname = func.get("function_name", "")
                line = (((func.get("span") or {}).get("start") or {}).get("line"))
                replacement = mutant.get("replacement", "")
                genre = mutant.get("genre", "")
                outcome = entry.get("summary", "?")
                if not file_pointer:
                    continue
                trace_id = _stable_uuid("math-debug", "mutant", run_dir.name, file_pointer, str(line or 0), fname, replacement)
                if trace_id in seen_ids:
                    continue
                seen_ids.add(trace_id)
                klass = _classify_mutant_path(file_pointer)
                text = (
                    f"# Mutant trace\n\n"
                    f"Run: `{run_dir.name}`\n"
                    f"File: `{file_pointer}:{line}`\n"
                    f"Function: `{fname}`\n"
                    f"Genre: `{genre}`\n"
                    f"Replacement: `{replacement[:200]}`\n"
                    f"Outcome: `{outcome}`\n"
                    f"Taxonomy class: **{klass}**\n"
                )
                rows.append({
                    "trace_id": trace_id,
                    "agent": "math-debug",
                    "source": "cargo_mutants",
                    "path": str(outcomes),
                    "kind": "audit",
                    "text": text,
                    "metadata": {
                        "class_primary": klass,
                        "file": file_pointer,
                        "line": line,
                        "function": fname,
                        "outcome": outcome,
                        "genre": genre,
                        "run": run_dir.name,
                    },
                    "license": "internal",
                    "ingested_at": _now_iso(),
                })

    # Stryker scoped reports
    if MUTATION_REPORTS_DIR.exists():
        for report in sorted(MUTATION_REPORTS_DIR.glob("scoped-*.json")):
            try:
                data = json.loads(report.read_text())
            except json.JSONDecodeError:
                continue
            files = data.get("files", {}) if isinstance(data, dict) else {}
            for fpath, fdata in files.items():
                klass = _classify_mutant_path(fpath)
                for mut in (fdata.get("mutants") or []):
                    mid = mut.get("id")
                    status = mut.get("status")
                    if not mid:
                        continue
                    trace_id = _stable_uuid("math-debug", "stryker", report.stem, fpath, str(mid))
                    if trace_id in seen_ids:
                        continue
                    seen_ids.add(trace_id)
                    loc = mut.get("location", {})
                    line = (loc.get("start") or {}).get("line")
                    text = (
                        f"# Stryker trace\n\n"
                        f"Report: `{report.name}`\n"
                        f"File: `{fpath}:{line}`\n"
                        f"Mutator: `{mut.get('mutatorName')}`\n"
                        f"Status: `{status}`\n"
                        f"Taxonomy class: **{klass}**\n"
                    )
                    rows.append({
                        "trace_id": trace_id,
                        "agent": "math-debug",
                        "source": "stryker",
                        "path": str(report),
                        "kind": "audit",
                        "text": text,
                        "metadata": {"class_primary": klass, "file": fpath, "line": line, "status": status, "mutator": mut.get("mutatorName")},
                        "license": "internal",
                        "ingested_at": _now_iso(),
                    })

    n = _append_jsonl(AGENTS_ROOT / "math-debug" / "corpus" / "traces.jsonl", rows)
    return {"agent": "math-debug", "ok": True, "appended": n}


# ── CLI ────────────────────────────────────────────────────────────────


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Expand PHASE 8 agent corpora")
    p.add_argument("agent", choices=["par-parser", "reg-oracle", "math-debug", "all"])
    p.add_argument("--seeds", type=int, default=12, help="par-parser: seeds per vendor profile (default 12)")
    args = p.parse_args(argv)

    results: List[Dict[str, Any]] = []
    if args.agent in ("par-parser", "all"):
        results.append(expand_par_parser(n_seeds=args.seeds))
    if args.agent in ("reg-oracle", "all"):
        results.append(expand_reg_oracle())
    if args.agent in ("math-debug", "all"):
        results.append(expand_math_debug())
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
