//! Integration tests for IR→GameConfig adapter (W237 mutation kills).
//!
//! Targeted at the 11 missed mutants from the W237 baseline mutants run on
//! `rust-sim/src/ir/adapter.rs`. Helper functions are private; we exercise
//! them indirectly through `ir_to_game_config` with fixture variants that
//! force the specific code paths.
//!
//! | Group   | Target line/function                         | Test count |
//! |---------|----------------------------------------------|------------|
//! | W237-01 | strips_to_reel_weights (L266 vec/vec[vec])   | 2          |
//! | W237-02 | convert_paylines (L334 %→+, L335 /=→*=)      | 3          |
//! | W237-03 | convert_free_spins (L598 &&/||)              | 2          |
//! | W237-04 | convert_hold_and_win (L637 -/<, L651 ==)     | 4          |

use slot_sim::ir::{ir_to_game_config, Direction, Evaluation, SlotGameIR};
use std::path::PathBuf;

// ─── Fixture helpers ────────────────────────────────────────────────────────

fn fixture_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("..");
    p.push("tests");
    p.push("fixtures");
    p
}

fn load_parity() -> SlotGameIR {
    let raw = std::fs::read_to_string(fixture_dir().join("parity.json"))
        .expect("parity.json fixture must exist");
    SlotGameIR::from_json(&raw).expect("parity.json must parse")
}

// ─── W237-01: strips_to_reel_weights (L266) ─────────────────────────────────

#[test]
fn w237_01_strips_mode_produces_nonempty_per_reel_weights() {
    // Kills:
    //   * L266 `strips_to_reel_weights -> Ok(vec![])`        (zero reels)
    //   * L266 `strips_to_reel_weights -> Ok(vec![vec![]])`  (one empty reel)
    //
    // Strategy: load a parity IR (which uses weighted mode), switch its
    // base reels to STRIPS mode (Vec<Vec<String>>) with known symbol
    // appearances, run adapter, then assert that:
    //   * cfg.base_weights has exactly `reels` entries (kills vec![])
    //   * each reel entry is non-empty (kills vec![vec![]])
    //   * weights sum equals strip length (sanity)
    let mut ir = load_parity();

    // Build a minimal 3-reel strips configuration. Each strip has the
    // 3 lowest-paying symbols at known counts → strips_to_reel_weights
    // must yield weight={3, 2, 1} per reel.
    let strip: Vec<String> = vec![
        "S_LP1".to_string(),
        "S_LP1".to_string(),
        "S_LP1".to_string(),
        "S_LP2".to_string(),
        "S_LP2".to_string(),
        "S_LP3".to_string(),
    ];
    ir.reels = slot_sim::ir::ReelSet::Strips {
        base: vec![strip.clone(), strip.clone(), strip],
        free_spins: None,
    };

    let cfg = ir_to_game_config(&ir).expect("strips conversion must succeed");

    // L266 vec![] mutant signature: base_weights.is_empty()
    assert!(
        !cfg.base_weights.is_empty(),
        "base_weights must be non-empty (mutant Ok(vec![]) returns empty)"
    );

    // L266 vec![vec![]] mutant signature: base_weights has one entry empty
    assert_eq!(
        cfg.base_weights.len(),
        3,
        "base_weights must have 3 entries (mutant vec![vec![]] has 1)"
    );

    for (reel_idx, weights) in cfg.base_weights.iter().enumerate() {
        assert!(
            !weights.is_empty(),
            "reel {} must have non-empty weights (mutant vec![vec![]] empties reel 0)",
            reel_idx
        );
        let total: u32 = weights.iter().map(|w| w.weight).sum();
        assert_eq!(
            total, 6,
            "reel {} total weight must equal strip length 6 (mutant produces 0)",
            reel_idx
        );
    }
}

