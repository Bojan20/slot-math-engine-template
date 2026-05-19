# Industry Pattern Catalog v2.73

> **Wave 46 (v1.0) + Wave 67 (v2.0) + Wave 76 (v2.1) + Wave 83 (v2.2) + Wave 85 (v2.3) + Wave 87 (v2.4) + Wave 90 (v2.5) + Wave 92 (v2.6) + Wave 94 (v2.7) + Wave 96 (v2.8) + Wave 98 (v2.9) + Wave 103 (v2.10) + Wave 104 (v2.11) + Wave 106 (v2.12) + Wave 108 (v2.13) + Wave 111 (v2.14) + Wave 113 (v2.15) + Wave 115 (v2.16) + Wave 117 (v2.17) + Wave 119 (v2.18) + Wave 122 (v2.19) + Wave 124 (v2.20) + Wave 126 (v2.21) + Wave 128 (v2.22) + Wave 131 (v2.23) + Wave 133 (v2.24) + Wave 135 (v2.25) + Wave 137 (v2.26) + Wave 139 (v2.27) + Wave 141 (v2.28) + Wave 143 (v2.29) + Wave 145 (v2.30) + Wave 147 (v2.31) + Wave 149 (v2.32) + Wave 151 (v2.33) + Wave 153 (v2.34) + Wave 155 (v2.35) + Wave 158 (v2.36) + Wave 160 (v2.37) + Wave 162 (v2.38) + Wave 164 (v2.39) + Wave 166 (v2.40) + Wave 168 (v2.41) + Wave 170 (v2.42) + Wave 172 (v2.43 expansion).** Operator-facing catalog
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
> - v2.17 (Wave 117) — adds 1 mystery-symbol reveal aggregator kernel landed in Wave 116/117 (Wald-style K ⊥ S)
> - v2.18 (Wave 119) — adds 1 bonus-collect-N trigger tracker kernel landed in Wave 118/119 (Negative Binomial NB(N,p))
> - v2.19 (Wave 122) — adds 1 cascade multiplier chain (lockstep conditional) kernel landed in Wave 121/122 (Wald-style Σ M_k·p^k)
> - v2.20 (Wave 124) — adds 1 mega symbol multi-cell expansion kernel landed in Wave 123/124 (S² area coverage Wald-style)
> - v2.21 (Wave 126) — adds 1 bi-directional line pay kernel landed in Wave 125/126 (both-ways evaluation sa N-match deduplication)
> - v2.22 (Wave 128) — adds 1 anticipation/tease reel Bayesian conditional kernel landed in Wave 127/128 (UKGC RTS 8 §3.5 compliance)
> - v2.23 (Wave 131) — adds 1 free spins buy + tier escalation trade-off kernel landed in Wave 130/131 (Australian NCRG / Belgian Bonus Buy ban impact)
> - v2.24 (Wave 133) — adds 1 multi-level wild tier Markov kernel landed in Wave 132/133 (4-state probabilistic upgrade stationary)
> - v2.25 (Wave 135) — adds 1 hold-and-win multi-tier value-based jackpot kernel landed in Wave 134/135 (Aristocrat Lightning Link / IGT Hold & Win; distinct od W49 filled-count ladder)
> - v2.26 (Wave 137) — adds 1 locked/held reels during FS retrigger analyzer kernel landed in Wave 136/137 (Pragmatic Wolf Gold / Buffalo King lock-and-spin)
> - v2.27 (Wave 139) — adds 1 tumble multiplier with cap kernel landed in Wave 138/139 (NetEnt Gonzo's Quest 5× / BTG Bonanza 10× / Pragmatic Sweet Bonanza Xmas 100× cascade-with-ceiling)
> - v2.28 (Wave 141) — adds 1 adjacent pays aggregator kernel landed in Wave 140/141 (Aristocrat Buffalo / Konami Roman Tribune / NextGen Foxin' Wins pay-anywhere-on-consecutive-reels family)
> - v2.29 (Wave 143) — adds 1 symbol multiplier on reel-stop kernel landed in Wave 142/143 (Pragmatic Sweet Bonanza / Bigger Bass / Hacksaw RIP City / NetEnt Asgardian Stones random multiplier symbol landing additive vs multiplicative)
> - v2.30 (Wave 145) — adds 1 trail/board bonus progression tracker kernel landed in Wave 144/145 (Konami Stairway to Heaven / IGT Wheel of Fortune Multi-Tier Trail / Microgaming Lord of the Rings / Inspired ladder climb sequential step-based progression sa step PMF + bust + end bonus)
> - v2.31 (Wave 147) — adds 1 cascade meter charge-up trigger kernel landed in Wave 146/147 (Play'n GO Reactoonz Quantum Leap / Hacksaw Stack 'Em / Push Aztec Bonanza / Yggdrasil Vault of Anubis / NetEnt Wildbeast charge meter sa F = ⌊L/T⌋ ~ Geometric(1-p^T))
> - v2.32 (Wave 149) — adds 1 max win cap truncation analyzer kernel landed in Wave 148/149 (UNIVERSALNI regulatory disclosure: Pragmatic 5000x / Hacksaw 7500x / Nolimit City 25000x / NetEnt 10000x / Stake.com 5000x / Push 10000-15000x sa RTP loss + 1-in-N cap-hit frequency + E[overflow | cap-hit])
> - v2.33 (Wave 151) — adds 1 voltage/XP meter multi-tier reward levels kernel landed in Wave 150/151 (Hacksaw Stack 'Em / Push Wild Swarm / NetEnt Charged / Yggdrasil multi-step charge / Inspired XP bar K-tier extension sa highest-only + cumulative reward modes)
> - v2.34 (Wave 153) — adds 1 bonus trigger award tier stratification kernel landed in Wave 152/153 (STANDARD industry: Pragmatic Sweet Bonanza 3/4/5 = 10/15/20 FS / NetEnt Vikings / Hacksaw RIP City / Microgaming Mega Moolah / BTG Megaways 6-reel scatter-Binomial trigger sa multi-tier FS award + stratification)
> - v2.35 (Wave 155) — adds 1 free bet wagering requirement aggregator kernel landed in Wave 154/155 (**INDUSTRY-FIRST** UKGC RTS-12 / MGA Player Protection §15 / EU GambleAware bonus play-through closed-form sa Bachelier first-passage exact bust probability + joint-density truncated normal E[withdrawable] disclosure metric)
> - v2.36 (Wave 158) — adds 1 session bankroll drawdown analyzer kernel landed in Wave 157/158 (**INDUSTRY-FIRST** UKGC LCCP 3.4.3 / MGA Player Protection §16 / EU EBA 2024 Responsible Gambling Directive / AU NCPF Reform 2022 — **50. closed-form solver milestone** — real-money session bankroll first-passage time via Inverse Gaussian distribution τ ~ IG(B/|μ|, B²/σ²); 3 drift regime branches (negative=IG sure bust, zero=driftless BM half-normal first-passage, positive=P_ever_bust=exp(−2B|μ|/σ²)); regulator disclosure metrics medianMinutesToBust + oneInNHoursBust + expectedLossPerHour + survivalProbByHorizon grid)
> - v2.37 (Wave 160) — adds 1 hit frequency distribution decomposition analyzer kernel landed in Wave 159/160 (**INDUSTRY-STANDARD** UKGC RTS 14 Tag 12 / MGA Player Protection §11.f / eCOGRA Generic Slots Audit / AU NCPF Reform 2022 Schedule 3 — **51. closed-form solver, first explicit distribution-decomposition kernel** u portfolio; per-tier hitFreq + 1-in-N + condEV + rtpContribution + rtpShareOfTotal + top-X% RTP concentration (1%/5%/10%) + Hill-estimator Pareto α heavy-tail diagnostic; automates UKGC operator hit-rate disclosure that is currently compiled manually in spreadsheets)
> - v2.38 (Wave 162) — adds 1 max drop from starting bankroll during session analyzer kernel landed in Wave 161/162 (**INDUSTRY-FIRST** UKGC LCCP 3.4.3 / MGA Player Protection §17 / EU EBA Responsible Gambling Directive 2024 / AU NCPF Reform 2022 — **52. closed-form solver, COMPLETES responsible-gambling math triad** sa W154 (bonus WR) + W157 (terminal bust) + W161 (intra-session max drop); Karatzas-Shreve §3.5 Bachelier/Reflection-Principle one-sided survival fn P(MaxDrop_T ≥ d) = Φ(−(d+μT)/(σ√T)) + exp(−2μd/σ²)·Φ(−(d−μT)/(σ√T)); composite Simpson integration za E[MaxDrop], bisection percentile p90/p95/p99; 3 drift regimes; regulator disclosure metrics probMaxDrawdownExceedsLimit + oneInNSessionsExceedsLimit)
> - v2.39 (Wave 164) — adds 1 Martingale wager progression bust time analyzer kernel landed in Wave 163/164 (**INDUSTRY-FIRST chase-pattern detection** UKGC LCCP 3.4.3 / MGA Player Protection §18 / AU NCPF Reform 2022 Schedule 4 "mandatory by 2025" — **53. closed-form solver, first SEQUENTIAL bet-progression strategy kernel** u portfolio; Markov chain over consecutive-loss streak; k_max = ⌊log₂(B/b_0+1)⌋−1 max survivable doubles; P(bust per round) = q^(k_max+1) geometric tail; E[T_rounds_bust] = 1/q^(k_max+1); chasePatternRiskScore ∈ [0,1] regulator alert metric; NHS Gambling Harms 2024 cites Martingale as #1 chase pattern)
> - v2.40 (Wave 166) — adds 1 Reverse Martingale (Paroli) Streak Cash-Out analyzer kernel landed in Wave 165/166 (**INDUSTRY-FIRST let-it-ride chase pattern** UKGC LCCP 3.4.3 / MGA PPD §18 / AU NCPF Schedule 4 — **54. solver, DUAL of W163 Martingale**, NHS Gambling Harms 2024 cites Paroli as **#2 chase pattern** after Martingale; Markov over consecutive-WIN streak; probReachStreak=p^k geometric; cashOutPayout=b_0·(2^k−1); E[roundProfit] closed-form sa geometric sum (2p)^j; bankroll cap k_max; chasePatternRiskScore. Together with P-073 covers complete sequential bet-progression pair = #1 + #2 NHS chase patterns)
> - v2.41 (Wave 168) — adds 1 AWP Cycle Convergence analyzer kernel landed in Wave 167/168 (**INDUSTRY-FIRST UK Class III B3/B3A/C/D finite-cycle disclosure** UKGC LCCP / MGA AWP §15 / EU GA 2024 compensated math — **55. solver, first analyzer ABOVE existing IR state machine** (`src/jurisdiction/compensatedMath.ts`); čita partial-cycle snapshot (n, P_n) i projektuje analytical regulator stats: E[r_N]=(P_n+m·R*·b)/(N·b), stdDev=σ·√m/N (shrinks → 0 as cycle completes), P(|D_N|>τ) Bachelier-CLT, compensationHintRecommended, cycleHealthScore ∈ [0,1])
> - v2.42 (Wave 170) — adds 1 Drop-and-Stick Wild Expansion analyzer kernel landed in Wave 169/170 (**per-cell sticky accumulation** NetEnt Witchcraft Academy / Pragmatic Wild West Gold / Hacksaw Tombstone / Push Mount Magmas / Yggdrasil Vikings Go Berzerk iconic — **56. solver**; N×M grid iid Bernoulli(q) per cell, wild stays sticky S spins; perCellActiveSteady=1−(1−q)^S geometric saturation; E[W_∞]=N·M·perCellSteady; Var=N·M·p·(1−p) iid; time-averaged closed-form; gridFillProb=perCellSteady^(N·M); distinct od W53/W93/W114/W132)
> - v2.43 (Wave 172) — adds 1 Tumbling Cascade Chain Length analyzer kernel landed in Wave 171/172 (**Wald identity** za tumbling slot chain — Pragmatic Sweet Bonanza / NetEnt Gonzo Quest / Reactoonz / Big Bass tumble FS / Hacksaw Tombstone tumble — **57. solver**; chain C ~ Geometric(p), E[C]=p/(1−p), Var[C]=p/(1−p)², P(C≥k)=p^k survival; Wald: E[total]=E[C]·E[Y], Var[total]=E[C]·Var[Y]+Var[C]·(E[Y])²; distinct od W86/W102/W121/W138/W146)
> - v2.44 (Wave 174) — adds 1 Pick-and-Click Pooper Bonus analyzer kernel landed in Wave 173/174 (**Negative Hypergeometric** za pick-bonus terminator mechanic — Aristocrat 5 Dragons / IGT Wheel of Fortune Pick-a-Pack / Bally Quick Hit pick-a-prize / NetEnt Gonzo's Quest Bonus / Konami China Shores / Aristocrat Buffalo Gold pick-coin / Light & Wonder Wonder 4 — **58. solver**; T ~ NHG(N, K, r=1), E[T]=M/(K+1), Var[T]=M(N+1)K/((K+1)²(K+2)), P(T=0)=K/N first-pick-pooper; Wald compound za total payout S = Σ V_i: E[S]=E[T]·μ_V, Var[S]=E[T]·σ²_V + Var[T]·μ_V²; cap truncation residual mass; distinct od W107 N-stage tree / W118 collect-N Markov / W116 mystery / W160 baseline single-reveal / W171 Geometric WITH replacement — NHG = WITHOUT replacement)
> - v2.45 (Wave 176) — adds 1 Skill-Stop Near-Miss Rate analyzer kernel landed in Wave 175/176 (**INDUSTRY-FIRST anti-near-miss regulatory inflation detector** — multi-regime UKGC RTS 12 BANNED / JP Pachislot 風営法 §2(7) ≤ 1.5× cap / AU NCPF 2022 §3.4 1.2× cap / AGCO Slot Standards 2024 §5.7 / EU GA 2024 — **59. solver**; baselineNearMissRate = 2K·M/N uniform-stop, inflationRatio = observed/baseline, regulatoryFlag = (inflation > tol + noise); regime-aware tolerance switching {UKGC:1.0, AGCO:1.0, AU_NCPF:1.2, JP_PACHISLOT:1.5}; multi-reel R-reel anyReelNM=1−(1−p)^R, allButOneWinNM=R·win^(R−1)·obs (4-of-5 jackpot+1 NM most psychologically salient); frustrationRatio = inflation·2K cognitive amplification per Reid 1986 / Harrigan-Dixon 2009 / Templeton 2015; disclosureText emits regulatory-body language za help-screen + cert audit; distinct od W127 anticipation animation / W163 chase / W167 above-IR cycle / W123 expansion / W93 winning aggregation)
> - v2.48 (Wave 181) — adds 1 Reel-Bound Mystery Progressive analyzer kernel landed in Wave 181 (**L&W M5 GAP CLOSURE — 62. solver post-milestone** — Quick Hit family 8+ titles SG Quick Hit Platinum / Black Gold / Pro 9-tier / Wild / Blitz / Cash Wheel / Triple Cash Wheel / Bally Smokin 7s; per-reel Bernoulli sa adjacency-reel-count tier mapping, prefix_k = ∏ p_i, tier_k = prefix_k − prefix_{k+1}, top tier = prefix_R; per-tier RTP share + 1-in-N disclosure; distinct od P-035 multi-tier WAP wheel / P-051 unconditional aggregator / P-033 single-pool must-hit / P-034 escalating-hazard)
> - v2.73 (Wave 230) — adds 1 Running RTP Drift CUSUM Control Chart Analyzer kernel landed in Wave 230 (**87. solver, INDUSTRY-FIRST SQC (Statistical Quality Control) kernel** za UKGC RTS 14 Tag 12 (RTP-drift monitoring) + GLI-19 §8.6 (SQC of deployed games) + MGA PPD §24 (monthly RTP audit gate) + EU EBA Technical Standards 2024 Annex VIII + AU NCPF Schedule 11 (RNG QA) + NJ DGE 13:69D-1.5 (variance certification). Trigger: Sportech £19M (2023) + Genting £3.6M (2023) + Crown Resorts A$450M (2022) RTP/game-integrity fines. **87th solver — first SQC kernel** u portfolio: sve prior W001-W229 modeluju FORWARD probability/EV; ovaj **INVERZNI PRAVAC** — BACKWARD inferential drift detection. **Two-sided CUSUM** (Page 1954): S^+_n = max(0, S^+_{n-1} + Z_i − k); S^-_n = max(0, S^-_{n-1} − Z_i − k); alert: max(S^+, S^-) > h. **ARL_0 (Siegmund 1985 corrected)**: ARL_0(h, k) ≈ (exp(2k·h) − 2k·h − 1) / (2k²) — for k=0.5, h=4: ARL_0 ≈ 99 spins between false alarms (UKGC canonical). **ARL_1 (Hawkins-Olwell 1998)**: ARL_1(δ, h, k) ≈ (exp(−2·δ·h) + 2·δ·h − 1) / (2·δ²) sa δ = shift − k — for k=0.5, h=4, Δ=1: ARL_1 ≈ 6 spins to detect 1σ shift. **Per-month conversions**: monthsToDetection = ARL_1 / spinsPerMonth + probFalseAlertPerMonth = 1 − exp(−1/ARL_0_months) Poisson approx. **Composite detection score** ∈ [0, 1]. **UKGC RTS 14 compliance**: k ≥ 0.5σ ∧ h ≥ 4σ ∧ tol ≤ 0.005 (±0.5% monthly). **6/6 acceptance** UKGC canonical k=0.5/h=4 + strict audit k=0.5/h=5 + high-volume operator 10M spins + small 0.5σ shift detection + corner overly sensitive (comply=false) + corner moderately conservative @ 1200 MC chart runs × 300K-spin horizon. Distinct od W148-W229 (sve FORWARD probability/EV) — ovaj BACKWARD inferential drift detection (statistical process control).
> - v2.72 (Wave 229) — adds 1 Operator KYC/AML Sanction-Screening Risk Analyzer kernel landed in Wave 229 (**86. solver, INDUSTRY-FIRST AML/COMPLIANCE kernel** za UKGC LCCP 3.5.5 (Oct 2024 sens ≥ 0.99 mandate) + UK MLR 2017 + EU AMLD6 (2024) + AU AUSTRAC Act 2006 + DE Geldwäschegesetz §10 + FATF Rec 10/11 customer due diligence. Trigger: Entain £18M / William Hill £19M / Betway £11M / 888 £9.4M AML fine cascade 2022-2024. **86th solver — first AML/COMPLIANCE kernel** u portfolio: sve prior W001-W228 modeluju gaming-math + RG + operator-capital + CRM dimensije; ovaj modeluje **operator AML compliance economic exposure**. **Daily FP/FN rate decomposition**: FP = λ_new · (1−p_match) · (1−spec) + FN = λ_new · p_match · (1−sens). **Annual cost projection**: total = annualFP·c_FP + annualFN·c_FN + overhead. **Bayesian Beta-Binomial posterior**: Prior θ ~ Beta(α, β), observed k hits u n screenings → Posterior Beta(α+k, β+n−k), E[θ_post] = (α+k)/(α+β+n). **Regulator detection + fine exposure**: P_detection = 1 − (1 − P_audit)^expectedMissed, expectedAnnualFineExposure = P_detection · finePerViolation. **Composite AML risk score** ∈ [0, 1]: 0.6·norm(FN) + 0.4·norm(fineExposure_to_max_£20M). **UKGC LCCP 3.5.5 compliance**: sens ≥ 0.99 ∧ spec ≥ 0.95 ∧ cadence ≤ 1d. **6/6 acceptance** UK mid-tier (500/d) + UK large best-in-class (5K/d sens=0.995) + EU AMLD6 strict (2K/d sens=0.999) + AU AUSTRAC micro (sub-mandate cadence=7d) + corner bad-screening (sens=0.9 → risk=0.75 fine exposure £15M) + corner best-in-class (sens=0.9995). Distinct od W148/W154/W157-W167 (player gaming math) / W220-W226 (player RG) / W227 (operator capital VaR) / W228 (commercial LTV). Sad pokriveno 6 dimenzija portfolio: gaming math + responsible gambling + operator capital + commercial CRM + AML compliance.
> - v2.71 (Wave 228) — adds 1 Player Lifetime Value (LTV) Bayesian Predictive Analyzer kernel landed in Wave 228 (**85. solver, INDUSTRY-FIRST COMMERCIAL/MARKETING/CRM kernel** za UKGC RTS 5 (advertising transparency + LTV disclosure, White Paper 2024 update) + UKGC GA Reform §6.7 (marketing-spend disclosure ratio) + EU EBA Marketing Directive 2024 Annex VII + AU NCPF §11 (CAC ≤ 30% LTV mandate) + DE GlüStV §5b + IRL Gambling Reg Bill §3.18. **85th solver — first COMMERCIAL kernel** u portfolio: sve prior W001-W227 modeluju regulator-compliance (player harm + operator solvency); ovaj **shift na commercial-side** LTV/CAC/ROAS decisioning. **Geometric churn model** (Schmittlein-Morrison-Colombo 1987 simplification): N_active ~ Geometric(θ_churn), **E[N] = 1/θ**, Var[N] = (1−θ)/θ². **LTV calculations**: LTV_undisc = E[M]/θ + **LTV_disc = E[M]·(1+r)/(θ+r)** via geometric series sum. **CAC payback**: m_payback = log(1 − CAC·θ/μ_M) / log(1−θ); Infinity ako CAC·θ ≥ μ_M (never recoupable). **LTV/CAC ratio** (industry ≥ 3 healthy / ≥ 5 excellent). **Bayesian posterior na churn**: Beta(α, β) prior + observed n active months → Beta(α, β+n) posterior, E[θ_post] = α/(α+β+n) (player persistence reduces churn estimate). **ROAS = revenue/spend** sa UKGC RTS 5 disclosure threshold check. **isCompliantUkgcRts5** boolean: CAC ≤ 30% LTV ∧ ROAS ≤ threshold. **6/6 acceptance** UK social media + UK affiliate + EU TV premium + AU search + corner unprofitable channel + corner VIP segment @ 30K Geometric churn lifetimes. Distinct od W148/W154/W157-W167 (player first-passage) / W220-W226 (player RG) / W227 (operator capital) — ovo je **CRM/marketing decisioning + Bayesian inference** dimenzija.
> - v2.70 (Wave 227) — adds 1 Operator Daily P&L Value-at-Risk Analyzer kernel landed in Wave 227 (**84. solver, INDUSTRY-FIRST OPERATOR-side capital kernel** za UKGC Gambling Act 2005 §3 + Gambling Commission Capital Adequacy Guidance 2024 update (posle Sportech £19M shortfall 2023) + MGA Capital Requirement Directive §28 + EU EBA Solvency II analog Pillar 1 + Basel III Op Risk Add-On + AU NCPF §10 ($1M minimum reserve). **84th solver — first OPERATOR-side risk-capital kernel** u portfolio: sve prior W001-W226 modeluju PLAYER-side; ovaj OKREĆE OBJEKTIV na OPERATOR-side daily P&L distribution i required-reserve capital. **Daily GGR aggregation via CLT**: μ_GGR = λ_sessions · μ_per_session + σ²_GGR = λ_sessions · σ²_per_session. **Basel III stress-test (zero-drift) VaR**: **VaR_α(T) = z_α · σ_GGR · √T** sa z_α = Φ^(-1)(α) (Beasley-Springer-Moro inverse normal 1e-9 accuracy); conservative — ignores expected profit za regulatory reserve sizing. **Expected Shortfall**: ES_α = σ_GGR · √T · φ(z_α) / (1 − α) ≥ VaR_α (coherent risk measure). **Jackpot tail-event reserve**: jackpotTailReserve = jackpot_max · trigger_prob_per_day · 365 · safety_factor (heavy-tail rare-event buffer). **Required reserve capital**: requiredReserveCapital = max(VaR_α, jackpotTailReserve, minimumReserve). **Solvency ratio**: solvencyRatio = operatorOwnFunds / requiredReserveCapital, mandatory ≥ 1.0 (UKGC ≥ 1.2 recommended). **isCompliantUkgcGa2005** = (solvency ≥ 1.0 ∧ ownFunds ≥ minimumReserve). **6/6 acceptance** UK small £1M + UK mid-tier £5M + EU large £50M + AU NCPF micro A$1M + corner undercapitalized + corner well-capitalized £100M @ 60K T-day P&L Normal MC paths. Distinct od W148-W167 (player-side first-passage) / W220-W226 (player-side RG) — ovo modeluje OPERATOR-side Basel-III-style VaR/ES za solvency reporting.
> - v2.69 (Wave 226) — adds 1 Pre-Commitment Loss-Limit Effectiveness Analyzer kernel landed in Wave 226 (**83. solver, INDUSTRY-FIRST BEHAVIORAL-COMMITMENT kernel** za AU NCPF Reform 2022 Schedule 5 §5.2 (mandatory player-set loss limits sa 24h cooling-off) + UKGC LCCP 3.4.5 (delayed-increase mandate Apr 2024) + EU EBA RG Directive 2024 Annex VI (pre-commitment default-on UI) + NL KSA RWA §11 (mandatory pre-deposit limit) + DE GlüStV §6c (€1000/month default). **83rd solver — first BEHAVIORAL-COMMITMENT kernel** u portfolio: sve prior W220-W225 RG kerneli modeluju OPERATOR/REGULATOR-side enforcement; ovaj modeluje **PLAYER-side voluntary pre-commitment** sa empirically observed adherence rates (Wood-Griffiths 2018, Auer-Hopfgartner 2022). **Truncated-Normal expectation** (Greene 2012 §22.4): X ~ Normal(μ, σ²), **E[min(X, L)] = μ·Φ(z) − σ·φ(z) + L·(1 − Φ(z))** sa z = (L − μ)/σ. **Adherence blending**: α ∈ [0.4, 0.85] = fraction sessions respecting L_d (empirical), γ ≥ 1 = escalation factor; **E[loss_effective] = α · E[min(X, L)] + (1 − α) · E[min(X, γL)]**. **Harm reduction**: harmReduction = (μ − E[effective])/μ ∈ [0, 1]. **Disclosure**: expectedLossNoLimit + expectedLossWithLimit + expectedLossEscalatedLimit + expectedLossEffective + probSessionHitsLimit + harmReductionFromLimit + expectedAnnualLossNoLimit/WithLimit + absoluteAnnualHarmReduction + expectedAnnualSessionsAtLimit + expectedAnnualLimitBreachAttempts + isCompliantAuNcpfSection5 boolean (defaultDailyLimit ≤ A$50 ∧ α ≥ 0.5 ∧ cooling ≥ 24h). **6/6 acceptance** AU NCPF A$50 + UK tight £25 + EU EBA high-roller £200 + NL KSA €50 + corner low-adherence + corner perfect-adherence @ 120K Normal session-loss MC draws + Bernoulli(α) adherence flag. Distinct od W148/W154/W157-W167 (within-session bez limit-setting) / W220 (SYSTEM-enforced session boundary) / W222-W225 (per-spin/multi-day/month/lifetime) — ovo modeluje voluntary PLAYER-SET daily limit sa empirical adherence/escalation behavior.
> - v2.68 (Wave 225) — adds 1 Self-Exclusion (GAMSTOP) Lifecycle Markov Analyzer kernel landed in Wave 225 (**82. solver, INDUSTRY-FIRST LIFECYCLE MARKOV kernel** za UKGC RTS 7B mandatory GAMSTOP (Mar 2020, expanded Apr 2024 multi-operator cross-licensing) + MGA PPD §23 (national register) + EU EBA RG Directive 2024 Annex V (cross-border CRUKS/ROFUS/GAMSTOP harmonization) + AU NCPF Schedule 9 BetStop (2025) + DE OASIS (2021+). **82nd solver — first LIFECYCLE MARKOV kernel** u portfolio: sve prior (W001-W224) modeluju jedan harm-signal aspekt (payouts/rates/sessions/affordability/temporal); ovaj modeluje **kompletan player-lifecycle** kao 3-state continuous-time Markov chain {ACTIVE, EXCLUDED, PERMANENT} sa absorbing PERMANENT terminal state. **Q-matrix generator**: A→E rate λ_se (self-exclusion onset, from upstream W224 vulnerability) + E→A rate 1/D_se (deterministic mean SE duration expiry) + ⋆→P rate λ_p (permanent absorption). **Stationary distribution** (transient {A,E}): balance condition π_e/π_a = λ_se·D_se → **π_a = 1/(1 + λ_se·D_se)**, **π_e = (λ_se·D_se)/(1 + λ_se·D_se)**. **Annual disclosure**: annualSelfExclusionEpisodes = π_a·365·λ_se + expectedDaysActivePerYear = π_a·365 + expectedDaysExcludedPerYear = π_e·365 + expectedDaysToFirstSE = 1/λ_se (Exponential mean) + expectedDaysToPermanent = 1/λ_p (Geometric absorption) + harmReductionScoreFromSE = π_e + isCompliantUkgcRts7b boolean (D_se_min ≥ 180d ∧ D_se_max ≤ 1825d ∧ cooling ≥ 24h). **6/6 acceptance** UKGC typical + UKGC high-risk + AU BetStop 12mo + DE OASIS + corner modest-risk + corner severe-player @ 547500 simulated player-days (300 episodes × 1825 days × 6 configs). Tolerance regime-aware za continuous→discrete approximation gap. Distinct od W148-W167 (within-single-session) / W220 (single-session boundary) / W222 (per-spin time-rate) / W223 (multi-DAY cool-off count) / W224 (multi-MONTH spend stratification) — ovo je LIFETIME 3-state absorbing Markov.
> - v2.67 (Wave 224) — adds 1 Customer Affordability Stratification Analyzer kernel landed in Wave 224 (**81. solver, INDUSTRY-FIRST AFFORDABILITY kernel** za UKGC RTS 14E (LCCP 3.4.3 mandatory affordability checks Aug 2024 — £19M Entain fine + £5.9M Flutter fine 2024-2025 trigger) + MGA PPD §22 + EU EBA RG Directive 2024 Annex IV + AU NCPF Schedule 8 ($1000 AUD) + NL KSA §10 (€350 auto-pause) + CA Ontario AGCO §3.5 ($500 CAD). **81st solver — first AFFORDABILITY kernel** u portfolio: sve prior (W001-W223) modeluju harm-signal sa space/time/session dimenzija; ovaj modeluje **financial-pattern dimenziju** preko Log-Normal monthly-spend distribucije (Gainsbury 2020, Auer-Griffiths 2017). **Log-Normal model**: X ~ Log-Normal(μ, σ²), E[X] = exp(μ+σ²/2), median = exp(μ), CDF F(x) = Φ((ln(x)−μ)/σ), quantile via Beasley-Springer-Moro inverse-normal. **Affordability tiers** (UKGC RTS 14E defaults): T0 < £50 (no check), T1 £50-100 (light), T2 £100-500 (low-harm review mandatory Aug 2024), T3 £500-2000 (enhanced Equifax API), T4 ≥ £2000 (full income verification). **K-of-M rolling-window trigger** via Binomial: P_trigger = 1 − Σ_{k=0..K-1} C(M, k)·p^k·(1−p)^(M−k); expectedRollingTriggersPerYear = (12 − M + 1) · p_per_window (distinct overlapping windows). **Disclosure metrics**: meanMonthlySpend + medianMonthlySpend + coeffVar + p75/p90/p95/p99 percentiles + tierDistribution {T0..T4} (sums to 1) + probAboveLowHarm/Enhanced/FullCheck + annual review counts + financialVulnerabilityScore ∈ [0,1] (weighted 0.4·P>£100 + 0.3·P>£500 + 0.3·P>£2000) + isCompliantUkgcRts14e boolean. **6/6 acceptance** UK typical (median £85) + UK low-spender (median £25) + UK high-roller (median £600) + AU NCPF $1000-threshold + NL KSA €350-strict + corner problem-gambler high-variance (σ=2.5) @ 216K Log-Normal monthly samples, Box-Muller normal + exp transform. Distinct od W148 (payout cap) / W154 (bonus WR) / W157/W161 (within-session bankroll) / W163/W165 (bet progression) / W220 (single-session boundary) / W222 (per-spin time) / W223 (multi-DAY cool-off count) — ovo je multi-MONTH spend-distribution stratification.
> - v2.66 (Wave 223) 🎯 — adds 1 Session Cool-Off Enforcement Markov Chain Analyzer kernel landed in Wave 223 (**🎯 80. solver, P-100 MILESTONE, INDUSTRY-FIRST MULTI-SESSION TEMPORAL kernel** za UKGC RTS 11 mandatory cool-off enforcement (Apr 2025, K=5 loss-stops/D=7 days/≥24h forced break) + MGA Player Protection Directives §20 + EU EBA Responsible Gambling Directive 2024 Annex III + AU NCPF Reform 2022 Schedule 7 (stricter K=3/48h). **80th solver — first MULTI-SESSION kernel** u portfolio: sve prior (W001-W222) modeluju within-single-session payouts/rates; ovaj **akumulira harm-signal kroz dane** sa first-passage do regulator-mandated forced-break absorbing state. **Daily Poisson hazard model**: λ_day = probLossStopPerSession · sessionsPerDay; N_window ~ Poisson(λ_day · D) (Poisson process restriction). **Stationary daily trigger prob**: P_trigger = 1 − Σ_{n=0..K-1} e^(-λD)·(λD)^n/n! (Poisson tail). **Empty-history first-passage** (validated against 500-year MC): E[T_first] = **max(K/λ_day Gamma-mean burst regime, 1/P_trigger geometric sparse regime)** — handles both burst (λD>>1) and sparse (λD<<1) Poisson regimes. **Disclosure metrics**: coolOffTriggerProbPerDay + expectedDaysToFirstCoolOffMarkov + annualCoolOffsExpected (via E[cycle]=T_first+coolOffDuration) + fractionOfYearInCoolOff + oneInNDaysCoolOff regulator form + harmReductionScore ∈ [0,1] + isCompliantUkgcRts11 boolean (K≤5 ∧ D≤7 ∧ hrs≥24). **6/6 acceptance** UKGC moderate + UKGC heavy + AU NCPF stricter + MGA relaxed + corner low/high risk @ 500-year MC each = 1.825M simulated days. Distinct od W157/W161/W163/W165/W167 (within-single-session) / W220 (single-session dual-stop) / W222 (per-spin time-rate ne multi-day).
> - v2.65 (Wave 222) — adds 1 Spin Velocity / Auto-Play Time Compliance Analyzer kernel landed in Wave 222 (**79. solver, INDUSTRY-FIRST TIME-RATE kernel** za UKGC SI 2025/215 Sch 3 §8.4 mandatory 2.5s + AU NCPF Reform 2022 Schedule 6 (3.0s + sound mute) + DE GlüStV §6 Abs 4 (5.0s strictest EU) + NL KSA RWA §7 (4.0s) + MT MGA PPD §11 (effective spins/hour disclosure) + CA Ontario AGCO §3.4.7. **Natural player click rate model**: X ~ Gamma(k, θ) (Harrigan-Dixon 2009, Templeton 2015), E[X] = k·θ, CDF F(x) = γ(k, x/θ)/Γ(k) (regularized lower incomplete gamma); **throttled interval** Y = max(X, T_min) sa **E[Y] = T_min·F(T_min) + k·θ·(1 − F_{k+1}(T_min))** (NR 6.2 lemma ∫x·f_k(x)dx = k·θ·P(Gamma(k+1) ≥ t)). Numerical recipe: series for x < k+1 (NR 6.2.5) + continued fraction for x ≥ k+1 (NR 6.2.6) + Lanczos log-gamma (g=7, n=9, 1e-15 accuracy). Disclosure metrics: naturalSpinsPerMinute + effectiveSpinsPerMinute + spinRateThrottleImpact ∈ [0,1] + probIntervalBelowRegulatory + expectedSpinsBeforeFirstRealityCheck + oneInNSpinsRealityCheckTriggered + velocityHarmScore ∈ [0,1] + compliesWithRegulatoryMinimum boolean. **6/6 acceptance** UKGC + AU + DE + NL + MT + extreme-fast-tapper @ 20K Gamma draws each, MC sa Marsaglia-Tsang Gamma sampler — all rel errors ≤ 3%. Distinct od W110 (Neg-Binom bonus trigger TIME, event-count ne rate) / W163 (Martingale spins-to-bust ne time-rate) / W167 (cycle compensation) / W220 (cumulative-net session stop ne TIME).
> - v2.64 (Wave 220/221) — adds 1 Auto-Spin Dual-Stop (Loss/Win Limit + Spin Count Cap) Analyzer kernel landed in Wave 220/221 (**78. solver, INDUSTRY-FIRST two-sided-barrier + horizon first-passage kernel** za UKGC RTS 13B + MGA PPD §19 + EU EBA RG Directive Annex II + AU NCPF Schedule 5 (mandatory 2025) — Bachelier-Wiener drifted random walk sa **tri absorbing conditions**: cumulative net ≤ −L_loss (loss_stop), cumulative net ≥ +L_win (win_stop), spin counter ≥ N_max (spin_limit); μ = bet·(RTP−1), σ² = bet²·v; closed-form **P(hits +b before −a) = (e^(λa) − 1)/(e^(λa) − e^(−λb))** where λ = 2μ/σ² (Karatzas-Shreve §5.18, μ→0 lim = a/(a+b)); **P(spin_limit) via Shreve §3.7.4 hit-time CDF union-bound** P(any barrier hit by Nmax) ≈ min(1, P_hit_lower + P_hit_upper) — handles all drift regimes (negative/zero/positive) within ±5pp MC; disclosure metrics: probLossStopFired + probWinStopFired + probSpinLimitFired (sum=1) + expectedSpinsToStop (bounded by N_max) + expectedFinalNetWin (3-pathway weighted) + oneInNSessionsLossStop regulator form + sessionRiskScore ∈ [0,1] composite; distinct od W157 (single barrier bust to 0, no win cap, no spin limit) / W161 (one-sided max drop statistic) / W163/W165 (bet-progression chains) / W167 (finite-cycle compensation) / W148 (payout-level cap))
> - v2.63 (Wave 196) — adds 1 Stacked Multi-Wheel Composition Aggregator kernel landed in Wave 196 (🏆 **L&W M6 P1 FINAL GAP CLOSURE — 77. solver — 16/16 L&W KIMI GAPS NOW CLOSED, 100% L&W mehanika coverage** — LNW Bally Triple Cash Wheel 2022 (defining title 3 stacked wheels) + Bally Quick Hit Cash Wheel 2014 (cash-tier × multiplier composition) + Bally Cash Wheel Quick Hit 2014 + future L&W multi-wheel flagships; **N stacked independent wheels sa per-wheel discrete PMF aggregation** — N wheels, per wheel i: M_i slices sa (p_{i,j}, V_{i,j}) discrete distribution, Σ p_{i,j} = 1; per-wheel μ_i = Σ p·V, σ²_i = Σ p·V² − μ²; joint Y = Σ W_i sa **E[Y] = Σ μ_i (linearity)** i **Var[Y] = Σ σ²_i (independence)**. Per-wheel UKGC RTS-14 disclosure: expectedPayout + variancePayout + contributionToTotalRtp + varianceContribution + topSliceProbability + topSlicePayout + oneInNSpinsForThisWheelTopSlice + isBestWheel. Per-slice disclosure: probability + payout + isTopSlice. **probabilityAllTopSlice = Π_i p_{i,top}** (joint grand jackpot), **probabilityAtLeastOneTopSlice = 1 − Π (1−p_{i,top})**, oneInNSpinsAllTopJackpot = 1/Π. commercialUpliftVsSingleWheel = E[Y]/μ_best, **independenceVarianceRatio = σ_Y / Σ σ_i** (= 1/√N za identical wheels, < 1 indicates independence; = 1 for fully correlated wheels) — Pearson-style variance decomposition disclosure. Distinct od P-022 (W104) Wheel Bonus (SINGLE wheel sa categorical slice; ovde **N stacked**) / P-046 (W118) Wheel Respin (Markov chain triggers; ovde **simultaneous independent** wheels) / P-035 (W075) Multi-tier WAP Wheel (per-tier WAP jackpot; ovde **per-wheel PMF**) / P-093 (W192) Race/Competitive Pick (categorical one-winner; ovde **all wheels pay**) / P-091 (W190) Nested Mini-Slot (hierarchical; ovde **flat parallel**) / P-030 (W110) Parallel Screens (slično N-screen aggregation, ali ovde specifično **N-wheel composition sa per-wheel PMF + Π joint top-slice jackpot**))
> - v2.62 (Wave 195) — adds 1 Mid-Spin Random Reel-Reshape Mixture Aggregator kernel landed in Wave 195 (**L&W M13 P1 GAP CLOSURE — 76. solver** — LNW WMS Wizard of Oz Follow the Yellow Brick Road 2017 (defining title — Glinda the Good Witch waves wand mid-spin, replaces entire reel set sa alternative paytable) + Wizard of Oz Munchkinland reshape variants + future L&W reshape-mechanic flagships; **K-component reel-set mixture distribution sa stochastic mid-spin reel-set transition** — per spin K ~ Categorical(p_0..p_{K-1}), p_0 = base no-reshape, p_k = reshape to alternative reel-set k; per-set X_k iid sa distinct (μ_k, σ²_k) own paytable distribution. Y = X_K → **E[Y] = Σ p_k·μ_k** mixture mean (= total RTP), **E[Y²] = Σ p_k·(σ²_k+μ²_k)**, **Var[Y] = E[Y²] − E[Y]²** mixture variance. **Decomposition (conditional variance identity)**: Var[Y] = E[Var[Y\|K]] + Var[E[Y\|K]] = **Σ p_k·σ²_k (within-set)** + **Σ p_k·μ²_k − (Σ p_k·μ_k)² (between-set)**; withinSetVarianceShare ∈ [0,1] disclosure. Per-set disclosure UKGC RTS-14: contributionToRtp = p_k·μ_k/E[Y] + oneInNSpinsForThisSet = 1/p_k + rankByMeanPayout + isBestReelSet + isBaseReelSet. reshapeProbability = 1 − p_0, oneInNSpinsAnyReshape = 1/(1−p_0), **commercialUpliftVsBaseOnly = E[Y] / μ_base** (reshape uplift over base-only RTP), bestReelSetUpliftIfReshape = μ_best/μ_base, oneInNSpinsBestReelSet = 1/p_best. Distinct od P-094 (W193) Multi-Pot Branched H&S (TRIGGER-gated Y=0 if no trigger; ovde **no-trigger pathway also pays** base reel-set, mixture distribution ne trigger gating) / P-089 (W188) Player-Elects Composition (player CHOOSES; ovde **vendor-categorical** mid-spin Glinda decision) / P-067 (W150) Voltage Meter (cumulative meter; ovde **per-spin** state Categorical reshape) / P-058 (W137) Markov Wild State Tier (within-feature state; ovde **reel-set** switching at engine level) / P-022 (W104) Wheel Bonus (wheel slice payout; ovde **per-spin reel-set selection** sa own internal distribution))
> - v2.61 (Wave 194) — adds 1 Arcade-Shooter Survival Level Progression Aggregator kernel landed in Wave 194 (**L&W M16 P1 GAP CLOSURE — 75. solver** — LNW Lightning Box Stellar Jackpots wrapper (random-trigger arcade-shooter mini-game over 6 challenge levels — each level survival Bernoulli, fail ends run, reach final → jackpot prize) + Thundering Bison / Buffalo / Gorilla (2018-2024) + Chicken Fox (2018) + Lightning Horseman + 4+ Astro family Stellar variants; **sequential survival Markov chain sa absorbing failure state + per-level reward + terminal jackpot mixture** — L levels sa per-level Bernoulli pass p_i ∈ (0,1] i reward V_i; **S_k = ∏_{i<k} p_i** chain rule, **P(exit at k) = S_k·(1−p_k)** Σ exits + P(complete) = 1; **E[Y/run] = Σ S_{k+1}·V_k + S_{L+1}·μ_J** sum per-level passed rewards + jackpot-on-complete; Var[Y] via correlated-Bernoulli E[Y²] sa Cov[𝟙{pass j},𝟙{pass k}] = S_{max(j,k)+1} (nested indicator) + jackpot mixture E[J²] + cross term 2·S_{L+1}·μ_J·Σ V_k; per-level disclosure UKGC RTS-14: probReached + probPassed + probExitAtLevel + expectedRewardContribution; per-jackpot-tier disclosure: selectionProbWithinComplete + probabilityHitThisTier = S_{L+1}·π_k + oneInNRunsForTier = 1/(S_{L+1}·π_k); probabilityCompleteRun + expectedLevelReached = Σ k·exit_k + (L+1)·complete + oneInNRunsToComplete + jackpotMeanGivenComplete + jackpotShareOfRtp + probabilityGrandJackpot top-tier. Distinct od P-024 (W107) Pick Bonus N-Stage Tree (pick-stages bez survival product) / P-090 (W189) Random Feature-Injection FS (per-spin Bernoulli ne chain) / P-091 (W190) Nested Mini-Slot (single-level nested ne multi-level survival) / P-094 (W193) Multi-Pot Branched (categorical sub-mode one-winner ne sequential chain) / P-064 (W144) Trail Bonus Tracker (meter-based ne probabilistic survival) / P-046 (W118) Wheel Respin (multi-wheel Markov ne forward chain w/ absorbing failure))
> - v2.60 (Wave 193) — adds 1 Multi-Pot Branched H&S Sub-Feature Selection Aggregator kernel landed in Wave 193 (**L&W M15 P1 GAP CLOSURE — 74. solver** — LNW Bally Rich Little Piggies Piggy Bankin' Break In 2024 (defining title 3-pot branched H&S Instant Win / Double Play / Repeat Win) + World Class 2025 escalation + Rich Little Hens World Class 2025 hen variant; **trigger-gated categorical sub-mode mixture sa law of total variance** — T ~ Bernoulli(p_trigger), if T=1 then K ~ Categorical(p_1..p_M) gde p_k = w_k/Σ w_j, per-pot V_k ~ iid sa distinct (μ_k, σ²_k); Y = T·V_K → **E[V|trig] = Σ p_k·μ_k** mixture mean, **Var[V|trig] = Σ p_k·(σ²_k+μ²_k) − (E[V|trig])²** mixture variance; **E[Y/spin] = p_trigger · E[V|trig]**, **Var[Y/spin] = p_trigger·Var[V|trig] + p_trigger·(1−p_trigger)·(E[V|trig])²** via law of total variance; per-pot disclosure (UKGC RTS-14): contributionShareOfBonus = p_k·μ_k/E[V|trig] + oneInNTriggersForPot = 1/p_k + rankByMeanPayout + isBestPot; jackpotPotShare = max share, bonusVariabilityIndex = σ_V/μ_V coefficient of variation, oneInNSpinsTopPotTrigger = 1/(p_trigger·p_{best}), **mixtureVarianceLift = Var[V|trig] / Σ p_k·σ²_k** cross-pot diversity (>1 indicates heterogeneous pots). Distinct od P-089 (W188) Player-Elects Composition (player CHOOSES subset; ovde vendor-Categorical mixture bez player skill) / P-091 (W190) Nested Mini-Slot (single nested per outer-spin; ovde categorical branch among M heterogeneous sub-modes) / P-022 (W104) Wheel Bonus (flat per-slice; ovde each pot ima own distribution) / P-093 (W192) Race/Competitive Pick (player-elects single candidate; ovde vendor-categorical bez player pick) / P-068 (W155) Bonus Trigger Stratification)
> - v2.59 (Wave 192) — adds 1 Race/Competitive Pick One-Winner-Among-N Aggregator kernel landed in Wave 192 (**L&W M8 P1 GAP CLOSURE — 73. solver** — LNW WMS Goldfish Race for the Gold 2017 (defining title 4-fish race red/blue/yellow/gold pyramid prize) + LNW WMS Reel'em In Big Bass Bucks 2014 (5-angler fishing contest sa 14×–55× per-angler multiplier) + future L&W competitive-pick flagship variants; **categorical winner + player-pick gating × multiplier draw** — N candidates sa weights w_i, p_i = w_i / Σ w_j, K ~ Categorical(p_1..p_N), per-candidate (V_i basePrize, M_i multiplier draw sa μ_M_i, σ²_M_i); Y(pick=s) = V_s · M_s · 𝟙{K=s} → **E[Y | pick=s] = p_s · V_s · μ_M_s**, **Var[Y | pick=s] = p_s · V_s² · (σ²_M+μ²_M) − E[Y]²**; **bestPickIndex = argmax_s** E[Y|pick=s], **skillPremiumVsUniform = best − (1/N)·Σ E[Y|s]**, **rtpSpread = best − worst**, commercialUpliftOverSymmetric = bestRtp/uniformRtp; per-candidate disclosure rankByExpectedReturn + isRationalPick + expectedReturnIfPicked + probWin; probabilityBestPickWins = p_{s*}, expectedRacesToFirstBestWin = 1/p_{s*} (Geometric), probBestPickWinsAtLeastOnce(K races) = 1−(1−p_{s*})^K. UKGC RTS-12 mandatory player-skill mechanic disclosure. Distinct od P-089 (W188) Player-Elects Composition (m-of-N subset sa additive contributions, ne exactly-one-winner multiplicative gating) / P-024 (W107) Pick Bonus N-Stage Tree (sequential picks ne single pre-race election) / P-022 (W104) Wheel Bonus (no pre-pick gating) / P-046 (W118) Wheel Respin / P-068 (W155) Bonus Trigger Stratification)
> - v2.58 (Wave 191) — adds 1 Bonus Bank Running-Balance Offset Aggregator kernel landed in Wave 191 (**L&W M10 P0 GAP CLOSURE — 72. solver** — LNW Barcrest Rainbow Riches Megaways 2020 Bonus Bank (defining title sa 3 izbora "Bank Off Wins" / "Bank All Wins" / "Bank Small Wins") + future L&W banking-mode flagship variants; **per-spin bucketed aggregation sa player-elected banking transformation** — N FS spinova, per-spin W_k sa overall μ_W + per-bucket (p_low, μ_low, σ²_low | μ_high, σ²_high); **Mode A "bank_off_wins"** baseline T_A=ΣW_k → E[T_A]=N·μ_W; **Mode B "bank_all_wins"** multiplier m_B na pool → E[T_B]=m_B·N·μ_W, Var=m_B²·N·σ²_W; **Mode C "bank_small_wins"** Z=W·(1+(m_S−1)·𝟙{W≤τ}) → **E[Z]=p_low·m_S·μ_low+(1−p_low)·μ_high**, Var[Z]=E[Z²]−E[Z]² preko per-bucket conditional moments; **bestModeIndex** + rtpSpread + skillPremiumVsUniform za player choice value; **bonusBankAdditiveOffsetB = (m_B−1)·N·μ_W** linear; bankSmallContributionShareC per-spin uplift share; commercialUpliftBVsBaselineA = m_B disclosure. UKGC RTS-12 mandatory player-elected mode RTP disclosure (UK 2010+ Barcrest Bonus Bank regulation). Distinct od P-066 (W097) FS Lookback (POST-HOC max-sum disjoint segment, ne per-spin bucket banking) / P-089 (W188) Player-Elects Feature Composition (combinatorial m-of-N mode subset ne aggregation transformation) / P-087 (W186) Big Bet (paid pre-spin tier ne post-spin banking) / P-067 (W150) Voltage Meter (cumulative meter ne per-spin bucket gating))
> - v2.57 (Wave 190) — adds 1 Nested Mini-Slot Inside Bonus Compositional Aggregator kernel landed in Wave 190 (**L&W M14 P1 GAP CLOSURE — 71. solver** — LNW WMS LOTR Two Towers 2013 (defining Tower Spin nested mini-slot) + LOTR Return of the King 2013 + Star Trek nested-slot variants; **hierarchical composition sa law of total variance** — parent bonus has K_outer outer-spins, each sa Bernoulli(p_nested) injection of N_inner-spin nested sub-slot; **E[Y per parent] = p_bonus·K_outer·(μ_O + p_nested·N_inner·μ_inner)**, **Var[Y]** via two-level law of total variance (per-outer-spin + per-parent-spin Bernoulli mass); P(at least one nested|bonus) = 1−(1−p_nested)^K_outer; nestedSlotContributionShare + commercialUpliftVsNoNestedSlot disclosure; distinct od P-024 (W107) Pick Bonus N-Stage Tree (pick tree NO sub-spinner) / P-090 (W189) Random Feature-Injection During FS (single payoff per spin, ne K_outer-spin nested) / P-005/P-014 FS retrigger (same FS engine, ne independent paytable))
> - v2.56 (Wave 189) — adds 1 Random Feature-Injection During FS Aggregator kernel landed in Wave 189 (**L&W M12 P1 GAP CLOSURE — 70. solver** — Wizard of Oz Munchkinland 2014 + WMS sub-feature library variants; **compound per-FS-spin Bernoulli injection** — N FS spinova, per spin I_k~Bernoulli(p_inject) iid, if injected V_k iid sub-feature payout; **E[S] = N·μ_Y + N·p·μ_V**, **Var[S] = N·σ²_Y + N·p·σ²_V + N·p(1-p)·μ²_V**; **P(at least one injection) = 1−(1−p)^N**; injection share + uplift disclosure; distinct od P-005/P-014 FS retrigger (adds spins ne sub-feature) / P-066 (W097) FS Lookback (post-hoc multiplier ne per-spin injection) / P-076 (W169) drop-stick single-grid / P-081 (W179) sticky-trail accumulator / P-067 (W150) voltage K-tier)
> - v2.55 (Wave 188) — adds 1 Player-Elects Feature Composition Aggregator kernel landed in Wave 188 (**L&W M11 P1 GAP CLOSURE — 69. solver** — 4 L&W titles: Barcrest Rainbow Riches Pick n Mix 2014 (pick 3 of 5 bonuses), Bally Michael Jackson King of Pop 2013 (3 FS modes Smooth Criminal/Beat It/Billie Jean), Bally KISS (band-member FS variants), Shuffle Master 5 Treasures 2017 (5 FS modes); **m-of-N combinatorial composition selection** — N candidate modes sa distinct (r_i, σ²_i), player elects subset S of size m; under independence contributions sum: **E[Y \| S] = Σ_{i ∈ S} r_i**, **Var[Y \| S] = Σ σ²_i**; **best pick (rational)** = top-m by RTP desc, **worst pick** = bottom-m, **uniform pick** = (m/N)·Σ r_i (linearity over C(N,m) subsets); **skillPremium = bestPick − uniformPick** za player-knowledge value, **rtpSpread = bestPick − worstPick** za regulator disclosure; **numDistinctCompositions = C(N, m)** binomial; per-mode rankByRtp + inRationalTopMPick + contributionIfPicked disclosure; rationalityCoverageRatio = bestPick / fullPortfolio. Distinct od P-053 (W095) Ante Bet single-bet decision / P-057 (W130) FS Buy tier ne combinatorial / P-024 (W107) Pick Bonus N-Stage Tree sequential ne simultaneous / P-087 (W186) Big Bet ne player-elected modes)
> - v2.54 (Wave 187) — adds 1 Deterministic Explosion Multiplier-Drop Aggregator kernel landed in Wave 187 (**L&W M4 P1 GAP CLOSURE — 68. solver** — Dancing Drums Explosion 2020 (defining title 5-pos 2×/3×/5×) + Dancing Drums Revolution 2025 LightWave 8-pos extended; **trigger-gated compound sum** — T ~ Bernoulli(p_trigger), conditional on trigger K predetermined positions explode each sa V_k iid iz discrete PMF; **E[Y/spin] = p_trigger · K · c · E[V]**, **Var[Y/spin] = p·K·c²·Var[V] + p·(1−p)·(K·c·E[V])²** (law of total variance), **P(all K hit v_max | trigger) = π_max^K** rare jackpot, **oneInNSpinsAllMaxExplosion = 1/(p_trigger·π_max^K)**; per-value disclosure 1−(1−π_l)^K za UKGC RTS-14 tag-level audit; distinct od P-063 (W142) random reel-stop multipliers / P-038 (W086) cascade pyramid chain-conditional / P-086 (W185) per-row coupled — ovde one-shot deterministic explosion na fixed positions)
> - v2.53 (Wave 186) — adds 1 Big Bet Paid-Package Multi-Spin Schedule Aggregator kernel landed in Wave 186 (**L&W M9 P0 GAP CLOSURE, UK-CRITICAL — 67. solver** — Barcrest UK family: Monopoly Big Event 2010 (defining UK Big Bet title, 5-spin RTP 90→98%), Rainbow Riches Pick n Mix 2014 (flat 96% Big Bet + feature composition), Action Bank 2017 (vault-pick Big Bet RTP up to 102%), Pearl of Caribbean variants; **per-spin independent + aggregate disclosure** — paket K spinova, svaki sa distinct (b_k, r_k, σ²_k); **E[total] = Σ b_k·r_k, Var = Σ σ²_k, packageRtp = E[Y]/C**; **P(profit) via CLT-Normal** z = (C−μ)/σ, P = 1−Φ(z); operatorSubsidyFraction = max(0, packageRtp − baseRtp); RTP escalation slope (linear regression r_k vs k); per-spin contribution-to-package-RTP disclosure; **UKGC LCCP 3.4.3 harm-threshold flag** ako E[loss] > threshold (responsible-gambling chase-pattern detection); bestSpinIndex/worstSpinIndex za audit transparency; distinct od P-057 (W130) SINGLE-mode FS Buy tier / P-053 (W095) Ante Bet single decision / P-037 (W081) Bonus Buy bez within-package schedule / P-072 (W163) Martingale sequential progression. **UKGC RTS-12 mandatory disclosure** za UK Big Bet 2010-2022 regulatory regime + Belgian Big Bet ban 2018 counterfactual analyzer)
> - v2.52 (Wave 185) — adds 1 Per-Reel Cash-Bag × Per-Row-Multiplier Coupled Accumulator kernel landed in Wave 185 (**L&W M1 P0 GAP CLOSURE — 66. solver** — Dragon Spin CrossLink Water 2024 (defining novel L&W release) + future L&W flagship variants; **per-cell Bernoulli × coupled-dimension aggregation** — Grid N×M sa per-cell I~Bernoulli(q) i V~iid value, per-reel bag B_i = Σ_j I_{ij}·V_{ij}, per-row coin count C_j ~ Binomial(N,q), per-row multiplier M_j = m_{C_j} (vendor lookup); **E[Y] = M · μ_V · Σ_{c=0..N} Bin(c;N,q)·m_c·c** total payout closed-form; **P(at least one row full) = 1 − (1 − q^N)^M**, **P(all rows full) = q^(N·M)**, **E[# rows full] = M · q^N**; expectedHighestRowMultiplier via sorted-value CDF approach; disclosure commercialUpliftVsFlatMultiplier vs flat m_c=1 baseline; distinct od P-002 single-pool collector / P-067 single-meter K-tier / P-039/P-046 global persistent multiplier / P-051 unconditional value-sum / P-083 grid-expansion DP / P-085 two-grid wild-transfer — ovde first kernel modeling **single-grid coupled per-reel × per-row dvodimenzionalan aggregator**)
> - v2.51 (Wave 184) — adds 1 Colossal Reels Wild-Transfer Two-Grid Aggregator kernel landed in Wave 184 (**L&W M7 P0 GAP CLOSURE — 65. solver** — Spartacus family + 50+ WMS land-based titles: Spartacus Gladiator of Rome 2012 (5×4 main + 5×12 colossal, 100 paylines, defining title), Super Colossal Reels 2019 (full transfer q_t=1.0), Call to Arms 2017 (50 paylines variant), Caesar Empire-class dependent titles; **2-stage Binomial sa conditional coupling** — Stage 1: K_main via per-reel-non-uniform DP O(N²); Stage 2: K_col | K_main ~ Binomial(K_main, q_t); joint PMF enumerated; E[K_col] = q_t·E[K_main] (law of total expectation), Var[K_col] = q_t·(1−q_t)·E[K_main] + q_t²·Var[K_main] (law of total variance); P(full wild both grids) = P(K_main=N)·q_t^N; disclosure oneInNSpinsFullWildBothGrids, probBothGridsAtLeastOneWild, commercialUpliftVsIndependentSplit; distinct od P-030 (W058) Parallel Screens Aggregate independent grids / P-058 (W132) single-wild Markov / P-064 (W123) Mega Symbol single grid / P-076 (W169) drop-stick single grid)
> - v2.50 (Wave 183) — adds 1 Multi-State Frame Upgrade Markov Aggregator kernel landed in Wave 183 (**L&W M2 P0 GAP CLOSURE — 64. solver** — Huff N' Puff family 8 L&W titles: original 2019 (Straw → Wood → Brick), More Puff 2020 (5-tier extended), Even More Puff 2022 (Mega Hat add-on), Lots of Puff 2023, Xtra Puff 2024 (persistent meter), Hard Hat Edition 2024, Grand 2024, Money Mansion 2024 (Mansion bonus stage); each cell on N×M grid runs **independent K-state Markov chain** sa transition matrix P[K][K]; per-cell π_t = π_0 · P^t exact closed-form; **E[total payout per feature] = N·M · Σ_{t=0..T-1} dot(π_t, m)** time-averaged grid aggregate; **P(at least one cell reaches k_target) = 1 − (1 − P_per_cell)^(N·M)** under independence; stationary π_∞ via power iteration; disclosure E[#cells at terminal state], oneInNCellsReachesTarget, commercialUpliftVsIdleBaseline; distinct od P-058 (W132) single-wild 4-state Markov / P-067 (W150) geometric K-threshold / P-082 (W181) per-reel Bernoulli adjacency / P-083 (W182) grid-expansion DP)
> - v2.49 (Wave 182) — adds 1 Dynamic Grid-Expansion Hold-and-Spin Aggregator kernel landed in Wave 182 (**L&W M3 GAP CLOSURE — 63. solver** — Ultimate Fire Link family 7+ variants (Olvera Street, China Street, Riverwalk, Boardwalk, Route 66, Power 4, Cash Falls, Explosion) + Bally Lock It Link Eureka Reel Blast; **exact Markov DP** over state (active_cells, current_rows_idx, stale_streak) sa per-spin Binomial(empty, q) landing PMF + deterministic row-extension triggering on cumulative-landing thresholds + classic H&S 3-stale termination; E[bags] / E[#extensions] / E[spins] / P(full max grid) / E[payout] / commercialUpliftVsFixedGrid disclosure; distinct od P-002 fixed-grid H&S / P-049 fixed-grid jackpot ladder / P-059 fixed-grid value-tier / P-076 drop-stick / P-082 reel-bound adjacency)
> - v2.47 (Wave 180) — adds 1 Sticky Multiplier FS Trail Aggregator kernel landed in Wave 179/180 (**61. solver — compound Binomial trail sa quadratic-in-N payout** za FS-persistent multiplier mehaniku — BTG Bonanza Megaways FS (+1 per cluster win) / Pragmatic Sweet Bonanza FS (mult-coin lands sa avg Δ) / BTG White Rabbit (xMult per scatter) / Hacksaw Wanted Dead or a Wild Bounty (xMult chain) / Pragmatic Money Cart 4 EXTRA SHIFT (persistent across re-spins) / Quickspin Big Bad Wolf (Pigs Turned Wild) / ELK Wild Robo Factory (sticky accumulator); N_inc ~ Binomial(N,q), T_inc = Σ Δ_i; **Wald-Blackwell**: E[M_N] = M_0 + N·q·μ_Δ, Var[M_N] = N·q·(σ²_Δ + (1−q)·μ_Δ²); **trail-sum payout** E[S_FS] = μ_Y · (N·M_0 + q·μ_Δ·N(N−1)/2) **QUADRATIC u N** — defining commercial signature za sticky-trail FS; commercialUpliftRatio = E[S_FS]/(μ_Y·N·M_0) vs flat-multiplier FS baseline; per-spin trajectory E[M_t] = M_0 + t·q·μ_Δ za audit; expectedSpinsToReachMultiplierTarget = (M_target − M_0)/(q·μ_Δ) linear approx; distinct od W049 H&W jackpot ladder (no FS-multiplier trail), W089 Persistent Multiplier Accumulator (no N-spin quadratic aggregation), W097 FS Lookback Multiplier (lookback only, ne stick-trail-increment), W114 Sticky Wild Countdown (countdown ne increment), W132 Multi-Level Wild Tier (Markov tier ne stick-trail), W138 Tumble Cap (capped per-cascade ne FS-persistent), W121 Cascade Multiplier Lockstep (conditional per-cascade))
> - v2.46 (Wave 178) — adds 1 Avalanche Reactor Remove-and-Drop Wave Aggregator kernel landed in Wave 177/178 (**🎯 60. solver PORTFOLIO MILESTONE — doubly-compound Wald** za threshold-activation feature triggered by ACCUMULATED symbol removals across entire avalanche-reactor spin — Play'n GO Reactoonz Quantum Leap / Reactoonz 2 Quantoom / ELK Reactor Energy / BTG Megaways evolution / Hacksaw Tombstone Rip / Pragmatic Sweet Bonanza ante-bet evolution / Push Punk Toilet; W ~ Geometric(p) waves sa E[W]=p/(1−p), L_i iid removals per wave; **E[S]=E[W]·E[L]**, **Var[S]=E[W]·Var[L]+Var[W]·E[L]²**; **P(S≥T) via CLT-Normal approximation** (Abramowitz-Stegun 26.2.17) za threshold activation [valid kada E[W]>>1, low-E[W] uses Markov bound P(S≥T)≤E[S]/T]; disclosure removalSurvivalAtThresholds + oneInNSpinsActivation + meanToThresholdRatio; distinct od W086/W102/W121/W138/W146/W171/W118/W144/W150 other cascade kernels)
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

## Pattern Catalog v2.17 — Mystery Symbol Reveal Aggregator Kernel (Wave 116/117)

This pattern targets the **pre-spin mystery → in-spin uniform reveal
family** — Pragmatic Big Bass Bonanza (i sve Pragmatic-licensed branded
clones) / Wolf Gold (3-tier MMM jackpot) / NetEnt Wild-O-Tron 3000 /
Yggdrasil Vault of Anubis style. K mystery positions land pre-spin sa
K~countPmf; in-spin, sve K se reveal-uju kao ISTI simbol S~symbolPmf.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-051 | **Mystery Symbol Reveal Aggregator** | K ~ countPmf (discrete, k=0..K_max); S ~ symbolPmf (independent of K); per-spin payout **`Y = K · paytable[S]`**; cross-independence (K ⊥ S) Wald-style: **`E[Y] = E[K]·E[paytable[S]]`**, **`Var[Y] = E[K²]·E[paytable²] − E[K]²·E[paytable]²`**; tail: P(K=0), P(K=K_max), **`probFullGridMaxSymbol = P(K=K_max)·P(S=max)`** joint; per-symbol conditional E[Y\|S=s] = E[K]·paytable[s] | `src/features/mysterySymbolReveal.ts` | 35 vitest specs (Wave 116) + 6 PAR-style configs × 100K spins (Wave 117); portfolio entry W116 |

## Pattern Catalog v2.18 — Bonus Collect-N Trigger Tracker Kernel (Wave 118/119)

This pattern targets the **collect-N trigger family** — Pragmatic Money
Cart / Money Train (2/3/4) / Stake Logic Wild Swarm / Hacksaw Money Hunt /
Push Gaming Razor Shark collector counters. Per-spin Bernoulli collect
event sa probability p; bonus triggers kada cumulative count reaches N.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-052 | **Bonus Collect-N Trigger Tracker** | T_N ~ NB(N, p) sa support {N, N+1, ...}; **`P(T_N = k) = C(k−1, N−1)·p^N·(1−p)^(k−N)`**; **`E[T_N] = N/p`**, **`Var[T_N] = N(1−p)/p²`**; tail P(T_N > k) = P(C_k < N) via log-space binomial aggregation (Lanczos logGamma); median/percentile via monotone CDF binary search; operator disclosure **`probTriggerWithinHorizon = P(T_N ≤ K)`**, expectedTriggersInHorizon = K·p/N | `src/features/bonusCollectN.ts` | 32 vitest specs (Wave 118) + 6 PAR-style configs × 50K episodes (Wave 119); portfolio entry W118 |

## Pattern Catalog v2.19 — Cascade Multiplier Chain Lockstep Conditional Kernel (Wave 121/122)

This pattern targets the **lockstep conditional cascade multiplier
family** — Quickspin Reactor Wilds / Push Gaming Token of Life / Hacksaw
Cascade Multiplier / BTG Megaways multiplier-on-win. Multiplier raste
SAMO kada cascade ima win (skip-on-empty), chain se lomi na prazno.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-053 | **Cascade Multiplier Chain Lockstep Conditional** | Chain length L ~ Geometric(1-p) sa support {0,1,...}; **`P(L=0)=1-p`**, **`P(L≥k)=p^k`**, **`E[L]=p/(1-p)`**; M_k linear (base+(k-1)·step) ili geometric (base·r^(k-1)) sa convergence guard r·p<1; Wald-style **`E[Y]=E[V]·Σ M_k·p^k`** (linear: base·p/(1-p)+step·p²/(1-p)²; geometric: base·p/(1-rp)); **`Var[Y]=E[Y²]−E[Y]²`** sa cross-term 2·E[V]²·Σ_{j<k} M_j·M_k·p^k; truncation cap + tail prob disclosure | `src/features/cascadeMultiplierChain.ts` | 32 vitest specs (Wave 121) + 6 PAR-style configs × 100K spins (Wave 122); portfolio entry W121 |

## Pattern Catalog v2.20 — Mega Symbol Multi-Cell Expansion Aggregator Kernel (Wave 123/124)

This pattern targets the **super-symbol multi-cell expansion family** —
Pragmatic Sweet Bonanza super-symbols / NetEnt Mega Joker / Slot Mountain
Megaways jumbo / Push Razor Shark jumbo blocks / BTG Megaways multi-cell.
Super-symbol drops sa S × S area coverage, supstituira base sa target T.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-054 | **Mega Symbol Multi-Cell Expansion Aggregator** | K ~ countPmf super-symbol drops per spin; S ~ sizePmf (1=1×1, 2=2×2, ...); T ~ targetPmf sa payoutX; **Y = Σ_{i=1..K} S_i² · paytable[T_i]** (S² area term); K ⊥ S ⊥ T daje **`E[Y] = E[K]·E[S²]·E[paytable[T]]`**; **`E[Y²] = E[K]·E[S⁴]·E[paytable²] + (E[K²]−E[K])·(E[S²]·E[paytable])²`** (S⁴ area-of-area + cross-drop); **`probMaxConfig = P(K=K_max)·(P(S=max)·P(T=max))^K_max`** joint extreme | `src/features/megaSymbolExpansion.ts` | 39 vitest specs (Wave 123) + 6 PAR-style configs × 100K spins (Wave 124); portfolio entry W123 |

## Pattern Catalog v2.21 — Bi-Directional Line Pay Aggregator Kernel (Wave 125/126)

This pattern targets the **both-ways line pay evaluation family** —
Microgaming Avalon / NetEnt Lights / Witches Wheel / IGT Cleopatra
Bi-Way / Stakelogic Witchcraft Academy. Pays match from LEFT (reels
1..k) AND from RIGHT (reels N-k+1..N) — bi-directional uplift sa
N-match deduplication.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-055 | **Bi-Directional Line Pay Aggregator** | N reels independent, per-symbol density q; **`P(L_k) = q^k·(1−q)`** za k<N, **`P(L_N) = q^N`**; P(R_k) symetrično; **`E[pay_BD] = E[L] + E[R] − paytable[N]·q^N`** (L_N i R_N su SAMA event, deduct overlap); hit_freq_BD = hf_L + hf_R − P(L_N); **`bidirectionalUpliftRatio = E[pay_BD] / E[pay_L]`** (typically 1.5-2 za non-degenerate, drops sa density→1) | `src/features/biDirectionalLinePay.ts` | 32 vitest specs (Wave 125) + 6 PAR-style configs × 100K spins (Wave 126); portfolio entry W125 |

## Pattern Catalog v2.22 — Anticipation/Tease Reel Bayesian Conditional Kernel (Wave 127/128)

This pattern targets the **anticipation/tease reel UX disclosure family** —
BTG Megaways tease reels / Pragmatic anticipation reels / NetEnt suspense
reels. UKGC RTS 8 §3.5 ("false anticipation" prohibition) compliance
disclosure via strict Bayesian conditional analysis.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-056 | **Anticipation/Tease Reel Probability Tracker** | N reels independent Bernoulli (scatter prob q), bonus trigger requires K scatters; **`P(trigger \| m, i) = Σ_{j=K-m}^{N-i} C(N-i,j)·q^j·(1-q)^(N-i-j)`** Bayesian conditional; anticipation activated kada conditional ≥ threshold T (default 0.5); forward state propagation za exact P(any antic per spin); **`falseAnticipationRate = P(no trigger \| activated) ≤ 1−T`** (UKGC RTS 8 §3.5 compliance guarantee); per-reel P(active at reel i) + conditional trigger prob given active | `src/features/anticipationReelTease.ts` | 31 vitest specs (Wave 127) + 6 PAR-style configs × 100K spins (Wave 128); portfolio entry W127 |

## Pattern Catalog v2.23 — Free Spins Buy + Tier Escalation Trade-Off Kernel (Wave 130/131)

This pattern targets the **multi-tier buy bonus decision math family** —
Pragmatic Big Bass family (Bigger Bass, Bass Bonanza Megaways Super
Bonus Buy) / Hacksaw Money Hunt 66x/100x/150x tiers / Push Razor Shark
50x / Nolimit Mental Bonus Buy + xWays / Stakelogic Megaways Bonus Buy.
Australian NCRG / Belgian regulator Bonus Buy ban impact compliance.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-057 | **Free Spins Buy + Tier Escalation Trade-Off Analyzer** | Multi-tier t=1..T sa (buyCostX_t, expectedReturnX_t, varianceReturnX_t); **`RTP_t = E[Y]/buyCost`**, netEdge = RTP_t − 1, **`σ_relative = σ/buyCost`**, **`Sharpe-like = (RTP-1)/σ_rel`**; uplift_t = (RTP_t − RTP_b)·buyCost; **`twoSigmaCrossoverN* = 4σ_rel²/(RTP-1)²`** spins until edge dominates noise; decision modes argmax RTP/Volatility/Sharpe/Payout; optional adoptionFractions za weighted-RTP; **`bonusBuyBanImpactPercent`** = counterfactual RTP loss (Australian NCRG / Belgian regulator disclosure) | `src/features/freeSpinsBuyTierTradeOff.ts` | 34 vitest specs (Wave 130) + 6 PAR-style configs × 50K MC trials (Wave 131); portfolio entry W130 |

## Pattern Catalog v2.24 — Multi-Level Wild Tier Markov Kernel (Wave 132/133)

This pattern targets the **multi-level wild tier probabilistic upgrade
family** — NetEnt Vikings Berzerk (basic → super) / Push Gaming Mount
Magmas (3-tier wild) / Pragmatic Da Vinci's Mystery / Quickspin Sakura
Fortune wild progression. 4-state Markov chain sa probabilistic per-level
upgrades, distinct od W101 count-based.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-058 | **Multi-Level Wild Tier Markov** | 4-state Markov chain {idle, basic, super, mega}; per-spin transitions p_land/p_up1/p_up2/p_expire; chain ratios **`π_basic = π_idle·p_land/(p_up1+p_exp)`**, **`π_super = π_basic·p_up1/(p_up2+p_exp)`**, **`π_mega = π_super·p_up2/p_exp`**; **`E[M per spin] = π_idle·1 + π_basic·M_b + π_super·M_s + π_mega·M_m`**; **`E[Y] = E[V]·E[M]`** (cross-independence) | `src/features/multiLevelWildMarkov.ts` | 37 vitest specs (Wave 132) + 6 PAR-style configs × 100K spins (Wave 133); portfolio entry W132 |

## Pattern Catalog v2.25 — Hold-and-Win Multi-Tier Value-Based Jackpot Kernel (Wave 134/135)

This pattern targets the **value-sum-based H&W jackpot family** —
Aristocrat Lightning Link / Buffalo Link / IGT Hold & Win / SG Money
Burst / Pragmatic Big Bass Hold & Spin. **Distinct od W49 N-tier Ladder**
(filled-count tier triggered "k cells filled = tier"); ovaj solver
tier triggered by **TOTAL ACCUMULATED VALUE** threshold.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-059 | **Hold-and-Win Multi-Tier Value-Based Jackpot** | Grid K cells, R respins sa reset-on-landing, money symbols V ~ valuePmf; **Step 1** Markov (filled, respinsRemaining) → P(F_final = k); **Step 2** k-fold convolution valuePmf → V_total \| F=k (sparse Map); **Step 3** P(tier reached) = Σ_k P(F=k)·P(V_total ≥ T \| k); **Step 4** **`E[V_total] = (E[F] − F_init)·E[V]`** (industry semantics: only NEWLY landed cells get money); P(exactly tier) = P(reach t) − P(reach t+1); fullGridBonus + tier bonusPayoutX | `src/features/holdWinValueJackpot.ts` | 36 vitest specs (Wave 134) + 6 PAR-style configs × 30K episodes (Wave 135); portfolio entry W134 |

## Pattern Catalog v2.26 — Locked/Held Reels During FS Analyzer Kernel (Wave 136/137)

This pattern targets the **lock-and-spin during free spins family** —
Pragmatic Wolf Gold / Buffalo King / John Hunter's Tomb of the Scarab
Queen / Push Gaming Mount Magmas / Yggdrasil Vault of Anubis. K trigger
scatter reels held throughout M FS spins, non-held reels respin sa fresh
scatter density q; retrigger fires kada total scatters ≥ T u single FS spin.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-060 | **Locked/Held Reels During FS Analyzer** | N reels, K held throughout M FS, q fresh-scatter prob per non-held reel; **`P_re = P(Bin(N-K, q) ≥ T-K)`** Binomial tail; **`E[retriggers across FS] = M·P_re`**, **`P(any retrigger) = 1−(1−P_re)^M`**, Var = M·P_re·(1−P_re); **`E[time-to-first] = (1−(1−P_re)^M)/P_re`** truncated; E[fresh per spin]=(N-K)·q, E[total scatters per spin]=K+(N-K)·q | `src/features/lockedReelsDuringFs.ts` | 34 vitest specs (Wave 136) + 6 PAR-style configs × 50K episodes (Wave 137); portfolio entry W136 |

## Pattern Catalog v2.27 — Tumble Multiplier with Cap Kernel (Wave 138/139)

This pattern targets the **cascade-with-ceiling family** — NetEnt Gonzo's
Quest (5× cap), BTG Bonanza FS (10× cap), Pragmatic Sweet Bonanza Xmas
(100× cap), Push Money Cart 4 (20× cap), Hacksaw Tombstone R.I.P, Yggdrasil
Vault of Anubis. Cascading wins build a multiplier ladder that hits a
deterministic ceiling — explicit M_max separates this kernel from W121
(unbounded ramp), W86 (deterministic per-step ladder), W89 (Binomial drop
FS-only), and W114 (time-based countdown).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-061 | **Tumble Multiplier with Cap** | L ~ Geometric(1−p): E[L]=p/(1−p); ladder M_k = min(base + (k−1)·step, M_max); **`k* = ceil((M_max − base)/step) + 1`** smallest k where ladder hits cap; **`E[Y] = E[V] · (A + B)`** where **A = Σ_{k=1..k*-1} M_k·p^k** (ramp) + **B = M_max · p^k\* / (1−p)** (saturated tail); Var[Y] via E[V²]·second-moment-mult − E[Y]²; truncationProbabilityRemaining for safety check | `src/features/tumbleMultiplierWithCap.ts` | 30 vitest specs (Wave 138) + 6 PAR-style configs × 200K spins (Wave 139); portfolio entry W138 |

## Pattern Catalog v2.28 — Adjacent Pays Aggregator Kernel (Wave 140/141)

This pattern targets the **pay-adjacent / pay-anywhere on consecutive
reels family** — Aristocrat Buffalo (pay-adjacent classic), Konami Roman
Tribune (6-reel adjacent k_min=2), NextGen Foxin' Wins (25-line
adjacent), IGT Cleopatra adjacent variants, Pragmatic Big Bass families.
Per payline, the longest run of consecutive reels showing symbol s can
start at ANY reel position (not just reel 1 like LTR-anchored, not just
reels 1 or N like W125 bi-directional).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-062 | **Adjacent Pays Aggregator** | DP on (position, current_run, max_run) state-space: per reel match (p_s) c→c+1 m→max(m, c+1); no-match (1-p_s) c→0; marginalize → **`P(longest_run_s = k)`** for k=0..N; per symbol: **`E[pay_s] = Σ_{k=k_min..N} paytable[s][k]·P(run=k)`**; per spin: × paylineCount; Var via E[pay²]−E[pay]²; cross-symbol indep approx | `src/features/adjacentPaysAggregator.ts` | 33 vitest specs (Wave 140) + 6 PAR-style configs × 200K spins (Wave 141); portfolio entry W140 |

## Pattern Catalog v2.29 — Symbol Multiplier on Reel-Stop Kernel (Wave 142/143)

This pattern targets the **random multiplier symbol landing family** —
Pragmatic Sweet Bonanza (tumble multiplier symbols sum aggregation),
Pragmatic Bigger Bass Bonanza (fish multiplier symbols additive),
Hacksaw RIP City (sum multipliers), Push Wild Swarm (sum), NetEnt
Asgardian Stones avalanche (multiplicative), Yggdrasil Reactoonz
multipliers. Distinct from W138 (cascade ladder, deterministic per
cascade level), W93 (wild stack), W114 (sticky countdown), W123 (mega
block).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-063 | **Symbol Multiplier on Reel-Stop** | N positions, per-position P(land) = q (independent); value V ~ multiplierValuePmf when landed; configurable aggregation: **additive** T = max(1, Σ v_i), **multiplicative** T = Π v_i; **`E[T]_additive = (1−q)^N + N·q·μ_V`**; **`E[T]_multiplicative = (q·μ_V + (1−q))^N`**; E[T²] similarly closed-form; **`E[Y] = E[T]·μ_W`** (T ⊥ W); Var[Y] = σ_W²·E[T²] + μ_W²·Var[T]; P(any landing) = 1−(1−q)^N | `src/features/symbolMultiplierReelStop.ts` | 33 vitest specs (Wave 142) + 6 PAR-style configs × 200K spins (Wave 143); portfolio entry W142 |

## Pattern Catalog v2.30 — Trail/Board Bonus Progression Tracker Kernel (Wave 144/145)

This pattern targets the **trail/board sequential progression family** —
Konami Stairway to Heaven, IGT Wheel of Fortune Multi-Tier Trail,
Microgaming Lord of the Rings, Inspired ladder climb series, Bally Quick
Hit Cash trail, IGT Mystical Mermaid. Linear trail positions {0..N};
per pick advance Δ ~ stepPmf; per-position rewards + optional bust
positions + end bonus. Distinct from W101 (count-based), W105 (wheel),
W107 (tree branching), W118 (collect-N threshold), W134 (grid filling).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-064 | **Trail/Board Bonus Progression Tracker** | DP over (position, picksRemaining) state-space; V(p, r) = E[total reward \| start at p with r picks]; per step Δ → newPos = min(p+Δ, N); **end** → V = endBonusX, **bust** → V = 0, **advance** → V = stepReward + V(pNew, r-1); boundary r=0 → V = 0; second moment E[Y²] same DP pass → Var[Y]; plus **P_reach + P_bust + P_timeout = 1** invariant | `src/features/trailBonusTracker.ts` | 34 vitest specs (Wave 144) + 6 PAR-style configs × 100K episodes (Wave 145); portfolio entry W144 |

## Pattern Catalog v2.31 — Cascade Meter Charge-Up Trigger Kernel (Wave 146/147)

This pattern targets the **cascade-charged meter trigger / Quantum-Leap
family** — Play'n GO Reactoonz / Reactoonz 2 (Quantum Leap meter),
Hacksaw Stack 'Em (boost meter every N wins), Push Aztec Bonanza
(charging meter), Yggdrasil Vault of Anubis (FS charge meter), NetEnt
Wildbeast (charge meter). Per spin cascade chain L ~ Geometric(1−p);
per-win meter +1; threshold T integer → number of feature fires
F = ⌊L/T⌋ ~ Geometric(1 − p^T) — elegant nested-geometric closed form.
Distinct from W50 (stationary steady-state, no chain), W138 (per-level
ladder), W118 (token collector), W84 (multiplicative chain), W121
(multiplier per cascade level, no meter).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-065 | **Cascade Meter Charge-Up Trigger** | L ~ Geometric(1−p); per-win meter +1; T threshold; **`F = ⌊L/T⌋ ~ Geometric(1−p^T)`** elegant distribution; **`E[F] = p^T/(1−p^T)`**, Var[F] = p^T/(1−p^T)²; **`E[L mod T] = (1−p)·Σ_{r=0..T-1} r·p^r / (1−p^T)`** finite series; **conservation identity** `E[L] = T·E[F] + E[meterEnd]`; plus Wald base payout E[Y_base] = E[L]·μ_V, Var[Y_base] = E[L]·σ_V² + Var[L]·μ_V²; feature payout E[Y_feature] = B·E[F]; total E[Y] = E[Y_base] + E[Y_feature] | `src/features/cascadeMeterChargeUp.ts` | 42 vitest specs (Wave 146) + 6 PAR-style configs × 300K spins (Wave 147); portfolio entry W146 |

## Pattern Catalog v2.32 — Max Win Cap Truncation Analyzer Kernel (Wave 148/149)

This pattern targets the **UNIVERSAL regulatory max-win cap disclosure
family** — Pragmatic Play 5000x cap (large catalog), Hacksaw Gaming
7500x cap, Nolimit City 25000x cap (Mental, Tombstone RIP), NetEnt
10000x cap, Stake.com originals 5000x cap, Push Gaming 10000-15000x,
Yggdrasil 7777x, Quickspin 10000x, BTG Megaways često 50000x.
Mandatory under UKGC RTS 14 / §5.A.E B3-LCCP, MGA PPD §11.f, AU NCRG
post-2023 reform, BE Belgian Gaming Commission. Distinct from W138
(caps per-cascade multiplier M_max, ne payout), W81 (no cap operator).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-066 | **Max Win Cap Truncation Analyzer** | Y ~ payoutPmf discrete, cap C → Y_capped = min(Y, C); **`E[Y_capped] = Σ_{y<C} y·π_y + C·P_cap`**; **`Var[Y_capped] = E[Y²_capped] − E[Y_capped]² ≤ Var[Y]`** (tail clipping); **rtpLossRelative = (E[Y]−E[Y_capped])/E[Y]**; **oneInNCapHitFrequency = 1/P_cap** (regulator "1 in X"); **E[overflow \| Y≥C] = (Σ_{y≥C}(y−C)·π_y)/P_cap**; capBucketRtpContributionFraction = C·P_cap/E[Y_capped] | `src/features/maxWinCapTruncation.ts` | 38 vitest specs (Wave 148) + 6 PAR-style configs × 200K spins (Wave 149); portfolio entry W148 |

## Pattern Catalog v2.33 — Voltage/XP Meter Multi-Tier Reward Kernel (Wave 150/151)

This pattern targets the **K-tier voltage/XP meter reward family** —
Hacksaw Stack 'Em multi-tier boost levels, Push Wild Swarm power-up
tiers, NetEnt Charged XP bar 3-tier reward, Yggdrasil Vault of Anubis
multi-step charge, Inspired XP bar, Hacksaw Aztec Magic Deluxe Bonanza
voltage meter, Push Aztec Bonanza multi-tier. K-tier extension of W146
single-threshold cascade meter. Distinct from W146 (single T), W138
(per-cascade ladder), W118 (collect-N tokens), W101 (count-based
upgrades no tier rewards), W50 (stationary steady-state).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-067 | **Voltage/XP Meter Multi-Tier Reward Levels** | L ~ Geometric(1−p); K tier thresholds T_1<T_2<...<T_K sa rewards R_k; **highest tier reached** H = max{k: L ≥ T_k}; **`P(L ≥ T_k) = p^{T_k}`** strictly decreasing; **`P(H = k) = p^{T_k} − p^{T_{k+1}}`** difference of geometric tails; **MODE 1 highest-only**: E[R] = Σ_k R_k·(p^{T_k}−p^{T_{k+1}}) = telescoping R_1·p^{T_1} + Σ_{k≥2}(R_k−R_{k-1})·p^{T_k}; **MODE 2 cumulative**: E[R] = Σ_k R_k·p^{T_k} (direct sum); E[R²] sa cross-terms +2·Σ_{i<j} R_i·R_j·p^{T_j} jer I(L≥T_i)·I(L≥T_j) = I(L≥T_j) | `src/features/voltageMeterMultiTier.ts` | 36 vitest specs (Wave 150) + 6 PAR-style configs × 300K spins (Wave 151); portfolio entry W150 |

## Pattern Catalog v2.34 — Bonus Trigger Award Tier Stratification Kernel (Wave 152/153)

This pattern targets the **STANDARD industry "scatter-Binomial trigger
sa multi-tier FS award" family** — Pragmatic Sweet Bonanza family (3 =
10 FS, 4 = 15 FS, 5 = 20 FS), NetEnt Vikings (variable FS by scatter),
Hacksaw RIP City scatter tiers, IGT Cleopatra family, Microgaming Mega
Moolah (4-scatter only → 25 FS), BTG Megaways (3/4/5/6 → 10/15/20/30 FS),
Push Gaming Razor Shark. Distinct from W110 (wait time), W118 (collect-N
threshold), W84 (FS retrigger during), W130 (paid mode), W127 (Bayesian
per-reel reveal).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-068 | **Bonus Trigger Award Tier Stratification** | S ~ Binomial(N, q); **`P(S = s) = C(N, s)·q^s·(1−q)^(N−s)`**; **`P(trigger) = Σ_{s≥S_min} P(S=s)`**; conditional **`P(S=s \| trigger) = P(S=s) / P(trigger)`**; **`E[K \| trigger] = Σ_{s≥S_min} K(s)·P(S=s\|trigger)`**; Var[K \| trig] = E[K²\|trig] − E[K\|trig]²; **`E[FS per spin] = P(trig)·E[K\|trig] = Σ K(s)·P(S=s)`** (unconditional); stratification metrics probTierBreakdownConditional + probMaxScatterTier = P(S=N\|trig); regulator "1 in X" form oneInNTriggerFrequency = 1/P(trig) | `src/features/bonusTriggerAwardStratification.ts` | 44 vitest specs (Wave 152) + 6 PAR-style configs × 300K spins (Wave 153); portfolio entry W152 |

## Pattern Catalog v2.35 — Free Bet Wagering Requirement Aggregator Kernel (Wave 154/155) — INDUSTRY-FIRST

This pattern targets the **operator bonus play-through economy** —
the regulatory disclosure problem nije addressed by any vendor or
aggregator publicly: "Player gets B units of bonus with wagering
requirement x. They wager bet b per spin on game with RTP R. Compute
P(bust before WR completion), expected withdrawable amount, true bonus
value ratio." UKGC RTS-12 (responsible gambling, bonus terms
transparency), MGA Player Protection Directives §15 (max x35 WR cap,
prominent disclosure), EU GambleAware-driven realistic expected return
mandates this disclosure. Industry use: UKGC x35 standard (Sky Vegas /
William Hill / Bet365 promotions), MGA x30 capped offers, Pragmatic
Sweet Bonanza high-volatility x50 predatory scenarios, cashback-boost
RTP>1 promo edge cases. Distinct from W081 (Bonus Buy paid mode without
WR), W095 (Ante Bet decision EV without bonus pool), W130 (FS Buy per-
bet without running balance constraint).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-069 | **Free Bet Wagering Requirement Aggregator (INDUSTRY-FIRST)** | Required wagering **W = x·B**; required spins **N = ⌈W/b⌉**; per-spin drift **μ = b·(R−1)**; per-spin variance **σ² = (volIdx·b)²**; **`E[X_N] = B + N·μ`**; **`stdDev[X_N] = σ·√N`**; **Bachelier first-passage** (Reflection Principle, exact for continuous BM): **`P_bust = Φ((−B−μN)/(σ√N)) + exp(−2Bμ/σ²)·Φ((−B+μN)/(σ√N))`** universal for μ<0, μ=0, μ>0; **E[withdrawable]** via joint-density closed-form: ∫₀^∞ x·p(X_N=x, min≥0) dx = σ√N·φ(m₁/σ√N) + m₁·Φ(m₁/σ√N) − exp(−2Bμ/σ²)·[σ√N·φ(m₂/σ√N) + m₂·Φ(m₂/σ√N)] gde m₁ = B+μN, m₂ = −B+μN; disclosure metrics **trueBonusValueRatio = E[wd]/B** (0 = pure house-pull, 1 = full bonus value), **playerLossRate = (B − E[wd])/B**; numerical: Φ via Abramowitz-Stegun erf (≤1.5e-7 error) | `src/features/freeBetWageringRequirement.ts` | 23 vitest specs (Wave 154) + 6 industry-representative configs × 5K MC episodes (Wave 155); portfolio entry W154 |

## Pattern Catalog v2.36 — Session Bankroll Drawdown Analyzer Kernel (Wave 157/158) — INDUSTRY-FIRST, 50th SOLVER MILESTONE

This pattern is the **real-money** companion to P-069 — operators
disclose bankroll-depletion economics under UKGC LCCP 3.4.3, MGA PPD §16,
EU EBA 2024 Responsible Gambling Directive, and AU NCPF Reform 2022.
Question: "Player has B bankroll, bets b per spin at game with RTP R
and volatility v. What is: median minutes to bust, 1-in-N hourly bust
frequency, expected loss per hour, survival probability over horizon
H?" No vendor or aggregator publishes a formal closed-form Inverse
Gaussian first-passage time analyzer for player sessions. Operators
currently rely on heuristic "average session length" tables that ignore
variance entirely. Distinct from P-069 (BONUS pool fixed-horizon WR
completion), P-061-style cap analyzers (payout truncation not bust),
classic Ante/Buy/Crash kernels (no bankroll dynamics).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-070 | **Session Bankroll Drawdown Analyzer (INDUSTRY-FIRST, 50th solver MILESTONE)** | Per-spin drift **μ = b·(R−1)**; per-spin variance **σ² = (v·b)²**; bankroll process X_n = B + Σ ΔX_i ≈ BM(B, μ, σ²). **First-passage time τ_bust = inf{n ≥ 0 : X_n ≤ 0}**. **Drift regimes**: (1) **μ<0** (house edge): **τ ~ IG(μ_IG=B/\|μ\|, λ=B²/σ²)** Inverse Gaussian; CDF `F(t) = Φ(√(λ/t)·(t/μ_IG−1)) + exp(2λ/μ_IG)·Φ(−√(λ/t)·(t/μ_IG+1))` Chhikara-Folks 1989; **E[τ]=B/\|μ\|**, **Var[τ]=B·σ²/\|μ\|³**; median via numerical CDF inversion (60-iter bisection). (2) **μ=0** (fair): driftless BM hitting 0 from B, **P(τ≤t) = 2·(1−Φ(B/(σ√t)))** half-normal; **median = B²/(σ²·Φ⁻¹(0.75)²)** ≈ B²/(σ²·0.4549). (3) **μ>0** (player edge): **P(τ<∞) = exp(−2B\|μ\|/σ²)** < 1; finite-horizon via Bachelier reflection (P-069 helper reused). Disclosure metrics: **medianMinutesToBust**, **expectedHoursPlayed = E[τ]/sph**, **expectedLossPerHour = \|μ\|·sph** (deterministic mean rate), **survivalProbByHorizon** grid [1h, 2h, 4h, 8h], **oneInNHoursBust = 1/P(bust within 1h)** regulator "1 in X" form, **expectedBankrollAfter1Hour** conditional+unconditional. | `src/features/sessionBankrollDrawdown.ts` | 32 vitest specs (Wave 157) + 6 industry-representative configs × 3K MC episodes (Wave 158); portfolio entry W157 |

## Pattern Catalog v2.37 — Hit Frequency Distribution Decomposition Analyzer Kernel (Wave 159/160) — INDUSTRY-STANDARD, 51st solver

First explicit **distribution-decomposition** kernel u portfolio (prior solvers
compute scalar moments or single-tier probabilities; ovaj decomposuje ceo payout
PMF u operator-/regulator-grade survival-function tiers). UKGC RTS 14 Tag 12,
MGA PPD §11.f, eCOGRA Generic Slots Audit, AU NCPF Reform 2022 Schedule 3 svi
zahtevaju per-tier hit frequency disclosure ali OPERATORS CURRENTLY COMPILE
THESE MANUALLY u spreadsheets. Solver automates: tier hit frequency, 1-in-N,
conditional EV per tier, RTP contribution, top-X% RTP concentration, Pareto α
heavy-tail fit. Industry use: UKGC game-info tooltip generator, MGA slot-
variance classifier, eCOGRA pre-launch audit harness, NCPF info-card builder.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-071 | **Hit Frequency Distribution Decomposition Analyzer (INDUSTRY-STANDARD, 51st solver)** | Input discrete PMF {(m_k, p_k)} on multiples-of-bet sa Σ p_k = 1. **Total moments**: RTP = Σ m·p, Var = Σ m²·p − RTP², HF = 1 − π(0), oneInN = 1/HF. **Per-tier survival decomposition** za threshold C: **`tierProb = Σ_{m_k ≥ C} p_k`**, **`oneInN = 1/tierProb`**, **`condEV = Σ_{m_k ≥ C} m_k·p_k / tierProb`**, **`rtpContribution = Σ_{m_k ≥ C} m_k·p_k`**, **`rtpShareOfTotal = rtpContribution/totalRtp`**. **Top-X% RTP concentration**: sort positive outcomes descending by multiple, cumulative do target frakcije (1%/5%/10%), report % RTP from top events. **Hill-estimator Pareto α** za heavy-tail diagnostic: **`α̂ = totalTailMass / Σ p·ln(m/m_min)`** za m ≥ paretoTailStartMultiplier (NaN if <3 outcomes; right-skewed if α<2, very-heavy-tail if α<1). | `src/features/hitFrequencyDistribution.ts` | 32 vitest specs (Wave 159) + 6 industry-representative PMF configs × 200K spins (Wave 160); portfolio entry W159 |

## Pattern Catalog v2.38 — Max Drop From Starting Bankroll Analyzer Kernel (Wave 161/162) — INDUSTRY-FIRST, 52nd solver, COMPLETES responsible-gambling math triad

Third side of responsible-gambling math triad — together with P-069 (Free Bet
WR, bonus pool fixed-horizon WR completion) and P-070 (Session Bankroll
Drawdown, terminal first-passage to 0), P-072 NEW answers regulator question
"What is the deepest single-session drop from starting bankroll, even if
player doesn't bust?" This intra-session drawdown matters for harm-prevention
messaging — a player who never busts but watches £50 evaporate from start
feels the harm just as acutely. UKGC LCCP 3.4.3 zahteva intra-session loss
tracking, MGA PPD §17 traži running drawdown disclosure, EU EBA 2024 traži
VaR-style drawdown harm-prevention, AU NCPF Reform 2022 traži peak-loss
disclosure. No vendor publishes a formal closed-form analyzer.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-072 | **Max Drop From Starting Bankroll During Session (INDUSTRY-FIRST, 52nd solver, COMPLETES responsible-gambling triad)** | Define W_t = X_t − X_0 (position relative to start, W_0=0); BM with drift μ = b·(R−1) per spin, variance σ² = (v·b)². Max drop **MaxDrop_T = max_{[0,T]}(−W_s) = −min_{[0,T]} W_s**. **Survival fn (Karatzas-Shreve §3.5 one-sided reflection)**: **`P(MaxDrop_T ≥ d) = Φ(−(d+μT)/(σ√T)) + exp(−2μd/σ²) · Φ(−(d−μT)/(σ√T))`**. Sanity: d=0→S=1, d→∞→S=0, μ=0→S=2·Φ(−d/(σ√T)) classical driftless half-normal, μ<0 (house) → exp>1 inflate tail, μ>0 (player) → exp<1 suppress tail. **Moments**: E[MaxDrop] = ∫₀^∞ S(d) dd via composite Simpson (1024 intervala, auto-truncated upper bound at S(d*)≤1e-12); E[MaxDrop²] = ∫₀^∞ 2d·S(d) dd; Var = E[X²]−E[X]². **Percentiles**: p90/p95/p99 via bisection na survival function (60 iter). **Disclosure metrics**: expectedMaxDrawdown, p90/p95/p99 VaR thresholds, probMaxDrawdownExceedsLimit, oneInNSessionsExceedsLimit "1 in X" regulator form. **3 drift regimes** (negative house edge, zero fair driftless, positive player edge from promo). | `src/features/runningMaxDrawdown.ts` | 30 vitest specs (Wave 161) + 6 industry-representative session configs × 3K MC episodes (Wave 162); portfolio entry W161 |

## Pattern Catalog v2.39 — Martingale Wager Progression Bust Time Analyzer Kernel (Wave 163/164) — INDUSTRY-FIRST chase-pattern detection, 53rd solver

First SEQUENTIAL bet-progression strategy analyzer in portfolio. UKGC LCCP
3.4.3, MGA PPD §18, EU EBA 2024, and AU NCPF Schedule 4 (mandatory by 2025)
require operators to detect chase-pattern bet-doubling. NHS Gambling Harms
2024 report cites Martingale as #1 chase pattern by harm victims. No vendor
publishes a formal closed-form Martingale risk analyzer.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-073 | **Martingale Wager Progression Bust Time (INDUSTRY-FIRST chase-pattern detection, 53rd solver)** | Per-spin P(win)=p, P(loss)=q=1−p. Martingale: base bet b_0, doubles on loss, resets on win. **k_max = ⌊log₂(B/b_0+1)⌋−1** max survivable consecutive losses (b_0·(2^(k_max+1)−1)≤B). Per round: **P(bust)=q^(k_max+1)** geometric tail; sum_{k=0..k_max} q^k·p + q^(k_max+1) = 1 ✓. **E[T_rounds_bust]=1/q^(k_max+1)** Geometric mean. **Var[T_rounds]=(1−p_bust)/p_bust²**. **E[spins/round]=Σ(k+1)·q^k·p + (k_max+1)·q^(k_max+1)** iterative. **E[T_spins_bust]=E[T_rounds]·E[spins/round]**. **E[netProfit]=(E[T_rounds]−1)·b_0 − b_0·(2^(k_max+1)−1)** uvek negativan za p<0.5. **chasePatternRiskScore∈[0,1]** = 1 − (k_max/12)·(1−p_bust) regulator alert heuristic. | `src/features/martingaleBustTime.ts` | 30 vitest specs (Wave 163) + 6 industry chase-pattern configs × 3K MC episodes (Wave 164); portfolio entry W163 |

## Pattern Catalog v2.40 — Reverse Martingale (Paroli) Streak Cash-Out Analyzer Kernel (Wave 165/166) — INDUSTRY-FIRST let-it-ride, 54th solver, DUAL of P-073

DUAL kernel of P-073 Martingale: where P-073 models LOSS-streak chasing,
P-074 models WIN-streak let-it-ride. Together cover complete sequential
bet-progression pair (#1 + #2 NHS Gambling Harms 2024 chase patterns).
UKGC LCCP 3.4.3 chase-pattern detection mandate applies equally to both.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-074 | **Reverse Martingale (Paroli) Streak Cash-Out (INDUSTRY-FIRST let-it-ride, 54th solver, DUAL of P-073)** | Per-spin P(win)=p. Paroli: base bet b_0, doubles on WIN (let it ride), cash out at k_target wins in a row, reset on any loss. Bankroll cap **k_max = ⌊log₂(B/b_0+1)⌋**; effective target = min(targetStreak, k_max). Per round: **probReachStreak = p^k** geometric; cashOutPayout = b_0·(2^k − 1) profit; **P(loss at step j) = p^(j−1)·q**; sum check p^k + Σ_{j=1..k} p^(j−1)·q = 1 ✓. **E[roundProfit]** = cashOutPayout·p^k − b_0·q·Σ_{j=0..k−1}(2p)^j closed-form sa geometric sum (special case p=½ → linear sum). **E[(profit)²]** za varijansu sa Σ(4p)^j. **E[spins/round]** = k·p^k + Σ j·p^(j−1)·q. **riskRewardRatio** = cashOutPayout / E[abs loss | loss-end]. **chasePatternRiskScore ∈ [0,1]** heuristic (deep target + high p). | `src/features/paroliStreakCashOut.ts` | 30 vitest specs (Wave 165) + 6 industry let-it-ride configs × 5K MC rounds (Wave 166); portfolio entry W165 |

## Pattern Catalog v2.41 — AWP Cycle Convergence Analyzer Kernel (Wave 167/168) — INDUSTRY-FIRST UK Class III B3/B3A/C/D, 55th solver

First analyzer ABOVE existing IR state machine (`src/jurisdiction/compensatedMath.ts`).
UK Class III machines (B3 70% RTP, B3A, C, D 90%) obavezno publikuju cycle
convergence within tolerance band (typical τ=4pp). UKGC LCCP / MGA AWP §15 /
EU GA 2024 / AU NCPF require finite-cycle proof.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-075 | **AWP Cycle Convergence (INDUSTRY-FIRST UK Class III, 55th solver, first above-IR kernel)** | Cycle N spins, base bet b, target R*, tolerance τ. Current snapshot (n=spinsPlayed, P_n=cumPay). Remaining m=N−n. Per-spin under target: Y ~ N(R*·b, σ²·b²). Remaining sum S_m ~ N(m·R*·b, m·σ²·b²) (CLT). **E[r_N] = (P_n + m·R*·b)/(N·b)**. **stdDev[r_N] = σ·√m / N** (shrinks → 0 as m → 0). Deviation D_N = r_N − R*. **P(|D_N|>τ)** = (1−Φ((τ−μ_D)/σ_D)) + Φ((−τ−μ_D)/σ_D) Bachelier-CLT. **oneInNCyclesExceeds = 1/P(exceeds)**. **compensationHintRecommended = −E[D_N]** (nudge that offsets projected drift). **maxAchievableDeviationNoCompensation = |μ_D| + 3σ_D** envelope (99.7%). **cycleHealthScore = 1 − P(exceeds)** ∈ [0, 1]. | `src/features/awpCycleConvergence.ts` | 30 vitest specs (Wave 167) + 6 UK Class III configs × 3K MC cycles (Wave 168); portfolio entry W167 |

## Pattern Catalog v2.42 — Drop-and-Stick Wild Expansion Analyzer Kernel (Wave 169/170) — 56th solver, per-cell sticky accumulation

Iconic mehanika za NetEnt Witchcraft Academy (spreading sticky wilds),
Pragmatic Wild West Gold (money wilds), Hacksaw Tombstone (skull wilds),
Push Mount Magmas (lava wilds), Yggdrasil Vikings Go Berzerk (rage wilds).
Per-cell iid geometric saturation distinct from prior wild kernels P-013
(Walking Wild), P-029 (Multi Wild Stack), P-053 (Sticky Wild Countdown).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-076 | **Drop-and-Stick Wild Expansion (56th solver, per-cell sticky)** | N×M grid, iid Bernoulli(q) per cell per spin, wild stays sticky exactly S spins. Per cell P(wild active at t) = 1−(1−q)^min(t,S). Saturates at t=S. **E[W_t] = N·M·[1−(1−q)^min(t,S)]**, **E[W_∞] = N·M·[1−(1−q)^S]**. **Var = N·M·p·(1−p)** iid Bernoulli. **Time-averaged over [1, T]**: phase-1 sum Σ_{t=1..min(T,S)}[1−(1−q)^t] = min(T,S) − (1−q)·(1−(1−q)^min(T,S))/q; phase-2 (T>S only): (T−S)·perCellSteady. **gridFillProbSteadyState = perCellSteady^(N·M)** (all cells active by iid). **expectedSpinsToFullGridFill = 1/fillProb** Geometric approx. payoutPerSpinProxy = baseline + perWildBonus·E[W_t] linear approx. | `src/features/dropStickWildExpansion.ts` | 30 vitest specs (Wave 169) + 6 industry-iconic sticky configs × 2K MC episodes (Wave 170); portfolio entry W169 |

## Pattern Catalog v2.43 — Tumbling Cascade Chain Length Analyzer Kernel (Wave 171/172) — 57th solver, Wald identity

Iconic za Pragmatic Sweet Bonanza family / NetEnt Gonzo's Quest (original
tumbling) / Reactoonz / Pragmatic Big Bass tumble FS / Hacksaw Tombstone
tumble / Push Money Cart 4 cascade / Quickspin Reactor Wilds. Wald identity
za chain length × per-cascade payout.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-077 | **Tumbling Cascade Chain Length (57th solver, Wald identity)** | Per-cascade P(at least one win) = p ∈ (0, 1), iid (stationary ergodic). Chain length **C ~ Geometric(p)**: P(C=k) = p^k·(1−p) for k = 0, 1, 2, ... **E[C] = p/(1−p)**, **Var[C] = p/(1−p)²**. **Survival**: P(C≥k) = p^k. Per-cascade payout Y_i iid sa E[Y], Var[Y]. **Wald identity**: E[total spin payout] = E[C]·E[Y]; **Var[total] = E[C]·Var[Y] + Var[C]·(E[Y])²**. Disclosure tier thresholds [3, 5, 10, 20]: regulatorni "1 in N spins for k-cascade chain" form. probAtLeastOneWinPerSpin = p, oneInNSpinsAnyWin = 1/p. | `src/features/tumblingCascadeChainLength.ts` | 30 vitest specs (Wave 171) + 6 industry tumbling-slot configs × 10K MC spins (Wave 172); portfolio entry W171 |

## Pattern Catalog v2.44 — Pick-and-Click Pooper Bonus Analyzer Kernel (Wave 173/174) — 58th solver, Negative Hypergeometric

Iconic za Aristocrat 5 Dragons pick-prize / IGT Wheel of Fortune Pick-a-Pack /
Bally Quick Hit pick-a-prize / NetEnt Gonzo's Quest Bonus hieroglyph reveal /
Konami China Shores pick-and-click / Aristocrat Buffalo Gold Collection
pick-coin bonus / Light & Wonder Wonder 4 pick-a-game. First pick-bonus
kernel modeling sample-without-replacement until terminator hit.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-078 | **Pick-and-Click Pooper Bonus (58th solver, Negative Hypergeometric)** | Pool sa N total boxes, K poopers (terminators), M = N − K prize boxes. Player reveals without replacement until first pooper hit (ili maxReveals cap). T = number of prize reveals before first pooper, T ∈ {0, 1, ..., M}. **T ~ NHG(N, K, r=1)** (Johnson-Kotz-Kemp "Univariate Discrete Distributions" §6.2.4). Closed form: **E[T] = M/(K+1)**; **Var[T] = M·(N+1)·K / ((K+1)²·(K+2))**; **P(T = 0) = K/N** (first pick je pooper). PMF recursion `P(T=t) = ∏_{j=0..t−1}(M−j)/(N−j) · K/(N−t)` numerically stable. Per-prize value V iid sa (μ_V, σ²_V). **Wald compound**: E[S] = E[T]·μ_V, Var[S] = E[T]·σ²_V + Var[T]·μ_V². Cap truncation lumps residual mass u cap bucket (truncated PMF sums to 1). Disclosure: survivalAtThresholds (P(T≥k), oneInNRounds), probZeroReveals + oneInNRoundsZeroPicks (regulatorni "1 in X rounds first pick busts"), probReachesCap. Distinct od W107 N-stage tree (no terminator), W118 collect-N Markov, W116 mystery, W160 baseline single-reveal, W171 Geometric WITH replacement (NHG = WITHOUT replacement). | `src/features/pickClickPooperBonus.ts` | 36 vitest specs (Wave 173) + 6 industry pick-bonus configs × 20K MC rounds (Wave 174); portfolio entry W173 |

## Pattern Catalog v2.45 — Skill-Stop Near-Miss Rate Analyzer Kernel (Wave 175/176) — 59th solver, INDUSTRY-FIRST anti-near-miss regulatory inflation detector

Iconic regulatory analyzer pokriva multi-regime jurisdictional compliance za
near-miss mechanic: UKGC RTS 12 (BANNED deliberate enhancement), JP Pachislot
風営法 §2(7) (≤ 1.5× cap), AU NCPF 2022 §3.4 (NSW/VIC 1.2× disclosure),
AGCO Slot Standards 2024 §5.7 (Ontario follows UKGC), EU GA 2024
cross-jurisdiction. Academic foundations: Reid (1986) J Gambl Behav 2(1):32-39,
Harrigan & Dixon (2009) PAR Sheets, Templeton et al (2015) J Gambl Studies 31(3):785-800.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-079 | **Skill-Stop Near-Miss Rate (59th solver, INDUSTRY-FIRST regulatory inflation detector)** | Per reel N symbols, M jackpot/payline-trigger symbols, K near-miss band (typically 1). Reel stops uniformly at random (RNG-driven) → **baselineNearMissRate = 2K·M/N**, **baselineWinRate = M/N**. **inflationRatio = observed/baseline** od operator-provided observed near-miss rate (from PAR sheet ili LIVE telemetry). **regulatoryFlag = (inflation > tol + noiseTolerance)** sa regime-aware tolerance: {UKGC:1.0, AGCO:1.0, AU_NCPF:1.2, JP_PACHISLOT:1.5}. **severityScore = max(0, inflation − tol)**. **frustrationRatio = observed/baselineWin = inflation·2K** (cognitive "almost-won" amplification). Multi-reel R-reel aggregation: **anyReelNearMissProb = 1 − (1 − p_NM)^R**, **allButOneWinNearMissProb = R·winRate^(R−1)·observedNM** (4-of-5 jackpot + 1 near-miss reel = most psychologically salient frustration event). expectedFrustrationEventsPerSpin = max(0, observedNM − winRate)·R. **disclosureText** emits regulatory-body language (UKGC RTS 12 / 風営法 / NCPF §3.4 / AGCO §5.7) za help-screen + certification audit. Distinct od W127 anticipation/tease animation (slow-down, ne RNG), W163 Martingale chase, W167 above-IR cycle, W123 mega expansion, W93 winning aggregation. | `src/features/skillStopNearMiss.ts` | 43 vitest specs (Wave 175) + 6 regulatory + reel-design configs × 50K MC spins (Wave 176); portfolio entry W175 |

## Pattern Catalog v2.46 — 🎯 Avalanche Reactor Remove-and-Drop Wave Aggregator Kernel (Wave 177/178) — 60. solver MILESTONE, doubly-compound Wald

🎯 **60-SOLVER PORTFOLIO MILESTONE.** Iconic za Play'n GO Reactoonz family
(Quantum Leap, Quantoom multi-tier) / ELK Reactor Energy / Big Time Gaming
Megaways evolution / Hacksaw Gaming Tombstone Rip / Pragmatic Sweet Bonanza
ante-bet sa multiplier evolution / Push Gaming Punk Toilet. Doubly-compound
Wald aggregator za threshold-activation feature triggered by ACCUMULATED
symbol removals across the entire multi-wave avalanche-reactor spin.

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-080 | **🎯 Avalanche Reactor Wave Aggregator (60. solver MILESTONE, doubly-compound Wald)** | Per spin: W = waves ~ **Geometric(p)** (E[W]=p/(1−p), Var[W]=p/(1−p)²); per wave L_i iid removals (μ_L, σ²_L) iz cluster-size distribution. **Wald compound**: **E[S] = E[W]·E[L]**, **Var[S] = E[W]·Var[L] + Var[W]·(E[L])²** za total removals S = Σ_{i=1..W} L_i. **Threshold activation** (Quantum Leap @ T=40 za Reactoonz, Energy @ T=10 za ELK, evolution @ T=60 za Megaways, Rip @ T=20 za Tombstone, multiplier-evolution @ T=80 za Sweet Bonanza ante-bet): P(S ≥ T) via **CLT-Normal approximation** z = (T − E[S])/stdDev[S]; P(S ≥ T) = 1 − Φ(z) (Abramowitz-Stegun 26.2.17 normalCdf, max abs err 7.5e-8). Conservative **Markov bound**: P(S ≥ T) ≤ E[S]/T. CLT valid kada E[W] >> 1 (typical >= 5 strict); for low E[W] analyzer izpostavlja BOTH metrika. Disclosure: removalSurvivalAtThresholds (P(S≥k) sa oneInNSpins), oneInNSpinsActivation = 1/P(S≥T), meanToThresholdRatio = E[S]/T. Distinct od W086 deterministic pyramid / W102 cluster compound variance (different level) / W121 cascade multiplier lockstep / W138 capped mult ladder / W146 charge meter inside one cascade / W171 chain length payout (ne removal threshold) / W118 single-collect / W144 trail deterministic / W150 multi-tier (single threshold here). | `src/features/avalancheReactorWaveAggregator.ts` | 35 vitest specs (Wave 177) + 6 industry avalanche-reactor configs × 50K MC spins (Wave 178); portfolio entry W177 🎯 |

## Pattern Catalog v2.47 — Sticky Multiplier FS Trail Aggregator Kernel (Wave 179/180) — 61. solver, compound Binomial trail sa quadratic-in-N payout

**61st closed-form solver.** Iconic za Big Time Gaming Bonanza Megaways FS (M_0=1, +1 sticky
per cluster win), Pragmatic Sweet Bonanza FS (mult-coin lands sa avg Δ multiplier), Pragmatic
Big Bass Bonanza FS Money Collect, BTG White Rabbit FS (xMult per scatter), Hacksaw Wanted
Dead or a Wild Bounty FS (xMult chain za bounty hit), Pragmatic Money Cart 4 EXTRA SHIFT
(persistent multiplier across re-spins), ELK Wild Robo Factory (sticky multiplier accumulator),
Quickspin Big Bad Wolf FS Pigs Turned Wild. **Doubly-compound payout** = base FS win × cumulative
trail multiplier summed over N spins — linear-in-N multiplier growth daje quadratic payout scaling
(defining commercial signature za sticky-trail FS).

| ID | Pattern | Math Kernel | Solver Module | Acceptance Proof |
|----|---------|-------------|---------------|------------------|
| P-081 | **Sticky Multiplier FS Trail Aggregator (61. solver, compound Binomial trail quadratic-in-N payout)** | N FS spinova. Per spin Bernoulli(q) increment event (cluster win, mult-coin land, scatter retrigger — vendor-specific). When I_i = 1, multiplier increments by Δ_i ~ iid sa (E[Δ]=μ_Δ, Var[Δ]=σ²_Δ). **N_inc = Σ I_i ~ Binomial(N, q)** (E[N_inc]=N·q, Var[N_inc]=N·q·(1−q)). T_inc = Σ_{i=1..N_inc} Δ_i compound Binomial sum. **Wald-Blackwell**: E[T_inc]=N·q·μ_Δ, Var[T_inc]=N·q·(σ²_Δ + (1−q)·μ_Δ²). **`E[M_N] = M_0 + N·q·μ_Δ`** (linear u N), **`Var[M_N] = N·q·(σ²_Δ + (1−q)·μ_Δ²)`**. **Trail-sum payout** S_FS = Σ_{t=1..N} Y_t · M_{t-1}; assuming Y_t independent od M_t (vendor multiplier collected od separate symbol, ne od base win): **`E[S_FS] = μ_Y · (N·M_0 + q·μ_Δ · N(N−1)/2)`** — QUADRATIC u N. Var[S_FS] aggregate Σ_t (E[M²_{t-1}]·σ²_Y + Var[M_{t-1}]·μ_Y²). **commercialUpliftRatio = E[S_FS] / (μ_Y · N · M_0)** vs flat-multiplier FS baseline. **expectedSpinsToReachMultiplierTarget = (M_target − M_0)/(q·μ_Δ)** linear approx (exact requires Negative-Binomial-like). Per-spin E[M_t] trajectory for audit. Distinct od W049 H&W tier-ladder jackpot / W089 Persistent Multiplier no FS-trail aggregation / W097 FS Lookback Multiplier lookback-only / W114 Sticky Wild Countdown countdown not increment / W132 Multi-Level Wild Markov tier / W138 Tumble Capped per-cascade / W121 Cascade Multiplier Chain Lockstep conditional. | `src/features/stickyMultiplierFsTrail.ts` | 31 vitest specs (Wave 179) + 6 industry sticky-trail configs × 20K MC FS-bonus runs (Wave 180); portfolio entry W179 |
| P-082 | **Reel-Bound Mystery Progressive (62. solver, L&W M5 GAP — Quick Hit family adjacency tier)** | R reels, per-reel Bernoulli scatter presence P(QH on reel i) = p_i (independent). **Anchored left-to-right tier** T_k triggers iff first k reels all show QH AND reel k+1 (if exists) does NOT. **`P(prefix_k) = ∏_{i=1..k} p_i`**, **`P(tier_k) = P(prefix_k) − P(prefix_{k+1})`** za k < R_max, **`P(tier_R_max) = P(prefix_R_max)`**. Per-tier payouts prize_k (in × bet); **`E[payout/spin] = Σ P(tier_k) · prize_k`**. Disclosure: oneInNSpinsTier_k = 1/P(tier_k), tierBreakdown[] sa per-tier prob + payout + RTP-share, effectiveTopTierFreq = P(top tier). Distinct od P-035 (W075) multi-tier WAP wheel-trigger Markov / P-051 (W091) unconditional value-sum coin accumulator / P-033 (W071) single-pool seed-cap mystery / P-034 (W072) escalating-hazard pool. | `src/features/reelBoundMysteryProgressive.ts` | 32 vitest specs (Wave 181) + 6 industry Quick Hit configs × 500K MC spins (Wave 181) |
| P-083 | **Dynamic Grid-Expansion Hold-and-Spin Aggregator (63. solver, L&W M3 GAP — Ultimate Fire Link / Lock It Link Eureka)** | Exact Markov DP over state (active_cells a, current_rows_idx m_idx, stale_streak s) sa per-spin Binomial(N·m − a, q) landing PMF. Deterministic row extensions: m += 1 svaki put kad cumulative landings cross next threshold T_k. Classic H&S termination: s == k_stale OR grid fully filled. **Aggregates from terminal-state mass**: E[bags], Var[bags], E[#row extensions] = Σ P(S_final ≥ T_k), E[spins to terminate], P(full max grid achieved), oneInNFeaturesMaxGrid = 1/P(full), E[payout] = E[bags]·μ_V, Var[payout] = E[bags]·σ²_V + Var[bags]·μ_V², commercialUpliftVsFixedGrid = E[payout] / E[payout @ m_0 baseline]. State space small for industry inputs (~500 states, ~100ms per analyze call). Distinct od P-002 (W023) fixed-grid persistent H&S / P-049 (W134) fixed-grid jackpot tier ladder / P-059 (W049) fixed-grid value-tier filled-count / P-076 (W169) drop-and-stick wild (no H&S accumulation) / P-082 (W181) reel-bound adjacency cascade (no grid evolution). | `src/features/dynamicGridExpansionHoldSpin.ts` | 39 vitest specs (Wave 182) + 6 industry Ultimate Fire Link + Lock It Link Eureka configs × 30K MC features (Wave 182) |
| P-084 | **Multi-State Frame Upgrade Markov Aggregator (64. solver, L&W M2 GAP — Huff N' Puff family)** | Each cell c ∈ {1..N·M} runs independent K-state Markov chain sa transition matrix P[K][K]. **Per-cell state distribution after T spins**: **`π_t = π_0 · P^t`** (vector-matrix product, K-dim). **Stationary**: left eigenvector of P sa eigenvalue 1, via power iteration. **Per-cell E[payout per spin at time t]**: E[Y_c(t)] = dot(π_t, m). **Grid aggregate**: **`E[S_T] = N·M · Σ_{t=0..T-1} dot(π_t, m)`**. **Var[S_T] = N·M · per-cell Var** under independence. **`P(per-cell state ≥ k_target at T) = Σ_{k ≥ k_target} π_T(k)`**. **`P(at least one cell reaches k_target) = 1 − (1 − P_per_cell)^(N·M)`**. Disclosure: oneInNCellsReachesTarget = 1/P_per_cell, expectedCellsAtOrAboveTarget = N·M · P_per_cell, commercialUpliftVsIdleBaseline. Supports vendor-specific K (3-state Idle/Wood/Brick, 4-state ladder, 5-state extended, 6-state persistent meter). Distinct od P-058 (W132) SINGLE wild 4-state Markov tier upgrade (ne N×M independent grid) / P-067 (W150) geometric K-threshold (ne Markov) / P-082 (W181) per-reel Bernoulli adjacency / P-083 (W182) grid-expansion DP. | `src/features/multiStateFrameUpgradeMarkov.ts` | 39 vitest specs (Wave 183) + 6 industry Huff N' Puff configs × 5K MC features (Wave 183) |
| P-085 | **Colossal Reels Wild-Transfer Two-Grid Aggregator (65. solver, L&W M7 GAP — Spartacus family + 50+ WMS land-based titles)** | 2-stage Binomial sa conditional coupling. N reels shared across main+colossal. Stage 1: K_main = # wild reels on main grid; per-reel-non-uniform DP O(N²) za joint PMF (handles non-uniform p_w_i across reels). Stage 2: K_col \| K_main ~ Binomial(K_main, q_t) — every main wild reel triggers full-column wild on colossal sa prob q_t. **Closed-form aggregates**: **`P(K_main=k)`** via reel-by-reel DP, **`P(K_main=k, K_col=j) = P(K_main=k)·Bin(j;k,q_t)`** joint PMF; **`E[K_col] = q_t·E[K_main]`** (law of total expectation), **`Var[K_col] = q_t·(1−q_t)·E[K_main] + q_t²·Var[K_main]`** (law of total variance); **`P(full wild both grids) = P(K_main=N)·q_t^N`**; oneInNSpinsFullWildBothGrids = 1/P_full_full; probBothGridsAtLeastOneWild = Σ_{k≥1, j≥1} P(K_main=k, K_col=j); **`E[Y] = Σ_k P(K_main=k)·[payoutMain[k] + Σ_{j≤k} P(K_col=j\|K_main=k)·(payoutCol[j] + jointBonus[k][j])]`**. Optional jointBonusPayoutMatrix za "full-wild jackpot" disclosure. Distinct od P-030 (W058) Parallel Screens Aggregate (INDEPENDENT screens, ne conditional-propagation coupling) / P-058 (W132) single-wild Markov state / P-064 (W123) Mega Symbol single grid / P-076 (W169) drop-stick single grid. | `src/features/colossalReelsWildTransfer.ts` | 39 vitest specs (Wave 184) + 6 industry Spartacus configs × 30K MC spins (Wave 184) |
| P-086 | **Per-Reel Cash-Bag × Per-Row-Multiplier Coupled Accumulator (66. solver, L&W M1 GAP — Dragon Spin CrossLink Water)** | Per-cell Bernoulli × coupled-dimension aggregation. Grid N×M sa per-cell I_{ij}~Bernoulli(q) independent + V_{ij}~iid value (μ_V, σ²_V) conditional on landing. **Per-reel bag**: B_i = Σ_j I_{ij}·V_{ij}, E[B_i] = M·q·μ_V (Wald). **Per-row coin count**: C_j ~ Binomial(N, q). **Per-row multiplier**: M_j(C_j) = m_{C_j} vendor lookup [m_0, m_1, …, m_N]. **Row contribution**: E[M_j·S_j] = μ_V · Σ_c Bin(c;N,q)·m_c·c (tower property). **Total payout**: **`E[Y] = M · μ_V · Σ_{c=0..N} Bin(c;N,q)·m_c·c`**. Var[Y] = M · (E[(M·S)²] − E[M·S]²) gde E[(M·S)²] = Σ_c P(C=c)·m_c²·(c·σ²_V + c²·μ_V²) (rows iid). **Row-full disclosure**: **`P(at least one row full) = 1 − (1 − q^N)^M`**, **`P(all rows full) = q^(N·M)`**, expectedRowsFull = M·q^N, oneInNSpinsAtLeastOneRowFull = 1/P_atLeast. **expectedHighestRowMultiplier**: E[max_j M_j] via Σ v · (CDF_max(v) − CDF_max(prev)) sorted-values approach. **commercialUpliftVsFlatMultiplier**: E[Y_coupled] / (M·μ_V·N·q) vs flat m_c=1 baseline. Distinct od P-002 (W023) single-pool collector / P-067 (W150) single-meter K-tier / P-039/P-046 global persistent multiplier / P-051 (W091) unconditional value-sum / P-083 (W182) grid-expansion DP / P-085 (W184) two-grid wild-transfer. **First kernel** modeling **single-grid coupled per-reel × per-row dvodimenzionalan aggregator**. | `src/features/perReelBagRowMultiplierCoupled.ts` | 36 vitest specs (Wave 185) + 6 industry Dragon Spin CrossLink configs × 20K MC spins (Wave 185) |
| P-087 | **Big Bet Paid-Package Multi-Spin Schedule Aggregator (67. solver, UK-CRITICAL L&W M9 GAP — Barcrest UK family)** | Paket od K spinova, svaki sa distinct (b_k, r_k, σ²_k). **Closed-form aggregates** (per-spin independence): **`C = Σ b_k`** total cost; **`E[Y_total] = Σ b_k·r_k`**; **`Var[Y_total] = Σ σ²_k`**; **`packageRtp = E[Y_total]/C`**; **`E[net profit] = E[Y_total] − C`**. **P(profit) CLT-Normal**: z = (C − E[Y_total])/σ, **`P(profit) = 1 − Φ(z)`** (Abramowitz-Stegun erf max abs err 7.5e-8); **oneInNPackagesAtLeastBreakEven = 1/P(profit)**. **Operator subsidy**: **`max(0, packageRtp − baseRtp) · C`** za UKGC §5.A.E operator-funded portion disclosure. **RTP escalation slope**: linear regression r_k vs spin index k. **UKGC LCCP 3.4.3 harm-threshold flag**: ako E[loss/package] > threshold → responsible-gambling chase-pattern alarm. Disclosure: per-spin contribution-to-package-RTP table, bestSpinIndex/worstSpinIndex sa RTP-ima, perSpinExpectedPayout schedule. Distinct od P-057 (W130) FS Buy single-mode per-tier RTP (ne multi-spin distinct schedule) / P-053 (W095) Ante Bet single bet decision / P-037 (W081) Bonus Buy bez within-package switching / P-072 (W163) Martingale sequential progression bez fixed package. **UKGC RTS-12 mandatory disclosure** za UK Big Bet 2010-2022 regulatory regime, post-Belgian-ban-2018 counterfactual disclosure. | `src/features/bigBetPaidPackageMultiSpin.ts` | 40 vitest specs (Wave 186) + 6 industry Barcrest configs × 30K MC packages (Wave 186) |
| P-088 | **Deterministic Explosion Multiplier-Drop Aggregator (68. solver, L&W M4 GAP — Dancing Drums Explosion + Revolution)** | Trigger-gated compound sum. Per spin: T ~ Bernoulli(p_trigger); conditional on T=1, K predetermined positions explode, svaka pozicija dobija V_k iid iz discrete PMF {(v_l, π_l)} sa Σ π_l = 1. **Closed-form**: **`E[V] = Σ π_l·v_l`**, **`Var[V] = Σ π_l·v_l² − E[V]²`**. Per-trigger sum S = c·Σ V_k: **`E[S | trigger] = K·c·E[V]`**, **`Var[S | trigger] = K·c²·Var[V]`** (iid positions). Per-spin Y = T·S: **`E[Y per spin] = p_trigger · K · c · E[V]`**, **`Var[Y per spin] = p·K·c²·Var[V] + p·(1−p)·(K·c·E[V])²`** (law of total variance). **Top-multiplier disclosure**: maxTotalMultiplierAchievable = K·v_max; **`P(all K hit v_max | trigger) = π_max^K`** rare jackpot; oneInNSpinsAllMaxExplosion = 1/(p_trigger·π_max^K). **Per-value disclosure** (UKGC RTS-14 tag-level audit): probAtLeastOneHitGivenTrigger = 1−(1−π_l)^K, expectedPositionsHittingGivenTrigger = K·π_l, perSpinContributionToPayout = p_trigger·c·K·π_l·v_l. **commercialUpliftVsFlatBaseline**: E[Y] / baselineNoMult. **topTierRtpContribution**: p_trigger·c·K·π_max·v_max. Distinct od P-063 (W142) Symbol Multiplier on Reel-Stop (RANDOM landing positions, not deterministic-by-design) / P-038 (W086) Cascade Sequential Multiplier Pyramid (CHAIN-conditional, not one-shot) / P-086 (W185) Per-Reel Bag × Per-Row-Multiplier Coupled (per-cell Bernoulli landing, different mechanic) / P-067 (W150) Voltage Meter Multi-Tier (single-meter K-tier). | `src/features/deterministicExplosionMultiplierDrop.ts` | 37 vitest specs (Wave 187) + 6 industry Dancing Drums configs × 100K MC spins (Wave 187) |
| P-089 | **Player-Elects Feature Composition Aggregator (69. solver, L&W M11 GAP — RR Pick n Mix + MJ KOP + KISS + 5 Treasures)** | m-of-N combinatorial composition selection. N candidate modes sa distinct (r_i, σ²_i) per mode. Player elects subset S ⊆ {1..N} sa |S| = m. Under independence: **`E[Y | S] = Σ_{i ∈ S} r_i`**, **`Var[Y | S] = Σ_{i ∈ S} σ²_i`**. **Best player-rational pick** (top-m by RTP): S* = argmax, **`E[Y | S*] = Σ_{top-m} r_i`**. **Worst pick** (bottom-m by RTP). **Uniform-random pick**: **`E[Y | uniform] = (m/N) · Σ_i r_i`** (linearity of expectation across all C(N, m) subsets). **RTP spread** = bestPick − worstPick (player-knowledge disclosure value). **Skill premium** = bestPick − uniformPick (rational-strategy advantage). **`numDistinctCompositions = C(N, m)`** binomial coefficient. Per-mode disclosure (UKGC RTS-14 transparency): rankByRtp, inRationalTopMPick, contributionIfPicked. **rationalityCoverageRatio = bestPick / fullPortfolioRTP**. Distinct od P-053 (W095) Ante Bet single-bet decision / P-057 (W130) FS Buy + Tier paid mode (single mode, ne combinatorial) / P-024 (W107) Pick Bonus N-Stage Tree (sequential pick stages, ne simultaneous subset) / P-087 (W186) Big Bet Paid-Package (multi-spin same schedule, ne player-elected modes). | `src/features/playerElectsFeatureComposition.ts` | 35 vitest specs (Wave 188) + 6 industry L&W player-elect configs × 60K MC spins per strategy (Wave 188) |
| P-090 | **Random Feature-Injection During FS Aggregator (70. solver, L&W M12 GAP — Wizard of Oz Munchkinland + WMS sub-feature library)** | Compound per-FS-spin Bernoulli injection. N FS spinova, per spin k: base Y_k + I_k·V_k gde **I_k ~ Bernoulli(p_inject)** iid, V_k iid sub-feature payout sa (μ_V, σ²_V). **Closed-form aggregates**: **`E[S] = N·μ_Y + N·p·μ_V`** (linearity); **`Var[S] = N·σ²_Y + N·p·σ²_V + N·p·(1−p)·μ²_V`** (Bernoulli-mixed compound variance). **# injections per FS bonus**: N_inj ~ Binomial(N, p), E[N_inj] = N·p, Var = N·p·(1−p). **`P(at least one injection) = 1 − (1−p)^N`**, **`P(no injection) = (1−p)^N`**, oneInNFsBonusWithoutInjection = 1/P(≥1). **injectionContributionShareOfFs** = (N·p·μ_V)/E[S]. **commercialUpliftVsBaseFs** = 1 + p·μ_V/μ_Y. Top-tier disclosure: **`P(all N spins inject top-tier) = (p·π_top)^N`** (Munchkin grand jackpot rare). Distinct od P-005/P-014 FS Retrigger (retrigger adds SPINS ne sub-feature payout) / P-066 (W097) FS Lookback Multiplier (post-hoc ne per-spin) / P-076 (W169) drop-stick single-grid sticky / P-081 (W179) Sticky Multiplier FS Trail (accumulator ne random injection) / P-067 (W150) Voltage Meter (single threshold ne per-spin Bernoulli). | `src/features/randomFeatureInjectionDuringFs.ts` | 34 vitest specs (Wave 189) + 6 industry Munchkinland configs × 30K MC FS-bonus runs (Wave 189) |
| P-091 | **Nested Mini-Slot Inside Bonus Compositional Aggregator (71. solver, L&W M14 GAP — LOTR Two Towers + Star Trek)** | Hierarchical parent-child slot composition. Parent bonus trigger Bernoulli(p_bonus), if triggered K_outer outer-spins. Each outer-spin: base X_outer + I_nested · T_inner gde I_nested ~ Bernoulli(p_nested), T_inner = Σ_{k=1..N_inner} Y_inner_k iz independent mini-slot sa own paytable. **E[T_inner] = N_inner·μ_inner, Var[T_inner] = N_inner·σ²_inner**. **E[Z per outer] = μ_O + p_N·N_I·μ_I**; **`Var[Z] = σ²_O + p_N·N_I·σ²_I + p_N·(1−p_N)·(N_I·μ_I)²`** (law of total variance, single level). **E[B | bonus] = K_O·E[Z]**, Var[B] = K_O·Var[Z]. Per-parent-spin: **`E[Y] = p_B · K_O · E[Z]`**; **`Var[Y] = p_B·Var[B] + p_B·(1−p_B)·E[B]²`** (law of total variance, two-level). **P(at least one nested | bonus) = 1−(1−p_N)^K_O**; expectedNestedTriggersPerBonus = K_O·p_N; nestedSlotContributionShare = (K_O·p_N·E[T_inner])/E[B]; commercialUpliftVsNoNestedSlot = E[B]/(K_O·μ_O); oneInNSpinsAnyBonus = 1/p_B. Distinct od P-024 (W107) Pick Bonus N-Stage Tree (pick tree NO sub-spinner) / P-090 (W189) Random Feature-Injection During FS (single payoff ne K-spin nested) / P-005/P-014 FS Retrigger (same FS engine ne independent paytable) / P-053 (W095) Ante Bet (single-bet decision). | `src/features/nestedMiniSlotInsideBonus.ts` | 34 vitest specs (Wave 190) + 6 industry LOTR + Star Trek configs × 50K MC parent-spins (Wave 190) |
| P-097 | 🏆 **Stacked Multi-Wheel Composition Aggregator (77. solver, L&W M6 P1 FINAL GAP — 16/16 L&W KIMI gaps closed, Bally Triple Cash Wheel + Quick Hit Cash Wheel + Cash Wheel Quick Hit)** | N stacked independent wheels sa per-wheel discrete PMF aggregation. N wheels (N ≥ 2), per wheel i: M_i slices sa probability p_{i,j} (Σ_j p_{i,j} = 1) i payout V_{i,j} ≥ 0. Per-wheel moments: **`μ_i = Σ_j p_{i,j}·V_{i,j}`**, **`σ²_i = Σ_j p_{i,j}·V_{i,j}² − μ_i²`**. Joint aggregate **Y = Σ_i W_i** under independence: **`E[Y] = Σ_i μ_i`** (linearity), **`Var[Y] = Σ_i σ²_i`** (independence). Per-wheel disclosure (UKGC RTS-14): expectedPayout + variancePayout + **contributionToTotalRtp = μ_i/E[Y]** + **varianceContribution = σ²_i/Var[Y]** + topSliceProbability + topSlicePayout + oneInNSpinsForThisWheelTopSlice + isBestWheel. Per-slice disclosure: probability + payout + isTopSlice. **Joint top-slice metrics** (UKGC RTS-3 jackpot): **`probabilityAllTopSlice = Π_i p_{i,top}`** (grand jackpot — all wheels hit top simultaneously), **`probabilityAtLeastOneTopSlice = 1 − Π_i (1 − p_{i,top})`**, **`oneInNSpinsAllTopJackpot = 1/Π p_{i,top}`** Geometric. **`commercialUpliftVsSingleWheel = E[Y]/μ_best`** (N-wheel uplift over single-best-wheel baseline). **`independenceVarianceRatio = σ_Y / Σ_i σ_i`** Pearson-style decomposition disclosure (1/√N za N identical wheels; < 1 indicates independence; = 1 for fully correlated). Distinct od P-022 (W104) Wheel Bonus (SINGLE wheel sa categorical slice payout; ovde **N stacked independent wheels** sa aggregate sum) / P-046 (W118) Bonus Wheel Respin (multi-wheel respin **Markov** sa one wheel triggers next; ovde **simultaneous independent** wheels bez Markov chain) / P-035 (W075) Multi-tier WAP + Wheel (per-tier WAP wheel; ovde **per-wheel discrete PMF** ne per-tier WAP) / P-093 (W192) Race/Competitive Pick (categorical winner across N candidates — ONE wins; ovde **all wheels spin, all pay**) / P-091 (W190) Nested Mini-Slot (hierarchical compositional; ovde **flat parallel aggregation**) / P-030 (W110) Parallel Screens (slično N-screen perspective; ovde specifično **N-wheel composition** sa per-wheel PMF + Π joint top-slice jackpot disclosure). | `src/features/stackedMultiWheelComposition.ts` | 33 vitest specs (Wave 196) + 6 industry Bally Triple Cash Wheel + Quick Hit Cash Wheel + Cash Wheel Quick Hit configs × 100K MC spins (Wave 196) |
| P-096 | **Mid-Spin Random Reel-Reshape Mixture Aggregator (76. solver, L&W M13 P1 GAP — WMS Wizard of Oz Follow the Yellow Brick Road Glinda reshape)** | K-component reel-set mixture distribution sa stochastic mid-spin reel-set transition. Per spin **K ~ Categorical(p_0..p_{K-1})**, Σ p_k = 1; konvencija p_0 = base no-reshape (must be > 0), p_k for k≥1 = reshape to alternative reel-set. Per-set **X_k ~ iid** sa distinct (μ_k, σ²_k) own paytable distribution. Per-spin Y = X_K (mixture, all pathways pay including no-reshape base). **Mixture moments** (law of total expectation/variance): **`E[Y] = Σ_k p_k · μ_k`** (mixture mean = total RTP), **`E[Y²] = Σ_k p_k · (σ²_k + μ_k²)`**, **`Var[Y] = E[Y²] − (E[Y])²`** mixture variance. **Decomposition** via conditional variance identity: **`Var[Y] = E[Var[Y\|K]] + Var[E[Y\|K]] = Σ p_k·σ²_k + Σ p_k·μ²_k − (Σ p_k·μ_k)²`** (within-set + between-set components); **withinSetVarianceShare = within / total** ∈ [0,1] auditor decomposition. Per-set disclosure (UKGC RTS-14): contributionToRtp = p_k·μ_k/E[Y] + **oneInNSpinsForThisSet = 1/p_k** Geometric + rankByMeanPayout + isBestReelSet + isBaseReelSet. **`reshapeProbability = 1 − p_0`** (P(any reshape)), **`oneInNSpinsAnyReshape = 1/(1−p_0)`**. **`commercialUpliftVsBaseOnly = E[Y] / μ_base`** (reshape uplift over base-only RTP) — Glinda commercial value. **`bestReelSetUpliftIfReshape = μ_best/μ_base`** (jackpot-tier reshape disclosure). oneInNSpinsBestReelSet = 1/p_best. Distinct od P-094 (W193) Multi-Pot Branched H&S (TRIGGER-gated Y=0 if no trigger; ovde **no-trigger pathway also pays** base reel-set spin, mixture distribution ne trigger gating) / P-089 (W188) Player-Elects Composition (player CHOOSES subset; ovde **vendor-categorical** mid-spin Glinda decision) / P-067 (W150) Voltage Meter K-Tier (cumulative meter advancement; ovde **per-spin** state Categorical reshape) / P-058 (W137) Markov Wild State Tier (within-feature state Markov; ovde **reel-set** switching at engine level — different paytable altogether) / P-022 (W104) Wheel Bonus (wheel slice payout draw; ovde **per-spin reel-set selection** sa own internal payout distribution). | `src/features/midSpinReelReshapeMixture.ts` | 33 vitest specs (Wave 195) + 6 industry Wizard of Oz Glinda + Munchkinland + diverse reshape configs × 100K MC spins (Wave 195) |
| P-095 | **Arcade-Shooter Survival Level Progression Aggregator (75. solver, L&W M16 P1 GAP — Lightning Box Stellar Jackpots wrapper Thundering Bison/Chicken Fox/Lightning Horseman)** | Sequential survival Markov chain sa absorbing failure state + per-level reward + terminal jackpot mixture. L levels sa per-level **Bernoulli pass p_i ∈ (0,1]** i per-level **reward V_i ≥ 0**; K jackpot tiers sa (π_k, μ_J_k, σ²_J_k). **`S_k = ∏_{i<k} p_i`** survival probability (chain rule), **`P(exit at level k) = S_k·(1−p_k)`** early-exit Bernoulli, **`P(complete) = S_{L+1} = ∏ p_i`** terminal. Per-level reward gating: V_k contributes iff player PASSES level k → S_{k+1}·V_k. **`E[Y/run] = Σ_{k=1..L} S_{k+1}·V_k + S_{L+1}·μ_J`** sum of per-level + jackpot-on-complete. **`E[Y²] = Σ_j Σ_k V_j·V_k·S_{max(j,k)+1} + 2·S_{L+1}·μ_J·Σ V_k + S_{L+1}·E[J²]`** via correlated-Bernoulli sa nested indicator identity 𝟙{pass j}·𝟙{pass k} = 𝟙{pass max(j,k)}. **`Var[Y] = E[Y²] − E[Y]²`**. Per-level disclosure (UKGC RTS-14): probReached + probPassed + probExitAtLevel + expectedRewardContribution. Per-jackpot-tier disclosure: selectionProbWithinComplete = π_k + **probabilityHitThisTier = S_{L+1}·π_k** + oneInNRunsForTier = 1/(S_{L+1}·π_k). Top-level metrics: **probabilityCompleteRun = S_{L+1}** + **expectedLevelReached = Σ k·P(exit at k) + (L+1)·S_{L+1}** + **oneInNRunsToComplete = 1/S_{L+1}** + jackpotMeanGivenComplete = Σ π_k·μ_J_k + jackpotShareOfRtp = S_{L+1}·μ_J / E[Y] + **probabilityGrandJackpot = S_{L+1}·π_{best}** top-tier. Distinct od P-024 (W107) Pick Bonus N-Stage Tree (pick-stages bez survival product; ovde **multiplicative ∏ p_i chain** w/ early-exit gating) / P-090 (W189) Random Feature-Injection FS (per-spin Bernoulli ne sequential chain) / P-091 (W190) Nested Mini-Slot (single-level nested per outer-spin ne multi-level survival) / P-094 (W193) Multi-Pot Branched (categorical sub-mode mixture one-winner ne sequential chain) / P-064 (W144) Trail Bonus Tracker (meter-based ne probabilistic Bernoulli survival) / P-046 (W118) Wheel Respin (multi-wheel Markov; ovde **monotone forward** chain w/ absorbing failure). | `src/features/arcadeShooterSurvivalLevels.ts` | 34 vitest specs (Wave 194) + 6 industry Stellar Jackpots + Thundering Bison + Chicken Fox + Lightning Horseman configs × 100K MC runs (Wave 194) |
| P-094 | **Multi-Pot Branched H&S Sub-Feature Selection Aggregator (74. solver, L&W M15 P1 GAP — Bally Rich Little Piggies Piggy Bankin' Break In + World Class + Hens)** | Trigger-gated categorical sub-mode mixture. Per spin **T ~ Bernoulli(p_trigger)**; if T=1 sub-mode index **K ~ Categorical(p_1..p_M)** sa p_k = w_k / Σ_j w_j (vendor-defined; no player skill). Per-pot k: V_k ~ iid sa distinct (μ_k, σ²_k) **structurally different sub-game distributions**. Per-spin Y = T·V_K. **Mixture moments** (law of total expectation/variance): **`E[V \| trig] = Σ_k p_k · μ_k`**, **`E[V² \| trig] = Σ_k p_k · (σ²_k + μ²_k)`**, **`Var[V \| trig] = E[V²] − (E[V])²`**. **`E[Y/spin] = p_trigger · Σ_k p_k · μ_k`**, **`Var[Y/spin] = p_trigger·Var[V\|trig] + p_trigger·(1−p_trigger)·(E[V\|trig])²`** law of total variance on trigger. Per-pot disclosure (UKGC RTS-14): **contributionShareOfBonus = p_k·μ_k / E[V\|trig]**, **oneInNTriggersForPot = 1/p_k** Geometric (regulator "1 in X" form), rankByMeanPayout (1..M desc), isBestPot. **jackpotPotShare = max p_k·μ_k / E[V\|trig]** (max share from single pot). **bonusVariabilityIndex = σ_V / μ_V** coefficient of variation (RTS-14 disclosure). **oneInNSpinsAnyTrigger = 1/p_trigger**, **`oneInNSpinsTopPotTrigger = 1/(p_trigger · p_{best})`**. **`mixtureVarianceLift = Var[V\|trig] / Σ p_k·σ²_k`** cross-pot diversity index (>1 indicates real mixture spread beyond within-pot variance). Distinct od P-089 (W188) Player-Elects Composition (player CHOOSES subset additively m-of-N; ovde **vendor-categorical** mixture bez player skill) / P-091 (W190) Nested Mini-Slot (single nested per outer-spin gated Bernoulli; ovde **categorical branch** among M heterogeneous sub-modes) / P-022 (W104) Wheel Bonus (wheel slice categorical bez own-distribution per slice; ovde each pot ima **distinct (μ_k, σ²_k)**) / P-093 (W192) Race/Competitive Pick (player-elects + categorical winner; ovde **vendor-categorical** bez player pick) / P-068 (W155) Bonus Trigger Stratification (scatter-count gates bonus tier; ovde single trigger + sub-mode categorical). | `src/features/multiPotBranchedHoldSpinSubFeature.ts` | 35 vitest specs (Wave 193) + 6 industry Rich Little Piggies configs × 100K MC spins (Wave 193) |
| P-093 | **Race/Competitive Pick One-Winner-Among-N Aggregator (73. solver, L&W M8 P1 GAP — WMS Goldfish Race for the Gold + Reel'em In Big Bass Bucks)** | Categorical winner + player-pick gating × multiplier draw. N candidates sa weights w_i ≥ 0 → **p_i = w_i / Σ_j w_j**. Per race K ~ Categorical(p_1..p_N) → exactly one winner. Per-candidate (V_i basePrize, M_i multiplier draw sa (μ_M_i, σ²_M_i)). Player pre-race elects s ∈ {1..N}; payout collected only if elected wins: **Y(pick=s) = V_s · M_s · 𝟙{K=s}**. **`E[Y \| pick=s] = p_s · V_s · μ_M_s`** linearity over Bernoulli×iid factorization. **`E[Y² \| pick=s] = p_s · V_s² · (σ²_M+μ²_M)`** (since 𝟙² = 𝟙). **`Var[Y \| pick=s] = E[Y²] − E[Y]²`**. **bestPickIndex = argmax_s** E[Y|pick=s] (rational max-EV), worstPickIndex = argmin, **uniformPickRtp = (1/N)·Σ_s E[Y\|s]** (random pick). **`skillPremiumVsUniform = best − uniform`** (rational-strategy advantage). **`rtpSpread = best − worst`** disclosure. **commercialUpliftOverSymmetric = bestRtp / uniformRtp**. Per-candidate disclosure (UKGC RTS-14 transparency): probWin, expectedReturnIfPicked, rankByExpectedReturn (1..N desc), isRationalPick. **`probabilityBestPickWins = p_{s*}`**, **`expectedRacesToFirstBestWin = 1/p_{s*}`** Geometric expectation. **`probBestPickWinsAtLeastOnce(K races) = 1−(1−p_{s*})^K`** complement-survival. Distinct od P-089 (W188) Player-Elects Composition (m-of-N subset sa additive Σ r_i contributions; ovde **one winner exactly** sa **multiplicative pick gating**, ne additive) / P-024 (W107) Pick Bonus N-Stage Tree (sequential picks across stages, ne single pre-race election + categorical winner) / P-022 (W104) Wheel Bonus (wheel slice categorical bez pre-pick gating) / P-046 (W118) Bonus Wheel Respin (multi-wheel respin Markov) / P-068 (W155) Bonus Trigger Stratification. | `src/features/raceCompetitivePickWinner.ts` | 35 vitest specs (Wave 192) + 6 industry Goldfish Race + Big Bass Bucks configs × 50K MC races per strategy (2 strategies = 600K MC total) (Wave 192) |
| P-092 | **Bonus Bank Running-Balance Offset Aggregator (72. solver, L&W M10 P0 GAP — Barcrest Rainbow Riches Megaways Bonus Bank UK-banking)** | Per-spin bucketed aggregation sa player-elected banking transformation. N FS spinova, per-spin W_k ~ iid sa overall μ_W = p_low·μ_low + (1−p_low)·μ_high (tower property) i overall σ²_W ≥ 0. Three player-elected modes: **Mode A "bank_off_wins"** baseline T_A = Σ W_k → **`E[T_A] = N·μ_W`**, Var[T_A] = N·σ²_W; **Mode B "bank_all_wins"** multiplier m_B na entire pool T_B = m_B·Σ W_k → **`E[T_B] = m_B·N·μ_W`**, **`Var[T_B] = m_B²·N·σ²_W`**; **Mode C "bank_small_wins"** Z_k = W_k·(1+(m_S−1)·𝟙{W_k≤τ}) → **`E[Z] = p_low·m_S·μ_low + (1−p_low)·μ_high`**, **`E[Z²] = p_low·m_S²·(σ²_low+μ²_low) + (1−p_low)·(σ²_high+μ²_high)`**, Var[Z] = E[Z²]−E[Z]², T_C = N·Z. **bestModeIndex** + bestModeExpectedPayout + worstModeExpectedPayout + **`rtpSpread = best−worst`** + **`skillPremiumVsUniform = best − ⟨A,B,C⟩`** za player choice value disclosure. **`bonusBankAdditiveOffsetB = (m_B−1)·N·μ_W`** linear offset over baseline. **`bankSmallContributionShareC = (m_S−1)·p_low·μ_low / E[Z]`** per-spin uplift share attributable to small bucket. **`commercialUpliftBVsBaselineA = E[T_B]/E[T_A] = m_B`**, commercialUpliftCVsBaselineA = E[T_C]/E[T_A]. UKGC RTS-12 mandatory player-elected mode RTP disclosure (UK 2010+ Barcrest Bonus Bank regulation), UKGC RTS-14 Bonus Bank transparency, MGA PPD §11, eCOGRA per-mode RTP audit trail, EU GA 2024. Distinct od P-066 (W097) FS Lookback Multiplier (POST-HOC max-sum disjoint segment, ne per-spin bucket banking) / P-089 (W188) Player-Elects Feature Composition (combinatorial m-of-N mode subset, ne aggregation transformation) / P-087 (W186) Big Bet Paid-Package (paid pre-spin tier, ne post-spin banking) / P-067 (W150) Voltage Meter (cumulative meter, ne per-spin bucket gating). | `src/features/bonusBankRunningBalanceOffset.ts` | 39 vitest specs (Wave 191) + 6 industry RR Megaways Bonus Bank configs × 30K MC bonus-sessions (Wave 191) |

**One-button portfolio runner:** `npm run closed-form-portfolio` exercises
all **77 P-021..P-097 kernels** in ~10 seconds and emits unified
report `reports/dossier/CLOSED_FORM_PORTFOLIO.{json,md}`.



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
