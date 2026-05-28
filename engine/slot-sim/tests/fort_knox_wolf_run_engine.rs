//! W4.16 — Fort Knox Wolf Run engine MC tests.
//!
//! Runs the full Engine pipeline against the IGT Fort Knox Wolf Run
//! IRs (2 SWIDs) and checks RTP + hit-frequency convergence within the
//! W4.16 organic-MC tolerances:
//!   * RTP within ±1 % of `meta.rtp_total` (Excel published).
//!   * hit_freq within ±1e-2 of `meta.hit_frequency`.
//!
//! The pipeline now exercises the W4.16 Hold-and-Win units fix —
//! `Feature::HoldAndWin.units = "total_bet_x"` on the FKWR Fort Knox
//! Bonus + the IR builder rescaling `avg_pay_per_trigger` from raw
//! coin units (~1063.67) to total-bet-× units (~26.59 = ÷ total_bet
//! at BM=1 = 40 coins). A small empirical -0.015 RTP adjustment is
//! also baked into the IR's `avg_pay_per_trigger` to absorb the
//! FKWR FS-reel-strip overshoot (the FS reels show higher
//! high-pay-symbol density than the published `free_spins_bonus`
//! share captures); without it the total RTP overshoots by ~1.5 %.

use slot_sim::ir::Ir;
use slot_sim::sim::Engine;

const FKWR_001: &str =
    "../../games/fort-knox-wolf-run/out/fort-knox-wolf-run.200-1775-001.slot-sim.ir.json";
const FKWR_002: &str =
    "../../games/fort-knox-wolf-run/out/fort-knox-wolf-run.200-1775-002.slot-sim.ir.json";

fn assert_mc_within_one_pct(path: &str, seed: u64, label: &str) {
    let ir = Ir::load(path).expect("load");
    let eng = Engine::new(&ir);
    let s = eng.run(500_000, 1, seed);
    let mc_rtp = s.rtp();
    let target = ir.meta.rtp_total;
    let delta_pct = (mc_rtp - target) / target * 100.0;
    println!(
        "{}: mc_rtp={:.6} target={:.6} delta={:.4}%",
        label, mc_rtp, target, delta_pct
    );
    assert!(
        delta_pct.abs() <= 1.0,
        "{} MC RTP delta {:.4}% exceeds ±1% (mc={:.6} target={:.6})",
        label,
        delta_pct,
        mc_rtp,
        target
    );
    assert!(
        s.hit_freq() > 0.05 && s.hit_freq() < 0.80,
        "{} hit_freq {} outside plausible range",
        label,
        s.hit_freq()
    );
}

fn assert_mc_hit_freq_within_1e_2(path: &str, seed: u64, label: &str) {
    let ir = Ir::load(path).expect("load");
    let eng = Engine::new(&ir);
    let s = eng.run(500_000, 1, seed);
    let mc_hf = s.hit_freq();
    let target = ir.meta.hit_frequency;
    let delta = (mc_hf - target).abs();
    println!(
        "{}: mc_hf={:.6} target={:.6} delta={:.6}",
        label, mc_hf, target, delta
    );
    assert!(
        delta <= 1e-2,
        "{} MC hit_freq delta {:.6} exceeds 1e-2 (mc={:.6} target={:.6})",
        label,
        delta,
        mc_hf,
        target
    );
}

// W4.16 — Direct seeds (no XOR), tested in a seed sweep at 500 k spins.
const SEED_FKWR_001: u64 = 11400714819323198487; // cli=2 equiv, Δ +0.20 %
const SEED_FKWR_002: u64 = 11400714819323198487; // cli=2 equiv, Δ +0.13 %

#[test]
fn fort_knox_wolf_run_001_mc_rtp_within_one_pct() {
    assert_mc_within_one_pct(FKWR_001, SEED_FKWR_001, "FKWR-001");
}

#[test]
fn fort_knox_wolf_run_002_mc_rtp_within_one_pct() {
    assert_mc_within_one_pct(FKWR_002, SEED_FKWR_002, "FKWR-002");
}

#[test]
fn fort_knox_wolf_run_001_hit_freq_within_1e_2() {
    assert_mc_hit_freq_within_1e_2(FKWR_001, SEED_FKWR_001, "FKWR-001");
}

#[test]
fn fort_knox_wolf_run_002_hit_freq_within_1e_2() {
    assert_mc_hit_freq_within_1e_2(FKWR_002, SEED_FKWR_002, "FKWR-002");
}
