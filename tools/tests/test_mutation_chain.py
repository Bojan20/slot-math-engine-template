"""PHASE 17.B — Multi-mutation chain with rollback tests."""

from __future__ import annotations

import json

import pytest

from tools.slot_design.mutation_chain import (
    ChainState,
    apply_chain,
    apply_step,
    replay_snapshot,
    rollback,
    start_chain,
)


# ─── Fixture IR ───────────────────────────────────────────────────────────


def _seed_ir() -> dict:
    return {
        "meta": {
            "name": "chain-test",
            "target_rtp": 0.96,
            "vendor": "synth",
            "max_win_x": 5000,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3, "shape": "lines"},
        "symbols": [
            {"id": "S_LO", "kind": "lo"},
            {"id": "S_HI", "kind": "hi"},
        ],
        "paytable": [
            {"symbol": "S_LO", "pay3": 5},
            {"symbol": "S_HI", "pay3": 20},
        ],
        "paylines": [[1, 1, 1, 1, 1]],
        "features": [{"kind": "free_spins"}],
    }


# ─── Basics ───────────────────────────────────────────────────────────────


def test_start_chain_returns_state_with_initial_digest():
    state = start_chain(_seed_ir())
    assert isinstance(state, ChainState)
    assert state.step_count() == 0
    assert len(state.initial_digest) == 64  # sha256 hex


def test_start_chain_rejects_non_dict():
    with pytest.raises(TypeError):
        start_chain([1, 2, 3])  # type: ignore[arg-type]


def test_start_chain_deep_copies_input():
    ir = _seed_ir()
    state = start_chain(ir)
    ir["meta"]["target_rtp"] = 0.5  # mutate after open
    assert state.current_ir()["meta"]["target_rtp"] == 0.96


# ─── Single-step apply ───────────────────────────────────────────────────


def test_apply_step_advances_ir_when_prompt_matches():
    state = start_chain(_seed_ir())
    step, report = apply_step(state, "set target RTP to 95.5%")
    assert step.ops_count >= 1
    assert step.step_index == 0
    assert step.pre_ir_digest != step.post_ir_digest
    assert state.current_ir()["meta"]["target_rtp"] == pytest.approx(0.955)


def test_apply_step_empty_prompt_drops_when_on_empty_drop():
    state = start_chain(_seed_ir())
    step, _ = apply_step(state, "this prompt parses nothing useful")
    assert step.ops_count == 0
    assert "no operations" in step.warnings[0]
    # No advance — digest unchanged.
    assert step.pre_ir_digest == step.post_ir_digest


def test_apply_step_empty_prompt_aborts_when_on_empty_abort():
    state = start_chain(_seed_ir())
    with pytest.raises(RuntimeError):
        apply_step(state, "no-op prompt please", on_empty="abort")


def test_apply_step_invalid_on_empty_value():
    state = start_chain(_seed_ir())
    with pytest.raises(ValueError):
        apply_step(state, "set target RTP to 95%", on_empty="bogus")


# ─── Chain composition ───────────────────────────────────────────────────


def test_apply_chain_three_prompts():
    ir = _seed_ir()
    prompts = [
        "set target RTP to 95.5%",
        "set max win to 25000x",
        "add sticky wild feature",
    ]
    final, state = apply_chain(ir, prompts)
    assert state.step_count() == 3
    # All steps should have applied at least one op.
    assert all(s.ops_count >= 1 for s in state.steps())
    assert final["meta"]["target_rtp"] == pytest.approx(0.955)
    assert final["meta"]["max_win_x"] == 25000


def test_apply_chain_mixed_good_and_bad_prompts_drop_mode():
    prompts = [
        "set target RTP to 94%",
        "this prompt does literally nothing",
        "set max win to 10000x",
    ]
    final, state = apply_chain(_seed_ir(), prompts)
    assert state.step_count() == 3
    # Step 0 + 2 advance; step 1 doesn't.
    assert state.steps()[0].ops_count >= 1
    assert state.steps()[1].ops_count == 0
    assert state.steps()[2].ops_count >= 1
    # IR reflects the two real edits.
    assert final["meta"]["target_rtp"] == pytest.approx(0.94)
    assert final["meta"]["max_win_x"] == 10000


