//! Game Configuration Module
//!
//! Loads slot game configuration from JSON files.
//! Supports any slot theme with customizable symbols, paytable, and reels.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

/// Symbol definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub is_wild: bool,
    #[serde(default)]
    pub is_scatter: bool,
    #[serde(default)]
    pub is_bonus: bool,
}

/// Paytable entry - pays for 3, 4, 5 of a kind
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PayEntry {
    #[serde(default)]
    pub pay3: f64,
    #[serde(default)]
    pub pay4: f64,
    #[serde(default)]
    pub pay5: f64,
}

/// Orb value for Hold & Win
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbValue {
    pub value: u32,
    pub weight: u32,
    #[serde(default)]
    pub jackpot: Option<String>,
}

/// Lightning multiplier
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightningMult {
    pub value: u32,
    pub weight: u32,
}

/// Free Spins configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreeSpinsConfig {
    pub awards: HashMap<u8, u8>, // scatter_count -> spins_awarded
    pub mult_start: u32,
    pub mult_increment: u32,
    pub mult_max: u32,
    pub retrigger_enabled: bool,
    pub scatter_pays: HashMap<u8, f64>, // scatter_count -> pay multiplier
}

/// Hold & Win configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoldAndWinConfig {
    pub trigger_count: u8,
    pub initial_respins: u8,
    pub respins_on_new_orb: u8,
    pub full_grid_bonus: f64,
    pub orb_values: Vec<OrbValue>,
    pub orb_land_chance_base: f64,
    pub orb_land_chance_fill_bonus: f64,
}

/// Lightning feature configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightningConfig {
    pub trigger_chance: f64,
    pub trigger_chance_fs: f64,
    pub multipliers: Vec<LightningMult>,
}

// ─── W152 P0-3 — IR feature unstub ─────────────────────────────────────────
//
// Three new config structs that the IR adapter now extracts from
// `Feature::Cascade`, `Feature::Respin`, and `Feature::MysterySymbol`
// instead of dropping them on the floor. They mirror the TS-side
// `TSCascadeConfig` / `TSRespinConfig` / `TSMysteryConfig` exactly
// (snake_case → camelCase rename happens in the TS adapter).
//
// Downstream consumers (analytical solver, MC simulator, PAR generator)
// can pattern-match on `Option::is_some` to decide whether the feature
// is active for a given game. The structs themselves carry data only —
// no engine logic.

/// Cascade (drop / refill) feature configuration.
///
/// `replacement` controls how the grid refills after a winning cluster
/// is cleared:
/// - `Drop`         — existing symbols fall, top is refilled from reel strip.
/// - `RefillRandom` — every cleared cell is redrawn from the reel weights.
/// - `FixedStrip`   — the cleared cells consume the next symbols on a
///                    persistent strip ("avalanche" semantics).
///
/// `max_chain` caps the number of consecutive cascade steps per spin to
/// keep variance budget finite (KIMI 07: max-win cap interaction).
///
/// `multiplier_progression` is the per-chain-step multiplier ladder.
/// For example `[1, 2, 3, 5]` means step 0 = ×1, step 1 = ×2, etc.
/// `None` ⇒ flat ×1 across all chain steps.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CascadeConfig {
    pub replacement: CascadeReplacement,
    pub max_chain: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiplier_progression: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CascadeReplacement {
    Drop,
    RefillRandom,
    FixedStrip,
}

/// Respin feature configuration — paid extra spins on existing grid.
///
/// `cost_x` is the multiplier of the base bet charged per respin.
/// `max_uses_per_spin` caps consecutive respins from a single base spin
/// (industry-typical 1–3 to bound variance).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RespinConfig {
    pub cost_x: f64,
    pub max_uses_per_spin: u32,
}

/// Mystery symbol feature configuration.
///
/// `symbol_id` is the placeholder symbol that, after landing, reveals
/// as one of the symbols in `reveal_distribution` weighted by the f64
/// value. The weights are normalised by the consumer; we keep raw f64
/// to preserve the IR shape and allow downstream tooling to inspect
/// the distribution shape (KIMI 07 xWays mystery, NetEnt cluster reveal).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MysteryConfig {
    pub symbol_id: String,
    /// BTreeMap so JSON serialisation is byte-stable for parity tests.
    pub reveal_distribution: BTreeMap<String, f64>,
}

/// Reel weight entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReelWeight {
    pub symbol: String,
    pub weight: u32,
}

