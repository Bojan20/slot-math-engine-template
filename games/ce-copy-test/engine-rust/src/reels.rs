// Reel sampler + weighted set picker.
//
// PAR-001 line 21: "The above symbol counts reflect the average count for
// 2nd row based on the reel set probabilities." → Vendor B probabilistic reel
// model:
//
//   1. For each reel, sample ONE *stop position* proportional to its
//      weight in the strip (N stops, weights sum to 100 000).
//   2. Visible 3-row window = strip[stop-1], strip[stop], strip[stop+1]
//      (cyclic).
//
// Symbol counts in the PAR header reflect mean "stop-row" exposure, i.e.
// each row-2 cell averages weight/total occurrences. Top/bottom rows
// inherit from the neighbouring stops in the strip.

use crate::ir::{Ir, ReelSet};
use crate::rng::Prng;

/// Per-reel strip: ordered list of stop entries (symbol + weight) + cumulative.
#[derive(Debug, Clone)]
pub struct Strip {
    pub symbols: Vec<String>,
    pub cum: Vec<i64>,
    pub total: i64,
}

impl Strip {
    pub fn new(entries: &[(String, i64)]) -> Self {
        let mut symbols = Vec::with_capacity(entries.len());
        let mut cum = Vec::with_capacity(entries.len());
        let mut running = 0i64;
        for (s, w) in entries {
            running += *w;
            symbols.push(s.clone());
            cum.push(running);
        }
        Strip {
            symbols,
            cum,
            total: running,
        }
    }

    /// Sample one stop index proportional to weight. O(log n).
    #[inline]
    pub fn sample_stop(&self, rng: &mut Prng) -> usize {
        let r = rng.gen_range_i64(self.total);
        self.cum.partition_point(|&c| c <= r)
    }

    /// Visible 3 rows centred on `stop` (row 0 = above, 1 = stop, 2 = below).
    #[inline]
    pub fn visible(&self, stop: usize) -> [&str; 3] {
        let n = self.symbols.len();
        let top = if stop == 0 { n - 1 } else { stop - 1 };
        let bot = if stop + 1 >= n { 0 } else { stop + 1 };
        [
            self.symbols[top].as_str(),
            self.symbols[stop].as_str(),
            self.symbols[bot].as_str(),
        ]
    }
}

/// Top-level weighted table for picking reel-sets (set-of-strips).
#[derive(Debug, Clone)]
pub struct WeightedTable<T: Clone> {
    pub items: Vec<T>,
    pub cum: Vec<i64>,
    pub total: i64,
}

impl<T: Clone> WeightedTable<T> {
    pub fn new(pairs: Vec<(T, i64)>) -> Self {
        let mut items = Vec::with_capacity(pairs.len());
        let mut cum = Vec::with_capacity(pairs.len());
        let mut running: i64 = 0;
        for (it, w) in pairs {
            running += w;
            items.push(it);
            cum.push(running);
        }
        WeightedTable {
            items,
            cum,
            total: running,
        }
    }

    #[inline]
    pub fn sample_with_index(&self, rng: &mut Prng) -> (&T, usize) {
        let r = rng.gen_range_i64(self.total);
        let idx = self.cum.partition_point(|&c| c <= r);
        (&self.items[idx], idx)
    }
}

#[derive(Debug, Clone)]
pub struct CompiledReelSet {
    pub set: i64,
    pub strips: [Strip; 5],
}

impl CompiledReelSet {
    pub fn from_ir(rs: &ReelSet) -> Self {
        let strips: Vec<Strip> = rs
            .reels
            .iter()
            .map(|r| {
                let pairs: Vec<(String, i64)> =
                    r.iter().map(|s| (s.symbol.clone(), s.weight)).collect();
                Strip::new(&pairs)
            })
            .collect();
        let strips: [Strip; 5] = strips
            .try_into()
            .expect("reel-set must have exactly 5 reels");
        CompiledReelSet { set: rs.set, strips }
    }
}

#[derive(Debug, Clone)]
pub struct ReelSetPicker {
    pub sets: Vec<CompiledReelSet>,
    pub picker: WeightedTable<usize>,
}

