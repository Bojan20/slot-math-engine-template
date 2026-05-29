"""PHASE 37 — Regression spec generator kernel."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass
class RegressionSpec:
    schema_version: str = "urn:slotmath:regen-suite:v1"
    slug: str = ""
    expected_rtp: float = 0.0
    rtp_tolerance: float = 0.005
    ir_hash_hex: str = ""
    spec_source: str = ""        # the emitted pytest module text
    ir_path_for_test: str = ""   # where the test will load IR from


def _slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "_", name.lower()).strip("_")
    return s or "untitled"


def _canonical_hash(ir: dict[str, Any]) -> str:
    canon = json.dumps(ir, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canon).hexdigest()


def generate_regression_spec(
    ir: dict[str, Any],
    *,
    expected_rtp: float,
    ir_path_for_test: str,
    rtp_tolerance: float = 0.005,
    max_win_cap: float | None = None,
    slug: str | None = None,
) -> RegressionSpec:
    """Emit a regression pytest spec text + manifest."""
    if not 0 <= expected_rtp <= 1.5:
        raise ValueError("expected_rtp must be in [0, 1.5]")
    if rtp_tolerance < 0:
        raise ValueError("rtp_tolerance must be ≥ 0")
    if max_win_cap is not None and max_win_cap <= 0:
        raise ValueError("max_win_cap must be > 0 if set")

    ir_name = ir.get("meta", {}).get("name", "Game")
    final_slug = slug or _slugify(str(ir_name))
    ir_hash = _canonical_hash(ir)

    cap_line = ""
    if max_win_cap is not None:
        cap_line = (
            f"    cert = prove(ir, 'max_win_cap_compliance:{max_win_cap}')\n"
            f"    assert cert.status in ('verified', 'verified_fallback'), "
            f"cert.evidence\n"
        )

    source = f'''"""Auto-generated regression spec for `{ir_name}`.

DO NOT EDIT — regenerate via `slot-regen-suite` when the math changes.
Schema: urn:slotmath:regen-suite:v1
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.theorem_prover import prove, canonical_ir_hash
from tools.type_system import type_check_ir


_IR_PATH = Path({ir_path_for_test!r})
_EXPECTED_IR_HASH = "{ir_hash}"
_EXPECTED_RTP = {expected_rtp!r}
_RTP_TOLERANCE = {rtp_tolerance!r}


@pytest.fixture
def ir() -> dict:
    return json.loads(_IR_PATH.read_text())


def test_ir_hash_pin(ir):
    assert canonical_ir_hash(ir) == _EXPECTED_IR_HASH


def test_type_check_passes(ir):
    rpt = type_check_ir(ir)
    assert rpt.ok, [i.message for i in rpt.issues]


def test_rtp_in_band(ir):
    lo = _EXPECTED_RTP - _RTP_TOLERANCE
    hi = _EXPECTED_RTP + _RTP_TOLERANCE
    cert = prove(ir, f"rtp_in_band:{{lo}},{{hi}}")
    assert cert.status in ("verified", "verified_fallback"), cert.evidence


def test_paytable_consistency(ir):
    cert = prove(ir, "paytable_consistency")
    assert cert.status in ("verified", "verified_fallback"), cert.evidence


def test_reel_weight_positive(ir):
    cert = prove(ir, "reel_weight_positive")
    assert cert.status in ("verified", "verified_fallback"), cert.evidence


def test_max_win_cap_compliance(ir):
{cap_line if cap_line else "    pytest.skip('no max_win_cap supplied')"}
'''
    return RegressionSpec(
        slug=final_slug,
        expected_rtp=expected_rtp,
        rtp_tolerance=rtp_tolerance,
        ir_hash_hex=ir_hash,
        spec_source=source,
        ir_path_for_test=ir_path_for_test,
    )
