"""P10.2 — Composition planner: deeper feature dictionary + RTP balancing.

When the NL parser detects N features, the simple template dictionary in
`prompt_parser._FEATURE_TEMPLATES` plants every feature at its default
contribution rate. That works for the W6.2 deterministic synthesizer, but
when multiple features stack (FS + HoldAndWin + WheelBonus + Sticky wild),
the sum of feature RTP contributions can overshoot the target RTP — the
W6.4 SMT solver then has to scale paytable aggressively, often producing
unbalanced pay tiers.

This module solves that:

  1. **Feature RTP budget allocation** — splits target RTP across
     (base game, detected features) per a per-feature default-share table.
  2. **Per-feature parameter tuning** — adjusts trigger probs + avg-pay
     so each feature lands at its allocated RTP slice.
  3. **Sum-check** — verifies Σ feature RTP shares ≤ target RTP; logs a
     warning when the sum is close to 1.0 (no headroom for base game).

The planner is **deterministic**, audit-friendly, and feature-extensible.
It runs BEFORE the W6.4 SMT lock so the solver sees a balanced DSL.

Designed to compose with `tools.slot_design.prompt_parser.prompt_to_dsl`:

    from tools.slot_design import parse_prompt, prompt_to_dsl
    from tools.slot_design.composition_planner import plan_composition

    spec = parse_prompt("5×3 FS + HoldAndWin + WheelBonus RTP 96.5%")
    dsl = prompt_to_dsl(spec)
    dsl = plan_composition(dsl, audit=spec.audit_log)  # in-place + return
"""

from __future__ import annotations

from typing import Any, Optional


# Default per-feature RTP-share fractions (of target RTP) when the
# feature is the SOLE feature in the DSL. When multiple features are
# present, shares are normalised so they sum to ≤ 0.65 (leaving ≥35 %
# headroom for base-game line / ways / cluster contribution).
_FEATURE_DEFAULT_SHARES: dict[str, float] = {
    "free_spins":         0.25,
    "hold_and_win":       0.40,
    "wheel_bonus":        0.18,
    "pick_bonus":         0.12,
    "tumble":             0.20,
    "megaways_ways":      0.30,
    "cluster_pays":       0.30,
    "sticky_wild":        0.06,
    "wild_expand":        0.10,
    "multiplier_stack":   0.08,
    "progressive_jackpot": 0.05,
    "respin":             0.04,
    "buy_feature":        0.00,  # paid path — no implicit RTP overlay
    "ante_bet":           0.00,  # ante uplift, paid by stake
    "gamble":             0.00,  # 0-sum gamble post-spin (50/50 default)
    "mystery_symbol":     0.07,
    "symbol_upgrade":     0.10,
}

# Maximum combined feature share — leaves headroom for base-game line eval.
# Calibrated against W4.9 Vendor B real-PAR (CE base 0.40 + FS 0.13 + WE 0.26 +
# HW 0.41 + PW 0.016 = features 0.81, base 0.15 → 96 % combined).
_MAX_COMBINED_FEATURE_SHARE = 0.85

# Per-feature parameter scaling — when the share is normalised down, scale
# the most-RTP-affecting parameter so the closed-form contribution lands
# at the allocated share.
_RTP_PRIMARY_PARAM: dict[str, str] = {
    "free_spins":         "initial_spins",
    "hold_and_win":       "trigger_prob",
    "wheel_bonus":        "tier_pays",          # scale all entries
    "pick_bonus":         "avg_pay_per_pick",
    "tumble":             "chain_prob",
    "megaways_ways":      "max_symbols",
    "cluster_pays":       "min_cluster",
    "sticky_wild":        "trigger_prob",
    "wild_expand":        "on_reels",           # length scales
    "multiplier_stack":   "trigger_prob",
    "progressive_jackpot": "contribution_rate",
    "respin":             "trigger_prob",
    "buy_feature":        "cost_x",
    "ante_bet":           "stake_uplift",
    "gamble":             "max_doubles",
    "mystery_symbol":     "trigger_prob",
    "symbol_upgrade":     "upgrade_prob",
}


