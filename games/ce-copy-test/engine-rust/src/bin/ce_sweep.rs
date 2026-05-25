// CE COPY TEST — multi-bet-multiplier sweep.
//
// Runs the same MC engine across all 21 bet multipliers exposed in the IR
// `cash_eruption_feature_pages`. For each bet multiplier, reports sim vs
// Excel target for the key feature RTPs (CE-from-base, CE-from-FS) and
// the headline diffs. Output: rich console table + machine-readable
// CSV/JSON at `--out <dir>` for downstream PAR report rendering.
//
// Usage:
//   ce-sweep --ir <path> --spins-per-bm <N> [--bms 1,2,3,...] [--seed S]
//            [--out <dir>] [--threads T]

use ce_copy_test::ir::Ir;
use ce_copy_test::sim::{Engine, SimStats};
use clap::Parser;
use rayon::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(name = "ce-sweep", about = "CE COPY TEST multi-bet-multiplier sweep")]
struct Args {
    /// Path to ce-copy-test.<swid>.ir.json
    #[arg(long)]
    ir: String,
    /// Spins per bet multiplier
    #[arg(long, default_value_t = 10_000_000)]
    spins_per_bm: u64,
    /// Comma-separated list of bet multipliers (default: all 21 from IR)
    #[arg(long)]
    bms: Option<String>,
    /// PRNG seed
    #[arg(long, default_value_t = 0xCEC0_C0FE)]
    seed: u64,
    /// Threads per bet multiplier (rayon parallel chunks). 0 = auto.
    #[arg(long, default_value_t = 0)]
    threads: usize,
    /// Output directory for CSV/JSON (default: skip)
    #[arg(long)]
    out: Option<PathBuf>,
}

fn merge(a: SimStats, b: SimStats) -> SimStats {
    SimStats {
        spins: a.spins + b.spins,
        total_payout_x: a.total_payout_x + b.total_payout_x,
        base_game_x: a.base_game_x + b.base_game_x,
        ce_from_base_x: a.ce_from_base_x + b.ce_from_base_x,
        fs_lines_x: a.fs_lines_x + b.fs_lines_x,
        fs_bv_x: a.fs_bv_x + b.fs_bv_x,
        ce_from_fs_x: a.ce_from_fs_x + b.ce_from_fs_x,
        hits: a.hits + b.hits,
        wins: a.wins + b.wins,
        fs_triggers: a.fs_triggers + b.fs_triggers,
        ce_from_base_triggers: a.ce_from_base_triggers + b.ce_from_base_triggers,
        ce_from_fs_triggers: a.ce_from_fs_triggers + b.ce_from_fs_triggers,
        grand_hits: a.grand_hits + b.grand_hits,
        max_single_x: a.max_single_x.max(b.max_single_x),
    }
}

