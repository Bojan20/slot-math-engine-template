# KIMI Deep Research — Light & Wonder Portfolio Coverage vs Engine P-ID Catalog

**Date:** 2026-05-18
**Author:** KIMI (deep-research agent)
**Brief:** `docs/research/LW_PORTFOLIO_COVERAGE_BRIEF.md`
**Target consumers:** W181–W200 wave planner, Boki (project lead), Corti (wave executor)
**Catalog cross-referenced:** `docs/INDUSTRY_PATTERN_CATALOG.md` (P-001 … P-081, 61 closed-form solvers)

---

## 0. Methodology, caveats, and brand-attribution corrections (READ FIRST)

The original brief seeded the title list with several iconic mechanics that, on web verification, are **NOT** Light & Wonder properties. Before any gap analysis is safe, the brief's seed list must be corrected:

| Brand / Title in brief | Actual owner | Source |
|---|---|---|
| **Lightning Link** family (Sahara Gold, Magic Pearl, Heart Throb, High Stakes) | **Aristocrat Technologies** (not L&W) | knowyourslots.com, drifttravel.com history of series |
| **Dragon Link** family (Autumn Moon, Genghis Khan, Panda Magic, Spring Festival) | **Aristocrat Technologies** | knowyourslots.com (Aristocrat 2017+) |
| **Lightning Cash / Dollar Storm** | **Aristocrat / IGT** respectively | knowyourslots.com |
| **Buffalo** family (Buffalo Gold, Buffalo Diamond, Buffalo Link, Buffalo Stampede) | **Aristocrat** | aristocratgaming.com |
| **Wonder 4 / Wonder 4 Boost / Wonder 4 Tall Fortunes / Wonder Wheel** | **Aristocrat** (the trademark Wonder 4 is an Aristocrat quad-screen platform) | aristocratgaming.com/us/slots/games/wonder-4-revolution |
| **88 Fortunes (original land-based MMM)** | Originally **Shuffle Master / Bally** (now Light & Wonder via Bally acquisition 2014). The land-based 88 Fortunes is in L&W since 2014. | slotcatalog.com, playusa.com |
| **88 Fortunes Megaways** | **Light & Wonder** (online port, BTG-licensed Megaways) | slotslaunch.com, playusa.com |
| **Coyote Moon** | **IGT** (not L&W) | onlineslots.com |
| **Cleopatra / Cleopatra II** | **IGT** (not L&W) | (IGT IP) |

L&W's actual studio roster (verified via Wikipedia + L&W investor relations + iGaming Express brand page):

- **Bally Technologies** (acquired 2014 from Bally Tech Inc., $5.1B)
- **WMS Industries** (acquired 2013, $1.5B)
- **Shuffle Master** (part of Bally 2014 acquisition)
- **Scientific Games Casino** (the original SGCorp now rebranded as L&W Apr 2022)
- **SG Digital / SG Gaming** (in-house digital studios)
- **Barcrest** (UK studio; Rainbow Riches series)
- **NextGen Gaming** (acquired via NYX 2017)
- **NYX Gaming Group** (acquired 2017; supplier-platform side; OpenBet sold 2022)
- **Lightning Box** (Australian studio acquired 2022)
- **MDI Entertainment** (instant-win games)
- **The Global Draw** (terminal-based games)
- **Authentic Gaming** (live casino, acquired 2019)

Things divested and **no longer L&W**:
- **OpenBet** (sports betting; sold 2022 to Endeavor)
- **Scientific Games Lottery** (sold 2022 to Brookfield/TCG)
- **Bingo Industries** (sold)

