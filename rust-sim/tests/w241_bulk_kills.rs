//! W241 — `rust-sim/src/bulk/{parse,progress,checkpoint,dispatcher}.rs`
//! mutation kill tests.
//!
//! Public surface covered:
//!   - `parse_spin_count` — K/M/B/T suffix parsing with edge cases.
//!   - `ProgressSnapshot::fraction` — 0-protection + ratio math.
//!   - `BulkConfig::new` — defaults and derived field correctness.
//!   - `BulkCheckpoint` + `AtomicStatsSnapshot` — serde round-trip.
//!   - `snapshot_hdr_buckets` + `apply_hdr_buckets` — round-trip.
//!   - `save_checkpoint` + `load_checkpoint` — disk round-trip.

use slot_sim::bulk::checkpoint::{
    apply_hdr_buckets, load_checkpoint, save_checkpoint, snapshot_hdr_buckets,
    AtomicStatsSnapshot, BulkCheckpoint, CHECKPOINT_SCHEMA_VERSION,
};
use slot_sim::bulk::dispatcher::BulkConfig;
use slot_sim::bulk::parse::{parse_spin_count, ParseSpinCountError};
use slot_sim::bulk::progress::ProgressSnapshot;
use slot_sim::stats::{AtomicStats, HdrHistogram};
use std::time::Duration;

// ── parse_spin_count: integer/suffix/edge cases ──────────────────────────

#[test]
fn w241_bulk_parse_plain_integers_exact() {
    assert_eq!(parse_spin_count("0").unwrap(), 0);
    assert_eq!(parse_spin_count("1").unwrap(), 1);
    assert_eq!(parse_spin_count("999").unwrap(), 999);
    assert_eq!(parse_spin_count("1000").unwrap(), 1_000);
    assert_eq!(parse_spin_count("1234567").unwrap(), 1_234_567);
}

#[test]
fn w241_bulk_parse_underscore_separators_stripped() {
    assert_eq!(parse_spin_count("1_000").unwrap(), 1_000);
    assert_eq!(parse_spin_count("1_000_000").unwrap(), 1_000_000);
    assert_eq!(parse_spin_count("100_000_000_000").unwrap(), 100_000_000_000);
}

#[test]
fn w241_bulk_parse_k_m_b_t_suffix_exact() {
    assert_eq!(parse_spin_count("5K").unwrap(), 5_000);
    assert_eq!(parse_spin_count("5M").unwrap(), 5_000_000);
    assert_eq!(parse_spin_count("100B").unwrap(), 100_000_000_000);
    assert_eq!(parse_spin_count("1T").unwrap(), 1_000_000_000_000);
}

#[test]
fn w241_bulk_parse_case_insensitive_suffix() {
    // Lower-case must match the upper-case multipliers.
    assert_eq!(parse_spin_count("5k").unwrap(), 5_000);
    assert_eq!(parse_spin_count("5m").unwrap(), 5_000_000);
    assert_eq!(parse_spin_count("5b").unwrap(), 5_000_000_000);
}

#[test]
fn w241_bulk_parse_fractional_with_suffix() {
    // 1.5B = 1_500_000_000 exactly.
    assert_eq!(parse_spin_count("1.5B").unwrap(), 1_500_000_000);
    assert_eq!(parse_spin_count("2.5T").unwrap(), 2_500_000_000_000);
}

#[test]
fn w241_bulk_parse_empty_string_error() {
    assert!(matches!(parse_spin_count(""), Err(ParseSpinCountError::Empty)));
    assert!(matches!(parse_spin_count("  "), Err(ParseSpinCountError::Empty)));
}

#[test]
fn w241_bulk_parse_negative_error() {
    assert!(matches!(
        parse_spin_count("-5M"),
        Err(ParseSpinCountError::Negative)
    ));
}

#[test]
fn w241_bulk_parse_unknown_suffix_error() {
    match parse_spin_count("5X") {
        Err(ParseSpinCountError::UnknownSuffix(c)) => assert_eq!(c, 'X'),
        other => panic!("expected UnknownSuffix('X'), got {other:?}"),
    }
}

#[test]
fn w241_bulk_parse_invalid_number_error() {
    // Multiple decimals → InvalidNumber.
    match parse_spin_count("1.5.3B") {
        Err(ParseSpinCountError::InvalidNumber(_)) => {}
        other => panic!("expected InvalidNumber, got {other:?}"),
    }
}

