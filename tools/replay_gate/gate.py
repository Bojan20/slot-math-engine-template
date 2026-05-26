"""Replay determinism gate.

Records a baseline spin output stream from (IR, seed, N spins) and
later asserts identical output is produced on re-run.

Output stream is computed using the W17 synthetic payout sampler so
this works engine-binary-free.
"""
from __future__ import annotations
import hashlib
import json
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tools.cohort_runner import synth_payout_sampler


# ─── data shapes ────────────────────────────────────────────────────


@dataclass
class ReplayBaseline:
    ir_path: str
    ir_sha256: str
    seed: int
    n_spins: int
    target_rtp: float
    output_sha256: str
    spin_outputs: list[float] = field(default_factory=list)
    recorded_at_utc: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "ir_path": self.ir_path,
            "ir_sha256": self.ir_sha256,
            "seed": self.seed,
            "n_spins": self.n_spins,
            "target_rtp": self.target_rtp,
            "output_sha256": self.output_sha256,
            "spin_outputs": list(self.spin_outputs),
            "recorded_at_utc": self.recorded_at_utc,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ReplayBaseline":
        return cls(
            ir_path=str(d.get("ir_path", "")),
            ir_sha256=str(d.get("ir_sha256", "")),
            seed=int(d.get("seed", 0)),
            n_spins=int(d.get("n_spins", 0)),
            target_rtp=float(d.get("target_rtp", 0.95)),
            output_sha256=str(d.get("output_sha256", "")),
            spin_outputs=list(d.get("spin_outputs") or []),
            recorded_at_utc=str(d.get("recorded_at_utc", "")),
        )


@dataclass
class ReplayResult:
    passed: bool
    expected_sha256: str
    actual_sha256: str
    mismatch_count: int
    first_mismatch_index: int | None
    mismatches: list[tuple[int, float, float]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "expected_sha256": self.expected_sha256,
            "actual_sha256": self.actual_sha256,
            "mismatch_count": self.mismatch_count,
            "first_mismatch_index": self.first_mismatch_index,
            "mismatches": [
                {"index": i, "expected": e, "actual": a}
                for (i, e, a) in self.mismatches[:50]
            ],
        }


# ─── core ──────────────────────────────────────────────────────────


def _canonical_ir_sha(ir: dict[str, Any]) -> str:
    payload = json.dumps(ir, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _hash_output_stream(outputs: list[float]) -> str:
    # Use repr to preserve float precision (avoid locale issues)
    return hashlib.sha256(
        "\n".join(repr(x) for x in outputs).encode("utf-8")
    ).hexdigest()


def _simulate_outputs(ir: dict[str, Any], *, seed: int,
                      n_spins: int, target_rtp: float) -> list[float]:
    sampler = synth_payout_sampler(ir, target_rtp=target_rtp)
    rng = random.Random(seed)
    return [sampler.sample(rng) for _ in range(n_spins)]


def record_baseline(
    ir: dict[str, Any],
    *,
    ir_path: str = "",
    seed: int = 42,
    n_spins: int = 200,
    target_rtp: float = 0.95,
) -> ReplayBaseline:
    outputs = _simulate_outputs(ir, seed=seed, n_spins=n_spins,
                                  target_rtp=target_rtp)
    return ReplayBaseline(
        ir_path=ir_path,
        ir_sha256=_canonical_ir_sha(ir),
        seed=seed,
        n_spins=n_spins,
        target_rtp=target_rtp,
        output_sha256=_hash_output_stream(outputs),
        spin_outputs=outputs,
        recorded_at_utc=datetime.now(timezone.utc).isoformat(),
    )


def replay_check(ir: dict[str, Any], baseline: ReplayBaseline) -> ReplayResult:
    """Re-run synthetic sampler with baseline seed + n_spins; compare
    output stream against baseline."""
    expected = list(baseline.spin_outputs)
    actual = _simulate_outputs(
        ir,
        seed=baseline.seed,
        n_spins=baseline.n_spins,
        target_rtp=baseline.target_rtp,
    )
    actual_sha = _hash_output_stream(actual)
    mismatches: list[tuple[int, float, float]] = []
    for i, (e, a) in enumerate(zip(expected, actual)):
        if e != a:
            mismatches.append((i, e, a))
    first = mismatches[0][0] if mismatches else None
    passed = (
        len(mismatches) == 0
        and len(expected) == len(actual)
        and actual_sha == baseline.output_sha256
    )
    return ReplayResult(
        passed=passed,
        expected_sha256=baseline.output_sha256,
        actual_sha256=actual_sha,
        mismatch_count=len(mismatches),
        first_mismatch_index=first,
        mismatches=mismatches,
    )


def save_baseline(b: ReplayBaseline, path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(b.to_dict(), indent=2, sort_keys=True))
    tmp.replace(path)
    return path


def load_baseline(path: Path) -> ReplayBaseline:
    return ReplayBaseline.from_dict(json.loads(Path(path).read_text()))
