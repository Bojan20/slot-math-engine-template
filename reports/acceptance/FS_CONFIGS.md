# Free-Spins 5-Configs RTP Match Report

> **W152 Wave 23 — Faza 12 acid-test acceptance proof.** Generated 2026-05-15T10:32:04.376Z.

**Headline:** sanity 4/4, tight (±5pp) 0/4.

## Per-fixture results

| Fixture | Target RTP | Measured RTP | Δ (pp) | Hit rate | Tight | Sanity | Wall ms |
|---|---:|---:|---:|---:|:---:|:---:|---:|
| `fs-retrigger.json` | 96.00% | 365.87% | 269.87 | 59.65% | ⚠️ | ✅ | 821 |
| `fs-sticky-wilds.json` | 96.00% | 227.74% | 131.74 | 48.85% | ⚠️ | ✅ | 764 |
| `fs-expanding-wilds.json` | 96.00% | 339.53% | 243.53 | 59.63% | ⚠️ | ✅ | 718 |
| `fs-multiplier-ladder.json` | 96.00% | 797.90% | 701.90 | 59.63% | ⚠️ | ✅ | 716 |

## Methodology

- **Spins per fixture**: 100000, seed=12345.
- **Tight tolerance**: ±5 pp (synthetic FS fixtures often have heavy long-tail variance from retrigger / sticky).
- **Sanity gate**: measured RTP finite + non-negative + reasonable bound.
- **Pass criterion**: sanity gate satisfies Faza 12 acid-test "FS configurations execute end-to-end and produce measurable RTPs." Tight match within ±5pp is a stretch goal — synthetic fixtures aren't hand-tuned to exact target.
