"""IR mutation fuzzer — structured corruption + invariant checks.

A Mutation is a callable `(ir, rng) -> mutated_ir` plus a label.
The invariant checker rejects any IR that:

  • has empty `meta.id`, `meta.vendor`, or `meta.swid`
  • has `topology.reels` ≤ 0 or `topology.rows` ≤ 0
  • has reels mismatched length to `topology.reels`
  • has any reel of length 0
  • has any paytable row with negative `pays` or empty `combo`
  • has `paytable` length 0
  • has any feature with empty `kind`

Mutations are designed to *break* exactly one of those invariants
(when applicable); a fuzz run that surfaces no break = bug in the
checker.
"""
from __future__ import annotations
import copy
import random
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable


# ─── Invariant checker ─────────────────────────────────────────────


def _check_invariants(ir: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    meta = ir.get("meta") or {}
    for k in ("id", "vendor", "swid"):
        v = meta.get(k)
        if not isinstance(v, str) or not v.strip():
            issues.append(f"meta.{k} missing or empty")
    topo = ir.get("topology") or {}
    reels_n = topo.get("reels")
    rows_n = topo.get("rows")
    if not isinstance(reels_n, int) or reels_n <= 0:
        issues.append("topology.reels invalid")
    if not isinstance(rows_n, int) or rows_n <= 0:
        issues.append("topology.rows invalid")
    reels_block = ir.get("reels") or {}
    base = reels_block.get("base")
    if not isinstance(base, list):
        issues.append("reels.base must be list")
    else:
        if isinstance(reels_n, int) and reels_n > 0 and len(base) != reels_n:
            issues.append(
                f"reels.base length {len(base)} mismatches topology.reels {reels_n}"
            )
        for i, strip in enumerate(base):
            if not isinstance(strip, list) or not strip:
                issues.append(f"reel {i} is empty/invalid")
    paytable = ir.get("paytable")
    if not isinstance(paytable, list) or not paytable:
        issues.append("paytable must be non-empty list")
    else:
        for j, row in enumerate(paytable):
            if not isinstance(row, dict):
                issues.append(f"paytable[{j}] not a dict")
                continue
            if row.get("pays", 0) < 0:
                issues.append(f"paytable[{j}].pays negative")
            combo = row.get("combo")
            if not isinstance(combo, list) or not combo:
                issues.append(f"paytable[{j}].combo empty")
    features = ir.get("features")
    if features is not None:
        if not isinstance(features, list):
            issues.append("features must be list")
        else:
            for k, f in enumerate(features):
                if not isinstance(f, dict):
                    issues.append(f"features[{k}] not a dict")
                    continue
                kind = f.get("kind")
                if not isinstance(kind, str) or not kind.strip():
                    issues.append(f"features[{k}].kind missing")
    return issues


# ─── Mutations ─────────────────────────────────────────────────────


@dataclass
class Mutation:
    label: str
    apply: Callable[[dict[str, Any], random.Random], dict[str, Any]]


def _mut_clear_swid(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    out = copy.deepcopy(ir)
    meta = out.setdefault("meta", {})
    meta["swid"] = ""
    return out


def _mut_drop_paytable(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    out = copy.deepcopy(ir)
    out["paytable"] = []
    return out


def _mut_negative_pays(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    out = copy.deepcopy(ir)
    pt = out.get("paytable") or []
    if pt:
        idx = rng.randrange(len(pt))
        pt[idx] = {**pt[idx], "pays": -1}
    return out


def _mut_reels_mismatch(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    out = copy.deepcopy(ir)
    reels = (out.get("reels") or {}).get("base") or []
    if reels:
        reels.pop()
    return out


def _mut_empty_reel(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    out = copy.deepcopy(ir)
    reels = (out.get("reels") or {}).get("base") or []
    if reels:
        idx = rng.randrange(len(reels))
        reels[idx] = []
    return out


def _mut_zero_rows(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    out = copy.deepcopy(ir)
    topo = out.setdefault("topology", {})
    topo["rows"] = 0
    return out


def _mut_kind_blank(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    out = copy.deepcopy(ir)
    feats = out.get("features") or []
    if feats:
        feats[0] = {**feats[0], "kind": ""}
    else:
        out["features"] = [{"kind": ""}]
    return out


def _mut_perturb_pays(ir: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    """Soft mutation — change a `pays` value by ±20%. Should NOT
    trigger invariant breaks; useful for differential MC fuzzing."""
    out = copy.deepcopy(ir)
    pt = out.get("paytable") or []
    if pt:
        idx = rng.randrange(len(pt))
        old = pt[idx].get("pays", 0)
        delta = int(round(old * rng.uniform(-0.2, 0.2)))
        pt[idx] = {**pt[idx], "pays": max(0, old + delta)}
    return out


DEFAULT_MUTATIONS: list[Mutation] = [
    Mutation("clear_swid", _mut_clear_swid),
    Mutation("drop_paytable", _mut_drop_paytable),
    Mutation("negative_pays", _mut_negative_pays),
    Mutation("reels_mismatch", _mut_reels_mismatch),
    Mutation("empty_reel", _mut_empty_reel),
    Mutation("zero_rows", _mut_zero_rows),
    Mutation("kind_blank", _mut_kind_blank),
    Mutation("perturb_pays_soft", _mut_perturb_pays),
]

# Mutations expected to break invariants (vs. soft no-ops).
HARD_MUTATIONS: frozenset[str] = frozenset({
    "clear_swid", "drop_paytable", "negative_pays",
    "reels_mismatch", "empty_reel", "zero_rows", "kind_blank",
})


# ─── Runner ────────────────────────────────────────────────────────


@dataclass
class FuzzResult:
    mutation: str
    issues: list[str]
    expected_break: bool

    @property
    def detected(self) -> bool:
        return bool(self.issues)

    @property
    def false_negative(self) -> bool:
        return self.expected_break and not self.detected

    def to_dict(self) -> dict[str, Any]:
        return {
            "mutation": self.mutation,
            "issues": list(self.issues),
            "expected_break": self.expected_break,
            "detected": self.detected,
            "false_negative": self.false_negative,
        }


@dataclass
class FuzzReport:
    seed: int
    iterations: int
    results: list[FuzzResult] = field(default_factory=list)

    @property
    def n_false_negatives(self) -> int:
        return sum(1 for r in self.results if r.false_negative)

    @property
    def n_caught(self) -> int:
        return sum(1 for r in self.results if r.detected)

    def to_dict(self) -> dict[str, Any]:
        return {
            "seed": self.seed,
            "iterations": self.iterations,
            "n_false_negatives": self.n_false_negatives,
            "n_caught": self.n_caught,
            "results": [r.to_dict() for r in self.results],
        }


def mutate_ir(
    ir: dict[str, Any], mutation: Mutation, rng: random.Random
) -> dict[str, Any]:
    return mutation.apply(ir, rng)


def run_fuzz(
    ir: dict[str, Any],
    *,
    seed: int = 42,
    iterations_per_mutation: int = 5,
    mutations: Iterable[Mutation] | None = None,
) -> FuzzReport:
    rng = random.Random(seed)
    muts = list(mutations) if mutations is not None else DEFAULT_MUTATIONS
    report = FuzzReport(seed=seed, iterations=iterations_per_mutation)
    for m in muts:
        for _ in range(iterations_per_mutation):
            mutant = mutate_ir(ir, m, rng)
            issues = _check_invariants(mutant)
            report.results.append(FuzzResult(
                mutation=m.label,
                issues=issues,
                expected_break=m.label in HARD_MUTATIONS,
            ))
    return report