impl ReelSetPicker {
    pub fn from_bg(ir: &Ir) -> Self {
        let by_idx: std::collections::HashMap<i64, &ReelSet> =
            ir.bg_reel_sets.iter().map(|s| (s.set, s)).collect();
        let mut sets = Vec::new();
        let mut pairs: Vec<(usize, i64)> = Vec::new();
        for (i, w) in ir.bg_reel_set_weights.weights.iter().enumerate() {
            let rs = by_idx
                .get(&w.set)
                .unwrap_or_else(|| panic!("BG reel set {} missing", w.set));
            sets.push(CompiledReelSet::from_ir(rs));
            pairs.push((i, w.weight));
        }
        let picker = WeightedTable::new(pairs);
        debug_assert_eq!(picker.total, ir.bg_reel_set_weights.total);
        ReelSetPicker { sets, picker }
    }

    pub fn from_fg(ir: &Ir) -> Self {
        let by_idx: std::collections::HashMap<i64, &ReelSet> =
            ir.fg_reel_sets.iter().map(|s| (s.set, s)).collect();
        let mut sets = Vec::new();
        let mut pairs: Vec<(usize, i64)> = Vec::new();
        for (i, w) in ir.fg_reel_set_weights.weights.iter().enumerate() {
            let rs = by_idx
                .get(&w.set)
                .unwrap_or_else(|| panic!("FG reel set {} missing", w.set));
            sets.push(CompiledReelSet::from_ir(rs));
            pairs.push((i, w.weight));
        }
        let picker = WeightedTable::new(pairs);
        ReelSetPicker { sets, picker }
    }

    #[inline]
    pub fn pick(&self, rng: &mut Prng) -> &CompiledReelSet {
        let (idx, _) = self.picker.sample_with_index(rng);
        &self.sets[*idx]
    }
}

/// Visible 3×5 grid. `grid[reel][row]` (row 0 = top, 1 = middle, 2 = bottom).
#[derive(Debug, Clone)]
pub struct Grid {
    pub cells: [[String; 3]; 5],
    /// Per-reel stop index for downstream debug + adjacency logic.
    pub stops: [usize; 5],
}

impl Grid {
    pub fn empty() -> Self {
        Grid {
            cells: std::array::from_fn(|_| std::array::from_fn(|_| String::new())),
            stops: [0; 5],
        }
    }

    /// Sample one stop per reel (weighted) and project the visible 3-row window.
    /// Used for base-game spins (5 independent reels).
    pub fn spin(rs: &CompiledReelSet, rng: &mut Prng) -> Self {
        let mut g = Grid::empty();
        for r in 0..5 {
            let stop = rs.strips[r].sample_stop(rng);
            g.stops[r] = stop;
            let view = rs.strips[r].visible(stop);
            for (row, sym) in view.iter().enumerate() {
                g.cells[r][row] = (*sym).to_string();
            }
        }
        g
    }

    /// Free-spins spin: reels 2/3/4 are linked (one stop drives all three,
    /// producing 3×3 Big symbols on the middle block). Reels 1 and 5 spin
    /// independently. Per PAR-001 line 2654:
    /// "all symbols on the linked reels are 3 symbol positions high and
    /// 3 symbol positions wide (Big symbols)."
    pub fn spin_fs_linked(rs: &CompiledReelSet, rng: &mut Prng) -> Self {
        let mut g = Grid::empty();
        // Reel 1 (idx 0)
        let s0 = rs.strips[0].sample_stop(rng);
        g.stops[0] = s0;
        for (row, sym) in rs.strips[0].visible(s0).iter().enumerate() {
            g.cells[0][row] = (*sym).to_string();
        }
        // Linked reels 2/3/4 (idx 1,2,3) share ONE stop (use reel 3's strip
        // as the linked block — the three strips are identical by construction).
        let s_linked = rs.strips[2].sample_stop(rng);
        let view = rs.strips[2].visible(s_linked);
        for r in 1..=3 {
            g.stops[r] = s_linked;
            for (row, sym) in view.iter().enumerate() {
                g.cells[r][row] = (*sym).to_string();
            }
        }
        // Reel 5 (idx 4)
        let s4 = rs.strips[4].sample_stop(rng);
        g.stops[4] = s4;
        for (row, sym) in rs.strips[4].visible(s4).iter().enumerate() {
            g.cells[4][row] = (*sym).to_string();
        }
        g
    }

    #[inline]
    pub fn cell(&self, reel: usize, row: usize) -> &str {
        self.cells[reel][row].as_str()
    }
}
