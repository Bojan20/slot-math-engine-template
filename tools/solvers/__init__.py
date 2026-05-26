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
]
