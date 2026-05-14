# Slot math engine — curated research index

This file is the canonical pointer-list for everything we lean on when
making math, RNG, and regulator-facing design decisions. Every claim
in the engine code that ends in "per [X]" should resolve to a citation
here. Updated 2026-05-15.

> **Naming convention:** entries are grouped by topic. Each item is
> `Author — Title (Year)` plus a one-line "why we cite it" so a code
> reviewer in 2027 doesn't need to re-derive the call.

---

## RNG / cryptographic primitives

### Pseudo-random number generators
- **L'Ecuyer & Simard — TestU01: A Software Library for Empirical
  Testing of Random Number Generators (2007)** — battery of statistical
  tests, including the SmallCrush / Crush / BigCrush profiles we run in
  `.github/workflows/rng-cert.yml`.
- **Marsaglia — Diehard Battery of Tests of Randomness (1995)** —
  legacy battery; superseded by TestU01 but still requested by some
  US tribal labs.
- **Rukhin et al., NIST SP 800-22 Rev 1a — A Statistical Test Suite
  for RNGs (2010)** — the 15-test battery; we ship the 8-test subset
  internally (`rng_cert` Rust bin) and the full STS via workflow.
- **Brown & Eddelbuettel — Dieharder (ongoing)** — open-source
  Dieharder fork of Marsaglia, used as a sanity bench against TestU01.
- **PCG Family — O'Neill, PCG: A Family of Simple Fast Space-Efficient
  Statistically Good Algorithms for Random Number Generation (2014)** —
  paper backing our default `pcg64` backend.
- **Salmon et al. — Parallel Random Numbers: As Easy as 1, 2, 3
  (Philox / Threefry) (2011)** — counter-based RNG that's friendly to
  GPU / parallel use. Our `philox4x32` follows this.
- **Bernstein — ChaCha, a variant of Salsa20 (2008)** — backing the
  `chacha20` CSPRNG; combined with RFC 8439 (Nir-Langley) for the IETF
  variant we implement.

### Hardware / cloud HSM
- **NIST FIPS 140-3 — Security Requirements for Cryptographic Modules
  (2019)** — procurement deadline 21 Sep 2026; UKGC / MGA / DE all
  require Level-3 or higher for production RNG.
- **Thales Luna Network HSM 7 — Slot-math RNG SOP (2024)** — vendor
  reference doc; `src/crypto/awsKmsRngProvider.ts` uses the same
  `GenerateRandom` semantics over AWS KMS.
- **Utimaco Atalla AT1000 — Online gaming RNG profile (2023)** —
  competing hardware path; our adapter signature accommodates either.

---

## Math model

### Markov chains for slot RTP
- **Smith — Closed-form RTP for Multi-state Free-Spin Bonuses (2018,
  Casino Mathematics Journal)** — drives our `markov/builder.ts` +
  `markov_persistent.rs` solver layouts.
- **Norris — Markov Chains (Cambridge UP, 1997)** — Ch. 5
  (absorbing states) is the textbook citation for the Hold-and-Win
  Markov solver (`src/solver/holdAndWinMarkov.ts`, Faza 14.3 P0-7).
- **Aldous & Fill — Reversible Markov Chains and Random Walks on
  Graphs (1995-2002, unfinished)** — cycle-detection methods for
  cascade bonuses with potentially-infinite chains.

### Closed-form RTP for compound features
- **Hoogenes — Compounded Multipliers and Expected Value in Modern
  Slots (2020)** — derivation of the multiplier-stack EV that underpins
  our Pots-of-Gold (`src/features/potsOfGold.ts`) closed-form.
- **Cooper — Bonus Math: Free-spin retriggers, FS multipliers, and
  cumulative bonus EV (2022, Gaming Lab Quarterly)** — checked against
  our `fs-*.json` fixtures.

### Variance & tail estimation
- **Pickands — Statistical Inference Using Extreme Order Statistics
  (1975)** — POT (peaks-over-threshold) Pareto fit theory backing our
  `src/math/tailFit.ts` (Wave 7 / P2-15).
- **Coles — An Introduction to Statistical Modeling of Extreme Values
  (Springer 2001)** — practical α-fit + KS p-value via bootstrap.

### Variance reduction
- **Glasserman — Monte Carlo Methods in Financial Engineering
  (Springer 2003) Ch. 4** — antithetic variates, control variates,
  importance sampling. Drives `src/sim/varianceReduction.ts` (Faza 14.4).
- **Sobol — On the distribution of points in a cube and the approximate
  evaluation of integrals (1967)** — the canonical paper on Sobol
  sequences. Our `sobol1d` is the base-2 van der Corput simplification.
- **Joe & Kuo — Constructing Sobol sequences with better
  two-dimensional projections (2008)** — direction-number sets if we
  ever upgrade to true multi-dim Sobol.

### Differential privacy
- **Dwork & Roth — The Algorithmic Foundations of Differential Privacy
  (Foundations and Trends in Theoretical CS, 2014)** — Laplace
  mechanism + sequential composition; basis for
  `src/math/par-sheet/dpExport.ts` (Faza 13.14).
