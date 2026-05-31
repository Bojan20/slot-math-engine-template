"""SLOT-MATH `.github/workflows/portfolio-sweep.yml` presence + shape gate.

Validates the CI workflow that runs the full PAR-library batch sweep on
every push, PR, weekly schedule, and manual dispatch.

We assert structure (jobs, triggers, build steps, dashboard output) rather
than YAML semantics — `actionlint` covers the latter and lives in a
separate local/CI step.
"""
from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / ".github" / "workflows" / "portfolio-sweep.yml"


@pytest.fixture(scope="module")
def workflow_text() -> str:
    assert WORKFLOW.is_file(), f"workflow missing: {WORKFLOW}"
    return WORKFLOW.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def workflow_dict() -> dict:
    import yaml
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def test_workflow_file_exists():
    assert WORKFLOW.is_file()


def test_workflow_is_valid_yaml(workflow_dict):
    assert isinstance(workflow_dict, dict)
    assert "jobs" in workflow_dict
    # YAML parses `on:` as a Python boolean True (the key 'on' is reserved)
    # so accept either form.
    assert ("on" in workflow_dict) or (True in workflow_dict), (
        "workflow must declare triggers (on:)"
    )


def test_workflow_has_required_triggers(workflow_dict):
    """push (main), pull_request (main), schedule, workflow_dispatch."""
    on = workflow_dict.get("on") or workflow_dict.get(True)
    assert on is not None
    for trigger in ("push", "pull_request", "schedule", "workflow_dispatch"):
        assert trigger in on, f"workflow missing trigger: {trigger}"


def test_workflow_has_sweep_job(workflow_dict):
    jobs = workflow_dict["jobs"]
    assert "sweep" in jobs, "expected `sweep` job"
    sweep = jobs["sweep"]
    assert sweep.get("runs-on") == "ubuntu-latest"
    assert sweep.get("timeout-minutes", 0) >= 5


def test_workflow_builds_both_rust_binaries(workflow_text):
    """Must build mc_extended_real AND mc_runtime_real."""
    assert "mc_extended_real" in workflow_text
    assert "mc_runtime_real" in workflow_text
    assert "cargo build --release" in workflow_text


def test_workflow_runs_batch_subcommand(workflow_text):
    """Must invoke `slot-math batch` with --mc-spins + --out."""
    assert "tools.par_kernels.cli batch" in workflow_text
    assert "--mc-spins" in workflow_text
    assert "--out" in workflow_text


def test_workflow_uploads_dashboard_artifact(workflow_text):
    """Dashboard must be uploaded as workflow artifact for review."""
    assert "actions/upload-artifact@v4" in workflow_text
    assert "portfolio-dashboard" in workflow_text


def test_workflow_fails_on_red_sweep(workflow_text):
    """Workflow must exit 1 if batch sweep returned non-zero."""
    assert "Fail job on red sweep" in workflow_text
    assert "exit 1" in workflow_text


def test_workflow_posts_pr_comment(workflow_text):
    """On PR, workflow must post/update a dashboard comment."""
    assert "github.event_name == 'pull_request'" in workflow_text
    assert "actions/github-script@v7" in workflow_text
    assert "Portfolio Sweep" in workflow_text


def test_workflow_path_filter_covers_python_and_rust(workflow_dict):
    """Path filter must include both tools/par_kernels/ and the Rust binaries."""
    on = workflow_dict.get("on") or workflow_dict.get(True)
    for trigger in ("push", "pull_request"):
        paths = on[trigger].get("paths", [])
        assert any("tools/par_kernels" in p for p in paths), (
            f"{trigger} filter missing tools/par_kernels/**"
        )
        assert any("mc_extended_real" in p for p in paths), (
            f"{trigger} filter missing mc_extended_real.rs"
        )
        assert any("reports/par-library" in p for p in paths), (
            f"{trigger} filter missing reports/par-library/**"
        )


def test_workflow_concurrency_cancels_in_progress(workflow_dict):
    """Same-ref runs must cancel each other (saves CI minutes on rapid pushes)."""
    conc = workflow_dict.get("concurrency", {})
    assert conc.get("cancel-in-progress") is True
    assert "${{ github.ref }}" in conc.get("group", "")


def test_workflow_emits_job_summary(workflow_text):
    """Dashboard must be appended to GITHUB_STEP_SUMMARY for inline UI view."""
    assert "GITHUB_STEP_SUMMARY" in workflow_text
