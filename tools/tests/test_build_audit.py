"""PHASE 44 — Build Section Audit tests.

Pins the regulator-grade contract for the three-agent Build audit:

  * Build Button Auditor catches missing elements, unwired handlers,
    silent catch blocks, and missing accessibility surfaces.
  * Weight Precision Auditor proves Fraction-exact RTP reproduces
    the float pipeline within 1e-9.
  * Math Algorithm Auditor proves every closed-form quantity matches
    an independent Fraction-exact derivation within 1e-9.
  * The harness aggregates per-agent verdicts into one overall verdict
    and emits both JSON + Markdown for the regulator deliverable.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from tools.build_audit import (
    BUILD_BUTTON_IDS,
    audit_build_buttons,
    audit_math_algorithms,
    audit_weight_precision,
    run_full_audit,
)
from tools.build_audit.button_auditor import (
    _extract_build_panel,
    _extract_click_handler_bodies,
    _has_silent_catch,
)
from tools.build_audit.weight_auditor import _fraction_rtp_from_ir, _reference_ir


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── Button Auditor — handler extraction ──────────────────────────────────


def test_handler_extraction_arrow_with_body():
    js = textwrap.dedent("""
        $("#btn-foo").addEventListener("click", () => {
          doStuff();
          try { ok(); } catch (e) { console.warn(e); }
        });
    """)
    bodies = _extract_click_handler_bodies(js, "btn-foo")
    assert len(bodies) == 1
    assert "doStuff" in bodies[0]


def test_handler_extraction_arrow_expression():
    js = '$("#btn-bar").addEventListener("click", () => doAutoBalance("manual"));'
    bodies = _extract_click_handler_bodies(js, "btn-bar")
    assert len(bodies) == 1


def test_handler_extraction_named_function_thunk():
    js = textwrap.dedent("""
        function handleClick() {
          try { foo(); } catch (e) {}
        }
        $("#btn-baz").addEventListener("click", () => handleClick());
    """)
    bodies = _extract_click_handler_bodies(js, "btn-baz")
    # Should resolve the named function body.
    assert any("foo()" in b for b in bodies)


# ─── Silent-catch detection ───────────────────────────────────────────────


def test_silent_catch_detected_in_handler():
    js = textwrap.dedent("""
        $("#btn-foo").addEventListener("click", () => {
          try { x(); } catch (e) {}
        });
    """)
    assert _has_silent_catch(js, "btn-foo")


def test_silent_catch_with_console_warn_is_clean():
    js = textwrap.dedent("""
        $("#btn-foo").addEventListener("click", () => {
          try { x(); } catch (e) { console.warn(e); }
        });
    """)
    assert not _has_silent_catch(js, "btn-foo")


def test_silent_catch_with_toast_is_clean():
    js = textwrap.dedent("""
        $("#btn-foo").addEventListener("click", () => {
          try { x(); } catch (e) { toast({ msg: "fail" }); }
        });
    """)
    assert not _has_silent_catch(js, "btn-foo")


def test_silent_catch_does_NOT_leak_from_neighbour_handlers():
    """Critical regression: an empty catch in the previous handler's
    body must NOT taint the audit for the next button id."""
    js = textwrap.dedent("""
        $("#btn-prev").addEventListener("click", () => {
          try { x(); } catch (e) {}
        });
        $("#btn-cur").addEventListener("click", () => {
          try { y(); } catch (e) { console.warn(e); }
        });
    """)
    assert _has_silent_catch(js, "btn-prev")
    assert not _has_silent_catch(js, "btn-cur")


# ─── Build panel extraction ───────────────────────────────────────────────


def test_extract_build_panel_returns_section_body():
    html = textwrap.dedent("""
        <body>
          <section id="panel-build">
            <button id="btn-x"></button>
          </section>
          <section id="other">
            <button id="btn-y"></button>
          </section>
        </body>
    """)
    panel = _extract_build_panel(html)
    assert "btn-x" in panel
    assert "btn-y" not in panel


def test_extract_build_panel_missing_returns_empty():
    html = "<body><section>no build panel here</section></body>"
    panel = _extract_build_panel(html)
    assert panel == ""


# ─── End-to-end button audit ──────────────────────────────────────────────


def test_audit_build_buttons_returns_finding_per_id():
    findings = audit_build_buttons(REPO_ROOT)
    ids = {f.button_id for f in findings}
    assert ids == {bid for bid, _, _ in BUILD_BUTTON_IDS}


def test_every_build_button_passes_audit():
    """Repo-state regression: every Build-section button must pass the
    audit on `main`. If this trips, fix the button before merge."""
    findings = audit_build_buttons(REPO_ROOT)
    fails = [f for f in findings if f.verdict == "FAIL"]
    assert not fails, f"FAILED buttons: {[(f.button_id, f.fixes) for f in fails]}"


def test_audit_handles_missing_studio_bundle(tmp_path: Path):
    """Stock-checkout safety: when the studio bundle is missing, every
    button surfaces with element_found=False instead of crashing."""
    findings = audit_build_buttons(tmp_path)
    assert all(not f.element_found for f in findings)
    assert all(f.verdict == "FAIL" for f in findings)


# ─── Weight precision auditor ─────────────────────────────────────────────


def test_weight_audit_reference_ir_rtp_in_band():
    """The reference IR must land in the UKGC RTS-12 advisory band so
    the math algorithm auditor's sanity check passes."""
    f_rtp = _fraction_rtp_from_ir(_reference_ir())
    assert f_rtp is not None
    assert 0.50 <= float(f_rtp) <= 1.05, f"reference RTP {float(f_rtp)} out of band"


