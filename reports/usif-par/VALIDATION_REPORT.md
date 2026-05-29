# USIF PAR v1.0 — Validation Report

> Closes **Kimi K5** (Open PAR sheet schema). Generated `2026-05-29T15:13:46.893Z`.
> Mode: `baseline` · Schema: `schemas/usif-par-v1.0.json`

## Headline: **20/20 samples valid** ✅

## Per-Sample

| Sample | Valid | Errors |
|---|---|---|
| `3x5-5lines.par.json` | ✅ | – |
| `5x3-20lines.par.json` | ✅ | – |
| `5x3-243ways.par.json` | ✅ | – |
| `5x4-25lines.par.json` | ✅ | – |
| `6x4-4096ways.par.json` | ✅ | – |
| `cascade-drop.par.json` | ✅ | – |
| `cascade-fixed-strip.par.json` | ✅ | – |
| `cascade-refill.par.json` | ✅ | – |
| `classic-3x3-lines.par.json` | ✅ | – |
| `cluster-7x7.par.json` | ✅ | – |
| `cluster-diagonal.par.json` | ✅ | – |
| `cluster-hexagonal.par.json` | ✅ | – |
| `complex-variable-rows.par.json` | ✅ | – |
| `fs-expanding-wilds.par.json` | ✅ | – |
| `fs-multiplier-ladder.par.json` | ✅ | – |
| `fs-retrigger.par.json` | ✅ | – |
| `fs-sticky-wilds.par.json` | ✅ | – |
| `hnw-classic.par.json` | ✅ | – |
| `pay-anywhere.par.json` | ✅ | – |
| `variable-rows-7reels.par.json` | ✅ | – |
## What this proves

Every PAR sample currently shipped in `reports/par-samples/` validates
against the formal USIF v1.0 JSON Schema. Operators / labs can now
consume our PAR output by name without per-vendor field translation.

In `--strict-tier1` mode, additional extra-credit fields are required:
- `volatility.vi95`
- `volatility.p999`
- `features[].transitionMatrix`
- `ciBands.seedCount`
- `simulation.rngBackend`

Tier-1 strict mode currently fails on the existing samples because
they were generated before the v1.0 schema landed; that gap is the
next operator-initiated regenerate-with-extra-credit step.