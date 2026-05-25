# KIMI Research Brief — Vendor B Portfolio Coverage

**Purpose:** Map every commercially-active Vendor B (and acquired) slot
title to its core feature mechanic, then cross-reference against our 61
closed-form solvers / 81 P-IDs catalog to identify **coverage gaps** that
must close before Vendor B can build any of their games on top of this engine.

**Author:** Boki (slot-math-engine-template project lead)
**Date:** 2026-05-17
**Status:** Brief for KIMI deep-research run. Output drives W181-W195+ backlog.

---

## Context (what KIMI must understand before researching)

Vendor B Inc. (Vendor B on Nasdaq, ex-Vendor B / Vendor B / Vendor H /
Shuffle Master / WMS) is the target customer for this math engine. The
business proposition is:

> Vendor B's game-design team writes a slot **IR file** (paytable + features) →
> our engine runs it → produces full regulator-grade math attestation
> (RTP per feature, hit frequency tier decomposition, max-win cap analysis,
> bonus play-through EV, etc.) → output is the operator-package zip they
> hand to UKGC / MGA / AGCO / AU NCPF / EU GA 2024 auditors.

For this to work, **every feature mechanic Vendor B ships across their entire
portfolio must already have a matching closed-form solver in our catalog.**
If a kernel is missing, Vendor B cannot use the engine for that title.

Our current state (as of Wave 180):
- **61 closed-form solvers** (W049 → W179, see portfolio runner)
- **81 P-IDs** in `docs/INDUSTRY_PATTERN_CATALOG.md`
- **90 CI math gates** (each gate validates one solver against MC at production-grade tolerance)
- **276 industry-representative configs** under continuous regression test

---

## Vendor B Brand Roster (KIMI: confirm + extend)

Cover every brand under the Vendor B umbrella. Known so far:

- **Vendor B** (former Vendor B Gaming) — North America land-based + online
- **Vendor H Technologies** — slot cabinets + features (Cash Spin, U-Spin)
- **Shuffle Master** — table game side, but with slot crossovers
- **WMS Industries** — Reel'em In, Monopoly, Bookworm, etc.
- **Lightning Box** — Australian studio acquired 2022
- **Authentic Gaming** — live casino acquired 2019
- **NYX Gaming Group / Spin Games** — content aggregator side
- **Vendor B Studios** (in-house digital studios post-2022 rebrand)

Confirm whether the following are still part of Vendor B or divested:
- Don Best (sports), Bingo Industries, Lottery (divested 2022)

---

## Top-Priority Vendor B Slot Titles (KIMI: produce a ranked list of ≥40 titles)

For each title, KIMI must extract:

1. **Title** (with vendor brand)
2. **Year released** (newer = higher priority)
3. **Active jurisdictions** (UK / US states / EU / AU — operator-jurisdiction overlap)
4. **Core feature mechanic** (in 1 line — example: "Hold & Spin with 3-tier reel-bound jackpot")
5. **Secondary mechanics** (free spins style, multiplier mode, bonus type)
6. **Estimated annual GGR contribution** (proxy: search results count, slot-tracking-site rank like SlotsLaunch / VegasSlotsOnline / SlotCatalog)

Known top-tier Vendor B titles to seed the search (KIMI: extend beyond this list):
- Quick Hit (Platinum / Black Gold / Pro / Wild) family
- Pattern-LL (Sahara Gold / High Stakes / Magic Pearl / Heart Throb)
- Pattern-DL (Autumn Moon / Genghis Khan / Panda Magic / Spring Festival)
- 88 Fortunes (88 Fortunes Megaways / Diamond Eternity)
- Buffalo (Buffalo Gold Revolution / Buffalo Diamond / Buffalo Stampede / Buffalo Link)
- Lightning Cash (Happy Lantern / High Stakes / Magic Pearl)
- Pattern-LIL (Diamonds / Night Life / Hold Onto Your Hat / Eureka Reel Blast)
- Madonna
- Michael Jackson King of Pop
- Star Trek (Trek Through the Stars / Trek to the Top)
- Willy Wonka & The Chocolate Factory (Pure Imagination / Dreamers of Dreams)
- Wonder 4 (Boost / Tall Fortunes / Special Edition / Jackpots)
- Zeus (Zeus God of Thunder / Zeus II / Zeus III / Zeus 1000 / Kronos Unleashed)
- Lord of the Rings (Two Towers / Return of the King)
- Monopoly (Big Event / Stay & Play / Hot Properties / Megaways)
- Reel'em In (Big Bass / Catch the Big One)
- Jackpot Party Cash Spin
- Smokin' 7s
- Spartacus
- Goldfish (Goldfish Race for the Gold / 3 / Goldfish Galore)
- Invaders from the Planet Moolah / Invaders Return
- Kiss
- Twin Win