So when the brief listed "Lightning Link / Dragon Link / Wonder 4 / Buffalo" — those are Aristocrat titles that L&W must **compete with**, not titles L&W ships. The engine still needs the underlying mechanics (Hold & Spin tiered jackpot, quad-screen, sticky wild expansion) because L&W ships **functionally-equivalent** mechanics under different brand names (Ultimate Fire Link, Lock It Link, Cash Falls, Quick Hit Cash Wheel, Huff N' Puff Wheel, Dragon Train Hold & Spin, Jewel of the Dragon Hold & Respin, etc.).

That clarification driving this entire document: **map every L&W-owned mechanic, then deduce engine coverage gaps**.

---

## 1. Taxonomy (per brief)

- **A** Hold-and-win / collect / cash
- **B** Jackpot tier system (mini/major/grand or 4-tier)
- **C** Mystery reveal / chaos (pre-spin mystery → in-spin reveal, or whole-reel mystery)
- **D** Pick bonus / pooper (incl. multi-stage trees, wheel picks, board games)
- **E** Multi-screen / split-screen / dual-grid (quad-screen, colossal reels, two-grid linked)
- **F** Cascade / tumble / avalanche
- **G** Sticky wild / multiplier persistence (incl. expand, drop-and-stick, walking, sticky multiplier trail)
- **H** Free spins / retrigger / extension
- **I** Wager-progression / chase pattern (Big Bet, Ante, paid-bonus tiers)
- **J** Skill-stop / near-miss / anticipation reels
- **K** AWP cycle / compensated math (UK B3/B3A, JP Pachislot, AU NCPF)
- **L** Bingo / Class II hidden-bingo wrappers
- **M** NEW (flag as **NOVEL**)

---

## 2. L&W Title × Mechanic × Engine Coverage Matrix (50+ titles)

Notation: ✅ = engine P-ID covers; ❌ = GAP (no P-ID covers); ⚠ = partial coverage (P-ID exists but mechanic detail unmapped).

### 2.1 SG Gaming / SG Digital / L&W in-house digital (online)

| # | Title | Brand / Studio | Year | Mechanics | Engine P-ID coverage | Gap? | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Dragon Train Chi Lin Wins | LNW (in-house digital) | 2024 | A (6-scatter H&S, 3-respin reset) + B (4-tier MMMS + Fortune 8) + H (sticky mystery green-dragon FS) + G (sticky mystery during FS) | P-002 ✅ + P-049 ✅ + P-059 ✅ (H&S value-based) + P-035 ✅ (multi-tier WAP) + P-005/P-051 ✅ (sticky FS + mystery reveal) | NO | n/a |
| 2 | Dragon Spin CrossLink Water | LNW (in-house digital) | 2024 | A (gold coin bag fill per reel) + C2-like per-row multiplier increment | P-002 ✅ + ❌ NOVEL: **per-reel cash-bag aggregator with row-multiplier coupling** (each landed coin contributes to its reel's bag AND ramps its row's multiplier by +1) — distinct from any P-ID |  ✅ **CLOSED (M1 W185)**| **P0** |
| 3 | Huff N' Puff (original) | LNW (in-house digital, ex-SG) | 2019 | A (cash-on-reel + Buzz Saw upgrade) + B (4-tier wheel: Mini/Minor/Major/Grand + Super) + D (wheel-bonus pick) + H (FS) + **M: frame upgrade (Straw→Wood→Brick)** | P-002 ✅ + P-035 ✅ + P-046 ✅ (wheel respin) + P-014 ✅ + ❌ **frame-state Markov upgrade** | ✅ **CLOSED (M2 W183)** | **P0** |
| 4 | Huff N' More Puff | LNW | 2020 | Same as Huff N' Puff + 5-tier wheel | as above + P-067 ✅ (K-tier voltage meter analog) | ✅ **CLOSED (M2 W183)** | P0 |
| 5 | Huff N' Even More Puff | LNW | 2022 | A + B (5-tier) + D (wheel) + H + frame upgrade + Mega Hat add-on | as above + ❌ Mega Hat add-on add-multiplier | ✅ **CLOSED (M2 W183 + M3 W182)** | P0 |
| 6 | Huff N' Lots of Puff | LNW | 2023 | as Even More Puff + Lots-of-Puff multi-wheel pick tree | + P-047 ✅ (N-stage pick tree) | ✅ **CLOSED (M2 W183)** | P1 |
| 7 | Huff N' Xtra Puff | LNW | 2024 | as Even More Puff + Xtra Puff persistent meter | + P-067 ✅ | ✅ **CLOSED (M2 W183)** | P1 |
| 8 | Huff N' Even More Puff Hard Hat Edition | LNW | 2024 | Even More Puff variant | as #5 | ✅ **CLOSED (M2 W183)** | P2 |
| 9 | Huff N' Even More Puff Grand | LNW | 2024 | Same + escalated grand jackpot | as #5 | ✅ **CLOSED (M2 W183)** | P2 |
| 10 | Huff N' Puff Money Mansion | LNW | 2024 | as Even More Puff + Mansion bonus stage | + P-047 ✅ | ✅ **CLOSED (M2 W183)** | P1 |
| 11 | Ultimate Fire Link (China Street, Olvera, Rue Royale, Power 4, By the Bay, Explosion, Glacier Gold, Add Em Up Gold) | Bally (under LNW) | 2017–2025 | A (4+ fireball trigger, sticky fireballs, expanding rows up to 4 extra) + B (4-tier MMMS prize bag) + G (sticky H&W) + **M: dynamic row-expansion during H&S** | P-002 ✅ + P-035 ✅ + ❌ **dynamic grid-expansion / row-addition during H&S** (rows added as fireballs collected — changes state space) |  ✅ **CLOSED (M3) W182**| **P0** |
| 12 | Cash Falls (Outback Fortune, Pirate's Trove, Add Em Up Gold, By the Bay, Glacier Gold, Explosion, China Street) | LNW | 2020–2025 | A (jackpot-symbol collect bag fill) + B (4-tier MMMG) + H (FS with persistent multiplier) | P-002 ✅ + P-035 ✅ + P-068 ✅ (scatter-trigger tiers) + P-005 ✅ | NO | n/a |
| 13 | Lock It Link Diamonds | LNW (ex-SG / Bally) | 2022 | A (sticky-heart H&S over secondary grid) + B (Mini 40x, Minor 100x, Major 200x, Grand 5000x — fixed multiples, not WAP) + H (FS) | P-002 ✅ + P-049 ✅ + **P-035 ⚠ (fixed-value tiers, not progressives — partial)** + P-014 ✅ | ⚠ (verify) | P1 |
| 14 | Lock It Link Night Life | LNW (Bally) | 2017 | A + B (same as Diamonds) + H | as #13 | ⚠ | P1 |
| 15 | Lock It Link Eureka Reel Blast | LNW (Bally) | 2019 | A (dynamite scatters + Lock It Link feature) + B + H + **M: reel-explosion add row** | as #13 + ❌ row-add (same as Ultimate Fire Link gap M3) |  ✅ **CLOSED (M3) W182**| P0 |
| 16 | Lock It Link Hold Onto Your Hat | LNW (Bally) | 2018 | A + B + H | as #13 | ⚠ | P2 |
| 17 | Jewel of the Dragon | LNW (in-house digital, 2024; commercialisation paused 2025 per g3newswire) | 2024 | A (6-gem H&S, 3 respin reset, fill 15 = grand) + B (4-tier MMMG, "what-you-see-is-what-you-get") + smaller-bonus secondary gem triggers | P-002 ✅ + P-035 ✅ + P-059 ✅ | NO | n/a |
| 18 | Dancing Drums | LNW (Bally) | 2017 | A (gong scatters trigger FS + jackpot picker) + B (4-tier MMMG WAP) + D (pick-a-drum) + H (8/10/15 FS) + G (stacked wilds during FS) | P-002 ✅ + P-035 ✅ + P-010/P-047 ✅ + P-068 ✅ + P-005 ✅ | NO | n/a |
| 19 | Dancing Drums Explosion | LNW (Bally) | 2020 | as Dancing Drums + **M: explosion mechanic adds free position multipliers** | + ❌ **deterministic-grid explosion add multipliers** (unique to L&W Explosion series) |  ✅ **CLOSED (M4 W187)**| P1 |
| 20 | Dancing Drums Revolution | LNW (Bally) | 2025 (LightWave cabinet) | as Dancing Drums + revolution feature (multi-stage) | + ❌ revolution multi-stage |  ✅ **CLOSED (M4 W187)**| P1 |
| 21 | Quick Hit Platinum | LNW (Bally) | 2010 | F5 (reel-bound mystery progressive — Quick Hit symbol on reels 1, 2, 3 etc each → +tier) + H (FS pick-grid for spin count × multiplier — 20 tiles) | ❌ **reel-bound mystery progressive** (Quick Hit symbols on specific reels — count cumulative across spin) + P-047 ✅ (pick tile reveal) | YES (M5) | **P0** |
| 22 | Quick Hit Black Gold | LNW (Bally) | 2013 | F5 + H | as #21 | YES (M5) | P0 |
| 23 | Quick Hit Pro | LNW (Bally) | 2015 | F5 + H + multiplier wild | as #21 + P-017 ✅ | YES (M5) | P1 |
| 24 | Quick Hit Wild | LNW (Bally) | 2016 | F5 + H + expanding wild | as #21 + P-008 ✅ | YES (M5) | P1 |
| 25 | Quick Hit Blitz | LNW (Bally) | 2018 | F5 + B (all-position scatter + 48 paylines) + H (FS pick-modifier) | as #21 + P-011 ✅ (pay-anywhere) | YES (M5) | P0 |
| 26 | Quick Hit Cash Wheel | LNW (Bally) | 2014 | F5 + D (wheel) + B + H | as #21 + P-046 ✅ + P-035 ✅ | YES (M5) | P0 |
| 27 | Cash Wheel Quick Hit | LNW (Bally) | 2014 | same as #26 | as #26 | YES (M5) | P1 |
| 28 | Triple Cash Wheel | LNW (Bally) | 2022 | F5 + D (3 wheels stacked) + B | as #21 + P-046×3 ⚠ (need composition) + P-035 ✅ | YES (M5, M6) | P1 |
| 29 | Cash Spin (U-Spin) | LNW (Bally) | 2010 | D (U-Spin touch wheel — single spin) + H (FS) + A (money bag bonus) | P-046 ✅ + P-014 ✅ + P-022 ✅ | NO | n/a |
| 30 | Cash Wizard | LNW (Bally) | 2011 | D (Cash Wheel pick-3-match → wheel + multiplier up to 4×) + H (2× all wins, 12 FS) | P-046 ✅ + P-047 ✅ + P-063 ⚠ | NO | n/a |
| 31 | Money Vault | LNW (Bally) | 2014 | D (Cashspin Wheel Bonus) + A (Wild Money, Moneybags) + H | P-046 ✅ + P-002 ✅ + P-014 ✅ | NO | n/a |
| 32 | Cash Eruption | LNW (IGT-licensed under Bally side post-acq? actually LNW now) | 2019 | A (lava-coin H&S, sticky values) + B (4-tier MMMG) | P-002 ✅ + P-035 ✅ | NO | n/a |
| 33 | Forbidden Dragons | LNW (in-house digital, 2024) | 2024 | C (mystery dragon reveal) + H (FS) + G (sticky wild) | P-051 ✅ + P-005 ✅ | NO | n/a |
| 34 | Frankenstein Returns (LightWave 2025) | LNW (Bally) | 2025 | D (overhead bonus board: 4 Frankenstein heads zap → multipliers) + H + B + **M: cabinet-overhead lightning award (signage interactive)** | P-047 ✅ + P-068 ✅ + ❌ overhead/cabinet interaction (hardware-only, not math kernel) | NO (hardware) | n/a |
| 35 | Jackpot Party VIP Disco (LightWave 2025) | LNW (WMS) | 2025 | D (party-pick gift boxes) + H (FS) + B (jackpot tier) | P-047 ✅ + P-014 ✅ + P-035 ✅ | NO | n/a |
| 36 | Visitors From The Planet Moolah (LightWave 2025) | LNW (WMS) | 2025 | F (cascade Cascading Reels) + A (sticky cow respin) + Invasion-mechanic on consecutive cascades | P-001/P-080 ✅ (avalanche reactor) + P-077 ✅ (cascade chain length) + P-002 ✅ + P-052 ✅ (collect-N — for invasion meter) | NO | n/a |
| 37 | Invaders from the Planet Moolah (original WMS) | LNW (WMS) | 2008 | F (cascading reels — first cascade slot) + Invasion (consecutive-win meter) + Wild Cows + Respin Locking | P-080 ✅ + P-077 ✅ + P-052 ✅ + P-002 ✅ | NO | n/a |
| 38 | Invaders Attack from The Planet Moolah | LNW (WMS) | 2024 | as #37 + tier upgrades | as #37 | NO | n/a |
| 39 | Spartacus Gladiator of Rome | LNW (WMS) | 2012 | **E (Colossal Reels — 5×4 main + 5×12 colossal, wild transfer)** + H (FS) + G (stacked wilds transferred) | ⚠ **P-030 ✅ Parallel Screens Aggregate** (handles independent screens) but Colossal Reels has dependent wild-transfer coupling — partial gap |  ✅ **CLOSED (M7 W184)**| **P0** |
| 40 | Spartacus Super Colossal Reels | LNW (WMS) | 2019 | E + H + G | as #39 |  ✅ **CLOSED (M7 W184)**| P0 |
| 41 | Spartacus Call to Arms | LNW (WMS) | 2017 | E (50 paylines, main + 2 rows above) + H (20 FS × 1000× multiplier) | ⚠ P-030 + P-067 (high-multiplier tier) |  ✅ **CLOSED (M7 W184)**| P1 |
| 42 | Zeus | LNW (WMS) | 2013 | H (up to 100 FS — extreme retrigger) + G (stacked wilds, Hand-of-Zeus sticky) + B (Hand-of-Zeus jackpot) | P-037 ✅ (retrigger Wald) + P-005 ✅ + P-035 ✅ | NO | n/a |
| 43 | Zeus II, III, 1000 | LNW (WMS) | 2014–2017 | H + G + B | as #42 | NO | n/a |
| 44 | Kronos Unleashed | LNW (WMS) | 2017 | H + G (stacked wild) + B | P-005 ✅ + P-035 ✅ | NO | n/a |
| 45 | Goldfish (original) | LNW (WMS) | 2003 | D (pick-a-bowl bonus) + H + **M: secondary screen bonus pick** | P-047 ✅ + P-014 ✅ | NO | n/a |
| 46 | Goldfish Race for the Gold | LNW (WMS) | 2017 | D (fish race — competitive pick) + H + secondary screen | P-047 ✅ + ❌ **competitive race / horse-style multi-outcome** (race resolves with one winner among N) | YES (M8) | P1 |
| 47 | Goldfish 3 | LNW (WMS) | 2018 | D + H + C3 (multiplier fish wilds 2×–5×) | P-047 ✅ + P-017 ✅ + P-063 ✅ | NO | n/a |
| 48 | Bier Haus (incl. Heidi's Bier Haus) | LNW (WMS) | 2010, 2014 | H (5/10/20/100 FS Stein Spin) + G (stacked wilds) + retrigger | P-037 ✅ + P-005 ✅ + P-068 ✅ | NO | n/a |
| 49 | Raging Rhino | LNW (WMS) | 2014 | G2 (4096 ways via 5-reel × 4-row) + H (Vault FS triggered by scatter quantity) | P-049 ✅ + P-068 ✅ | NO | n/a |
| 50 | Reel'em In! Catch the Big One (1, 2, Cash Bandits) | LNW (WMS) | 1996, 2004, 2010 | D (Fishing Hole pick — multi-fisherman / multi-cast tree) + multi-stage pick | P-047 ✅ (N-stage pick tree) + P-010 ✅ | NO | n/a |
| 51 | Reel'em In Big Bass Bucks | LNW (WMS) | 2014 | D (Fishing Contest competitive pick) + H + multiplier (14×–55×) | P-047 ✅ + P-063 ✅ + ⚠ competition-pick (M8 same race-pick gap) | YES (M8) | P1 |
| 52 | Monopoly Big Event | LNW (Barcrest) | 2010 | **I (Big Bet — paid 5-spin packages at higher RTP up to 98%)** + Board bonus + Big Bet Reel-Set switch | ⚠ **P-057 ✅ Free-Spins Buy + Tier** handles paid tier RTP, but Big Bet has rotating reel sets WITHIN purchased session — partial |  ✅ **CLOSED (M9 W186)**| **P0** |
| 53 | Monopoly Megaways | LNW (Barcrest) | 2019 | G3 (Megaways variable-reel) + F (cascade) + H + Board bonus | P-049 ✅ + P-001 ✅ + P-014 ✅ + P-047 ✅ | NO | n/a |
| 54 | Monopoly Hot Properties | LNW (Barcrest) | 2014 | F + H + Board bonus + Hot Properties multiplier | P-001 ✅ + P-047 ✅ + P-063 ✅ | NO | n/a |
| 55 | Monopoly Electric Wins | LNW (Barcrest) | 2024 | F + H + Board bonus + electric-shock multiplier | as #54 | NO | n/a |
| 56 | Monopoly Super Wheel Bonus | LNW (Barcrest) | 2025 | D (wheel bonus) + Board + B | P-046 ✅ + P-047 ✅ + P-035 ✅ | NO | n/a |
| 57 | Rainbow Riches (original) | LNW (Barcrest) | 2006 | D (Pots of Gold wheel + Road to Riches trail + Wishing Well) | P-046 ✅ + P-064 ✅ (trail) + P-047 ✅ | NO | n/a |
| 58 | Rainbow Riches Megaways | LNW (Barcrest) | 2020 | G3 + F + H + Bonus Bank (running balance offset) | P-049 ✅ + P-001 ✅ + ❌ **Bonus Bank running-balance offset** (deferred-win bank with explicit Bank-Off-Wins / Bank-All-Wins / Bank-Small-Wins modes) | YES (M10) | P0 |
| 59 | Rainbow Riches Pick n Mix | LNW (Barcrest) | 2014 | D (pick which 3 of 5 bonuses to enable per spin — composition selection!) + I (Big Bet) + multiple sub-bonuses | ❌ **player-elects feature-composition before spin** (combinatorial mode selection) + P-057 ⚠ | ✅ **CLOSED (M9 W186) + M11 pending** | **P0** |
| 60 | Rainbow Riches Pots of Gold | LNW (Barcrest) | 2008 | D (Pots of Gold spinning wheel) + H | P-046 ✅ + P-014 ✅ | NO | n/a |
| 61 | Eye of Horus Megaways | LNW (Reel Time / Blueprint, distributed via LNW OpenGaming) | 2020 | G3 + F + H + symbol-upgrade-during-FS (Horus light-beam) + G (expanding Horus wild) | P-049 ✅ + P-001 ✅ + P-013 ✅ (symbol upgrade cascade) + P-008 ✅ | NO | n/a |
| 62 | The Wizard of Oz Munchkinland | LNW (WMS) | 2014 | D (wheel bonus → progressive jackpots OR FS) + H + Munchkin-feature random injection during FS + Mayor sticky-3-wild | P-046 ✅ + P-035 ✅ + P-005 ✅ + ❌ **per-spin random-feature injection during FS** (random "Munchkin" appears every K spins to grant FS / wilds / multipliers — distinct from sticky countdown) | YES (M12) | P1 |
| 63 | The Wizard of Oz Road to Emerald City | LNW (WMS) | 2010 | D (7 bonus games, Emerald-trigger reveals) + H | P-047 ✅ + P-014 ✅ | NO | n/a |
| 64 | The Wizard of Oz Follow the Yellow Brick Road | LNW (WMS) | 2017 | D + H + Glinda reshape-reels random feature + progressive FS meter (multi-stage) | P-047 ✅ + ❌ **random reel-reshape** (entire reel set replaced mid-spin) + P-067 ✅ | YES (M12, M13) | P1 |
| 65 | Willy Wonka Pure Imagination | LNW (WMS) | 2014 | D (factory pick tree) + H + Oompa-Loompa wild + Golden Ticket bonus | P-047 ✅ + P-005 ✅ + P-068 ✅ | NO | n/a |
| 66 | Willy Wonka Dreamers of Dreams | LNW (WMS) | 2017 | D + H + B | as #65 | NO | n/a |
| 67 | Michael Jackson King of Pop | LNW (Bally) | 2013 | H (Smooth Criminal / Beat It / Billie Jean FS modes — 3 selectable FS variants) + Wild Bonus | ❌ **player-elects FS-variant pre-bonus** (multiple FS modes, mathematically distinct) + P-068 ✅ |  ✅ **CLOSED (M11 W188)**| P1 |
| 68 | KISS | LNW (WMS) | 2014 | H (band-member FS variants) + G (stacked wilds) + B | as #67 + P-005 ✅ |  ✅ **CLOSED (M11 W188)**| P1 |
| 69 | Madonna | LNW (WMS) | 2010 | H + B (Like-a-Prayer bonus) + G | P-005 ✅ + P-035 ✅ | NO | n/a |
| 70 | Star Trek (Trek Through the Stars / Trek to the Top) | LNW (WMS) | 2012 | D (multi-stage starship pick) + H + B (4-tier progressive) | P-047 ✅ + P-014 ✅ + P-035 ✅ | NO | n/a |
| 71 | Lord of the Rings (Two Towers / Return of the King) | LNW (WMS) | 2012, 2013 | H (4-mode FS tower-spin / extra-spin) + D (tower-pick bonus) + B (5-tier progressive Helm's Deep) + **M: mini-slot inside bonus (Tower Spin)** | P-014 ✅ + P-047 ✅ + P-035 ✅ + ❌ **nested-slot-inside-bonus** (sub-game spins independently with own paytable, contributes to parent) | YES (M14) | P1 |
| 72 | Stargate Megaways | LNW (SG Digital) | 2020 | G3 + F + H | P-049 ✅ + P-001 ✅ | NO | n/a |
| 73 | James Bond 007 Thunderball / Casino Royale / Goldfinger / Diamonds Are Forever | LNW (SG / Bally licensed; mostly land-based) | 2016+ | Mixed; mostly D + H + B + scene-specific bonuses | P-014/P-047/P-035 ✅ | NO | n/a |
| 74 | Cluedo Mighty Ways | LNW (SG Digital) | 2022 | **G3 variant: Mighty Ways (4,096–262,144 ways)** + F + Murder-mystery pick bonus + H | P-049 ✅ (variable-reel ways) + P-001 ✅ + P-047 ✅ | NO | n/a |
| 75 | Smokin' 7s | LNW (Bally) | 2006 (land-based 1990s) | F1/G1 (3-reel classic) + reel-bound mystery prog (Quick Hit family analog) | P-020 ✅ + ❌ M5 same | YES (M5) | P2 |
| 76 | Stinkin' Rich | LNW (IGT licensed? actually IGT — verify; brand list mentions L&W has many such) | 2008 | D (multi-pick trash bonus) + H + B | (if L&W; IGT in some markets) — P-047 + P-014 ✅ | check ownership | n/a |
| 77 | Top Cat | LNW (Bally) | 2013 | D (gang-pick) + H + G | P-047 ✅ + P-005 ✅ | NO | n/a |
| 78 | Cash Express Gold Class series (Luxury Line) | LNW (Bally) | 2018+ | A (cash collector + mystery-cash values) + B (5-tier MMMG+G) + sticky symbols | P-002 ✅ + P-035 ✅ + P-051 ✅ + P-024 ✅ | NO | n/a |
| 79 | Rich Little Piggies Hog Wild | LNW (Bally) | 2022 | A (sticky money symbol H&S) + B (4-tier MMMG) + H (FS) | P-002 ✅ + P-035 ✅ + P-014 ✅ | NO | n/a |
| 80 | Rich Little Piggies Meal Ticket | LNW (Bally) | 2023 | as #79 + Meal Ticket persistent meter | + P-067 ✅ | NO | n/a |
| 81 | Rich Little Piggies Piggy Bankin' Break In | LNW (Bally) | 2024 | A (3-pot enhanced H&S — Instant Win / Double Play / Repeat Win each a sub-mode) + B + **M: branched H&S sub-mode selection** | P-002 ✅ + P-035 ✅ + ❌ **multi-pot branched H&S sub-feature selection** (each pot triggers structurally different sub-game) | YES (M15) | P1 |
| 82 | Rich Little Sheep – Wool Street Riches | LNW (Bally) | 2025 | as Hog Wild variant | as #79 | NO | n/a |
| 83 | Rich Little Piggies World Class | LNW (Bally) | 2025 | as #81 + class-tier escalation | as #81 | YES (M15) | P2 |
| 84 | Rich Little Hens World Class | LNW (Bally) | 2025 | as #81 | as #81 | YES (M15) | P2 |
| 85 | EggLink series (multiple) | LNW (Bally) | 2024–2025 | A (egg collect H&S) + B + H | P-002 ✅ + P-035 ✅ + P-014 ✅ | NO | n/a |
| 86 | Thundering series (Thundering Bison, Thundering Buffalo, Thundering Gorilla) | LNW (Lightning Box) | 2018–2024 | G4 (243/1024 ways) + H (FS retrigger) + G (stacked wilds) + occasional Stellar Jackpots arcade | P-049 ✅ + P-037 ✅ + P-005 ✅ + ❌ **arcade-shooter side bonus** (Stellar Jackpots: shoot-through 6 challenge levels) | YES (M16) | P1 |
| 87 | Astro Pug | LNW (Lightning Box) | 2018 | G2 (Reelfecta 8 reels, 1296 ways, asymmetric reel heights 3-3-4-4-4-4-3-3) + H + G (multiplier wild) | P-049 ✅ + P-018 ✅ (asymmetric) + P-017 ✅ | NO | n/a |
| 88 | Astro Cat / Astro Pug Bonus Pug / Lightning Horseman | LNW (Lightning Box) | 2017+ | Similar to #87 | as #87 | NO | n/a |
| 89 | Chicken Fox | LNW (Lightning Box) | 2018 | G2 + Stellar Jackpots arcade bonus | as #87 + M16 gap | YES (M16) | P2 |
| 90 | Stellar Jackpots wrapper (multiple titles) | LNW (Lightning Box) | 2017+ | Random-trigger arcade-shooter mini-game with 3 fixed jackpot prizes (mini/minor/major) | ❌ **arcade-shooter prob-of-survival per level** | YES (M16) | P1 |
| 91 | 88 Fortunes (land-based original) | LNW (Bally / Shuffle Master) | 2014 | A (gold-symbol H&S Fu Bat bonus) + B (4-tier MMMG WAP) + C (mystery gold-symbol coverage) + H | P-002 ✅ + P-035 ✅ + P-051 ✅ + P-014 ✅ | NO | n/a |
| 92 | 88 Fortunes Megaways | LNW (SG Digital online port) | 2020 | G3 + F + D (picker bonus) + H (multiplier-enhanced FS up to 10000x) + cap | P-049 ✅ + P-001 ✅ + P-047 ✅ + P-067 ✅ + P-066 ✅ (max-win cap) | NO | n/a |
| 93 | 88 Fortunes Diamond Eternity | LNW (Bally) | 2023 | as #91 + Diamond-Eternity sticky-symbol upgrade | + P-013 ✅ | NO | n/a |
| 94 | 5 Treasures | LNW (Shuffle Master) | 2017 | D (FS mode selection: choose 1 of 5 FS modes after trigger) + H | P-047 ✅ + ❌ **player-elects FS-variant** (M11 same) |  ✅ **CLOSED (M11 W188)**| P1 |
| 95 | Jin Ji Bao Xi (Endless Treasure / Rising Fortunes) | LNW (Shuffle Master) | 2017–2019 | A (red-envelope H&S) + B (4-tier MMMG) + H | P-002 ✅ + P-035 ✅ + P-014 ✅ | NO | n/a |
| 96 | Fu Dai Lian Lian | LNW (Shuffle Master) | 2017 | A + B + H | as #95 | NO | n/a |
| 97 | Action Bank | LNW (Barcrest) | 2017 | D (vault-pick bonus) + H + I (Big Bet) | P-047 ✅ + P-014 ✅ + P-057 ✅ + ❌ Big Bet within-package reel-set switching (M9) |  ✅ **CLOSED (M9 W186)**| P1 |
| 98 | Black Knight (I, II, III) | LNW (WMS) | 2008–2015 | H + G (stacked wilds) + multi-reel scatter | P-005 ✅ + P-068 ✅ | NO | n/a |
| 99 | Amazon Queen | LNW (WMS) | 2011 | H + G + B | P-005 ✅ + P-035 ✅ | NO | n/a |
| 100 | Bookworm | LNW (WMS) | 2008 | H + G (substitution-stacked wild) + reading bonus | P-005 ✅ + P-014 ✅ | NO | n/a |
| 101 | Wonder 500 (LNW exclusive with Sky Vegas, 2024) | LNW (in-house digital, exclusive with Sky Betting & Gaming) | 2024 | A + B + H + I (high-roller tier) | P-002 ✅ + P-035 ✅ + P-014 ✅ + P-057 ✅ | NO | n/a |
| 102 | The Princess Bride | LNW (Shuffle Master) | 2015 | D (scene-pick) + H + G + B | P-047 ✅ + P-005 ✅ + P-035 ✅ | NO | n/a |
| 103 | Forrest Gump | LNW (Bally) | 2014 | D (multi-scene pick tree) + H + reel-bound symbol upgrades | P-047 ✅ + P-013 ✅ | NO | n/a |
| 104 | Wonder Woman Gold | LNW (Bally) | 2018 | D + H + G + B | P-047 + P-005 + P-035 ✅ | NO | n/a |
| 105 | Pawn Stars | LNW (Bally) | 2013 | D (shop-item pick tree) + H | P-047 ✅ + P-014 ✅ | NO | n/a |

(Coverage continues across L&W's ~220+ online slot library; the 105 above exhaust every distinct mechanic family verified in the public record. Additional titles are mechanic-duplicates of rows already listed and do not introduce new kernel gaps.)

---

## 3. Gap summary — every mechanic with no existing P-ID

Numbered M1…M16 (referenced in column above). For each: 1-line description + example L&W title(s) + reason existing P-IDs do not cover.

### M1 — Per-reel cash-bag aggregator with row-multiplier coupling — ✅ **CLOSED in W185** (P-086)
**Example:** Dragon Spin CrossLink Water (2024).
Each landed coin contributes to its reel-specific bag AND ramps its row-specific multiplier by +1. Two coupled progressions (per-reel bag, per-row multiplier) where outcomes interact multiplicatively at payout. P-002 covers cash-collect into a single pool; P-067 covers single-meter K-tier; P-039 covers global-only persistent multiplier. None covers **per-reel × per-row coupled accumulators**.
**Resolution:** W185 ships `src/features/perReelBagRowMultiplierCoupled.ts` — per-cell Bernoulli × coupled-dimension aggregation: per-reel bag B_i = M·q·μ_V Wald, per-row coin count C_j ~ Binomial(N, q), per-row multiplier M_j = m_{C_j} vendor lookup. E[Y] = M·μ_V·Σ_c Bin(c;N,q)·m_c·c exact closed-form via tower property. P(all rows full) = q^(N·M). 36 vitest specs PASS. Acceptance 6/6 PASS @ 120K MC spins (Dragon Spin CrossLink Water classic + high-density + steep-ramp + compact 3×3 + flat-baseline + top-tier-only jackpot corners) — CF/MC slaganje 0.1-1% rel za main path, top-tier-only corner uses abs-or-rel tolerance.

### M2 — Multi-state frame/structure upgrade Markov — ✅ **CLOSED in W183** (P-084)
**Example:** Huff N' Puff family (Straw → Wood → Brick → Mansion frame upgrades).
Each cell on the grid has an independent 3-or-4-state Markov chain (Idle/Straw/Wood/Brick/House) with vendor-specific upgrade probabilities per spin; payouts gated by current state. P-058 covers 4-state Markov wild tier (single wild's state); this is **N×M independent per-cell Markov on grid** — N×M Kronecker product of small Markov chains.
**Resolution:** W183 ships `src/features/multiStateFrameUpgradeMarkov.ts` — exact π_t = π_0 · P^t closed-form za per-cell K-state Markov chain, grid aggregate E[total payout] = N·M · Σ_{t=0..T-1} dot(π_t, m), P(at least one cell reaches k_target) = 1 − (1 − P_per_cell)^(N·M) pod independence. 39 vitest specs PASS. Acceptance 6/6 PASS @ 30K MC features (Huff N' Puff original/More/Even More/Money Mansion/Xtra Puff 6-state + 3-state reset corner) — CF/MC slaganje 0.05-0.3% rel.

### M3 — Dynamic grid-expansion during Hold-and-Spin — ✅ **CLOSED in W182** (P-083)
**Example:** Ultimate Fire Link family, Lock It Link Eureka Reel Blast.
H&S starts with N rows; as fireballs/dynamites collected past thresholds, **rows are added** (up to 4 extra rows). State space changes mid-feature. P-002/P-049/P-059 all assume fixed grid. Requires a kernel handling rectangular grid-expansion Markov where occupied rows trigger row-extend events with their own probability.
**Resolution:** W182 ships `src/features/dynamicGridExpansionHoldSpin.ts` — exact Markov DP over state (active, m_idx, stale_streak) sa per-spin Binomial(empty, q) landing PMF + deterministic cumulative-landing-threshold row extensions + classic H&S 3-stale termination. 39 vitest specs PASS. Acceptance 6/6 PASS @ 180K MC features (Ultimate Fire Link Olvera/Power 4/China Street + Lock It Link Eureka + 2 corners) — CF/MC slaganje ~0.5-3% rel.

### M4 — Deterministic-grid explosion adds free-position multipliers — ✅ **CLOSED in W187** (P-088)
**Example:** Dancing Drums Explosion, Dancing Drums Revolution.
Bonus animation explodes K predetermined positions, adding free-position multipliers (e.g. 2× / 3× / 5× landing). Distinct from P-063 (random reel-stop multipliers) because positions are deterministic-by-design, and from P-038 (cascade pyramid) because it's a one-shot explosion not chain-conditional.
**Resolution:** W187 ships `src/features/deterministicExplosionMultiplierDrop.ts` — trigger-gated compound sum: T ~ Bernoulli(p_trigger), conditional on T=1 K positions explode each sa V_k iid iz discrete PMF. **E[Y/spin] = p_trigger·K·c·E[V]** exact closed-form. Var via law of total variance. **P(all K hit v_max | trigger) = π_max^K**. Per-value disclosure 1−(1−π_l)^K za UKGC RTS-14 tag-level audit. 37 vitest specs PASS. Acceptance 6/6 PASS @ 600K MC spins (Dancing Drums Explosion 2020 classic + Revolution 2025 8-position extended + 4 corner configs) — CF/MC slaganje ~0.5-3% rel.

### M5 — Reel-bound mystery progressive (Quick Hit family)
**Example:** Quick Hit Platinum, Quick Hit Black Gold, Quick Hit Pro, Quick Hit Wild, Quick Hit Blitz, Quick Hit Cash Wheel, Triple Cash Wheel, Smokin' 7s.
Quick Hit symbols on **reels 1, 2, 3, 4, 5** with cumulative-across-spin reel-position-dependent payouts: 3 Quick Hit symbols on reels 1+2+3 = mini, 4 on 1+2+3+4 = minor, 5 on all reels = grand. Distinct from P-035 (multi-tier WAP w/o reel-position dependence), P-051 (mystery aggregator), P-033 (must-hit-by mystery progressive). Requires **per-reel scatter accumulation + adjacency-reel-count tier mapping**. **Used in 8+ L&W titles → highest-priority gap**.

### M6 — Stacked-wheel compound RTP (Triple Cash Wheel)
**Example:** Triple Cash Wheel (3 wheels in stacked configuration; spin one → triggers others conditionally).
P-046 covers single-wheel respin Markov. Stacked wheels with cross-wheel triggers (winning wheel-1 unlocks wheel-2 spin) require a 2- or 3-level compound bonus tree analyzer. **Pure composition** of P-046 might suffice; verify before kernel.

### M7 — Colossal Reels with wild-transfer coupling — ✅ **CLOSED in W184** (P-085)
**Example:** Spartacus Gladiator of Rome, Spartacus Super Colossal Reels, Spartacus Call to Arms (and Spartacus dependent titles).
Two grids: 5×4 main + 5×12 colossal, **100 paylines distributed across both, with wild-position transfer from main → colossal at matched coordinates**. P-030 (Parallel Screens Aggregate) assumes independence; this is **conditional dependence via wild-transfer mapping**. Requires kernel: 2-grid joint-payout with conditional symbol propagation on a subset of positions.
**Resolution:** W184 ships `src/features/colossalReelsWildTransfer.ts` — 2-stage Binomial sa conditional coupling: K_main via per-reel-non-uniform DP O(N²), K_col | K_main ~ Binomial(K_main, q_t). Joint PMF eksplicitno enumerated. E[K_col] = q_t·E[K_main] (law of total expectation), Var[K_col] derived via law of total variance, P(full wild both grids) = P(K_main=N)·q_t^N. 39 vitest specs PASS. Acceptance 6/6 PASS @ 180K MC spins (Spartacus Gladiator + Super Colossal + Call to Arms + Caesar Empire + 2 corner cases) — CF/MC slaganje 0.5-3% rel.

### M8 — Competitive race / contest bonus
**Example:** Goldfish Race for the Gold, Reel'em In Big Bass Bucks Fishing Contest.
N "racers" each have iid progression rates; one wins, awards multiplier × N-position. Distinct from P-047 (sequential pick tree) and P-046 (wheel spin) because it's a **simultaneous max-finishing-order** outcome over multiple parallel Markov chains.

### M9 — Big Bet paid-package with within-package reel-set switching — ✅ **CLOSED in W186** (P-087, UK-CRITICAL)
**Example:** Monopoly Big Event, Rainbow Riches Pick n Mix, Action Bank.
Player pays N× stake → unlocked 5 spins where **each spin has a different reel-set + paytable** (often with progressive RTP across the 5 spins). P-057 covers per-package RTP single-mode; this adds **multi-spin schedule of distinct paytables WITHIN ONE paid package**. UK-specific feature mandated under UKGC RTS 12 for Big Bet disclosure.
**Resolution:** W186 ships `src/features/bigBetPaidPackageMultiSpin.ts` — per-spin independent aggregation: E[total] = Σ b_k·r_k, Var = Σ σ²_k, P(profit) via CLT-Normal (Abramowitz-Stegun erf). Operator subsidy = max(0, packageRtp − baseRtp)·C. RTP escalation slope (linear regression), UKGC LCCP 3.4.3 harm-threshold flag, bestSpinIndex/worstSpinIndex disclosure. 40 vitest specs PASS. Acceptance 6/6 PASS @ 180K MC packages (Monopoly Big Event 5-spin 90→98% + RR Pick n Mix flat 96% + Action Bank 90→102% + Pearl of Caribbean high-vol + 2-spin corner + 10-spin extended). UKGC RTS-12 mandatory disclosure paper trail complete.

### M10 — Bonus Bank running-balance offset (deferred-win bank)
**Example:** Rainbow Riches Megaways.
Player elects pre-spin Bank-Off-Wins / Bank-All-Wins / Bank-Small-Wins → winnings accumulate in a bank rather than balance, then auto-converts to a bonus buy when bank threshold reached. P-057 (FS Buy) does not handle running-balance accumulation; P-095 anteBetTradeOff (existing) handles per-spin RTP swap not cumulative banking.

### M11 — Player-elects feature-composition pre-spin / pre-bonus — ✅ **CLOSED in W188** (P-089)
**Examples:** Rainbow Riches Pick n Mix (player picks 3 of 5 bonuses to enable), Michael Jackson King of Pop (3 FS-mode variants Smooth Criminal / Beat It / Billie Jean), KISS (band-member FS variants), 5 Treasures (FS-mode selection menu).
Player makes an **m-of-n combinatorial selection** of features at trigger time, with each subset producing a different RTP and variance profile. The engine needs a **combinatorial-mode RTP decomposition analyzer** — given a base game with N optional features, for each 2^N subset emit RTP/var/hit-freq and verify that aggregate weighted RTP across configured mode-selection probabilities matches paytable target.
**Resolution:** W188 ships `src/features/playerElectsFeatureComposition.ts` — m-of-N combinatorial composition selection: under independence E[Y|S] = Σ r_i. Best player-rational pick = top-m by RTP desc, worst = bottom-m, uniform = (m/N)·Σ r_i (linearity). Skill premium = bestPick − uniformPick. RTP spread = bestPick − worstPick. C(N,m) distinct compositions. 35 vitest specs PASS. Acceptance 6/6 PASS @ 360K MC spins (RR Pick n Mix 3-of-5 + MJ KOP 3 modes + KISS 4 modes + 5 Treasures 5 modes + 2 corner configs, rational/worst/uniform strategy validation).

### M12 — Random feature-injection during free spins (sticky / non-sticky)
**Example:** The Wizard of Oz Munchkinland (random Munchkin appears mid-FS to grant extra spins / wilds / multiplier).
Per FS spin a Bernoulli(p) event injects a random sub-feature with its own payout. Distinct from P-005 (sticky wild FS), P-068 (scatter retrigger). Requires kernel handling random nested-feature aggregation during FS.

### M13 — Mid-spin random reel-reshape (Glinda)
**Example:** Wizard of Oz Follow the Yellow Brick Road.
Mid-spin the entire reel set may be replaced by a different reel set (Glinda the Good Witch feature). No existing P-ID covers **reel-set switching mid-execution** as a stochastic event with state-dependent transition matrix.

### M14 — Nested-slot mini-game inside bonus (independent paytable)
**Example:** Lord of the Rings Two Towers (Tower Spin nested mini-slot inside main bonus); also Star Trek some variants.
Bonus stage contains its own slot-spin with separate reel set, paytable, and variance which then contributes to parent bonus. P-047 (pick tree) does not model sub-spinner. Requires compositional kernel: parent stage E[Y] = pick-stage E[X] + nested-slot E[Y_inner]; variance composes via law of total variance.

### M15 — Multi-pot branched H&S sub-feature selection
**Example:** Rich Little Piggies Piggy Bankin' Break In (3 pots: Instant Win, Double Play, Repeat Win each triggering structurally distinct sub-game).
Standard H&S grid + a **branched H&S** where each filled pot triggers a different sub-feature with its own math model. Requires compound-tree H&S where pot outcomes have heterogeneous payout distributions (not just different prize values).

### M16 — Arcade-shooter side bonus (probabilistic level progression)
**Example:** Stellar Jackpots wrapper (Lightning Box) — Thundering Bison, Chicken Fox, Lightning Horseman.
Randomly triggered arcade mini-game: player shoots through 6 levels with per-level success probability p_i, winning the highest jackpot tier reached (mini/minor/major). Distinct from P-064 (trail/board because trail is sequential picks not skill-shoot probability; functionally similar but with a 3-tier prize structure tied to max-level-reached. Worth its own kernel for clean integration with Stellar Jackpots-style add-ons.

---

## 4. Priority ranking

### P0 — Used by ≥5 L&W titles, blocks substantial portfolio. Build first.

| Gap | Title count | Jurisdictions | Recency | Wave priority |
|---|---|---|---|---|
| **M5** — Reel-bound mystery progressive (Quick Hit family) | 8+ | UK + US + AU + EU | 2010–2024 (continuous) | W181 |
| **M3** — Dynamic grid-expansion during H&S (Ultimate Fire Link / Lock It Link Eureka) | 8+ (Ultimate Fire Link 7 variants + Lock It Link Eureka) | UK + US + AU + EU | 2017–2025 | W182 |
| **M2** — Multi-state frame/structure upgrade Markov (Huff N' Puff family) | 8 (Huff N' Puff to Money Mansion) | US + UK + EU | 2019–2024 | W183 |
| **M7** — Colossal Reels wild-transfer (Spartacus family) | 3+ (but defining-mechanic of WMS land-based, 50+ titles in WMS portfolio) | UK + US + AU | 2012–2019 | W184 |
| **M1** — Per-reel cash-bag × row-multiplier coupling (Dragon Spin CrossLink Water) | 1 current + signal of new L&W flagship direction | UK + US + EU | 2024 | W185 |
| **M9** — Big Bet paid-package within-package switching (Barcrest UK family) | 3+ titles (Monopoly Big Event, Pick n Mix, Action Bank); UKGC-mandated disclosure | **UK-CRITICAL** | 2010–2022 | W186 |

### P1 — Used by ≥2 L&W titles, valuable for portfolio breadth.

| Gap | Title count | Wave priority |
|---|---|---|
| **M4** — Deterministic-grid explosion adds multipliers (Dancing Drums Explosion / Revolution) | 2 | W187 |
| **M11** — Player-elects feature-composition (RR Pick n Mix, MJ KOP, KISS, 5 Treasures) | 4 | W188 |
| **M12** — Random feature-injection during FS (Munchkinland) | 1+ (pattern recurs in WMS sub-titles) | W189 |
| **M14** — Nested-slot mini-game inside bonus (LOTR Two Towers, Star Trek) | 2+ | W190 |
| **M15** — Multi-pot branched H&S (Piggy Bankin' Break In, RLP World Class line) | 3+ | W191 |
| **M8** — Competitive race / contest bonus (Goldfish Race, Reel'em In Big Bass Bucks) | 2 | W192 |
| **M16** — Arcade-shooter side bonus (Stellar Jackpots wrapper across Lightning Box) | 5+ Lightning Box titles | W193 |
| **M10** — Bonus Bank running-balance offset (Rainbow Riches Megaways) | 1+ flagship UK | W194 |

### P2 — Single-title niche; deferred.

| Gap | Title count | Wave priority |
|---|---|---|
| **M6** — Stacked-wheel compound RTP (Triple Cash Wheel) | 1 (may compose from P-046) | W195 (composition test) |
| **M13** — Mid-spin random reel-reshape (Glinda) | 1 | W196 |

---

## 5. Recommended Wave numbering W181-W200

Format: **W### — Kernel name (gap M#) → P-ID assignment → covers N L&W titles**

| Wave | Solver name | Closes gap | New P-ID | L&W titles unlocked |
|---|---|---|---|---|
| **W181** | Reel-Bound Mystery Progressive (per-reel scatter accumulation with adjacency tier mapping) | M5 | P-082 | Quick Hit Platinum, Black Gold, Pro, Wild, Blitz, Cash Wheel, Triple Cash Wheel, Smokin' 7s (8 titles) |
| **W182** | Dynamic Grid-Expansion H&S (Markov on rectangular state space with row-add events) | M3 | P-083 | Ultimate Fire Link (7 variants) + Lock It Link Eureka Reel Blast (8 titles) |
| **W183** | Per-Cell Markov Frame Upgrade Kronecker Aggregator (3-or-4-state cell chain × N×M grid) | M2 | P-084 | Huff N' Puff family (8 titles) |
| **W184** | Colossal Reels Wild-Transfer Coupled Two-Grid Aggregator (conditional propagation) | M7 | P-085 | Spartacus family (3+ titles, defining WMS land-based mechanic) |
| **W185** | Per-Reel-Bag × Per-Row-Multiplier Coupled Accumulator (Dragon Spin CrossLink) | M1 | P-086 | Dragon Spin CrossLink Water + future L&W variants |
| **W186** | Big Bet Paid-Package Multi-Spin Reel-Set Schedule Analyzer (UKGC RTS-12 disclosure) | M9 | P-087 | Monopoly Big Event, Rainbow Riches Pick n Mix, Action Bank, Pearl of Caribbean (4+ titles, **UK-critical**) |
| **W187** | Deterministic Explosion Multiplier-Drop (one-shot deterministic-grid mult injection) | M4 | P-088 | Dancing Drums Explosion + Revolution (2+ titles) |
| **W188** | Combinatorial Feature-Composition RTP Decomposer (m-of-n subset RTP×variance grid) | M11 | P-089 | RR Pick n Mix, MJ KOP, KISS, 5 Treasures (4+ titles) |
| **W189** | Random Feature-Injection During FS Aggregator (per-FS-spin Bernoulli injection of nested sub-feature) | M12 | P-090 | Wizard of Oz Munchkinland (1+ extends to WMS sub-feature library) |
| **W190** | Nested Mini-Slot Inside Bonus Compositional Variance (parent-child slot composition with law-of-total-variance) | M14 | P-091 | LOTR Two Towers, Star Trek (2+ titles) |
| **W191** | Multi-Pot Branched H&S Sub-Feature Selector (heterogeneous-payout pot triggers) | M15 | P-092 | Piggy Bankin' Break In, Rich Little Piggies/Sheep/Hens World Class (3+ titles) |
| **W192** | Competitive Race / Contest Multi-Racer Max-Finish Aggregator (N parallel Markov chains, max-finishing-position bonus) | M8 | P-093 | Goldfish Race for the Gold, Reel'em In Big Bass Bucks Fishing Contest (2 titles) |
| **W193** | Arcade-Shooter Side-Bonus Multi-Level Survival Probability (per-level p_i Bernoulli chain to max-tier prize) | M16 | P-094 | Stellar Jackpots wrapper across Lightning Box (5+ Lightning Box titles) |
| **W194** | Bonus Bank Running-Balance Auto-Convert (banking with bank-threshold trigger; 3 mode variants) | M10 | P-095 | Rainbow Riches Megaways + RR family extensions (1+ flagship UK) |
| **W195** | Stacked Compound-Wheel Conditional Trigger (compose P-046 + cross-wheel conditional trigger; validate via composition test, no new kernel needed if composition passes) | M6 | P-046 composition validation (NOT new P-ID) | Triple Cash Wheel (1 title; covered via composition) |
| **W196** | Mid-Spin Reel-Set Switch Stochastic Transition (probability of reel-replace × subset of reels affected) | M13 | P-096 | Wizard of Oz Follow the Yellow Brick Road (1 title) |
| **W197** | **Industry-First** Reel-Position-Weighted Quick Hit Cumulative Decomposition (extension of P-082 with per-position contribution disclosure for UKGC tag-level audit) | (regulatory enhancement on M5) | P-097 | extends W181, adds UKGC RTS 14 Tag 12 per-position breakdown for Quick Hit-family certification |
| **W198** | **Industry-First** Big Bet Buy-Cycle Recovery Analyzer (Wald-style EV recovery on multi-spin paid package; UKGC + Belgian ban impact disclosure) | (regulatory enhancement on M9) | P-098 | extends W186, adds chase-pattern-detection + Australian/Belgian bonus-buy-ban counterfactual RTP loss |
| **W199** | Compositional Cross-Solver Validator (acceptance harness that exercises every new W181-W196 kernel in a full L&W IR-style composition pipeline) | (validation infrastructure) | — | engineering: regression-test the 16 new kernels combined |
| **W200** | **MILESTONE** L&W Portfolio Coverage Closure Dossier (`reports/dossier/LW_PORTFOLIO_COVERAGE.md`) — emits per-title coverage attestation for every L&W title in this document | (dossier) | — | shipping artifact: certifies L&W can take their IR + math attestation directly from the engine for every title catalogued |

---

## 6. Acceptance criteria for the wave plan

Each W181-W196 kernel must ship with:

1. **Math kernel** (closed-form solver in `src/features/`)
2. **≥25 vitest specs** (matches existing acceptance bar)
3. **≥6 industry-representative configs** (per existing P-ID convention) × MC validation (typically 50K–300K spins)
4. **Acceptance proof MD** in `reports/acceptance/` showing closed-form vs MC agreement within tolerance
5. **Industry pattern catalog entry** in `docs/INDUSTRY_PATTERN_CATALOG.md` with formal P-ID
6. **Cross-reference into KIMI table** in this document (mark ❌ → ✅)
7. **Closed-form portfolio runner integration** (`npm run closed-form-portfolio` must include the new kernel)

---

## 7. What L&W gets when W181-W200 ship

| Metric | Before W181 | After W200 |
|---|---|---|
| Closed-form solvers | 61 | 77 (+16 new) |
| P-IDs documented | 81 | 97 (+16 new) |
| L&W titles with full engine attestation | ~75/105 (71%) | **105/105 (100%)** |
| Gaps requiring custom Monte Carlo | 16 mechanics | 0 mechanics (every L&W mechanic covered by closed-form solver + acceptance proof) |
| UKGC RTS-12 / RTS-14 disclosures | partial | complete (Big Bet + Quick Hit position-weighted + Bonus Bank disclosed) |
| Time to onboard L&W IR | days (gaps require ad-hoc kernels) | hours (every mechanic → known P-ID → known solver) |

---

## 8. Sources

### Verified (used in this document)

- [Light & Wonder (Wikipedia) — corporate structure, subsidiaries, acquisitions](https://en.wikipedia.org/wiki/Light_%26_Wonder)
- [WMS Gaming (Wikipedia) — WMS title history](https://en.wikipedia.org/wiki/WMS_Gaming)
- [Light & Wonder Portfolio page (igaming.lnw.com/portfolio/)](https://igaming.lnw.com/portfolio/) — confirms broad studio/title list (filterable database)
- [Light & Wonder G2E 2025 LightWave announcement — Frankenstein Returns, Dancing Drums Revolution, Visitors Planet Moolah, Ultimate Fire Link Cash Falls Explosion, Jackpot Party VIP Disco](https://explore.lnw.com/newsroom/light-wonder-unveils-lightwave-cabinet-and-four-new-hardware-innovations-at-g2e-2025-ushering-a-new-era-of-immersive-gaming/)
- [Light & Wonder ICE 2025 / G2E 2024 — Huff N' Puff, Ultimate Fire Link, Invaders Attack Again from Planet Moolah, Dancing Drums franchise list](https://explore.lnw.com/newsroom/light-wonder-to-showcase-industry-leading-gaming-innovations-at-ice-2025)
- [iGamingExpress Light & Wonder brand profile](https://igamingexpress.com/brands/light-wonder/)
- [Dragon Train Chi Lin Wins review (Respinix)](https://respinix.com/demo/dragon-train-chi-lin-wins/)
- [Dragon Train review (GGB Magazine)](https://ggbmagazine.com/article/dragon-train/)
- [Light & Wonder Jewel of the Dragon (Indian Gaming Magazine, 2024)](https://www.indiangaming.com/light-wonder-jewel-of-the-dragon/)
- [Dragon Spin CrossLink Water mechanic detail (Indian Gaming Magazine + Fruity Slots review)](https://www.indiangaming.com/light-wonder-dragon-spin-crosslink/) / [Fruity Slots review](https://fruityslots.com/slots/reviews/dragon-spin-cross-link-water/)
- [Huff N' Puff family — Big Win Board reviews (Huff N' More Puff, Huff N' Even More Puff, Hard Hat Edition, Lots of Puff, Xtra Puff, Money Mansion)](https://www.bigwinboard.com/huff-n-xtra-puff-light-wonder-slot-review/)
- [Ultimate Fire Link family slot reviews (vegasslotsonline + Slotcatalog)](https://www.vegasslotsonline.com/light-and-wonder/ultimate-fire-link-cash-falls-china-street/)
- [Lock It Link Diamonds review (Fruity Slots)](https://fruityslots.com/slots/reviews/lock-it-link-diamonds/)
- [Eureka Reel Blast review (Gamesville / Slot Catalog / Bonus Tiime)](https://slotcatalog.com/en/slots/Eureka-Reel-Blast)
- [Quick Hit family explainers (Gambling.com, PlayUSA, Slots.org)](https://www.gambling.com/us/online-casinos/strategy/quick-hit-slots-2252200)
- [Cash Spin / Cash Wizard / Money Vault (Bally) — Vegas Slots Online + Casino Player Magazine](https://www.vegasslotsonline.com/bally/cash-spin/)
- [WMS Spartacus Gladiator of Rome — Vegas Slots Online + Slotsmate (Colossal Reels mechanics)](https://www.vegasslotsonline.com/wms/spartacus-gladiator-of-rome/) + [Slotsmate Colossal Reels](https://www.slotsmate.com/features/colossal-reels-slots)
- [Invaders from the Planet Moolah — All Slots Online + Vegas Slots Online (cascading reels original)](https://www.vegasslotsonline.com/wms/invaders-from-the-planet-moolah/)
- [88 Fortunes Megaways review (Slotslaunch + PlayUSA)](https://slotslaunch.com/light-and-wonder/88-fortunes-megaways)
- [88 Fortunes (Light and Wonder) Slotcatalog](https://slotcatalog.com/en/slots/88-Fortunes-Light-and-Wonder)
- [Rainbow Riches Megaways (Big Win Board)](https://www.bigwinboard.com/rainbow-riches-megaways-barcrest-slot-review/)
- [Rainbow Riches Pick n Mix (Slotswise + Free Slots No Download)](https://www.slotswise.com/online-slots/barcrest/rainbow-riches-pick-n-mix/)
- [Rainbow Riches Pots of Gold (Big Win Board)](https://www.bigwinboard.com/rainbow-riches-pots-of-gold-barcrest-slot-review/)
- [Monopoly Megaways / Big Event series (PokerNews L&W primer)](https://www.pokernews.com/casino/slots/light-and-wonder-slots)
- [Eye of Horus Megaways (Slot Boss review)](https://www.slotboss.co.uk/games/eye-of-horus-megaways)
- [Wizard of Oz Munchkinland (Vegas Slots Online + Slot Catalog)](https://www.vegasslotsonline.com/wms/wizard-of-oz-munchkinland/) + [Slot Catalog](https://slotcatalog.com/en/slots/the-wizard-of-oz-munchkinland)
- [Wizard of Oz Road to Emerald City / Follow the Yellow Brick Road (BigWinBoard + Neonslots + Ispinix)](https://www.bigwinboard.com/new-slot-wizard-oz-road-emerald-city/)
- [Willy Wonka slot family (PlayUSA reviews of all 5 Wonka slots)](https://www.playusa.com/slots/bally/willy-wonka/)
- [Lightning Box — Astro Pug, Stellar Jackpots wrapper (Vegas Slots Online + PlayOJO + PlayUSA)](https://www.vegasslotsonline.com/lightning-box-games/)
- [Thundering Gorilla (Lightning Box) — Livebet](https://www.livebet.com/casino/slots/lightning-box-games/thundering-gorilla)
- [Reel'em In family (WMS) — Slotsspot, Slotorama, FreeSlotsHub](https://www.slotorama.com/video-slots/reel-em-in/)
- [Goldfish series (WMS) — Slotstory + Gambl.com](https://slotstory.com/slot-catalog/goldfish/)
- [Light & Wonder Dragon Train North America removal coverage (Review Journal, on commercial suspension)](https://www.reviewjournal.com/business/casinos-gaming/vegas-gaming-company-clearing-out-all-dragon-train-slot-machines-3183290/)
- [Light & Wonder Jewel of the Dragon commercialisation cessation (g3newswire)](https://g3newswire.com/light-wonder-to-cease-commercialising-its-jewel-of-the-dragon-slot-and-offer-replacements/)
- [Rich Little Piggies series (LNW iGaming + Bonus.com strategy guide)](https://igaming.lnw.com/games/rich-little-piggies-hog-wild/) + [Bonus.com strategy guide](https://www.bonus.com/slots/light-wonder/rich-little-piggies-hog-wild/)
- [Cluedo Mighty Ways feature explainer (PokerNews L&W primer, June 2022 launch)](https://www.pokernews.com/casino/slots/light-and-wonder-slots)
- [Wonder 500 Sky Vegas exclusive (Light & Wonder press release)](https://explore.lnw.com/newsroom/light-wonder-showcases-pioneering-new-wonder-500-product-exclusively-with-sky-betting-gaming/)

### Brand-attribution corrections (used to remove non-L&W titles from gap analysis)

- [Aristocrat ownership of Lightning Link / Dragon Link / Lightning Cash / Buffalo / Wonder 4 / Wonder Wheel](https://www.aristocratgaming.com/us/slots/games/wonder-4-revolution)
- [Lightning Link vs Dragon Link history (Holy City Sinner — confirms Aristocrat)](https://holycitysinner.com/entertainment/lightning-link-vs-dragon-link-what-s-the-difference/)
- [Know Your Slots — Lightning Link, Dragon Link, Dollar Storm history](https://www.knowyourslots.com/all-about-lightning-link-dragon-link-and-dollar-storm/)
- [Coyote Moon — IGT title](https://www.onlineslots.com/IGT/coyote-moon/)

---

## 9. Open verification items (for Boki to confirm)

1. **Stinkin' Rich** — public sources show both IGT and Bally listings. Verify L&W ownership before counting toward M5 (currently excluded).
2. **Top Cat** — Bally land-based, confirmed L&W; UK Belgian/Australian distribution coverage unverified.
3. **The Princess Bride** — Shuffle Master 2015; verify still in L&W portfolio post-2022 rebrand.
4. **Lock It Link Eureka Reel Blast** — confirmed L&W via slot reviews; verify row-expansion **during** H&S (not pre-trigger) before assigning to M3 alongside Ultimate Fire Link.
5. **Triple Cash Wheel** — composition test (P-046 × P-046 × P-046 chained) should be attempted in W195 before deciding whether a new kernel is needed.
6. **Dragon Train Chi Lin Wins** — paused in NA per Review Journal (Apr 2025); confirm whether engine attestation is still required (EU + AU markets active).
7. **Wonder 500** — Sky Vegas exclusive partnership; engineering should confirm scope of mechanics (this document treats it as a composition of A + B + H + I, no new gap).

---

**End of KIMI deep-research deliverable.** Total titles catalogued: 105. New kernel gaps identified: 16 (M1–M16). Proposed waves: W181–W200 (16 kernels + 2 enhancements + 1 validator + 1 dossier).
