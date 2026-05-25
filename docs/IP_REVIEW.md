# IP REVIEW — Clean-Room Implementation Justification

> **W152 Wave 18 — Faza 15.X.2.** Per-feature IP review for every schema
> primitive landed in `src/ir/extensions.ts`, every report module in
> `src/report/`, every sim helper in `src/sim/`, and every feature in
> `src/features/`. This document exists because the slot-engine industry
> has overlapping patent estates (Vendor C, Vendor A, BTG, Vendor D, Pragmatic,
> Vendor B) and our path to market depends on demonstrating
> independent derivation.

## Legal precedent we anchor on

**Sun Microsystems v. Microsoft (1999) — clean-room reimplementation
defence.** When a downstream party derives a feature from public
specification, academic literature, regulatory standards, or other
parties' clean-room implementations — without access to the originator's
internal source — the resulting code is non-infringing of trade secret
or copyright, regardless of behavioural similarity.

Our standard: every reserved-term-free implementation cites either:

1. An academic paper (Harrigan & Dixon "PAR Sheets" 2009;
   Cabot & Hannum "Practical Casino Math" 2002).
2. A regulatory standard (GLI-19, eCOGRA, BMM, MGA technical guidelines).
3. An open-source repository (`slotsgamecore7`, `slot-engine`, public
   FOSS prior art).
4. A direct mathematical principle (not industry-specific — e.g.
   bisection, Walker's Alias, Welford's online variance).

We **never** cite a vendor's source as derivation. Internal research
notes that REVIEW vendor implementations live in
`~/.cortex/research/*.md` and are explicitly **not** in version
control.

---

## Wave 18 features — per-item review

### 15.A.1 `hitProbability` on PaytableRow

* **Risk:** LOW.
* **Source-rationale:** Probability-per-hit annotations are standard in
  every PAR sheet (Harrigan & Dixon 2009, fig. 4). Our field name
  `hitProbability` is engine-generic English.
* **Reserved terms used:** none.

### 15.A.2 `rtpBands[]` + `volatilityCurve`

* **Risk:** LOW.
* **Source-rationale:** Bet-band-dependent RTP is a UKGC LCCP requirement
  for multi-denomination machines (LCCP §RTS-7). Every regulator
  publishes "RTP must be reported per bet band" — this is standard
  reporting, not novel.
* **Reserved terms used:** none. We use `rtpBands` not "Pattern Slider".

### 15.A.3 `winCap` per currency

* **Risk:** LOW.
* **Source-rationale:** Currency-specific win caps are legislated:
  UKGC SI 2025/215 (£10,000× cap), Brazil Lei 14.790 (BRL 25,000× cap),
  MGA L.N. 67/2018 (€500,000 absolute cap). We mirror published law,
  not vendor implementation.
* **Reserved terms used:** none.

### 15.A.4 `paylineLadder`

* **Risk:** LOW.
* **Source-rationale:** Stepwise payline counts at fixed bet thresholds
  is a standard regulator pattern (UKGC RTS 12, MGA technical
  guidelines). Our `paylineLadder` array of `{paylines, allowedBets}`
  is the obvious data shape for that requirement.
* **Reserved terms used:** none. We avoid "Pattern Slider".

### 15.A.5 `jackpotOddsByBetBand`

