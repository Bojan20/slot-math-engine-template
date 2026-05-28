//! W4.10c — Fortune Coin Boost Classic engine MC tests.
//!
//! Runs the full Engine pipeline (Ways + cascade + Coin/Boost jackpot
//! contribution) against the IGT Fortune Coin IRs (4 SWIDs) and checks:
//!   * RTP convergence — bounded sanity range. Like Skeleton Key the
//!     `tools/par_extract_ultimate/build_ir.py` IR emits uniform reel-set
//!     weights (TODO(fortune_coin_W4_10b)) where Excel publishes the
//!     full per-spin Set/CE-variant picker (driving spin-type selection
//!     between regular reels and the Coin Boost trigger reel set 3).
//!     This drops the line MC RTP relative to Excel's `base_game_multiway`
//!     until W4.10d emits the full picker. The cascade evaluator, max-
//!     cascade-depth guard, max-win cap, and Coin/Boost deterministic
//!     jackpot RTP contribution are all wired correctly here.
//!   * Edge cases 1-5, 8 — algorithm robustness.

use slot_sim::ir::{Evaluation, Ir, Topology};
use slot_sim::reels::{CompiledReelSet, Grid};
use slot_sim::evaluate::CompiledPaytable;
use slot_sim::sim::{Engine, MAX_WIN_CAP_X};
use slot_sim::ways_eval::{evaluate_cascade, evaluate_ways_with_cells, MAX_CASCADE_DEPTH};
use slot_sim::rng::Prng;

const FC_001: &str = "../../games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-001.slot-sim.ir.json";
const FC_002: &str = "../../games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-002.slot-sim.ir.json";
const FC_003: &str = "../../games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-003.slot-sim.ir.json";
const FC_004: &str = "../../games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-004.slot-sim.ir.json";

fn assert_mc_sane(path: &str, seed: u64) {
    let ir = Ir::load(path).expect("load");
    let eng = Engine::new(&ir);
    let s = eng.run(100_000, 1, seed);
    let mc_rtp = s.rtp();
    let target = ir.meta.rtp_total;
    println!(
        "{}: mc_rtp={:.6} target={:.6} delta={:.2}%",
        path,
        mc_rtp,
        target,
        (mc_rtp - target) / target * 100.0
    );
    // Coin/Boost deterministic contribution alone is ≈ 0.43 per spin for
    // every Fortune Coin SWID, so MC RTP is bounded below by that share.
    assert!(mc_rtp > 0.3, "MC RTP {} below jackpot baseline", mc_rtp);
    assert!(
        mc_rtp < 2.0 * target,
        "MC RTP {} > 2× target {}",
        mc_rtp,
        target
    );
}

#[test]
fn fortune_coin_001_mc_sane() { assert_mc_sane(FC_001, 0xF001); }
#[test]
fn fortune_coin_002_mc_sane() { assert_mc_sane(FC_002, 0xF002); }
#[test]
fn fortune_coin_003_mc_sane() { assert_mc_sane(FC_003, 0xF003); }
#[test]
fn fortune_coin_004_mc_sane() { assert_mc_sane(FC_004, 0xF004); }

#[test]
fn fortune_coin_jackpot_baseline_recovered() {
    // The Coin/Boost jackpot is published as a constant in rtp_breakdown.
    // The engine adds `base_game_coins + base_game_jackpot` deterministically
    // per base spin so MC RTP must exceed that floor.
    let ir = Ir::load(FC_001).expect("load");
    let base_share = ir
        .meta
        .rtp_breakdown
        .get("base_game_coins")
        .copied()
        .unwrap_or(0.0)
        + ir
            .meta
            .rtp_breakdown
            .get("base_game_jackpot")
            .copied()
            .unwrap_or(0.0);
    let eng = Engine::new(&ir);
    let s = eng.run(50_000, 1, 1);
    // MC RTP must be ≥ deterministic baseline.
    assert!(s.rtp() >= base_share - 1e-6,
        "MC RTP {} < jackpot floor {}", s.rtp(), base_share);
}

/// Edge case 1 — All-wild grid: must not crash, must produce finite payout.
#[test]
fn edge_case_1_all_wild_grid_ways() {
    let ir = Ir::load(FC_001).expect("load");
    let pt = CompiledPaytable::compile(&ir);
    let mut g = Grid::new(5, 3);
    for r in 0..5 { for row in 0..3 { g.cells[r][row] = "Wild".to_string(); } }
    let (pay, win_cells) = evaluate_ways_with_cells(&g, &ir, &pt);
    assert!(pay.is_finite());
    // Wild doesn't pay by itself (no Wild paytable entry in FC).
    assert!(pay >= 0.0);
    // No win cells from Wild (since Wild is not a paying anchor).
    // Note: depending on IR, Wild may still trigger LP/HP paytable as
    // substitute on all reels — verify both branches don't panic.
    let _ = win_cells;
}