#[test]
fn w241_bulk_parse_overflow_error() {
    // 99T overflows u64 (max ≈ 18.4 * 10^18 = 18T but 99T fits OK).
    // 1e20 definitely doesn't fit; use a value above u64::MAX/multiplier.
    let r = parse_spin_count("99999999999T"); // 99e21 ≫ u64::MAX
    assert!(matches!(r, Err(ParseSpinCountError::Overflow)));
}

#[test]
fn w241_bulk_parse_error_display_messages() {
    use std::fmt::Write as _;
    let e = ParseSpinCountError::Empty;
    let mut s = String::new();
    write!(s, "{}", e).unwrap();
    assert!(s.contains("empty"));

    let e = ParseSpinCountError::Overflow;
    let mut s = String::new();
    write!(s, "{}", e).unwrap();
    assert!(s.contains("overflow"));

    let e = ParseSpinCountError::UnknownSuffix('Q');
    let mut s = String::new();
    write!(s, "{}", e).unwrap();
    assert!(s.contains("Q"));
    assert!(s.contains("K/M/B/T"));
}

// ── ProgressSnapshot::fraction ───────────────────────────────────────────

#[test]
fn w241_bulk_progress_fraction_zero_total_returns_zero() {
    // total_spins=0 must short-circuit to 0.0 to avoid divide-by-zero.
    let snap = ProgressSnapshot {
        completed_spins: 10,
        total_spins: 0,
        elapsed: Duration::from_secs(1),
        spins_per_sec: 0.0,
        eta: None,
        chunk_index: 0,
        chunks_total: 0,
    };
    assert_eq!(snap.fraction(), 0.0);
}

#[test]
fn w241_bulk_progress_fraction_exact_math() {
    let snap = ProgressSnapshot {
        completed_spins: 250,
        total_spins: 1000,
        elapsed: Duration::from_secs(1),
        spins_per_sec: 0.0,
        eta: None,
        chunk_index: 0,
        chunks_total: 0,
    };
    assert_eq!(snap.fraction(), 0.25);
}

#[test]
fn w241_bulk_progress_fraction_full_completion_is_one() {
    let snap = ProgressSnapshot {
        completed_spins: 1000,
        total_spins: 1000,
        elapsed: Duration::from_secs(1),
        spins_per_sec: 0.0,
        eta: None,
        chunk_index: 0,
        chunks_total: 0,
    };
    assert_eq!(snap.fraction(), 1.0);
}

// ── BulkConfig::new defaults ─────────────────────────────────────────────

#[test]
fn w241_bulk_config_new_default_fields() {
    let cfg = BulkConfig::new(1_000_000_000, 12345);
    assert_eq!(cfg.total_spins, 1_000_000_000);
    assert_eq!(cfg.base_seed, 12345);
    assert_eq!(cfg.chunk_spins, 10_000_000, "default chunk_spins = 10M");
    assert_eq!(cfg.total_bet_mc, 1_000, "default total_bet_mc = 1000 mc");
    assert_eq!(cfg.checkpoint_every_chunks, 0, "default = no checkpoints");
    assert!(cfg.checkpoint_path.is_none());
    assert!(cfg.resume_path.is_none());
    assert!(cfg.run_id.starts_with("bulk-"));
    assert!(cfg.config_hash.is_empty());
    // spins_per_worker = chunk_spins / threads_per_chunk (integer div).
    // Reconstructed product is within one thread-worth of chunk_spins.
    let reconstructed = cfg.spins_per_worker * cfg.threads_per_chunk as u64;
    let drift = cfg.chunk_spins.saturating_sub(reconstructed);
    assert!(
        drift < cfg.threads_per_chunk as u64,
        "spins_per_worker × threads must be within one-thread of chunk_spins \
         (drift={drift}, threads={})",
        cfg.threads_per_chunk,
    );
    assert!(
        cfg.spins_per_worker > 0,
        "spins_per_worker must be positive",
    );
}

// ── AtomicStatsSnapshot serde round-trip ─────────────────────────────────

#[test]
fn w241_bulk_atomic_stats_snapshot_serde_round_trip() {
    let mut snap = AtomicStatsSnapshot::default();
    snap.total_spins = 1_000_000;
    snap.total_wagered = 1_000_000_000;
    snap.total_won = 960_000_000;
    snap.max_win = 50_000;
    snap.jackpots_grand = 3;
    let json = serde_json::to_string(&snap).unwrap();
    let back: AtomicStatsSnapshot = serde_json::from_str(&json).unwrap();
    assert_eq!(back, snap);
}

