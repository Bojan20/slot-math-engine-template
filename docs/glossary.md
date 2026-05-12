# Glossary

**Status:** Draft v0.1 — Faza 0.2 deliverable
**Scope:** Industry terms used across the IR, the codebase, and the
math docs. Tries to be precise enough that two designers reading the
IR mean the same thing.

---

## A

**Ante bet** — Optional extra bet that buys higher feature-trigger
probability. Implemented in `src/features/anteBet.ts`. Charged at the
same rate as base bet, payout multipliers unchanged.

**All-ways** — Win-evaluation mode where any matching symbol on each
reel from left contributes one "way" (product of per-reel match
counts), without explicit paylines. Files: `src/evaluators/allWaysEvaluator.ts`,
`waysEvaluator.ts`.

**Audit chain** — SHA-256 hash chain over per-spin records. Each
record's hash includes the previous record's hash; any tamper breaks
the chain. Implemented in `src/recall/` and `rust-sim/src/recall/`.

---

## B

**Base game** — Spin mode outside of any feature (no free spins, no
hold-and-win in progress).

**Bet** — Currency amount staked on a spin. In the IR, the unit is
`base_bet` (declared in `bet.base_bet`); multipliers and paytable
values are expressed in `base_bet` units.

**BigCrush** — TestU01 statistical test battery (160 tests). The
strongest publicly available PRNG-quality bar. Default backend (`pcg64`)
passes all 160.

**Buy-feature** — Direct purchase of a feature trigger (typically
free spins) for a fixed premium over base bet. IR field
`bet.buy_feature_costs`. Common premiums: 75×, 100×, 120×.

---

## C

**Cascade** — Post-win mechanic where winning symbols are removed and
remaining symbols fall to fill the gaps; the resulting grid is
re-evaluated. Also called "tumble" or "avalanche". Implemented in
`src/features/cascade*.ts`.

**Closed-form RTP** — RTP computed by exhaustive enumeration of all
reachable states, not Monte Carlo. Faster and exact for small games;
infeasible past ~10⁹ states. See `src/analytical/` and Faza 14.1.

**Cluster pays** — Win mode where N or more orthogonally-adjacent
matching symbols pay regardless of position. File:
`src/evaluators/clusterEvaluator.ts`. Common floor: 5 connected.

**Coefficient of variation (CV)** — Standard deviation / mean. Used
to assess MC convergence — a CV below 0.001 typically means more spins
won't change the RTP estimate significantly.

**Commit-reveal** — Provably-fair protocol where the server commits
to a hash of the spin's RNG state before the spin and reveals the
state after, letting the player verify post-hoc. Implemented in
`src/crypto/commitReveal.ts` and ChaCha20-backed.

---

## D

**Determinism** — Same IR + same seed ⇒ same SpinResult byte-for-byte
across TS, Rust, and (where supported) GPU stacks. Enforced by the
parity CI gate.

**Differential mutation testing** — Stryker (TS) + cargo-mutants
(Rust) introduce mutations into the code and check that the test
suite catches them. Mutation score ≥ 95% is the acceptance bar
(Faza 10.7).

---

## E

**Expanding wild** — Wild that, when landed, expands to cover the
entire reel (or column). Behavior plugin: `src/behaviors/impls/ExpandingWild*.ts`.

**Exhaustive enumeration** — Computing the closed-form RTP by walking
every reachable grid. Tractable for ≤ 5×3 games with ≤ 10⁹ states.

---

## F

**f64 mantissa** — IEEE 754 double-precision mantissa is 53 bits.
RNG floats and accumulators rely on 53-bit precision; see
`docs/precision.md`.

**Feature** — Any spin mode other than the base game: free spins,
hold-and-win, cascade, retrigger, bonus pick, wheel, ante bet,
buy-feature, lightning collect, jackpot lock-in.

**Free spins (FS)** — Bonus spins awarded by a trigger (typically
3+ scatters), often with modified reel strips, sticky wilds, or a
multiplier ladder. IR field `features[].kind === "free_spins"`.

