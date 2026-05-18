# RANDOM_FEATURE_INJECTION_DURING_FS — Random Feature-Injection During FS Aggregator Acceptance (W189, 70. solver, L&W M12 P1 GAP CLOSURE)

Generated: `2026-05-18T01:04:36.307Z`

**6/6 configs PASS** @ 30000 MC FS-bonus runs each.

Closes L&W M12 GAP — Wizard of Oz Munchkinland + WMS sub-feature library.

## Method

Compound per-FS-spin Bernoulli injection: per spin k, base Y_k + I_k·V_k where I_k~Bernoulli(p_inject), V_k iid.
  - **E[S] = N·μ_Y + N·p·μ_V**
  - **Var[S] = N·σ²_Y + N·p·σ²_V + N·p(1-p)·μ²_V**
  - **P(at least one inject) = 1 − (1−p)^N**

## Configs
| Config | Pass | N | p | E[S] CF/MC | E[inj] CF/MC | P(≥1) |
|---|---|---|---|---|---|---|
| A_wizard_of_oz_munchkinland_classic | ✅ | 15 | 0.18 | 50.40/50.49 | 2.70/2.70 | 94.9%/95.2% |
| B_wms_sub_feature_lib_high_inject | ✅ | 10 | 0.3 | 28.00/28.04 | 3.00/3.01 | 97.2%/97.3% |
| C_long_fs_rare_injection | ✅ | 30 | 0.05 | 54.00/53.89 | 1.50/1.50 | 78.5%/78.5% |
| D_short_fs_high_inject_payout | ✅ | 5 | 0.25 | 28.75/28.84 | 1.25/1.26 | 76.3%/76.6% |
| E_corner_zero_base_full_injection_driven | ✅ | 12 | 0.2 | 24.00/24.01 | 2.40/2.40 | 93.1%/93.1% |
| F_corner_N1_single_fs_spin | ✅ | 1 | 0.2 | 9.00/9.00 | 0.20/0.20 | 20.0%/20.0% |

## Compliance: UKGC RTS-14 FS sub-feature disclosure / MGA PPD §11 / eCOGRA / EU GA 2024.

Industry: Wizard of Oz Munchkinland (2014) + WMS sub-feature library variants.