//! W4.3c — Free Spins runner.
//!
//! Triggered when the configured `trigger_symbol` (with `Scatter`/`Bonus`
//! role) appears at least `trigger_count_min` times anywhere on the base-
//! game grid. Awards `initial_spins` FS at the same total-bet level; each
//! FS spin re-uses the FS reel bank and evaluates line wins. A
//! Bonus×trigger_count_min reappearance inside FS adds `retrigger_spins`
//! (capped at `max_total_spins` if set).
//!
//! Return: `coins` in slot-sim's per-line accounting (the sim driver
//! divides by `lines` to convert to total-bet ×). `events` reports each
//! trigger / retrigger / total spins so SimStats can audit.

use crate::evaluate::{evaluate_lines, CompiledPaytable, SpinWin};
use crate::features::FeatureOutcome;
use crate::ir::{Evaluation, HoldAndWinPage, Ir, Topology};
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy)]
pub struct FreeSpinsParams<'a> {
    pub trigger_symbol: &'a str,
    pub trigger_count_min: u32,
    pub initial_spins: u32,
    pub retrigger_spins: u32,
    pub max_total_spins: Option<u32>,
    /// W4.7 — optional override; runner uses it instead of `pt`.
    pub fs_pt: Option<&'a CompiledPaytable>,
    /// W4.7 — when populated, the listed reels share one stop per spin
    /// (L&W CE FS reels 2/3/4 linked-block behavior).
    pub linked_reels: Option<&'a [u32]>,
    /// W4.8 — `Some` triggers HoldAndWin inside FS spins when the
    /// configured cash symbol appears ≥ the trigger count on the FS
    /// grid. Field carries `(trigger_symbol, trigger_count_min,
    /// trigger_prob, avg_pay_per_trigger)` to mirror the base-game
    /// HoldAndWin Feature variant. When `None`, FS spins never trigger
    /// the Cash Eruption feature.
    pub fs_hold_and_win: Option<FsHoldAndWinCfg<'a>>,
    /// W4.3e-scatter — immediate scatter pay on trigger spin
    /// (multiplier of TOTAL BET). IGT Fort Knox Wolf Run pays 2× total
    /// bet AND awards FS on a "Bonus×3 middle reels" trigger.
    pub scatter_pay_total_bet: f64,
    /// W4.9b — FS retrigger uses a separate symbol/count when the FS
    /// reel strip swaps to Big_X variants (L&W CE: Big Volcano retriggers
    /// instead of Volcano scatter). Falls back to `trigger_symbol` /
    /// `trigger_count_min` when `None`.
    pub retrigger_symbol: Option<&'a str>,
    pub retrigger_count_min: Option<u32>,
    /// W4.9c — Per-FS-spin wild expansion on configured reels (L&W CE
    /// rule "Wild transforms reel 5 into Wild only if a win would
    /// result"). Reel indices are 0-based; expansion happens AFTER the
    /// FS spin grid is generated but BEFORE evaluate_lines. Empty / None
    /// = no FS wild expansion.
    pub fs_wild_expand_reels: Option<&'a [u32]>,
}

/// W4.8 — config for triggering Cash Eruption inside FS spins.
#[derive(Debug, Clone, Copy)]
pub struct FsHoldAndWinCfg<'a> {
    pub trigger_symbol: &'a str,
    pub trigger_count_min: u32,
    pub trigger_prob: Option<f64>,
    pub avg_pay_per_trigger: Option<f64>,
    /// W4.16 — pages distribution for FS-CE sampling path. When `Some`,
    /// the FS runner uses the per-page Big Fireball + respin model
    /// instead of the flat `avg_pay_per_trigger` (which still serves as
    /// fallback when pages are empty).
    pub pages: Option<&'a BTreeMap<String, HoldAndWinPage>>,
    /// W4.16 — units contract for flat-path payouts. See
    /// `Feature::HoldAndWin::units` for semantics. Affects only the
    /// flat `avg_pay_per_trigger` fallback path inside FS; the pages
    /// path always pays in coin units (CE published Fireball values
    /// are already coin-denominated and the runner divides by total
    /// bet at the call site).
    pub units: Option<&'a str>,
}

