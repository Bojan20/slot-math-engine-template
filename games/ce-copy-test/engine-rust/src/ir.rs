// IR loader — typed view over ce-copy-test.<swid>.ir.json.
//
// The JSON contract is owned by `scripts/parse_par.py`. Field names are
// deliberately verbose to match the Excel cell labels — easier to audit
// against the PAR sheet when cert engineers run a manual diff.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meta {
    pub name: String,
    pub based_on: String,
    pub swid: String,
    pub reels: u32,
    pub rows: u32,
    pub lines: u32,
    pub left_to_right_only: bool,
    pub hold: f64,
    pub hit_frequency_all_line: f64,
    pub win_frequency_all_line: f64,
    pub rtp_breakdown: RtpBreakdown,
    pub rtp_total: f64,
    pub bet_multipliers: Vec<i64>,
    pub total_bets: Vec<f64>,
    pub max_liabilities: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtpBreakdown {
    pub base_game: f64,
    pub cash_eruption_from_base: f64,
    pub free_spins: f64,
    pub cash_eruption_from_fs: f64,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaytableEntry {
    pub marker: String,
    pub combo: Vec<String>,
    pub pays: f64,
    pub pph: Option<f64>,
    pub rtp_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelSetWeights {
    pub weights: Vec<ReelSetWeight>,
    pub total: i64,
    pub initial_set: Option<i64>,
    pub initial_set_rtp: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelSetWeight {
    pub set: i64,
    pub weight: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FgReelSetWeights {
    pub weights: Vec<ReelSetWeight>,
    pub total: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelStop {
    pub symbol: String,
    pub weight: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelSet {
    pub set: i64,
    pub reels: Vec<Vec<ReelStop>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BonusSummary {
    pub avg_free_spins: Option<f64>,
    pub single_spin_payback_pct: Option<f64>,
    pub total_payback_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FireballsSetWeights {
    pub low: Option<i64>,
    pub med: Option<i64>,
    pub high: Option<i64>,
    pub total: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FireballValue {
    pub coin_value: i64,
    pub low: Option<i64>,
    pub med: Option<i64>,
    pub high: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PotEntry {
    pub value: i64,
    pub low: Option<i64>,
    pub med: Option<i64>,
    pub high: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinMinMajor {
    #[serde(default)]
    pub small: BTreeMap<String, PotEntry>,
    #[serde(default)]
    pub big: BTreeMap<String, PotEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RespinSlot {
    // Map "0" → weight, "1" → weight, …, "9" → weight, "total" → total
    #[serde(flatten)]
    pub by_additional: BTreeMap<String, i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RespinTable {
    // "3" → respins-remaining=3 distribution, "2" → 2, "1" → 1
    #[serde(flatten)]
    pub by_remaining: BTreeMap<String, RespinSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashEruptionPage {
    pub bet_multiplier: i64,
    pub fireballs_set_weights: FireballsSetWeights,
    pub small_fireball_values: Vec<FireballValue>,
    pub big_fireball_values: Vec<FireballValue>,
    pub mini_minor_major: MinMinMajor,
    // Map "6" → RespinTable, "7" → … etc.
    pub respin_tables: BTreeMap<String, BTreeMap<String, BTreeMap<String, i64>>>,
    pub ce_from_base_rtp: Option<f64>,
    pub ce_from_fs_rtp: Option<f64>,
    pub grand_prob_base: Option<f64>,
    pub grand_prob_fs: Option<f64>,
    pub top_award: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payline {
    pub line: u32,
    pub rows: Vec<Option<u32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ir {
    pub meta: Meta,
    pub symbol_counts_per_reel: BTreeMap<String, Vec<f64>>,
    pub paytable: Vec<PaytableEntry>,
    pub bg_reel_set_weights: ReelSetWeights,
    pub bg_reel_sets: Vec<ReelSet>,
    pub fg_reel_set_weights: FgReelSetWeights,
    pub fg_reel_sets: Vec<ReelSet>,
    pub fs_paytable: Vec<PaytableEntry>,
    pub bonus_summary: BonusSummary,
    pub cash_eruption_feature_pages: Vec<CashEruptionPage>,
    pub paylines: Vec<Payline>,
}

impl Ir {
    pub fn load(path: impl AsRef<Path>) -> std::io::Result<Self> {
        let bytes = std::fs::read(path)?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    pub fn ce_page_for_bet_multiplier(&self, bm: i64) -> Option<&CashEruptionPage> {
        self.cash_eruption_feature_pages
            .iter()
            .find(|p| p.bet_multiplier == bm)
    }
}
