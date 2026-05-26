"""Feature coverage auditor — IR.features ↔ closed-form kernel catalog."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


# Curated lookup: feature.kind name → kernel module name (under tools.solvers).
FEATURE_KIND_TO_KERNEL: dict[str, str] = {
    "free_spins": "free_spin_pop_count",
    "free_spins_buy": "free_spin_buy_compound",
    "hold_and_win": "hold_and_spin_jackpot",
    "wild_expand": "wild_multiplier_stack",
    "wild_walking": "walking_wild_persistence",
    "wild_replicating": "replicating_wild_random_walk",
    "wild_sticky": "sticky_wild_markov",
    "wild_substitute": "wild_substitution_uplift",
    "wild_trail": "wild_trail_persistence",
    "wild_path_clear": "wild_path_clear",
    "wild_reel": "reel_mutate_wild",
    "wild_reel_drop": "random_wild_reel_drop",
    "wild_multiplier": "wild_multiplier_stack",
    "cluster_pays": "cluster_pays_variance",
    "cluster_expand": "cluster_expand_chain",
    "cluster_consolidation": "cluster_consolidation_bonus",
    "cascade": "cascade_reaction_chain",
    "cascade_compound_megaways": "megaways_cascade_compound",
    "megaways": "megaways_ways_count",
    "scatter_pay": "scatter_pay_bonus_chain",
    "scatter_total_bet": "scatter_total_bet_pay",
    "anywhere_pays": "anywhere_pays_binomial",
    "diagonal_payline": "diagonal_payline_pattern",
    "pick_bonus": "bonus_pick_geometric",
    "bonus_wheel": "bonus_wheel_markov",
    "bonus_wheel_segments": "wheel_segments_weighted_pick",
    "bonus_buy": "buy_feature_ev",
    "bonus_buy_tier": "bonus_buy_tier_choice",
    "bonus_collect": "coin_storm_collect",
    "collect_meter": "symbol_collection_meter",
    "level_up": "level_up_bonus",
    "mystery_symbol": "mystery_multiplier_symbol",
    "mystery_reveal": "mystery_reveal_aggregator",
    "mystery_box": "mystery_box_award_table",
    "morphing_symbol": "morphing_symbol_markov",
    "symbol_streak": "symbol_streak_bonus",
    "symbol_upgrade": "symbol_upgrade_random",
    "symbol_swap_respin": "symbol_swap_respin",
    "stacked_wild": "stacked_wild_random_reel",
    "big_symbol": "big_symbol_frame",
    "super_symbol_megablock": "super_symbol_megablock",
    "multiplier_grid": "multiplier_grid_matrix",
    "multiplier_progressive": "multiplier_progressive_chain",
    "lightning_bomb": "lightning_bomb_multiplier",
    "pyramid_multiplier": "pyramid_multiplier_stack",
    "respin_lock": "respin_lock_geometric",
    "respin_charge_meter": "respin_charge_meter",
    "sticky_respin_meter": "sticky_respin_meter",
    "reel_lock": "reel_lock_persistence",
    "nudge_respin": "nudge_respin_deterministic",
    "jackpot_share": "jackpot_share_ladder",
    "jackpot_seed_growth": "jackpot_seed_growth",
    "bet_multiplier_payline": "bet_multiplier_payline_stack",
    "gamble_double": "gamble_double_or_nothing",
    "skill_bonus": "skill_bonus_completion",
    "expanding_symbol": "expanding_symbol_reel",
    "chain_combo": "chain_combo_progressive",
}


@dataclass
class CoverageEntry:
    feature_kind: str
    kernel: str | None
    n_uses: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "feature_kind": self.feature_kind,
            "kernel": self.kernel,
            "n_uses": self.n_uses,
            "covered": self.kernel is not None,
        }


@dataclass
class CoverageReport:
    n_irs: int
    used_features: list[CoverageEntry] = field(default_factory=list)
    uncovered_features: list[str] = field(default_factory=list)
    unused_kernels: list[str] = field(default_factory=list)
    per_vendor_coverage: dict[str, float] = field(default_factory=dict)

    @property
    def coverage_pct(self) -> float:
        if not self.used_features:
            return 0.0
        covered = sum(1 for e in self.used_features if e.kernel)
        return covered / len(self.used_features)

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_irs": self.n_irs,
            "coverage_pct": self.coverage_pct,
            "n_features_used": len(self.used_features),
            "n_uncovered": len(self.uncovered_features),
            "n_unused_kernels": len(self.unused_kernels),
            "used_features": [e.to_dict() for e in self.used_features],
            "uncovered_features": list(self.uncovered_features),
            "unused_kernels": list(self.unused_kernels),
            "per_vendor_coverage": dict(self.per_vendor_coverage),
        }


def audit(
    feature_kinds_per_ir: list[tuple[str, list[str]]],
) -> CoverageReport:
    """`feature_kinds_per_ir` = [(vendor, [feature_kind, ...]), ...]"""
    use_counts: dict[str, int] = {}
    vendor_used: dict[str, list[str]] = {}
    for vendor, kinds in feature_kinds_per_ir:
        vendor_used.setdefault(vendor, [])
        for k in kinds:
            use_counts[k] = use_counts.get(k, 0) + 1
            vendor_used[vendor].append(k)

    used_features = [
        CoverageEntry(
            feature_kind=k,
            kernel=FEATURE_KIND_TO_KERNEL.get(k),
            n_uses=v,
        )
        for k, v in sorted(use_counts.items())
    ]
    uncovered = sorted(
        k for k in use_counts if k not in FEATURE_KIND_TO_KERNEL
    )
    unused_kernels = sorted(set(FEATURE_KIND_TO_KERNEL.values()) - {
        FEATURE_KIND_TO_KERNEL[k] for k in use_counts
        if k in FEATURE_KIND_TO_KERNEL
    })

    per_vendor: dict[str, float] = {}
    for vendor, kinds in vendor_used.items():
        if not kinds:
            per_vendor[vendor] = 0.0
            continue
        covered = sum(1 for k in kinds if k in FEATURE_KIND_TO_KERNEL)
        per_vendor[vendor] = covered / len(kinds)

    return CoverageReport(
        n_irs=len(feature_kinds_per_ir),
        used_features=used_features,
        uncovered_features=uncovered,
        unused_kernels=unused_kernels,
        per_vendor_coverage=per_vendor,
    )


def audit_irs(irs: list[dict[str, Any]]) -> CoverageReport:
    rows: list[tuple[str, list[str]]] = []
    for ir in irs:
        meta = ir.get("meta") or {}
        vendor = str(meta.get("vendor", "unknown"))
        features = ir.get("features") or []
        kinds = [
            str(f.get("kind", ""))
            for f in features
            if isinstance(f, dict) and f.get("kind")
        ]
        rows.append((vendor, kinds))
    return audit(rows)
