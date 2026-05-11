//! Slot Game IR — Rust mirror of `src/ir/types.ts`.
//!
//! Every field name, every variant tag, every discriminator string must
//! match the TS side exactly — that's the contract behind the Faza 10.3
//! TS↔Rust parity gate. The roundtrip integration test in
//! `tests/ir_roundtrip.rs` proves it: deserialize a JSON config that
//! also passes Zod, re-serialize it, and assert no field drifted.
//!
//! All types derive `Serialize + Deserialize + Clone + Debug + PartialEq`.
//! No engine logic lives here — that's `crate::evaluator` /
//! `crate::simulator`. This module is shape only.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub mod validate;

pub use validate::{cross_validate, IRValidationIssue};

// ─── primitives ─────────────────────────────────────────────────────────

/// Stable kebab/snake key. We keep it `String` (not an enum) so the IR
/// supports arbitrary game-specific symbol sets without a code change.
pub type SymbolKey = String;

// ─── meta ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Meta {
    pub id: String,
    pub name: String,
    /// Semver of the config (NOT the engine binary).
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub theme_tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at_utc: Option<String>,
}

// ─── topology ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Topology {
    Rectangular {
        reels: u32,
        rows: u32,
    },
    VariableRows {
        reels: u32,
        /// `[min, max]` row count per reel index.
        row_range_per_reel: Vec<[u32; 2]>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ways_cap: Option<u64>,
    },
    ClusterGrid {
        columns: u32,
        rows: u32,
        adjacency: Adjacency,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Adjacency {
    Orthogonal,
    Diagonal,
    Hex,
}

// ─── symbols ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SymbolKind {
    Lp,
    Hp,
    Wild,
    Scatter,
    Bonus,
    Multiplier,
    Sticky,
    Expanding,
    Mystery,
    Transform,
    ChainWild,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SymbolDef {
    pub id: SymbolKey,
    pub name: String,
    pub kind: SymbolKind,
    /// `None` ⇒ doesn't substitute; `Some(All)` ⇒ "*" wildcard; `Some(List(…))`
    /// ⇒ explicit symbol list. Untagged so JSON shape exactly mirrors TS.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub substitutes: Option<Substitutes>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight_hint: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub appears_on: Option<Vec<u32>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Substitutes {
    /// JSON: `"*"`
    All(WildcardAll),
    /// JSON: `["S_LP1", "S_HP1", ...]`
    List(Vec<SymbolKey>),
}

/// Marker for the `"*"` literal. `#[serde(rename = "*")]` would make it
/// look like a regular string variant — wrapping it lets us keep the
/// untagged shape identical to TS (`'*' | string[]`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WildcardAll {
    #[serde(rename = "*")]
    Star,
}

// ─── reels ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ReelSet {
    /// Per-reel symbol→weight distribution.
    Weighted {
        base: Vec<BTreeMap<SymbolKey, f64>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        free_spins: Option<Vec<BTreeMap<SymbolKey, f64>>>,
    },
    /// Per-reel explicit strip arrays — enables full-cycle analytical math.
    Strips {
        base: Vec<Vec<SymbolKey>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        free_spins: Option<Vec<Vec<SymbolKey>>>,
    },
}

