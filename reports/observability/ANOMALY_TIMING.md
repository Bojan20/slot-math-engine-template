# Anomaly Detection End-to-End Timing Report

> **W152 Wave 21 — Faza 11.7 acceptance proof.** Generated 2026-05-15T03:57:17.446Z.

**Headline:** ✅ PASS — overall p99 latency 0.02 ms vs 60000 ms bound.

## Per-anomaly latency

| Anomaly | Runs | Detected | Detection rate | p50 ms | p95 ms | p99 ms | Pass |
|---|---:|---:|---:|---:|---:|---:|:---:|
| rtp_drift | 30 | 30 | 100.0% | 0.00 | 0.02 | 0.02 | ✅ |
| dry_spell | 30 | 30 | 100.0% | 0.00 | 0.00 | 0.01 | ✅ |
| win_outlier | 30 | 30 | 100.0% | 0.00 | 0.00 | 0.01 | ✅ |

## Methodology

- **Runs per anomaly**: 30, 500 spins each.
- **Anomaly types**: RTP drift (rtp shifts mid-stream), dry spell (200 zero-payout consecutive spins), win outlier (single 1500× bet payout).
- **Detection**: dashboard.snapshot.alertsFired non-empty after recording each spin.
- **Pass**: p99 wall-clock latency ≤ 60 000 ms across all anomaly types.
- **Determinism**: synthetic streams use fixed-seed LCGs; latency is real wall-clock and varies per machine.
