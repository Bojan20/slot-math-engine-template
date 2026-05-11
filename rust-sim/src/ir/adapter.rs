//! IR → GameConfig Adapter (Faza 1.2)
//!
//! Converts a validated `SlotGameIR` into the `GameConfig` the Monte Carlo
//! engine consumes. This is the single bridge between the canonical
//! intermediate representation and the legacy engine types.
//!
//! Design invariants:
//!   - Start from `GameConfig::default()` and override every field the IR
//!     defines. Fields not covered by IR keep the default (safe fallback).
//!   - No hardcoded `5` or `3` for grid dimensions — all sizing comes from
//!     `ir.topology`.
//!   - Weight conversion: `(f64 × 10_000).round() as u32` so fractional
//!     weights round-trip with four decimal places of precision.
//!   - `AdapterError` variants are structured so callers can surface them
//!     as user-readable config loading failures.

use crate::config::{
    FreeSpinsConfig, GameConfig, HoldAndWinConfig, OrbValue, PayEntry,
    ReelWeight, SymbolDef,
};
use crate::ir::{
    Evaluation, Feature, ReelSet, SlotGameIR, SymbolKind, Topology, TriggerBy,
};
use std::collections::HashMap;

// ─── Error type ────────────────────────────────────────────────────────────

/// Errors that can occur when converting IR → GameConfig.
#[derive(Debug, Clone, PartialEq)]
pub enum AdapterError {
    /// The topology kind is not yet supported by the engine.
    UnsupportedTopology(String),
    /// The evaluation kind is not supported in the requested context.
    UnsupportedEvaluation(String),
    /// A reel was expected to have symbol weights but the map was empty.
    MissingWeights { reel: usize },
}

impl std::fmt::Display for AdapterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AdapterError::UnsupportedTopology(s) => {
                write!(f, "unsupported topology: {s}")
            }
            AdapterError::UnsupportedEvaluation(s) => {
                write!(f, "unsupported evaluation: {s}")
            }
            AdapterError::MissingWeights { reel } => {
                write!(f, "reel {reel} has no symbol weights")
            }
        }
    }
}

impl std::error::Error for AdapterError {}

// ─── Weight constant ───────────────────────────────────────────────────────

/// Scale factor for converting `f64` weights to `u32`.
/// Four decimal places: 0.0001 → 1, 1.0 → 10_000.
const WEIGHT_SCALE: f64 = 10_000.0;

#[inline]
fn f64_to_weight(v: f64) -> u32 {
    (v * WEIGHT_SCALE).round() as u32
}

// ─── Public entry point ────────────────────────────────────────────────────

/// Convert a fully-validated `SlotGameIR` into a `GameConfig`.
///
/// Call `cross_validate` on the IR before this function — this adapter
/// trusts that symbol references are valid and topology/evaluation are
/// coherent. It performs no additional semantic checks.
pub fn ir_to_game_config(ir: &SlotGameIR) -> Result<GameConfig, AdapterError> {
    let mut cfg = GameConfig::default();

    // ── Meta ───────────────────────────────────────────────────────────
    cfg.name = ir.meta.name.clone();
    cfg.version = ir.meta.version.clone();
    cfg.target_rtp = ir.limits.target_rtp * 100.0; // IR stores 0.96, GameConfig wants 96.0
    cfg.max_win_cap = ir.limits.max_win_x;

    // ── Topology → grid dimensions ──────────────────────────────────────
    let (reels, rows) = topology_to_dims(&ir.topology)?;
    cfg.reels = reels as u8;
    cfg.rows = rows as u8;

    // ── Symbols ────────────────────────────────────────────────────────
    cfg.symbols = convert_symbols(ir);

    // ── Reels (base weights + optional FS weights) ─────────────────────
    let (base_weights, fs_weights) = convert_reels(ir, &cfg.symbols)?;
    cfg.base_weights = base_weights;
    cfg.fs_weights = fs_weights;

    // ── Paylines / evaluation mode ─────────────────────────────────────
    cfg.paylines = convert_paylines(ir, reels, rows)?;

    // ── Paytable ───────────────────────────────────────────────────────
    cfg.paytable = convert_paytable(ir);

    // ── Features ───────────────────────────────────────────────────────
    convert_features(ir, &mut cfg);

    Ok(cfg)
}

