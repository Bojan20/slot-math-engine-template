//! W4.5 — Hold-and-Win runner (Cash Eruption style).
//!
//! Triggered by Cash symbol count ≥ `trigger_count_min` (default L&W CE:
//! ≥6 fireballs on grid) OR by a Bernoulli draw at `trigger_prob` if set.
//!
//! Two pay modes (both yield the same long-run RTP — variance differs):
//!   * `avg_pay_per_trigger` (W4.5 default) — pays a single deterministic
//!     value equal to the published expected payout per trigger. Mean
//!     RTP is exact; per-trigger volatility is degenerate.
//!   * full `pages` sampling (W4.6 future) — samples per-page set
//!     (low/med/high) → small/big coin distributions → respin chain,
//!     reproducing the published CE math exactly. Implemented when the
//!     adapter populates `pages` from `cash_eruption_pages` JSON.

use crate::evaluate::SpinWin;
use crate::features::FeatureOutcome;
use crate::ir::{Evaluation, Ir};
use crate::rng::Prng;

#[derive(Debug, Clone, Copy)]
pub struct HoldAndWinParams<'a> {
    pub trigger_symbol: &'a str,
    pub trigger_count_min: u32,
    pub trigger_prob: Option<f64>,
    pub avg_pay_per_trigger: Option<f64>,
}

pub fn run(
    params: HoldAndWinParams,
    ir: &Ir,
    base: &SpinWin,
    rng: &mut Prng,
) -> FeatureOutcome {
    let mut out = FeatureOutcome::default();

    let triggered = if let Some(p) = params.trigger_prob {
        if p <= 0.0 {
            false
        } else {
            rng.gen_f64() < p
        }
    } else {
        let count = *base
            .role_counts
            .get(params.trigger_symbol)
            .unwrap_or(&0);
        count >= params.trigger_count_min
    };
    if !triggered {
        return out;
    }

    // Determine pay value.
    let Some(avg_pay) = params.avg_pay_per_trigger else {
        // No avg_pay configured + no pages sampling implemented yet.
        // Emit an event so MC stats can see the trigger but contribute 0
        // coins (deferred to W4.6 full pages mapping).
        out.events.push("hold_and_win:no_pay_configured".into());
        return out;
    };
    if avg_pay <= 0.0 {
        return out;
    }
    let lines = lines_of(ir);
    // `avg_pay_per_trigger` is in total-bet-× units (mirrors PickBonus
    // pays_coins semantics). Multiply by `lines` so the engine's
    // `feat.coins / lines` divide-back gives back total-bet-×.
    out.coins += avg_pay * (lines as f64);
    out.events.push("hold_and_win:triggered".into());
    out
}

fn lines_of(ir: &Ir) -> u32 {
    match &ir.evaluation {
        Evaluation::Lines { lines, .. } => lines.len() as u32,
        _ => ir.bet_table.lines,
    }
}
