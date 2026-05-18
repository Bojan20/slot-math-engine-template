# PLAYER_ELECTS_FEATURE_COMPOSITION — Player-Elects Feature Composition Aggregator Acceptance (W188, 69. solver, L&W M11 P1 GAP CLOSURE)

Generated: `2026-05-18T00:54:44.642Z`

## Headline

**6/6 configs PASS** at 20000 MC spins per strategy each = 360K total spin sims (rational + worst + uniform strategies).

Closes Faza 12 ext (post-W100): ✅ "Player-Elects Feature Composition Aggregator" (Wave 188 — 69. closed-form solver, L&W M11 P1 GAP CLOSED — Rainbow Riches Pick n Mix + Michael Jackson KOP + KISS + 5 Treasures).

## Method

m-of-N combinatorial composition selection:
  - N candidate modes sa distinct (r_i, σ²_i) per mode
  - Player elects subset S of size m
  - Contributions sum: E[Y | S] = Σ_{i ∈ S} r_i, Var = Σ σ²_i
  - **Best pick (rational)**: top m by RTP desc
  - **Worst pick**: bottom m by RTP
  - **Uniform pick**: (m/N) · Σ r_i (linearity of expectation)
  - **Skill premium**: bestPick − uniformPick
  - **RTP spread**: bestPick − worstPick (player-knowledge value)

MC: 20K spins per strategy (rational/worst/uniform), per-spin sum across elected modes sa Gaussian noise.

## Configs — Player-Elects Feature Composition operator disclosure table

| Config | Pass | N/m | best CF/MC | worst CF/MC | uniform CF/MC | skill+ |
|---|---|---|---|---|---|---|
| A_rainbow_riches_pick_n_mix_3of5 | ✅ | 5/3 | 0.950/0.962 | 0.680/0.708 | 0.810/0.776 | 0.140 |
| B_michael_jackson_kop_3fs_modes | ✅ | 3/1 | 1.050/1.107 | 0.950/0.906 | 1.000/1.001 | 0.050 |
| C_kiss_band_member_fs_variants | ✅ | 4/1 | 1.020/1.074 | 0.960/0.918 | 0.990/0.981 | 0.030 |
| D_5_treasures_5fs_modes | ✅ | 5/1 | 1.100/1.161 | 0.900/0.863 | 1.000/0.979 | 0.100 |
| E_corner_pick_all_modes | ✅ | 3/3 | 0.900/0.907 | 0.900/0.927 | 0.900/0.878 | 0.000 |
| F_corner_flat_rtp_zero_skill_premium | ✅ | 4/2 | 1.000/1.000 | 1.000/1.019 | 1.000/1.003 | 0.000 |

## Compliance context

- **UKGC RTS-12** — player choice mechanic disclosure.
- **UKGC RTS-14** — per-mode contribution transparency.
- **MGA PPD §11** — composition transparency (must disclose RTP spread + skill premium).
- **eCOGRA Generic Slots Audit** — per-mode audit trail.
- **EU GA 2024** — cross-jurisdiction baseline.

Industry use: L&W M11 gap — Rainbow Riches Pick n Mix (pick 3 of 5 bonuses), Michael Jackson King of Pop (3 FS modes Smooth Criminal/Beat It/Billie Jean), KISS (band-member FS variants), 5 Treasures (5 FS modes).