"""tools.agent_corpus.cli — corpus normaliser CLI (PHASE 8 P8.5).

Refreshes a unified `traces.jsonl` for any P8.x agent by walking the
agent's `corpus_root` (defined in its manifest.yaml under
`~/Projects/cortex/agents/<name>/`).

Trace schema (one JSON object per line):

  {
    "trace_id":   "<uuid>",
    "agent":      "par-parser" | "reg-oracle" | "math-debug",
    "source":     "<source-id from manifest.corpus_sources or auto-detected>",
    "path":       "<abs source path>",
    "kind":       "example" | "real" | "synthetic" | "diff" | "audit" | "qa",
    "text":       "<normalised markdown / json / yaml chunk>",
    "metadata":   { agent-specific fields },
    "license":    "public" | "internal" | "nda",
    "ingested_at": "<iso-8601>"
  }
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:
    import yaml  # type: ignore
except ImportError:
    print("ERR: pyyaml required", file=sys.stderr)
    sys.exit(2)

AGENTS_ROOT = Path.home() / "Projects/cortex/agents"

KNOWN_AGENTS = {"par-parser", "reg-oracle", "math-debug"}


def load_manifest(agent: str) -> Dict[str, Any]:
    mpath = AGENTS_ROOT / agent / "manifest.yaml"
    if not mpath.exists():
        raise FileNotFoundError(f"manifest not found: {mpath}")
    return yaml.safe_load(mpath.read_text())


def _expand(p: str) -> Path:
    return Path(os.path.expanduser(p))


def _stable_uuid(*parts: str) -> str:
    h = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _emit(out_path: Path, lines: Iterable[Dict[str, Any]]) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out_path.open("w") as fp:
        for line in lines:
            fp.write(json.dumps(line, ensure_ascii=False) + "\n")
            n += 1
    return n


def _walk_text_files(roots: List[Path], suffixes: tuple) -> Iterable[Path]:
    for root in roots:
        if not root.exists():
            continue
        for p in sorted(root.rglob("*")):
            if p.is_file() and p.suffix.lower() in suffixes:
                yield p


# ── par-parser ────────────────────────────────────────────────────────────


def _corpus_par_parser(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    agent = manifest["name"]
    nda_flags = manifest.get("nda_corpus", {})
    out: List[Dict[str, Any]] = []
    now = dt.datetime.now(dt.timezone.utc).isoformat()

    examples_dir = AGENTS_ROOT / agent / "examples"
    for p in sorted(examples_dir.glob("*.md")):
        out.append({
            "trace_id": _stable_uuid(agent, "example", p.name),
            "agent": agent,
            "source": "few_shot_example",
            "path": str(p),
            "kind": "example",
            "text": p.read_text(),
            "metadata": {"vendor_hint": p.stem.split("_")[0]},
            "license": "internal",
            "ingested_at": now,
        })

    # Vendor profiles (rooted in slot-math-engine-template/tools/vendor_profiles)
    profiles_root = Path.home() / "Projects/slot-math-engine-template/tools/vendor_profiles"
    if profiles_root.exists():
        for p in sorted(profiles_root.glob("*.yaml")):
            text = p.read_text()
            try:
                meta = yaml.safe_load(text) or {}
            except yaml.YAMLError:
                meta = {}
            vendor = (meta or {}).get("vendor", p.stem)
            if nda_flags.get(vendor, False) is False and meta.get("nda", False):
                # NDA gated and not allowed
                continue
            out.append({
                "trace_id": _stable_uuid(agent, "profile", p.name),
                "agent": agent,
                "source": "vendor_profile",
                "path": str(p),
                "kind": "real",
                "text": text,
                "metadata": {"vendor": vendor, "profile_version": meta.get("profile_version")},
                "license": "internal",
                "ingested_at": now,
            })

    # Synth PAR samples (if any prebuilt)
    synth_root = Path.home() / "Projects/slot-math-engine-template/games"
    if synth_root.exists():
        for p in sorted(synth_root.rglob("synth_par_*.json")):
            out.append({
                "trace_id": _stable_uuid(agent, "synth", str(p)),
                "agent": agent,
                "source": "synth_par",
                "path": str(p),
                "kind": "synthetic",
                "text": p.read_text(),
                "metadata": {"vendor": "synthetic"},
                "license": "internal",
                "ingested_at": now,
            })

    return out


# ── reg-oracle ────────────────────────────────────────────────────────────


def _corpus_reg_oracle(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    agent = manifest["name"]
    out: List[Dict[str, Any]] = []
    now = dt.datetime.now(dt.timezone.utc).isoformat()

    jur_dir = AGENTS_ROOT / agent / "jurisdictions"
    for p in sorted(jur_dir.glob("*.yaml")):
        text = p.read_text()
        meta = yaml.safe_load(text) or {}
        out.append({
            "trace_id": _stable_uuid(agent, "jurisdiction", p.stem),
            "agent": agent,
            "source": "jurisdiction_stub",
            "path": str(p),
            "kind": "real",
            "text": text,
            "metadata": {
                "jurisdiction": meta.get("code", p.stem),
                "country": meta.get("country"),
                "categories": meta.get("categories_supported", []),
            },
            "license": "public",
            "ingested_at": now,
        })

    # Diffs (regulator deltas)
    diffs_dir = AGENTS_ROOT / agent / "diffs"
    if diffs_dir.exists():
        for p in sorted(diffs_dir.glob("regulator-delta-*.md")):
            out.append({
                "trace_id": _stable_uuid(agent, "diff", p.name),
                "agent": agent,
                "source": "regulator_delta",
                "path": str(p),
                "kind": "diff",
                "text": p.read_text(),
                "metadata": {"delta_date": p.stem.replace("regulator-delta-", "")},
                "license": "public",
                "ingested_at": now,
            })

    # QA eval is also useful corpus
    qa_file = AGENTS_ROOT / agent / "eval" / "qa_set.yaml"
    if qa_file.exists():
        out.append({
            "trace_id": _stable_uuid(agent, "eval-set"),
            "agent": agent,
            "source": "qa_set",
            "path": str(qa_file),
            "kind": "qa",
            "text": qa_file.read_text(),
            "metadata": {"role": "few_shot"},
            "license": "internal",
            "ingested_at": now,
        })

    return out


# ── math-debug ────────────────────────────────────────────────────────────


def _corpus_math_debug(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    agent = manifest["name"]
    targets = manifest.get("corpus_targets", {}) or {}
    out: List[Dict[str, Any]] = []
    now = dt.datetime.now(dt.timezone.utc).isoformat()

    # Examples (few-shot)
    examples_dir = AGENTS_ROOT / agent / "examples"
    for p in sorted(examples_dir.glob("*.md")):
        out.append({
            "trace_id": _stable_uuid(agent, "example", p.name),
            "agent": agent,
            "source": "few_shot_example",
            "path": str(p),
            "kind": "example",
            "text": p.read_text(),
            "metadata": {"taxonomy_hint": p.stem},
            "license": "internal",
            "ingested_at": now,
        })

    # Optional history corpora from the slot-math repo
    history_roots: List[Path] = []
    history_roots.append(_expand(str(targets.get("mutants_history", ""))))
    history_roots.append(_expand(str(targets.get("par_doctor_root", ""))))
    history_roots.append(_expand(str(targets.get("fs_audit_root", ""))))
    history_roots.append(_expand(str(targets.get("ir_fuzz_root", ""))))
    history_roots.append(_expand(str(targets.get("cert_matrix_root", ""))))

    # mutants-history.json is a file; the rest are dirs.
    for path in history_roots:
        if not path or not str(path):
            continue
        if path.is_file():
            try:
                text = path.read_text()
            except Exception:
                continue
            out.append({
                "trace_id": _stable_uuid(agent, "mutants", path.name),
                "agent": agent,
                "source": "mutants_history",
                "path": str(path),
                "kind": "audit",
                "text": text[:200_000],  # cap large files
                "metadata": {"size_bytes": path.stat().st_size},
                "license": "internal",
                "ingested_at": now,
            })
        elif path.is_dir():
            for sub in sorted(path.rglob("*")):
                if not sub.is_file():
                    continue
                if sub.suffix.lower() not in (".json", ".md", ".html", ".txt"):
                    continue
                try:
                    text = sub.read_text(errors="ignore")
                except Exception:
                    continue
                out.append({
                    "trace_id": _stable_uuid(agent, "history", str(sub)),
                    "agent": agent,
                    "source": path.name,
                    "path": str(sub),
                    "kind": "audit",
                    "text": text[:200_000],
                    "metadata": {"source_root": str(path)},
                    "license": "internal",
                    "ingested_at": now,
                })

    return out


CORPUS_BUILDERS = {
    "par-parser": _corpus_par_parser,
    "reg-oracle": _corpus_reg_oracle,
    "math-debug": _corpus_math_debug,
}


# ── public API ────────────────────────────────────────────────────────────


def build_corpus(agent: str) -> Path:
    if agent not in CORPUS_BUILDERS:
        raise ValueError(f"unknown agent '{agent}'; expected one of {sorted(KNOWN_AGENTS)}")
    manifest = load_manifest(agent)
    rows = CORPUS_BUILDERS[agent](manifest)
    out_path = AGENTS_ROOT / agent / "corpus" / "traces.jsonl"
    n = _emit(out_path, rows)
    print(f"✓ {agent}: {n} traces → {out_path}")
    return out_path


def stats(agent: str) -> Dict[str, Any]:
    out_path = AGENTS_ROOT / agent / "corpus" / "traces.jsonl"
    if not out_path.exists():
        return {"agent": agent, "exists": False}
    by_kind: Dict[str, int] = {}
    total = 0
    bytes_total = 0
    with out_path.open() as fp:
        for line in fp:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            total += 1
            by_kind[row.get("kind", "?")] = by_kind.get(row.get("kind", "?"), 0) + 1
            bytes_total += len(row.get("text", "")) * 1  # rough
    return {
        "agent": agent,
        "path": str(out_path),
        "total": total,
        "by_kind": by_kind,
        "text_bytes_approx": bytes_total,
    }


def self_test() -> int:
    """Smoke: build all 3 corpora and ensure at least 1 trace each."""
    failures = []
    for agent in sorted(KNOWN_AGENTS):
        try:
            out = build_corpus(agent)
            n = sum(1 for _ in out.open()) if out.exists() else 0
            if n == 0:
                failures.append(f"{agent}: 0 traces")
            else:
                print(f"  {agent}: {n} traces ok")
        except Exception as exc:
            failures.append(f"{agent}: exception {exc!r}")
    if failures:
        print("FAIL:")
        for f in failures:
            print(" -", f)
        return 1
    print("self-test PASS — all 3 agent corpora built non-empty")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="P8.5 corpus normaliser")
    sub = p.add_subparsers(dest="cmd")

    sp_refresh = sub.add_parser("refresh", help="Rebuild traces.jsonl for one agent.")
    sp_refresh.add_argument("agent", choices=sorted(KNOWN_AGENTS) + ["all"])

    sp_stats = sub.add_parser("stats", help="Show corpus stats.")
    sp_stats.add_argument("agent", choices=sorted(KNOWN_AGENTS) + ["all"])

    sub.add_parser("self-test", help="Smoke build all three corpora.")

    args = p.parse_args(argv)

    if args.cmd == "refresh":
        if args.agent == "all":
            for a in sorted(KNOWN_AGENTS):
                build_corpus(a)
        else:
            build_corpus(args.agent)
        return 0
    if args.cmd == "stats":
        if args.agent == "all":
            print(json.dumps([stats(a) for a in sorted(KNOWN_AGENTS)], indent=2))
        else:
            print(json.dumps(stats(args.agent), indent=2))
        return 0
    if args.cmd == "self-test":
        return self_test()
    p.print_help()
    return 2
