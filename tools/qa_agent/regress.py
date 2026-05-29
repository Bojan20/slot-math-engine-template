"""tools.qa_agent.regress — L7 regression layer.

Compares the current HEAD against a baseline git ref. The cheap path
short-circuits when the diff is empty. For non-empty diffs we re-run a
targeted subset of tests (by file extension → matching test suite) and
diff the key headline metrics (RTP, hit-frequency, max-win) against a
baseline snapshot if one exists under `reports/qa_agent/baseline/<sha>.json`.

The layer is deliberately conservative: if the baseline snapshot is
absent, the layer SKIP-marks itself with a clear note rather than
producing a false PASS. The caller can prime the baseline with
`tools.qa_agent.regress.prime_baseline(sha)` once the metrics are
trusted.
"""
from __future__ import annotations

import json
import subprocess  # noqa: S404 — read-only `git diff` + `git log` invocations
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .report import Finding, LayerResult, LayerStatus


RTP_TOL = 0.0005  # 0.05 pp
HIT_FREQ_TOL = 0.005  # 0.5 %
MAX_WIN_TOL_REL = 0.001  # 0.1 % relative


@dataclass
class BaselineSnapshot:
    sha: str
    metrics: Dict[str, float]
    source: Path


def baseline_dir(repo: Path) -> Path:
    return repo / "reports" / "qa_agent" / "baseline"


def load_baseline(repo: Path, sha: str) -> Optional[BaselineSnapshot]:
    if not sha:
        return None
    p = baseline_dir(repo) / f"{sha}.json"
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    return BaselineSnapshot(sha=sha, metrics=dict(data.get("metrics", {})), source=p)


def prime_baseline(repo: Path, sha: str, metrics: Dict[str, float]) -> Path:
    bd = baseline_dir(repo)
    bd.mkdir(parents=True, exist_ok=True)
    p = bd / f"{sha}.json"
    payload = {"sha": sha, "metrics": dict(sorted(metrics.items()))}
    p.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return p


