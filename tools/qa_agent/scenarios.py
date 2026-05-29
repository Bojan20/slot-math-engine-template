"""tools.qa_agent.scenarios — manual scenario loader, validator, runner.

Schema (v1):

  schema: urn:slotmath:qa-agent:scenario:v1
  id: <kebab-case unique>
  title: <human title>
  severity: critical | high | medium | low
  preconditions: [str, ...]            # informational, not enforced
  steps:
    - id: step_<n>
      action: shell | py-assert | env-check
      cmd: <bash command | python expression | env var name>
      expect:
        exit: <int>                    # for shell only
        stdout_re: "<regex>"           # optional
        stderr_re: "<regex>"           # optional
        max_ms: <int>                  # optional wall-clock cap
  postconditions: [str, ...]           # informational
  on_fail:
    quarantine: <bool>
    link_antibody: <id | null>

Step actions:
  • shell      — run `cmd` via /bin/sh, check exit/stdout/stderr.
  • py-assert  — eval `cmd` as a python expression; truthy == PASS.
  • env-check  — verify env var `cmd` is set and non-empty.

Determinism: scenario PASS hash is computed from (id, sorted step ids,
step actions). Wall-clock + stdout snapshots are stored separately so the
canonical hash stays stable across runs.
"""
from __future__ import annotations

import os
import re
import subprocess  # noqa: S404 — required for shell scenario steps; cmds vetted.
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit("ERR: pyyaml required for tools.qa_agent") from exc


SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"
SCHEMA_V1 = "urn:slotmath:qa-agent:scenario:v1"
VALID_SEVERITY = {"critical", "high", "medium", "low"}
VALID_ACTIONS = {"shell", "py-assert", "env-check"}
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")


@dataclass
class StepResult:
    step_id: str
    action: str
    status: str  # PASS | FAIL | ERROR
    elapsed_ms: int
    detail: str = ""


@dataclass
class ScenarioResult:
    scenario_id: str
    title: str
    severity: str
    status: str  # PASS | FAIL | ERROR
    steps: List[StepResult] = field(default_factory=list)
    elapsed_ms: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "title": self.title,
            "severity": self.severity,
            "status": self.status,
            "elapsed_ms": self.elapsed_ms,
            "error": self.error,
            "steps": [s.__dict__ for s in self.steps],
        }


def load_scenario(path: Path) -> Dict[str, Any]:
    """Load + parse YAML. Raises ValueError on schema break."""
    if not path.exists():
        raise FileNotFoundError(f"scenario missing: {path}")
    data = yaml.safe_load(path.read_text()) or {}
    errors = validate_scenario(data)
    if errors:
        raise ValueError(f"scenario {path.name} invalid: {errors}")
    return data


def validate_scenario(data: Dict[str, Any]) -> List[str]:
    """Return list of validation errors. Empty list == valid."""
    errs: List[str] = []
    if not isinstance(data, dict):
        return ["root must be a mapping"]
    if data.get("schema") != SCHEMA_V1:
        errs.append(f"schema must be {SCHEMA_V1!r}")
    sid = data.get("id")
    if not isinstance(sid, str) or not _ID_RE.match(sid):
        errs.append("id must match ^[a-z0-9][a-z0-9_-]{1,63}$")
    if not isinstance(data.get("title"), str) or not data["title"].strip():
        errs.append("title must be a non-empty string")
    sev = data.get("severity")
    if sev not in VALID_SEVERITY:
        errs.append(f"severity must be one of {sorted(VALID_SEVERITY)}")
    steps = data.get("steps")
    if not isinstance(steps, list) or not steps:
        errs.append("steps must be a non-empty list")
        return errs
    seen_step_ids: set = set()
    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            errs.append(f"step[{i}] not a mapping")
            continue
        step_id = step.get("id")
        if not isinstance(step_id, str) or not _ID_RE.match(step_id or ""):
            errs.append(f"step[{i}].id invalid")
        elif step_id in seen_step_ids:
            errs.append(f"step[{i}].id duplicate: {step_id}")
        else:
            seen_step_ids.add(step_id)
        action = step.get("action")
        if action not in VALID_ACTIONS:
            errs.append(f"step[{i}].action must be in {sorted(VALID_ACTIONS)}")
        if not isinstance(step.get("cmd"), str) or not step["cmd"]:
            errs.append(f"step[{i}].cmd must be a non-empty string")
        expect = step.get("expect", {})
        if expect and not isinstance(expect, dict):
            errs.append(f"step[{i}].expect must be a mapping")
    return errs


def discover_scenarios(extra_dir: Optional[Path] = None) -> List[Path]:
    """Return all *.yaml scenario files under SCENARIOS_DIR (+ optional extra)."""
    out: List[Path] = []
    if SCENARIOS_DIR.exists():
        out.extend(sorted(SCENARIOS_DIR.glob("*.yaml")))
    if extra_dir and extra_dir.exists():
        out.extend(sorted(p for p in extra_dir.glob("*.yaml") if p not in out))
    return out