fn run_one(ir: &Ir, bm: i64, spins: u64, seed: u64, threads: usize) -> SimStats {
    let n_threads = if threads == 0 {
        rayon::current_num_threads()
    } else {
        threads
    };
    let chunk = spins.div_ceil(n_threads as u64);
    let chunks: Vec<(u64, u64)> = (0..n_threads as u64)
        .map(|i| (i, chunk.min(spins.saturating_sub(i * chunk))))
        .filter(|(_, n)| *n > 0)
        .collect();
    chunks
        .par_iter()
        .map(|(i, n)| {
            let eng = Engine::new(ir);
            eng.run(
                *n,
                bm,
                seed ^ (*i + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ (bm as u64).rotate_left(17),
            )
        })
        .reduce(SimStats::default, merge)
}

#[derive(Debug, Serialize)]
struct BmRow {
    bet_mult: i64,
    spins: u64,
    base_rtp_sim: f64,
    ce_base_rtp_sim: f64,
    ce_base_rtp_excel: f64,
    ce_base_diff_pct: f64,
    fs_lines_rtp_sim: f64,
    fs_bv_rtp_sim: f64,
    ce_fs_rtp_sim: f64,
    ce_fs_rtp_excel: f64,
    ce_fs_diff_pct: f64,
    total_rtp_sim: f64,
    total_rtp_excel: f64,
    total_diff_pct: f64,
    fs_trigger_1_in: f64,
    ce_base_trigger_1_in: f64,
    ce_fs_trigger_1_in: f64,
    grand_hits: u64,
    max_single_x: f64,
}

fn main() {
    let args = Args::parse();
    let ir = Ir::load(&args.ir).expect("load IR");
    let all_bms: Vec<i64> = ir
        .cash_eruption_feature_pages
        .iter()
        .map(|p| p.bet_multiplier)
        .collect();
    let bms: Vec<i64> = if let Some(s) = &args.bms {
        s.split(',')
            .filter_map(|x| x.trim().parse().ok())
            .collect()
    } else {
        all_bms.clone()
    };
    let target_total = ir.meta.rtp_total;
    println!("== CE COPY TEST sweep ==");
    println!("SWID:          {}", ir.meta.swid);
    println!("Excel target:  RTP = {:.6}", target_total);
    println!("Bet mults:     {} ({:?})", bms.len(), bms);
    println!("Spins per bm:  {}", args.spins_per_bm);
    println!();
    println!(
        "{:>4} | {:>9} {:>9} {:>7} | {:>9} {:>9} {:>7} | {:>9} {:>9} {:>7} | {:>7} {:>7} {:>7} | {:>6}",
        "BM",
        "Base sim",
        "CE_b sim",
        "Δ%",
        "FSlnsim",
        "CE_f sim",
        "Δ%",
        "Tot sim",
        "Tot xls",
        "Δ%",
        "FSt",
        "CEb t",
        "CEf t",
        "GRAND"
    );
    let mut rows: Vec<BmRow> = Vec::new();
    for &bm in &bms {
        let page = ir
            .cash_eruption_feature_pages
            .iter()
            .find(|p| p.bet_multiplier == bm)
            .expect("bet mult page");
        let ce_base_target = page.ce_from_base_rtp.unwrap_or(0.0);
        let ce_fs_target = page.ce_from_fs_rtp.unwrap_or(0.0);
        let t0 = Instant::now();
        let stats = run_one(&ir, bm, args.spins_per_bm, args.seed, args.threads);
        let elapsed = t0.elapsed();
        let n = stats.spins as f64;
        let base_rtp = stats.base_game_x / n;
        let ce_base_rtp = stats.ce_from_base_x / n;
        let fs_lines_rtp = stats.fs_lines_x / n;
        let fs_bv_rtp = stats.fs_bv_x / n;
        let ce_fs_rtp = stats.ce_from_fs_x / n;
        let total_rtp = stats.rtp();
        let ce_base_diff = ((ce_base_rtp - ce_base_target) / ce_base_target * 100.0).abs();
        let ce_fs_diff = if ce_fs_target > 0.0 {
            (ce_fs_rtp - ce_fs_target) / ce_fs_target * 100.0
        } else {
            0.0
        };
        let total_diff = (total_rtp - target_total) / target_total * 100.0;
        let fs_per = if stats.fs_triggers > 0 {
            n / stats.fs_triggers as f64
        } else {
            f64::INFINITY
        };
        let ce_base_per = if stats.ce_from_base_triggers > 0 {
            n / stats.ce_from_base_triggers as f64
        } else {
            f64::INFINITY
        };
        let ce_fs_per = if stats.ce_from_fs_triggers > 0 {
            n / stats.ce_from_fs_triggers as f64
        } else {
            f64::INFINITY
        };
        println!(
            "{:>4} | {:>9.6} {:>9.6} {:>+7.2} | {:>9.6} {:>9.6} {:>+7.2} | {:>9.6} {:>9.6} {:>+7.2} | {:>7.2} {:>7.2} {:>7.2} | {:>6}  [{:.1}s]",
            bm,
            base_rtp,
            ce_base_rtp,
            (ce_base_rtp - ce_base_target) / ce_base_target * 100.0,
            fs_lines_rtp,
            ce_fs_rtp,
            ce_fs_diff,
            total_rtp,
            target_total,
            total_diff,
            fs_per,
            ce_base_per,
            ce_fs_per,
            stats.grand_hits,
            elapsed.as_secs_f64(),
        );
        rows.push(BmRow {
            bet_mult: bm,
            spins: stats.spins,
            base_rtp_sim: base_rtp,
            ce_base_rtp_sim: ce_base_rtp,
            ce_base_rtp_excel: ce_base_target,
            ce_base_diff_pct: ce_base_diff,
            fs_lines_rtp_sim: fs_lines_rtp,
            fs_bv_rtp_sim: fs_bv_rtp,
            ce_fs_rtp_sim: ce_fs_rtp,
            ce_fs_rtp_excel: ce_fs_target,
            ce_fs_diff_pct: ce_fs_diff,
            total_rtp_sim: total_rtp,
            total_rtp_excel: target_total,
            total_diff_pct: total_diff,
            fs_trigger_1_in: fs_per,
            ce_base_trigger_1_in: ce_base_per,
            ce_fs_trigger_1_in: ce_fs_per,
            grand_hits: stats.grand_hits,
            max_single_x: stats.max_single_x,
        });
    }
    // Aggregate stats
    println!();
    let avg_total: f64 = rows.iter().map(|r| r.total_rtp_sim).sum::<f64>() / rows.len() as f64;
    let max_total_diff = rows
        .iter()
        .map(|r| r.total_diff_pct.abs())
        .fold(0.0f64, f64::max);
    let max_ce_fs_diff = rows
        .iter()
        .map(|r| r.ce_fs_diff_pct.abs())
        .fold(0.0f64, f64::max);
    println!(
        "Aggregate: avg total RTP = {:.6} (target {:.6}); max |total Δ%| = {:.2}%; max |CE-FS Δ%| = {:.2}%",
        avg_total, target_total, max_total_diff, max_ce_fs_diff
    );

    if let Some(out_dir) = args.out {
        fs::create_dir_all(&out_dir).expect("create out dir");
        let swid_safe = ir.meta.swid.replace('/', "_");
        let json_path = out_dir.join(format!("ce-sweep.{}.json", swid_safe));
        fs::write(&json_path, serde_json::to_string_pretty(&rows).unwrap())
            .expect("write JSON");
        let csv_path = out_dir.join(format!("ce-sweep.{}.csv", swid_safe));
        let mut wtr = csv::Writer::from_path(&csv_path).expect("create CSV");
        for r in &rows {
            wtr.serialize(r).expect("write row");
        }
        wtr.flush().expect("flush CSV");
        println!();
        println!("Wrote: {}", json_path.display());
        println!("Wrote: {}", csv_path.display());
    }
}
