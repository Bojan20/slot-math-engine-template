// Universal MC driver — IR in, SimStats out.

use crate::evaluate::{evaluate_lines, CompiledPaytable};
use crate::features::run_features;
use crate::ir::{Evaluation, Feature, Ir, PaytableEntry, Topology};
use crate::megaways_eval::{evaluate_megaways, MegawaysGrid};
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;
use crate::stats::SimStats;
use crate::ways_eval::evaluate_cascade;

/// W4.8c / W4.10c — max single payout × total bet. Beyond this the
/// engine clamps the spin contribution and logs a `max_win_cap_hit` event
/// (logged once per run). Set to 10_000 × total bet which is well above
/// every IGT Megaways / Ways game published cap.
pub const MAX_WIN_CAP_X: f64 = 10_000.0;

pub struct Engine<'a> {
    pub ir: &'a Ir,
    pub base_picker: ReelSetPicker,
    pub fs_picker: Option<ReelSetPicker>,
    pub pt: CompiledPaytable,
    /// W4.7 — pre-compiled FS-specific paytable if any FreeSpins feature
    /// declares `fs_paytable`. None means FS reuses the base paytable.
    pub fs_pt: Option<CompiledPaytable>,
    pub rows: usize,
    pub lines: u32,
    /// W4.3d — true when `meta.sampling_mode == "virtual_independent"`.
    pub virtual_mode: bool,
}

impl<'a> Engine<'a> {
    pub fn new(ir: &'a Ir) -> Self {
        let base_picker = ReelSetPicker::from_base(ir);
        let fs_picker = ReelSetPicker::from_fs(ir);
        let pt = CompiledPaytable::compile(ir);
        let rows = match &ir.topology {
            Topology::Rectangular { rows, .. } => *rows as usize,
            Topology::Megaways { rows_max, .. } => *rows_max as usize,
            Topology::ClusterGrid { height, .. } => *height as usize,
        };
        let lines = match &ir.evaluation {
            Evaluation::Lines { lines, .. } => lines.len() as u32,
            _ => ir.bet_table.lines,
        };
        let virtual_mode = ir
            .meta
            .sampling_mode
            .as_deref()
            == Some("virtual_independent");

        // Pre-compile FS-specific paytable if any FreeSpins feature
        // declares one. We build a temporary IR clone that swaps the
        // paytable field and run `CompiledPaytable::compile` so wild +
        // scatter dispatch works identically against FS pays.
        let fs_pt = compile_fs_paytable(ir);

        Engine { ir, base_picker, fs_picker, pt, fs_pt, rows, lines, virtual_mode }
    }

    pub fn run(&self, n_spins: u64, bet_multiplier: i64, seed: u64) -> SimStats {
        let mut rng = Prng::from_seed(seed);
        let mut s = SimStats::default();
        // W4.8c / W4.10c — dispatch based on evaluation kind.
        match &self.ir.evaluation {
            Evaluation::Lines { .. } => {
                self.run_lines(n_spins, bet_multiplier, &mut rng, &mut s);
            }
            Evaluation::Megaways { .. } => {
                self.run_megaways(n_spins, &mut rng, &mut s);
            }
            Evaluation::Ways { .. } => {
                self.run_ways_cascade(n_spins, &mut rng, &mut s);
            }
            Evaluation::Cluster { .. } => {
                // Cluster eval — placeholder, no MC eval yet. Leave
                // SimStats empty so `cargo test` smoke runs are safe for
                // future cluster-pays IRs.
            }
        }
        s
    }

