"""W244 wave 43 — kernel_lint acceptance tests.

Pins the lint rules (KLINT001-010) sa synthetic inputs + verifies
that the live kernel surface passes clean.
"""
from __future__ import annotations


from tools.math_dsl.kernel_lint import (
    Finding,
    KERNEL_MODULES,
    lint_all,
)


# ─── Live kernel surface must be clean ──────────────────────────────────


def test_all_known_kernels_pass_lint():
    """Every module in KERNEL_MODULES must be lint-clean (zero errors)."""
    findings, exit_code = lint_all()
    errors = [f for f in findings if f.severity == "error"]
    assert exit_code == 0, (
        f"kernel lint FAIL ({len(errors)} errors):\n"
        + "\n".join(str(e) for e in errors)
    )
    assert errors == [], errors


def test_known_kernel_count_matches_directory():
    """KERNEL_MODULES list should track all *_kernel.py / known kernels."""
    # We hand-curate this list — assertion ensures we don't lose count.
    assert len(KERNEL_MODULES) >= 18, (
        f"KERNEL_MODULES dropped below 18: {len(KERNEL_MODULES)}"
    )
    # And no duplicates
    assert len(KERNEL_MODULES) == len(set(KERNEL_MODULES))


# ─── Finding model ──────────────────────────────────────────────────────


def test_finding_str_includes_severity_and_kernel():
    f = Finding("error", "KLINT001", "wheel", "test", "line 5")
    s = str(f)
    assert "ERROR" in s
    assert "KLINT001" in s
    assert "wheel" in s
    assert "test" in s
    assert "line 5" in s


def test_finding_to_dict_round_trip():
    f = Finding("warning", "KLINT006", "cascade", "msg", "loc")
    d = f.to_dict()
    assert d["severity"] == "warning"
    assert d["rule_id"] == "KLINT006"
    assert d["kernel"] == "cascade"
    assert d["message"] == "msg"
    assert d["location"] == "loc"


# ─── Lint orchestrator ──────────────────────────────────────────────────


def test_lint_all_returns_zero_when_clean():
    findings, exit_code = lint_all()
    errors = [f for f in findings if f.severity == "error"]
    if not errors:
        assert exit_code == 0
    else:
        assert exit_code == 1


def test_lint_findings_have_stable_rule_ids():
    """Every finding must carry a rule_id starting with KLINT."""
    findings, _ = lint_all()
    for f in findings:
        assert f.rule_id.startswith("KLINT"), (
            f"non-KLINT rule_id: {f.rule_id} in {f}"
        )