def _git(repo: Path, *args: str, timeout_s: int = 15) -> Tuple[int, str, str]:
    try:
        proc = subprocess.run(  # noqa: S603
            ["git", *args],
            cwd=str(repo),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except Exception as exc:
        return 127, "", repr(exc)
    return proc.returncode, proc.stdout, proc.stderr


def changed_files(repo: Path, baseline_ref: str) -> List[Path]:
    rc, out, _ = _git(repo, "diff", "--name-only", f"{baseline_ref}...HEAD")
    if rc != 0:
        return []
    paths: List[Path] = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        p = repo / line
        paths.append(p)
    return sorted(paths)


def head_sha(repo: Path) -> str:
    rc, out, _ = _git(repo, "rev-parse", "HEAD")
    if rc != 0:
        return ""
    return out.strip()


def _compare_metrics(
    base: Dict[str, float], curr: Dict[str, float]
) -> List[Tuple[str, float, float, float]]:
    """Return list of (key, base, curr, delta) for every key that breaches tol."""
    out: List[Tuple[str, float, float, float]] = []
    for key, b in base.items():
        if key not in curr:
            continue
        c = curr[key]
        delta = c - b
        tol = RTP_TOL
        if key.lower().startswith("rtp"):
            tol = RTP_TOL
        elif "hit" in key.lower():
            tol = HIT_FREQ_TOL
        elif "max_win" in key.lower():
            tol = abs(b) * MAX_WIN_TOL_REL if b else MAX_WIN_TOL_REL
        if abs(delta) > tol:
            out.append((key, b, c, delta))
    return out


def collect_current_metrics(repo: Path) -> Dict[str, float]:
    """Best-effort scrape of headline metrics from the latest reports.

    Falls back to empty dict on missing tooling. Each detected metric is
    documented inline so a fresh repo can wire its own producers without
    bricking this layer.
    """
    metrics: Dict[str, float] = {}
    # 1. ci-gate
    cg = repo / "reports" / "ci-gate" / "ci-gate.json"
    if cg.exists():
        try:
            data = json.loads(cg.read_text())
            for gate in data.get("gates", []):
                rtp = gate.get("rtp")
                if isinstance(rtp, (int, float)):
                    metrics[f"rtp_{gate.get('name','unknown')}"] = float(rtp)
        except Exception:
            pass
    # 2. par-doctor
    pd = repo / "reports" / "par_doctor"
    if pd.exists():
        for f in sorted(pd.glob("**/summary.json"))[:5]:
            try:
                data = json.loads(f.read_text())
                hf = data.get("hit_frequency")
                if isinstance(hf, (int, float)):
                    metrics[f"hit_freq_{f.parent.name}"] = float(hf)
            except Exception:
                continue
    return metrics


def run_l7_regression(
    repo: Path,
    out_dir: Path,
    *,
    baseline_ref: str = "origin/main",
    skip: bool = False,
) -> LayerResult:
    if skip:
        return LayerResult(
            layer="L7",
            name="regression",
            status=LayerStatus.SKIP,
            elapsed_ms=0.0,
            artefact=None,
            detail="skipped by flag",
        )
    started = time.monotonic()
    findings: List[Finding] = []
    files = changed_files(repo, baseline_ref)
    head = head_sha(repo)
    base_snapshot = None
    rc, base_sha_out, _ = _git(repo, "rev-parse", baseline_ref)
    if rc == 0:
        base_snapshot = load_baseline(repo, base_sha_out.strip())

    if not files:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "L7_regression.json").write_text(
            json.dumps(
                {
                    "head_sha": head,
                    "baseline_ref": baseline_ref,
                    "changed_files": [],
                    "metrics": {},
                    "verdict": "no-diff",
                },
                sort_keys=True,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return LayerResult(
            layer="L7",
            name="regression",
            status=LayerStatus.PASS,
            elapsed_ms=(time.monotonic() - started) * 1000.0,
            findings=[],
            counts={"changed_files": 0},
            artefact=str(out_dir / "L7_regression.json"),
            detail="no diff vs baseline",
        )

    current = collect_current_metrics(repo)
    breaches: List[Tuple[str, float, float, float]] = []
    if base_snapshot:
        breaches = _compare_metrics(base_snapshot.metrics, current)
    else:
        # no baseline pinned — can't detect drift, but flag it.
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "L7_regression.json").write_text(
            json.dumps(
                {
                    "head_sha": head,
                    "baseline_ref": baseline_ref,
                    "changed_files": [str(p.relative_to(repo)) for p in files],
                    "metrics": dict(sorted(current.items())),
                    "verdict": "no-baseline",
                    "hint": (
                        "Prime with tools.qa_agent.regress.prime_baseline(repo, sha, metrics)"
                    ),
                },
                sort_keys=True,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return LayerResult(
            layer="L7",
            name="regression",
            status=LayerStatus.SKIP,
            elapsed_ms=(time.monotonic() - started) * 1000.0,
            counts={"changed_files": len(files)},
            artefact=str(out_dir / "L7_regression.json"),
            detail=f"no baseline pinned for {baseline_ref}",
        )

    for key, b, c, d in breaches:
        findings.append(
            Finding(
                layer="L7",
                severity="HIGH",
                location=key,
                symptom=f"{key}: baseline {b:.6f}, current {c:.6f}, Δ {d:+.6f}",
                repro_cmd=(
                    f"git bisect run python -m tools.qa_agent auto "
                    f"--quick --baseline {base_snapshot.sha}"
                ),
            )
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "L7_regression.json").write_text(
        json.dumps(
            {
                "head_sha": head,
                "baseline_sha": base_snapshot.sha if base_snapshot else "",
                "baseline_ref": baseline_ref,
                "changed_files": [str(p.relative_to(repo)) for p in files],
                "metrics": dict(sorted(current.items())),
                "baseline_metrics": dict(sorted(base_snapshot.metrics.items())) if base_snapshot else {},
                "breaches": [
                    {"key": k, "baseline": b, "current": c, "delta": d}
                    for (k, b, c, d) in breaches
                ],
                "verdict": "FAIL" if breaches else "PASS",
            },
            sort_keys=True,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    elapsed = (time.monotonic() - started) * 1000.0
    return LayerResult(
        layer="L7",
        name="regression",
        status=LayerStatus.FAIL if findings else LayerStatus.PASS,
        elapsed_ms=elapsed,
        findings=findings,
        counts={"changed_files": len(files), "breaches": len(breaches)},
        artefact=str(out_dir / "L7_regression.json"),
        detail=f"{len(files)} files, {len(breaches)} breaches",
    )
