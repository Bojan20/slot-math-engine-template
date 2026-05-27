"""W5.1 — Compile MathDslSpec → SlotGameIR skeleton.

The compiler emits a *parametric* IR — paytable values are placeholders
(uniform pay_ladder seeded from monotonic constraint) and reel weights
are uniform. The W5.2 `weight_synthesizer` then refines them to satisfy
RTP + volatility + hit_freq via Z3.

This split (compile → solve) means the DSL parser stays pure data and
the Z3 layer stays a pure constraint solver — both are independently
testable.
"""

from __future__ import annotations

from typing import Any

from .spec import (
    MathDslSpec,
    SymbolSpec,
    FeatureSpec,
    ConstraintsSpec,
    TopologySpec,
)


class CompileError(ValueError):
    """Raised when DSL spec cannot be mapped to a SlotGameIR shape."""


_SCHEMA_VERSION = "1.0.0"


def _meta_block(spec: MathDslSpec) -> dict:
    name = spec.meta.get("name", "Unnamed")
    slug = (name or "game").lower().replace(" ", "-")
    out: dict[str, Any] = {
        "id": slug,
        "name": name,
        "version": _SCHEMA_VERSION,
        "theme_tags": list(spec.meta.get("theme_tags") or []),
    }
    desc = spec.meta.get("description")
    if desc:
        out["description"] = str(desc)
    author = spec.meta.get("author")
    if author:
        out["author"] = str(author)
    return out


def _topology_block(t: TopologySpec) -> dict:
    if t.kind == "rectangular":
        return {"kind": "rectangular", "reels": t.reels, "rows": t.rows}
    if t.kind == "variable_rows":
        out: dict[str, Any] = {
            "kind": "variable_rows",
            "reels": t.reels,
            "row_range_per_reel": [list(r) for r in (t.row_range_per_reel or [])],
        }
        if t.ways_cap is not None:
            out["ways_cap"] = int(t.ways_cap)
        return out
    if t.kind == "cluster_grid":
        return {
            "kind": "cluster_grid",
            "columns": int(t.columns or t.reels),
            "rows": int(t.rows),
            "adjacency": str(t.adjacency or "orthogonal"),
        }
    raise CompileError(f"unknown topology kind {t.kind!r}")


def _symbols_block(syms: list[SymbolSpec]) -> list[dict]:
    out: list[dict] = []
    for s in syms:
        item: dict[str, Any] = {
            "id": s.id,
            "name": s.name or s.id,
            "kind": s.kind,
        }
        if s.substitutes is not None:
            item["substitutes"] = s.substitutes
        if s.weight_hint is not None:
            item["weight_hint"] = float(s.weight_hint)
        out.append(item)
    return out


