// Cash Eruption hold-and-win feature (per-bet-multiplier math).
//
// PAR-001 hold-and-win mechanic:
//   - Trigger: ≥6 Fireballs land on the 5×3 grid (during a base spin
//     OR during the FS bonus; this module is generic over context).
//   - 3 respins are awarded; respin counter resets each time at least
//     one NEW Fireball lands on the grid.
//   - Each respin: sample number of *additional* Fireballs from the
//     `respin_tables[n_landed][respins_remaining]` distribution. Each
//     new Fireball gets a coin value from the Small Fireball pool
//     (×bet multiplier, unless it's a Big Fireball — Big Fireballs only
//     appear in FS via Big-symbol reels).
//   - Each Fireball is classified as "small" or "big". For "small"
//     pool the coin-value distribution is from `small_fireball_values`;
//     for "big" pool from `big_fireball_values`. The classification is
//     drawn from `fireballs_set_weights` (low/med/high pool select on
//     ALL 32-bit RNG range — total 4 294 967 295).
//   - MINI / MINOR / MAJOR pots are part of the same coin-value
//     distribution (each carries a fixed coin value 900/4500/18000 in
//     bet-multiplier units, per the BET MULTIPLIER 1 page row J3988..).
//   - GRAND (1 000 000 ×) is sampled separately via the `grand_prob`
//     gate; on hit, the entire feature payout is set to the GRAND prize
//     (in coins).
//
// All payouts are in **coins** (single-line bet units = 1/20 total bet).

use crate::ir::{CashEruptionPage, Ir, PotEntry};
use crate::rng::Prng;

/// Compiled per-bet-multiplier feature math (precomputed cumulative tables).
#[derive(Debug, Clone)]
pub struct CompiledCe {
    pub bet_multiplier: i64,
    pub set_pool: SetPoolPicker,
    pub small_dist: PoolDistribution,
    pub big_dist: PoolDistribution,
    /// `respin[n_landed][remaining]` = cumulative additional-Fireballs table
    pub respin: std::collections::HashMap<(u32, u32), CumTable<u32>>,
    pub grand_prob_base: f64,
    pub grand_prob_fs: f64,
    pub top_award: i64,
}

#[derive(Debug, Clone)]
pub struct SetPoolPicker {
    /// Cumulative boundaries for low/med/high pool select (over 2^32).
    /// `low_cum, med_cum, high_cum, total`.
    pub low_cum: u64,
    pub med_cum: u64,
    pub high_cum: u64,
    pub total: u64,
}

#[derive(Debug, Clone)]
pub enum Pool {
    Low,
    Med,
    High,
}

impl SetPoolPicker {
    pub fn pick(&self, rng: &mut Prng) -> Pool {
        let r = (rng.gen_u32() as u64) % self.total.max(1);
        if r < self.low_cum {
            Pool::Low
        } else if r < self.med_cum {
            Pool::Med
        } else {
            Pool::High
        }
    }
}

#[derive(Debug, Clone)]
pub struct CumTable<T: Clone> {
    pub items: Vec<T>,
    pub cum: Vec<i64>,
    pub total: i64,
}

impl<T: Clone> CumTable<T> {
    pub fn new(pairs: Vec<(T, i64)>) -> Self {
        let mut items = Vec::with_capacity(pairs.len());
        let mut cum = Vec::with_capacity(pairs.len());
        let mut running = 0i64;
        for (it, w) in pairs {
            running += w;
            items.push(it);
            cum.push(running);
        }
        CumTable {
            items,
            cum,
            total: running,
        }
    }

    pub fn sample(&self, rng: &mut Prng) -> &T {
        let r = rng.gen_range_i64(self.total);
        let idx = self.cum.partition_point(|&c| c <= r);
        &self.items[idx]
    }
}

#[derive(Debug, Clone, Copy)]
pub enum FbValue {
    Coin(i64),
    Mini,
    Minor,
    Major,
}

/// Compiled coin-value distribution for one pool side (small or big),
/// per pool selector (low/med/high). Includes MINI/MINOR/MAJOR as
/// additional weighted entries (alongside their fixed coin values).
#[derive(Debug, Clone)]
pub struct PoolDistribution {
    pub low: CumTable<FbValue>,
    pub med: CumTable<FbValue>,
    pub high: CumTable<FbValue>,
    pub mini_value: i64,
    pub minor_value: i64,
    pub major_value: i64,
}