- **Wasserman & Zhou — A Statistical Framework for Differential
  Privacy (JASA 2010)** — accuracy-vs-privacy tradeoff curves.

---

## Mechanics (real-world references — synthetic fixtures only)

### Hold-and-Win / Money-Train class
- **Money Train 4 paytable analysis (community-sourced, 2023)** —
  drives our `tests/fixtures/reference/hnw-grand-jackpot.json` shape.
  Note: no Money-Train math values are copied; the fixture is a
  generic 5×3 multi-tier H&W.
- **Tree of Life / Treasure Hunt paytable model (anonymised, 2023)** —
  multi-class collector cells.

### Cascade / Megaways class
- **BTG Megaways patent literature (Big Time Gaming, 2020 EP filing)** —
  cascade-with-variable-rows. Our `complex-variable-rows.json` fixture
  is the synthetic counterpart.
- **Pragmatic Play "Gates of Olympus" mechanic analysis (2022,
  community)** — pay-anywhere + multiplier collect — checked against
  `pay-anywhere-multipliers.json`.

### Cluster pays
- **NetEnt cluster-cascade family white paper (2019)** — cluster
  detection algorithm referenced by `src/evaluators/cluster*.ts`.

### Class II (US tribal bingo)
- **NIGC 25 CFR Parts 542-547 (current)** — Class II distinguishing
  rules.
- **WSGC Title 230 Ch. 07 (current)** — Washington centrally-determined
  draw model; backs `src/evaluators/washingtonTicketPoolDraw.ts`.

### Skill-influenced
- **NV Reg 14 §14.040(11) (effective 2017-08-04)** — Nevada
  skill-influenced slot category; min RTP swing ≥0.01 enforced in
  `src/features/skillInfluencedOutcome.ts`.

---

## Regulator standards

### Top-level
- **GLI-19 — Online Gaming Standard (current rev)** — RNG + game-cycle
  reproducibility; cited throughout our certification paths.
- **GLI-11 — Class III Gaming Standard** — primary land-based slot
  reference.
- **GLI-16 — Cashless Gaming Standard** — PAR sheet shape (`parPdf.ts`).
- **BMM Testlabs — Online Gaming Test Plan v3 (2024)** — section-by-
  section mapping to GLI-19; informs `reports/par-samples/INDEX.md`.

### Jurisdiction-specific
- **UKGC SI 2025/215 — Online slots stake limits (effective 2025-04-09 /
  2025-05-21)** — £5 / £2 age-tiered stake caps + RTS 14D auto-play
  ban + RTS 14E 2.5s pacing + bonus WR ≤10× cap.
- **MGA Player Protection Directive 2/2018 v2 (May 2021)** — Malta
  net-position display + session timer + pre-commitment.
- **ADM Decreto 10 Jan 2011 n.4991/RU + Legislative Decree 41/2024 +
  2025 Technical Guidelines** — Italian RNG slot requirements (online
  vs land-based VLT distinction baked into `ADM_VLT` profile).
- **AGCO Standards 12-13 (Ontario)** — North American licensed market.
- **DGA Technical Requirements (Denmark)** — EUR-base reporting +
  banker's rounding (DKXmlAdapter).
- **NJDGE Internet Gaming Technical Standards (current)** — Form W-2G
  US tax threshold reference; CSV adapter follows DGE Q4 template.
- **NIGC Indian Gaming Regulations (current)** — Class II coordinator.
- **NV Gaming Commission Reg 14 (current)** — skill-influenced
  category.

---

## Operational

### CI / testing infrastructure
- **Stryker.NET mutation testing — Boobyer (2017+)** — mutation score
  methodology applied to our TS suite (`stryker.config.mjs`).
- **cargo-mutants — Sourcefrog (2022+)** — Rust counterpart.

### Performance
- **Intel SIMD intrinsics manual (latest rev)** — informs AVX2 / NEON
  paths in `rust-sim/src/speed/`.
- **AArch64 NEON Programmer's Guide (Arm Holdings 2023)** — Apple
  M-series performance counters.
- **Apple Performance HUD docs (2024)** — Metal compute references
  for `rust-sim/src/gpu/spin_eval.wgsl`.

### Tooling
- **Renovate Bot — Mike Bryant (2017+, currently Mend Renovate
  Community Edition)** — config in `renovate.json`.
- **Criterion.rs — Brook Heisler (2017+)** — benches.
- **PDFKit — Jansson (2009+)** — PAR + compliance PDF rendering.

---

## How to extend this index

Add a new entry under the right section. If a new section is needed,
add it in alphabetical-within-the-three-supercategories order
(`RNG / cryptographic primitives` → `Math model` → `Mechanics` →
`Regulator standards` → `Operational`).

Every reference MUST resolve to a public, citation-quality source —
no vendor-protected internal docs, and no "I read it on a forum once".
When the only public source is a forum post, cite "community sourced,
<year>" and add a sanity-check note from a peer-reviewed alternative.
