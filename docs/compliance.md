# Compliance

**Status:** Draft v0.1 — Faza 0.2 / 0.3 deliverable
**Scope:** What each major standard requires, where the engine
satisfies it today, and what is still TODO before a jurisdiction
submission.

This document is **not legal advice** and **not a substitute for a
GLI-accredited lab review**. It is the engineering checklist that
gets a math package ready for that review.

---

## Why a compliance doc lives in the repo

Regulators audit the same artefact the dev team ships. A check that
"the test suite passes BigCrush" without a stored report is unverifiable
in a submission. This doc enumerates **which artefact in this repo
maps to which standard clause** so the audit kit assembles in minutes,
not days.

---

## GLI-11 — Online Casino Gaming Systems

| Clause area              | Requirement (paraphrased)                                              | Engine status                                          | Owner                                |
|--------------------------|-------------------------------------------------------------------------|--------------------------------------------------------|--------------------------------------|
| 4.1 RNG quality          | Pass BigCrush / NIST / PractRand                                        | ⚠️ `pcg64` passes; report not stored                   | `src/rng/`, `rust-sim/src/rng.rs`    |
| 4.2 RNG seeding          | Unpredictable, entropy-source-backed                                    | ⚠️ ChaCha20 stream + QRNG bridge available; default seed not entropy-bound | `src/crypto/`, `src/qrng/`           |
| 4.3 RNG separation       | Game RNG ≠ shuffle RNG ≠ jackpot RNG                                    | ✅ split protocol via `RngBackend::split(nonce)`      | `docs/rng.md`                        |
| 5.x RTP declaration      | Theoretical RTP matches measured ±0.05% on 10⁹                          | ✅ math computed, ⚠️ not certified by lab              | `src/calculator/`, `rust-sim/src/par.rs` |
| 6.x Game integrity       | Outcome cannot be altered post-determination                            | ✅ commit-reveal + audit chain                         | `src/crypto/`, `src/recall/`         |
| 7.x Audit trail          | Every spin recoverable for ≥ 90 days                                    | ✅ append-only hash-chain journal                      | `src/recall/`, `docs/RECALL_SPEC.md` |
| 8.x Dispute resolution   | Reproducible spin replay from journal                                   | ✅ replay tested by KAT                                | `tests/recall.test.ts`, `recall_kat.rs` |
| 9.x Cryptographic        | Signing of certified artefacts (GAT-IV)                                 | ⚠️ adapter scaffolded; signing key handling TBD       | `src/protocols/gativ.ts`             |
| 10.x Currency math       | No accumulated rounding error in totals                                 | ✅ Decimal end-to-end on totals path                   | `docs/precision.md`                  |
| 11.x Responsible gaming  | Self-exclusion, session/time/loss limits                                | ✅ hooks present (Faza 11.8)                          | `src/rg/`                            |
| 12.x Anti-fraud          | Velocity / win-pattern flagging                                          | ✅ heuristics present (Faza 13.3)                     | `src/fraud/`                         |

**Gaps before GLI-11 submission:**

