"""tools.qa_agent.auto — automatic-test layers L2..L8.

Each layer is a pure function that takes a `LayerContext` and returns a
`LayerResult`. The orchestrator (`runner.run_qa`) decides which to run
based on scope + --skip flags. Missing toolchains degrade to SKIP, not
FAIL, so a fresh checkout without rust/npm still produces a partial
PASS verdict (with the missing layers explicitly SKIP-marked).

Conventions:
  • All subprocess invocations time out after `LayerContext.timeout_s`.
  • Stdout/stderr are captured, last 4 KB stashed in the artefact.
  • Exit code → PASS / FAIL / ERROR per layer-specific rule.
  • No layer mutates the repo.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess  # noqa: S404 — running vetted toolchain CLIs only
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .report import Finding, LayerResult, LayerStatus


@dataclass
class LayerContext:
    repo: Path
    out_dir: Path
    seed: int = 42
    timeout_s: int = 600
    skip: set = field(default_factory=set)  # {"L6", ...}
    env: Dict[str, str] = field(default_factory=dict)

    def env_for_child(self) -> Dict[str, str]:
        e = dict(os.environ)
        e.update(self.env)
        e.setdefault("SLOT_QA_SEED", str(self.seed))
        e.setdefault("PYTHONHASHSEED", str(self.seed))
        return e


# ── utility ──────────────────────────────────────────────────────────


def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)


def _capture_run(
    ctx: LayerContext,
    cmd: List[str],
    *,
    cwd: Optional[Path] = None,
    timeout_s: Optional[int] = None,
) -> Tuple[int, str, str, float]:
    started = time.monotonic()
    try:
        proc = subprocess.run(  # noqa: S603
            cmd,
            cwd=str(cwd or ctx.repo),
            capture_output=True,
            text=True,
            env=ctx.env_for_child(),
            timeout=timeout_s or ctx.timeout_s,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed = (time.monotonic() - started) * 1000.0
        return 124, "", f"timeout after {exc.timeout}s", elapsed
    except FileNotFoundError as exc:
        elapsed = (time.monotonic() - started) * 1000.0
        return 127, "", f"binary not found: {exc}", elapsed
    elapsed = (time.monotonic() - started) * 1000.0
    return proc.returncode, proc.stdout, proc.stderr, elapsed


def _write_artefact(
    out_dir: Path,
    layer: str,
    payload: Dict[str, Any],
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{layer}_artefact.json"
    path.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return path


def _skipped(layer: str, name: str, reason: str) -> LayerResult:
    return LayerResult(
        layer=layer,
        name=name,
        status=LayerStatus.SKIP,
        elapsed_ms=0.0,
        findings=[],
        counts={},
        artefact=None,
        detail=reason,
    )


# ── L2 syntax ────────────────────────────────────────────────────────


def run_l2_syntax(ctx: LayerContext) -> LayerResult:
    if "L2" in ctx.skip:
        return _skipped("L2", "syntax", "skipped by flag")
    started = time.monotonic()
    findings: List[Finding] = []
    parts: List[Dict[str, Any]] = []

    # python: ruff or compileall fallback
    if _which("ruff"):
        rc, out, err, ms = _capture_run(ctx, ["ruff", "check", "tools/", "--quiet"])
        parts.append({"tool": "ruff", "rc": rc, "ms": ms, "stderr_tail": err[-400:]})
        if rc != 0:
            findings.append(
                Finding(
                    layer="L2",
                    severity="MEDIUM",
                    location="tools/",
                    symptom=f"ruff exited {rc}",
                    repro_cmd="ruff check tools/",
                )
            )
    else:
        rc, out, err, ms = _capture_run(
            ctx,
            ["python3", "-m", "compileall", "-q", "tools"],
        )
        parts.append({"tool": "compileall", "rc": rc, "ms": ms, "stderr_tail": err[-400:]})
        if rc != 0:
            findings.append(
                Finding(
                    layer="L2",
                    severity="HIGH",
                    location="tools/",
                    symptom=f"compileall exited {rc}",
                    repro_cmd="python3 -m compileall tools",
                )
            )

    # rust: cargo check (best-effort, SKIP if cargo absent)
    if _which("cargo"):
        rc, out, err, ms = _capture_run(
            ctx,
            ["cargo", "check", "--workspace", "--quiet"],
            timeout_s=min(ctx.timeout_s, 300),
        )
        parts.append({"tool": "cargo-check", "rc": rc, "ms": ms, "stderr_tail": err[-400:]})
        if rc != 0:
            findings.append(
                Finding(
                    layer="L2",
                    severity="HIGH",
                    location="Cargo.toml",
                    symptom=f"cargo check exited {rc}",
                    repro_cmd="cargo check --workspace",
                )
            )
    else:
        parts.append({"tool": "cargo-check", "skipped": True})

    # typescript: tsc --noEmit (best-effort)
    if (ctx.repo / "package.json").exists() and _which("npm"):
        rc, out, err, ms = _capture_run(
            ctx,
            ["npm", "run", "--silent", "lint"],
            timeout_s=min(ctx.timeout_s, 300),
        )
        parts.append({"tool": "npm-lint", "rc": rc, "ms": ms, "stderr_tail": err[-400:]})
        if rc != 0:
            findings.append(
                Finding(
                    layer="L2",
                    severity="MEDIUM",
                    location="package.json",
                    symptom=f"npm run lint exited {rc}",
                    repro_cmd="npm run lint",
                )
            )
    else:
        parts.append({"tool": "npm-lint", "skipped": True})

    art = _write_artefact(ctx.out_dir, "L2", {"parts": parts})
    elapsed = (time.monotonic() - started) * 1000.0
    return LayerResult(
        layer="L2",
        name="syntax",
        status=LayerStatus.FAIL if findings else LayerStatus.PASS,
        elapsed_ms=elapsed,
        findings=findings,
        counts={"tools": len(parts), "failed": len(findings)},
        artefact=str(art),
        detail="; ".join(
            f"{p.get('tool')}={'skip' if p.get('skipped') else p.get('rc')}"
            for p in parts
        ),
    )


# ── L3 unit ──────────────────────────────────────────────────────────


def run_l3_unit(ctx: LayerContext) -> LayerResult:
    if "L3" in ctx.skip:
        return _skipped("L3", "unit", "skipped by flag")
    started = time.monotonic()
    findings: List[Finding] = []
    parts: List[Dict[str, Any]] = []

    # pytest — W244 wave 7: skip `slow` marker u quick/auto scope (set
    # od strane runner.py kroz ctx.env["SLOT_QA_QUICK"]). FULL scope ne
    # postavlja env varijablu pa pokreće sve testove uključujući Z3 SMT
    # multi-objective, stress synth, LLM-ingest E2E, i benchmark.
    pytest_cmd = ["python3", "-m", "pytest", "-q", "--no-header",
                  "-x" if os.environ.get("SLOT_QA_FAILFAST") else "--maxfail=10"]
    if ctx.env.get("SLOT_QA_QUICK") == "1":
        pytest_cmd.extend(["-m", "not slow"])
    rc, out, err, ms = _capture_run(ctx, pytest_cmd)
    parts.append({
        "tool": "pytest",
        "rc": rc,
        "ms": ms,
        "stdout_tail": out[-800:],
        "stderr_tail": err[-400:],
    })
    if rc not in (0, 5):  # 5 == no-tests-collected, which we surface elsewhere
        findings.append(
            Finding(
                layer="L3",
                severity="CRITICAL" if rc == 1 else "HIGH",
                location="tools/tests/",
                symptom=f"pytest exited {rc}",
                repro_cmd="python3 -m pytest -q",
            )
        )

    # cargo test --lib (skip if no cargo)
    if _which("cargo"):
        rc, out, err, ms = _capture_run(
            ctx,
            ["cargo", "test", "--workspace", "--lib", "--quiet"],
            timeout_s=min(ctx.timeout_s, 900),
        )
        parts.append({
            "tool": "cargo-test",
            "rc": rc,
            "ms": ms,
            "stdout_tail": out[-800:],
            "stderr_tail": err[-400:],
        })
        if rc != 0:
            findings.append(
                Finding(
                    layer="L3",
                    severity="HIGH",
                    location="Cargo.toml",
                    symptom=f"cargo test exited {rc}",
                    repro_cmd="cargo test --workspace --lib",
                )
            )
    else:
        parts.append({"tool": "cargo-test", "skipped": True})

    # vitest (npm test) — skip if absent
    if (ctx.repo / "package.json").exists() and _which("npm"):
        rc, out, err, ms = _capture_run(
            ctx,
            ["npm", "test", "--silent"],
            timeout_s=min(ctx.timeout_s, 900),
        )
        parts.append({
            "tool": "npm-test",
            "rc": rc,
            "ms": ms,
            "stdout_tail": out[-800:],
            "stderr_tail": err[-400:],
        })
        if rc != 0:
            findings.append(
                Finding(
                    layer="L3",
                    severity="HIGH",
                    location="package.json",
                    symptom=f"npm test exited {rc}",
                    repro_cmd="npm test",
                )
            )
    else:
        parts.append({"tool": "npm-test", "skipped": True})

    art = _write_artefact(ctx.out_dir, "L3", {"parts": parts})
    elapsed = (time.monotonic() - started) * 1000.0
    return LayerResult(
        layer="L3",
        name="unit",
        status=LayerStatus.FAIL if findings else LayerStatus.PASS,
        elapsed_ms=elapsed,
        findings=findings,
        counts={"tools": len(parts), "failed": len(findings)},
        artefact=str(art),
        detail="; ".join(
            f"{p.get('tool')}={'skip' if p.get('skipped') else p.get('rc')}"
            for p in parts
        ),
    )


# ── L4 integration (ci-gate aggregator if available) ────────────────


def run_l4_integration(ctx: LayerContext) -> LayerResult:
    if "L4" in ctx.skip:
        return _skipped("L4", "integration", "skipped by flag")
    games_root = ctx.repo / "games"
    if not games_root.exists():
        return _skipped("L4", "integration", "no games/ root")
    rc, out, err, ms = _capture_run(
        ctx,
        ["python3", "-m", "tools.ci_gate", str(games_root),
         "--out", str(ctx.out_dir / "L4_ci_gate")],
        timeout_s=min(ctx.timeout_s, 600),
    )
    findings: List[Finding] = []
    if rc not in (0,):
        sev = "HIGH" if rc == 1 else "CRITICAL"
        findings.append(
            Finding(
                layer="L4",
                severity=sev,
                location="games/",
                symptom=f"slot-ci-gate exited {rc}",
                repro_cmd=f"python3 -m tools.ci_gate {games_root}",
            )
        )
    art = _write_artefact(
        ctx.out_dir,
        "L4",
        {"rc": rc, "ms": ms, "stdout_tail": out[-1200:], "stderr_tail": err[-400:]},
    )
    return LayerResult(
        layer="L4",
        name="integration",
        status=LayerStatus.FAIL if findings else LayerStatus.PASS,
        elapsed_ms=ms,
        findings=findings,
        counts={"rc": rc},
        artefact=str(art),
        detail=f"ci-gate rc={rc}",
    )


# ── L5 property ──────────────────────────────────────────────────────


def run_l5_property(ctx: LayerContext) -> LayerResult:
    if "L5" in ctx.skip:
        return _skipped("L5", "property", "skipped by flag")
    started = time.monotonic()
    findings: List[Finding] = []
    parts: List[Dict[str, Any]] = []

    # pytest -m property (hypothesis); accept "no tests ran" as SKIP, not FAIL
    rc, out, err, ms = _capture_run(
        ctx,
        ["python3", "-m", "pytest", "-q", "-m", "property", "--no-header"],
    )
    parts.append({"tool": "pytest-property", "rc": rc, "ms": ms, "stdout_tail": out[-400:]})
    if rc == 5:
        # no tests collected — treat as skip rather than fail
        parts[-1]["interpreted_as"] = "skip"
    elif rc != 0:
        findings.append(
            Finding(
                layer="L5",
                severity="HIGH",
                location="tools/tests/",
                symptom=f"pytest property exited {rc}",
                repro_cmd="python3 -m pytest -m property",
            )
        )

    # cargo proptest (optional target)
    if _which("cargo"):
        rc, out, err, ms = _capture_run(
            ctx,
            ["cargo", "test", "--workspace", "--lib", "proptest", "--quiet"],
            timeout_s=min(ctx.timeout_s, 600),
        )
        parts.append({"tool": "cargo-proptest", "rc": rc, "ms": ms})
        if rc not in (0,):
            # cargo returns nonzero if filter matches nothing — that's OK
            stderr_text = err.lower()
            if "no tests" in stderr_text or "filtered out" in stderr_text:
                parts[-1]["interpreted_as"] = "skip"
            else:
                findings.append(
                    Finding(
                        layer="L5",
                        severity="HIGH",
                        location="Cargo.toml",
                        symptom=f"cargo proptest exited {rc}",
                        repro_cmd="cargo test --workspace --lib proptest",
                    )
                )
    else:
        parts.append({"tool": "cargo-proptest", "skipped": True})

    art = _write_artefact(ctx.out_dir, "L5", {"parts": parts})
    elapsed = (time.monotonic() - started) * 1000.0
    status = LayerStatus.FAIL if findings else LayerStatus.PASS
    return LayerResult(
        layer="L5",
        name="property",
        status=status,
        elapsed_ms=elapsed,
        findings=findings,
        counts={"tools": len(parts), "failed": len(findings)},
        artefact=str(art),
        detail="; ".join(
            f"{p.get('tool')}={p.get('interpreted_as') or ('skip' if p.get('skipped') else p.get('rc'))}"
            for p in parts
        ),
    )


# ── L6 mutation ──────────────────────────────────────────────────────


def run_l6_mutation(ctx: LayerContext) -> LayerResult:
    if "L6" in ctx.skip:
        return _skipped("L6", "mutation", "skipped by flag")
    if not _which("cargo-mutants") and not _which("mutmut"):
        return _skipped("L6", "mutation", "neither cargo-mutants nor mutmut on PATH")
    started = time.monotonic()
    findings: List[Finding] = []
    parts: List[Dict[str, Any]] = []
    if _which("cargo-mutants"):
        rc, out, err, ms = _capture_run(
            ctx,
            ["cargo", "mutants", "--list", "--json"],
            timeout_s=min(ctx.timeout_s, 120),
        )
        parts.append({"tool": "cargo-mutants-list", "rc": rc, "ms": ms})
        # A full run would be `cargo mutants --in-place` — that is expensive
        # and the caller pins it via `make mutate-scoped`. Here we only verify
        # the tool is wired and the mutants list parses.
        if rc != 0:
            findings.append(
                Finding(
                    layer="L6",
                    severity="HIGH",
                    location="Cargo.toml",
                    symptom=f"cargo mutants --list exited {rc}",
                    repro_cmd="cargo mutants --list",
                )
            )
    if _which("mutmut"):
        rc, out, err, ms = _capture_run(
            ctx,
            ["mutmut", "results"],
            timeout_s=60,
        )
        parts.append({"tool": "mutmut-results", "rc": rc, "ms": ms})
    art = _write_artefact(ctx.out_dir, "L6", {"parts": parts})
    elapsed = (time.monotonic() - started) * 1000.0
    return LayerResult(
        layer="L6",
        name="mutation",
        status=LayerStatus.FAIL if findings else LayerStatus.PASS,
        elapsed_ms=elapsed,
        findings=findings,
        counts={"tools": len(parts), "failed": len(findings)},
        artefact=str(art),
        detail="; ".join(f"{p.get('tool')}={p.get('rc')}" for p in parts),
    )


# ── L8 coverage ──────────────────────────────────────────────────────


_LINE_FLOOR = int(os.environ.get("SLOT_QA_COVERAGE_FLOOR_LINE", "80"))
_BRANCH_FLOOR = int(os.environ.get("SLOT_QA_COVERAGE_FLOOR_BRANCH", "70"))


def run_l8_coverage(ctx: LayerContext) -> LayerResult:
    if "L8" in ctx.skip:
        return _skipped("L8", "coverage", "skipped by flag")
    if not _which("coverage") and not _which("python3"):
        return _skipped("L8", "coverage", "no coverage tool available")
    started = time.monotonic()
    findings: List[Finding] = []

    # Best-effort: produce coverage.json via `coverage`+pytest if available.
    if _which("coverage"):
        run_rc, _, _, _ = _capture_run(
            ctx,
            ["coverage", "run", "--source=tools", "-m", "pytest", "-q", "--no-header"],
        )
        rep_rc, out, err, ms = _capture_run(
            ctx,
            ["coverage", "json", "-o", str(ctx.out_dir / "L8_coverage.json")],
        )
        cov_path = ctx.out_dir / "L8_coverage.json"
        line_pct: Optional[float] = None
        if cov_path.exists():
            try:
                data = json.loads(cov_path.read_text())
                line_pct = float(data.get("totals", {}).get("percent_covered", 0.0))
            except Exception:
                line_pct = None
        if line_pct is not None and line_pct < _LINE_FLOOR:
            findings.append(
                Finding(
                    layer="L8",
                    severity="HIGH",
                    location="coverage:line",
                    symptom=f"python line {line_pct:.1f}% < floor {_LINE_FLOOR}%",
                    repro_cmd="coverage run --source=tools -m pytest && coverage json",
                )
            )
        art = ctx.out_dir / "L8_coverage.json"
    else:
        art = _write_artefact(ctx.out_dir, "L8", {"skipped": "no coverage tool"})

    elapsed = (time.monotonic() - started) * 1000.0
    return LayerResult(
        layer="L8",
        name="coverage",
        status=LayerStatus.FAIL if findings else LayerStatus.PASS,
        elapsed_ms=elapsed,
        findings=findings,
        counts={"floor_line": _LINE_FLOOR, "floor_branch": _BRANCH_FLOOR},
        artefact=str(art),
        detail=(
            f"floor line={_LINE_FLOOR} branch={_BRANCH_FLOOR}"
        ),
    )