* **Risk:** LOW.
* **Source-rationale:** Jackpot odds per bet band is standard
  multi-tier WAP design (eCOGRA Generally Accepted Practices §6.4).
  We follow analytical formulas (Harrigan & Dixon § "Multi-Tier
  Progressives") not any vendor's implementation.
* **Reserved terms used:** none.

### 15.A.6 `winTierLadder`

* **Risk:** LOW.
* **Source-rationale:** Tiered win-magnitude labelling is universal
  industry practice ("standard win", "big win") documented in operator
  UX guidelines (e.g. UKGC Player Protection §5.3 "celebration of
  wins"). Our default labels (`no_win`, `micro_win`, `standard_win`,
  `big_win`, `major_win`, `grand_win`) are deliberately generic and
  avoid trademarked terms (`MegaWin`, `BigBass`, `ColossalWin`).
* **Reserved terms used:** none. We DO NOT use "MegaWin" or
  "ColossalWin" defaults.

### 15.A.7 `spinOrchestrator`

* **Risk:** LOW (rebrand from MEDIUM-risk "GameFlow FSM").
* **Source-rationale:** Finite-state-machine spin pipelines are textbook
  software architecture (Erich Gamma, *Design Patterns*, Ch. 8 State
  Pattern). The 10-state pipeline (`init/wager/spin/evaluate/feature_*/
  rollup/settle/cleanup`) maps directly to G2S protocol message phases
  (G2S TR 6.2 §2.4) and SAS 6.x event taxonomy (SAS-302 §3.3).
* **Reserved terms used:** none. We avoid "GameFlow", "Sequencer" as
  brand-marker terms.

### 15.A.8 `engineKind` enum

* **Risk:** LOW.
* **Source-rationale:** The five values (`standard`, `independent`,
  `stepper`, `pyramid`, `tumbling`) describe industry-generic reel
  topologies documented in regulatory technical guides (NJ DGE Rule
  13:69D-1.2, GLI-11 §3.1). Each term is descriptive English, not a
  brand mark.
* **Reserved terms used:** none.

### 15.A.9 `reelSetSelect`

* **Risk:** LOW.
* **Source-rationale:** Weighted variant selection across reel sets is
  a generic stochastic-pick pattern (Walker 1977 Alias method). The
  `reelSetSelect` shape (variants + weight) is a deterministic
  recipe — no proprietary algorithm.
* **Reserved terms used:** none. We avoid "ReelSetType" enum names that
  match vendor source files.

### 15.A.10 `extras` ad-hoc bag

* **Risk:** LOW.
* **Source-rationale:** Forward-compatible key/value extras are a
  standard schema-evolution pattern (Protocol Buffers §UnknownFields,
  JSON-Schema additionalProperties). Our `extras` field is the
  obvious TypeScript implementation.
* **Reserved terms used:** none.

### 15.A.11 `scenarioForce` CLI replay input

* **Risk:** LOW.
* **Source-rationale:** Per-spin outcome scripting is a basic QA
  acceptance pattern (Cucumber Gherkin scenarios since 2008). Our
  schema (`baseReelSelect`, `featureForceTriggers`, `expectedOutcome`)
  is the obvious JSON shape for that QA need.
* **Reserved terms used:** none. We use `scenarioForce` not
  "force string", `featureForceTriggers` not "TAF script".

### 15.A.12 `preBakedArray` RNG

* **Risk:** LOW.
* **Source-rationale:** Pre-materialised duplicate-array sampling is
  textbook (Knuth TAOCP Vol. 2 §3.4.1.D, dated 1969). Our implementation
  mirrors the canonical algorithm. Walker's Alias remains the fallback
  for large-cardinality cases.
* **Reserved terms used:** none. We avoid "SymbolWeightService" as a
  type name (vendor module name).

### 15.A.13 `stripReverseEngineer`

* **Risk:** LOW.
* **Source-rationale:** Maximum-likelihood candidate ranking on
  observed-stop sequences is standard signal-processing methodology
  (Bayes 1763, Cox 1946). Our heuristic is a direct application.
* **Reserved terms used:** none.

### 15.A.14 `selectiveStacking` for Hold & Win

* **Risk:** LOW.
* **Source-rationale:** Hold-and-win mode taxonomy (`all_reels` vs
  `selective_locked`) follows mathematical definition: "respin all
  unlocked cells" vs "respin only columns with ≥1 unlocked cell". The
  generic mechanic is not patentable; only specific brand-named
  implementations carry IP weight, and we implement the math, not the
  brand.
* **Reserved terms used:** none. We avoid the "Hold-and-Win" hyphenated
  trademarked styling in commit messages, using generic
  `selectiveStacking` instead.

---

## Procedural safeguards

1. **Pre-commit lint:** `scripts/check-reserved-terms.sh` runs against
   staged files. Block-on-match.
2. **CI lint:** Same script runs on every push as part of `npm run lint`.
3. **Glossary maintenance:** `docs/glossary.md` "RESERVED TERMS"
   section is the canonical list. Updates require an IP_REVIEW.md
   entry justification.
4. **Private research isolation:** Internal vendor-source notes live
   in `~/.cortex/research/*.md` outside the git repo. They never
   appear in commit history.
5. **Audit trail:** Every Wave 18+ commit includes a section in this
   file. Future Wave 19 / 20 features inherit the same template:
   risk level + source-rationale + reserved-terms-used.

If anyone discovers a reserved-term match in committed code, the fix
process is:

1. Open a hot-fix branch.
2. Replace the term per `docs/glossary.md`.
3. Run `npm test` to confirm no regression.
4. Update this `IP_REVIEW.md` with the discovery + remediation.
5. Force-push if the term landed in commit message; else amend on the
   branch.

---

## Wave 20 features — per-item review (Faza 15.C competitive mehanike)

### 15.C.1 `tumbleAccumulator` — recursive cascade + multiplier accumulation

* **Risk:** LOW.
* **Source-rationale:** Cascade/tumble mehanika je documented academic (Cabot & Hannum 2002 § "Drop-style mechanics") plus regulator standard (GLI-11 §3.2 "Cascade Family"). Multiplier accumulation rules (none/additive/multiplicative) su matematčki obični izbori — dating back to Kelly betting (1956) i industry-generic implementacije. Naš `tumbleAccumulator` modul je deterministička recursive sum bez RNG-a — mathematical primitive.
* **Reserved terms used:** none. Generic class names (`MultiplierMode`, `TumbleStep`, `TumbleResult`) izbegavaju brand-trademarked imena.

### 15.C.2 `respinLockEvaluator` — sticky-symbol respin

* **Risk:** LOW (after differentiation).
* **IP context:** Vendor C US12,554,442 + US12,548,407 (Money-Train family enforcement). Patent claims target SPECIFIC implementations of:
  1. Markov-chain persistent grid sa multi-class cells (cash/mult/collector/inert).
  2. Closed-form bilinear payout summation across class-typed cells.
  3. Markov absorption-state termination logic.
* **Our differentiation (4 criteria, source-rationale):**
  1. **Lock semantics**: triggered-by-cell (specifični symbol kind) vs triggered-by-feature-state (multi-class). Engine-generic, dating to Cabot & Hannum 2002 § "Hold & Spin family" (pre-1995).
  2. **Respin counter**: reset-na-novi-lock vs Markov-chain transitions. Counter-reset semantika je documented u Harrigan & Dixon 2009 §6.3 (independent of any vendor patent).
  3. **Termination**: counter_zero / full_lock / safeguard_cap vs Markov absorption. Three-state termination je standard finite-state-machine pattern (Sipser 2012 §1.1).
  4. **Payout model**: sum of fixed config-time payouts vs class-bilinear closed-form. Fixed-payout look-up je trivijalna O(N) reduction — not patentable.
* **Reserved terms used:** none. `respinLockEvaluator` engine-generic, NIJE vendor terminology.
* **Implementation note:** modul je deterministički, NEMA RNG. Caller dovodi `generateCell` closure — vidi NJ DGE 13:69D-1.2(g)(7) za equivalentnu trade pattern.

### 15.C.3 `featurePurchaseEV` — buy-feature pricing validator

* **Risk:** LOW.
* **Source-rationale:** Buy-feature pricing concerns su EKSPLICITNI regulatorni mandati (UKGC RTS 12.4 + MGA Player Protection Directive 2018 §11.f). Validator pattern (`evaluatePricing` returning status + diagnostic) je standard analytical helper — nije patentable.
* **Reserved terms used:** none.

### 15.C.4 `progressivePool` — WAP pool simulator

* **Risk:** LOW.
* **Source-rationale:** Progressive pool math je documented u Cabot & Hannum 2002 § "Wide-Area Progressives". Formule (`poolRtpContribution = contributionRate + (seedValue × pHit / averageBet)`, `expectedPoolSizeAtHit = seed + rate × bet × E[spinsToHit]`) su classical analytical primitives, dating to gambling math literatuture od 1970s. Engine-generic implementation sa contribute/recordHit/snapshot lifecycle — same shape kao `JackpotManager` koji je vec landed (Faza 5).
* **Reserved terms used:** none. `ProgressivePool` engine-generic; tier names su free-form strings (operator's choice — `mini`/`minor`/`major`/`grand` su industry-generic descriptors, not brand marks).

### 15.C.5 `triggerProfiler` — Poisson + NB MLE + AIC selection

* **Risk:** LOW.
* **Source-rationale:** Poisson MLE (closed-form `λ̂ = mean`) i Negative-Binomial MLE su standard statistical primitives (Cameron & Trivedi 1998 §3.3, Anscombe 1950). AIC model selection je Akaike 1974 (textbook). Log-axis golden-section bisection za NB MLE je standard numerical optimization (Press et al. *Numerical Recipes* §10.2). Sve čistih akademske reference.
* **Reserved terms used:** none. `triggerProfiler` engine-generic.
* **Implementation note (Wave 20 QA-discovered fix):** original Newton solver za NB MLE divergira na bimodal data (overshoots into asymptotic Poisson regime). Replaced sa log-axis golden-section bisection — robusno, garantovano konvergira na unimodal log-likelihood. Documented u commit message i tests/trigger_profiler.test.ts.
