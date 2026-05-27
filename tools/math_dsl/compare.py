"""W9.2 — Spec comparison matrix.

Given N DSL specs (paths or MathDslSpec objects), build a side-by-side
matrix showing the structural deltas + commitments per spec:

  • topology kind / size
  • RTP target + tolerance
  • volatility class
  • hit-freq target + max win
  • features per spec (set diff)
  • symbols per spec (set diff)
  • jurisdictions per spec
  • paylines per spec

Output is markdown table (one column per spec) optimized for
side-by-side reading in PR / sales deck / portfolio review.

Use case: sales meeting where the portfolio manager wants to see
"how are our 6 games positioned across volatility classes" or
compliance asking "which of these 4 games share the same jurisdictions"
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .spec import MathDslSpec


@dataclass
class CompareMatrix:
    specs: list[MathDslSpec]
    rows: list[tuple[str, list[str]]]  # (field_name, [value_per_spec])

    @property
    def n_specs(self) -> int:
        return len(self.specs)

    def render(self) -> str:
        if not self.specs:
            return "(no specs)\n"
        headers = ["Field", *[s.meta.get("name") or "(unnamed)" for s in self.specs]]
        sep = ["---"] * len(headers)
        lines = ["| " + " | ".join(headers) + " |",
                 "| " + " | ".join(sep) + " |"]
        for name, values in self.rows:
            lines.append(f"| {name} | " + " | ".join(values) + " |")
        return "\n".join(lines) + "\n"


def compare_specs(specs: Sequence[MathDslSpec]) -> CompareMatrix:
    """Build a `CompareMatrix` for N specs. Order preserved."""
    rows: list[tuple[str, list[str]]] = []

    # Meta
    rows.append(("Vendor", [str(s.meta.get("vendor") or "—") for s in specs]))
    rows.append(("Author", [str(s.meta.get("author") or "—") for s in specs]))

    # Topology
    rows.append(("Topology", [
        f"`{s.topology.kind}` {s.topology.reels}×{s.topology.rows}" for s in specs
    ]))
    rows.append(("Ways cap", [
        str(s.topology.ways_cap) if s.topology.ways_cap is not None else "—"
        for s in specs
    ]))

    # Paylines
    rows.append(("Paylines", [
        str(s.paylines) if isinstance(s.paylines, int) else f"{len(s.paylines)} explicit"
        for s in specs
    ]))

    # Symbol counts
    rows.append(("Symbols", [str(len(s.symbols)) for s in specs]))
    rows.append(("HP / LP / Wild / Scatter", [
        "/".join(str(sum(1 for x in s.symbols if x.kind == k))
                 for k in ("hp", "lp", "wild", "scatter"))
        for s in specs
    ]))

    # Features
    rows.append(("Features", [
        ", ".join(f.kind for f in s.features) or "—" for s in specs
    ]))

    # Constraints
    rows.append(("**Target RTP**", [
        f"**{s.constraints.target_rtp:.4f}**" for s in specs
    ]))
    rows.append(("RTP tolerance", [
        f"± {s.constraints.rtp_tolerance}" for s in specs
    ]))
    rows.append(("**Volatility**", [
        f"**{s.constraints.volatility_class}**" for s in specs
    ]))
    rows.append(("Hit freq", [
        f"{s.constraints.hit_freq_target:.3f}" for s in specs
    ]))
    rows.append(("Max win ×", [
        f"{s.constraints.max_win_x:,g}" for s in specs
    ]))

    # RTP allocation buckets
    rows.append(("RTP base / fs / haw / jp", [
        "/".join(
            f"{v:.3f}" if v is not None else "—"
            for v in (
                s.constraints.rtp_alloc_base, s.constraints.rtp_alloc_free_spins,
                s.constraints.rtp_alloc_hold_and_win, s.constraints.rtp_alloc_jackpot,
            )
        )
        for s in specs
    ]))

    # Jurisdictions
    rows.append(("Jurisdictions", [
        ", ".join(s.constraints.jurisdictions) or "—" for s in specs
    ]))

    return CompareMatrix(specs=list(specs), rows=rows)


def shared_jurisdictions(specs: Sequence[MathDslSpec]) -> set[str]:
    """Return the intersection of jurisdictions across N specs."""
    if not specs:
        return set()
    out = set(specs[0].constraints.jurisdictions)
    for s in specs[1:]:
        out &= set(s.constraints.jurisdictions)
    return out


def feature_overlap(specs: Sequence[MathDslSpec]) -> dict[str, list[bool]]:
    """For every distinct feature kind across the spec set, return
    `{kind: [present_in_spec_i for i in range(N)]}`."""
    all_kinds: set[str] = set()
    for s in specs:
        all_kinds.update(f.kind for f in s.features)
    out: dict[str, list[bool]] = {}
    for k in sorted(all_kinds):
        out[k] = [any(f.kind == k for f in s.features) for s in specs]
    return out
