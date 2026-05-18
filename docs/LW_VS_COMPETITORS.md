# Slot Math Engine Platform — Honest Competitive Comparison

**Audience:** L&W M&A team, CTO, CFO, board
**Purpose:** an honest, well-sourced comparison vs the platforms L&W competes with today. We are not slandering peers. We are stating what each platform optimizes for, where we are stronger, where we are not, and where the strategic moat is.
**Last updated:** 2026-05-18 (Wave 210 baseline)

---

## 1. Peer set

We compare against five reference platforms:

1. **Aristocrat** — Lightning Link / Dragon Link / Buffalo / Wonder 4. Land-based + iGaming.
2. **IGT** — Dynamic Reels / DJ Wild / Wheel of Fortune. Land-based + iGaming.
3. **Pragmatic Play** — BetterPlay engine, licensed Megaways. Pure iGaming.
4. **Hacksaw Gaming** — Hacksaw Math Engine, in-house. iGaming, ultra-volatile niche.
5. **L&W internal pipelines** — Bally / WMS / Barcrest / Shuffle Master / Lightning Box studios.

Notes:
- Public detail on competitor math engines is scarce. Where we lack a clean citation, we say "est." for estimated and explain the inference.
- We measure on **published surface area** + **certificate dossier behavior** + **multi-tenant + marketplace capabilities** + **regulator support**.
- We do not measure on title catalog size or revenue — those are products of L&W's existing distribution, not engine capability.

---

## 2. Eight dimensions

We compare on eight dimensions that matter for an L&W acquisition decision:

| # | Dimension | Why it matters for L&W |
| --- | --- | --- |
| 1 | Math coverage (closed-form solver count) | Predicts how many titles can be ported without engineering. |
| 2 | Cert speed (dossier generation time) | Cuts cert cycle from weeks to minutes. |
| 3 | Multi-tenant isolation | Lets L&W operate the platform for partners. |
| 4 | Marketplace ecosystem | Flips cost structure: from 12 studios fully loaded to platform fees. |
| 5 | Open audit (test surface, mutation score, lint, docs) | De-risks regulator review. |
| 6 | Mobile + cabinet HW | Reach across L&W's distribution. |
| 7 | Pricing model | Determines unit economics of every new title. |
| 8 | Pilot path | Determines how fast L&W can validate the bet. |

---

## 3. Matrix at a glance

Legend: ✅ strong / ⚠ partial / ❌ gap / 🟦 substantively differentiated.

| Dim | Aristocrat | IGT | Pragmatic | Hacksaw | L&W internal | Slot Math Engine |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 · Math coverage | ⚠ (~32 est.) | ⚠ (~28 est.) | ⚠ (~22 est.) | ❌ (~14 est.) | ⚠ (mixed per-studio) | 🟦 ✅ **77** |
| 2 · Cert speed | ❌ weeks | ❌ weeks | ⚠ days | ⚠ days | ❌ weeks | 🟦 ✅ **200 ms** |
| 3 · Multi-tenant | ❌ | ❌ | ⚠ | ⚠ | ❌ (single-vendor) | 🟦 ✅ 3-ring isolation |
| 4 · Marketplace | ❌ | ❌ | ⚠ partner program | ❌ | ❌ | 🟦 ✅ SDK + 70/30 + JWT |
| 5 · Open audit | ❌ closed | ❌ closed | ⚠ partial dossier | ⚠ partial dossier | ⚠ internal-only | 🟦 ✅ 7,000+ tests, 100 CI gates |
| 6 · Mobile + cabinet | ✅ (LightWave et al) | ✅ (Crystal Curve) | ✅ HTML5 | ✅ HTML5 | ✅ LightWave | ⚠ HTML5 only (cabinet HW out of scope) |
| 7 · Pricing | per-title license | per-title license | per-title license + rev share | per-title license + rev share | internal cost-allocated | platform license / acquire / JV |
| 8 · Pilot path | proprietary | proprietary | partner program | partner program | n/a | 🟦 ✅ Day 0 → Day 30 documented |

---

## 4. Dimension-by-dimension detail

### 4.1 Math coverage

**Aristocrat** — public patent filings + GLI dossier titles suggest ~30 distinct math kernels. Strongest in hold-and-spin (Lightning Link series, Buffalo Link) and quad-screen (Wonder 4 platform). Closed-form math published for tier-jackpot triggers; weak public footprint on cascade / Megaways-class variance.

**IGT** — Wheel of Fortune mystery progressive lineage gives them strong jackpot math; Cleopatra-class line + ways evaluator; DJ Wild high-vol expansion math. Estimated ~28 kernels. Less innovation in cascade / sticky-multiplier-trail families.

