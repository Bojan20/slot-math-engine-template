# PAR Commitment v1.0 — Acceptance Report

> Closes **Kimi K9** (deep-audit 2026-05-15). Generated `2026-05-29T15:15:53.939Z`.
> 30 fixtures × 6 gates = 180 cells

## Headline: **180/180 cells PASS** ✅

## Gates
- **g1** — attestation builds without error
- **g2** — integrity check (canonical hash matches recomputed)
- **g3** — auditor PASS on identical IR + matching RTP
- **g4** — auditor FAIL on tampered IR (root mismatch)
- **g5** — auditor FAIL on RTP drift > 0.5pp tolerance
- **g6** — HSM signing produces non-empty signature

## Per-Fixture

| Fixture | g1 | g2 | g3 | g4 | g5 | g6 | Merkle root |
|---|---|---|---|---|---|---|---|
| `3x5-5lines.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `8fe2580f5150dbe7…` |
| `5x3-20lines.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `d53245b0637bd368…` |
| `5x3-243ways.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `9e0e3f22fe2403b0…` |
| `5x4-25lines.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `c391005617ca8eb0…` |
| `6x4-4096ways.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `dbff6e06587f9603…` |
| `cascade-drop.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `0efcef40ea61e459…` |
| `cascade-fixed-strip.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `fbfe5855600b7054…` |
| `cascade-refill.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `4ff22802520e4936…` |
| `classic-3x3-lines.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `8513fe3b22cdc0f6…` |
| `cluster-7x7.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `0bd78b224696c616…` |
| `cluster-diagonal.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `b26317ec16be5da7…` |
| `cluster-hexagonal.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `6333894a373449df…` |
| `complex-variable-rows.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `88a0af46e66b6ab4…` |
| `expanding-wilds.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `661ebf9b3eebca7a…` |
| `fs-expanding-wilds.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `a5ec99fa4b84111c…` |
| `fs-multiplier-ladder.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `ce9f5193ea995c62…` |
| `fs-retrigger.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `89e7241c98963d04…` |
| `fs-sticky-wilds.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `34ccf437dd9790d0…` |
| `hnw-classic.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `71d0ac9d62dc9fc1…` |
| `hnw-full-grid.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `e4d1a2bc39a53173…` |
| `hnw-grand-jackpot.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `ec29fd551a6238e1…` |
| `multiplier-wilds.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `cfe222b84aa0c9e6…` |
| `mystery-symbol.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `ee138c6fcb4d2fa8…` |
| `pay-anywhere.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `b50c06ed1ef523ca…` |
| `pick-bonus.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `e5e989c53816d15f…` |
| `respin-feature.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `95714461ee9a61a0…` |
| `symbol-upgrade.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `0dbf9b229c723a63…` |
| `variable-rows-7reels.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `94ce0ab1cfd3d3e1…` |
| `walking-wilds.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `feb3b4522070641f…` |
| `wheel-bonus.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `a69f8813ad145de6…` |

## Industry-first

No commercial slot vendor publishes per-game cryptographic commitments
over their reel strips + paytable. This module + acceptance proof
makes it a Wave-40 reproducible primitive in the engine.