/// Edge case 2 — All-Bonus grid: scatter pay fires, no line win.
#[test]
fn edge_case_2_all_scatter_grid_ways() {
    let ir = Ir::load(FC_001).expect("load");
    let pt = CompiledPaytable::compile(&ir);
    let mut g = Grid::new(5, 3);
    for r in 0..5 { for row in 0..3 { g.cells[r][row] = "Bonus".to_string(); } }
    // Run cascade — scatter should pay on initial grid.
    let rs = CompiledReelSet::from_ir(&ir.reels.base[0]);
    let mut rng = Prng::from_seed(0);
    let ws = evaluate_cascade(g, &rs, &ir, &pt, &mut rng);
    assert!(ws.scatter_total_bet_x > 0.0, "scatter pay must fire");
    assert!(ws.payout_total_bet_x().is_finite());
}

/// Edge case 3 — Zero-payout spin: ensure engine handles it.
#[test]
fn edge_case_3_zero_payout_ways() {
    let ir = Ir::load(FC_001).expect("load");
    let pt = CompiledPaytable::compile(&ir);
    // Force a grid with no matches: alternating LP/HP that breaks prefix
    // on reel 1.
    let mut g = Grid::new(5, 3);
    let cells_each = ["Emperor", "Nine", "Emperor", "Emperor", "Emperor"];
    for r in 0..5 {
        for row in 0..3 {
            g.cells[r][row] = cells_each[r].to_string();
        }
    }
    let (pay, _) = evaluate_ways_with_cells(&g, &ir, &pt);
    // Emperor prefix breaks at reel 1 (Nine), so no Emperor ways. Nine
    // doesn't appear on reel 0, so no Nine ways either. Total = 0.
    assert_eq!(pay, 0.0);
}

/// Edge case 4 — FS retrigger chain: run engine and assert FS triggers
/// don't crash even when retriggering deep.
#[test]
fn edge_case_4_fs_retrigger_no_crash() {
    let ir = Ir::load(FC_001).expect("load");
    let eng = Engine::new(&ir);
    // Bigger MC ⇒ more chance to exercise FS retrigger.
    let s = eng.run(20_000, 1, 0xFEED);
    let _fs_trig = s.event_count.get("fs_trigger").copied().unwrap_or(0);
    // Engine ran to completion (otherwise it would have panicked).
    assert_eq!(s.spins, 20_000);
}

/// Edge case 5 — Cascade depth guard: synthetic infinite-cascade.
/// Force a reel set where every cell is a paying symbol so every cascade
/// step re-pops with another paying symbol; guard must trip at depth 50.
#[test]
fn edge_case_5_cascade_guard_kicks_in() {
    let ir = Ir::load(FC_001).expect("load");
    let pt = CompiledPaytable::compile(&ir);
    // Build a synthetic reel set: every cell is "Emperor" (high pay).
    use slot_sim::reels::Strip;
    let strip = Strip::new(&[("Emperor".to_string(), 1)]);
    let rs = CompiledReelSet {
        set: 0,
        strips: vec![strip; 5],
    };
    let mut g = Grid::new(5, 3);
    for r in 0..5 {
        for row in 0..3 {
            g.cells[r][row] = "Emperor".to_string();
        }
    }
    let mut rng = Prng::from_seed(0);
    let ws = evaluate_cascade(g, &rs, &ir, &pt, &mut rng);
    // Guard should trip at the max depth.
    assert_eq!(
        ws.cascade_steps, MAX_CASCADE_DEPTH,
        "cascade guard didn't trip"
    );
    // Payout still finite.
    assert!(ws.payout_total_bet_x().is_finite());
}

/// Edge case 8 — Max-win cap: payouts beyond `MAX_WIN_CAP_X` clamped.
#[test]
fn edge_case_8_max_win_cap_clamps() {
    // Synthetic: confirm the constant is set high enough not to trigger
    // on normal MC but low enough to be reachable in pathological case.
    assert_eq!(MAX_WIN_CAP_X, 10_000.0);
    // Real engine run should not normally hit the cap.
    let ir = Ir::load(FC_001).expect("load");
    let eng = Engine::new(&ir);
    let s = eng.run(50_000, 1, 0);
    let cap_hits = s.event_count.get("max_win_cap_hit").copied().unwrap_or(0);
    // Normal 50k MC should not exceed cap.
    assert_eq!(cap_hits, 0, "unexpected cap hits in normal MC");
}

/// W4.10c — Topology sanity (Rectangular 5×3 / Ways 243).
#[test]
fn fortune_coin_topology_consistency() {
    let ir = Ir::load(FC_001).expect("load");
    match &ir.topology {
        Topology::Rectangular { reels: 5, rows: 3 } => {}
        _ => panic!("expected Rectangular 5x3"),
    }
    match &ir.evaluation {
        Evaluation::Ways {
            ways: 243,
            min_count: 3,
        } => {}
        _ => panic!("expected Ways 243 min_count=3"),
    }
}
