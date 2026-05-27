"""W5.4 — DSL mutation engine.

Declarative edits to an existing `MathDslSpec`:

    raise target RTP to 97 %
    set volatility to high
    add free spins trigger_count_min 3 initial_spins 10
    remove feature linear_progressive
    bump hit_freq_target to 0.30
    add jurisdiction KSA
    remove jurisdiction ADM
    swap topology to 6x4
    change reel_length hint to 80

Each mutation returns a new `MathDslSpec` + a `MutationLog` describing
the diff. Stateless / pure — caller owns serialization. Complements
PHASE-17's `slot_design.copilot` (which operates on the IR) by working
at the *spec* level so mutations stay declarative + git-diffable as YAML.

Public API:
    apply_mutation(spec, prompt) → (new_spec, MutationLog)
    list_supported_mutations() → list[str]
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from .spec import MathDslSpec, FeatureSpec


# ─── Result types ──────────────────────────────────────────────────────


@dataclass
class MutationOp:
    """One concrete edit applied (or attempted) to the spec."""
    kind: str                  # rtp / volatility / hit_freq / feature_add / ...
    description: str           # human-readable summary of the change
    before: Any = None         # value before mutation (for audit)
    after: Any = None          # value after mutation
    applied: bool = True


@dataclass
class MutationLog:
    prompt: str
    ops: list[MutationOp] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def applied_count(self) -> int:
        return sum(1 for o in self.ops if o.applied)


class MutationError(ValueError):
    """Raised when a mutation phrase cannot be parsed at all."""


# ─── Mutation pattern table ────────────────────────────────────────────


def _pct(s: str) -> float:
    """Coerce a percent / fraction string to a 0..1 fraction.

    "96"      → 0.96
    "96%"     → 0.96
    "0.96"    → 0.96
    "96.5"    → 0.965
    """
    s = s.strip().rstrip("%")
    f = float(s)
    return f / 100.0 if f > 1.0 else f


def _mutate_rtp(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    new_rtp = _pct(m.group(1))
    if not (0.5 <= new_rtp <= 1.0):
        log.errors.append(f"target_rtp {new_rtp} outside [0.5, 1.0]")
        return spec
    new = copy.deepcopy(spec)
    op = MutationOp(
        kind="rtp",
        description=f"set target_rtp to {new_rtp:.4f}",
        before=spec.constraints.target_rtp,
        after=new_rtp,
    )
    new.constraints.target_rtp = new_rtp
    log.ops.append(op)
    return new


def _mutate_volatility(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    cls = m.group(1).lower().strip()
    if cls not in {"low", "medium", "high", "ultra"}:
        log.errors.append(f"unknown volatility class {cls!r}")
        return spec
    new = copy.deepcopy(spec)
    log.ops.append(MutationOp(
        kind="volatility",
        description=f"set volatility_class to {cls}",
        before=spec.constraints.volatility_class,
        after=cls,
    ))
    new.constraints.volatility_class = cls
    return new


def _mutate_hit_freq(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    val = _pct(m.group(1))
    if not (0.0 <= val <= 1.0):
        log.errors.append(f"hit_freq {val} outside [0, 1]")
        return spec
    new = copy.deepcopy(spec)
    log.ops.append(MutationOp(
        kind="hit_freq",
        description=f"set hit_freq_target to {val:.4f}",
        before=spec.constraints.hit_freq_target,
        after=val,
    ))
    new.constraints.hit_freq_target = val
    return new


def _mutate_max_win(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    val = float(m.group(1).replace(",", "").replace("_", ""))
    new = copy.deepcopy(spec)
    log.ops.append(MutationOp(
        kind="max_win",
        description=f"set max_win_x to {val}",
        before=spec.constraints.max_win_x,
        after=val,
    ))
    new.constraints.max_win_x = val
    return new


def _mutate_topology(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    """`swap topology to 6x4` or `change topology to 5x3`."""
    new = copy.deepcopy(spec)
    reels = int(m.group(1))
    rows = int(m.group(2))
    before = f"{spec.topology.reels}x{spec.topology.rows}"
    log.ops.append(MutationOp(
        kind="topology",
        description=f"swap topology {before} → {reels}x{rows}",
        before=before,
        after=f"{reels}x{rows}",
    ))
    new.topology.reels = reels
    new.topology.rows = rows
    new.topology.kind = "rectangular"
    new.topology.row_range_per_reel = None
    new.topology.ways_cap = None
    return new


def _mutate_add_jurisdiction(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    code = m.group(1).strip().upper()
    new = copy.deepcopy(spec)
    if code in new.constraints.jurisdictions:
        log.ops.append(MutationOp(
            kind="add_jurisdiction",
            description=f"{code} already present",
            before=list(new.constraints.jurisdictions),
            after=list(new.constraints.jurisdictions),
            applied=False,
        ))
        return new
    new.constraints.jurisdictions = [*spec.constraints.jurisdictions, code]
    log.ops.append(MutationOp(
        kind="add_jurisdiction",
        description=f"add jurisdiction {code}",
        before=list(spec.constraints.jurisdictions),
        after=list(new.constraints.jurisdictions),
    ))
    return new


def _mutate_remove_jurisdiction(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    code = m.group(1).strip().upper()
    new = copy.deepcopy(spec)
    if code not in new.constraints.jurisdictions:
        log.ops.append(MutationOp(
            kind="remove_jurisdiction",
            description=f"{code} not present",
            before=list(new.constraints.jurisdictions),
            after=list(new.constraints.jurisdictions),
            applied=False,
        ))
        return new
    new.constraints.jurisdictions = [j for j in spec.constraints.jurisdictions if j != code]
    log.ops.append(MutationOp(
        kind="remove_jurisdiction",
        description=f"remove jurisdiction {code}",
        before=list(spec.constraints.jurisdictions),
        after=list(new.constraints.jurisdictions),
    ))
    return new


def _mutate_remove_feature(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    fk = m.group(1).strip().lower()
    new = copy.deepcopy(spec)
    if not any(f.kind == fk for f in new.features):
        log.ops.append(MutationOp(
            kind="remove_feature",
            description=f"feature {fk!r} not present",
            applied=False,
        ))
        return new
    new.features = [f for f in spec.features if f.kind != fk]
    log.ops.append(MutationOp(
        kind="remove_feature",
        description=f"remove feature {fk}",
        before=[f.kind for f in spec.features],
        after=[f.kind for f in new.features],
    ))
    return new


def _mutate_add_feature(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    fk = m.group(1).strip().lower()
    new = copy.deepcopy(spec)
    if any(f.kind == fk for f in new.features):
        log.ops.append(MutationOp(
            kind="add_feature",
            description=f"feature {fk!r} already present",
            applied=False,
        ))
        return new
    # Heuristic defaults for common features
    defaults = {
        "free_spins": FeatureSpec(kind="free_spins", trigger_count_min=3, initial_spins=10, global_multiplier=2.0),
        "linear_progressive": FeatureSpec(
            kind="linear_progressive", pool_id="default-progressive",
            contribution_x=0.005, seed_x=100.0,
        ),
        "cascade": FeatureSpec(kind="cascade", replacement="drop", max_chain=10),
        "hold_and_win": FeatureSpec(kind="hold_and_win", trigger_count_min=6, respins_initial=3),
        "ante_bet": FeatureSpec(kind="ante_bet"),
        "buy_feature": FeatureSpec(kind="buy_feature"),
        "gamble": FeatureSpec(kind="gamble"),
        "mystery_symbol": FeatureSpec(kind="mystery_symbol"),
        "respin": FeatureSpec(kind="respin"),
        "pick": FeatureSpec(kind="pick"),
        "wheel": FeatureSpec(kind="wheel"),
        "symbol_upgrade": FeatureSpec(kind="symbol_upgrade"),
    }
    if fk not in defaults:
        log.errors.append(f"unknown feature kind {fk!r}")
        return spec
    new.features = [*spec.features, defaults[fk]]
    log.ops.append(MutationOp(
        kind="add_feature",
        description=f"add feature {fk}",
        before=[f.kind for f in spec.features],
        after=[f.kind for f in new.features],
    ))
    return new


def _mutate_reel_length_hint(spec: MathDslSpec, m: re.Match, log: MutationLog) -> MathDslSpec:
    val = int(m.group(1))
    new = copy.deepcopy(spec)
    log.ops.append(MutationOp(
        kind="hint_reel_length",
        description=f"set hints.reel_length to {val}",
        before=spec.hints.get("reel_length"),
        after=val,
    ))
    new.hints["reel_length"] = val
    return new


# Pattern → handler. Order matters: longer / more specific phrases first.
_PATTERNS: list[tuple[re.Pattern[str], Callable]] = [
    (re.compile(r"\b(?:set|raise|lower|change|bump)?\s*(?:target\s+)?RTP\s+(?:to\s+)?(0?\.\d{1,4}|\d{2,3}(?:\.\d{1,3})?)\s*%?", re.I), _mutate_rtp),
    (re.compile(r"\b(?:set|change|swap)\s+volatility(?:\s+(?:class|to))?\s+(?:to\s+)?(low|medium|high|ultra)\b", re.I), _mutate_volatility),
    (re.compile(r"\b(?:set|change|raise|lower|bump)\s+(?:target\s+)?hit[_\s-]?freq(?:uency)?(?:_target)?\s+(?:to\s+)?(\d+(?:\.\d+)?\s*%?)", re.I), _mutate_hit_freq),
    (re.compile(r"\b(?:set|change|raise|lower|bump)\s+max[_\s-]?win(?:_x)?\s+(?:to\s+)?([\d_,]+(?:\.\d+)?)", re.I), _mutate_max_win),
    (re.compile(r"\b(?:swap|change|set)\s+topology\s+(?:to\s+)?(\d+)\s*x\s*(\d+)", re.I), _mutate_topology),
    (re.compile(r"\b(?:add|enable)\s+jurisdiction\s+([A-Z]{2,6})\b", re.I), _mutate_add_jurisdiction),
    (re.compile(r"\b(?:remove|disable|drop)\s+jurisdiction\s+([A-Z]{2,6})\b", re.I), _mutate_remove_jurisdiction),
    (re.compile(r"\b(?:remove|drop|disable)\s+feature\s+([a-z_]+)", re.I), _mutate_remove_feature),
    (re.compile(r"\b(?:add|enable|introduce)\s+feature\s+([a-z_]+)", re.I), _mutate_add_feature),
    (re.compile(r"\b(?:set|change)\s+reel[_\s-]?length(?:\s+hint)?\s+(?:to\s+)?(\d+)", re.I), _mutate_reel_length_hint),
]


def apply_mutation(spec: MathDslSpec, prompt: str) -> tuple[MathDslSpec, MutationLog]:
    """Apply every mutation phrase recognized in `prompt` to `spec`.

    Multiple mutations can be chained in one prompt separated by `;`, `\n`,
    `,` or `and`. Unrecognized fragments produce `log.errors[]` entries but
    do not block the rest. Returns (new_spec, log).
    """
    log = MutationLog(prompt=prompt)
    # Split sentence into logical fragments
    fragments = re.split(r"\s*(?:;|\n|,|\band\b)\s*", prompt.strip(), flags=re.I)
    new_spec = spec
    for frag in fragments:
        if not frag.strip():
            continue
        matched = False
        for pat, handler in _PATTERNS:
            m = pat.search(frag)
            if m:
                new_spec = handler(new_spec, m, log)
                matched = True
                break
        if not matched:
            log.errors.append(f"unrecognized fragment: {frag.strip()!r}")
    return new_spec, log


def list_supported_mutations() -> list[str]:
    return [
        "set RTP to 96",
        "raise RTP to 97.5%",
        "set volatility to high",
        "set hit_freq to 0.22",
        "set max_win to 25000",
        "swap topology to 6x4",
        "add jurisdiction KSA",
        "remove jurisdiction ADM",
        "add feature free_spins",
        "remove feature linear_progressive",
        "set reel_length to 80",
    ]