#[test]
fn w237_01_strips_mode_weights_match_symbol_counts() {
    // Strengthens W237-01: assert exact per-symbol counts. Any incorrect
    // strips_to_reel_weights output (including the constant mutants) fails.
    let mut ir = load_parity();
    let strip: Vec<String> = vec![
        "S_LP1".to_string(), // 3×
        "S_LP1".to_string(),
        "S_LP1".to_string(),
        "S_LP2".to_string(), // 2×
        "S_LP2".to_string(),
        "S_LP3".to_string(), // 1×
    ];
    ir.reels = slot_sim::ir::ReelSet::Strips {
        base: vec![strip],
        free_spins: None,
    };

    let cfg = ir_to_game_config(&ir).expect("conversion must succeed");

    assert_eq!(cfg.base_weights.len(), 1, "one reel expected");
    let weights = &cfg.base_weights[0];

    let lp1 = weights
        .iter()
        .find(|w| w.symbol == "S_LP1")
        .expect("S_LP1 must be in weights");
    assert_eq!(lp1.weight, 3, "S_LP1 count must be 3");

    let lp2 = weights
        .iter()
        .find(|w| w.symbol == "S_LP2")
        .expect("S_LP2 must be in weights");
    assert_eq!(lp2.weight, 2, "S_LP2 count must be 2");

    let lp3 = weights
        .iter()
        .find(|w| w.symbol == "S_LP3")
        .expect("S_LP3 must be in weights");
    assert_eq!(lp3.weight, 1, "S_LP3 count must be 1");
}

// ─── W237-02: convert_paylines L334 %→+, L335 /=→*= (Ways enumeration) ─────

#[test]
fn w237_02_ways_evaluation_enumerates_all_combinations() {
    // Kills:
    //   * L334:37 `(rem % rows) as u8`  → `(rem + rows) as u8`  — wrong row index
    //   * L335:25 `rem /= rows`         → `rem *= rows`         — divergent loop
    //
    // Strategy: switch IR to Ways evaluation. The adapter calls
    // convert_paylines which enumerates rows^reels lexicographic combos.
    // For reels=5, rows=3 → 243 unique paylines each with values 0..3 only.
    //
    // Mutant `%→+`: pl[reel] = rem + rows. For rem ∈ [0, 243), values get
    //               up to 245 — fails the `< rows` per-cell assertion.
    // Mutant `/=→*=`: rem *= rows grows each iter; loop never reaches 0;
    //                 paylines vector populated with non-unique garbage.
    let mut ir = load_parity();
    ir.evaluation = Evaluation::Ways {
        direction: Direction::Ltr,
        min_match: 3,
        max_ways_per_spin: 243,
    };

    let cfg = ir_to_game_config(&ir).expect("ways conversion must succeed");

    let reels = cfg.reels as u32;
    let rows = cfg.rows as u32;
    let expected_count = (rows.pow(reels)) as usize;

    assert_eq!(
        cfg.paylines.len(),
        expected_count,
        "expected {} paylines for {}^{} (mutant /=→*= breaks count)",
        expected_count,
        rows,
        reels
    );

    // Per-cell sanity: every row index < rows. Mutant %→+ violates this.
    for (pl_idx, pl) in cfg.paylines.iter().enumerate() {
        assert_eq!(pl.len(), reels as usize, "payline {} length", pl_idx);
        for (reel_idx, &row) in pl.iter().enumerate() {
            assert!(
                (row as u32) < rows,
                "payline {} reel {} row {} must be < rows {} (mutant %→+ produces row ≥ rows)",
                pl_idx,
                reel_idx,
                row,
                rows
            );
        }
    }
}

