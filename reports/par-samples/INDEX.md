# PAR Sample Set — Generic Mechanics

**Generated:** 2026-05-13T03:29:29.667Z  ·  **Engine:** `slot-math-engine-template`  ·  **Spins/sample:** 100,000  ·  **Seed:** `12345`  ·  **Wall-clock:** 225.3s

## Purpose

P0 #4 deliverable: 20 generic-mechanic PAR samples spanning the engine's full mechanic surface. **No game / vendor IP** is referenced anywhere; each sample is keyed by mechanic family, not by any commercial slot title.

The set is the "universal mechanics" claim made concrete — auditors can reproduce every row below by running `npm run par-samples` against the committed engine.

## Reproduction

```bash
npm run build
node scripts/par-samples-generate.mjs
# OR:
npm run par-samples
```

## Sample table

| # | ID | Family | Mechanic | Status | RTP | Hit rate | Features | Artefacts |
|---|----|--------|----------|--------|-----|----------|----------|-----------|
| 1 | `classic-3x3-lines` | Lines | `lines` | ✅ | 96.00% | 47.31% | 1 | [`json`](./classic-3x3-lines.par.json) · [`pdf`](./classic-3x3-lines.par.pdf) |
| 2 | `3x5-5lines` | Lines | `lines` | ✅ | 96.00% | 60.54% | 1 | [`json`](./3x5-5lines.par.json) · [`pdf`](./3x5-5lines.par.pdf) |
| 3 | `5x3-20lines` | Lines | `lines` | ✅ | 96.00% | 64.72% | 1 | [`json`](./5x3-20lines.par.json) · [`pdf`](./5x3-20lines.par.pdf) |
| 4 | `5x4-25lines` | Lines | `lines` | ✅ | 96.00% | 95.86% | 1 | [`json`](./5x4-25lines.par.json) · [`pdf`](./5x4-25lines.par.pdf) |
| 5 | `5x3-243ways` | Ways | `ways` | ✅ | 96.00% | 79.22% | 1 | [`json`](./5x3-243ways.par.json) · [`pdf`](./5x3-243ways.par.pdf) |
| 6 | `6x4-4096ways` | Ways | `ways` | ✅ | 96.02% | 89.77% | 2 | [`json`](./6x4-4096ways.par.json) · [`pdf`](./6x4-4096ways.par.pdf) |
| 7 | `cluster-7x7` | Cluster | `cluster` | ✅ | 96.00% | 99.29% | 1 | [`json`](./cluster-7x7.par.json) · [`pdf`](./cluster-7x7.par.pdf) |
| 8 | `cluster-diagonal` | Cluster | `cluster` | ✅ | 96.00% | 72.11% | 1 | [`json`](./cluster-diagonal.par.json) · [`pdf`](./cluster-diagonal.par.pdf) |
| 9 | `cluster-hexagonal` | Cluster | `cluster` | ✅ | 96.00% | 99.94% | 1 | [`json`](./cluster-hexagonal.par.json) · [`pdf`](./cluster-hexagonal.par.pdf) |
| 10 | `pay-anywhere` | Pay-Anywhere | `pay_anywhere` | ✅ | 96.00% | 100.00% | 1 | [`json`](./pay-anywhere.par.json) · [`pdf`](./pay-anywhere.par.pdf) |
| 11 | `variable-rows-7reels` | Variable-Rows | `variable_ways` | ✅ | 96.00% | 91.54% | 1 | [`json`](./variable-rows-7reels.par.json) · [`pdf`](./variable-rows-7reels.par.pdf) |
| 12 | `complex-variable-rows` | Variable-Rows | `variable_ways` | ✅ | 95.75% | 45.45% | 4 | [`json`](./complex-variable-rows.par.json) · [`pdf`](./complex-variable-rows.par.pdf) |
| 13 | `cascade-drop` | Cascade | `cascade` | ✅ | 96.00% | 88.44% | 1 | [`json`](./cascade-drop.par.json) · [`pdf`](./cascade-drop.par.pdf) |
| 14 | `cascade-fixed-strip` | Cascade | `cascade` | ✅ | 96.00% | 53.92% | 1 | [`json`](./cascade-fixed-strip.par.json) · [`pdf`](./cascade-fixed-strip.par.pdf) |
| 15 | `cascade-refill` | Cascade | `cascade` | ✅ | 96.00% | 84.88% | 1 | [`json`](./cascade-refill.par.json) · [`pdf`](./cascade-refill.par.pdf) |
| 16 | `fs-multiplier-ladder` | Free-Spins | `free_spins` | ✅ | 96.00% | 59.63% | 1 | [`json`](./fs-multiplier-ladder.par.json) · [`pdf`](./fs-multiplier-ladder.par.pdf) |
| 17 | `fs-sticky-wilds` | Free-Spins | `free_spins` | ✅ | 96.00% | 48.85% | 1 | [`json`](./fs-sticky-wilds.par.json) · [`pdf`](./fs-sticky-wilds.par.pdf) |
| 18 | `fs-retrigger` | Free-Spins | `free_spins` | ✅ | 96.00% | 59.65% | 1 | [`json`](./fs-retrigger.par.json) · [`pdf`](./fs-retrigger.par.pdf) |
| 19 | `fs-expanding-wilds` | Free-Spins | `free_spins` | ✅ | 96.00% | 59.63% | 1 | [`json`](./fs-expanding-wilds.par.json) · [`pdf`](./fs-expanding-wilds.par.pdf) |
| 20 | `hnw-classic` | Hold-and-Win | `hold_and_win` | ✅ | 96.10% | 45.47% | 1 | [`json`](./hnw-classic.par.json) · [`pdf`](./hnw-classic.par.pdf) |

## Notes

- **RTP / hit-rate values** are MC estimates at 100,000 spins; CI95 ≈ ±0.62% is documented in each PAR PDF.
- **Determinism:** seed = `12345` for every sample. Rerunning against the same engine commit reproduces byte-identical PAR JSON.
- **Feature counts** reflect features whose `rtpBreakdown` contribution is non-zero in this sample run. A `0` does NOT mean the IR lacks the feature — only that the sample run did not trigger it. For exact feature-trigger frequencies, see the per-ID JSON.

## Additional fixtures available (not in baseline set)

The following fixtures cover sibling mechanic variants already represented above. They are committed under `tests/fixtures/reference/` and can be added to the sample set by appending an entry to `SAMPLES` in `scripts/par-samples-generate.mjs`:

- `expanding-wilds`
- `hnw-full-grid`
- `hnw-grand-jackpot`
- `multiplier-wilds`
- `mystery-symbol`
- `pick-bonus`
- `respin-feature`
- `symbol-upgrade`
- `walking-wilds`
- `wheel-bonus`

## Cross-reference

- `docs/compliance.md` — submission-kit item #10 ("`reports/math/par.pdf` — Generated PAR sheet").
- `SLOT_ENGINE_MASTER_TODO.md` — P0 plug-list item #4 ("PAR sheet sakupljanje za 20 reference igara").
- `tests/faza12_reference.test.ts` — same fixture set, used as RTP-bounds smoke tests.