def _seed_weights_uniform(
    spec: MathDslSpec, n_reels: int
) -> list[dict[str, float]]:
    """Per-reel symbol → weight map seeded uniformly. The W5.2 synthesizer
    re-balances these to satisfy RTP + volatility.

    Hints (wild_share / scatter_share / reel_length) tune the seed so the
    Z3 solver converges faster (closer to feasible region).
    """
    reel_length = int(spec.hints.get("reel_length") or 60)
    wild_share = float(spec.hints.get("wild_share") or 0.04)
    scatter_share = float(spec.hints.get("scatter_share") or 0.02)
    bonus_share = float(spec.hints.get("bonus_share") or 0.0)

    wild_count = max(1, int(round(reel_length * wild_share)))
    scatter_count = max(1, int(round(reel_length * scatter_share)))
    bonus_count = max(0, int(round(reel_length * bonus_share)))

    paying_syms = [s for s in spec.symbols if s.kind in ("hp", "lp", "expanding", "chain_wild")]
    wild_syms = [s for s in spec.symbols if s.kind == "wild"]
    scatter_syms = [s for s in spec.symbols if s.kind == "scatter"]
    bonus_syms = [s for s in spec.symbols if s.kind == "bonus"]
    other_syms = [s for s in spec.symbols if s.kind in ("multiplier", "sticky", "mystery", "transform")]

    reserved = wild_count * len(wild_syms) + scatter_count * len(scatter_syms) + bonus_count * len(bonus_syms)
    paying_pool = max(reel_length - reserved, len(paying_syms))
    per_paying = max(1, paying_pool // max(1, len(paying_syms))) if paying_syms else 1

    out: list[dict[str, float]] = []
    for _ in range(n_reels):
        m: dict[str, float] = {}
        for w in wild_syms:
            m[w.id] = float(wild_count)
        for sc in scatter_syms:
            m[sc.id] = float(scatter_count)
        for b in bonus_syms:
            m[b.id] = float(bonus_count)
        for p in paying_syms:
            # Designer-supplied hint > derived default
            m[p.id] = float(p.weight_hint if p.weight_hint is not None else per_paying)
        for o in other_syms:
            m[o.id] = 1.0  # rare-by-default
        out.append(m)
    return out


def _seed_paytable(spec: MathDslSpec, n_reels: int) -> dict[str, dict[str, float]]:
    """Seed a monotonic pay ladder (count→pay) for every paying symbol.

    Industry rule (encoded in ConstraintsSpec.pay_ladder_monotonic):
        pay(k+1) > pay(k) for k in {3, 4, ..., n_reels}

    We pick a geometric ladder anchored at pay_min and scaling by 4× per
    step (typical lines slot). The W5.2 solver will refine.
    """
    out: dict[str, dict[str, float]] = {}
    pay_min = spec.constraints.pay_min
    paying_syms = [s for s in spec.symbols if s.kind in ("hp", "lp")]
    for i, s in enumerate(paying_syms):
        ladder: dict[str, float] = {}
        # Higher tier (hp) gets bigger anchor pay
        tier_mult = 5.0 if s.kind == "hp" else 1.0
        # Within tier, earlier defined = higher pay
        within_tier = (i if s.kind == "hp" else max(0, i - sum(1 for x in paying_syms if x.kind == "hp")))
        anchor = pay_min * tier_mult * max(1.0, 8.0 - within_tier)
        for k in range(3, n_reels + 1):
            ladder[str(k)] = anchor * (4.0 ** (k - 3))
        out[s.id] = ladder
    return out


def _features_block(spec: MathDslSpec, n_reels: int) -> list[dict]:
    feats: list[dict] = []
    for f in spec.features:
        if f.kind == "free_spins":
            trig = {
                "by": "scatter_count",
                "min": int(f.trigger_count_min or 3),
            }
            if f.initial_spins is not None:
                trig["thresholds"] = {str(f.trigger_count_min or 3): int(f.initial_spins)}
            feat: dict[str, Any] = {"kind": "free_spins", "trigger": trig}
            if f.retrigger_spins is not None:
                feat["retrigger"] = {
                    "by": "scatter_count",
                    "min": int(f.trigger_count_min or 3),
                    "thresholds": {str(f.trigger_count_min or 3): int(f.retrigger_spins)},
                    "max_total": int(f.max_total_spins or 255),
                }
            if f.global_multiplier is not None:
                feat["global_multiplier"] = float(f.global_multiplier)
            feats.append(feat)
        elif f.kind == "linear_progressive":
            feat = {
                "kind": "linear_progressive",
                "pool_id": str(f.pool_id or "default-progressive"),
                "contribution_per_spin_x": float(f.contribution_x or 0.0),
                "seed_x": float(f.seed_x or 0.0),
            }
            if f.must_hit_by_x is not None:
                feat["must_hit_by_x"] = float(f.must_hit_by_x)
            feats.append(feat)
        elif f.kind == "hold_and_win":
            feats.append({
                "kind": "hold_and_win",
                "trigger": {"by": "bonus_count", "min": int(f.trigger_count_min or 6)},
                "respins_initial": int(f.respins_initial or 3),
                "respin_reset_on_new": True,
                "cash_value_distribution": [{"value": 1.0, "weight": 1.0}],
                "jackpot_tiers": [{"id": "grand", "multiplier": 1000.0}],
            })
        elif f.kind == "cascade":
            feats.append({
                "kind": "cascade",
                "replacement": str(f.replacement or "drop"),
                "max_chain": int(f.max_chain or 20),
            })
        elif f.kind == "pick":
            pool = f.awards or [{"id": "default", "weight": 1.0, "pay_multiplier": 10.0}]
            feats.append({
                "kind": "pick",
                "prize_pool": [
                    {
                        "id": str(a.get("label") or a.get("id") or f"award_{i}"),
                        "weight": float(a.get("weight") or 1.0),
                        "pay_multiplier": float(a.get("pays_coins") or a.get("pay_multiplier") or 0.0),
                    }
                    for i, a in enumerate(pool)
                ],
            })
        # Other features can be added here incrementally; the catch-all
        # `extra` dict on FeatureSpec preserves vendor-specific data so a
        # later compiler pass can emit it without DSL re-parse.
    return feats


def _progressive_link_block(spec: MathDslSpec) -> dict | None:
    for f in spec.features:
        if f.kind == "linear_progressive":
            out: dict[str, Any] = {
                "contribution_per_spin_x": float(f.contribution_x or 0.0),
                "seed_x": float(f.seed_x or 0.0),
            }
            if f.pool_id:
                out["pool_id"] = str(f.pool_id)
            if f.must_hit_by_x is not None:
                out["must_hit_by_x"] = float(f.must_hit_by_x)
            return out
    return None


def _default_paylines(n_reels: int, n_lines: int) -> list[list[int]]:
    """Generate `n_lines` synthetic paylines for `n_reels`. Each line is
    a row-index per reel; we cycle through the rows {0,1,2} pseudo-randomly
    seeded by line index so unit tests get deterministic output.
    """
    out: list[list[int]] = []
    for i in range(n_lines):
        # Deterministic pattern: zig-zag based on (i, reel_idx)
        line = [(i + r) % 3 for r in range(n_reels)]
        out.append(line)
    return out


def compile_to_ir(spec: MathDslSpec) -> dict:
    """Compile validated `MathDslSpec` into a SlotGameIR-shaped dict.

    The output is a *parametric skeleton* — paytable + reel weights are
    seeded but not yet optimized. Pass to `tools.smt.weight_synthesizer`
    to solve for exact values that satisfy `spec.constraints`.
    """
    n_reels = spec.topology.reels
    topology = _topology_block(spec.topology)

    # Build reels (weighted mode by default; designer can override later)
    reels = {
        "mode": "weighted",
        "base": _seed_weights_uniform(spec, n_reels),
    }

    # Paytable
    paytable = _seed_paytable(spec, n_reels)

    # Evaluation
    if isinstance(spec.paylines, list):
        paylines = list(spec.paylines)
    else:
        n_lines = int(spec.paylines or 1)
        paylines = _default_paylines(n_reels, n_lines)
    if spec.topology.kind == "variable_rows":
        # Megaways: ways evaluation
        max_ways = 1
        for rng in spec.topology.row_range_per_reel or []:
            max_ways *= int(rng[1])
        evaluation = {
            "kind": "ways",
            "direction": "ltr",
            "min_match": 3,
            "max_ways_per_spin": int(spec.topology.ways_cap or max_ways),
        }
    elif spec.topology.kind == "cluster_grid":
        evaluation = {
            "kind": "cluster",
            "min_cluster_size": 5,
            "cluster_pay_table": {"5": 1.0, "6": 2.0, "7": 4.0, "8": 8.0, "12+": 100.0},
        }
    else:
        evaluation = {
            "kind": "lines",
            "paylines": paylines,
            "direction": "ltr",
            "min_match": 3,
            "pay_left_to_right_only": True,
        }

    features = _features_block(spec, n_reels)

    # Limits / compliance / RTP allocation pulled from constraints
    c = spec.constraints
    limits = {
        "target_rtp": c.target_rtp,
        "rtp_tolerance": c.rtp_tolerance,
        "max_win_x": c.max_win_x,
        "win_cap_apply": c.win_cap_apply,
        "target_volatility": c.volatility_class,
        "hit_freq_target": c.hit_freq_target,
    }
    compliance = {
        "jurisdictions": list(c.jurisdictions),
        "rtp_range_required": [0.85, 0.98],
        "max_win_cap_required": c.max_win_x,
        "near_miss_rule": "must_be_random",
        "ldw_disclosure": True,
        "session_time_display": False,
    }
    rtp_alloc = {
        "base_game": float(c.rtp_alloc_base if c.rtp_alloc_base is not None else 0.7),
        "free_spins": float(c.rtp_alloc_free_spins if c.rtp_alloc_free_spins is not None else 0.2),
        "hold_and_win": float(c.rtp_alloc_hold_and_win if c.rtp_alloc_hold_and_win is not None else 0.0),
        "jackpot": float(c.rtp_alloc_jackpot if c.rtp_alloc_jackpot is not None else 0.0),
        "tolerance": c.rtp_tolerance,
    }
    # Normalize the alloc to target_rtp (sum should equal target_rtp)
    s = rtp_alloc["base_game"] + rtp_alloc["free_spins"] + rtp_alloc["hold_and_win"] + rtp_alloc["jackpot"]
    if s > 0 and abs(s - c.target_rtp) > 1e-6:
        scale = c.target_rtp / s
        rtp_alloc["base_game"] *= scale
        rtp_alloc["free_spins"] *= scale
        rtp_alloc["hold_and_win"] *= scale
        rtp_alloc["jackpot"] *= scale

    ir: dict[str, Any] = {
        "schema_version": _SCHEMA_VERSION,
        "meta": _meta_block(spec),
        "topology": topology,
        "symbols": _symbols_block(spec.symbols),
        "reels": reels,
        "evaluation": evaluation,
        "paytable": paytable,
        "features": features,
        "rng": {"kind": "mulberry32", "default_seed": 3232693216},
        "bet": {"currency": "USD", "base_bet": 1.0, "denominations": [1.0]},
        "limits": limits,
        "compliance": compliance,
        "rtp_allocation": rtp_alloc,
    }

    # W4.7 — emit progressive_link if a linear_progressive feature exists.
    link = _progressive_link_block(spec)
    if link is not None:
        ir["progressive_link"] = link

    return ir
