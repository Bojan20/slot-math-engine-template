"""P1.6 — Closed-form solver kernels.

Each kernel computes an analytical RTP / probability for a specific
industry pattern (stacked wild, symbol upgrade, mystery reveal, etc.)
with a deterministic formula that the engine MC then verifies within
a published tolerance.

Conventions per kernel:

  ▸ Pure-Python dataclass parameter struct
  ▸ `analytical_rtp(params) -> float` — closed-form expected RTP
  ▸ `mc_simulate(params, spins, seed) -> dict` — reference MC run
  ▸ `acceptance_tolerance` — published convergence band (e.g. 0.5%)
  ▸ Test that analytical ↔ MC agree to within tolerance

These kernels are independent of the universal IR engine — they let a
designer estimate RTP for a candidate spec in milliseconds before
committing to a full MC verification.
"""

from .stacked_wild_random_reel import (
    StackedWildRandomReelParams,
    analytical_rtp as stacked_wild_rtp,
    mc_simulate as stacked_wild_mc,
)
from .symbol_upgrade_random import (
    SymbolUpgradeParams,
    analytical_rtp as symbol_upgrade_rtp,
    mc_simulate as symbol_upgrade_mc,
)
from .mystery_reveal_aggregator import (
    MysteryRevealParams,
    analytical_rtp as mystery_reveal_rtp,
    mc_simulate as mystery_reveal_mc,
)
from .cluster_pays_variance import (
    ClusterPaysParams,
    analytical_rtp as cluster_pays_rtp,
    mc_simulate as cluster_pays_mc,
)
from .bonus_wheel_markov import (
    BonusWheelParams,
    WheelSegment,
    analytical_rtp as bonus_wheel_rtp,
    mc_simulate as bonus_wheel_mc,
    expected_chain_length as bonus_wheel_chain,
)
from .buy_feature_ev import (
    BuyFeatureParams,
    buy_mode_rtp,
    natural_mode_loss_rate,
    crossover_n_spins,
    buy_is_positive_ev,
    mc_simulate as buy_feature_mc,
)
from .sticky_wild_markov import (
    StickyWildParams,
    analytical_rtp as sticky_wild_rtp,
    mc_simulate as sticky_wild_mc,
    expected_total_wilds,
)
from .fs_retrigger_compound import (
    FsRetriggerParams,
    analytical_rtp as fs_retrigger_rtp,
    mc_simulate as fs_retrigger_mc,
    expected_total_spins,
    variance_total_spins,
)
from .megaways_ways_count import (
    MegawaysParams,
    analytical_rtp as megaways_rtp,
    mc_simulate as megaways_mc,
    expected_height,
    expected_total_ways,
)
from .cascade_reaction_chain import (
    CascadeChainParams,
    analytical_rtp as cascade_chain_rtp,
    mc_simulate as cascade_chain_mc,
    expected_chain_length,
    variance_total_pay as cascade_chain_var,
)
from .hold_and_spin_jackpot import (
    HoldAndSpinJackpotParams,
    analytical_rtp as hns_jackpot_rtp,
    mc_simulate as hns_jackpot_mc,
    expected_total_orbs,
)
from .wild_multiplier_stack import (
    WildMultiplierStackParams,
    analytical_rtp as wild_mult_rtp,
    mc_simulate as wild_mult_mc,
    expected_multiplier,
    expected_pi_T,
)
from .collect_feature_progressive import (
    CollectProgressiveParams,
    analytical_rtp as collect_rtp,
    mc_simulate as collect_mc,
    expected_value_coins,
)
from .scatter_total_bet_pay import (
    ScatterTotalBetParams,
    analytical_rtp as scatter_totalbet_rtp,
    mc_simulate as scatter_totalbet_mc,
)
from .diagonal_payline_pattern import (
    DiagonalPaylineParams,
    analytical_rtp as diagonal_rtp,
    mc_simulate as diagonal_mc,
    per_line_rtp as diagonal_per_line_rtp,
)
from .avalanche_consecutive import (
    AvalancheConsecutiveParams,
    analytical_rtp as avalanche_rtp,
    mc_simulate as avalanche_mc,
    expected_chain_payout,
)
from .jackpot_share_ladder import (
    JackpotShareLadderParams,
    analytical_rtp as jp_share_rtp,
    mc_simulate as jp_share_mc,
    normalized_probs,
    expected_pay_per_trigger,
    variance_per_spin as jp_share_var,
)
from .reel_mutate_wild import (
    ReelMutateWildParams,
    analytical_rtp as reel_mutate_rtp,
    mc_simulate as reel_mutate_mc,
    effective_prob as reel_mutate_p_eff,
)
from .morphing_symbol_markov import (
    MorphingSymbolMarkovParams,
    analytical_rtp as morph_rtp,
    mc_simulate as morph_mc,
    level_distribution,
    expected_pay_per_trigger as morph_expected_pay,
)
from .multiplier_grid_matrix import (
    MultiplierGridParams,
    analytical_rtp as mult_grid_rtp,
    mc_simulate as mult_grid_mc,
    expected_cell_multiplier,
    expected_total_multiplier,
)
from .symbol_streak_bonus import (
    SymbolStreakBonusParams,
    analytical_rtp as streak_rtp,
    mc_simulate as streak_mc,
    prob_streak_at_least,
)
from .bet_multiplier_payline_stack import (
    BetMultiplierStackParams,
    rtp_at_bm,
    ev_delta as bm_stack_ev_delta,
    is_positive_ev_at_bm,
)
from .nudge_respin_deterministic import (
    NudgeRespinParams,
    analytical_rtp as nudge_rtp,
    mc_simulate as nudge_mc,
    expected_value_per_trigger,
    is_positive_ev as nudge_is_positive_ev,
)
from .bonus_pick_geometric import (
    BonusPickParams,
    expected_total_pay as bonus_pick_rtp,
    variance_total_pay as bonus_pick_var,
    mc_simulate as bonus_pick_mc,
)
from .big_symbol_frame import (
    BigSymbolFrameParams,
    analytical_rtp as big_symbol_rtp,
    mc_simulate as big_symbol_mc,
)
from .wild_trail_persistence import (
    WildTrailParams,
    analytical_rtp as wild_trail_rtp,
    mc_simulate as wild_trail_mc,
    expected_session_length as wild_trail_session_length,
)
from .anywhere_pays_binomial import (
    AnywherePaysParams,
    analytical_rtp as anywhere_pays_rtp,
    mc_simulate as anywhere_pays_mc,
)
from .lightning_bomb_multiplier import (
    LightningBombParams,
    analytical_rtp as lightning_bomb_rtp,
    mc_simulate as lightning_bomb_mc,
    expected_multiplier as lightning_bomb_em,
)
from .coin_storm_collect import (
    CoinStormParams,
    analytical_rtp as coin_storm_rtp,
    mc_simulate as coin_storm_mc,
    expected_pay_per_trigger as coin_storm_expected,
    variance_pay_per_trigger as coin_storm_var,
)
from .respin_lock_geometric import (
    RespinLockParams,
    analytical_rtp as respin_lock_rtp,
    mc_simulate as respin_lock_mc,
)
from .wild_path_clear import (
    WildPathClearParams,
    analytical_rtp as wild_path_rtp,
    mc_simulate as wild_path_mc,
    expected_path_length,
)
from .free_spin_buy_compound import (
    FsBuyCompoundParams,
    buy_mode_rtp as fs_buy_compound_rtp,
    mc_simulate as fs_buy_compound_mc,
    expected_session_spins as fs_buy_compound_spins,
    variance_session_pay as fs_buy_compound_var,
)
from .symbol_collection_meter import (
    CollectionMeterParams,
    analytical_rtp as collection_meter_rtp,
    mc_simulate as collection_meter_mc,
    prob_filled_within_window,
)
from .multiplier_progressive_chain import (
    ProgressiveMultiplierParams,
    analytical_rtp as prog_mult_rtp,
    mc_simulate as prog_mult_mc,
    expected_session_payout,
)
from .reel_lock_persistence import (
    ReelLockParams,
    analytical_rtp as reel_lock_rtp,
    mc_simulate as reel_lock_mc,
    expected_session_length as reel_lock_session_length,
    expected_locked_reels,
)
from .cluster_expand_chain import (
    ClusterExpandParams,
    analytical_rtp as cluster_expand_rtp,
    mc_simulate as cluster_expand_mc,
    expected_final_cluster_size,
)
from .level_up_bonus import (
    LevelUpParams,
    analytical_rtp as level_up_rtp,
    mc_simulate as level_up_mc,
    expected_levels,
)
from .mystery_multiplier_symbol import (
    MysteryMultParams,
    analytical_rtp as mystery_mult_rtp,
    mc_simulate as mystery_mult_mc,
    expected_multiplier as mystery_mult_em,
)
from .scatter_pay_bonus_chain import (
    ScatterChainParams,
    analytical_rtp as scatter_chain_rtp,
    mc_simulate as scatter_chain_mc,
    expected_scatter_pay,
)
from .free_spin_pop_count import (
    FreeSpinPopParams,
    analytical_rtp as fs_pop_rtp,
    mc_simulate as fs_pop_mc,
    expected_award as fs_pop_expected_award,
)
from .wild_substitution_uplift import (
    WildSubUpliftParams,
    analytical_rtp as wild_sub_rtp,
    mc_simulate as wild_sub_mc,
    uplift_vs_baseline,
    baseline_per_line_rtp,
    with_wild_per_line_rtp,
)
from .symbol_swap_respin import (
    SymbolSwapParams,
    analytical_rtp as symbol_swap_rtp,
    mc_simulate as symbol_swap_mc,
)
from .bonus_buy_tier_choice import (
    BonusBuyTier,
    BonusBuyTierChoiceParams,
    ev_per_tier,
    best_tier_index,
    dominance_table,
    analytical_rtp as bonus_buy_tier_rtp,
    mc_simulate as bonus_buy_tier_mc,
)
from .replicating_wild_random_walk import (
    ReplicatingWildParams,
    analytical_rtp as replicating_wild_rtp,
    mc_simulate as replicating_wild_mc,
)
from .gamble_double_or_nothing import (
    GambleParams,
    analytical_rtp as gamble_rtp,
    mc_simulate as gamble_mc,
)
from .super_symbol_megablock import (
    MegablockParams,
    analytical_rtp as megablock_rtp,
    mc_simulate as megablock_mc,
)
from .mystery_box_award_table import (
    MysteryBoxParams,
    analytical_rtp as mystery_box_rtp,
    mc_simulate as mystery_box_mc,
)
from .pyramid_multiplier_stack import (
    PyramidMultiplierParams,
    analytical_rtp as pyramid_mult_rtp,
    mc_simulate as pyramid_mult_mc,
    expected_average_multiplier,
)
from .random_wild_reel_drop import (
    WildReelDropParams,
    analytical_rtp as wild_reel_drop_rtp,
    mc_simulate as wild_reel_drop_mc,
)
from .cluster_consolidation_bonus import (
    ClusterConsolidationParams,
    analytical_rtp as cluster_consolidation_rtp,
    mc_simulate as cluster_consolidation_mc,
)
from .respin_charge_meter import (
    RespinChargeMeterParams,
    analytical_rtp as respin_charge_rtp,
    mc_simulate as respin_charge_mc,
    prob_fill as respin_charge_prob_fill,
)
from .megaways_cascade_compound import (
    MegawaysCascadeParams,
    analytical_rtp as megaways_cascade_rtp,
    mc_simulate as megaways_cascade_mc,
    expected_cascades,
)
from .wheel_segments_weighted_pick import (
    WheelSegmentsParams,
    analytical_rtp as wheel_segments_rtp,
    mc_simulate as wheel_segments_mc,
    expected_per_spin as wheel_segments_expected_per_spin,
)
from .skill_bonus_completion import (
    SkillBonusParams,
    analytical_rtp as skill_bonus_rtp,
    mc_simulate as skill_bonus_mc,
    expected_payout_per_trigger as skill_bonus_per_trigger,
)
from .expanding_symbol_reel import (
    ExpandingSymbolParams,
    analytical_rtp as expanding_symbol_rtp,
    mc_simulate as expanding_symbol_mc,
    prob_line as expanding_symbol_prob_line,
)
from .jackpot_seed_growth import (
    JackpotSeedGrowthParams,
    analytical_rtp as jp_seed_growth_rtp,
    mc_simulate as jp_seed_growth_mc,
    expected_award as jp_seed_expected_award,
)
from .sticky_respin_meter import (
    StickyRespinMeterParams,
    analytical_rtp as sticky_respin_meter_rtp,
    mc_simulate as sticky_respin_meter_mc,
)
from .walking_wild_persistence import (
    WalkingWildParams,
    analytical_rtp as walking_wild_rtp,
    mc_simulate as walking_wild_mc,
    expected_lifetime as walking_wild_lifetime,
)
from .chain_combo_progressive import (
    ChainComboParams,
    analytical_rtp as chain_combo_rtp,
    mc_simulate as chain_combo_mc,
    expected_combo_sum,
)
from .tumble_streak_freezer import (
    TumbleFreezerParams,
    analytical_rtp as tumble_freezer_rtp,
    mc_simulate as tumble_freezer_mc,
    expected_wins as tumble_expected_wins,
)
from .multi_screen_sync_bonus import (
    MultiScreenSyncParams,
    analytical_rtp as multi_screen_sync_rtp,
    mc_simulate as multi_screen_sync_mc,
)
from .instant_win_scratch_pattern import (
    InstantWinScratchParams,
    analytical_rtp as instant_win_rtp,
    mc_simulate as instant_win_mc,
    prob_win as instant_win_prob,
)
from .wild_morph_chain import (
    WildMorphChainParams,
    analytical_rtp as wild_morph_chain_rtp,
    mc_simulate as wild_morph_chain_mc,
    expected_per_respin as wild_morph_per_respin,
)
from .scatter_progressive_unlock import (
    ScatterProgressiveUnlockParams,
    analytical_rtp as scatter_progressive_rtp,
    mc_simulate as scatter_progressive_mc,
)
from .lock_and_reload_jackpot import (
    LockAndReloadParams,
    analytical_rtp as lock_reload_rtp,
    mc_simulate as lock_reload_mc,
)
from .symbol_collection_unlock import (
    SymbolCollectionUnlockParams,
    analytical_rtp as collection_unlock_rtp,
    mc_simulate as collection_unlock_mc,
    prob_unlock,
)
from .bonus_buy_dynamic_pricing import (
    BonusBuyDynamicPricingParams,
    analytical_rtp as bb_dynamic_rtp,
    mc_simulate as bb_dynamic_mc,
    effective_cost,
    ev_per_buy,
    is_positive_ev as bb_dynamic_is_positive_ev,
)

