// CE COPY TEST — sim CLI.
// Usage: ce-sim --ir <path> --spins <N> [--bet-mult <M>] [--seed <S>] [--threads <T>]

use ce_copy_test::ir::Ir;
use ce_copy_test::sim::{Engine, SimStats};
use clap::Parser;
use rayon::prelude::*;

#[derive(Parser, Debug)]
#[command(name = "ce-sim", about = "CE COPY TEST Monte-Carlo driver")]
struct Args {
    /// Path to ce-copy-test.<swid>.ir.json
    #[arg(long)]
    ir: String,
    /// Total spins to run.
    #[arg(long, default_value_t = 1_000_000)]
    spins: u64,
    /// Bet multiplier (default 1).
    #[arg(long, default_value_t = 1)]
    bet_mult: i64,
    /// PRNG seed (default 0xCEC0C0FE).
    #[arg(long, default_value_t = 0xCEC0_C0FE)]
    seed: u64,
    /// Threads (rayon parallel chunks). 0 = auto.
    #[arg(long, default_value_t = 0)]
    threads: usize,
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
        wins_ge_10x: a.wins_ge_10x + b.wins_ge_10x,
        wins_ge_20x: a.wins_ge_20x + b.wins_ge_20x,
        wins_ge_50x: a.wins_ge_50x + b.wins_ge_50x,
        wins_ge_100x: a.wins_ge_100x + b.wins_ge_100x,
        wins_ge_200x: a.wins_ge_200x + b.wins_ge_200x,
        wins_ge_500x: a.wins_ge_500x + b.wins_ge_500x,
        wins_ge_1000x: a.wins_ge_1000x + b.wins_ge_1000x,
        ce_base_payout_sum_x: a.ce_base_payout_sum_x + b.ce_base_payout_sum_x,
        ce_fs_payout_sum_x: a.ce_fs_payout_sum_x + b.ce_fs_payout_sum_x,
        fs_bonus_payout_sum_x: a.fs_bonus_payout_sum_x + b.fs_bonus_payout_sum_x,
    }
}

