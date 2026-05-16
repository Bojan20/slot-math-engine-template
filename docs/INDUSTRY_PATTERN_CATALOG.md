# Industry Pattern Catalog v2.3

> **Wave 46 (v1.0) + Wave 67 (v2.0) + Wave 76 (v2.1) + Wave 83 (v2.2) + Wave 85 (v2.3 expansion).** Operator-facing catalog
> of **37 industry-style slot patterns** the engine ships ready-to-run:
> - v1.0 (Wave 46) — 20 patterns mapped to reference fixtures.
> - v2.0 (Wave 67) — adds 12 closed-form math kernels landed in
>   Wave 49-60 (each with dedicated solver + MC acceptance proof).
> - v2.1 (Wave 76) — adds 3 progressive-jackpot kernels landed in
>   Wave 71, 72, 75 (Must-Hit-By, Pseudo-Must-Hit + Level, Multi-tier WAP + Wheel).
> - v2.2 (Wave 83) — adds 1 commerce-side kernel landed in Wave 81/82
>   (Bonus Buy / Feature Buy Variance Analyzer with CLT convergence).
> - v2.3 (Wave 85) — adds 1 free-spins variance kernel landed in Wave 84/85
>   (Free Spins Retrigger Compound Variance — Wald + compound-sum).
>
> Each pattern uses **mechanical descriptive naming** (no vendor TM, no
> patented brand names — see `docs/IP_REVIEW.md` for clean-room
> derivation policy).
>
> Operator workflow: math director identifies the pattern they want,
> follows the link to the reference fixture (or closed-form solver),
> runs `runIRSimulation` (fixture-based) or invokes the solver
> (closed-form-based), customizes parameters for their game.

## Why this catalog exists

When a Tier-1 math director hears *"30 mechanic-class fixtures"* the
mental gap to *"can it run a Variable-Ways Cascade for our brand?"* is
real. This catalog closes the gap by mapping each pattern to:

1. The mechanical primitives in the engine that implement it
2. The reference fixture that demonstrates it (`tests/fixtures/reference/`)
3. The acceptance proof that validates engine math for that pattern
4. Industry context (vendor-neutral)

## How patterns are named

Names are **mechanical descriptions** (e.g. "Variable-Ways Cascade")
not vendor brand-names (e.g. "Megaways" — Big Time Gaming TM/patent).
This is per `docs/IP_REVIEW.md` policy: clean-room derivation requires
that we name things by what they DO, not by who popularized them.

Operators rebranding for their game can apply any commercial name they
hold rights to.

## Pattern Catalog (20)