/// Runs the FS sequence for one base-game spin if the trigger fires.
pub fn run(
    params: FreeSpinsParams,
    ir: &Ir,
    fs_picker: &ReelSetPicker,
    pt: &CompiledPaytable,
    base: &SpinWin,
    rng: &mut Prng,
    virtual_mode: bool,
) -> FeatureOutcome {
    let mut out = FeatureOutcome::default();

    let scatter_count = *base
        .role_counts
        .get(params.trigger_symbol)
        .unwrap_or(&0);
    if scatter_count < params.trigger_count_min {
        return out;
    }

    let rows = match &ir.topology {
        Topology::Rectangular { rows, .. } => *rows as usize,
        Topology::Megaways { rows_max, .. } => *rows_max as usize,
        Topology::ClusterGrid { height, .. } => *height as usize,
    };
    // Non-line evaluations don't path through this runner.
    if !matches!(&ir.evaluation, Evaluation::Lines { .. }) {
        return out;
    }
    let lines = lines_of(ir);

    let cap = params.max_total_spins.unwrap_or(u32::MAX);
    let mut remaining = params.initial_spins.min(cap);
    let mut total_executed: u32 = 0;
    out.events.push(format!("fs_trigger:{}", scatter_count));

    // W4.3e-scatter — immediate scatter pay on FS trigger (IGT Wolf Run
    // pays 2× total bet on "Bonus×3 middle reels" trigger in addition to
    // awarding free spins). `coins` is per-line; multiply by line count.
    if params.scatter_pay_total_bet > 0.0 {
        out.coins += params.scatter_pay_total_bet * (lines as f64);
        out.events.push(format!("fs_scatter_pay:{}", params.scatter_pay_total_bet));
    }

    while remaining > 0 {
        remaining -= 1;
        total_executed += 1;
        let rs = fs_picker.pick(rng);
        let grid = if virtual_mode {
            Grid::spin_virtual(rs, rows, rng)
        } else if let Some(linked) = params.linked_reels {
            // L&W CE FS pattern — middle reels share one stop per spin.
            Grid::spin_linked(rs, rows, linked, rng)
        } else {
            Grid::spin(rs, rows, rng)
        };
        // FS paytable override (W4.7): when available, the FS spins use
        // a different pay table than the base game (L&W CE pattern).
        let effective_pt = params.fs_pt.unwrap_or(pt);
        let w_base = evaluate_lines(&grid, ir, effective_pt);
        // W4.9c — FS wild expansion (L&W CE: Wild on reel 5 expands if
        // it creates a winning combo). Pay max(raw, expanded).
        let line_coins = if let Some(reels) = params.fs_wild_expand_reels {
            let mut needs_expand = false;
            let wild_id = ir
                .symbols
                .iter()
                .find(|s| s.role == crate::ir::SymbolRole::Wild)
                .map(|s| s.id.as_str());
            if let Some(wild) = wild_id {
                for &r in reels {
                    let ru = r as usize;
                    if ru < grid.reels() {
                        for row in 0..rows {
                            if grid.cell(ru, row) == wild {
                                needs_expand = true;
                                break;
                            }
                        }
                    }
                    if needs_expand { break }
                }
                if needs_expand {
                    let mut g_exp = grid.clone();
                    for &r in reels {
                        let ru = r as usize;
                        if ru < g_exp.reels() {
                            for row in 0..rows {
                                g_exp.cells[ru][row] = wild.to_string();
                            }
                        }
                    }
                    let w_exp = evaluate_lines(&g_exp, ir, effective_pt);
                    w_base.line_coins.max(w_exp.line_coins)
                } else {
                    w_base.line_coins
                }
            } else {
                w_base.line_coins
            }
        } else {
            w_base.line_coins
        };
        let w = w_base; // keep w for scatter / role_counts access
        out.coins += line_coins;

        // W4.8 — CE-from-FS: trigger HoldAndWin inside FS when fireball
        // count crosses threshold. Independent dispatch — uses the same
        // Bernoulli-or-cash-count contract as the base-game runner.
        if let Some(cfg) = params.fs_hold_and_win {
            let triggered = if let Some(p) = cfg.trigger_prob {
                if p > 0.0 { rng.gen_f64() < p } else { false }
            } else {
                let count = *w.role_counts.get(cfg.trigger_symbol).unwrap_or(&0);
                count >= cfg.trigger_count_min
            };
            if triggered {
                // W4.16 — precedence rules for FS-CE pay path:
                //   1. If the IR populated `fs_avg_pay_per_trigger`
                //      (flat path), USE IT. CE uses this because the
                //      page-driven Big Fireball block sampling needs a
                //      separate per-FS-spin landing probability that
                //      the IR doesn't yet expose; the flat path
                //      delivers the published `ce_from_fs` RTP
                //      deterministically.
                //   2. Else, if `pages` is populated, use the pages
                //      Big-block sampler (future-ready path).
                //   3. Else, no FS-CE pay.
                if let Some(avg_pay) = cfg.avg_pay_per_trigger {
                    if avg_pay > 0.0 {
                        // W4.16 — units contract: when `units == "coin"`,
                        // the payout is in raw coin units and the engine
                        // does NOT multiply by `lines` (FKWR contract).
                        // Default (`None` or `"total_bet_x"`) preserves
                        // pre-W4.16 behavior: × lines so the engine's
                        // post-divide-back yields total-bet-×.
                        let multiplier = match cfg.units {
                            Some("coin") => 1.0,
                            _ => lines_of(ir) as f64,
                        };
                        out.coins += avg_pay * multiplier;
                        out.events.push("hold_and_win:fs_triggered".into());
                    }
                } else if let Some(pages) = cfg.pages {
                    if let Some(page) = crate::features::hold_and_win::pick_page(pages) {
                        let init_samples = page.fs_initial_samples.unwrap_or(1);
                        let init_landed = page.fs_initial_landed.unwrap_or(9);
                        let coins_paid = crate::features::hold_and_win::run_pages_sample(
                            page,
                            init_samples,
                            init_landed,
                            true, // initial_use_big
                            true, // fs_context
                            rng,
                        );
                        out.coins += coins_paid;
                        out.events.push("hold_and_win:fs_triggered".into());
                    }
                }
            }
        }
        // `evaluate_lines` returns scatter as total-bet-× while
        // `line_coins` is per-line. Convert scatter to per-line by × lines
        // so the engine's `feat.coins / lines` divide-back yields the
        // proper total-bet-× contribution.
        out.coins += w.scatter_total_bet_x * (lines as f64);

        // Retrigger check on this FS spin (W4.9b — uses separate symbol/
        // count when the FS reel strip swaps to Big_X variants).
        let retrig_sym = params.retrigger_symbol.unwrap_or(params.trigger_symbol);
        let retrig_min = params.retrigger_count_min.unwrap_or(params.trigger_count_min);
        let rc = *w.role_counts.get(retrig_sym).unwrap_or(&0);
        if rc >= retrig_min && params.retrigger_spins > 0 {
            let cap_left = cap.saturating_sub(total_executed + remaining);
            let add = params.retrigger_spins.min(cap_left);
            if add > 0 {
                remaining += add;
                out.events.push(format!("fs_retrigger:{}", add));
            }
        }
    }

    out.events.push(format!("fs_total:{}", total_executed));
    out
}

fn lines_of(ir: &Ir) -> u32 {
    match &ir.evaluation {
        Evaluation::Lines { lines, .. } => lines.len() as u32,
        _ => ir.bet_table.lines,
    }
}