// ─── evaluation ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Ltr,
    Rtl,
    Both,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Evaluation {
    Lines {
        paylines: Vec<Vec<u32>>,
        direction: Direction,
        min_match: u32,
        pay_left_to_right_only: bool,
    },
    Ways {
        direction: Direction,
        min_match: u32,
        max_ways_per_spin: u64,
    },
    Cluster {
        min_cluster_size: u32,
        /// Cluster-size string key (`"5"`..`"12+"`) → multiplier.
        cluster_pay_table: BTreeMap<String, f64>,
    },
    PayAnywhere {
        min_count: u32,
    },
    Pattern {
        patterns: Vec<PatternSpec>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PatternSpec {
    pub id: String,
    pub positions: PatternPositions,
    pub pay_multiplier: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PatternPositions {
    /// JSON: `[[row, reel], ...]`
    List(Vec<[u32; 2]>),
    /// JSON: `"all"`
    All(All),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum All {
    #[serde(rename = "all")]
    All,
}

// ─── paytable ───────────────────────────────────────────────────────────

/// `symbol_id → (count_or_size_as_string → multiplier)`.
pub type Paytable = BTreeMap<SymbolKey, BTreeMap<String, f64>>;

// ─── features ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TriggerByCount {
    pub by: TriggerBy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thresholds: Option<BTreeMap<String, f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggerBy {
    ScatterCount,
    BonusCount,
    SpecialCount,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RetriggerSpec {
    #[serde(flatten)]
    pub trigger: TriggerByCount,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_total: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FsModifier {
    StickyWilds,
    ExpandingWilds,
    MultiplierLadder,
    MysterySymbol,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CascadeReplacement {
    Drop,
    RefillRandom,
    FixedStrip,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CashValueDist {
    pub value: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JackpotTier {
    pub id: String,
    pub multiplier: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PrizeEntry {
    pub id: String,
    pub weight: f64,
    pub pay_multiplier: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BuyOffer {
    pub id: String,
    pub cost_x: f64,
    pub guaranteed: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Feature {
    FreeSpins {
        trigger: TriggerByCount,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        retrigger: Option<RetriggerSpec>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        global_multiplier: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        modifiers: Option<Vec<FsModifier>>,
    },
    HoldAndWin {
        trigger: TriggerByCount,
        respins_initial: u32,
        respin_reset_on_new: bool,
        cash_value_distribution: Vec<CashValueDist>,
        jackpot_tiers: Vec<JackpotTier>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        grid_full_award: Option<String>,
    },
    Cascade {
        replacement: CascadeReplacement,
        max_chain: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        multiplier_progression: Option<Vec<f64>>,
    },
    Respin {
        cost_x: f64,
        max_uses_per_spin: u32,
    },
    Pick {
        prize_pool: Vec<PrizeEntry>,
    },
    Wheel {
        segments: Vec<PrizeEntry>,
    },
    BuyFeature {
        offers: Vec<BuyOffer>,
    },
    AnteBet {
        extra_multiplier: f64,
        enabled_by_default: bool,
    },
    Gamble {
        #[serde(rename = "type")]
        ty: GambleType,
        max_steps: u32,
        tie_resolution: TieResolution,
    },
    MysterySymbol {
        symbol_id: SymbolKey,
        reveal_distribution: BTreeMap<SymbolKey, f64>,
    },
    SymbolUpgrade {
        from: SymbolKey,
        to: SymbolKey,
        probability: f64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GambleType {
    RedBlack,
    Suit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TieResolution {
    House,
    Push,
}

// ─── rng / bet / limits / compliance / rtp_allocation ───────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rng {
    pub kind: RngKind,
    pub default_seed: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jump_function: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RngKind {
    Mulberry32,
    Pcg64,
    Xoshiro256pp,
    AesCtrDrbg,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnteBet {
    pub enabled: bool,
    pub extra_multiplier: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Bet {
    pub currency: String,
    pub base_bet: f64,
    pub denominations: Vec<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ante_bet: Option<AnteBet>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub buy_feature: Option<Vec<BuyOffer>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WinCapApply {
    PerSpin,
    PerFeatureSession,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Volatility {
    Low,
    Medium,
    High,
    Ultra,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Limits {
    pub target_rtp: f64,
    pub rtp_tolerance: f64,
    pub max_win_x: f64,
    pub win_cap_apply: WinCapApply,
    pub target_volatility: Volatility,
    pub hit_freq_target: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NearMissRule {
    MustBeRandom,
    AllowedWithinDistribution,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Compliance {
    pub jurisdictions: Vec<String>,
    pub rtp_range_required: [f64; 2],
    pub max_win_cap_required: f64,
    pub near_miss_rule: NearMissRule,
    pub ldw_disclosure: bool,
    pub session_time_display: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RtpAllocation {
    pub base_game: f64,
    pub free_spins: f64,
    pub hold_and_win: f64,
    pub jackpot: f64,
    pub tolerance: f64,
}

// ─── root ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SlotGameIR {
    pub schema_version: String,
    pub meta: Meta,
    pub topology: Topology,
    pub symbols: Vec<SymbolDef>,
    pub reels: ReelSet,
    pub evaluation: Evaluation,
    pub paytable: Paytable,
    pub features: Vec<Feature>,
    pub rng: Rng,
    pub bet: Bet,
    pub limits: Limits,
    pub compliance: Compliance,
    pub rtp_allocation: RtpAllocation,
}

impl SlotGameIR {
    /// Parse JSON. Returns serde errors verbatim — no wrapping so callers
    /// can stream them into structured logs.
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }

    /// Serialize to canonical JSON (pretty-printed, stable key order).
    /// BTreeMap fields give us key-stable output for free, which is the
    /// minimum requirement for the byte-level parity comparator.
    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}