**Pragmatic Play** — BetterPlay engine ships Sweet Bonanza tumble, Big Bass Wald-style, Wolf Gold lock-and-spin, John Hunter cascade. Licensed Megaways via BTG. ~22 kernels estimated. Heavy on tumble + Wald compound; lighter on jackpot tier and AWP cycle.

**Hacksaw Gaming** — extreme-volatility specialist. Strong cascade + multiplier ladder (RIP City, Stack 'Em, Tombstone, Money Cart 4). ~14 kernels estimated. Niche but excellent within niche.

**L&W internal pipelines** — Bally/WMS/Barcrest/Shuffle Master each have their own math toolchains. No unified solver catalog; cross-studio math reuse is manual. We estimate the union of L&W internal coverage at ~40–50 closed-form solvers, but heavily duplicated across studios.

**Slot Math Engine Platform** — **77 closed-form solvers**, every name published in `docs/INDUSTRY_PATTERN_CATALOG.md`. CI portfolio gate fails if any solver regresses. Industry-firsts include: Bachelier first-passage bankroll math (W157/W161), Inverse Gaussian session analyzer, AWP cycle convergence formula (W167), exact-enumeration ground-truth (W63/W68), multi-tier WAP jackpot share decomposition (W75), cascade meter charge-up trigger (W146).

**Verdict:** Slot Math Engine has roughly **2.5x** the published solver count of the next-largest peer and has explicit closed-form coverage of every L&W mechanic from the KIMI matrix (16/16).

### 4.2 Cert speed

**Aristocrat / IGT / L&W internal** — cert cycles are 6–12 weeks per (game, jurisdiction). Dossiers manually compiled from multiple internal teams. Re-cert on every paytable change.

**Pragmatic / Hacksaw** — partial automation. Days-not-weeks for the dossier compilation; cycle still gated by lab review.

**Slot Math Engine Platform** — `node scripts/cert-dossier-build.mjs --game=... --lab=GLI --jurisdiction=UKGC` returns a signed `.zip` in 200 ms. Lab review timeline is still bounded by the lab (3–12 weeks depending on lab), but the engine half collapses to a CI step.

**Verdict:** asymmetric. Slot Math Engine ships the dossier in 200 ms; competitors take days to weeks to assemble the same artifacts.

### 4.3 Multi-tenant isolation

**Aristocrat / IGT / L&W internal** — single-vendor. No public evidence of true multi-tenant isolation.

**Pragmatic / Hacksaw** — partner programs exist but the underlying engine is single-tenant.

**Slot Math Engine Platform** — 3-ring isolation (network + AsyncLocalStorage + HSM key partition + Merkle PAR per tenant). Pen-test scheduled. SOC2 Type 1 prep complete.

**Verdict:** this is the moat that unlocks L&W operating the platform for partners.

### 4.4 Marketplace ecosystem

**Aristocrat / IGT / L&W internal** — no marketplace.

**Pragmatic Play** — partner program for third-party studios; revenue share negotiated per-deal.

**Hacksaw Gaming** — proprietary studio model, no external author program.

**Slot Math Engine Platform** — full SDK (`docs/MARKETPLACE_API.md`), default 70/30 revenue split, cert-on-publish, HSM-signed license JWT, kill-switch on revocation. Six templates live (W209 baseline $25K Quick Hit Dragons). Author guide + revenue dashboard in deck.

**Verdict:** decisive. This is the lever that flips L&W's cost structure.

### 4.5 Open audit

**Aristocrat / IGT / L&W internal** — closed-source. Cert review accepts vendor attestations; no public test surface.

**Pragmatic / Hacksaw** — partial — dossiers published per jurisdiction; underlying tests not public.

**Slot Math Engine Platform** — 7,000+ test specs, 100 CI gates (Wave 190 century), mutation-score gate ≥ 90%, cargo clippy strict zero-warning, 4-OS parity nightly, exact-enumeration ground-truth solvers anchor every closed-form claim. All docs in plain markdown.

**Verdict:** decisive on regulator review speed.

### 4.6 Mobile + cabinet HW

**Aristocrat / IGT / L&W internal** — vertically integrated cabinet HW (LightWave / Crystal Curve / LightWave Bally). This is where the legacy vendors win and where Slot Math Engine does not compete.

**Pragmatic / Hacksaw / Slot Math Engine** — HTML5 / pure software. Cabinet HW is out of scope.

**Verdict:** L&W keeps its cabinet HW advantage. Slot Math Engine integrates with cabinet HW via standard HTML5/WebGL renderer. No L&W cabinet HW deprecation implied.

### 4.7 Pricing model

**Aristocrat / IGT** — per-title license fees, often six figures.
**Pragmatic / Hacksaw** — per-title license + revenue share (5–15%).
**L&W internal** — internal cost-allocated.

**Slot Math Engine** — three commercial options on the deck slide 10:
- **A · Acquire** $200M–$500M — full IP, 24-month founder retention.
- **B · License** $8M/yr + 3% revenue share — recommended starting position.
- **C · Partnership** JV equity 30–49% — co-developed, co-branded.

**Verdict:** Slot Math Engine prices as a platform (not per-title), which fundamentally changes L&W's unit economics.

### 4.8 Pilot path

**Aristocrat / IGT / L&W internal** — proprietary M&A approach; pilots are non-standard.
**Pragmatic / Hacksaw** — partner-program onboarding takes 1–3 months.

**Slot Math Engine** — explicit Day 0 → Day 30 timeline documented in deck slide 9 and Section 13 of the technical deep-dive. Math team retains veto authority at every gate.

**Verdict:** documented, bounded, low-cost-to-walk-away.

---

## 5. Where we are honestly weaker

We do not pretend to be perfect. Honest weaknesses:

- **Cabinet hardware** — we don't compete here. L&W's LightWave / Bally / WMS cabinet HW remains the customer-facing surface.
- **Live operator brand recognition** — Aristocrat / IGT / L&W brand pull is decades old. We are 16 weeks of waves. Pull only matters if you operate the marketplace; under Option A, L&W's brand carries.
- **Title catalog size** — we ship a platform, not 80 titles. L&W's catalog is the moat; the engine multiplies its throughput.
- **GSA / G2S protocol gateway** — we currently integrate via standard wallet provider APIs (`docs/WALLET_PROVIDERS.md`). G2S native is on the post-pilot roadmap.
- **Live dealer / RNG-free verticals** — not in scope. The engine is RNG slot math.
- **Single-team origin** — we are an emerging vendor. The 24-month retention in Option A directly addresses this.

---

## 6. Where the moat is

The moat is the **substrate**, not any single solver:

1. **IR-first workflow** — the math is the IR. The engine is the interpreter. Every other vendor couples math to binary; we decouple it once.
2. **Two-brain parity** — TS + Rust always agree. No vendor in this comparison has a published cross-language parity gate.
3. **Cert dossier as CI step** — 200 ms dossier generation, byte-deterministic across machines, signed by HSM Ed25519, regenerated from IR + commit hash for any audit ever.
4. **Open audit surface** — 7,000+ tests + 100 CI gates + mutation score ≥ 90% creates a regulator review accelerator.
5. **Multi-tenant + marketplace + revenue share** — the only platform in the matrix designed to be operated, not just used.

The acquisition argument is not "we have more solvers" — it's "we have the only platform that turns L&W from a slot vendor into a slot infrastructure operator."

---

## 7. Source notes

- Solver counts for peers are inferred from published GLI/eCOGRA dossiers, patent filings, developer interview transcripts, and slotcatalog.com / playusa.com / knowyourslots.com title rosters. They are estimates — competitors do not publish these numbers.
- Cert cycle timelines are from publicly disclosed cert lab averages (GLI, BMM, eCOGRA, NMi public materials).
- Multi-tenant claims rely on absence of public evidence to the contrary; peers may have internal multi-tenant capability we cannot verify.
- L&W internal pipeline estimates are based on the KIMI deep research (`docs/research/KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md`) plus public investor disclosures about studio counts.
- All Slot Math Engine numbers are reproducible from `npm test`, `cargo clippy`, `npm run portfolio:gate`, and `scripts/cert-dossier-build.mjs` in the pilot tarball.

---

## 8. One-line summary per peer

| Peer | One-line position |
| --- | --- |
| Aristocrat | Strongest hold-and-spin + quad-screen lineage; closed engine; cert weeks; no marketplace |
| IGT | Strongest jackpot mystery + WAP lineage; closed engine; cert weeks; no marketplace |
| Pragmatic | Strongest tumble + Wald cascade; partial dossier; partner program not marketplace |
| Hacksaw | Strongest extreme-vol niche; small team; partial dossier; no marketplace |
| L&W internal | Strong per-studio depth; cross-studio reuse manual; cert weeks; single-vendor |
| **Slot Math Engine** | **Substrate-first; cert minutes; multi-tenant + marketplace + 77 solvers + 16/16 L&W coverage** |

---

## 9. What L&W should test in the pilot

The fastest way to verify any of these claims is to take the pilot tarball, hand it to your math team, and have them:

1. Run `npm test` — confirm 7,000+ tests pass.
2. Run `npm run portfolio:gate` — confirm 77 solvers pass.
3. Pick three L&W titles. Port their IR. Compare RTP against your internal cert. Look for any discrepancy > 0.05pp.
4. Run `node scripts/cert-dossier-build.mjs --game=<title>` — confirm 200 ms dossier.
5. Read three random solver source files end-to-end. They are ~150 LOC each. If anything looks wrong, tell us — we owe you a fix.

Five steps. Two days. The pilot is structured so that the first 48 hours determine whether the rest of the 30 days is worth running. We're confident in the answer.

— Slot Math Engine Platform team