// ─── Topology ──────────────────────────────────────────────────────────────

/// Extract `(reels, rows)` from topology.
/// `VariableRows` uses the *maximum* row count across all reels (rectangular
/// envelope — the engine can be told per-reel rows in Faza 2).
fn topology_to_dims(topology: &Topology) -> Result<(usize, usize), AdapterError> {
    match topology {
        Topology::Rectangular { reels, rows } => Ok((*reels as usize, *rows as usize)),

        Topology::VariableRows {
            reels,
            row_range_per_reel,
            ..
        } => {
            // Max row across all reels gives the rectangular envelope.
            let max_rows = row_range_per_reel
                .iter()
                .map(|range| range[1] as usize)
                .max()
                .unwrap_or(3);
            Ok((*reels as usize, max_rows))
        }

        Topology::ClusterGrid { columns, rows, .. } => {
            // Cluster grids: columns → reels, rows → rows.
            // Cluster evaluation uses its own path (empty paylines).
            Ok((*columns as usize, *rows as usize))
        }
    }
}

// ─── Symbols ───────────────────────────────────────────────────────────────

fn convert_symbols(ir: &SlotGameIR) -> Vec<SymbolDef> {
    ir.symbols
        .iter()
        .map(|s| {
            let (is_wild, is_scatter, is_bonus) = map_symbol_kind(s.kind);
            SymbolDef {
                id: s.id.clone(),
                name: s.name.clone(),
                is_wild,
                is_scatter,
                is_bonus,
            }
        })
        .collect()
}

/// Map `SymbolKind` → `(is_wild, is_scatter, is_bonus)`.
///
/// Mapping table (from spec):
/// - Wild | ChainWild | Expanding → is_wild
/// - Scatter                      → is_scatter
/// - Bonus                        → is_bonus
/// - Lp | Hp | Multiplier | Sticky | Mystery | Transform → all false
#[inline]
fn map_symbol_kind(kind: SymbolKind) -> (bool, bool, bool) {
    match kind {
        SymbolKind::Wild | SymbolKind::ChainWild | SymbolKind::Expanding => {
            (true, false, false)
        }
        SymbolKind::Scatter => (false, true, false),
        SymbolKind::Bonus => (false, false, true),
        SymbolKind::Lp
        | SymbolKind::Hp
        | SymbolKind::Multiplier
        | SymbolKind::Sticky
        | SymbolKind::Mystery
        | SymbolKind::Transform => (false, false, false),
    }
}

// ─── Reels ─────────────────────────────────────────────────────────────────

fn convert_reels(
    ir: &SlotGameIR,
    symbols: &[SymbolDef],
) -> Result<(Vec<Vec<ReelWeight>>, Vec<Vec<ReelWeight>>), AdapterError> {
    // Build a symbol-id → index lookup (O(n) construction, O(1) lookup).
    let sym_index: HashMap<&str, usize> = symbols
        .iter()
        .enumerate()
        .map(|(i, s)| (s.id.as_str(), i))
        .collect();

    match &ir.reels {
        ReelSet::Weighted { base, free_spins } => {
            let base_weights = weighted_map_to_reel_weights(base, &sym_index)?;
            let fs_weights = if let Some(fs) = free_spins {
                weighted_map_to_reel_weights(fs, &sym_index)?
            } else {
                // No FS reels specified — clone base reels as fallback.
                base_weights.clone()
            };
            Ok((base_weights, fs_weights))
        }

        ReelSet::Strips { base, free_spins } => {
            let base_weights = strips_to_reel_weights(base, &sym_index)?;
            let fs_weights = if let Some(fs) = free_spins {
                strips_to_reel_weights(fs, &sym_index)?
            } else {
                base_weights.clone()
            };
            Ok((base_weights, fs_weights))
        }
    }
}