| ID | Pattern | Mechanic Family | Reference Fixture | Acceptance Proof |
|----|---------|----------------|-------------------|------------------|
| P-001 | **Variable-Ways Cascade** | ways + variable-rows + cascade | `complex-variable-rows.json`, `variable-rows-7reels.json` | `MECHANIC_FAMILY.md` (Wave 25) — variable-rows-cascade family |
| P-002 | **Persistent-Grid Cash-Collect** | hold-and-win + cash distribution + grid-fill bonus | `hnw-classic.json`, `hnw-full-grid.json` | `HNW_MULTI_JACKPOT.md` (Wave 23); `tests/persistentHwMarkov.test.ts` (15+5+11 tests) |
| P-003 | **Multi-Tier Pool Jackpot** | progressive + must-hit-by + tiered prize wheel | `hnw-grand-jackpot.json`, `wheel-bonus.json` | `MECHANIC_29.md` (Wave 29) — Multi-tier WAP + wheel pick row |
| P-004 | **Cascading Cluster** | cluster evaluator + cascade orchestrator | `cluster-7x7.json`, `cluster-diagonal.json`, `cluster-hexagonal.json` | `CLUSTER_CASCADE.md` (Wave 23) — cluster-7x7 σ=2.67% across 4 seeds × 200K |
| P-005 | **Sticky-Wild Free Spins** | sticky behaviour + free-spins state machine + multiplier accumulation | `fs-sticky-wilds.json` | `MECHANIC_29.md` (Wave 29) — Sticky wilds + multi-mode FS |
| P-006 | **Mystery-Symbol Reveal** | mystery behaviour + weighted reveal | `mystery-symbol.json` | `MECHANIC_29.md` (Wave 29) — Money-symbol collect FS |
| P-007 | **Walking-Wild Cascade** | walking-wild behaviour + cascade orchestrator | `walking-wilds.json` | `BEHAVIORS_COMPOSITIONAL.md` (Wave 31) — C5 ExpandingWild+WalkingWild |
| P-008 | **Expanding-Wild Free Spins** | expanding-wild behaviour + FS framework | `fs-expanding-wilds.json`, `expanding-wilds.json` | `MECHANIC_29.md` (Wave 29) — Expanding-symbol FS row |
| P-009 | **Multiplier-Ladder Free Spins** | multiplier progression + FS framework | `fs-multiplier-ladder.json` | `FS_CONFIGS.md` (Wave 23) — 4/4 sanity ✅ |
| P-010 | **Pick-Bonus Mini-Game** | pick feature + prize distribution | `pick-bonus.json` | `MECHANIC_29.md` (Wave 29) — Pick bonus + multi-level |
| P-011 | **Pay-Anywhere Scatter** | pay-anywhere evaluator + scatter behaviour | `pay-anywhere.json` | `MECHANIC_30.md` (Wave 26) — pay-anywhere row |
| P-012 | **Both-Ways Line Evaluation** | lines evaluator + both-ways direction flag | `5x4-25lines.json` | `BOTH_WAYS.md` (Wave 28) — BOTH=2891.59% ∈ [LTR, LTR+RTL] gate ✅ |
| P-013 | **Symbol-Upgrade Cascade** | symbol-upgrade feature + cascade | `symbol-upgrade.json` | `MECHANIC_29.md` (Wave 29) — Persistent mult + symbol upgrade FS |
| P-014 | **Respin-Lock Bonus** | respin feature + sticky-symbol lock | `respin-feature.json` | `MECHANIC_29.md` (Wave 29) — Per-spin reel-modifier reveal |
| P-015 | **Hexagonal Cluster** | cluster evaluator + hex adjacency | `cluster-hexagonal.json` | `CLUSTER_CASCADE.md` (Wave 23) |
| P-016 | **Diagonal Cluster** | cluster evaluator + diagonal adjacency | `cluster-diagonal.json` | `MECHANIC_30.md` (Wave 26) — cluster-diagonal row |
| P-017 | **Multi-Reel Wild-Spread** | multiplier-wild behaviour + reel-spread | `multiplier-wilds.json` | `MECHANIC_30.md` (Wave 26) — multiplier-wilds row |
| P-018 | **Asymmetric Variable-Rows** | variable-rows ways + asymmetric grid | `complex-variable-rows.json` | `VARROWS_CASCADE.md` (Wave 28) — gates ✅ |
| P-019 | **High-Volatility Heavy-Tail** | 243-ways + high-multiplier paytable + Pareto α<1 | `5x3-243ways.json` | `MECHANIC_30.md` (Wave 26); PAR sample shows Pareto α=0.447 (heavy tail) |
| P-020 | **Classic 3x3 Lines** | classic 3-reel lines evaluator | `classic-3x3-lines.json` | `MECHANIC_30.md` (Wave 26) — classic-3x3 row |

## Pattern Catalog v2.0 — Closed-Form Math Kernels (Wave 49-60)

