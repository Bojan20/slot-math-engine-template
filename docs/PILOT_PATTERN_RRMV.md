# Pattern-RRMV — Production Pilot

CORTI W205-PILOTS — fourth production-grade pilot built on the
`slot-math-engine-template` stack. Vendor B M10 Bonus Bank Running Balance
Offset on a 6-reel Megaways topology (variable rows 2-7 → 117,649 ways)
with Irish leprechaun theme. Demonstrates the platform's
variable-rows topology, ways evaluation, and player-elects banking
mechanic with three RTP variants.

---

## Game description

> Catch the leprechaun and chase his pot of gold across 117,649 ways!
> Every cascade pours wins into the Bonus Bank Vault. Choose your
> strategy: Mode A "Bank Off Wins" (player ledger), Mode B "Bank All"
> (auto-skim every spin), or Mode C "Bank Big Only" (high-roller
> trigger). Three rainbow scatters open the Vault Free Spins round
> with a 1-34× sticky multiplier ladder.

Theme: **Irish leprechaun / Pot of gold / Rainbow**, palette anchored
on emerald green `#22C55E`, gold `#F59E0B`, rainbow gradient (purple
→ yellow → green), white shamrock `#D1FAE5`, brown leather `#451A03`.

## Math features

| Feature | Mechanic | Contribution |
| --- | --- | --- |
| Base game | 6 reels Megaways (variable 2-7 rows), ways evaluation, cascade drop | 50.0% RTP |
| Cascade | Drop replacement, max chain 8, progression [1, 2, 3, 5, 8, 13, 21, 34] | included above |
| Free Spins | 3+/4+/5+/6+ scatters award 12/15/20/30 spins, multiplier ladder | 32.0% RTP |
| FS retrigger | 3-6+ scatters add 4-20 spins (max 50) | included above |
| Bonus Bank (M10) | Player elects bank mode A/B/C, running balance offsets future spins | 14.0% RTP |

### Three RTP variants

| Variant | Bank Mode | Stated RTP | Use case |
| --- | --- | --- | --- |
| Mode A | Bank Off Wins   | **96.0%** | Default player ledger |
| Mode B | Bank All        | **94.5%** | UK strict (UKGC RTS-7) |
| Mode C | Bank Big Only   | **97.5%** | Exclusive high-roller |

**Variance:** ULTRA (volatility tag `ultra`)
**Max win cap:** 50,000× per spin
**Hit frequency:** 22% target
**Max ways:** 117,649 (6 reels × 7 rows max)

## Compliance check list

| Jurisdiction | Status |
| --- | --- |
| **UKGC** | OK — RTP 94.5% variant available |
| **MGA** | OK |
| **eCOGRA** | OK |
| **ADM** | OK |
| **DGA** | OK |
| **NJ / PA / MI** | OK — max win 50,000× ≤ regulator cap |

## Production stats

- **Symbols:** 14 (4 HP / 4 MP / 3 LP / Wild / Scatter / Bonus Bank)
- **Grid:** 6 reels Megaways (variable rows 2-7)
- **Max ways:** 117,649
- **Bank modes:** 3 player-elects variants
- **Audio cues:** 11 real WAV samples in `web/studio/audio/cues/rainbow-riches-megaways-vault/`
- **Asset pack:** 14 full-color SVGs + 14 stroke-only mono fallbacks
- **Animation stages:** 6 (idle, spin, win, bank-toggle, big-win, cascade)
- **Daily revenue (mock):** $44,800 across 2 jurisdictions (UKGC + MGA pending)

## Files

- IR: `web/studio/pilots/rainbow-riches-megaways-vault.ir.json`
- Symbols: `web/studio/pilots/rainbow-riches-megaways-vault/symbols/{color,mono}/*.svg`
- Audio cues: `web/studio/audio/cues/rainbow-riches-megaways-vault/*.wav`
- Animations: `web/studio/src/pilots/rainbow-riches-animations.ts`
- Cert flow: `npm run pilot:cert -- --pilot rainbow-riches-megaways-vault`
- Report: `reports/pilot/RAINBOW_RICHES_MEGAWAYS_VAULT.{json,md}`

## Running the pilot

```bash
npm run pilot:cert -- --pilot rainbow-riches-megaways-vault -- --quick
npm run pilot:cert:all
```