**Full cycle** — A specific reel/payline configuration enumeration
that produces an exact theoretical RTP. Industry standard pre-MC.

---

## G

**G2S** — Game-to-System protocol; industry standard for slot ↔
backend messaging. Adapter: `src/protocols/g2s.ts`,
`rust-sim/src/protocols/g2s.rs`.

**GAT-IV** — Signature-verification tool format used by GLI to verify
deployed binaries match certified artefacts. Adapter: `protocols/gativ.*`.

**GLI** — Gaming Laboratories International. Certification body
producing GLI-11 (online casino) and GLI-19 (interactive systems)
standards. See `docs/compliance.md`.

**Grid** — The 2D matrix of symbol IDs after reel sampling and before
win evaluation. Shape determined by `topology.kind` (rectangular,
variable_rows, cluster_grid).

---

## H

**Hit frequency** — Fraction of spins that pay anything > 0. Common
targets: 25–35% for lines games, 35–50% for cluster cascades.

**Hold-and-win (H&W)** — Feature triggered by N bonus symbols; the
bonus symbols stick while remaining positions respin for M rounds.
Common implementation of multi-tier jackpots. File:
`src/features/holdAndWin*.ts`.

**HSM** — Hardware Security Module. Some jurisdictions (UK, MGA, DE)
require HSM-backed RNG for live deployment.

---

## I

**IR** — Intermediate Representation. The canonical JSON document
that fully describes a slot game; both TS and Rust engines load the
same IR. See `docs/IR_SPEC.md`.

---

## J

**Jackpot** — Pooled prize awarded by a special trigger or symbol
landing. Variants: fixed, progressive single-tier, progressive
multi-tier (mini/minor/major/grand), must-hit-by, wide-area
progressive (WAP).

**Journal** — Append-only per-spin record used for recall, replay,
audit, and dispute resolution. Files: `src/recall/journal.ts`,
`rust-sim/src/recall/`.

---

## K

**KAT (Known-Answer Test)** — A test where the input and the expected
output are both fixed; the engine must produce the expected output.
Used for spin replay, RNG sequence parity, IR round-trips. Files:
`tests/recall.test.ts`, `rust-sim/tests/recall_kat.rs`.

**Kahan summation** — Compensated-summation algorithm that bounds the
accumulated f64 error in a long sum to `n × ε`, independent of input
order. Used in the per-batch RTP accumulator.

---

## L

**Lemire's algorithm** — Nearly-divisionless method for unbiased
bounded integers from a uniform u32 / u64. Used by every
`next_u32_bounded` / `next_u64_bounded` call to avoid modulo bias.

**Lines** — Win-evaluation mode where matches must lie on declared
paylines. IR field `evaluation.kind === "lines"`. Directions: ltr,
rtl, both.

---

## M

**Markov chain** — Used in `src/markov/` and `rust-sim/src/markov.rs`
to model multi-state features (FS retriggers, supermeter levels) and
compute closed-form RTP contribution.

**Max win** — Currency cap on a single spin's total win, expressed in
multiples of base bet. IR field `limits.max_win_x`. Common: 5000× to
50000×.

**MC (Monte Carlo)** — Statistical simulation by repeated random
sampling. The hammer of last resort when closed-form isn't tractable.

**Megaspin** — Logical batch of K spins evaluated in lock-step;
enables SIMD f32x8 batching across 8 spins. See `rust-sim/src/bulk/`.

**Multiplier** — Numeric factor applied to a win (line, total, or
free-spin global). IR field `features[].multiplier` or
`symbols[].multiplier`.

**Must-hit-by** — Jackpot constraint where the prize must be awarded
before the pool exceeds a declared cap. See `src/jackpot/mustHitBy.ts`.

---

## N

**NIST SP 800-22** — RNG statistical-quality test suite (188 sub-tests).
Required for regulator submissions in several jurisdictions.

---

## P

**PAR sheet** — Parameter Analysis Report. The math document filed
with the regulator that lists reel strips, paytable, theoretical RTP,
hit frequency, variance, max-win probability, jackpot contributions.
Generated by `src/report/parGenerator.ts` and `rust-sim/src/par.rs`.