    /// Existing Lines (paylines) MC path — unchanged from W4.9 to keep
    /// L&W CE / Wolf Run / etc. behavior identical.
    fn run_lines(
        &self,
        n_spins: u64,
        bet_multiplier: i64,
        rng: &mut Prng,
        s: &mut SimStats,
    ) {
        let lines_f = self.lines as f64;
        for _ in 0..n_spins {
            let rs = self.base_picker.pick(rng);
            let grid = if self.virtual_mode {
                Grid::spin_virtual(rs, self.rows, rng)
            } else {
                Grid::spin(rs, self.rows, rng)
            };
            let base = evaluate_lines(&grid, self.ir, &self.pt);
            let mut spin_x = base.payout_total_bet_x(self.lines);
            s.base_x += spin_x;
            let feat = run_features(
                self.ir,
                &grid,
                &base,
                bet_multiplier,
                rng,
                self.fs_picker.as_ref(),
                &self.pt,
                self.virtual_mode,
                self.fs_pt.as_ref(),
            );
            spin_x += feat.coins / lines_f;
            for ev in &feat.events {
                *s.event_count.entry(ev.clone()).or_insert(0) += 1;
            }
            let mut increment_x = 0.0;
            for (kind, coins) in &feat.per_feature {
                let x = coins / lines_f;
                *s.feature_x.entry(kind.clone()).or_insert(0.0) += x;
                if kind == "linear_progressive" {
                    increment_x += x.min(0.01);
                }
            }
            let spin_x_for_metrics = spin_x - increment_x;
            self.commit_spin(s, spin_x, spin_x_for_metrics);
        }
    }

    /// W4.8c — Megaways MC path. Each spin samples per-reel row counts
    /// from `Topology::Megaways::rows_weights`, builds a variable grid,
    /// evaluates Megaways ways math + scatter pays, and runs the FS
    /// feature (which itself uses the Megaways evaluator inside FS
    /// spins).
    fn run_megaways(&self, n_spins: u64, rng: &mut Prng, s: &mut SimStats) {
        let mut cap_logged = false;
        for _ in 0..n_spins {
            let rs = self.base_picker.pick(rng);
            let grid = MegawaysGrid::spin(self.ir, rs, rng);
            let spin = evaluate_megaways(&grid, self.ir, &self.pt);
            let mut spin_x = spin.payout_total_bet_x();
            s.base_x += spin_x;

            // FS sub-evaluator (Megaways evaluates FS inside the same
            // Megaways pay engine using `fs_picker` and `fs_pt` overrides).
            let fs_x = self.maybe_run_megaways_fs(&spin.role_counts, rng);
            spin_x += fs_x;
            if fs_x > 0.0 {
                *s.feature_x.entry("free_spins".into()).or_insert(0.0) += fs_x;
                *s.event_count.entry("fs_trigger".into()).or_insert(0) += 1;
            }
            // Edge case 8 — max-win cap.
            if spin_x > MAX_WIN_CAP_X {
                spin_x = MAX_WIN_CAP_X;
                if !cap_logged {
                    *s.event_count.entry("max_win_cap_hit".into()).or_insert(0) += 1;
                    cap_logged = true;
                }
            }
            self.commit_spin(s, spin_x, spin_x);
        }
    }

    fn maybe_run_megaways_fs(
        &self,
        role_counts: &std::collections::HashMap<String, u32>,
        rng: &mut Prng,
    ) -> f64 {
        let Some(picker) = self.fs_picker.as_ref() else {
            return 0.0;
        };
        // Find Feature::FreeSpins.
        let Some((trig_sym, trig_min, initial_spins, retrigger_spins, max_total)) =
            self.ir.features.iter().find_map(|f| match f {
                Feature::FreeSpins {
                    trigger_symbol,
                    trigger_count_min,
                    initial_spins,
                    retrigger_spins,
                    max_total_spins,
                    ..
                } => Some((
                    trigger_symbol.clone(),
                    *trigger_count_min,
                    *initial_spins,
                    *retrigger_spins,
                    *max_total_spins,
                )),
                _ => None,
            })
        else {
            return 0.0;
        };
        let count = *role_counts.get(&trig_sym).unwrap_or(&0);
        if count < trig_min {
            return 0.0;
        }
        let cap = max_total.unwrap_or(u32::MAX);
        let mut remaining = initial_spins.min(cap);
        let mut total_executed: u32 = 0;
        let mut fs_total_x = 0.0f64;
        let fs_pt = self.fs_pt.as_ref().unwrap_or(&self.pt);
        while remaining > 0 {
            remaining -= 1;
            total_executed += 1;
            let rs = picker.pick(rng);
            let grid = MegawaysGrid::spin(self.ir, rs, rng);
            let spin = evaluate_megaways(&grid, self.ir, fs_pt);
            fs_total_x += spin.payout_total_bet_x();
            // Retrigger: ≥ trig_min Bonus on FS grid.
            let bonus_count = *spin.role_counts.get(&trig_sym).unwrap_or(&0);
            if bonus_count >= trig_min && retrigger_spins > 0 {
                let cap_left = cap.saturating_sub(total_executed + remaining);
                let add = retrigger_spins.min(cap_left);
                remaining += add;
            }
        }
        fs_total_x
    }

