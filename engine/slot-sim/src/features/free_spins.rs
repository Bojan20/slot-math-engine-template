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
use crate::ir::{Evaluation, Ir, Topology};
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;

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
}

/// W4.8 — config for triggering Cash Eruption inside FS spins.
#[derive(Debug, Clone, Copy)]
pub struct FsHoldAndWinCfg<'a> {
    pub trigger_symbol: &'a str,
    pub trigger_count_min: u32,
    pub trigger_prob: Option<f64>,
    pub avg_pay_per_trigger: Option<f64>,
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
        let w = evaluate_lines(&grid, ir, effective_pt);
        out.coins += w.line_coins;

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
                if let Some(avg_pay) = cfg.avg_pay_per_trigger {
                    if avg_pay > 0.0 {
                        let lines_n = lines_of(ir);
                        out.coins += avg_pay * (lines_n as f64);
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

        // Retrigger check on this FS spin
        let rc = *w.role_counts.get(params.trigger_symbol).unwrap_or(&0);
        if rc >= params.trigger_count_min && params.retrigger_spins > 0 {
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
