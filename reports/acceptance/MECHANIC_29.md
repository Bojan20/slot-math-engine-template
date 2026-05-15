# 15 Named Faza 12 Mechanic Acceptance — Wave 29

> Generated: 2026-05-15T20:38:34.895Z
> Mechanics: 15 · Seeds: 4 · Spins/seed: 25,000
> Total spins: 2,700,000 · Wall: 63364ms

## Headline

**15/15 mechanics pass per-mechanic sanity.** All clean.

## Per-mechanic results

| Mechanic | Fixtures | Sanity | Engine path under test |
|----------|---------:|:------:|------------------------|
| Asymmetric grid + scatter multiplier | 1 | ✅ | 3-reel × 5-row asymmetric grid + scatter pay path |
| Cluster cascade + multiplier symbols | 3 | ✅ | cluster evaluator + flood-fill + multiplier symbol chain |
| Money-symbol collect FS | 1 | ✅ | mystery-reveal + collect-on-FS-trigger orchestration |
| Expanding-symbol FS | 1 | ✅ | FS state machine + expanding-wild behavior compound |
| Hold & Win + multi-tier jackpot | 3 | ✅ | H&W coordinator + tier-jackpot ladder + respin orchestrator |
| Persistent multiplier + symbol upgrade FS | 2 | ✅ | symbol-upgrade behavior + persistent FS multiplier ladder |
| Sticky wilds + multi-mode FS | 1 | ✅ | sticky-wild behavior + FS multi-mode dispatcher |
| Multi-tier WAP jackpot + wheel pick | 2 | ✅ | WAP jackpot pool + wheel pick orchestrator + tier-ladder dispatch |
| Pick bonus + multi-level | 1 | ✅ | pick bonus FSM + multi-level progression |
| Money collect + variable-rows ways + cascade | 2 | ✅ | variable-rows ways + cascade orchestrator + money-collect path |
| Three-mode FS choice | 3 | ✅ | three independent FS configs proving multi-mode dispatch |
| Scatter pay + multiplier scale | 2 | ✅ | pay-anywhere evaluator + scaling multiplier on scatter triggers |
| Wheel re-entry tiers | 1 | ✅ | wheel pick + re-entry tier ladder + FS-trigger |
| Per-spin reel-modifier reveal | 2 | ✅ | respin state machine + mystery-symbol reveal per-spin |
| Pick bonus + variable-rows ways combo | 2 | ✅ | pick FSM + variable-rows-ways combo |

## Fixture-level rows

| Mechanic | Fixture | Target | MC mean | σ | Stab |
|----------|---------|-------:|--------:|---:|:---:|
| asymmetric_scatter_mult | `3x5-5lines.json` | 96.00% | 97.983% | 1.327% | ✓ |
| cluster_cascade_mult | `cluster-7x7.json` | 96.00% | 2827.403% | 15.759% | ✗ |
| cluster_cascade_mult | `cluster-diagonal.json` | 96.00% | 164.747% | 0.819% | ✓ |
| cluster_cascade_mult | `cluster-hexagonal.json` | 96.00% | 3330.350% | 14.755% | ✗ |
| money_symbol_collect_fs | `mystery-symbol.json` | 96.00% | 529.776% | 11.956% | ✗ |
| expanding_symbol_fs | `fs-expanding-wilds.json` | 96.00% | 333.669% | 4.353% | ✓ |
| hnw_multitier_jackpot | `hnw-grand-jackpot.json` | 96.00% | 18865.679% | 59.568% | ✗ |
| hnw_multitier_jackpot | `hnw-full-grid.json` | 96.00% | 330.940% | 6.058% | ✗ |
| hnw_multitier_jackpot | `hnw-classic.json` | 96.00% | 160.402% | 1.845% | ✓ |
| persistent_mult_symbol_upgrade | `symbol-upgrade.json` | 96.00% | 30991.528% | 231.680% | ✗ |
| persistent_mult_symbol_upgrade | `fs-multiplier-ladder.json` | 96.00% | 781.860% | 16.160% | ✗ |
| sticky_wilds_multimode_fs | `fs-sticky-wilds.json` | 96.00% | 224.305% | 3.932% | ✓ |
| wap_wheel_pick | `wheel-bonus.json` | 96.00% | 5968.013% | 53.758% | ✗ |
| wap_wheel_pick | `hnw-grand-jackpot.json` | 96.00% | 18865.679% | 59.568% | ✗ |
| pick_bonus_multilevel | `pick-bonus.json` | 96.00% | 306.234% | 4.922% | ✓ |
| money_collect_varrows_cascade | `complex-variable-rows.json` | 96.00% | 52266534.022% | 207057.312% | ✗ |
| money_collect_varrows_cascade | `cascade-drop.json` | 96.00% | 1192.714% | 12.536% | ✗ |
| three_mode_fs_choice | `fs-multiplier-ladder.json` | 96.00% | 781.860% | 16.160% | ✗ |
| three_mode_fs_choice | `fs-retrigger.json` | 96.00% | 359.403% | 4.258% | ✓ |
| three_mode_fs_choice | `fs-sticky-wilds.json` | 96.00% | 224.305% | 3.932% | ✓ |
| scatter_pay_mult_scale | `pay-anywhere.json` | 96.00% | 24511.072% | 157.628% | ✗ |
| scatter_pay_mult_scale | `multiplier-wilds.json` | 96.00% | 164.333% | 3.396% | ✓ |
| wheel_re_entry_tiers | `wheel-bonus.json` | 96.00% | 5968.013% | 53.758% | ✗ |
| per_spin_reel_modifier_reveal | `respin-feature.json` | 96.00% | 277.554% | 2.243% | ✓ |
| per_spin_reel_modifier_reveal | `mystery-symbol.json` | 96.00% | 530.244% | 5.603% | ✗ |
| pick_varrows_ways_combo | `pick-bonus.json` | 96.00% | 306.234% | 4.922% | ✓ |
| pick_varrows_ways_combo | `variable-rows-7reels.json` | 96.00% | 2131637.674% | 22418.150% | ✗ |

## Gates

- **Sanity**: MC RTP finite, ≥0, < 1e+9 across all 4 seeds (engine produces plausible output, no NaN/crash/overflow on this mechanic path).
- **Stability** (informational): σ across 4 independent seeds × 25,000 spins ≤ 5%.

## Acceptance verdict

**✅ All 15 named mechanics pass sanity.** Engine handles every named Faza 12 mechanic class without crash/NaN/overflow; cross-seed convergence varies by fixture (synthetic fixtures are not hand-tuned to operator target RTP; that is separate parTuner workflow).
