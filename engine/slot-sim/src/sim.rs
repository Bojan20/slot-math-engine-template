// Universal MC driver — IR in, SimStats out.

use crate::evaluate::{evaluate_lines, CompiledPaytable};
use crate::features::run_features;
use crate::ir::{Evaluation, Feature, Ir, PaytableEntry, Topology};
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;
use crate::stats::SimStats;

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
        for _ in 0..n_spins {
            let rs = self.base_picker.pick(&mut rng);
            let grid = if self.virtual_mode {
                Grid::spin_virtual(rs, self.rows, &mut rng)
            } else {
                Grid::spin(rs, self.rows, &mut rng)
            };
            let base = evaluate_lines(&grid, self.ir, &self.pt);
            let mut spin_x = base.payout_total_bet_x(self.lines);
            s.base_x += spin_x;
            // Feature dispatch — W4.3c: FreeSpins / PickBonus / LinearProgressive live.
            // W4.7: FS internal eval uses `self.fs_pt` if Feature::FreeSpins
            // declared a separate `fs_paytable`.
            let feat = run_features(
                self.ir,
                &grid,
                &base,
                bet_multiplier,
                &mut rng,
                self.fs_picker.as_ref(),
                &self.pt,
                self.virtual_mode,
                self.fs_pt.as_ref(),
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
