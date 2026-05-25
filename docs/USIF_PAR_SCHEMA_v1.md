# USIF PAR Sheet Schema v1.0

> **Universal Slot Interchange Format — PAR Sheet open standard.**
> Closes Kimi K5 (deep-audit 2026-05-15). Published as part of the
> slot-math-engine-template project. Canonical schema lives at
> `schemas/usif-par-v1.0.json` (JSON Schema Draft 2020-12).

## Why this exists

From the Kimi 2026-05-15 deep audit:

> "Standard fields (RTP, hit-freq, max win, VI) are table stakes. Tier-1
> math directors want segment-level RTP (base vs free-spin), time-to-trigger
> CDF, P99.9 tail exposure, and multi-seed CI bands. Vendor A internal sheets
> use configurable RTP ranges per casino/jurisdiction — a feature your IR
> already supports but should document as a competitive differentiator."

Vendor PAR sheets are kept secret. Each lab (BMM, GLI, iTechLabs, eCOGRA,
Quinel, SGS Brightsight) has its own ingest format. Operators waste
weeks translating per-vendor PAR data into common dashboards.

USIF v1.0 is the **first published open standard** that:

1. Defines a baseline (REQUIRED) field set that satisfies GLI-19, UKGC
   RTS-7, MGA PPD §11.f, and eCOGRA Generic Slots Algorithm Audit out
   of the box.
2. Defines a Tier-1 (OPTIONAL) extra-credit field set that captures the
   data Tier-1 math directors privately demand: transition matrices for
   Markov features, P99.9 tail exposure, multi-seed CI bands, segment
   RTP, time-to-trigger CDFs, jurisdiction-gated RTP variants.
3. Ships with a validator (`scripts/usif-par-validate.mjs`) that runs in
   under a second and catches structural regressions in CI.

## Field tiers

### REQUIRED (regulator submission baseline)

| Path | Type | Notes |
|---|---|---|
| `schemaVersion` | const "1.0" | Pinned. |
| `generatedAt` | ISO-8601 date-time | Required for audit trail. |
| `game.name` | string | Display name. |
| `game.version` | string | Game/math version. |
| `game.layout` | string | e.g. `5x3`, `6x4`, `7x7`. |
| `game.paySystem` | enum | `lines` / `ways` / `cluster` / `pay-anywhere` / `pattern` / `scatter-pay`. Snake_case aliases accepted. |
| `game.targetRTP` | number | Target RTP. >1 = percent, ≤1 = fraction. |
| `simulation.spins` | integer ≥1 | Total simulated spins. |
| `simulation.seed` | int/string | RNG seed for reproducibility. |
| `simulation.engineVersion` | string | Free text: build SHA / version tag. |
| `results.observedRTP` | number ≥0 | Headline RTP. |
| `results.rtpPercent` | number ≥0 | Same as percent. |
| `results.hitRate` | number ∈ [0,1] | Probability of any non-zero win. |
| `compliance.standard` | string | `GLI-19 v3.0` / `GLI-16` / `UKGC RTS-7` / etc. |

### OPTIONAL (Tier-1 extra credit)

| Path | What it captures | Why Tier-1 wants it |
|---|---|---|
| `configHash` | SHA-256 of source IR | Cryptographic match deployment ↔ audited config (GLI-19 §3 "Golden Thread"). |
| `simulation.rngBackend` | enum | FIPS / GLI-19 RNG-source attestation. |
| `results.rtpBreakdown` | per-feature RTP fractions | Required by Tier-1 math directors; rarely required by regulators. |
| `volatility.vi95` / `vi99` | std-dev based VI | UKGC LCCP RTS 14F. |
| `volatility.p999` / `p9999` | upper tail quantiles | Max-win-cap pressure forecasting (Slot Game Design 2019). |
| `volatility.paretoTail` | EVT POT fit (α, x_m, KS p) | EVT projection for unobserved tail (Pickands; Coles 2001). |
| `features[].transitionMatrix` | discrete Markov chain transition probs | SolCalc 2018, Aarhus University — no commercial vendor publishes this. |
| `features[].timeToTriggerCdf` | array of {spinIndex, probability} | Operator player-experience modeling. |
| `ciBands.seedCount` + `seedRtps` + bands | multi-seed CI | Auditor proof a single MC run is representative (Harrigan & Dixon 2014). |
| `jurisdictionGated[X]` | per-jurisdiction RTP variants | Vendor A-style configurable RTP — enables single PAR for many markets. |

## Validator usage

```bash
# Baseline check (REQUIRED fields + types)
npm run usif-par-validate

# Strict Tier-1 (also requires extra-credit fields)
npm run usif-par-validate:strict
```

Output goes to `reports/usif-par/VALIDATION_REPORT.{json,md}`.

## Acceptance status (Wave 35)

* **Baseline mode**: 20/20 ✅ — every PAR sample shipped in `reports/par-samples/` validates against v1.0 schema.
* **Strict Tier-1 mode**: 0/20 — existing samples are pre-v1.0 and lack extra-credit fields. Closing this gap is a separate operator-initiated action that regenerates samples with the extra-credit pipeline (volatility quantiles, transition matrices, CI bands).

## References

- GLI-19 Interactive Gaming Systems v3.0 (2024) — `https://gaminglabs.com/wp-content/uploads/2024/06/GLI-19-Interactive-Gaming-Systems-v3.0.pdf`
- UKGC Testing Strategy for Compliance (2018, updated 2025)
- MGA Player Protection Directive §11.f
- Slot Game Design — PAR Sheet Tutorial (2019)
- Harrigan & Dixon — *PAR Sheets, Probabilities, and Slot Machine Play* (CDS Press 2014)
- Casinomeister — Vendor A configurable RTP ranges discussion (2012)
- SolCalc — Casino Math: Markov Chains for Slot Features (2018)
- Pickands — *Statistical inference using extreme order statistics* (1975)
- Coles — *An Introduction to Statistical Modeling of Extreme Values* (Springer 2001)

## Versioning policy

* `1.0.x` patch — typo / clarification, no schema change.
* `1.x` minor — additive only (new optional fields).
* `2.x` major — breaking change. Migration notes mandatory.

The validator's first action is `schemaVersion === "1.0"`. Future major
revisions will keep the v1.0 schema available for legacy consumers.