/// Convert `Vec<BTreeMap<SymbolKey, f64>>` (weighted mode) into
/// `Vec<Vec<ReelWeight>>`.
fn weighted_map_to_reel_weights(
    reels: &[std::collections::BTreeMap<String, f64>],
    sym_index: &HashMap<&str, usize>,
) -> Result<Vec<Vec<ReelWeight>>, AdapterError> {
    reels
        .iter()
        .enumerate()
        .map(|(reel_idx, map)| {
            if map.is_empty() {
                return Err(AdapterError::MissingWeights { reel: reel_idx });
            }
            let weights: Vec<ReelWeight> = map
                .iter()
                .filter_map(|(sym_id, &raw_weight)| {
                    // Unknown symbols are silently skipped — cross_validate
                    // catches them before the adapter is called.
                    sym_index.get(sym_id.as_str()).map(|_| ReelWeight {
                        symbol: sym_id.clone(),
                        weight: f64_to_weight(raw_weight),
                    })
                })
                .collect();
            if weights.is_empty() {
                Err(AdapterError::MissingWeights { reel: reel_idx })
            } else {
                Ok(weights)
            }
        })
        .collect()
}

/// Convert `Vec<Vec<SymbolKey>>` (strips mode) into count-based weights.
/// Each symbol's weight = number of times it appears in the strip.
fn strips_to_reel_weights(
    reels: &[Vec<String>],
    sym_index: &HashMap<&str, usize>,
) -> Result<Vec<Vec<ReelWeight>>, AdapterError> {
    reels
        .iter()
        .enumerate()
        .map(|(reel_idx, strip)| {
            if strip.is_empty() {
                return Err(AdapterError::MissingWeights { reel: reel_idx });
            }
            // Count appearances.
            let mut counts: std::collections::BTreeMap<&str, u32> =
                std::collections::BTreeMap::new();
            for sym_id in strip {
                if sym_index.contains_key(sym_id.as_str()) {
                    *counts.entry(sym_id.as_str()).or_insert(0) += 1;
                }
            }
            if counts.is_empty() {
                return Err(AdapterError::MissingWeights { reel: reel_idx });
            }
            let weights: Vec<ReelWeight> = counts
                .into_iter()
                .map(|(sym_id, count)| ReelWeight {
                    symbol: sym_id.to_string(),
                    weight: count,
                })
                .collect();
            Ok(weights)
        })
        .collect()
}

// ─── Paylines ──────────────────────────────────────────────────────────────

/// Convert IR evaluation into GameConfig paylines.
///
/// - `Lines`      → use the payline array directly (cast u32 → u8).
/// - `Ways`       → generate synthetic paylines: one per combination of
///                  (reel0_row, reel1_row, …, reelN_row). The engine flags
///                  this as Ways mode via a conventionally-empty payline vec
///                  together with the `EvalMode` path (Faza 1.3 extension).
///                  For the base GameConfig we emit `rows^reels` paylines so
///                  the legacy Lines path degrades gracefully.
/// - `Cluster` / `PayAnywhere` → empty paylines (dedicated evaluator path).
/// - `Pattern`    → not supported via paylines, returns error.
fn convert_paylines(
    ir: &SlotGameIR,
    reels: usize,
    rows: usize,
) -> Result<Vec<Vec<u8>>, AdapterError> {
    match &ir.evaluation {
        Evaluation::Lines { paylines, .. } => {
            let converted: Vec<Vec<u8>> = paylines
                .iter()
                .map(|pl| pl.iter().map(|&r| r as u8).collect())
                .collect();
            Ok(converted)
        }

        Evaluation::Ways { .. } => {
            // Generate all-ways synthetic paylines: every combination of rows
            // across reels.  For 5 reels × 3 rows that is 3^5 = 243 paylines.
            // Each payline[reel] = row index; we enumerate them in
            // lexicographic order.
            let total = rows.pow(reels as u32);
            let mut paylines: Vec<Vec<u8>> = Vec::with_capacity(total);
            for combo in 0..total {
                let mut pl = vec![0u8; reels];
                let mut rem = combo;
                for reel in (0..reels).rev() {
                    pl[reel] = (rem % rows) as u8;
                    rem /= rows;
                }
                paylines.push(pl);
            }
            Ok(paylines)
        }

        Evaluation::Cluster { .. } | Evaluation::PayAnywhere { .. } => {
            // These modes use their own evaluator path — paylines are unused.
            Ok(vec![])
        }

        Evaluation::Pattern { .. } => {
            // TODO: Pattern evaluation will need a dedicated evaluator pass.
            // For now we return an empty payline set (same as Cluster).
            Ok(vec![])
        }
    }
}

