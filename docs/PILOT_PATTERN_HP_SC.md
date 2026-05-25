# Huff N' Puff Pattern-SC — Production Pilot

CORTI W205-PILOTS — second production-grade pilot built on the
`slot-math-engine-template` stack. Vendor B M2 Multi-State Frame Upgrade
Markov anchored to a tornado / barn / farm theme. Demonstrates the
platform's ability to ship aggregate-Markov mechanics without bespoke
solver code.

---

## Game description

> The storm is rolling in. Three Wolves on screen and the Storm Frame
> upgrades to the next state — each upgrade boosts win multipliers
> through 8 escalating tiers. Survive a Wolf-less spin and the frame
> resets to Tier 1. Hit the Storm Scatter three times to enter the
> tornado-powered Free Spins round with a sticky multiplier ladder and
> a 2× global boost.

Theme: **Tornado / Barn / Farm Storm**, palette anchored on silver/gray
`#9CA3AF` lightning, yellow `#FACC15` glow, brown `#92400E` barn,
green `#84CC16` field.

## Math features

| Feature | Mechanic | Contribution |
| --- | --- | --- |
| Base game | 5×3 grid, 25 paylines, LTR | 60.0% RTP |
| Frame Upgrade Markov (M2) | 8-state escalator; 3+ Wolves upgrades state, no-Wolf spin resets to 1 | Multiplier ladder per state [1, 2, 3, 5, 8, 13, 21, 50] |
| Free Spins | 3+ scatters award 8/12/20 spins, ×2 global multiplier | 27.0% RTP |
| FS retrigger | 3+ scatters in FS adds 5/8/12 spins (max 40) | included above |
| Symbol Upgrade | Rare HP1 (Wolf) → Wild Tornado promotion (p=0.05) | 9.5% RTP (jackpot allocation) |

**Variance:** MID-HIGH (volatility tag `high`)
**Max win cap:** 8,000× per spin
**Hit frequency:** 30% target

## Compliance check list

| Jurisdiction | Status |
| --- | --- |
| **UKGC** | OK — RTS-7A/12/14D respected |
| **MGA** | OK — PPD §11 RTP disclosure |
| **eCOGRA** | OK — session time display |
| **ADM (Italy)** | OK — RTP within [88%, 99%] |
| **DGA (Denmark)** | OK — LDW disclosure |
| **GLI-16** | 12 PAR Sheet sections present |
| All | Max win cap ≤ 10,000× → 8,000× ✓ |

## Production stats

- **Symbols:** 14 (4 HP / 4 MP / 3 LP / Wild / Scatter / Multiplier)
- **Grid:** 5×3
- **Paylines:** 25
- **Frame states:** 8 Markov tiers, multipliers [1, 2, 3, 5, 8, 13, 21, 50]
- **Audio cues:** 11 real WAV samples in `web/studio/audio/cues/huff-n-puff-storm-cellar/`
- **Asset pack:** 14 full-color SVGs + 14 stroke-only mono fallbacks
- **Animation stages:** 6 (idle, spin, win, frame-upgrade, jackpot, cascade)
- **Daily revenue (mock):** $18,900 across 4 jurisdictions

## Files

- IR: `web/studio/pilots/huff-n-puff-storm-cellar.ir.json`
- Symbols: `web/studio/pilots/huff-n-puff-storm-cellar/symbols/{color,mono}/*.svg`
- Audio cues: `web/studio/audio/cues/huff-n-puff-storm-cellar/*.wav`
- Animations: `web/studio/src/pilots/huff-n-puff-animations.ts`
- Cert flow: `npm run pilot:cert -- --pilot huff-n-puff-storm-cellar`
- Report: `reports/pilot/HUFF_N_PUFF_STORM_CELLAR.{json,md}`

## Running the pilot

```bash
# Full quick mode (10K + 100K spins, < 10s)
npm run pilot:cert -- --pilot huff-n-puff-storm-cellar -- --quick

# All 4 pilots sequential
npm run pilot:cert:all
```