These 12 patterns are **dedicated math solvers**, not fixtures. Each
provides a closed-form analytical computation of expected payout
distribution + MC verification at scale. Operators integrate them as
math library calls in their feature builder.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-021 | **N-Tier Hold-and-Win Ladder** | Forward propagation on `(respins, filled)` state DAG; per-tier payout & PMF | `src/jackpot/ladderJackpot.ts` | `HNW_LADDER.md` (Wave 49) — 6/6 PASS @ 250K MC each |
| P-022 | **Charge Meter (Renewal Reward)** | Steady-state + finite-horizon exact PMF via discrete convolution; 3 reset modes | `src/features/chargeMeter.ts` | `CHARGE_METER.md` (Wave 50) — 7/7 PASS @ 500K MC |
| P-023 | **Supermeter State-Switch** | Power-iter stationary distribution + Gaussian-elim first-passage on row-stochastic P | `src/features/supermeter.ts` | `SUPERMETER.md` (Wave 51) — 6/6 PASS @ 500K MC + FH N=2000 |
| P-024 | **Sticky Cash + Reveal Multiplier** | Binomial occupancy × Wald-product variance; closed-form `P(Y=0)` | `src/features/stickyCashReveal.ts` | `STICKY_CASH_REVEAL.md` (Wave 52) — 6/6 PASS @ 100K episodes |
| P-025 | **Walking-Wild Respin (1D Markov)** | Fundamental matrix `N = (I − Q)^{-1}` + Wald + compound-sum variance | `src/features/walkingWildRespin.ts` | `WALKING_WILD_RESPIN.md` (Wave 53) — 6/6 PASS @ 100K episodes |
| P-026 | **Megacluster Stack-Reveal Ways** | Binomial × stack-product `E[S]^k`; optional cap-DP enumeration | `src/features/megaclusterStackWays.ts` | `MEGACLUSTER_STACK_WAYS.md` (Wave 54) — 6/6 PASS @ 1M MC |
| P-027 | **Streaming Entropy Health Monitor** | O(1) sliding-window χ² + Shannon entropy w/ pluggable alert sinks (UKGC RTS 8.A.1) | `src/rng/entropyHealthMonitor.ts` | `ENTROPY_HEALTH_MONITOR.md` (Wave 55) — 7/7 sources @ 500K bytes |
| P-028 | **Demo Mode Controller (zero-RNG)** | SHA-256 script attestation + tamper-evident audit log (GLI-19 §3.3.9) | `src/sim/demoMode.ts` | `DEMO_MODE.md` (Wave 56) — 6/6 scenarios + tamper-detect verified |
| P-029 | **Crash-Style Multiplier (Pareto)** | Bust ∼ Pareto(α=1, x_m=1−HE); RTP invariance theorem at any cash-out target | `src/features/crashMultiplier.ts` | `CRASH_MULTIPLIER.md` (Wave 57) — 6/6 strategies @ 1M MC |
| P-030 | **Parallel Screens Aggregate** | Independent ⇒ convolution; correlated ⇒ mixture w/ Var[Y²] decomposition | `src/features/parallelScreens.ts` | `PARALLEL_SCREENS.md` (Wave 58) — 6/6 configs @ 500K MC |
| P-031 | **Class-II Bingo Coordinator** | Hypergeometric `C(N−\|P\|, k−\|P\|)/C(N,k)` + inclusion-exclusion (NIGC 25 CFR 502) | `src/features/classIIBingoCoordinator.ts` | `CLASS_II_BINGO.md` (Wave 59) — 6/6 configs @ 50K games |
| P-032 | **Sticky-Cash Collector (Renewal Reward)** | Long-run RTP = `p_cash·E[V]·E[M]` (indep p_collect); finite-horizon moment propagation | `src/features/stickyCashCollector.ts` | `STICKY_CASH_COLLECTOR.md` (Wave 60) — 6/6 configs @ 10K episodes |

## Pattern Catalog v2.1 — Progressive Jackpot Math Kernels (Wave 71-75)

These 3 patterns target the **progressive jackpot family** — operator-funded
seeded pools with deterministic or probabilistic trigger mechanics. Each
closes a previously-open ⚠️ acceptance row in the master TODO.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-033 | **Must-Hit-By Jackpot (Mystery Progressive)** | `U ∼ Uniform[seed, cap]` → `N* = (U − seed)/c`; **E[N*] = span/(2c)**, **Var[N*] = span²/(12c²)** (NIGC 25 CFR 542.7(c) compliant) | `src/features/mustHitByJackpot.ts` | 14 vitest specs (Wave 71); portfolio entry W71 |
| P-034 | **Pseudo-Must-Hit + Level Progression** | Escalating linear hazard `λ(pool) = λ_min + (λ_max−λ_min)·(pool−seed)/(softCap−seed)`; level Markov chain stationary `π_maxL = 1/(1+maxL·r), π_other = r·π_maxL` | `src/features/pseudoMustHitLevel.ts` | 20 vitest specs (Wave 72); portfolio entry W72 |
| P-035 | **Multi-tier WAP Jackpot + Wheel** | Per-tier `λ_i = p_trigger·w_i/Σw`; **E[pool_i@hit] = seed_i + c_i/λ_i**; **E[payout_i/spin] = c_i + λ_i·seed_i**; normalized RTP share per tier | `src/features/multiTierWapWheel.ts` | 27 vitest specs (Wave 75); portfolio entry W75 |

## Pattern Catalog v2.2 — Commerce-Side Math Kernels (Wave 81-82)

This pattern targets the **buy-feature / feature-buy commerce family** —
mechanics where the player exchanges a fixed cost for guaranteed feature
entry. Solver provides RTP, variance, risk metrics, and CLT convergence
required for jurisdictional disclosure (UKGC, MGA, AU).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-036 | **Bonus Buy / Feature Buy Variance Analyzer** | `E[Y]=Σp_i·payout_i`, `Var[Y]=E[Y²]−E[Y]²`, `RTP=E[Y]/C`, hit freq, win/loss ratio, **CLT convergence N\* = (z·√Var[Y]/(tol·C))²**, risk: P(bust), P(below cost), P(break-even) | `src/features/bonusBuyVariance.ts` | 29 vitest specs (Wave 81) + 6 PAR-style configs × 200K MC (Wave 82); portfolio entry W81 |

## Pattern Catalog v2.3 — Free-Spins Variance Kernel (Wave 84-85)

