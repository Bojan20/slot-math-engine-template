# Industry Pattern Catalog v2.16

> **Wave 46 (v1.0) + Wave 67 (v2.0) + Wave 76 (v2.1) + Wave 83 (v2.2) + Wave 85 (v2.3) + Wave 87 (v2.4) + Wave 90 (v2.5) + Wave 92 (v2.6) + Wave 94 (v2.7) + Wave 96 (v2.8) + Wave 98 (v2.9) + Wave 103 (v2.10) + Wave 104 (v2.11) + Wave 106 (v2.12) + Wave 108 (v2.13) + Wave 111 (v2.14) + Wave 113 (v2.15) + Wave 115 (v2.16 expansion).** Operator-facing catalog
> of **47 industry-style slot patterns** the engine ships ready-to-run:
> - v1.0 (Wave 46) — 20 patterns mapped to reference fixtures.
> - v2.0 (Wave 67) — adds 12 closed-form math kernels landed in
>   Wave 49-60 (each with dedicated solver + MC acceptance proof).
> - v2.1 (Wave 76) — adds 3 progressive-jackpot kernels landed in
>   Wave 71, 72, 75 (Must-Hit-By, Pseudo-Must-Hit + Level, Multi-tier WAP + Wheel).
> - v2.2 (Wave 83) — adds 1 commerce-side kernel landed in Wave 81/82
>   (Bonus Buy / Feature Buy Variance Analyzer with CLT convergence).
> - v2.3 (Wave 85) — adds 1 free-spins variance kernel landed in Wave 84/85
>   (Free Spins Retrigger Compound Variance — Wald + compound-sum).
> - v2.4 (Wave 87) — adds 1 cascade-multiplier kernel landed in Wave 86/87
>   (Cascade Sequential Multiplier Pyramid — geometric chain × ladder).
> - v2.5 (Wave 90) — adds 1 sticky-multiplier kernel landed in Wave 89/90
>   (Persistent Multiplier Accumulator — Binomial drop chain × running multiplier).
> - v2.6 (Wave 92) — adds 1 coin-accumulator kernel landed in Wave 91/92
>   (Money-Train-style Coin Accumulator with discrete mystery value distribution).
> - v2.7 (Wave 94) — adds 1 multiplicative-wild kernel landed in Wave 93/94
>   (Multiplicative Wild Stack Bonus — product of Binomial wilds × multipliers).
> - v2.8 (Wave 96) — adds 1 commerce decision kernel landed in Wave 95/96
>   (Ante Bet / Bet Boost Trade-Off Analyzer — per-mode RTP + crossover N*).
> - v2.9 (Wave 98) — adds 1 lookback-multiplier kernel landed in Wave 97/98
>   (FS Lookback Multiplier Aggregator — Wald-like M·S_K aggregator).
> - v2.10 (Wave 103) — adds 1 symbol-upgrade-ladder kernel landed in Wave 101/103
>   (Symbol Upgrade Chain Markov — Pragmatic / BTG / Push Gaming tier advance).
> - v2.11 (Wave 104) — adds 1 cluster-cascade-variance kernel landed in Wave 102/104
>   (Cluster Compound Variance — Sweet Bonanza / Reactoonz / Jammin' Jars Wald-identity).
> - v2.12 (Wave 106) — adds 1 wheel-respin kernel landed in Wave 105/106
>   (Bonus Wheel + Respin Markov — NetEnt / Pragmatic / IGT wheel features).
> - v2.13 (Wave 108) — adds 1 pick-bonus tree kernel landed in Wave 107/108
> - v2.14 (Wave 111) — adds 1 bonus-trigger wait-time kernel landed in Wave 110/111
> - v2.15 (Wave 113) — adds 1 variable-reel-height ways kernel landed in Wave 112/113 (BTG Megaways patent expired 2023)
> - v2.16 (Wave 115) — adds 1 sticky-wild countdown multiplier kernel landed in Wave 114/115 (Markov stationary)
>   (Pick Bonus N-Stage Tree — NetEnt classic / Microgaming pick-til-pop).
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

## Pattern Catalog v2.4 — Cascade Multiplier Kernel (Wave 86-87)

This pattern targets the **cascade-chain × multiplier-ladder family** —
Sweet Bonanza / Sugar Rush / Wanted Dead or a Wild style cascade games
where each cascade step applies an escalating multiplier from a ladder.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-038 | **Cascade Sequential Multiplier Pyramid** | N ~ shifted-geometric `E[N]=1/(1-q)`; ladder ceiling m_max beyond L: **`E[Y] = μ_W · [Σ q^(k-1)·m_k + m_max·q^L/(1-q)]`** (geometric-sum interchange); `Var[Y]` via `E[Y²] = σ²·E[Σm_k²] + μ²·E[S_N²]`; tail `P(N≥k)=q^(k-1)`, mega-hit `μ_W·m_max·q^(L-1)` | `src/features/cascadeMultiplierPyramid.ts` | 25 vitest specs (Wave 86) + 6 PAR-style configs × 100K episodes (Wave 87); portfolio entry W86 |

## Pattern Catalog v2.5 — Sticky Multiplier Kernel (Wave 89-90)

This pattern targets the **sticky running multiplier family** — Pragmatic /
BTG-Megaways / Nolimit City style features where each free spin has a
chance to "drop" a multiplier increment onto a running stack which
applies to all subsequent spins in the session.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-039 | **Persistent Multiplier Accumulator** | D_n ~ Binomial(n,q): `E[D_n]=n·q`, `Var[D_n]=n·q·(1-q)`; M_n = m_init + D_n·m_drop; **`E[Y] = μ_W · (K·m_init + q·m_drop · K(K+1)/2)`**; `Var[Y] = Σ Var[W_n·M_n] + 2·μ²·m_drop²·q(1-q)·Σ n·(K-n)`; tail `P(no drops)=(1-q)^K`, `P(all drops)=q^K` | `src/features/persistentMultiplierAccumulator.ts` | 28 vitest specs (Wave 89) + 6 PAR-style configs × 50K episodes (Wave 90); portfolio entry W89 |

## Pattern Catalog v2.6 — Coin Accumulator Kernel (Wave 91-92)

This pattern targets the **Money-Train-style coin accumulator family** —
Relax / Hacksaw / similar features where each spin lands a coin symbol
with probability q and the coin reveals a value drawn from a discrete
mystery distribution (cash multi-tier + jackpot tiers).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-040 | **Coin Accumulator + Mystery Values** | N ~ Binomial(K, q): `E[N]=K·q`, `Var[N]=K·q·(1-q)`; mystery moments μ_V, σ²_V from discrete distribution; **`E[Y] = E[N]·μ_V` (Wald)**, `Var[Y] = E[N]·σ²_V + Var[N]·μ²_V` (compound-sum); **`P(≥1 max-value) = 1 − (1 − q·p_max)^K`** (Bernoulli-Binomial nesting) | `src/features/coinAccumulatorMystery.ts` | 30 vitest specs (Wave 91) + 6 PAR-style configs × 100K episodes (Wave 92); portfolio entry W91 |

## Pattern Catalog v2.7 — Multiplicative Wild Stack Kernel (Wave 93-94)

This pattern targets the **multiplicative wild-stack family** — NetEnt
Hotline / Push Wanted Dead or a Wild / Hacksaw Multiplier Mayhem style
features where each reel has a chance to land a wild stack carrying a
random multiplier, and ALL active wild multipliers COMBINE
MULTIPLICATIVELY across reels (product, not sum).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-041 | **Multiplicative Wild Stack Bonus** | N ~ Binomial(R, p_wild); W = Π M_i over active wilds; **`E[W] = (p·μ_M + 1-p)^R`** (interchange product); `E[W²] = (p·E[M²] + 1-p)^R`; `Var[W] = E[W²] − E[W]²`; **`E[Y] = μ_B · E[W]`**, `Var[Y] = (σ²_B + μ²_B)·E[W²] − E[Y]²`; tail `P(all wilds)=p^R`, max combined = `m_max^R` | `src/features/multiplicativeWildStack.ts` | 33 vitest specs (Wave 93) + 6 PAR-style configs × 100K episodes (Wave 94); portfolio entry W93 |

## Pattern Catalog v2.8 — Commerce Decision Kernel (Wave 95-96)

This pattern targets the **ante-bet / bet-boost decision-math family** —
Pragmatic Ante Bet, Wazdan Ante Bet, NetEnt Bet Boost. Operator and
regulator decision math for "pay (1+a)·B for boosted feature trigger"
features — required for per-mode RTP disclosure (UKGC RTS 12), variance
comparison (MGA PPD §11.f), and player-trap regulator-flag detection.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-042 | **Ante Bet / Bet Boost Trade-Off Analyzer** | base RTP = μ_0/1, **ante RTP = μ_a/(1+a)**; anteIsPositiveEV iff RTP_a > RTP_b; **boost premium = (RTP_a − RTP_b) / RTP_b**; **2-sigma crossover N\* = 4σ² / μ_net²**; aggregate revenue-weighted RTP w/ adoption fraction f | `src/features/anteBetTradeOff.ts` | 27 vitest specs (Wave 95) + 6 PAR-style configs × 100K spins (Wave 96); portfolio entry W95 |

## Pattern Catalog v2.9 — Lookback Multiplier Kernel (Wave 97-98)

This pattern targets the **post-hoc multiplier aggregator family** —
Push Money Cart 4, Hacksaw bonus games, Pragmatic post-FS multipliers.
After K free spins accumulate, ONE multiplier is drawn from a discrete
distribution and applied to the total summed wins.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-043 | **Free Spins Lookback Multiplier Aggregator** | S_K = Σ_{i=1..K} W_i, iid: E[S_K]=K·μ_W, Var[S_K]=K·σ²_W; M ~ discrete distribution; **`E[Y] = μ_M · K · μ_W`** (Wald-like); **`Var[Y] = K·σ²_W·(σ²_M + μ²_M) + K²·μ²_W·σ²_M`** (compound variance decomposition); tail: max M, P(max), E[Y\|M=max] | `src/features/freeSpinsLookbackMultiplier.ts` | 28 vitest specs (Wave 97) + 6 PAR-style configs × 100K episodes (Wave 98); portfolio entry W97 |

## Pattern Catalog v2.10 — Symbol Upgrade Ladder Kernel (Wave 101/103)

This pattern targets the **symbol upgrade ladder Markov family** —
Pragmatic / BTG / Push Gaming style features where a symbol advances
through L+1 tiers during K free spins, with per-state payout escalation.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-044 | **Symbol Upgrade Chain Markov** | A ~ Binomial(K, p): E[A]=K·p, Var[A]=K·p·(1-p); F = min(A, L); **`P(F=i) = C(K,i)·p^i·(1-p)^(K-i)`** for i<L, **`P(F=L) = 1 − Σ_{i<L} P(F=i)`**; `E[Y] = Σ P(F=i)·v_i`; tail: P(reach top), P(stay at base) = (1-p)^K | `src/features/symbolUpgradeChainMarkov.ts` | 27 vitest specs (Wave 101) + 6 PAR-style configs × 100K episodes (Wave 103); portfolio entry W101 |

## Pattern Catalog v2.11 — Cluster Cascade Variance Kernel (Wave 102/104)

This pattern targets the **cluster cascade compound payout family** —
Sweet Bonanza / Reactoonz / Jammin' Jars / Wild Swarm style features
where chain length N + per-step cluster size K_i + per-step payout f(K_i)
compose into total payout Y = Σ f(K_i). Closed-form via Wald's
compound-sum identity.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-045 | **Cluster Compound Variance** | μ_Y = Σ clusterPmf[k]·paytable[k]; σ²_Y = Σ clusterPmf[k]·paytable[k]² − μ_Y²; **`E[Y_total] = E[N] · μ_Y`** (Wald); **`Var[Y_total] = E[N]·σ²_Y + Var[N]·μ²_Y`** (compound-sum); 3 input modes (explicit chainPmf+clusterPmf, geometric pKill, bridge helper) | `src/features/clusterCompoundVariance.ts` | 31 vitest specs (Wave 102) + 6 PAR-style configs × 100K episodes (Wave 104); portfolio entry W102 |

## Pattern Catalog v2.12 — Bonus Wheel + Respin Kernel (Wave 105/106)

This pattern targets the **wheel-bonus + respin-segment family** —
NetEnt / Pragmatic / IGT wheel features where wheel has K pay segments
+ p_respin probability for respin slice. Player spins until non-respin
segment lands.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-046 | **Bonus Wheel + Respin Markov** | N ~ shifted-geometric: **`E[N] = 1/(1-p_respin)`**, Var[N] = p_respin/(1-p_respin)²; conditional payout V (given terminate): **`μ_V = Σ p_i·v_i / (1-p_respin)`**, σ²_V via E[V²] − μ²_V; tail `P(N≥k) = p_respin^(k-1)`; max payout + P(hit max) | `src/features/bonusWheelRespin.ts` | 26 vitest specs (Wave 105) + 6 PAR-style configs × 100K episodes (Wave 106); portfolio entry W105 |

## Pattern Catalog v2.13 — Pick Bonus N-Stage Tree Kernel (Wave 107/108)

This pattern targets the **multi-stage pick bonus tree family** —
NetEnt classic / Microgaming "pick til pop" / Play'n GO style features
where player advances through L stages with per-stage outcomes
(advance / collect / end with 0).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-047 | **Pick Bonus N-Stage Tree** | Stages 1..L, per-stage outcomes p_advance / p_collect / p_end (must sum to 1); **`P(reach i) = Π advance_{j<i}`**, P(reach 1)=1; **`P(collect at i) = P(reach i)·collect_i`**; **`E[Y] = Σ P(collect at i)·v_i`**; Var[Y] = Σ P(collect at i)·v_i² − E[Y]²; tail: P(reach top), P(collect anywhere), P(end with 0) | `src/features/pickBonusNStageTree.ts` | 26 vitest specs (Wave 107) + 6 PAR-style configs × 100K episodes (Wave 108); portfolio entry W107 |

## Pattern Catalog v2.14 — Bonus Trigger Wait Time Kernel (Wave 110/111)

This pattern targets the **bonus-trigger frequency disclosure family** —
UKGC RTS 14 + MGA PPD §11.f compliance: median + 95th/99th percentile
wait time per feature MUST match engine math so marketing claims like
"~1 in 100 spins" don't mismatch the tail.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-048 | **Bonus Trigger Wait Time Analyzer** | T_i ~ shifted-geometric(p_i): **`E[T_i] = 1/p_i`**, Var[T_i] = (1−p_i)/p_i², Median = ⌈log(0.5)/log(1−p_i)⌉, **`Percentile_q = ⌈log(1−q)/log(1−p_i)⌉`**; any-feature: **`p_any = 1 − Π(1−p_i)`**, E[T_any] = 1/p_any; aggregate rate Σ p_i; P(multiple per spin) = 1 − P(0) − P(1) | `src/features/bonusTriggerWaitTime.ts` | 24 vitest specs (Wave 110) + 6 PAR-style configs × 100K episodes (Wave 111); portfolio entry W110 |

## Pattern Catalog v2.15 — Variable Reel Height Ways Kernel (Wave 112/113)

This pattern targets the **variable reel height ways family** — BTG
Megaways patent **EXPIRED 2023**, naming clean-room "variable reel
height ways" / "ways count" / "reel modifier". Pragmatic, Blueprint,
iSoftBet, Stakelogic ship the same pattern under various brands.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-049 | **Variable Reel Height Ways** | Per-reel H_i ~ discrete pmf; **`W = Π_i H_i`** (cross-reel independence); **`E[W] = Π_i E[H_i]`**; **`E[W²] = Π_i E[H_i²]`**; Var[W] = E[W²] − E[W]²; sparse PMF via multiplicative convolution (Cartesian × value-merge); tail: maxWays = Π max(supp(H_i)), **`probMaxWays = Π P(H_i=max)`**, P(W ≥ threshold) for "epic ways" disclosure | `src/features/variableReelHeightWays.ts` | 31 vitest specs (Wave 112) + 6 PAR-style configs × 100K episodes (Wave 113); portfolio entry W112 |

## Pattern Catalog v2.16 — Sticky Wild Countdown Multiplier Kernel (Wave 114/115)

This pattern targets the **sticky wild with countdown-growing multiplier
family** — Pragmatic Hot Fiesta / NetEnt Vikings Berzerk / Push Gaming
Wild Swarm / Quickspin Sakura Fortune / Yggdrasil Vault of Anubis style.
Wild lands sa probability p, stays sticky N spins, multiplier raste
linearno ili geometrijski tokom aktive periode.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-050 | **Sticky Wild Countdown Multiplier** | Discrete Markov chain sa (N+1) stanjima (idle + N active phases); **`π_0 = 1/(1 + N·p)`**, **`π_k = p/(1 + N·p)`** za k=1..N; M_k = base + (k−1)·step (linear) ili base·ratio^(k−1) (geometric); **`E[M per spin] = π_0 + π_1·ΣM_k`**; **`E[Y per spin] = E[V]·E[M]`** (cross-independence); Var[Y] = E[V²]·E[M²] − E[Y]²; cycle: 1/p + N | `src/features/stickyWildCountdownMultiplier.ts` | 34 vitest specs (Wave 114) + 6 PAR-style configs × 100K spins (Wave 115); portfolio entry W114 |

**One-button portfolio runner:** `npm run closed-form-portfolio` exercises
all 30 P-021..P-050 kernels in ~10 seconds and emits unified report
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
