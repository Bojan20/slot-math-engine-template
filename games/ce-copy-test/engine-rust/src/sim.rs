// Monte-Carlo driver — runs N spins at a given bet multiplier and
// returns aggregated stats matched to the PAR sheet summary cells.

use crate::base_game::{evaluate_base_spin, CompiledPaytable};
use crate::cash_eruption::{run_cash_eruption, CeContext, CompiledCeAll};
use crate::free_spins::run_free_spins;
use crate::ir::Ir;
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;

#[derive(Debug, Clone, Default)]
pub struct SimStats {
    pub spins: u64,
    /// Total payout in **total-bet multiples** (so RTP = total / spins).
    pub total_payout_x: f64,
    /// Sum of base-game payout (line wins + pattern + Volcano scatter), in total-bet units.
    pub base_game_x: f64,
    /// Sum of Cash Eruption payout triggered from base spins, in total-bet units.
    pub ce_from_base_x: f64,
    /// Sum of FS line wins only, in total-bet units.
    pub fs_lines_x: f64,
    /// Sum of FS Big Volcano scatter pays only, in total-bet units.
    pub fs_bv_x: f64,
    /// Sum of Cash Eruption payout triggered inside FS, in total-bet units.
    pub ce_from_fs_x: f64,
    /// Hits = at least one paid line OR scatter OR pattern win.
    pub hits: u64,
    /// Wins = total payout > 0 (subset of hits).
    pub wins: u64,
    /// Free Spins triggers (≥3 Volcano on base spin).
    pub fs_triggers: u64,
    /// Cash Eruption triggers from base (≥6 Fireballs).
    pub ce_from_base_triggers: u64,
    /// Cash Eruption triggers from FS (≥6 Big Fireballs).
    pub ce_from_fs_triggers: u64,
    /// GRAND hits.
    pub grand_hits: u64,
    /// Max single-spin payout (in total-bet units).
    pub max_single_x: f64,

    // ── Volatility distribution (per PAR_100spins) ──
    /// Spins with payout ≥ 10× total bet.
    pub wins_ge_10x: u64,
    /// Spins with payout ≥ 20× total bet.
    pub wins_ge_20x: u64,
    /// Spins with payout ≥ 50× total bet.
    pub wins_ge_50x: u64,
    /// Spins with payout ≥ 100× total bet.
    pub wins_ge_100x: u64,
    /// Spins with payout ≥ 200× total bet.
    pub wins_ge_200x: u64,
    /// Spins with payout ≥ 500× total bet.
    pub wins_ge_500x: u64,
    /// Spins with payout ≥ 1000× total bet (Pattern Win baseline).
    pub wins_ge_1000x: u64,

    // ── Average Cash Eruption feature win tracking ──
    /// Sum of CE-from-base payout (in total-bet units) for averaging.
    pub ce_base_payout_sum_x: f64,
    /// Sum of CE-from-FS payout (in total-bet units).
    pub ce_fs_payout_sum_x: f64,
    /// Sum of Free Spins bonus total payout (in total-bet units).
    pub fs_bonus_payout_sum_x: f64,
}

impl SimStats {
    pub fn rtp(&self) -> f64 {
        if self.spins == 0 {
            0.0
        } else {
            self.total_payout_x / (self.spins as f64)
        }
    }
    pub fn hit_freq(&self) -> f64 {
        if self.spins == 0 {
            0.0
        } else {
            self.hits as f64 / self.spins as f64
        }
    }
    pub fn win_freq(&self) -> f64 {
        if self.spins == 0 {
            0.0
        } else {
            self.wins as f64 / self.spins as f64
        }
    }
}

pub struct Engine<'a> {
    pub ir: &'a Ir,
    pub bg_picker: ReelSetPicker,
    pub fg_picker: ReelSetPicker,
    pub base_pt: CompiledPaytable,
    pub fs_pt: CompiledPaytable,
    pub ce_all: CompiledCeAll,
}

impl<'a> Engine<'a> {
    pub fn new(ir: &'a Ir) -> Self {
        Engine {
            ir,
            bg_picker: ReelSetPicker::from_bg(ir),
            fg_picker: ReelSetPicker::from_fg(ir),
            base_pt: CompiledPaytable::from_ir_base(ir),
            fs_pt: CompiledPaytable::from_ir_fs(ir),
            ce_all: CompiledCeAll::from_ir(ir),
        }
    }