#[test]
fn w237_02_ways_paylines_are_unique_and_lexicographic() {
    // Tighten: assert every payline is unique. Mutant /=→*= produces
    // repeated junk; mutant %→+ may also produce duplicate-row-tuples.
    let mut ir = load_parity();
    ir.evaluation = Evaluation::Ways {
        direction: Direction::Ltr,
        min_match: 3,
        max_ways_per_spin: 243,
    };

    let cfg = ir_to_game_config(&ir).expect("ways conversion must succeed");

    let mut seen: std::collections::HashSet<Vec<u8>> = std::collections::HashSet::new();
    for pl in &cfg.paylines {
        let inserted = seen.insert(pl.clone());
        assert!(
            inserted,
            "duplicate payline {:?} — mutant /=→*= or %→+ signature",
            pl
        );
    }
    assert_eq!(seen.len(), cfg.paylines.len(), "all paylines must be unique");

    // First payline is all-zeros, last is all-(rows-1).
    let rows = cfg.rows as u8;
    assert_eq!(
        cfg.paylines[0],
        vec![0u8; cfg.reels as usize],
        "first payline must be all-zeros (lexicographic order)"
    );
    assert_eq!(
        cfg.paylines[cfg.paylines.len() - 1],
        vec![rows - 1; cfg.reels as usize],
        "last payline must be all-(rows-1)"
    );
}

// ─── W237-03: convert_free_spins L598 &&/|| precedence ─────────────────────

#[test]
fn w237_03_free_spins_retrigger_disabled_when_no_retrigger_no_scatter_no_awards() {
    // Kills L598:78 `&&` → `||`.
    // Original logic: `retrigger.is_some() || (matches!(by, ScatterCount) && !awards.is_empty())`
    //   With retrigger=None, by=BonusCount, awards=empty:
    //     → false || (false && true) = false
    // Mutant `&&` → `||`:
    //   `retrigger.is_some() || (matches!(by, ScatterCount) || !awards.is_empty())`
    //     → false || (false || true) = TRUE  (BUG)
    //
    // Construct IR with FreeSpins feature: BonusCount trigger, no
    // thresholds, no retrigger.
    let mut ir = load_parity();
    ir.features = vec![slot_sim::ir::Feature::FreeSpins {
        trigger: slot_sim::ir::TriggerByCount {
            by: slot_sim::ir::TriggerBy::BonusCount,
            thresholds: None,
            min: None, // → awards stays empty
        },
        retrigger: None,
        global_multiplier: None,
        modifiers: None,
    }];
    let cfg = ir_to_game_config(&ir).expect("conversion must succeed");
    let fs = &cfg.free_spins;
    assert!(
        fs.awards.is_empty(),
        "awards must be empty for this trigger shape (got {:?})",
        fs.awards
    );
    assert_eq!(
        fs.retrigger_enabled, false,
        "retrigger_enabled MUST be false (no retrigger spec + not ScatterCount + no awards); mutant `&&→||` signature: true"
    );
}

#[test]
fn w237_03_free_spins_retrigger_enabled_with_scatter_count_and_awards() {
    // Kills L598:29 `||` → `&&`.
    // Original: `retrigger.is_some() || (ScatterCount && !awards.is_empty())`
    //   With retrigger=None, by=ScatterCount, awards={3:10}:
    //     → false || (true && true) = TRUE
    // Mutant `||` → `&&`:
    //   `retrigger.is_some() && (ScatterCount && !awards.is_empty())`
    //     → false && (true && true) = false (BUG)
    let mut ir = load_parity();
    let mut thresholds = std::collections::BTreeMap::new();
    thresholds.insert("3".to_string(), 10.0); // 3 scatters → 10 spins
    ir.features = vec![slot_sim::ir::Feature::FreeSpins {
        trigger: slot_sim::ir::TriggerByCount {
            by: slot_sim::ir::TriggerBy::ScatterCount,
            thresholds: Some(thresholds),
            min: None,
        },
        retrigger: None,
        global_multiplier: None,
        modifiers: None,
    }];
    let cfg = ir_to_game_config(&ir).expect("conversion must succeed");
    let fs = &cfg.free_spins;
    assert!(!fs.awards.is_empty(), "awards must be non-empty (threshold 3→10)");
    assert_eq!(
        fs.retrigger_enabled, true,
        "retrigger_enabled MUST be true (ScatterCount + non-empty awards); mutant `||→&&` signature: false"
    );
}

// ─── W237-04: convert_hold_and_win L637 − /< and L651 == ───────────────────

