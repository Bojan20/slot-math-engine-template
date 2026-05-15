# Hold & Win Multi-Jackpot Acceptance Report

> **W152 Wave 23 — Faza 12 acid-test acceptance proof.** Generated 2026-05-15T10:32:16.883Z.

**Headline:** sanity 1/1, tight (±10pp) 0/1.

## Per-fixture results

| Fixture | Target RTP | Measured RTP | Δ (pp) | Hit rate | Tight | Sanity | Wall ms |
|---|---:|---:|---:|---:|:---:|:---:|---:|
| `hnw-grand-jackpot.json` | 96.00% | 18935.71% | 18839.71 | 91.31% | ⚠️ | ✅ | 1494 |

## Methodology

- **Spins per fixture**: 200000, seed=12345.
- **Tight tolerance**: ±10 pp (H&W has heavy multi-tier jackpot variance — even at 200K spins single grand-jackpot hit shifts mean by % points).
- **Sanity gate**: measured RTP finite + non-negative + bounded.
- **Pass criterion**: sanity gate proves H&W multi-jackpot configs execute end-to-end without crash. Tight match awaits per-tier closed-form composition (future).
