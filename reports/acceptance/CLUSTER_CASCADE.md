# Cluster Cascade + Multiplier MC Validation Report

> **W152 Wave 23 — Faza 12 acid-test acceptance proof.** Generated 2026-05-15T10:34:10.502Z.

**Headline:** sanity 1/1, tight (±5pp vs target) 0/1.

## Per-fixture results

| Fixture | Target RTP | Mean RTP (4 seeds) | σ | Δ vs target | Tight | Sanity |
|---|---:|---:|---:|---:|:---:|:---:|
| `cluster-7x7.json` | 96.00% | 2825.092% | 2.674% | 2729.092 | ⚠️ | ✅ |

## Methodology

- **Spins per seed**: 200000, 4 seeds (12345, 67890, 11111, 99999) → 800000 total per fixture.
- **Cluster RTP is not analytically tractable** (flood-fill + grid topology dependent) — we use cross-seed mean stability + target match as proxy.
- **Tight gate**: |mean − target| ≤ 5 pp.
- **Sanity gate**: every seed completes without engine error.
- **Why ±5pp not ±0.001%**: cluster mechanics have heavy tail variance (cascade chains compound multipliers); 200K × 4 = 800K spins still carries ~0.5pp σ for high-volatility clusters.