    /// Run `n_spins` at the given bet multiplier and return aggregated stats.
    pub fn run(&self, n_spins: u64, bet_multiplier: i64, seed: u64) -> SimStats {
        let mut rng = Prng::from_seed(seed);
        let mut s = SimStats::default();
        let ce = self.ce_all.by_bm.get(&bet_multiplier);
        // Total bet in coins: 20 paylines × bet_multiplier coins per line.
        // All raw coin payouts (CE feature, FS line/BV) divide by this to
        // express the per-spin RTP contribution in total-bet units.
        let total_bet_coins = 20.0 * (bet_multiplier as f64);
        for _ in 0..n_spins {
            // Base spin
            let rs = self.bg_picker.pick(&mut rng);
            let grid = Grid::spin(rs, &mut rng);
            let bw = evaluate_base_spin(&grid, self.ir, &self.base_pt);
            let mut spin_x = bw.payout_total_bet_x(bet_multiplier);
            s.base_game_x += spin_x;
            // After base + CE + FS attribution we'll re-check the spin
            // total; for now record the base-game hit/win flags. The
            // final hit/win at the spin level is established at the end.
            // Cash Eruption trigger from base?
            if bw.fireball_count >= 6 {
                s.ce_from_base_triggers += 1;
                if let Some(ce) = ce {
                    // Base: each cell = 1 sample = 1 grid coverage unit;
                    // initial samples from SMALL dist (per Excel C3961).
                    let r = run_cash_eruption(
                        ce,
                        bw.fireball_count,
                        bw.fireball_count,
                        false, // initial_use_big = false (Base uses Small)
                        CeContext::Base,
                        &mut rng,
                    );
                    let x = r.payout_coins / total_bet_coins;
                    s.ce_from_base_x += x;
                    s.ce_base_payout_sum_x += x;
                    spin_x += x;
                    if r.grand_hit {
                        s.grand_hits += 1;
                    }
                }
            }
            // Free Spins trigger
            if bw.free_spins_triggered {
                s.fs_triggers += 1;
                let fs = run_free_spins(
                    self.ir,
                    &self.fg_picker,
                    &self.fs_pt,
                    &self.ce_all,
                    bet_multiplier,
                    &mut rng,
                );
                let inner_fs_x = fs.payout_coins / total_bet_coins;
                s.fs_lines_x += fs.line_wins_coins / total_bet_coins;
                s.fs_bv_x += fs.big_volcano_coins / total_bet_coins;
                s.ce_from_fs_x += fs.ce_from_fs_coins / total_bet_coins;
                s.ce_fs_payout_sum_x += fs.ce_from_fs_coins / total_bet_coins;
                s.fs_bonus_payout_sum_x += inner_fs_x;
                s.ce_from_fs_triggers += fs.cash_eruption_event_count as u64;
                if fs.grand_hit {
                    s.grand_hits += 1;
                }
                spin_x += inner_fs_x;
            }
            if spin_x > s.max_single_x {
                s.max_single_x = spin_x;
            }
            s.total_payout_x += spin_x;
            // Spin-level hit/win:
            //   Hit = any positive payout
            //   Win = net win (payout > total bet)
            if spin_x > 0.0 {
                s.hits += 1;
            }
            if spin_x > 1.0 {
                s.wins += 1;
            }
            // Volatility distribution buckets (per PAR_100spins cell A36..D43)
            if spin_x >= 10.0   { s.wins_ge_10x += 1; }
            if spin_x >= 20.0   { s.wins_ge_20x += 1; }
            if spin_x >= 50.0   { s.wins_ge_50x += 1; }
            if spin_x >= 100.0  { s.wins_ge_100x += 1; }
            if spin_x >= 200.0  { s.wins_ge_200x += 1; }
            if spin_x >= 500.0  { s.wins_ge_500x += 1; }
            if spin_x >= 1000.0 { s.wins_ge_1000x += 1; }
            s.spins += 1;
        }
        s
    }
}