---

## Feature Mechanic Taxonomy (KIMI: classify every title into these buckets)

Use this taxonomy when listing each title's mechanic. If a title introduces
a NEW mechanic not in this list, flag it as **NOVEL** (= candidate kernel
gap for our backlog).

### A. Hold & Spin / Cash Collect family
- **A1.** Classic 3-tier reel-bound Hold & Spin (Pattern-LL style)
- **A2.** Value-based Hold & Spin with mini/minor/major/grand bound to filled grid count
- **A3.** Cash Express collector with mystery cash values + sticky symbols
- **A4.** Pattern-LIL sticky symbol expansion across re-spins
- **A5.** Reel-Bound Jackpot tier where filling N reels triggers progressive prize

### B. Free Spins family
- **B1.** Standard scatter-trigger N free spins
- **B2.** Retrigger-extended free spins (Wald compound)
- **B3.** Free spins with persistent multiplier trail (BTG Bonanza Megaways style, sticky-Δ)
- **B4.** Pick-a-prize bonus to determine free spins count + multiplier
- **B5.** Wheel-of-fortune to award free spins quantity (Lord of the Rings / Wheel of Fortune)

### C. Multiplier mechanics
- **C1.** Global game-state multiplier (Wonder 4 BOOST style)
- **C2.** Per-spin tumble multiplier (Sweet Bonanza Xmas style with cap)
- **C3.** Multiplier wild on base-game (Goldfish 3 fish multipliers)
- **C4.** Reel-bound multipliers (Buffalo Gold golden buffalo head)

### D. Wild expansion / sticky family
- **D1.** Standard expanding wild on reel
- **D2.** Sticky wild for N spins (Zeus stacked wilds)
- **D3.** Walking / drop-and-stick wild (Witchcraft style)
- **D4.** Multi-direction expanding wild (Pattern-CL II style)
- **D5.** Shapeshifter / mutating wild (NOVEL — flag if found)