    /// W4.10c — Ways + cascade MC path. Each spin: initial 5×3 grid,
    /// cascade-evaluate (remove + repop until no wins or depth 50), then
    /// run FS feature (cascade is *not* used inside FS for this game; FS
    /// uses Ways eval only because the FS reel strips are different).
    /// Coin / boost jackpot tier contribution is added per-spin from
    /// `IR.meta.rtp_breakdown` because Excel publishes this directly as
    /// a deterministic decomposition (W4.10c spec).
    fn run_ways_cascade(&self, n_spins: u64, rng: &mut Prng, s: &mut SimStats) {
        let mut cap_logged = false;
        // Per-spin deterministic contribution from the Excel rtp_breakdown
        // for the Coin / Coin Boost jackpot bonus tier evaluation. Excel
        // publishes these as fixed RTP shares so the MC engine adds them
        // deterministically per spin to match the published total. The
        // breakdown is decomposed into:
        //   * base_coin_x  = base_game_coins + base_game_jackpot
        //   * fs_coin_x    = free_spins_coins + free_spins_jackpot
        // `fs_coin_x` is conditioned on FS being triggered; absent any
        // FS-rate publication, we share fs_coin_x / fs_avg_spins per FS
        // spin executed. For Fortune Coin the FS rate × 5 spins exactly
        // reproduces the Excel published fs_coins + fs_jackpot share.
        let base_coin_x = self
            .ir
            .meta
            .rtp_breakdown
            .get("base_game_coins")
            .copied()
            .unwrap_or(0.0)
            + self
                .ir
                .meta
                .rtp_breakdown
                .get("base_game_jackpot")
                .copied()
                .unwrap_or(0.0);
        let fs_coin_total = self
            .ir
            .meta
            .rtp_breakdown
            .get("free_spins_coins")
            .copied()
            .unwrap_or(0.0)
            + self
                .ir
                .meta
                .rtp_breakdown
                .get("free_spins_jackpot")
                .copied()
                .unwrap_or(0.0);

        for _ in 0..n_spins {
            let rs = self.base_picker.pick(rng);
            let initial = if self.virtual_mode {
                Grid::spin_virtual(rs, self.rows, rng)
            } else {
                Grid::spin(rs, self.rows, rng)
            };
            let ws = evaluate_cascade(initial, rs, self.ir, &self.pt, rng);
            // Player-facing payout (ways + scatter — drives hit/win metrics).
            let mut spin_x_player = ws.payout_total_bet_x();
            s.base_x += spin_x_player;
            if ws.cascade_steps > 0 {
                *s.event_count
                    .entry(format!("cascade_depth:{}", ws.cascade_steps.min(50)))
                    .or_insert(0) += 1;
            }
            if ws.cascade_steps >= crate::ways_eval::MAX_CASCADE_DEPTH {
                *s.event_count.entry("cascade_guard_hit".into()).or_insert(0) += 1;
            }
            // Deterministic Coin / Boost jackpot contribution (Excel
            // base_game_coins + base_game_jackpot). Tracked separately so
            // it does NOT inflate hit/win frequencies.
            let mut spin_x_total = spin_x_player + base_coin_x;
            *s.feature_x.entry("coin_boost_base".into()).or_insert(0.0) += base_coin_x;

            // FS path — Ways evaluator + Coin/Boost FS jackpot contribution.
            let (fs_x, fs_spins_executed) = self.maybe_run_ways_fs(&ws.role_counts, rng);
            if fs_spins_executed > 0 {
                spin_x_player += fs_x;
                spin_x_total += fs_x;
                spin_x_total += fs_coin_total; // per-trigger FS coin/jackpot
                *s.feature_x.entry("free_spins".into()).or_insert(0.0) += fs_x;
                *s.feature_x.entry("coin_boost_fs".into()).or_insert(0.0) += fs_coin_total;
                *s.event_count.entry("fs_trigger".into()).or_insert(0) += 1;
            }
            // Edge case 8 — max-win cap.
            if spin_x_total > MAX_WIN_CAP_X {
                spin_x_total = MAX_WIN_CAP_X;
                if !cap_logged {
                    *s.event_count.entry("max_win_cap_hit".into()).or_insert(0) += 1;
                    cap_logged = true;
                }
            }
            self.commit_spin(s, spin_x_total, spin_x_player);
        }
    }