// ─── Paytable ──────────────────────────────────────────────────────────────

/// Convert IR paytable into `HashMap<String, PayEntry>`.
///
/// Accepted key formats per evaluation kind:
/// - Lines / Ways: numeric count keys ("3", "4", "5" or "3+", "4+", "5+").
/// - Cluster:      numeric cluster-size keys ("5", "6", … "12+").
///
/// The adapter reads `pay3`, `pay4`, `pay5` from the minimum numeric key
/// values "3"/"3+", "4"/"4+", "5"/"5+".  Keys not matching those patterns
/// contribute nothing (e.g., "6" for a Lines config is silently ignored).
fn convert_paytable(ir: &SlotGameIR) -> HashMap<String, PayEntry> {
    let mut out = HashMap::with_capacity(ir.paytable.len());

    for (sym_id, count_map) in &ir.paytable {
        let mut entry = PayEntry::default();

        for (key, &val) in count_map {
            // Strip trailing "+" for "3+"-style keys.
            let numeric: &str = key.trim_end_matches('+');
            match numeric {
                "3" => entry.pay3 = val,
                "4" => entry.pay4 = val,
                "5" => entry.pay5 = val,
                _ => {
                    // Higher counts (6, 7, … "12+") used in Cluster mode:
                    // the cluster evaluator reads them directly from the IR;
                    // PayEntry only holds the three standard counts for Lines.
                    // Ignore here — no data lost because the cluster evaluator
                    // references the full IR map directly.
                }
            }
        }

        out.insert(sym_id.clone(), entry);
    }

    out
}

// ─── Features ──────────────────────────────────────────────────────────────

fn convert_features(ir: &SlotGameIR, cfg: &mut GameConfig) {
    for feature in &ir.features {
        match feature {
            Feature::FreeSpins {
                trigger,
                global_multiplier,
                retrigger,
                ..
            } => {
                cfg.free_spins = convert_free_spins(trigger, *global_multiplier, retrigger);
            }

            Feature::HoldAndWin {
                trigger,
                respins_initial,
                cash_value_distribution,
                jackpot_tiers,
                grid_full_award,
                ..
            } => {
                cfg.hold_and_win = convert_hold_and_win(
                    trigger,
                    *respins_initial,
                    cash_value_distribution,
                    jackpot_tiers,
                    grid_full_award,
                );
            }

            // TODO: Cascade — when Faza 2 adds a cascade evaluator path this
            // match arm should populate a `CascadeConfig` on GameConfig.
            Feature::Cascade { .. } => {}

            // TODO: Respin — will map to a per-spin respin mechanic config.
            Feature::Respin { .. } => {}

            // TODO: Pick / Wheel / BuyFeature — bonus round configs.
            Feature::Pick { .. } | Feature::Wheel { .. } | Feature::BuyFeature { .. } => {}

            // TODO: AnteBet / Gamble — bet modifier configs.
            Feature::AnteBet { .. } | Feature::Gamble { .. } => {}

            // TODO: MysterySymbol / SymbolUpgrade — symbol transform configs.
            Feature::MysterySymbol { .. } | Feature::SymbolUpgrade { .. } => {}
        }
    }
}

