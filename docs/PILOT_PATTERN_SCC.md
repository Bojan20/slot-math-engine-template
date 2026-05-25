# Pattern-SCC — Production Pilot

CORTI W205-PILOTS — third production-grade pilot built on the
`slot-math-engine-template` stack. Vendor B M7 Colossal Reels Wild Transfer
on a Roman gladiator / Coliseum theme. Demonstrates the platform's
dual-grid composition and wild mirroring capabilities.

---

## Game description

> Enter the Coliseum and command both legions. The main 5×4 grid plays
> in real time and every Lion Wild that lands mirrors itself onto the
> corresponding column of the Colossal 5×12 grid above. When two or
> more wilds transfer simultaneously the colossal ways evaluation
> ignites — up to 12,000× per spin. Three Coliseum Scatters trigger
> Caesar's Free Spins with a ×3 global multiplier and expanding wilds.

Theme: **Roman gladiator / Amphitheater / Coliseum**, palette anchored
on imperial purple `#7C1D6F`, gold `#F59E0B`, bronze `#92400E`, marble
white `#FEFCE8`, crimson `#7F1D1D`.

## Math features

| Feature | Mechanic | Contribution |
| --- | --- | --- |
| Base game | Dual grid — main 5×4 + colossal 5×12, ways evaluation, LTR | 55.0% RTP |
| Wild Transfer (M7) | Wilds on main 5×4 mirror to colossal 5×12; activates when WL+CL ≥ 2 | massive ways multiplier |
| Free Spins | 3+ scatters award 10/15/25 spins, ×3 global multiplier | 30.0% RTP |
| FS retrigger | 3+ scatters in FS adds 5/10/15 spins (max 60) | included above |
| Expanding Wilds + Multiplier Ladder | FS modifiers | 11.0% RTP |

**Variance:** HIGH (volatility tag `high`)
**Max win cap:** 12,000× per spin
**Hit frequency:** 24% target
**Max ways:** 1,024 main grid (5 reels × 4 rows)

## Compliance check list

| Jurisdiction | Status |
| --- | --- |
| **UKGC** | OK |
| **MGA** | OK |
| **eCOGRA** | OK |
| **ADM** | OK |
| **DGA** | OK |
| **NJ** | OK (max win cap 15,000× within limit) |
| **PA** | OK |
| **GLI-16** | 12 PAR Sheet sections present |

## Production stats

- **Symbols:** 15 (4 HP / 4 MP / 3 LP / Wild / Scatter / Bonus / Multiplier)
- **Grid main:** 5×4
- **Grid colossal:** 5×12
- **Wild transfer threshold:** 2+ wilds
- **Audio cues:** 11 real WAV samples in `web/studio/audio/cues/spartacus-colossal-conquest/`
- **Asset pack:** 15 full-color SVGs + 15 stroke-only mono fallbacks
- **Animation stages:** 7 (idle, spin, win, fs-intro, wild-transfer, jackpot, cascade)
- **Daily revenue (mock):** $38,200 across 7 jurisdictions

## Files

- IR: `web/studio/pilots/spartacus-colossal-conquest.ir.json`
- Symbols: `web/studio/pilots/spartacus-colossal-conquest/symbols/{color,mono}/*.svg`
- Audio cues: `web/studio/audio/cues/spartacus-colossal-conquest/*.wav`
- Animations: `web/studio/src/pilots/spartacus-animations.ts`
- Cert flow: `npm run pilot:cert -- --pilot spartacus-colossal-conquest`
- Report: `reports/pilot/SPARTACUS_COLOSSAL_CONQUEST.{json,md}`

## Running the pilot

```bash
npm run pilot:cert -- --pilot spartacus-colossal-conquest -- --quick
npm run pilot:cert:all
```
