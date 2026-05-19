# PRE_COMMITMENT_LOSS_LIMIT — Pre-Commitment Loss-Limit Effectiveness Analyzer Acceptance

Generated: `2026-05-19T10:29:17.053Z`

## Headline

**6/6 configs PASS** at 20000 MC sessions each = 120K Normal random draws.

Closes W226 — **83. closed-form solver, first BEHAVIORAL-COMMITMENT kernel** u portfolio (AU NCPF §5.2 + UKGC LCCP 3.4.5 + EU EBA Annex VI + NL KSA §11 + DE GlüStV §6c).

## Method

Player session-loss X ~ Normal(μ, σ²) (Auer-Griffiths 2017, Wood-Williams 2011).

Pre-commitment: player sets daily loss limit L_d. Hard-clip at L_d.

Truncated-Normal expectation (Greene 2012 §22.4):
  - **E[min(X, L)] = μ·Φ(z) − σ·φ(z) + L·(1 − Φ(z))**, z = (L − μ)/σ

Adherence behavior (Wood-Griffiths 2018, Auer-Hopfgartner 2022):
  - α ∈ [0.4, 0.85] = fraction of sessions respecting original L_d
  - γ ≥ 1 = limit-escalation factor when player overrides (typical 1.5)

Effective loss:
  - **E[loss_effective] = α · E[min(X, L)] + (1 − α) · E[min(X, γ·L)]**

Harm reduction:
  - **harmReductionFromLimit = (μ − E[loss_effective]) / μ**  ∈ [0, 1]

AU NCPF §5.2 compliance: defaultDailyLimit ≤ A$50 ∧ α ≥ 0.5 ∧ cooling ≥ 24h.

MC: 20K Normal session-loss draws + Bernoulli(α) adherence flag + clip → effective loss average.

## Results

| config | jurisd. | μ | σ | L | α | γ | CF effLoss | MC effLoss | rel | P_hit | harmRed | annual_save | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A_au_ncpf_default_AUD50 | AU_NCPF | 30 | 25 | 50 | 0.75 | 1.5 | 27.7 | 27.9 | 0.010 | 0.21 | 0.08 | 703 | ✅ | ✅ |
| B_uk_lccp_tight_£25_limit | UKGC | 30 | 25 | 25 | 0.85 | 1.3 | 17.9 | 18.1 | 0.009 | 0.58 | 0.40 | 4412 | ✅ | ✅ |
| C_eu_eba_relaxed_high_roller | EU_EBA | 100 | 80 | 200 | 0.60 | 2 | 97.6 | 98.4 | 0.009 | 0.11 | 0.02 | 486 | ✅ | ✅ |
| D_nl_ksa_mandatory_predeposit_€50 | NL_KSA | 35 | 30 | 50 | 0.70 | 1.5 | 30.5 | 30.8 | 0.010 | 0.31 | 0.13 | 1134 | ✅ | ✅ |
| E_corner_low_adherence_player | UKGC | 50 | 40 | 50 | 0.40 | 2 | 42.4 | 42.9 | 0.011 | 0.50 | 0.15 | 2773 | ❌ | ✅ |
| F_corner_perfect_adherence | UKGC | 50 | 40 | 25 | 1.00 | 1.5 | 18.5 | 18.7 | 0.007 | 0.73 | 0.63 | 11489 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| E[loss_effective] rel | ≤ 0.04 |
| P(hit limit) abs | ≤ 0.02 |
| harmReduction abs | ≤ 0.03 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form player-set pre-commitment loss-limit kernel ready for AU NCPF §5.2 + UKGC LCCP 3.4.5 + EU EBA Annex VI + NL KSA §11 + DE GlüStV §6c audit submission. **83. solver — first BEHAVIORAL-COMMITMENT kernel** u portfolio. Distinct od W148/W154/W157-W167 (within-session no limit-setting) / W220 (SYSTEM-enforced session boundary, not player-set) / W222 (per-spin time) / W223-W225 (multi-day/month/lifetime). Ovo modeluje voluntary player-set daily limit sa empirically observed adherence/escalation behavior.