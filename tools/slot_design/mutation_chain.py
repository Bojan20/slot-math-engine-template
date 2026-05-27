"""PHASE 17.B — Multi-mutation chain with rollback.

`apply_mutation` (PHASE 17) accepts one NL prompt at a time and produces
one new IR. The next level up is **a sequence** of prompts where:

  1. Each step is applied to the previous step's output.
  2. If any step yields zero applied operations (i.e. the regex parser
     didn't recognise the prompt), the chain *short-circuits* and the
     caller can choose to either (a) drop the bad step (default) or
     (b) abort the whole chain.
  3. The chain is **reversible** — calling `rollback(state, n)` restores
     the IR to the state before the last `n` steps without re-running
     them. The rollback is bit-exact (we keep a copy of each pre-image)
     so the regulator can audit "what would this design look like
     without the last 3 designer edits?".
  4. Every step records a `ChainStep` row that holds the prompt, the
     operations applied, warnings, and the pre/post IR digests so a
     forensic audit can hash-compare without rebuilding the chain.

Use cases:
  * Studio iterative refinement UI — designer types 5 prompts; if step
    3 introduced an unwanted side-effect, undo just that step.
  * Regulator audit replay — given a session log of prompts + their
    pre/post hashes, prove the designer's commit chain.
  * Automated A/B candidate generation — produce N variant IRs by
    feeding N different prompt chains over the same seed IR.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from tools.slot_design.copilot import MutationReport, apply_mutation


# ─── Data shapes ──────────────────────────────────────────────────────────


@dataclass
class ChainStep:
    """One step of the mutation chain — what was asked + what landed."""

    step_index: int
    prompt: str
    ops_count: int
    kinds: list[str]
    warnings: list[str]
    rtp_relock_required: bool
    pre_ir_digest: str
    post_ir_digest: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ChainState:
    """Live + reversible chain state. The caller treats this as opaque;
    use `current_ir()` / `rollback()` / `snapshot()` to interact."""

    initial_digest: str
    _history: list[dict[str, Any]] = field(default_factory=list)  # IR snapshots, one per step (post)
    _initial_ir: dict[str, Any] = field(default_factory=dict)
    _steps: list[ChainStep] = field(default_factory=list)

    def current_ir(self) -> dict[str, Any]:
        if not self._history:
            return copy.deepcopy(self._initial_ir)
        return copy.deepcopy(self._history[-1])

    def step_count(self) -> int:
        return len(self._steps)

    def steps(self) -> list[ChainStep]:
        return list(self._steps)

    def snapshot(self) -> dict[str, Any]:
        """Serialise the full chain for audit / replay. Hash-stable."""
        return {
            "schema": "urn:slotmath:mutation-chain:v1",
            "initial_digest": self.initial_digest,
            "steps": [s.to_dict() for s in self._steps],
        }


# ─── Helpers ──────────────────────────────────────────────────────────────


def _digest_ir(ir: dict[str, Any]) -> str:
    """SHA-256 over a canonical (sorted-keys, no-whitespace) JSON dump.
    Stable across re-runs + cross-process — caller uses this digest as
    the audit-trail glue."""
    blob = json.dumps(ir, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


# ─── Public API ───────────────────────────────────────────────────────────


def start_chain(ir: dict[str, Any]) -> ChainState:
    """Open a new mutation chain over `ir`. The seed IR is deep-copied
    so the caller may continue to mutate the original freely; the chain
    state holds its own immutable initial snapshot."""
    if not isinstance(ir, dict):
        raise TypeError("ir must be a dict")
    initial = copy.deepcopy(ir)
    return ChainState(
        initial_digest=_digest_ir(initial),
        _initial_ir=initial,
    )


def apply_step(
    state: ChainState,
    prompt: str,
    *,
    on_empty: str = "drop",
) -> tuple[ChainStep, MutationReport]:
    """Apply one NL prompt as the next step of the chain.

    Args:
      state:     mutable ChainState from `start_chain`.
      prompt:    NL mutation request.
      on_empty:  what to do when the prompt yields zero operations.
                 "drop"  → record the step with ops_count=0 + warning,
                          do NOT advance the IR (digest stays the same).
                 "abort" → raise RuntimeError so the caller can stop the
                          chain.

    Returns the `ChainStep` row + the underlying `MutationReport`.
    """
    if on_empty not in ("drop", "abort"):
        raise ValueError("on_empty must be 'drop' or 'abort'")
    pre_ir = state.current_ir()
    pre_digest = _digest_ir(pre_ir)
    new_ir, report = apply_mutation(pre_ir, prompt)
    if not report.operations:
        if on_empty == "abort":
            raise RuntimeError(
                f"step {state.step_count()}: prompt produced zero operations: {prompt!r}"
            )
        step = ChainStep(
            step_index=state.step_count(),
            prompt=prompt,
            ops_count=0,
            kinds=[],
            warnings=list(report.warnings) + ["prompt yielded no operations"],
            rtp_relock_required=False,
            pre_ir_digest=pre_digest,
            post_ir_digest=pre_digest,
        )
        # No IR mutation; do NOT push to history.
        state._steps.append(step)
        return step, report
    post_digest = _digest_ir(new_ir)
    step = ChainStep(
        step_index=state.step_count(),
        prompt=prompt,
        ops_count=len(report.operations),
        kinds=sorted({op.kind for op in report.operations}),
        warnings=list(report.warnings),
        rtp_relock_required=report.rtp_relock_required,
        pre_ir_digest=pre_digest,
        post_ir_digest=post_digest,
    )
    state._history.append(new_ir)
    state._steps.append(step)
    return step, report


def apply_chain(
    ir: dict[str, Any],
    prompts: list[str],
    *,
    on_empty: str = "drop",
) -> tuple[dict[str, Any], ChainState]:
    """Convenience wrapper: open a chain, apply N prompts, return
    (final_ir, chain_state)."""
    state = start_chain(ir)
    for p in prompts:
        apply_step(state, p, on_empty=on_empty)
    return state.current_ir(), state


def rollback(state: ChainState, n: int = 1) -> dict[str, Any]:
    """Roll back the last `n` IR-advancing steps. Steps that did not
    advance the IR (ops_count=0, "drop"-mode) are NOT counted — they
    have nothing to undo. Returns the current IR after rollback.

    `n` may exceed the chain length; the chain rewinds to the initial
    state in that case (idempotent).
    """
    if n < 0:
        raise ValueError("n must be >= 0")
    # Walk back, popping the last IR-advancing step per iteration.
    # We pop matching ChainStep entries too so `step_count` reflects
    # the new state.
    while n > 0:
        # Find the most-recent step that advanced the IR.
        idx = None
        for i in range(len(state._steps) - 1, -1, -1):
            if state._steps[i].ops_count > 0:
                idx = i
                break
        if idx is None:
            break  # nothing left to undo
        # Drop the step + its IR snapshot.
        state._steps.pop(idx)
        # Pop the matching history entry — there is exactly one history
        # entry per ops_count>0 step (chain invariant).
        state._history.pop()
        n -= 1
    return state.current_ir()


def replay_snapshot(
    snapshot: dict[str, Any],
    seed_ir: dict[str, Any],
) -> ChainState:
    """Rebuild a `ChainState` from a `state.snapshot()` payload + the
    original seed IR. Verifies that `initial_digest` matches the
    provided `seed_ir`; raises `ValueError` on drift so the regulator
    can catch tampered chains."""
    expected = snapshot.get("initial_digest")
    actual = _digest_ir(seed_ir)
    if expected != actual:
        raise ValueError(
            f"seed IR digest drift: snapshot has {expected!r}, "
            f"replay seed yields {actual!r}"
        )
    state = start_chain(seed_ir)
    for step_dict in snapshot.get("steps", []):
        apply_step(state, str(step_dict["prompt"]), on_empty="drop")
    # Verify each post_ir_digest matches the snapshot to catch drift
    # mid-chain. The replay raises if a digest fails to reproduce.
    for original, replayed in zip(snapshot["steps"], state._steps):
        if original["post_ir_digest"] != replayed.post_ir_digest:
            raise ValueError(
                f"step {original['step_index']}: digest drift "
                f"({original['post_ir_digest'][:12]}… vs "
                f"{replayed.post_ir_digest[:12]}…)"
            )
    return state