/// Complete game configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameConfig {
    pub name: String,
    pub version: String,
    pub target_rtp: f64,

    // Grid layout
    pub reels: u8,
    pub rows: u8,
    pub paylines: Vec<Vec<u8>>,

    // Symbols
    pub symbols: Vec<SymbolDef>,
    pub paytable: HashMap<String, PayEntry>,

    // Reel strips (base game and free spins)
    pub base_weights: Vec<Vec<ReelWeight>>,
    pub fs_weights: Vec<Vec<ReelWeight>>,

    // Features
    pub free_spins: FreeSpinsConfig,
    pub hold_and_win: HoldAndWinConfig,
    pub lightning: LightningConfig,

    // W152 P0-3 — IR feature unstub. All `Option` so games that don't
    // declare the feature in the IR carry `None` and downstream consumers
    // can branch on `is_some()` without touching default values.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cascade: Option<CascadeConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub respin: Option<RespinConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mystery: Option<MysteryConfig>,

    // Limits
    pub max_win_cap: f64,
    pub feature_loop_cap: u32,
}

impl GameConfig {
    /// Load configuration from JSON file
    pub fn from_file(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let config: GameConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// Get symbol index by ID
    pub fn symbol_index(&self, id: &str) -> Option<usize> {
        self.symbols.iter().position(|s| s.id == id)
    }

    /// Get wild symbol ID
    pub fn wild_id(&self) -> Option<&str> {
        self.symbols
            .iter()
            .find(|s| s.is_wild)
            .map(|s| s.id.as_str())
    }

    /// Get scatter symbol ID
    pub fn scatter_id(&self) -> Option<&str> {
        self.symbols
            .iter()
            .find(|s| s.is_scatter)
            .map(|s| s.id.as_str())
    }

    /// Get bonus symbol ID
    pub fn bonus_id(&self) -> Option<&str> {
        self.symbols
            .iter()
            .find(|s| s.is_bonus)
            .map(|s| s.id.as_str())
    }

    /// Get total weight for a reel
    pub fn reel_total_weight(&self, reel: usize, is_fs: bool) -> u32 {
        let weights = if is_fs {
            &self.fs_weights
        } else {
            &self.base_weights
        };
        weights
            .get(reel)
            .map(|w| w.iter().map(|e| e.weight).sum())
            .unwrap_or(0)
    }
}

/// Default configuration for testing
impl Default for GameConfig {
    fn default() -> Self {
        GameConfig {
            name: "Default Slot".to_string(),
            version: "1.0.0".to_string(),
            target_rtp: 96.0,
            reels: 5,
            rows: 3,
            paylines: vec![
                vec![1, 1, 1, 1, 1], // Middle row
            ],
            symbols: vec![
                SymbolDef {
                    id: "W".to_string(),
                    name: "Wild".to_string(),
                    is_wild: true,
                    is_scatter: false,
                    is_bonus: false,
                },
                SymbolDef {
                    id: "H1".to_string(),
                    name: "High 1".to_string(),
                    is_wild: false,
                    is_scatter: false,
                    is_bonus: false,
                },
                SymbolDef {
                    id: "L1".to_string(),
                    name: "Low 1".to_string(),
                    is_wild: false,
                    is_scatter: false,
                    is_bonus: false,
                },
                SymbolDef {
                    id: "S".to_string(),
                    name: "Scatter".to_string(),
                    is_wild: false,
                    is_scatter: true,
                    is_bonus: false,
                },
                SymbolDef {
                    id: "B".to_string(),
                    name: "Bonus".to_string(),
                    is_wild: false,
                    is_scatter: false,
                    is_bonus: true,
                },
            ],
            paytable: HashMap::new(),
            base_weights: vec![],
            fs_weights: vec![],
            free_spins: FreeSpinsConfig {
                awards: HashMap::from([(3, 10), (4, 12), (5, 15)]),
                mult_start: 1,
                mult_increment: 1,
                mult_max: 10,
                retrigger_enabled: true,
                scatter_pays: HashMap::from([(3, 2.0), (4, 5.0), (5, 20.0)]),
            },
            hold_and_win: HoldAndWinConfig {
                trigger_count: 6,
                initial_respins: 3,
                respins_on_new_orb: 3,
                full_grid_bonus: 500.0,
                orb_values: vec![
                    OrbValue {
                        value: 1,
                        weight: 600,
                        jackpot: None,
                    },
                    OrbValue {
                        value: 2,
                        weight: 250,
                        jackpot: None,
                    },
                    OrbValue {
                        value: 5,
                        weight: 100,
                        jackpot: None,
                    },
                ],
                orb_land_chance_base: 0.035,
                orb_land_chance_fill_bonus: 0.015,
            },
            lightning: LightningConfig {
                trigger_chance: 0.15,
                trigger_chance_fs: 0.0,
                multipliers: vec![
                    LightningMult {
                        value: 2,
                        weight: 70,
                    },
                    LightningMult {
                        value: 3,
                        weight: 18,
                    },
                    LightningMult {
                        value: 5,
                        weight: 10,
                    },
                    LightningMult {
                        value: 10,
                        weight: 2,
                    },
                ],
            },
            // W152 P0-3 — IR features default to None on the testing
            // default config; games that need them populate via the
            // IR adapter.
            cascade: None,
            respin: None,
            mystery: None,
            max_win_cap: 5000.0,
            feature_loop_cap: 100,
        }
    }
}