impl PoolDistribution {
    pub fn from_values(
        values: &[crate::ir::FireballValue],
        pots: &std::collections::BTreeMap<String, PotEntry>,
    ) -> Self {
        let mut low_pairs: Vec<(FbValue, i64)> = Vec::new();
        let mut med_pairs: Vec<(FbValue, i64)> = Vec::new();
        let mut high_pairs: Vec<(FbValue, i64)> = Vec::new();
        for v in values {
            if let Some(w) = v.low {
                if w > 0 {
                    low_pairs.push((FbValue::Coin(v.coin_value), w));
                }
            }
            if let Some(w) = v.med {
                if w > 0 {
                    med_pairs.push((FbValue::Coin(v.coin_value), w));
                }
            }
            if let Some(w) = v.high {
                if w > 0 {
                    high_pairs.push((FbValue::Coin(v.coin_value), w));
                }
            }
        }
        // Pots (MINI/MINOR/MAJOR) carry their own weighted slot.
        let mut mini_v = 0i64;
        let mut minor_v = 0i64;
        let mut major_v = 0i64;
        for (tier, pot) in pots {
            let fb = match tier.as_str() {
                "MINI" => FbValue::Mini,
                "MINOR" => FbValue::Minor,
                "MAJOR" => FbValue::Major,
                _ => continue,
            };
            match tier.as_str() {
                "MINI" => mini_v = pot.value,
                "MINOR" => minor_v = pot.value,
                "MAJOR" => major_v = pot.value,
                _ => {}
            }
            if let Some(w) = pot.low {
                if w > 0 {
                    low_pairs.push((fb, w));
                }
            }
            if let Some(w) = pot.med {
                if w > 0 {
                    med_pairs.push((fb, w));
                }
            }
            if let Some(w) = pot.high {
                if w > 0 {
                    high_pairs.push((fb, w));
                }
            }
        }
        PoolDistribution {
            low: CumTable::new(low_pairs),
            med: CumTable::new(med_pairs),
            high: CumTable::new(high_pairs),
            mini_value: mini_v,
            minor_value: minor_v,
            major_value: major_v,
        }
    }

    pub fn sample(&self, rng: &mut Prng, pool: &Pool) -> i64 {
        let v = match pool {
            Pool::Low => self.low.sample(rng),
            Pool::Med => self.med.sample(rng),
            Pool::High => self.high.sample(rng),
        };
        match v {
            FbValue::Coin(c) => *c,
            FbValue::Mini => self.mini_value,
            FbValue::Minor => self.minor_value,
            FbValue::Major => self.major_value,
        }
    }
}

impl CompiledCe {
    pub fn from_page(page: &CashEruptionPage) -> Self {
        let fsw = &page.fireballs_set_weights;
        let low = fsw.low.unwrap_or(0) as u64;
        let med = fsw.med.unwrap_or(0) as u64;
        let high = fsw.high.unwrap_or(0) as u64;
        let total = fsw.total.unwrap_or((low + med + high) as i64) as u64;
        let set_pool = SetPoolPicker {
            low_cum: low,
            med_cum: low + med,
            high_cum: low + med + high,
            total,
        };
        let small_dist = PoolDistribution::from_values(
            &page.small_fireball_values,
            &page.mini_minor_major.small,
        );
        let big_dist =
            PoolDistribution::from_values(&page.big_fireball_values, &page.mini_minor_major.big);
        // Build respin lookup
        let mut respin = std::collections::HashMap::new();
        for (n_landed_s, by_rem) in &page.respin_tables {
            let n_landed: u32 = n_landed_s.parse().expect("landed key");
            for (rem_s, slot) in by_rem {
                let rem: u32 = rem_s.parse().expect("rem key");
                let mut pairs = Vec::new();
                for (k, v) in slot {
                    if k == "total" {
                        continue;
                    }
                    let n_add: u32 = k.parse().expect("add key");
                    if *v > 0 {
                        pairs.push((n_add, *v));
                    }
                }
                // sort by additional Fireballs ascending for stable cum
                pairs.sort_by_key(|(a, _)| *a);
                respin.insert((n_landed, rem), CumTable::new(pairs));
            }
        }
        CompiledCe {
            bet_multiplier: page.bet_multiplier,
            set_pool,
            small_dist,
            big_dist,
            respin,
            grand_prob_base: page.grand_prob_base.unwrap_or(0.0),
            grand_prob_fs: page.grand_prob_fs.unwrap_or(0.0),
            top_award: page.top_award.unwrap_or(0),
        }
    }
}