### E. Cascade / tumble family
- **E1.** Standard tumbling cascade (Gonzo style)
- **E2.** Win-both-ways cascade with multiplier ladder (Sweet Bonanza)
- **E3.** Cluster pays with cascade (Reactoonz style)
- **E4.** Avalanche reactor with wave threshold (Quantum Leap style)
- **E5.** Cascade meter charge-up (Hacksaw Stack 'Em)

### F. Progressive jackpot family
- **F1.** Must-Hit-By single-tier (mystery progressive)
- **F2.** Multi-tier WAP (Wide Area Progressive — Megabucks style)
- **F3.** Level progression jackpot (Mega Moolah style with hard cap)
- **F4.** Hold & Spin with progressive grand triggered by grid-fill
- **F5.** Reel-bound mystery prog (Quick Hit reel-bound style)

### G. Ways / lines / paylines structures
- **G1.** 25/40/50 fixed paylines
- **G2.** 243 / 720 / 1024 ways
- **G3.** Megaways (variable reel height)
- **G4.** Cluster pays (8+ adjacent symbols, no paylines)
- **G5.** Bi-directional ways (left + right matching)

### H. Bonus games
- **H1.** Pick & click (single-stage)
- **H2.** Multi-stage pick tree
- **H3.** Wheel bonus (single spin)
- **H4.** Trail / board progression (Konami Stairway style)
- **H5.** Mini-slot inside bonus (Lord of the Rings: Two Towers tower-spin)

### I. Compliance / regulatory mechanics
- **I1.** UK Class III B3 cycle (compensated math)
- **I2.** AU NCPF Schedule 4 (chase-pattern detection)
- **I3.** JP Pachislot 風営法 cap (skill-stop near-miss inflation)
- **I4.** AGCO Slot Standards 2024 §5.7

---

## Our Current Coverage (the catalog KIMI must cross-reference against)

KIMI: read `docs/INDUSTRY_PATTERN_CATALOG.md` for the full P-001..P-081
list. The short summary by family:

| Family | Our P-IDs (sample) | Coverage |
|---|---|---|
| A. Hold & Spin / Cash Collect | P-002, P-049, P-060, P-076 | Strong on A1/A4/A5; A2 partial (W134 H&W multi-tier); A3 weak |
| B. Free Spins | P-014, P-049, P-061, P-066, P-068, P-074, P-081 (NEW) | Solid; B3 just landed W179; B5 weak |
| C. Multipliers | P-053, P-057, P-062, P-063, P-065, P-067 | Strong |
| D. Wilds | P-051, P-058, P-059, P-064, P-076 | D5 mutating wild is GAP |
| E. Cascade / Tumble | P-052, P-055, P-077, P-080 | Strong post-W178 milestone |
| F. Jackpots | P-003, P-046, P-047, P-048, P-049 | Solid |
| G. Ways/lines | P-001, P-054, P-056 | Megaways covered (W112) |
| H. Bonus games | P-022, P-023, P-024, P-044, P-072, P-079 | Strong |
| I. Compliance | P-075, P-078 (anti-near-miss + AWP cycle) | Coverage growing |

KIMI: produce a final coverage matrix:

```
| Vendor B Title | Feature taxonomy | Our P-ID(s) | Gap? | Priority |
|---|---|---|---|---|
| Pattern-LL Sahara Gold | A1 + B1 + F4 | P-002 + P-014 + P-049 | NO | n/a |
| Quick Hit Platinum | F5 (reel-bound mystery prog) | partial — need new kernel | YES | HIGH |
| Wonder 4 Boost | C1 (global game-state multiplier) | NONE | YES | HIGH |
| Madonna | D5? + B1 | possible D5 gap | YES | MED |
| ... |
```

---

## Output Format Required from KIMI

A single markdown document with:

1. **Confirmed Vendor B brand roster** (with acquisition years + parent-company status)
2. **Top 40+ titles** with full taxonomy classification + GGR proxy rank
3. **Coverage matrix** (table above) — every gap explicitly flagged
4. **Prioritized backlog** of **kernel gaps** sorted by:
   - Number of Vendor B titles blocked by each gap (more titles → higher priority)
   - Jurisdictional spread (UK + US + AU title → higher than US-only)
   - Recency of title (post-2023 release → higher)
5. **Recommended Wave numbering** for W181-W200 covering the gaps
6. **Sources cited** for every claim (SlotCatalog / VegasSlotsOnline /
   AskGamblers / SlotsLaunch URLs, plus Vendor B official press releases)

Target output length: 4000-6000 words, dense, no fluff.

---

## What KIMI must NOT do

- Do not speculate about commercial terms / pricing / contracts.
- Do not include subjective game-review content ("this slot is fun").
- Do not invent feature mechanics that aren't documented somewhere.
  If a mechanic is unclear, mark it `[UNVERIFIED]` and cite the source.
- Do not duplicate existing P-IDs in the gap list.

---

## Deliverable Path

Save KIMI's output to:
`docs/research/KIMI_LW_PORTFOLIO_COVERAGE_<YYYY-MM-DD>.md`

After receiving, I (Corti) will:
1. Convert each gap into a concrete Wave plan (math kernel sketch + acceptance config skeleton)
2. Re-sort backlog by priority
3. Start executing W181+ in priority order

---

**End of brief. Paste verbatim into KIMI deep-research mode.**
