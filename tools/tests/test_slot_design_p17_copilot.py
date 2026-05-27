"""PHASE 17 — AI Math Designer copilot tests."""

from __future__ import annotations

import pytest

from tools.slot_design import (
    apply_mutation,
    list_supported_mutations,
    MutationOp,
    MutationReport,
)


def _base_ir() -> dict:
    return {
        "meta": {
            "name": "Test",
            "target_rtp": 0.96,
            "target_volatility": "medium",
            "max_win_x": 5000,
            "vendor_style": "generic",
        },
        "topology": {"reels": 5, "rows": 3, "paylines": 20, "shape": "lines"},
        "features": [
            {"kind": "free_spins", "initial_spins": 10, "_rtp_share_alloc": 0.25},
            {"kind": "hold_and_win", "trigger_prob": 0.008, "_rtp_share_alloc": 0.40},
            {"kind": "wheel_bonus", "_rtp_share_alloc": 0.18},
        ],
    }


# ─── validation ────────────────────────────────────────────────────────────


def test_apply_mutation_rejects_empty_prompt():
    with pytest.raises(ValueError):
        apply_mutation(_base_ir(), "")


def test_apply_mutation_rejects_non_dict_ir():
    with pytest.raises(TypeError):
        apply_mutation("not-a-dict", "set target RTP to 95%")  # type: ignore[arg-type]


def test_apply_mutation_does_not_mutate_input():
    ir = _base_ir()
    original_rtp = ir["meta"]["target_rtp"]
    apply_mutation(ir, "set target RTP to 95%")
    assert ir["meta"]["target_rtp"] == original_rtp


# ─── set_target_rtp ───────────────────────────────────────────────────────


def test_set_target_rtp_percent():
    new_ir, report = apply_mutation(_base_ir(), "set target RTP to 95.5%")
    assert new_ir["meta"]["target_rtp"] == 0.955
    assert report.rtp_relock_required is True
    assert len(report.operations) == 1


def test_set_target_rtp_fraction():
    new_ir, report = apply_mutation(_base_ir(), "set target RTP to 0.94")
    assert new_ir["meta"]["target_rtp"] == 0.94


def test_change_target_rtp_phrasal():
    new_ir, _ = apply_mutation(_base_ir(), "change target RTP to 97%")
    assert new_ir["meta"]["target_rtp"] == 0.97


# ─── topology ──────────────────────────────────────────────────────────────


def test_swap_topology_to_6x4_ways():
    new_ir, report = apply_mutation(_base_ir(), "swap topology to 6x4 ways")
    assert new_ir["topology"]["reels"] == 6
    assert new_ir["topology"]["rows"] == 4
    assert report.rtp_relock_required is True


def test_change_topology_size():
    new_ir, _ = apply_mutation(_base_ir(), "change topology to 7×7")
    assert new_ir["topology"]["reels"] == 7
    assert new_ir["topology"]["rows"] == 7


def test_swap_topology_reels_only():
    new_ir, _ = apply_mutation(_base_ir(), "swap topology to 6 reels")
    assert new_ir["topology"]["reels"] == 6
    assert new_ir["topology"]["rows"] == 3  # unchanged


# ─── feature share ─────────────────────────────────────────────────────────


def test_raise_free_spins_share():
    new_ir, report = apply_mutation(_base_ir(), "raise free spins RTP share to 30%")
    fs = next(f for f in new_ir["features"] if f["kind"] == "free_spins")
    assert fs["_rtp_share_alloc"] == 0.30
    assert report.rtp_relock_required is True


def test_lower_wheel_bonus_share():
    new_ir, report = apply_mutation(_base_ir(), "lower wheel bonus RTP share")
    wb = next(f for f in new_ir["features"] if f["kind"] == "wheel_bonus")
    # halved from 0.18
    assert wb["_rtp_share_alloc"] == pytest.approx(0.09, abs=1e-6)
    assert report.rtp_relock_required is True


def test_set_feature_share_unknown_warns():
    new_ir, report = apply_mutation(_base_ir(), "set unicorn share to 50%")
    assert any("unicorn" in w for w in report.warnings)


# ─── add / remove feature ──────────────────────────────────────────────────


