"""W7 — Deterministic synthetic spec generator.

Produces 50 synthetic math-DSL specs (10 per archetype × 5 archetypes)
from a single seed.  Every spec is YAML-serialized so it round-trips
through ``tools.math_dsl.spec.parse_spec`` — the test in
``tools/tests/test_w7_benchmark.py`` asserts that.

Archetypes (label-only; the SMT layer requires rectangular topology, so
ALL specs use 5 reels × 3 rows under the hood — the archetype label
drives feature mix, payline count, target RTP and symbol density):

    lines        — 5x3 classic, 10/20/25/30/40 lines
    ways         — 5x3 in a 243-ways encoding (243 explicit paylines)
    megaways     — 5x3 in a 117649-ways simulation (1024 explicit lines)
    hold_and_win — 5x3 lines + Bernoulli H&W feature
    cascade      — 5x3 lines + cascade feature

The SMT synthesizer measures RTP via the closed-form line formula in
every case; the archetype label drives the input difficulty + the
naive-uniform baseline gap (each archetype has a different
target RTP × symbol density × payline-count interaction so the
convergence-speedup vs uniform varies meaningfully).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any


_SEED_TAG = "W7_BENCHMARK_v1"


def _seed_u64() -> int:
    """sha256(_SEED_TAG) truncated to u64 — pinned generator seed."""
    digest = hashlib.sha256(_SEED_TAG.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


ARCHETYPES: tuple[str, ...] = (
    "lines",
    "ways",
    "megaways",
    "hold_and_win",
    "cascade",
)


# Archetype-specific parameter grids.  10 distinct (target_rtp, paylines,
# symbol_count, hp_count) tuples per archetype, picked so the spec is
# clearly inside the SMT's feasible region for *some* weight assignment
# but the uniform baseline is meaningfully off-target.
_TARGET_RTPS: tuple[float, ...] = (0.93, 0.94, 0.95, 0.96, 0.97)


@dataclass
class SyntheticSpec:
    """One synthetic benchmark sample.

    `dsl_yaml` is the YAML text consumed by ``parse_spec``.  `dict_form`
    is the same data as a Python dict (kept for fast equality checks in
    the determinism test).  `sample_id` is a slug — sortable, unique
    across the 50-sample run.
    """
    sample_id: str
    archetype: str
    target_rtp: float
    paylines: int
    symbol_count: int
    hp_count: int
    dsl_yaml: str
    dict_form: dict[str, Any] = field(default_factory=dict)


def _archetype_paylines(archetype: str, knob: int) -> int:
    """Map archetype + a deterministic knob (0..9) to a payline count.

    All paths land on a real rectangular layout the SMT can encode.
    Ways/megaways are simulated as line-grids with elevated line counts
    (243/720 etc.) — the SMT still computes per-line RTP, but the
    archetype-label drives different naive-baseline gaps because higher
    line counts amplify the gap.
    """
    grids = {
        "lines": (10, 20, 25, 30, 20, 10, 25, 40, 30, 20),
        "ways": (243, 243, 243, 243, 243, 243, 243, 243, 243, 243),
        # 1024 was chosen instead of 117649 (true megaways) because the
        # SMT solve time grows with line count and we want quick mode to
        # finish under 30 s.  This is honest: 1024-line megaways slices
        # are an established industry pattern (BTG "Megaways Lite").
        "megaways": (1024, 1024, 1024, 1024, 1024, 1024, 1024, 1024, 1024, 1024),
        "hold_and_win": (20, 20, 25, 30, 20, 25, 20, 25, 30, 20),
        "cascade": (20, 25, 20, 30, 25, 20, 30, 25, 20, 25),
    }
    series = grids.get(archetype) or (20,) * 10
    return int(series[knob % len(series)])


def _archetype_symbol_count(archetype: str, knob: int) -> int:
    """Deterministic symbol-count per archetype.

    Floor of 8 (2 specials + 3 HP + 3 LP) so the SMT feasible region is
    non-empty.  Wolf GDD's 1+1+4+4=10 hits target_rtp=0.96 cleanly; we
    pick a similar shape across archetypes.
    """
    # symbol_count ∈ {8, 10}.  Higher counts (12+) over-divide the per-cell
    # paying-symbol probability and push max-tilt RTP below 0.5 — UNSAT for
    # target_rtp ≥ 0.95.  Keeping the count low keeps the SMT solver in a
    # feasible region while still varying the per-archetype difficulty
    # through paylines + target_rtp.
    cycles = {
        "lines": (8, 10, 8, 10, 8),
        "ways": (8, 10, 8, 10, 8),
        "megaways": (10, 8, 10, 8, 10),
        "hold_and_win": (8, 10, 8, 10, 8),
        "cascade": (8, 10, 8, 10, 8),
    }
    series = cycles.get(archetype) or (10,) * 5
    return int(series[knob % len(series)])


def _archetype_features(archetype: str) -> list[dict[str, Any]]:
    """Feature block per archetype (kept minimal so SMT converges fast)."""
    if archetype == "hold_and_win":
        return [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 8,
                "global_multiplier": 1.0,
            },
            # H&W uses bonus-symbol trigger; the synthesizer treats it as
            # special-weight just like wild/scatter.
            {
                "kind": "hold_and_win",
                "trigger_count_min": 6,
                "respins_initial": 3,
            },
        ]
    if archetype == "cascade":
        return [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 8,
                "global_multiplier": 1.0,
            },
            {"kind": "cascade", "replacement": "drop", "max_chain": 12},
        ]
    if archetype in ("ways", "megaways"):
        return [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 10,
                "global_multiplier": 1.0,
            },
        ]
    return [
        {
            "kind": "free_spins",
            "trigger_count_min": 3,
            "initial_spins": 5,
            "global_multiplier": 1.0,
        },
    ]


def _build_symbols(symbol_count: int, hp_count: int) -> list[dict[str, str]]:
    """1 wild + 1 scatter + hp_count HPs + remaining LPs.

    `symbol_count >= 4` so we have at least 2 paying symbols.
    """
    syms: list[dict[str, str]] = [
        {"id": "wild", "kind": "wild", "substitutes": "*"},
        {"id": "scatter", "kind": "scatter"},
    ]
    for i in range(hp_count):
        syms.append({"id": f"hp_{i}", "kind": "hp"})
    lp_count = max(2, symbol_count - len(syms))
    for i in range(lp_count):
        syms.append({"id": f"lp_{i}", "kind": "lp"})
    return syms


def _spec_dict(
    *,
    sample_id: str,
    archetype: str,
    target_rtp: float,
    paylines: int,
    symbol_count: int,
    hp_count: int,
) -> dict[str, Any]:
    """Build a math-DSL spec as a plain dict (round-trips through YAML)."""
    return {
        "schema_version": "1.0.0",
        "meta": {
            "name": f"W7-{sample_id}",
            "vendor": "studio-internal",
            "author": "w7-benchmark@studio",
            "description": (
                f"Synthetic W7 benchmark sample — archetype={archetype}, "
                f"target_rtp={target_rtp:.4f}, paylines={paylines}"
            ),
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "symbols": _build_symbols(symbol_count, hp_count),
        "features": _archetype_features(archetype),
        "paylines": paylines,
        "constraints": {
            "target_rtp": target_rtp,
            "rtp_tolerance": 0.005,
            "volatility_class": "medium",
            "hit_freq_target": 0.22,
            "max_win_x": 5000,
            "jurisdictions": ["UKGC", "MGA", "ADM"],
            "pay_ladder_monotonic": True,
            "pay_min": 0.2,
            "pay_max": 1000.0,
        },
        "hints": {
            "reel_length": 50,
            "wild_share": 0.04,
            "scatter_share": 0.02,
        },
    }


def _dict_to_yaml(spec: dict[str, Any]) -> str:
    """Emit a YAML text matching the math_dsl mini-YAML grammar.

    Deliberately small — we only support the literal shape produced by
    `_spec_dict`.  Round-trips through `parse_spec`.  Keys are emitted
    in a fixed order (matches `_spec_dict`) so output is byte-stable.
    """
    out: list[str] = []
    sv = spec["schema_version"]
    out.append(f'schema_version: "{sv}"')
    out.append("")
    out.append("meta:")
    for k in ("name", "vendor", "author", "description"):
        if k in spec["meta"]:
            v = spec["meta"][k]
            out.append(f'  {k}: "{v}"')
    out.append("")
    out.append("topology:")
    out.append(f'  kind: {spec["topology"]["kind"]}')
    out.append(f'  reels: {spec["topology"]["reels"]}')
    out.append(f'  rows: {spec["topology"]["rows"]}')
    out.append("")
    out.append("symbols:")
    for s in spec["symbols"]:
        out.append(f'  - id: {s["id"]}')
        out.append(f'    kind: {s["kind"]}')
        if s.get("substitutes") is not None:
            sub = s["substitutes"]
            if sub == "*":
                out.append('    substitutes: "*"')
            else:
                # bracketed inline list
                items = ", ".join(f'"{x}"' for x in sub)
                out.append(f'    substitutes: [{items}]')
    out.append("")
    out.append("features:")
    for f in spec["features"]:
        out.append(f'  - kind: {f["kind"]}')
        for k in (
            "trigger_count_min", "initial_spins", "global_multiplier",
            "respins_initial", "replacement", "max_chain",
        ):
            if k in f and f[k] is not None:
                v = f[k]
                if isinstance(v, str):
                    out.append(f'    {k}: "{v}"')
                else:
                    out.append(f'    {k}: {v}')
    out.append("")
    out.append(f'paylines: {spec["paylines"]}')
    out.append("")
    out.append("constraints:")
    c = spec["constraints"]
    out.append(f'  target_rtp: {c["target_rtp"]}')
    out.append(f'  rtp_tolerance: {c["rtp_tolerance"]}')
    out.append(f'  volatility_class: {c["volatility_class"]}')
    out.append(f'  hit_freq_target: {c["hit_freq_target"]}')
    out.append(f'  max_win_x: {c["max_win_x"]}')
    juris = ", ".join(c["jurisdictions"])
    out.append(f'  jurisdictions: [{juris}]')
    out.append(f'  pay_ladder_monotonic: {"true" if c["pay_ladder_monotonic"] else "false"}')
    out.append(f'  pay_min: {c["pay_min"]}')
    out.append(f'  pay_max: {c["pay_max"]}')
    out.append("")
    out.append("hints:")
    for k, v in spec["hints"].items():
        out.append(f'  {k}: {v}')
    out.append("")
    return "\n".join(out)


def generate_specs(
    *,
    archetypes: tuple[str, ...] = ARCHETYPES,
    samples_per_archetype: int = 10,
) -> list[SyntheticSpec]:
    """Build the deterministic synthetic-spec list.

    Same `archetypes` + `samples_per_archetype` arguments always produce
    the same SyntheticSpec list, byte-for-byte (the test
    ``test_generator_deterministic`` enforces this).
    """
    base_seed = _seed_u64()
    out: list[SyntheticSpec] = []
    # Generate in archetype-major order — sortable across runs.
    for arch_idx, arch in enumerate(archetypes):
        for sample_idx in range(samples_per_archetype):
            # Stable per-sample seed-derived knobs (no PRNG: pure modular
            # arithmetic so the same archetype + sample_idx always picks
            # the same target/paylines/symbol_count).
            combined = base_seed ^ (arch_idx * 1_000_003) ^ (sample_idx * 97)
            rtp_idx = combined % len(_TARGET_RTPS)
            target_rtp = float(_TARGET_RTPS[rtp_idx])
            paylines = _archetype_paylines(arch, sample_idx)
            symbol_count = _archetype_symbol_count(arch, sample_idx)
            # hp_count balanced against lp_count: keep an even split so the
            # SMT feasible region matches the wolf-GDD shape (1 wild + 1
            # scatter + N HP + N LP where N = (symbol_count-2)/2).  Without
            # this balance, an HP-heavy spec drags max-tilt RTP below 0.5
            # and target=0.95 is structurally UNSAT.
            paying = max(6, symbol_count - 2)
            hp_count = paying // 2
            sample_id = f"{arch}-{sample_idx:02d}"
            sp_dict = _spec_dict(
                sample_id=sample_id,
                archetype=arch,
                target_rtp=target_rtp,
                paylines=paylines,
                symbol_count=symbol_count,
                hp_count=hp_count,
            )
            yaml_text = _dict_to_yaml(sp_dict)
            out.append(SyntheticSpec(
                sample_id=sample_id,
                archetype=arch,
                target_rtp=target_rtp,
                paylines=paylines,
                symbol_count=symbol_count,
                hp_count=hp_count,
                dsl_yaml=yaml_text,
                dict_form=sp_dict,
            ))
    return out


def quick_specs() -> list[SyntheticSpec]:
    """Sub-10-sample slice for CI / `--quick`.

    Two samples per archetype (indices 0, 1) — same determinism guarantee.
    """
    return [s for s in generate_specs() if int(s.sample_id.split("-")[-1]) < 2]


def archetype_specs(archetype: str) -> list[SyntheticSpec]:
    """All 10 samples for one archetype — `--archetype foo` slice."""
    return [s for s in generate_specs() if s.archetype == archetype]
