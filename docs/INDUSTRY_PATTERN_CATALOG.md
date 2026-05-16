# Industry Pattern Catalog v1.0

> **Wave 46.** Operator-facing catalog of 20 industry-style slot patterns
> the engine ships ready-to-run. Each pattern uses **mechanical
> descriptive naming** (no vendor TM, no patented brand names — see
> `docs/IP_REVIEW.md` for clean-room derivation policy).
>
> Operator workflow: math director identifies the pattern they want,
> follows the link to the reference fixture, runs `runIRSimulation` on
> it, customizes paytable/reels/features for their game.

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
