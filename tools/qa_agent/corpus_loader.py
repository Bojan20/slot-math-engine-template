"""tools.qa_agent.corpus_loader — emit qa-agent traces for the RAG corpus.

Walks recent `reports/qa_agent/<ts>/report.json` runs and the
`scenarios/*.yaml` set, emitting one normalised trace per artefact for
ingest by `tools.agent_corpus`. The trace shape matches the unified
schema documented in `tools/agent_corpus/cli.py`.

Invocation:

    python -m tools.qa_agent.corpus_loader [--limit 100] [--out PATH]
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:
    import yaml  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit("ERR: pyyaml required for tools.qa_agent.corpus_loader") from exc


REPO_ROOT = Path(__file__).resolve().parents[2]
QA_REPORTS = REPO_ROOT / "reports" / "qa_agent"
SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"


def _stable_uuid(*parts: str) -> str:
    h = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _scenario_traces() -> Iterable[Dict[str, Any]]:
    if not SCENARIOS_DIR.exists():
        return []
    for p in sorted(SCENARIOS_DIR.glob("*.yaml")):
        try:
            data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            continue
        sid = data.get("id", p.stem)
        text = p.read_text(encoding="utf-8")
        yield {
            "trace_id": _stable_uuid("qa-agent", "scenario", sid),
            "agent": "qa-agent",
            "source": "scenario",
            "path": str(p),
            "kind": "example",
            "text": text,
            "metadata": {
                "scenario_id": sid,
                "severity": data.get("severity"),
                "step_count": len(data.get("steps", []) or []),
            },
            "license": "internal",
            "ingested_at": _now_iso(),
        }


def _report_traces(limit: int) -> Iterable[Dict[str, Any]]:
    if not QA_REPORTS.exists():
        return []
    reports = sorted(QA_REPORTS.glob("*/report.json"), key=lambda p: p.parent.name)
    if limit > 0:
        reports = reports[-limit:]
    for p in reports:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        scope = data.get("scope", "?")
        verdict = data.get("verdict", "?")
        repo_sha = data.get("repo_sha", "")
        # Compact text representation: scope, verdict, layer pass/fail roll-up.
        layer_summary = ", ".join(
            f"{l.get('layer')}={l.get('status')}" for l in data.get("layers", [])
        )
        text = (
            f"qa scope={scope} verdict={verdict} sha={repo_sha} layers=[{layer_summary}]"
        )
        yield {
            "trace_id": _stable_uuid("qa-agent", "run", p.parent.name),
            "agent": "qa-agent",
            "source": "qa_run",
            "path": str(p),
            "kind": "audit",
            "text": text,
            "metadata": {
                "scope": scope,
                "verdict": verdict,
                "exit_code": data.get("exit_code"),
                "repo_sha": repo_sha,
                "started_at": data.get("started_at"),
                "finished_at": data.get("finished_at"),
            },
            "license": "internal",
            "ingested_at": _now_iso(),
        }


def build_traces(limit: int = 100) -> List[Dict[str, Any]]:
    return list(_scenario_traces()) + list(_report_traces(limit))


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="qa-agent-corpus-loader")
    ap.add_argument("--limit", type=int, default=100, help="max recent runs to fold in")
    ap.add_argument("--out", type=Path, default=None, help="write to PATH (default: stdout JSONL)")
    args = ap.parse_args(argv)
    traces = build_traces(args.limit)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("w", encoding="utf-8") as fp:
            for t in traces:
                fp.write(json.dumps(t, sort_keys=True) + "\n")
    else:
        for t in traces:
            sys.stdout.write(json.dumps(t, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