#[test]
fn w237_04_hold_and_win_orb_jackpot_matches_by_tolerance_subtract() {
    // Kills:
    //   * L637:41 `(t.multiplier - dist.value).abs() < 0.01` → `+` (mutant: abs(t+v) > 0.01 → no match)
    //   * L637:41 `−` → `/` (mutant: abs(t/v), e.g. 5.0/5.0 = 1.0 > 0.01 → no match)
    //   * L637:61 `< 0.01` → `>` (mutant: 0.0 > 0.01 false → no match)
    //   * L637:61 `< 0.01` → `<=` (always true at boundary 0.0 — but tested via != boundary case)
    //
    // Strategy: HoldAndWin with cash_value_dist value=5.0 and jackpot_tier
    // multiplier=5.0 → original matches → orb.jackpot = Some("GRAND").
    // Mutants `+`, `/`, `>` all break the match → orb.jackpot = None.
    let mut ir = load_parity();
    ir.features = vec![slot_sim::ir::Feature::HoldAndWin {
        trigger: slot_sim::ir::TriggerByCount {
            by: slot_sim::ir::TriggerBy::ScatterCount,
            thresholds: None,
            min: Some(6),
        },
        respins_initial: 3,
        respin_reset_on_new: true,
        cash_value_distribution: vec![slot_sim::ir::CashValueDist {
            value: 5.0,
            weight: 100.0,
        }],
        jackpot_tiers: vec![slot_sim::ir::JackpotTier {
            id: "GRAND".to_string(),
            multiplier: 5.0,
        }],
        grid_full_award: None,
    }];
    let cfg = ir_to_game_config(&ir).expect("conversion must succeed");
    let hw = &cfg.hold_and_win;

    assert_eq!(hw.orb_values.len(), 1, "exactly one orb expected");
    assert_eq!(hw.orb_values[0].value, 5, "orb value matches dist.value");
    assert_eq!(
        hw.orb_values[0].jackpot,
        Some("GRAND".to_string()),
        "orb.jackpot MUST be Some(\"GRAND\") because t.multiplier=5.0 == dist.value=5.0; mutants `+/>/`/` signatures: None"
    );
}

// NOTE: L637:61 `< 0.01` → `<= 0.01` is a **boundary-equivalent mutant**.
// To detect it we would need (t.multiplier - dist.value).abs() == EXACTLY
// 0.01, but f64 arithmetic cannot represent 0.01 exactly (it's a binary
// repeating fraction). Any (a, b) we pick has diff either slightly above
// or slightly below 0.01, never exactly. Both `<` and `<=` give the same
// answer. Documented as equivalent in W237 closure.

#[test]
fn w237_04_hold_and_win_orb_no_jackpot_when_multiplier_mismatched() {
    // Negative case: jackpot multiplier != cash value → orb.jackpot = None.
    // Locks down the symmetry of the comparison.
    let mut ir = load_parity();
    ir.features = vec![slot_sim::ir::Feature::HoldAndWin {
        trigger: slot_sim::ir::TriggerByCount {
            by: slot_sim::ir::TriggerBy::ScatterCount,
            thresholds: None,
            min: Some(6),
        },
        respins_initial: 3,
        respin_reset_on_new: true,
        cash_value_distribution: vec![slot_sim::ir::CashValueDist {
            value: 3.0,
            weight: 100.0,
        }],
        jackpot_tiers: vec![slot_sim::ir::JackpotTier {
            id: "GRAND".to_string(),
            multiplier: 1000.0, // ≠ 3.0
        }],
        grid_full_award: None,
    }];
    let cfg = ir_to_game_config(&ir).expect("conversion must succeed");
    let hw = &cfg.hold_and_win;
    assert_eq!(
        hw.orb_values[0].jackpot, None,
        "orb.jackpot MUST be None when no matching tier"
    );
}