#[derive(Debug, Clone)]
pub struct CompiledCeAll {
    /// `by_bm[bet_multiplier_i64]`
    pub by_bm: std::collections::HashMap<i64, CompiledCe>,
}

impl CompiledCeAll {
    pub fn from_ir(ir: &Ir) -> Self {
        let mut by_bm = std::collections::HashMap::new();
        for p in &ir.cash_eruption_feature_pages {
            by_bm.insert(p.bet_multiplier, CompiledCe::from_page(p));
        }
        CompiledCeAll { by_bm }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum CeContext {
    Base,
    FreeSpins,
}

#[derive(Debug, Clone, Default)]
pub struct CeResult {
    /// Total feature payout in **coins** (1/20 of total bet).
    pub payout_coins: f64,
    /// True iff the GRAND prize was awarded.
    pub grand_hit: bool,
    /// Final Fireball count on the grid at end of feature.
    pub final_fireballs: u32,
}

/// Run the Cash Eruption hold-and-win feature.
///
/// `n_initial` = Fireballs landed on trigger spin (≥6).
/// `is_fg`     = if true, use FG grand probability + Big-Fireball pool;
///               if false, use base grand probability + Small Fireball pool.
pub fn run_cash_eruption(
    ce: &CompiledCe,
    n_initial: u32,
    ctx: CeContext,
    rng: &mut Prng,
) -> CeResult {
    let mut res = CeResult::default();
    // Step 1: GRAND probability gate — fires once per feature, before any
    // respins. (Excel models GRAND as a separate top-level probability;
    // when hit, the whole feature pays the GRAND value.)
    let grand_prob = match ctx {
        CeContext::Base => ce.grand_prob_base,
        CeContext::FreeSpins => ce.grand_prob_fs,
    };
    if grand_prob > 0.0 && rng.gen_f64() < grand_prob {
        res.grand_hit = true;
        res.payout_coins = ce.top_award as f64;
        res.final_fireballs = n_initial; // not relevant for payout
        return res;
    }
    // Step 2: Pool select (low / med / high) once per feature.
    let pool = ce.set_pool.pick(rng);
    // Coin distribution: BOTH contexts use the Small Fireball table.
    // The Big Fireball table only governs the GRAND/Big-Volcano payouts
    // on the FS reel block; the held coin awards themselves draw from
    // Small per per-cell. Cross-checked against Excel "Average Coin Value"
    // row 4083: small fireball 44.17/80.00/216.68 ↔ matches both contexts.
    let dist = &ce.small_dist;
    let _ = ctx; // ctx retained for grand-prob branch above
    // Step 3: Accumulate coin value of initial Fireballs.
    let mut payout = 0.0f64;
    for _ in 0..n_initial {
        payout += dist.sample(rng, &pool) as f64;
    }
    // Step 4: Respin loop — start with 3 remaining; if at least 1 new
    // Fireball lands, reset to 3 (per hold-and-win convention).
    let mut landed = n_initial;
    let mut remaining = 3u32;
    while remaining > 0 {
        let key = (landed.min(14), remaining);
        let table = match ce.respin.get(&key) {
            Some(t) => t,
            None => {
                // Fall back to nearest available landed count (cap at 14).
                let mut k = landed.min(14);
                let mut chosen: Option<&CumTable<u32>> = None;
                while k >= 6 {
                    if let Some(t) = ce.respin.get(&(k, remaining)) {
                        chosen = Some(t);
                        break;
                    }
                    k -= 1;
                }
                match chosen {
                    Some(t) => t,
                    None => break,
                }
            }
        };
        let n_add = *table.sample(rng);
        if n_add == 0 {
            remaining -= 1;
            continue;
        }
        // Award coin value for each newly landed Fireball.
        for _ in 0..n_add {
            payout += dist.sample(rng, &pool) as f64;
        }
        landed = (landed + n_add).min(15); // 5×3 grid cap
        remaining = 3; // reset
        if landed >= 15 {
            // Grid full — feature ends with bonus award per game spec
            // (PAR row 689 "full_grid_bonus" semantics not in CE PAR; cap here).
            break;
        }
    }
    res.payout_coins = payout;
    res.final_fireballs = landed;
    res
}