def test_weight_audit_all_checks_pass_on_reference():
    findings = audit_weight_precision()
    fails = [c for c in findings if c.verdict == "FAIL"]
    assert not fails, f"FAILED weight checks: {[(c.check_id, c.detail) for c in fails]}"


def test_weight_audit_drift_under_tolerance():
    findings = audit_weight_precision()
    for c in findings:
        if c.drift is not None:
            assert c.drift <= c.tolerance, (
                f"{c.check_id}: drift {c.drift:.2e} > tolerance {c.tolerance:.0e}"
            )


# ─── Math algorithm auditor ───────────────────────────────────────────────


def test_math_audit_all_algorithms_pass_on_reference():
    findings = audit_math_algorithms()
    fails = [m for m in findings if m.verdict == "FAIL"]
    assert not fails, (
        f"FAILED math algorithms: {[(m.algorithm, m.drift) for m in fails]}"
    )


def test_math_audit_rtp_drift_under_1e_9():
    findings = audit_math_algorithms()
    rtp_check = next((m for m in findings if m.algorithm == "rtp_closed_form"), None)
    assert rtp_check is not None
    assert rtp_check.drift is not None
    assert rtp_check.drift < 1e-9


def test_math_audit_hit_freq_in_unit_interval():
    findings = audit_math_algorithms()
    hf = next((m for m in findings if m.algorithm == "hit_frequency"), None)
    assert hf is not None
    assert hf.engine_value is not None
    assert 0.0 <= hf.engine_value <= 1.0


# ─── Full harness ─────────────────────────────────────────────────────────


def test_run_full_audit_writes_artefacts(tmp_path: Path):
    out = tmp_path / "build_audit"
    report = run_full_audit(REPO_ROOT, out_dir=out)
    assert (out / "audit.json").exists()
    assert (out / "SUMMARY.md").exists()
    body = (out / "SUMMARY.md").read_text()
    assert "# Build Section Audit" in body
    assert "Overall verdict" in body
    # Repo-state regression: overall must be PASS on main.
    assert report.summary["overall_verdict"] == "PASS"


def test_run_full_audit_emits_valid_schema(tmp_path: Path):
    out = tmp_path / "build_audit"
    run_full_audit(REPO_ROOT, out_dir=out)
    payload = json.loads((out / "audit.json").read_text())
    assert payload["schema"] == "urn:slotmath:build-audit:v1"
    assert "summary" in payload
    assert "buttons" in payload
    assert "weight_checks" in payload
    assert "math_checks" in payload


def test_cli_run_command_exit_code_zero(tmp_path: Path):
    import subprocess
    import sys
    out = tmp_path / "audit-out"
    r = subprocess.run(
        [sys.executable, "-m", "tools.build_audit", "run",
         "--out", str(out), "--quiet"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stderr


def test_cli_strict_flag_elevates_warn(tmp_path: Path):
    import subprocess
    import sys
    out = tmp_path / "audit-out"
    r = subprocess.run(
        [sys.executable, "-m", "tools.build_audit", "run",
         "--out", str(out), "--quiet", "--strict"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    # All-pass on main; --strict should not fail either.
    assert r.returncode == 0, r.stderr