fn main() {
    let args = Args::parse();
    let ir = Ir::load(&args.ir).expect("load IR");
    let n_threads = if args.threads == 0 {
        rayon::current_num_threads()
    } else {
        args.threads
    };
    let chunk = args.spins.div_ceil(n_threads as u64);
    let chunks: Vec<(u64, u64)> = (0..n_threads as u64)
        .map(|i| (i, chunk.min(args.spins.saturating_sub(i * chunk))))
        .filter(|(_, n)| *n > 0)
        .collect();
    let t0 = std::time::Instant::now();
    let stats = chunks
        .par_iter()
        .map(|(i, n)| {
            let eng = Engine::new(&ir);
            eng.run(*n, args.bet_mult, args.seed ^ (*i + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        })
        .reduce(SimStats::default, merge);
    let elapsed = t0.elapsed();
    println!("== CE COPY TEST sim ==");
    println!("SWID:           {}", ir.meta.swid);
    println!("Bet multiplier: {}", args.bet_mult);
    println!("Spins:          {}", stats.spins);
    println!("Elapsed:        {:.2?}", elapsed);
    println!("Spins/sec:      {:.0}", stats.spins as f64 / elapsed.as_secs_f64());
    println!();
    println!("=== RTP breakdown ===");
    let s = &stats;
    let n = s.spins as f64;
    println!(
        "  Base game RTP            : {:.6}   (Excel target {:.6})",
        s.base_game_x / n,
        ir.meta.rtp_breakdown.base_game
    );
    println!(
        "  CE from base RTP         : {:.6}   (Excel target {:.6})",
        s.ce_from_base_x / n,
        ir.meta.rtp_breakdown.cash_eruption_from_base
    );
    println!(
        "  Free Spins RTP           : {:.6}   (Excel target {:.6})",
        (s.fs_lines_x + s.fs_bv_x + s.ce_from_fs_x) / n,
        ir.meta.rtp_breakdown.free_spins + ir.meta.rtp_breakdown.cash_eruption_from_fs
    );
    println!(
        "    └─ FS line wins        : {:.6}", s.fs_lines_x / n);
    println!(
        "    └─ FS Big Volcano      : {:.6}", s.fs_bv_x / n);
    println!(
        "    └─ CE from FS          : {:.6}   (Excel target {:.6})",
        s.ce_from_fs_x / n,
        ir.meta.rtp_breakdown.cash_eruption_from_fs
    );
    println!(
        "  Total RTP                : {:.6}   (Excel target {:.6})",
        s.rtp(),
        ir.meta.rtp_total
    );
    println!();
    println!("=== Hit/Win frequency ===");
    println!(
        "  Hit freq                 : {:.6}   (Excel target {:.6})",
        s.hit_freq(),
        ir.meta.hit_frequency_all_line
    );
    println!(
        "  Win freq                 : {:.6}   (Excel target {:.6})",
        s.win_freq(),
        ir.meta.win_frequency_all_line
    );
    println!();
    println!("=== Triggers ===");
    let fs_per = if s.fs_triggers > 0 { n / s.fs_triggers as f64 } else { f64::INFINITY };
    let ce_base_per =
        if s.ce_from_base_triggers > 0 { n / s.ce_from_base_triggers as f64 } else { f64::INFINITY };
    let ce_fs_per = if s.ce_from_fs_triggers > 0 {
        n / s.ce_from_fs_triggers as f64
    } else {
        f64::INFINITY
    };
    println!("  Free Spins trigger 1 in : {:.2}   (Excel target 139.9)", fs_per);
    println!("  Pattern-CE base 1 in : {:.2}   (Excel target 120.8)", ce_base_per);
    println!("  Pattern-CE FS 1 in   : {:.2}   (Excel target 468.99)", ce_fs_per);
    println!("  GRAND hits              : {}", s.grand_hits);
    println!("  Max single spin (x)     : {:.2}", s.max_single_x);

    println!();
    println!("=== Average feature wins (PAR_100spins) ===");
    let avg_ce_base = if s.ce_from_base_triggers > 0 {
        s.ce_base_payout_sum_x / s.ce_from_base_triggers as f64
    } else {
        0.0
    };
    let avg_ce_fs = if s.ce_from_fs_triggers > 0 {
        s.ce_fs_payout_sum_x / s.ce_from_fs_triggers as f64
    } else {
        0.0
    };
    let avg_fs_bonus = if s.fs_triggers > 0 {
        s.fs_bonus_payout_sum_x / s.fs_triggers as f64
    } else {
        0.0
    };
    println!("  Avg CE win (base)        : {:.2}×   (Excel target 49.42×)", avg_ce_base);
    println!("  Avg CE win (FS)          : {:.2}×   (Excel target 29.03×)", avg_ce_fs);
    println!("  Avg Free Spins bonus     : {:.2}×   (Excel target 9.79×)", avg_fs_bonus);

    println!();
    println!("=== Volatility distribution (PAR_100spins A36..D43) ===");
    let print_bucket = |label: &str, hits: u64, target_per: f64| {
        let per = if hits > 0 { n / hits as f64 } else { f64::INFINITY };
        println!(
            "  {:10}  1 in {:>10.2}  (Excel target 1 in {})  hits={}",
            label, per, target_per, hits
        );
    };
    print_bucket("10x+",  s.wins_ge_10x,  52.0);
    print_bucket("20x+",  s.wins_ge_20x,  91.0);
    print_bucket("50x+",  s.wins_ge_50x,  307.0);
    print_bucket("100x+", s.wins_ge_100x, 631.0);
    print_bucket("200x+", s.wins_ge_200x, 30048.0);
    print_bucket("500x+", s.wins_ge_500x, 61652.0);
    println!("  1000x+      hits={} (Pattern Win baseline)", s.wins_ge_1000x);
}