**Paytable** — Symbol-ID → match-count → multiplier map. IR field
`paytable`.

**Pay-anywhere** — Win mode where the count of matching symbols
anywhere on the grid pays, irrespective of position or adjacency. IR
`evaluation.kind === "pay_anywhere"`.

**Pattern win** — Win mode where a declared pattern of grid positions
must all match (e.g. "X-shape", "full screen"). IR
`evaluation.kind === "pattern"`.

**PCG64** — Permuted Congruential Generator family, 128-bit state,
period 2¹²⁶. Default backend.

**PractRand** — Streaming PRNG quality test that scales to terabytes
of output. Acceptance bar: ≥ 2³⁸ bytes without failure.

---

## R

**Reel strip** — Ordered sequence of symbols representing a physical
reel. Stops chosen uniformly along the strip; rows visible per spin
are a contiguous window.

**Recall** — Reconstructing a past spin from its journal entry.
Required for dispute resolution. See `docs/RECALL_SPEC.md`.

**Retrigger** — Earning extra spins during free-spins by hitting
the trigger condition again. IR `features[].retrigger`.

**RG** — Responsible Gaming. Player-protection layer (session limits,
self-exclusion, velocity flagging). See `src/rg/`.

**RNG** — Random Number Generator. See `docs/rng.md` for the formal
pluggable spec.

**RTP (Return to Player)** — Expected fraction of total bets returned
as wins over an infinite horizon. Typical range: 92–98%. Theoretical
RTP must match measured (MC) RTP to within ±0.05% on 10⁹ spins.

---

## S

**SAS 6.03** — Slot Accounting System protocol. Legacy adapter for
casino floor integration. File: `src/protocols/sas.ts`.

**Scatter** — Symbol that pays regardless of position. Common
trigger for free spins (3+ scatters → 10 FS).

**Seed** — Initial RNG state, 64-bit integer. IR field
`rng.seed`. Hex, decimal, or `sha256:label` forms accepted.

**Split** — Spawning an independent stream from a parent RNG with a
nonce. Required for parallel Monte Carlo. See `docs/rng.md`.

**Sticky wild** — Wild that, once landed, sticks for N respins or for
the remainder of free spins.

---

## T

**Theoretical RTP** — RTP computed from the math (paytable × reel
strip weights), as opposed to **measured RTP** computed by MC.

**TestU01** — Statistical test framework producing SmallCrush /
Crush / BigCrush. Default backend (`pcg64`) passes BigCrush.

**Trigger** — Condition that initiates a feature, typically
N-of-a-kind on a specific symbol (e.g. 3 scatters → FS).

**Tumble** — Synonym for cascade. Some vendors prefer "tumble".

---

## U

**USIF** — Universal Slot Interchange Format. The IR + a structural
JSON-Schema validator and converter framework for vendor-dialect
imports. See `src/usif/` and `docs/IR_SPEC.md`.

---

## V

**Variable_rows / variable_ways** — Topology where each reel can land
a different number of rows per spin (e.g. 2–7). Total ways equals the
product of per-spin row counts. File:
`src/evaluators/variableWaysEvaluator.ts`.

**Volatility** — Informal measure of win-size variance. Low-vol games
pay small wins often; high-vol games pay big wins rarely. Quantified
by the coefficient of variation of single-spin wins.

---

## W

**WAP** — Wide-Area Progressive. Jackpot pool shared across multiple
casinos / operators / sites. Requires central jackpot controller and
two-phase commit for safety (Faza 5.5).

**Ways** — Generic win-evaluation mode (vs. lines): any matching
symbol on each reel from left contributes; total wins = product of
per-reel match counts. Common bounds: 243, 1024, variable.

**Welford's algorithm** — Online single-pass variance computation
with bounded numerical error. Used in `statistics/welford.ts` and
`stats.rs::AtomicStats`.

**Wild** — Symbol that substitutes for one or more paying symbols.
Variants: standard, expanding, sticky, multiplier, walking / chain,
nudge, bomb.
