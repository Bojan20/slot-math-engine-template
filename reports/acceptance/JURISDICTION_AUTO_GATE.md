# Jurisdiction Auto-Gate — Acceptance Report

> Closes **Kimi K8** (deep-audit 2026-05-15). Generated `2026-05-15T22:02:23.140Z`.

## Headline: 450 verdicts — 45.11% PASS / 38.89% WARN / 16.00% FAIL

## Per-Jurisdiction Aggregate

| Jurisdiction | PASS | WARN | FAIL |
|---|---:|---:|---:|
| UKGC | 0 | 29 | 1 |
| MGA | 30 | 0 | 0 |
| ADM | 29 | 0 | 1 |
| BMM | 30 | 0 | 0 |
| GLI19 | 30 | 0 | 0 |
| AGCO | 0 | 29 | 1 |
| DGA | 30 | 0 | 0 |
| NJDGE | 30 | 0 | 0 |
| ADM_VLT | 0 | 29 | 1 |
| NIGC_C2 | 24 | 0 | 6 |
| NV_SKILL | 0 | 0 | 30 |
| DGOJ | 0 | 30 | 0 |
| SPELINSPEKTIONEN | 0 | 29 | 1 |
| PGCB | 0 | 0 | 30 |
| NCPG | 0 | 29 | 1 |

## Top Rule-Failure Attribution

| Rule | Total fails | Top jurisdictions |
|---|---:|---|
| `near_miss_rule` | 60 | NV_SKILL(30), PGCB(30) |
| `prohibited_features` | 13 | NIGC_C2(6), UKGC(1), ADM(1), AGCO(1) |

## Compliance Matrix (compact)

Symbols: ✅ PASS · ⚠ WARN · ❌ FAIL · — N/A

| Fixture | UKGC | MGA | ADM | BMM | GLI19 | AGCO | DGA | NJDGE | ADM_VLT | NIGC_C2 | NV_SKILL | DGOJ | SPELINSPEKTIONEN | PGCB | NCPG |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `3x5-5lines.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `5x3-20lines.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `5x3-243ways.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `5x4-25lines.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `6x4-4096ways.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `cascade-drop.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `cascade-fixed-strip.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `cascade-refill.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `classic-3x3-lines.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `cluster-7x7.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `cluster-diagonal.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `cluster-hexagonal.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `complex-variable-rows.json` | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠ | ❌ | ❌ | ❌ |
| `expanding-wilds.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `fs-expanding-wilds.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `fs-multiplier-ladder.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `fs-retrigger.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `fs-sticky-wilds.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `hnw-classic.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `hnw-full-grid.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `hnw-grand-jackpot.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `multiplier-wilds.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `mystery-symbol.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `pay-anywhere.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `pick-bonus.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `respin-feature.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `symbol-upgrade.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `variable-rows-7reels.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `walking-wilds.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |
| `wheel-bonus.json` | ⚠ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ⚠ | ✅ | ❌ | ⚠ | ⚠ | ❌ | ⚠ |

## Methodology

Each cell = `evaluateCompliance(ir, jurisdiction)` from `src/jurisdiction/complianceGate.ts`.
Wave 36 added the **`checkNearMissRule`** check (Kimi K8: UKGC RTS-3, MGA PPD §11.f) — every
jurisdiction that declares `requiredNearMissRule` now blocks fixtures whose
`compliance.near_miss_rule` does not match.

Operator workflow: this matrix is the SINGLE-PAGE answer to "which markets
is this game ready for?" — green (✅) cells mean "submit"; warn (⚠) cells
mean "operator UI must enforce"; red (❌) cells mean "math/rules must change
before submission."