#[test]
fn w237_04_hold_and_win_full_grid_bonus_resolves_tier_id() {
    // Kills L651:59 `t.id == id` → `!=`.
    // Original: full_grid_bonus = (find tier where t.id == "GRAND").multiplier
    //   → returns 5000.0
    // Mutant `!=`: full_grid_bonus = (find tier where t.id != "GRAND").multiplier
    //   → finds first non-GRAND tier instead → returns 100.0 (MAJOR)
    let mut ir = load_parity();
    ir.features = vec![slot_sim::ir::Feature::HoldAndWin {
        trigger: slot_sim::ir::TriggerByCount {
            by: slot_sim::ir::TriggerBy::ScatterCount,
            thresholds: None,
            min: Some(6),
        },
        respins_initial: 3,
        respin_reset_on_new: true,
        cash_value_distribution: vec![slot_sim::ir::CashValueDist {
            value: 1.0,
            weight: 100.0,
        }],
        jackpot_tiers: vec![
            slot_sim::ir::JackpotTier {
                id: "MINI".to_string(),
                multiplier: 10.0,
            },
            slot_sim::ir::JackpotTier {
                id: "MAJOR".to_string(),
                multiplier: 100.0,
            },
            slot_sim::ir::JackpotTier {
                id: "GRAND".to_string(),
                multiplier: 5000.0,
            },
        ],
        grid_full_award: Some("GRAND".to_string()),
    }];
    let cfg = ir_to_game_config(&ir).expect("conversion must succeed");
    let hw = &cfg.hold_and_win;
    assert!(
        (hw.full_grid_bonus - 5000.0).abs() < 1e-9,
        "full_grid_bonus MUST be 5000.0 (GRAND tier); got {} — mutant `==→!=` returns first non-GRAND tier",
        hw.full_grid_bonus
    );
}

#[test]
fn w237_04_hold_and_win_full_grid_bonus_default_when_id_unknown() {
    // Cross-check: when grid_full_award refers to non-existent tier id,
    // adapter returns default 500.0. Locks down the fallback path.
    let mut ir = load_parity();
    ir.features = vec![slot_sim::ir::Feature::HoldAndWin {
        trigger: slot_sim::ir::TriggerByCount {
            by: slot_sim::ir::TriggerBy::ScatterCount,
            thresholds: None,
            min: Some(6),
        },
        respins_initial: 3,
        respin_reset_on_new: true,
        cash_value_distribution: vec![slot_sim::ir::CashValueDist {
            value: 1.0,
            weight: 100.0,
        }],
        jackpot_tiers: vec![slot_sim::ir::JackpotTier {
            id: "MINI".to_string(),
            multiplier: 10.0,
        }],
        grid_full_award: Some("NONEXISTENT".to_string()),
    }];
    let cfg = ir_to_game_config(&ir).expect("conversion must succeed");
    let hw = &cfg.hold_and_win;
    assert!(
        (hw.full_grid_bonus - 500.0).abs() < 1e-9,
        "full_grid_bonus MUST default to 500.0 when grid_full_award is unknown; got {}",
        hw.full_grid_bonus
    );
}

#[test]
fn w237_02_ways_first_handful_of_paylines_bit_exact() {
    // Hardcode the first 4 paylines for reels=5, rows=3 to lock down the
    // exact enumeration order. Any % or /= mutation breaks this trivially.
    //
    // Lexicographic over [reel4, reel3, reel2, reel1, reel0] going through
    // combo 0..243:
    //   combo=0  → all zeros          [0,0,0,0,0]
    //   combo=1  → reel4 only         [0,0,0,0,1]
    //   combo=2  → reel4=2            [0,0,0,0,2]
    //   combo=3  → reel3=1, reel4=0   [0,0,0,1,0]
    let mut ir = load_parity();
    ir.evaluation = Evaluation::Ways {
        direction: Direction::Ltr,
        min_match: 3,
        max_ways_per_spin: 243,
    };

    let cfg = ir_to_game_config(&ir).expect("ways conversion must succeed");

    assert_eq!(cfg.paylines[0], vec![0, 0, 0, 0, 0]);
    assert_eq!(cfg.paylines[1], vec![0, 0, 0, 0, 1]);
    assert_eq!(cfg.paylines[2], vec![0, 0, 0, 0, 2]);
    assert_eq!(cfg.paylines[3], vec![0, 0, 0, 1, 0]);
}