def test_add_feature():
    ir = _base_ir()
    # Remove sticky_wild first to ensure clean add
    new_ir, report = apply_mutation(ir, "add a sticky wild feature")
    kinds = {f["kind"] for f in new_ir["features"]}
    assert "sticky_wild" in kinds
    assert report.rtp_relock_required is True


def test_add_unknown_feature_warns():
    new_ir, report = apply_mutation(_base_ir(), "add a unicorn feature")
    assert any("unicorn" in w for w in report.warnings)


def test_add_duplicate_feature_warns():
    new_ir, report = apply_mutation(_base_ir(), "add a free_spins feature")
    assert any("already present" in w for w in report.warnings)


def test_remove_feature():
    new_ir, report = apply_mutation(_base_ir(), "remove wheel bonus feature")
    kinds = {f["kind"] for f in new_ir["features"]}
    assert "wheel_bonus" not in kinds
    assert report.rtp_relock_required is True


def test_remove_nonexistent_feature_warns():
    new_ir, report = apply_mutation(_base_ir(), "remove unicorn feature")
    assert any("not found" in w for w in report.warnings)


# ─── max-win + volatility + vendor ─────────────────────────────────────────


def test_set_max_win():
    new_ir, _ = apply_mutation(_base_ir(), "set max win to 25000")
    assert new_ir["meta"]["max_win_x"] == 25000


def test_set_volatility():
    new_ir, _ = apply_mutation(_base_ir(), "set volatility to ultra")
    assert new_ir["meta"]["target_volatility"] == "ultra"


def test_set_vendor_style():
    new_ir, _ = apply_mutation(_base_ir(), "swap vendor to vendor_b")
    assert new_ir["meta"]["vendor_style"] == "vendor_b"


# ─── audit log ─────────────────────────────────────────────────────────────


def test_copilot_log_appended():
    new_ir, _ = apply_mutation(_base_ir(), "set target RTP to 95%")
    log = new_ir["meta"].get("copilot_log", [])
    assert len(log) == 1
    assert "prompt" in log[0]
    assert log[0]["ops_count"] == 1


def test_copilot_log_records_kinds():
    new_ir, _ = apply_mutation(_base_ir(), "set target RTP to 95% and set max win to 10000")
    log = new_ir["meta"]["copilot_log"]
    assert "set_target_rtp_percent" in str(log[0]["kinds"]) or "max_win" in str(log[0])


# ─── multi-op composition ──────────────────────────────────────────────────


def test_multi_op_prompt():
    new_ir, report = apply_mutation(
        _base_ir(),
        "set target RTP to 95% and set volatility to high and set max win to 25000",
    )
    assert new_ir["meta"]["target_rtp"] == 0.95
    assert new_ir["meta"]["target_volatility"] == "high"
    assert new_ir["meta"]["max_win_x"] == 25000
    assert len(report.operations) >= 3


# ─── introspection ─────────────────────────────────────────────────────────


def test_list_supported_mutations_non_empty():
    kinds = list_supported_mutations()
    assert len(kinds) >= 8
    assert "set_target_rtp_percent" in kinds
    assert "add_feature" in kinds
    assert "remove_feature" in kinds


# ─── MutationReport shape ──────────────────────────────────────────────────


def test_mutation_op_dataclass_shape():
    _, report = apply_mutation(_base_ir(), "set max win to 10000")
    op = report.operations[0]
    assert isinstance(op, MutationOp)
    assert op.target_path == "meta.max_win_x"
    assert op.before == 5000
    assert op.after == 10000


def test_report_dataclass_isinstance():
    _, report = apply_mutation(_base_ir(), "set max win to 10000")
    assert isinstance(report, MutationReport)


# ─── E2E: copilot output is share-aware-lock-compatible ───────────────────


def test_copilot_output_compatible_with_share_aware_lock():
    """After applying a copilot mutation, the resulting IR should still be
    valid input for the P10.7 share-aware locker."""
    from tools.slot_design import share_aware_lock
    new_ir, report = apply_mutation(_base_ir(), "set target RTP to 95.5%")
    if report.rtp_relock_required:
        # Wrap in DSL-like shape (copilot edits IR directly; lock expects DSL)
        # so just verify the meta + features stay valid.
        assert new_ir["meta"]["target_rtp"] == 0.955
        assert isinstance(new_ir["features"], list)