1. Stored TestU01 BigCrush + NIST + PractRand reports for each shipped
   RNG backend (P0 plug #3).
2. Entropy-source binding for the default seed path (HSM bridge or
   QRNG bridge committed as default for live).
3. GAT-IV signing key handoff procedure documented.

---

## GLI-19 — Interactive Gaming (covers slot math + RNG + system)

| Clause area              | Requirement                                                            | Engine status                                          | Owner                                  |
|--------------------------|-------------------------------------------------------------------------|--------------------------------------------------------|----------------------------------------|
| 2.x Game cycle           | Determinism: same seed ⇒ same outcome                                  | ✅ enforced by parity CI gate                         | `.github/workflows/ci.yml`              |
| 3.x Fair-play disclosure | Declared RTP, max-win, hit-frequency in player-facing info             | ⚠️ engine emits PAR JSON; player-facing UI not in repo | `src/report/parGenerator.ts`            |
| 4.x Bonus integrity      | Bonus rounds use same RNG family, with declared modification           | ✅ feature-mode RNG split documented                   | `docs/rng.md`                           |
| 5.x State recovery       | Crash mid-spin must not lose / duplicate currency                       | ✅ two-phase commit + journal                          | `src/jackpot/twoPhaseCommit.ts`         |
| 6.x Game freezing        | Frozen state allows operator inspection without altering outcome        | ⚠️ recall reads safe; pause-spin API not implemented   | `src/recall/`                           |
| 7.x Jurisdictional config| Single math, multiple jurisdiction overlays                            | ⚠️ jurisdiction adapter scaffolded (Faza 11.9)         | `src/jurisdiction/`                     |
| 8.x Logging              | Per-spin log retained ≥ 90 days, queryable                              | ✅ journal stream + replay viewer                      | `src/recall/`, `src/cli/spinReplayCli.ts` |

**Gaps before GLI-19 submission:**

1. Pause / inspect-without-mutate API on the recall stream.
2. Per-jurisdiction config validator wired end-to-end (Faza 11.9).

---

## ISO/IEC 17025 / IEC 27001 — Adjacent standards

| Standard       | Relevance                                                       | Engine artefact                                       |
|----------------|-----------------------------------------------------------------|-------------------------------------------------------|
| ISO 17025      | Lab calibration of test equipment used for RNG quality tests     | Out of scope for repo; lab provides their cert         |
| IEC 27001      | Operator infosec management; affects how RNG entropy is sourced  | Engine documents what it consumes — operator integrates|

---

## Per-jurisdiction overlay (P0 plug #10 wires this up)

| Jurisdiction          | Authority         | Notable extra rules over GLI-11/19                                  | Engine knob                                |
|-----------------------|-------------------|----------------------------------------------------------------------|--------------------------------------------|
| United Kingdom        | UKGC              | HSM-backed RNG mandatory for live; player-protection (GAMSTOP) — bridge in `src/crypto/hsm.ts` (`MockHSMProvider` ⚠️, real PKCS#11 driver TBD) | `jurisdiction/uk.ts`, `src/crypto/hsm.ts` |
| Malta                 | MGA               | HSM-backed RNG; quarterly audit reports — bridge in `src/crypto/hsm.ts` (`MockHSMProvider` ⚠️, real PKCS#11 driver TBD) | `jurisdiction/mt.ts`, `src/crypto/hsm.ts` |
| Germany               | GGL (formerly DSWV)| Bet caps, 1-spin/sec floor, deposit cap, mandatory tax integration; HSM-backed RNG via `src/crypto/hsm.ts` (`MockHSMProvider` ⚠️, real PKCS#11 driver TBD) | `jurisdiction/de.ts`, `src/crypto/hsm.ts` |
| Sweden                | Spelinspektionen  | Real-name binding; bonus restrictions                                 | `jurisdiction/se.ts`                       |
| Italy                 | ADM               | Centralized concession reporting; bet/cycle caps                      | `jurisdiction/it.ts`                       |
| Spain                 | DGOJ              | Player-protection register integration                                | `jurisdiction/es.ts`                       |
| Netherlands           | KSA               | CRUKS self-exclusion DB                                               | `jurisdiction/nl.ts`                       |
| Ontario               | iGO / AGCO        | Provincial integration                                                | `jurisdiction/on.ts`                       |
| New Jersey            | NJ DGE            | Geo-IP enforcement; CCC reporting                                     | `jurisdiction/nj.ts`                       |
| Michigan              | MGCB              | Tribal compact rules                                                  | `jurisdiction/mi.ts`                       |
| Pennsylvania          | PGCB              | Demo-mode restrictions                                                | `jurisdiction/pa.ts`                       |
| Brazil (post-2024)    | SPA-MF            | New federal regime; locale + tax overlays                             | `jurisdiction/br.ts`                       |
| Tribal (US Class III) | NIGC              | Bingo-style payouts may be required for Class II — different math    | `jurisdiction/tribal.ts`                   |

Adapter scaffolds exist (Faza 11.9 PARTIAL); per-jurisdiction
configuration tests are the next deliverable.

---

## Submission kit — what the audit zip contains

When a math package is sent to a GLI-accredited lab:

1. `docs/IR_SPEC.md` — IR schema definition.
2. `docs/architecture.md` — engine architecture overview.
3. `docs/rng.md` — RNG spec, backend table, splitting protocol.
4. `docs/precision.md` — numeric-domain contract.
5. `docs/RECALL_SPEC.md` — audit-chain specification.
6. `docs/MATH_QUICK_REFERENCE.md` — RTP / hit-freq / variance formulas.
7. `docs/compliance.md` — this document.
8. `reports/rng/bigcrush.txt` — TestU01 BigCrush report ⚠️ TODO.
9. `reports/rng/nist.json` — NIST 800-22 report ⚠️ TODO.
10. `reports/rng/practrand.txt` — PractRand 2³⁸+ byte report ⚠️ TODO.
11. `reports/par-samples/<id>.par.{json,pdf}` — Generated PAR sheets ✅
    (20 generic-mechanic samples per `reports/par-samples/INDEX.md`).
    Reproducible via `npm run par-samples`. PDF renderer landed P0 #6.
12. `reports/math/rtp-distribution.json` — 10⁹ spin RTP distribution.
13. `reports/math/mutation-score.json` — Stryker + cargo-mutants summary
    ≥ 95% (P0 #8).
14. `IR/<game-id>.usif.json` — The game's IR document.
15. `IR/<game-id>.usif.sig` — GAT-IV signature over the IR ⚠️ TODO.

The CI job `audit-kit` (TODO) assembles items 1–14 into a single zip
on every release tag.

---

## P0 compliance gaps (cross-ref P0 plug list in MASTER_TODO)

The compliance gaps map 1:1 to entries in the engineering P0 list:

| P0 plug item                                   | Compliance impact                                  |
|------------------------------------------------|----------------------------------------------------|
| #1 Windows-x64 CI grana                        | Cross-platform determinism evidence                |
| #3 ⚠️ TestU01 / NIST / PractRand reports        | Engine harness DONE (`rust-sim/src/bin/rng_cert.rs` — 8-test NIST SP 800-22 subset; all 4 backends pass 32/32 at 16 MiB). External BigCrush / PractRand / NIST STS captures pending CI run (workflow `.github/workflows/rng-cert.yml`). |
| #4 ✅ 20 generic PAR samples                   | Universality claim concrete; submission item #11   |
| #5 ✅ Benchmark reports                         | Performance claims in submission narrative         |
| #6 ✅ PAR PDF render                            | Required artefact format                           |
| #8 ⚠️ Mutation score ≥ 95%                      | UKGC/MGA/DE ≥ 80 % threshold now exceeded on BOTH sides: **TS 85.38 % combined** (rg/session 89.25 %, sensitivity 78.91 %; +24 pp) + **Rust 90.9 % strict** (rng.rs; +40 pp). Path to 95 % ≤ ½ dev-day Rust + 1 dev-day TS. |
| #10 ✅ HSM bridge                               | UK / MGA / DE jurisdiction unlock — `src/hsm/` shipped with AWS KMS, PKCS#11, Mock adapters + audit log |

Until those are closed, the engine is **technically sound but not
audit-ready**. Closing them is sequential and scriptable; no further
math work is needed.