def _run_shell_step(
    cmd: str,
    expect: Dict[str, Any],
    env: Dict[str, str],
    timeout_ms: int,
) -> StepResult:
    started = time.monotonic()
    try:
        completed = subprocess.run(  # noqa: S602
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=max(0.05, timeout_ms / 1000.0),
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed = int((time.monotonic() - started) * 1000)
        return StepResult(
            step_id="",
            action="shell",
            status="FAIL",
            elapsed_ms=elapsed,
            detail=f"timeout after {timeout_ms}ms: {exc}",
        )
    except Exception as exc:
        elapsed = int((time.monotonic() - started) * 1000)
        return StepResult(
            step_id="",
            action="shell",
            status="ERROR",
            elapsed_ms=elapsed,
            detail=f"subprocess error: {exc!r}",
        )
    elapsed = int((time.monotonic() - started) * 1000)
    exp_exit = expect.get("exit", 0)
    if completed.returncode != exp_exit:
        return StepResult(
            step_id="",
            action="shell",
            status="FAIL",
            elapsed_ms=elapsed,
            detail=(
                f"exit {completed.returncode} != expected {exp_exit}; "
                f"stdout={completed.stdout[-200:]!r} stderr={completed.stderr[-200:]!r}"
            ),
        )
    if (pat := expect.get("stdout_re")) and not re.search(pat, completed.stdout):
        return StepResult(
            step_id="",
            action="shell",
            status="FAIL",
            elapsed_ms=elapsed,
            detail=f"stdout_re miss: /{pat}/ against {completed.stdout[-200:]!r}",
        )
    if (pat := expect.get("stderr_re")) and not re.search(pat, completed.stderr):
        return StepResult(
            step_id="",
            action="shell",
            status="FAIL",
            elapsed_ms=elapsed,
            detail=f"stderr_re miss: /{pat}/ against {completed.stderr[-200:]!r}",
        )
    return StepResult(step_id="", action="shell", status="PASS", elapsed_ms=elapsed)


def _run_py_assert_step(expr: str) -> StepResult:
    started = time.monotonic()
    try:
        # py-assert is intentionally restricted to a tiny safe namespace —
        # scenarios are repo-vendored, not user-supplied, so the threat
        # model is "typo / breaking change", not "untrusted input".
        ns = {
            "__builtins__": {
                "len": len, "abs": abs, "sum": sum, "min": min, "max": max,
                "any": any, "all": all,
                # Vendored scenarios use __import__('pathlib') to probe filesystem
                # state without polluting the namespace with `from x import y`.
                "__import__": __import__,
            }
        }
        ok = bool(eval(expr, ns))  # noqa: S307 — vetted vendored expressions only
    except Exception as exc:
        elapsed = int((time.monotonic() - started) * 1000)
        return StepResult(
            step_id="",
            action="py-assert",
            status="ERROR",
            elapsed_ms=elapsed,
            detail=f"py-assert raised: {exc!r}",
        )
    elapsed = int((time.monotonic() - started) * 1000)
    return StepResult(
        step_id="",
        action="py-assert",
        status="PASS" if ok else "FAIL",
        elapsed_ms=elapsed,
        detail="" if ok else f"py-assert falsy: {expr!r}",
    )


def _run_env_check_step(name: str) -> StepResult:
    val = os.environ.get(name)
    if val is None or val == "":
        return StepResult(
            step_id="",
            action="env-check",
            status="FAIL",
            elapsed_ms=0,
            detail=f"env {name!r} unset/empty",
        )
    return StepResult(step_id="", action="env-check", status="PASS", elapsed_ms=0)


def run_scenario(
    data: Dict[str, Any],
    *,
    env: Optional[Dict[str, str]] = None,
    default_timeout_ms: int = 30_000,
) -> ScenarioResult:
    """Execute every step. Stop on first non-PASS but record outcome."""
    sid = data["id"]
    res = ScenarioResult(
        scenario_id=sid,
        title=data["title"],
        severity=data["severity"],
        status="PASS",
    )
    started = time.monotonic()
    run_env = dict(os.environ if env is None else env)
    for step in data["steps"]:
        action = step["action"]
        cmd = step["cmd"]
        expect = step.get("expect", {}) or {}
        timeout = int(expect.get("max_ms", default_timeout_ms))
        if action == "shell":
            sr = _run_shell_step(cmd, expect, run_env, timeout)
        elif action == "py-assert":
            sr = _run_py_assert_step(cmd)
        elif action == "env-check":
            sr = _run_env_check_step(cmd)
        else:
            sr = StepResult(
                step_id=step.get("id", "?"),
                action=action,
                status="ERROR",
                elapsed_ms=0,
                detail=f"unknown action {action!r}",
            )
        sr.step_id = step["id"]
        sr.action = action
        res.steps.append(sr)
        if sr.status != "PASS":
            res.status = sr.status  # propagate FAIL/ERROR
            break
    res.elapsed_ms = int((time.monotonic() - started) * 1000)
    return res