This pattern targets the **free-spins compound-variance family** — Wald's
identity + compound-sum for batched FS with geometric retrigger chain.
Required for PAR sheet variance disclosure and player-protection limit
calculations.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-037 | **Free Spins Retrigger Compound Variance** | N ~ shifted-geometric: `E[N]=1/(1-p)`, `Var[N]=p/(1-p)²`; T=K·N: `E[T]=K/(1-p)`, `Var[T]=K²·p/(1-p)²`; **`E[Y]=E[T]·μ` (Wald), `Var[Y]=E[T]·σ² + Var[T]·μ²` (compound-sum)**; tail `P(N≥k)=p^(k-1)` | `src/features/freeSpinsRetriggerCompound.ts` | 33 vitest specs (Wave 84) + 6 PAR-style configs × 50K episodes (Wave 85); portfolio entry W84 |

**One-button portfolio runner:** `npm run closed-form-portfolio` exercises
all 17 P-021..P-037 kernels in ~10 seconds and emits unified report
`reports/dossier/CLOSED_FORM_PORTFOLIO.{json,md}`.



## Pattern composition (operator workflow)

These 20 are PRIMITIVES. Real commercial games typically combine 2-4
patterns. The engine supports composition — the BehaviorPipeline
(Faza 3.2) takes any subset of behaviors and composes them in a single
spin. Wave 31's `BEHAVIORS_COMPOSITIONAL.md` proves 6 dvo-behavior
combinations × 4 seeds × 50K spins (1.2M total) all PASS.

**Example composition**: A modern cluster game ships P-004 + P-007 +
P-009 + P-019 = "Cascading Cluster + Walking Wild + Multiplier Ladder
on Heavy-Tail Paytable". All four are ENGINE-NATIVE; operator IR
config selects the relevant features.

## Industry context (vendor-neutral)

Each pattern below has commercial precedent in the slot industry. We
intentionally do NOT name the vendors or specific games — that's the
operator's branding decision. We DO note the broad timeline / class
where the pattern emerged, anchored on academic / regulatory / public
discussion (not vendor source material per `docs/IP_REVIEW.md`).

- **P-001 Variable-Ways Cascade** — popularized by Australian developer
  trend (~2016+); engine implementation derives from regulatory ways-
  evaluator language (GLI-19 §4.2) and academic ways-count formula
  (Harrigan & Dixon 2009).
- **P-002 Persistent-Grid Cash-Collect** — popularized by Scandinavian
  developer trend (~2018+); engine derives from Markov chain analysis
  in Cabot & Hannum 2002 + steady-state eigenvector method (SolCalc 2018).
- **P-003 Multi-Tier Pool Jackpot** — popularized by Australian trend
  (~2014+); engine derives from progressive-jackpot formal analysis
  (Cabot & Hannum 2002 chapter 6).
- **P-004 Cascading Cluster** — popularized by Maltese developer trend
  (~2011+); engine derives from union-find connected-components
  algorithm (CLRS textbook standard) + flood-fill primitives.
- **P-005..P-014** — established mechanical primitives present in
  industry literature for 20+ years; each implementation derives from
  the regulatory standards (GLI-11, GLI-19, eCOGRA Generic Slots Audit)
  and the academic textbooks (Harrigan & Dixon, Cabot & Hannum).
- **P-015..P-020** — generic geometric and statistical primitives
  derivable directly from mathematical principle.

## What this catalog does NOT claim

- We do NOT claim the engine reproduces any specific commercial game.
  Operators using the engine must license / build their own game art,
  audio, branding, paytable, and any patented mechanic separately
  (e.g. patented variable-reels mechanics may require a license from
  the patent holder).
- We do NOT use vendor-protected names (Megaways, Money Train,
  Lightning Link, Hold & Spin, Bonus Buy etc. as branded terms — we
  may use these terms ONLY as generic descriptors of mechanical
  classes, per industry-standard usage).
- We do NOT supply paytables, reel strips, or feature parameters
  tuned to any specific commercial game. The fixture set is engine
  surface-coverage, not game-content delivery.

## How to use this catalog

1. **Pre-sales** — math director picks 1-3 patterns relevant to their
   roadmap, reviews acceptance proofs, validates engine readiness.
2. **Cert prep** — operator selects pattern composition, builds custom
   IR, runs `npm run par-samples-extra-credit` against their IR to
   produce strict-tier1 PAR sheet for submission.
3. **Audit** — auditor checks operator's PAR claim against engine
   acceptance proof for the pattern; engine source = the same code
   that ran the proof.

## Source-of-truth

This catalog is generated from the 30 reference fixtures in
`tests/fixtures/reference/`. Acceptance proofs live in
`reports/acceptance/`. The Wave 41 unified industry-first dossier
(`reports/dossier/INDUSTRY_FIRST_DOSSIER.md`) cross-references
everything.

Refresh: re-read this file when fixture set or mechanic family
coverage changes.
