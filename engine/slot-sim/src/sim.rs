// Universal MC driver — IR in, SimStats out.

use crate::evaluate::{evaluate_lines, CompiledPaytable};
use crate::features::run_features;
use crate::ir::{Evaluation, Ir, Topology};
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;
use crate::stats::SimStats;

pub struct Engine<'a> {
    pub ir: &'a Ir,
    pub base_picker: ReelSetPicker,
    pub fs_picker: Option<ReelSetPicker>,
    pub pt: CompiledPaytable,
    pub rows: usize,
    pub lines: u32,
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
        Engine { ir, base_picker, fs_picker, pt, rows, lines }
    }

    pub fn run(&self, n_spins: u64, bet_multiplier: i64, seed: u64) -> SimStats {
        let mut rng = Prng::from_seed(seed);
        let mut s = SimStats::default();
        for _ in 0..n_spins {
            let rs = self.base_picker.pick(&mut rng);
            let grid = Grid::spin(rs, self.rows, &mut rng);
            let base = evaluate_lines(&grid, self.ir, &self.pt);
            let mut spin_x = base.payout_total_bet_x(self.lines);
            s.base_x += spin_x;
            // Feature dispatch — W4.3c: FreeSpins / PickBonus / LinearProgressive live.
            let feat = run_features(
                self.ir,
                &grid,
                &base,
                bet_multiplier,
                &mut rng,
                self.fs_picker.as_ref(),
                &self.pt,
            );
            spin_x += feat.coins / (self.lines as f64);
            for ev in &feat.events {
                *s.event_count.entry(ev.clone()).or_insert(0) += 1;
            }
            s.record(spin_x);
        }
        s
    }
}
