// Universal IR — single JSON schema for ALL slot game families.
//
// The IR is intentionally a *flat enum union*: every variant
// (Topology::Rectangular vs Topology::Megaways, Evaluation::Lines vs
// Evaluation::Cluster, Feature::HoldAndWin vs Feature::PickBonus etc.) is
// serde-tagged so a single parser can read CE COPY TEST (3×5 paylines +
// hold-and-win + progressive) and Fort Knox Wolf Run (4×5 paylines +
// pick-bonus + linear progressive) **out of the same code path**.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

// ───────────────────────────── TOPOLOGY ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Topology {
    /// Fixed N×M grid (CE COPY TEST: 3×5, Wolf Run: 4×5).
    Rectangular { reels: u32, rows: u32 },
    /// Variable rows per reel (Megaways: 2-7 per reel × 5 reels).
    Megaways {
        reels: u32,
        rows_min: u32,
        rows_max: u32,
        /// Per-reel weighted distribution of row count.
        rows_weights: Vec<Vec<u32>>,
    },
    /// Cluster grid (typically 7×7 or 6×5 for cluster pays games).
    ClusterGrid { width: u32, height: u32 },
}

// ───────────────────────────── EVALUATION ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Evaluation {
    /// Fixed paylines L-to-R (CE: 20 lines, Wolf Run: 40 lines).
    Lines {
        lines: Vec<Vec<Option<u32>>>,
        min_count: u32, // 3 typically
    },
    /// Ways evaluation (Aristocrat 243 / 1024 ways).
    Ways {
        ways: u32, // 243 / 1024 / etc.
        min_count: u32,
    },
    /// Megaways (variable ways per spin = product of per-reel row counts).
    Megaways { min_count: u32 },
    /// Cluster pays (BFS flood-fill, 4-way or 8-way adjacency).
    Cluster {
        min_cluster_size: u32,
        adjacency: ClusterAdjacency,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClusterAdjacency {
    Orthogonal, // 4-way
    Diagonal,   // 8-way
}

// ───────────────────────────── SYMBOLS ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub role: SymbolRole,
    /// For Wild: list of symbols it substitutes for ("*" = all except specials).
    #[serde(default)]
    pub substitutes: Option<Vec<String>>,
    /// For Wild: list of symbols it does NOT substitute (Fireball / Volcano in CE).
    #[serde(default)]
    pub substitutes_except: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SymbolRole {
    #[default]
    Lp,
    Hp,
    Wild,
    Scatter,
    Bonus,
    /// Cash symbol for hold-and-win features (CE Fireball).
    Cash,
    /// Pattern-win anchor (CE Red7).
    Anchor,
    /// Big variant (CE FS Big_X symbols on linked reels).
    Big,
}

// ───────────────────────────── REELS ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelStop {
    pub symbol: String,
    pub weight: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelSet {
    /// Identifier used by reel-set picker.
    pub set: i64,
    /// Per-reel ordered list of stop entries (probabilistic reel model).
    pub reels: Vec<Vec<ReelStop>>,
    /// Optional human-readable label.
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelSetWeight {
    pub set: i64,
    pub weight: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelSetWeights {
    pub weights: Vec<ReelSetWeight>,
    pub total: i64,
    #[serde(default)]
    pub initial_set: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelBank {
    /// Base-game reel sets.
    pub base: Vec<ReelSet>,
    pub base_weights: ReelSetWeights,
    /// Free-spins reel sets (optional — present only if FS feature exists).
    #[serde(default)]
    pub fs: Vec<ReelSet>,
    #[serde(default)]
    pub fs_weights: Option<ReelSetWeights>,
}

// ───────────────────────────── PAYTABLE ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaytableEntry {
    /// Combo cells (e.g. ["Red7","Red7","Red7","Red7","Red7"] or ["Any 5 Volcano"]).
    pub combo: Vec<String>,
    /// Pay (in coins per line or per-occurrence; semantics per `scope`).
    pub pays: f64,
    /// Scope: "line" (per payline) | "scatter" (× total bet, per grid) | "pattern" (replaces line wins).
    #[serde(default = "default_scope")]
    pub scope: String,
    /// Optional marker (e.g. "*" or "**") from PAR sheet.
    #[serde(default)]
    pub marker: String,
}

fn default_scope() -> String {
    "line".to_string()
}

// ───────────────────────────── FEATURES ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Feature {
    /// CE-style hold-and-win: 6+ cash symbols → 3 respins, coin distribution per BM page.
    HoldAndWin {
        trigger_symbol: String,
        trigger_count_min: u32,
        respins: u32,
        // Per-bet-multiplier coin-value distributions (CE 21 pages).
        pages: BTreeMap<String, HoldAndWinPage>,
    },
    /// Wolf Run-style pick-bonus.
    ///
    /// Two trigger modes supported (W4.3c):
    ///   ▸ **Scatter-based** (default): when `trigger_prob` is `None`, fires
    ///     when `trigger_symbol` count on the grid ≥ `trigger_count_min`.
    ///   ▸ **Bernoulli-based**: when `trigger_prob` is `Some(p)`, fires with
    ///     probability `p` on every spin regardless of scatter count. Used by
    ///     IGT Fort Knox Bonus where the trigger is drawn from a published
    ///     trigger weight table (e.g. Yes=670005 / Total=100M ⇒ p=0.00670).
    PickBonus {
        trigger_symbol: String,
        trigger_count_min: u32,
        // Award Table: each entry has weight + pay (in coins or total-bet multiples).
        awards: Vec<PickAward>,
        /// W4.3c — Bernoulli trigger probability. When `Some`, overrides the
        /// scatter-count trigger; when `None`, falls back to scatter logic.
        #[serde(default)]
        trigger_prob: Option<f64>,
    },
    /// Free spins: N+ scatter → K free spins, optional retrigger, optional reel-set swap.
    FreeSpins {
        trigger_symbol: String,
        trigger_count_min: u32,
        initial_spins: u32,
        retrigger_spins: u32,
        max_total_spins: Option<u32>,
        reel_bank: String, // "fs" typically — references ReelBank.fs
        // Linked-block configuration (CE has reels 2/3/4 linked).
        #[serde(default)]
        linked_reels: Option<Vec<u32>>,
    },
    /// Wild expansion on specific reels when wild lands.
    WildExpand {
        wild_symbol: String,
        on_reels: Vec<u32>,
        /// Only expand if it produces a winning combination.
        only_if_winning: bool,
    },
    /// Pattern win: 3 anchor symbols on reel 0 + wild expansion on reels 1..4.
    PatternWin {
        anchor_symbol: String,
        anchor_count: u32,
        anchor_reel: u32,
        required_wild_reels: Vec<u32>,
        pays: f64,
    },
    /// Linear-scaling progressive jackpot (Wolf Run style).
    LinearProgressive {
        /// 1-in-N at bet multiplier 1 (e.g. 7,500,000 for Wolf Run).
        odds_at_bm1: f64,
        /// Top award (in coins or as "Progressive" marker).
        top_award_coins: Option<i64>,
    },
    /// Probabilistic GRAND prize (CE style).
    GrandPrize {
        /// P(grand per CE trigger) — context-dependent for base vs FS.
        prob_base: f64,
        prob_fs: f64,
        award_coins: i64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoldAndWinPage {
    pub bet_multiplier: i64,
    pub set_pool_weights: SetPoolWeights,
    pub small_coin_dist: Vec<CoinValue>,
    pub big_coin_dist: Vec<CoinValue>,
    pub pots: BTreeMap<String, Pot>, // MINI/MINOR/MAJOR
    // (n_landed_str) → (remaining_str) → (n_additional_str) → weight
    pub respin_tables: BTreeMap<String, BTreeMap<String, BTreeMap<String, i64>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPoolWeights {
    pub low: i64,
    pub med: i64,
    pub high: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoinValue {
    pub coin_value: i64,
    pub low: i64,
    pub med: i64,
    pub high: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pot {
    pub value: i64,
    pub low: i64,
    pub med: i64,
    pub high: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickAward {
    pub label: String,
    pub weight: i64,
    pub pays_coins: f64,
}

// ───────────────────────────── BET TABLE ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BetTable {
    pub lines: u32,
    pub multipliers: Vec<i64>,
    pub total_bets: Vec<f64>,
}

// ───────────────────────────── META ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meta {
    pub name: String,
    pub vendor: String,
    pub swid: String,
    #[serde(default)]
    pub family: String, // "paylines" | "ways" | "megaways" | "cluster"
    pub rtp_total: f64,
    #[serde(default)]
    pub rtp_breakdown: BTreeMap<String, f64>,
    pub hit_frequency: f64,
    pub win_frequency: f64,
    #[serde(default)]
    pub notes: Vec<String>,
    /// W4.3d — sampling mode override.
    ///   * `Some("virtual_independent")` — per-cell independent sample
    ///     from a weighted per-reel strip (IGT virtual-reel model).
    ///   * `Some("physical_strip")` (default) — adjacent-row sampling
    ///     from a physical strip with `visible()` window (L&W model).
    ///   * `None` — defaults to `physical_strip`.
    #[serde(default)]
    pub sampling_mode: Option<String>,
}

// ───────────────────────────── ROOT IR ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ir {
    pub meta: Meta,
    pub topology: Topology,
    pub evaluation: Evaluation,
    pub symbols: Vec<Symbol>,
    pub reels: ReelBank,
    pub paytable: Vec<PaytableEntry>,
    #[serde(default)]
    pub features: Vec<Feature>,
    pub bet_table: BetTable,
}

impl Ir {
    pub fn load(path: impl AsRef<Path>) -> std::io::Result<Self> {
        let bytes = std::fs::read(path)?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    pub fn find_symbol(&self, id: &str) -> Option<&Symbol> {
        self.symbols.iter().find(|s| s.id == id)
    }
}