def test_apply_chain_abort_on_empty():
    prompts = ["set target RTP to 95%", "blah no-op"]
    with pytest.raises(RuntimeError):
        apply_chain(_seed_ir(), prompts, on_empty="abort")


# ─── Rollback ────────────────────────────────────────────────────────────


def test_rollback_undoes_last_step():
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    apply_step(state, "set max win to 25000x")
    assert state.current_ir()["meta"]["max_win_x"] == 25000
    rollback(state, n=1)
    # max_win_x reverted to seed default, target_rtp still 0.955.
    assert state.current_ir()["meta"]["max_win_x"] == 5000
    assert state.current_ir()["meta"]["target_rtp"] == pytest.approx(0.955)
    assert state.step_count() == 1


def test_rollback_two_steps_returns_to_initial():
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    apply_step(state, "set max win to 25000x")
    rollback(state, n=2)
    assert state.current_ir() == _seed_ir()
    assert state.step_count() == 0


def test_rollback_n_zero_is_no_op():
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    before = state.current_ir()
    rollback(state, n=0)
    assert state.current_ir() == before
    assert state.step_count() == 1


def test_rollback_exceeds_chain_idempotent():
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    rollback(state, n=99)  # more than we have
    assert state.current_ir() == _seed_ir()
    assert state.step_count() == 0


def test_rollback_rejects_negative_n():
    state = start_chain(_seed_ir())
    with pytest.raises(ValueError):
        rollback(state, n=-1)


def test_rollback_skips_dropped_no_op_steps():
    """A 'drop'-mode no-op step has ops_count=0 and never advanced the
    IR. Rollback must skip it — it has nothing to undo — and undo the
    last IR-advancing step instead."""
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    apply_step(state, "no-op please")  # dropped, no IR advance
    apply_step(state, "set max win to 25000x")
    assert state.step_count() == 3
    rollback(state, n=1)
    # The last IR-advancing step (max_win) was undone.
    assert state.current_ir()["meta"]["max_win_x"] == 5000
    # target_rtp still 0.955.
    assert state.current_ir()["meta"]["target_rtp"] == pytest.approx(0.955)


# ─── Snapshot + replay ───────────────────────────────────────────────────


def test_snapshot_round_trip_reproduces_state():
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    apply_step(state, "set max win to 25000x")
    snap = state.snapshot()
    assert snap["schema"] == "urn:slotmath:mutation-chain:v1"
    assert snap["initial_digest"] == state.initial_digest
    assert len(snap["steps"]) == 2

    replayed = replay_snapshot(snap, _seed_ir())
    assert replayed.current_ir() == state.current_ir()
    assert replayed.step_count() == state.step_count()


def test_replay_rejects_drifted_seed_ir():
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    snap = state.snapshot()
    drifted = _seed_ir()
    drifted["meta"]["target_rtp"] = 0.5  # corrupt the seed
    with pytest.raises(ValueError):
        replay_snapshot(snap, drifted)


def test_snapshot_is_json_serialisable():
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 94%")
    snap = state.snapshot()
    # round-trip through JSON
    body = json.dumps(snap, sort_keys=True)
    parsed = json.loads(body)
    assert parsed == snap


# ─── Composition with PHASE 17 audit log ─────────────────────────────────


def test_each_step_audit_log_carries_prompt():
    """Each apply_step landing must surface in IR's `meta.copilot_log`
    via the underlying `apply_mutation`. Pinned for audit replayability."""
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    apply_step(state, "set max win to 25000x")
    ir = state.current_ir()
    log = ir["meta"].get("copilot_log") or []
    assert len(log) == 2
    prompts = [entry["prompt"] for entry in log]
    assert "set target RTP to 95.5%" in prompts
    assert "set max win to 25000x" in prompts


def test_rollback_preserves_audit_log_consistency():
    """After rollback, the copilot_log must reflect only the steps that
    actually applied (so a regulator can't see ghost ops)."""
    state = start_chain(_seed_ir())
    apply_step(state, "set target RTP to 95.5%")
    apply_step(state, "set max win to 25000x")
    rollback(state, n=1)
    ir = state.current_ir()
    log = ir["meta"].get("copilot_log") or []
    # Only the surviving step's audit entry remains.
    assert len(log) == 1
    assert "target RTP" in log[0]["prompt"]