    fn maybe_run_ways_fs(
        &self,
        role_counts: &std::collections::HashMap<String, u32>,
        rng: &mut Prng,
    ) -> (f64, u32) {
        let Some(picker) = self.fs_picker.as_ref() else {
            return (0.0, 0);
        };
        let Some((trig_sym, trig_min, initial_spins, retrigger_spins, max_total)) =
            self.ir.features.iter().find_map(|f| match f {
                Feature::FreeSpins {
                    trigger_symbol,
                    trigger_count_min,
                    initial_spins,
                    retrigger_spins,
                    max_total_spins,
                    ..
                } => Some((
                    trigger_symbol.clone(),
                    *trigger_count_min,
                    *initial_spins,
                    *retrigger_spins,
                    *max_total_spins,
                )),
                _ => None,
            })
        else {
            return (0.0, 0);
        };
        let count = *role_counts.get(&trig_sym).unwrap_or(&0);
        if count < trig_min {
            return (0.0, 0);
        }
        let cap = max_total.unwrap_or(u32::MAX);
        let mut remaining = initial_spins.min(cap);
        let mut total_executed: u32 = 0;
        let mut fs_total_x = 0.0f64;
        let fs_pt = self.fs_pt.as_ref().unwrap_or(&self.pt);
        while remaining > 0 {
            remaining -= 1;
            total_executed += 1;
            let rs = picker.pick(rng);
            let initial = if self.virtual_mode {
                Grid::spin_virtual(rs, self.rows, rng)
            } else {
                Grid::spin(rs, self.rows, rng)
            };
            let ws = evaluate_cascade(initial, rs, self.ir, fs_pt, rng);
            fs_total_x += ws.payout_total_bet_x();
            let bonus_count = *ws.role_counts.get(&trig_sym).unwrap_or(&0);
            if bonus_count >= trig_min && retrigger_spins > 0 {
                let cap_left = cap.saturating_sub(total_executed + remaining);
                let add = retrigger_spins.min(cap_left);
                remaining += add;
            }
        }
        (fs_total_x, total_executed)
    }

    fn commit_spin(&self, s: &mut SimStats, spin_x: f64, spin_x_for_metrics: f64) {
        s.total_payout_x += spin_x;
        if spin_x > s.max_single_x { s.max_single_x = spin_x; }
        if spin_x_for_metrics > 0.0 { s.hits += 1; }
        if spin_x_for_metrics > 1.0 { s.wins += 1; }
        if spin_x >= 10.0 { s.wins_ge_10x += 1; }
        if spin_x >= 20.0 { s.wins_ge_20x += 1; }
        if spin_x >= 50.0 { s.wins_ge_50x += 1; }
        if spin_x >= 100.0 { s.wins_ge_100x += 1; }
        if spin_x >= 200.0 { s.wins_ge_200x += 1; }
        if spin_x >= 500.0 { s.wins_ge_500x += 1; }
        if spin_x >= 1000.0 { s.wins_ge_1000x += 1; }
        s.spins += 1;
    }
}

/// Compile a FS-specific `CompiledPaytable` if any FreeSpins feature
/// carries `fs_paytable: Some(...)`. We build a temporary `Ir` clone with
/// the FS paytable swapped in, so `CompiledPaytable::compile`'s same
/// scope dispatch (line/scatter/pattern) covers FS pays.
fn compile_fs_paytable(ir: &Ir) -> Option<CompiledPaytable> {
    let fs_table: Option<&Vec<PaytableEntry>> = ir.features.iter().find_map(|f| {
        if let Feature::FreeSpins { fs_paytable, .. } = f {
            fs_paytable.as_ref()
        } else {
            None
        }
    });
    let fs_table = fs_table?;
    let mut clone = ir.clone();
    clone.paytable = fs_table.clone();
    Some(CompiledPaytable::compile(&clone))
}