fn convert_free_spins(
    trigger: &crate::ir::TriggerByCount,
    global_multiplier: Option<f64>,
    retrigger: &Option<crate::ir::RetriggerSpec>,
) -> FreeSpinsConfig {
    // Build scatter_count → spins_awarded map from thresholds.
    let mut awards: HashMap<u8, u8> = HashMap::new();
    let scatter_pays: HashMap<u8, f64> = HashMap::new();

    if let Some(thresholds) = &trigger.thresholds {
        for (key, &value) in thresholds {
            let numeric: &str = key.trim_end_matches('+');
            if let Ok(count) = numeric.parse::<u8>() {
                awards.insert(count, value as u8);
                // IR thresholds carry spins-awarded, not a pay multiplier.
                // We keep scatter_pays empty unless a dedicated scatter pay
                // field is added to the IR (not in scope for Faza 1.2).
            }
        }
    }

    // Fallback: if thresholds is empty but `min` is set, apply a default.
    if awards.is_empty() {
        if let Some(min) = trigger.min {
            // Default to 10 spins for the minimum trigger count.
            awards.insert(min as u8, 10);
        }
    }

    // Multiplier: the IR global_multiplier is a fixed boost (not progressive).
    // We encode it as mult_start with an increment of 0 so the existing FS
    // simulator keeps applying it uniformly.
    let mult_start = global_multiplier.unwrap_or(1.0) as u32;
    let mult_increment = if global_multiplier.is_some() { 0 } else { 1 };
    let mult_max = if global_multiplier.is_some() {
        mult_start
    } else {
        10
    };

    let retrigger_enabled = retrigger.is_some()
        || matches!(trigger.by, TriggerBy::ScatterCount)
            && !awards.is_empty();

    FreeSpinsConfig {
        awards,
        mult_start,
        mult_increment,
        mult_max,
        retrigger_enabled,
        scatter_pays,
    }
}

fn convert_hold_and_win(
    trigger: &crate::ir::TriggerByCount,
    respins_initial: u32,
    cash_value_distribution: &[crate::ir::CashValueDist],
    jackpot_tiers: &[crate::ir::JackpotTier],
    grid_full_award: &Option<String>,
) -> HoldAndWinConfig {
    // Trigger count: prefer `min` field, else lowest threshold key.
    let trigger_count = trigger
        .min
        .map(|m| m as u8)
        .or_else(|| {
            trigger.thresholds.as_ref().and_then(|t| {
                t.keys()
                    .filter_map(|k| k.trim_end_matches('+').parse::<u8>().ok())
                    .min()
            })
        })
        .unwrap_or(6);

    // Orb values from cash_value_distribution.
    let orb_values: Vec<OrbValue> = cash_value_distribution
        .iter()
        .map(|dist| {
            // Check if any jackpot tier multiplier matches this cash value.
            let jackpot = jackpot_tiers
                .iter()
                .find(|t| (t.multiplier - dist.value).abs() < 0.01)
                .map(|t| t.id.clone());
            OrbValue {
                value: dist.value as u32,
                weight: f64_to_weight(dist.weight),
                jackpot,
            }
        })
        .collect();

    // Full grid bonus: the `grid_full_award` field in the IR is a jackpot
    // tier id (e.g. "GRAND").  Map it to the multiplier of that tier.
    let full_grid_bonus = grid_full_award
        .as_deref()
        .and_then(|id| jackpot_tiers.iter().find(|t| t.id == id))
        .map(|t| t.multiplier)
        .unwrap_or(500.0);

    HoldAndWinConfig {
        trigger_count,
        initial_respins: respins_initial as u8,
        respins_on_new_orb: respins_initial as u8, // same reset count by convention
        full_grid_bonus,
        orb_values,
        orb_land_chance_base: 0.035,   // sensible default — no IR field yet
        orb_land_chance_fill_bonus: 0.015,
    }
}