#[test]
fn w241_bulk_atomic_stats_snapshot_from_atomic() {
    let stats = AtomicStats::new();
    use std::sync::atomic::Ordering::Relaxed;
    stats.total_spins.fetch_add(500, Relaxed);
    stats.total_wagered.fetch_add(500_000, Relaxed);
    stats.total_won.fetch_add(450_000, Relaxed);
    let snap = AtomicStatsSnapshot::from_atomic(&stats);
    assert_eq!(snap.total_spins, 500);
    assert_eq!(snap.total_wagered, 500_000);
    assert_eq!(snap.total_won, 450_000);
}

#[test]
fn w241_bulk_atomic_stats_snapshot_apply_to() {
    let stats = AtomicStats::new();
    let mut snap = AtomicStatsSnapshot::default();
    snap.total_spins = 777;
    snap.total_wagered = 12_345;
    snap.max_win = 9_000;
    snap.apply_to(&stats);
    use std::sync::atomic::Ordering::Relaxed;
    assert_eq!(stats.total_spins.load(Relaxed), 777);
    assert_eq!(stats.total_wagered.load(Relaxed), 12_345);
    assert_eq!(stats.max_win.load(Relaxed), 9_000);
}

// ── HDR snapshot/apply round-trip ────────────────────────────────────────

#[test]
fn w241_bulk_hdr_snapshot_round_trip() {
    let hdr_a = HdrHistogram::default();
    hdr_a.record(100.0);
    hdr_a.record(200.0);
    hdr_a.record(1_000.0);
    let buckets = snapshot_hdr_buckets(&hdr_a);
    let hdr_b = HdrHistogram::default();
    apply_hdr_buckets(&hdr_b, &buckets);
    // The snapshot must round-trip — record-then-snapshot vs apply must
    // produce the same bucket distribution.
    let buckets2 = snapshot_hdr_buckets(&hdr_b);
    assert_eq!(buckets, buckets2);
}

// ── BulkCheckpoint disk round-trip ───────────────────────────────────────

#[test]
fn w241_bulk_checkpoint_disk_round_trip() {
    let tmp = std::env::temp_dir().join("w241-bulk-checkpoint.json");
    let _ = std::fs::remove_file(&tmp);

    let chk = BulkCheckpoint {
        schema_version: CHECKPOINT_SCHEMA_VERSION.into(),
        run_id: "run-42".into(),
        config_hash: "abc123".into(),
        total_spins_target: 1_000_000_000,
        completed_spins: 250_000_000,
        base_seed: 42,
        chunk_spins: 10_000_000,
        chunks_completed: 25,
        elapsed_ms: 30_000,
        started_at_epoch_ms: 1_700_000_000_000,
        last_checkpoint_epoch_ms: 1_700_000_030_000,
        stats: AtomicStatsSnapshot::default(),
        hdr_buckets: vec![10, 20, 30, 0, 0],
    };
    save_checkpoint(&tmp, &chk).unwrap();

    let loaded = load_checkpoint(&tmp).unwrap().expect("checkpoint must exist");
    assert_eq!(loaded.run_id, "run-42");
    assert_eq!(loaded.completed_spins, 250_000_000);
    assert_eq!(loaded.chunks_completed, 25);
    assert_eq!(loaded.config_hash, "abc123");
    assert_eq!(loaded.hdr_buckets, vec![10, 20, 30, 0, 0]);
    assert_eq!(loaded.schema_version, CHECKPOINT_SCHEMA_VERSION);

    let _ = std::fs::remove_file(&tmp);
}

#[test]
fn w241_bulk_checkpoint_load_missing_returns_none() {
    let tmp = std::env::temp_dir().join("w241-bulk-missing-checkpoint.json");
    let _ = std::fs::remove_file(&tmp);
    let r = load_checkpoint(&tmp).unwrap();
    assert!(r.is_none(), "missing checkpoint must return Ok(None), not error");
}

// ── ParseSpinCountError variants are distinct ────────────────────────────

#[test]
fn w241_bulk_parse_error_variants_distinct() {
    // Each variant produces a unique Display string — kills any `==` mutant
    // on the Display match that could collapse two variants.
    let variants = [
        ParseSpinCountError::Empty,
        ParseSpinCountError::InvalidNumber("x".into()),
        ParseSpinCountError::UnknownSuffix('Q'),
        ParseSpinCountError::Overflow,
        ParseSpinCountError::Negative,
    ];
    let strs: Vec<String> = variants.iter().map(|v| format!("{v}")).collect();
    for i in 0..strs.len() {
        for j in 0..strs.len() {
            if i == j {
                continue;
            }
            assert_ne!(strs[i], strs[j], "variants {i} and {j} produced same Display");
        }
    }
}