__all__ = [
    "StackedWildRandomReelParams",
    "stacked_wild_rtp",
    "stacked_wild_mc",
    "SymbolUpgradeParams",
    "symbol_upgrade_rtp",
    "symbol_upgrade_mc",
    "MysteryRevealParams",
    "mystery_reveal_rtp",
    "mystery_reveal_mc",
    "ClusterPaysParams",
    "cluster_pays_rtp",
    "cluster_pays_mc",
    "BonusWheelParams",
    "WheelSegment",
    "bonus_wheel_rtp",
    "bonus_wheel_mc",
    "bonus_wheel_chain",
    "BuyFeatureParams",
    "buy_mode_rtp",
    "natural_mode_loss_rate",
    "crossover_n_spins",
    "buy_is_positive_ev",
    "buy_feature_mc",
    "StickyWildParams",
    "sticky_wild_rtp",
    "sticky_wild_mc",
    "expected_total_wilds",
    "FsRetriggerParams",
    "fs_retrigger_rtp",
    "fs_retrigger_mc",
    "expected_total_spins",
    "variance_total_spins",
    "MegawaysParams",
    "megaways_rtp",
    "megaways_mc",
    "expected_height",
    "expected_total_ways",
    "CascadeChainParams",
    "cascade_chain_rtp",
    "cascade_chain_mc",
    "expected_chain_length",
    "cascade_chain_var",
    "HoldAndSpinJackpotParams",
    "hns_jackpot_rtp",
    "hns_jackpot_mc",
    "expected_total_orbs",
    "WildMultiplierStackParams",
    "wild_mult_rtp",
    "wild_mult_mc",
    "expected_multiplier",
    "expected_pi_T",
    "CollectProgressiveParams",
    "collect_rtp",
    "collect_mc",
    "expected_value_coins",
    "ScatterTotalBetParams",
    "scatter_totalbet_rtp",
    "scatter_totalbet_mc",
    "DiagonalPaylineParams",
    "diagonal_rtp",
    "diagonal_mc",
    "diagonal_per_line_rtp",
    "AvalancheConsecutiveParams",
    "avalanche_rtp",
    "avalanche_mc",
    "expected_chain_payout",
    "JackpotShareLadderParams",
    "jp_share_rtp",
    "jp_share_mc",
    "normalized_probs",
    "expected_pay_per_trigger",
    "jp_share_var",
    "ReelMutateWildParams",
    "reel_mutate_rtp",
    "reel_mutate_mc",
    "reel_mutate_p_eff",
    "MorphingSymbolMarkovParams",
    "morph_rtp",
    "morph_mc",
    "level_distribution",
    "morph_expected_pay",
    "MultiplierGridParams",
    "mult_grid_rtp",
    "mult_grid_mc",
    "expected_cell_multiplier",
    "expected_total_multiplier",
    "SymbolStreakBonusParams",
    "streak_rtp",
    "streak_mc",
    "prob_streak_at_least",
    "BetMultiplierStackParams",
    "rtp_at_bm",
    "bm_stack_ev_delta",
    "is_positive_ev_at_bm",
    "NudgeRespinParams",
    "nudge_rtp",
    "nudge_mc",
    "expected_value_per_trigger",
    "nudge_is_positive_ev",
    "BonusPickParams",
    "bonus_pick_rtp",
    "bonus_pick_var",
    "bonus_pick_mc",
    "BigSymbolFrameParams",
    "big_symbol_rtp",
    "big_symbol_mc",
    "WildTrailParams",
    "wild_trail_rtp",
    "wild_trail_mc",
    "wild_trail_session_length",
    "AnywherePaysParams",
    "anywhere_pays_rtp",
    "anywhere_pays_mc",
    "LightningBombParams",
    "lightning_bomb_rtp",
    "lightning_bomb_mc",
    "lightning_bomb_em",
    "CoinStormParams",
    "coin_storm_rtp",
    "coin_storm_mc",
    "coin_storm_expected",
    "coin_storm_var",
    "RespinLockParams",
    "respin_lock_rtp",
    "respin_lock_mc",
    "WildPathClearParams",
    "wild_path_rtp",
    "wild_path_mc",
    "expected_path_length",
    "FsBuyCompoundParams",
    "fs_buy_compound_rtp",
    "fs_buy_compound_mc",
    "fs_buy_compound_spins",
    "fs_buy_compound_var",
    "CollectionMeterParams",
    "collection_meter_rtp",
    "collection_meter_mc",
    "prob_filled_within_window",
    "ProgressiveMultiplierParams",
    "prog_mult_rtp",
    "prog_mult_mc",
    "expected_session_payout",
    "ReelLockParams",
    "reel_lock_rtp",
    "reel_lock_mc",
    "reel_lock_session_length",
    "expected_locked_reels",
    "ReplicatingWildParams",
    "replicating_wild_rtp",
    "replicating_wild_mc",
    "GambleParams",
    "gamble_rtp",
    "gamble_mc",
    "MegablockParams",
    "megablock_rtp",
    "megablock_mc",
    "MysteryBoxParams",
    "mystery_box_rtp",
    "mystery_box_mc",
    "PyramidMultiplierParams",
    "pyramid_mult_rtp",
    "pyramid_mult_mc",
    "expected_average_multiplier",
    "WildReelDropParams",
    "wild_reel_drop_rtp",
    "wild_reel_drop_mc",
    "ClusterConsolidationParams",
    "cluster_consolidation_rtp",
    "cluster_consolidation_mc",
    "RespinChargeMeterParams",
    "respin_charge_rtp",
    "respin_charge_mc",
    "respin_charge_prob_fill",
    "MegawaysCascadeParams",
    "megaways_cascade_rtp",
    "megaways_cascade_mc",
    "expected_cascades",
    "WheelSegmentsParams",
    "wheel_segments_rtp",
    "wheel_segments_mc",
    "wheel_segments_expected_per_spin",
    "SkillBonusParams",
    "skill_bonus_rtp",
    "skill_bonus_mc",
    "skill_bonus_per_trigger",
    "ExpandingSymbolParams",
    "expanding_symbol_rtp",
    "expanding_symbol_mc",
    "expanding_symbol_prob_line",
    "JackpotSeedGrowthParams",
    "jp_seed_growth_rtp",
    "jp_seed_growth_mc",
    "jp_seed_expected_award",
    "StickyRespinMeterParams",
    "sticky_respin_meter_rtp",
    "sticky_respin_meter_mc",
    "WalkingWildParams",
    "walking_wild_rtp",
    "walking_wild_mc",
    "walking_wild_lifetime",
    "ChainComboParams",
    "chain_combo_rtp",
    "chain_combo_mc",
    "expected_combo_sum",
    "TumbleFreezerParams",
    "tumble_freezer_rtp",
    "tumble_freezer_mc",
    "tumble_expected_wins",
    "MultiScreenSyncParams",
    "multi_screen_sync_rtp",
    "multi_screen_sync_mc",
    "InstantWinScratchParams",
    "instant_win_rtp",
    "instant_win_mc",
    "instant_win_prob",
    "WildMorphChainParams",
    "wild_morph_chain_rtp",
    "wild_morph_chain_mc",
    "wild_morph_per_respin",
    "ScatterProgressiveUnlockParams",
    "scatter_progressive_rtp",
    "scatter_progressive_mc",
    "LockAndReloadParams",
    "lock_reload_rtp",
    "lock_reload_mc",
    "SymbolCollectionUnlockParams",
    "collection_unlock_rtp",
    "collection_unlock_mc",
    "prob_unlock",
    "BonusBuyDynamicPricingParams",
    "bb_dynamic_rtp",
    "bb_dynamic_mc",
    "effective_cost",
    "ev_per_buy",
    "bb_dynamic_is_positive_ev",
]
