"""tools.qa_agent.manual — L9 manual scenario layer.

Thin wrapper around `tools.qa_agent.scenarios` that turns scenario
results into a `LayerResult`. The heavy lifting (YAML parsing,
schema validation, step execution) lives in `scenarios.py` to keep
this layer focused on aggregation + finding-mapping.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .report import Finding, LayerResult, LayerStatus
from .scenarios import (
    discover_scenarios,
    load_scenario,
    run_scenario,
)


_SEVERITY_MAP = {
    "critical": "CRITICAL",
    "high": "HIGH",
    "medium": "MEDIUM",
    "low": "LOW",
}


def run_l9_manual(
    repo: Path,
    out_dir: Path,
    *,
    only: Optional[str] = None,
    extra_dir: Optional[Path] = None,
    skip: bool = False,
) -> LayerResult:
    """Execute every (or selected) scenario, emit a layer result.

    Args:
        repo: repository root (forwarded into scenario env).
        out_dir: where to write `L9_manual.json` artefact.
        only: scenario id to run exclusively; None → run all discovered.
        extra_dir: optional secondary scenarios directory (e.g. a customer fork).
        skip: hard-skip the layer (returns LayerStatus.SKIP).
    """
    if skip:
        return LayerResult(
            layer="L9",
            name="manual",
            status=LayerStatus.SKIP,
            elapsed_ms=0.0,
            detail="skipped by flag",
        )
    started = time.monotonic()
    paths = discover_scenarios(extra_dir)
    findings: List[Finding] = []
    results: List[Dict[str, Any]] = []
    run_count = 0
    fail_count = 0
    error_count = 0

    if not paths:
        return LayerResult(
            layer="L9",
            name="manual",
            status=LayerStatus.SKIP,
            elapsed_ms=0.0,
            detail="no scenarios discovered",
        )

    for path in paths:
        try:
            data = load_scenario(path)
        except Exception as exc:
            error_count += 1
            findings.append(
                Finding(
                    layer="L9",
                    severity="HIGH",
                    location=str(path.relative_to(repo) if path.is_absolute() else path),
                    symptom=f"scenario load failed: {exc}",
                    repro_cmd=f"python -c 'from tools.qa_agent.scenarios import load_scenario; load_scenario({str(path)!r})'",
                )
            )
            continue
        if only and data["id"] != only:
            continue
        run_count += 1
        res = run_scenario(data)
        results.append(res.to_dict())
        if res.status != "PASS":
            (fail_count := fail_count + 1) if res.status == "FAIL" else (
                error_count := error_count + 1
            )
            sev = _SEVERITY_MAP.get(data["severity"].lower(), "HIGH")
            last_step = res.steps[-1] if res.steps else None
            findings.append(
                Finding(
                    layer="L9",
                    severity=sev,
                    location=f"scenario:{data['id']}",
                    symptom=(
                        f"{res.status} at step {last_step.step_id if last_step else '?'}: "
                        f"{(last_step.detail if last_step else res.error or '')[:240]}"
                    ),
                    repro_cmd=f"python -m tools.qa_agent manual --scenario {data['id']}",
                )
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    art = out_dir / "L9_manual.json"
    art.write_text(
        json.dumps(
            {
                "scenarios_discovered": [str(p) for p in paths],
                "filter": only,
                "results": results,
                "counts": {
                    "run": run_count,
                    "pass": run_count - fail_count - error_count,
                    "fail": fail_count,
                    "error": error_count,
                },
            },
            sort_keys=True,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    elapsed = (time.monotonic() - started) * 1000.0
    if only and run_count == 0:
        return LayerResult(
            layer="L9",
            name="manual",
            status=LayerStatus.FAIL,
            elapsed_ms=elapsed,
            findings=[
                Finding(
                    layer="L9",
                    severity="HIGH",
                    location=f"scenario:{only}",
                    symptom=f"no scenario with id={only!r} found",
                    repro_cmd="python -m tools.qa_agent manual",
                )
            ],
            counts={"run": 0, "fail": 0, "error": 0},
            artefact=str(art),
            detail=f"unknown scenario id {only!r}",
        )
    status = LayerStatus.FAIL if (fail_count or error_count) else LayerStatus.PASS
    return LayerResult(
        layer="L9",
        name="manual",
        status=status,
        elapsed_ms=elapsed,
        findings=findings,
        counts={
            "run": run_count,
            "pass": run_count - fail_count - error_count,
            "fail": fail_count,
            "error": error_count,
        },
        artefact=str(art),
        detail=f"{run_count} run · {fail_count} fail · {error_count} error",
    )