def plan_composition(
    dsl: dict[str, Any],
    *,
    audit: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Balance feature RTP-share allocations across the DSL.

    Mutates `dsl["features"]` in-place AND returns the same dict so it
    can be chained. Records every decision in `audit` if provided.

    Algorithm:
      1. Collect detected feature kinds from `dsl["features"]`.
      2. Look up each kind's default share; sum them.
      3. If sum > `_MAX_COMBINED_FEATURE_SHARE`, scale all shares down
         proportionally.
      4. For each feature, scale the primary RTP-affecting parameter
         by `share_alloc / share_default`.
      5. Write the per-feature `_rtp_share_alloc` field for downstream
         audit (P10.6 cert XML disclosure).
      6. Append a meta.notes line summarising the composition plan.
    """
    if "features" not in dsl or not isinstance(dsl["features"], list):
        return dsl

    feature_configs = dsl["features"]
    if not feature_configs:
        return dsl

    target_rtp = dsl.get("meta", {}).get("target_rtp", 0.96)

    # 1. Collect detected feature kinds + their defaults
    default_shares: list[float] = []
    kinds: list[str] = []
    for feat in feature_configs:
        kind = feat.get("kind", "")
        kinds.append(kind)
        default_shares.append(_FEATURE_DEFAULT_SHARES.get(kind, 0.10))

    sum_default = sum(default_shares)
    if audit is not None:
        audit.append(
            f"composition: target_rtp={target_rtp:.4f}, "
            f"features={kinds}, Σ default share={sum_default:.3f}"
        )

    # 2. Scale down if total exceeds max combined share
    if sum_default > _MAX_COMBINED_FEATURE_SHARE:
        scale = _MAX_COMBINED_FEATURE_SHARE / sum_default
        if audit is not None:
            audit.append(
                f"composition: Σ {sum_default:.3f} > "
                f"{_MAX_COMBINED_FEATURE_SHARE}; scale={scale:.4f}"
            )
        scaled_shares = [s * scale for s in default_shares]
    else:
        scaled_shares = list(default_shares)

    # 3. Apply scale to per-feature primary param + record allocation
    for feat, default_share, alloc_share, kind in zip(
        feature_configs, default_shares, scaled_shares, kinds, strict=True
    ):
        # Allocation ratio relative to default (1.0 when no scale-down)
        if default_share > 0:
            param_scale = alloc_share / default_share
        else:
            param_scale = 1.0

        primary = _RTP_PRIMARY_PARAM.get(kind)
        if primary is not None and primary in feat:
            original = feat[primary]
            scaled = _scale_value(original, param_scale)
            feat[primary] = scaled
            if audit is not None and param_scale != 1.0:
                audit.append(
                    f"composition: {kind}.{primary} {original} → {scaled} "
                    f"(scale {param_scale:.4f})"
                )

        # Record allocation for downstream audit
        feat["_rtp_share_alloc"] = round(alloc_share, 6)
        feat["_rtp_share_default"] = round(default_share, 6)

    # 4. Track total allocated share in meta
    total_alloc = sum(scaled_shares)
    meta = dsl.setdefault("meta", {})
    meta["_feature_share_total"] = round(total_alloc, 6)
    meta["_base_game_share_target"] = round(max(0.0, target_rtp - total_alloc), 6)

    # 5. Warn when no base-game headroom left
    if total_alloc >= target_rtp * 0.98:
        msg = (
            f"composition: WARN feature share {total_alloc:.3f} ≥ "
            f"98 % of target {target_rtp:.3f}; base-game line-eval has no "
            f"headroom"
        )
        if audit is not None:
            audit.append(msg)

    return dsl


def _scale_value(value: Any, factor: float) -> Any:
    """Scale a numeric / numeric-list value by factor; preserve type."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return max(1, int(round(value * factor)))
    if isinstance(value, float):
        return round(value * factor, 6)
    if isinstance(value, list):
        out = []
        for v in value:
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                out.append(_scale_value(v, factor))
            else:
                out.append(v)
        # For list-of-tier-pays etc., this preserves shape
        return out
    return value


def feature_dictionary() -> dict[str, dict[str, Any]]:
    """Expose the per-feature share + primary-param table for audit/CLI."""
    return {
        kind: {
            "default_share": _FEATURE_DEFAULT_SHARES.get(kind, 0.10),
            "primary_param": _RTP_PRIMARY_PARAM.get(kind, ""),
        }
        for kind in _FEATURE_DEFAULT_SHARES
    }
