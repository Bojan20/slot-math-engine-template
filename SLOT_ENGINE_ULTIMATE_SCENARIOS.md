# SLOT-MATH-ENGINE — ULTIMATE SCENARIO & GAP MATRIX

> **Cilj:** matematički bulletproof + najbrži ikada + 100% game-coverage simulator za **svaku** vrstu slot igre koja postoji ili može postojati u industriji.
> Ovaj dokument je **iscrpna mapa** svih mehanika, edge case-ova, matematičkih klopki i performanse-rupa koje engine MORA da pokrije pre nego što proglašava "universal".

---

## 0. Filozofija

Tri stuba na koja sve staje:

1. **Exactness-first, MC-second.** Gde god je analitički RTP izračunljiv (paylines + scatter + clean cascade ground truth) — daj ga **closed-form**; Monte Carlo služi samo za feature-heavy nelinearne delove (H&W, lightning, picks, stateful FS). MC je verifikacija, ne istina.
2. **Determinizam je zakon.** Isti config + isti seed → isti svaki bit izlaza, **kroz sve jezike** (TS, Rust, eventualno GPU). RNG mora biti bitwise-identičan ili explicit-bridge.
3. **Konfiguracija je program.** Svaka mehanika je **deklarativni node** u grafu evaluacije. Hardkodovani feature-i = mrtav engine. Sve što je zakucano u kod = bug.

---

## 1. TAKSONOMIJA SLOT IGARA — sve što postoji

### 1.1 Reel topologije

| Tip | Opis | Engine treba | Status |
|---|---|---|---|
| **Klasičan 3-reel** | 3×3, 3×1, 3×3 sa Hold-om | reel-strip + lines | ✅ |
| **5-reel video** | 5×3 / 5×4 | reel-strip | ✅ |
| **6-reel / 7-reel** | 6×4, 6×5, 7×7 | reel-strip variabilan W×H | ⚠️ samo 5×3 testiran |
| **Asymmetric grid** | 3-4-5-4-3 (npr. Cleopatra) | per-reel height | ❌ |
| **Megaways™** | 2–7 simbola po reel-u random | dinamička visina + 6-th horizontalni reel | ❌ |
| **Hyperways / InfiniReels** | reel se širi dok ima win | recursive reel expansion | ❌ |
| **Reel-in-reel** | npr. Lightning Box Dragon Pearls | nested grid | ❌ |
| **Spinning wheel / Carousel** | Mystery, Wheel-of-Fortune bonus | wheel evaluator (single index) | ❌ |
| **Cluster grid** | 6×5, 7×7, 8×8 cluster pays | grid (no reels conceptually), ali strip-driven | ❌ |
| **Cascade / Avalanche / Tumbling** | Win → uklanja → padaju novi | cascade orchestrator + per-cascade reel | ⚠️ stub |
| **Rolling reels** | strip se pomera za 1 umesto re-spin | strip cursor state | ❌ |
| **Linked reels** | 2+ reel-a se vrte zajedno | reel-set sa shared cursor | ❌ |
| **Mystery reel** | celi reel = isti simbol | mystery transform layer | ❌ |
| **Expanding reels (Big Time Gaming)** | grid raste pri win-u | dynamic grid resize | ❌ |
| **Split reels / Dual reels** | 1 pozicija = 2 simbola | virtual position multiplier | ❌ |
| **Stacked reels** | full-stack simboli | stack metadata na stripu | ⚠️ |
| **Synced reels** | 2-5 reel-a uvek isti simbol | sync constraint | ❌ |

### 1.2 Modeli evaluacije win-a

| Tip | Primer | Engine API |
|---|---|---|
| **Fixed paylines (L→R)** | 5/10/20/25 lines | ✅ |
| **Both-ways (L→R + R→L)** | Starburst | dvostruka evaluacija | ❌ |
| **All-ways / X-ways** | 243, 720, 1024, 3125 | ways-evaluator | ❌ |
| **Megaways** | 117,649 max | ways × per-reel-symbols | ❌ |
| **Cluster pays** | 5+ adjacent (flood-fill) | union-find cluster engine | ❌ |
| **Pay-anywhere scatter** | 8+ bilo gde | count-evaluator | ✅ |
| **Pay-adjacent** | bez linija, samo komšije | adjacency graph | ❌ |
| **Pattern pays** | tačno definisani oblici | pattern matcher | ❌ |
| **Lines + scatter hybrid** | većina klasičnih | ✅ |
| **Win-double (Big Bass style)** | level-based multiplikatori | per-symbol state | ❌ |

### 1.3 Simboli — taksonomija

| Simbol | Ponašanje | Status |
|---|---|---|
| HP / LP standard | osnovni paytable | ✅ |
| **Wild standard** | substitutuje sve osim scatter | ✅ |
| **Expanding wild** | popunjava ceo reel pri pojavljivanju | ❌ |
| **Sticky wild** | ostaje N spinova | ⚠️ FS only |
| **Walking / Shifting wild** | pomera se reel-po-reel | ❌ |
| **Stacked wild** | full-stack pre-stripped | ⚠️ |
| **Wild × Multiplier** | nosi 2×/3×/5×/100× | ❌ |
| **Wandering wild** | random pozicija svaki spin | ❌ |
| **Wild reel (whole reel)** | ceo reel = wild | ❌ |
| **Wild on demand** | trigger-based wild placement | ❌ |
| **Scatter (anywhere pay)** | plaća bez linije | ✅ |
| **Scatter (trigger only)** | samo aktivira feature | ✅ |
| **Bonus symbol** | trigger samo, ne plaća | ✅ |
| **Mystery symbol** | reveal → jedan simbol | ❌ |
| **Coin / Money symbol** | nosi vrednost (H&W) | ✅ |
| **Jackpot symbol** | direkt jackpot trigger | ❌ |
| **Multiplier symbol** | globalni multiplier add/mul | ❌ |
| **Collect symbol** | sakuplja vrednosti iz grida | ❌ |
| **Upgrade symbol** | unapređuje simbol na grid-u | ❌ |
| **Split symbol (2-in-1)** | jedna pozicija = 2 simbola | ❌ |
| **Mega symbol (2×2 / 3×3)** | colossal | ❌ |
| **Colossal symbol (full screen)** | 5×5 jedan simbol | ❌ |
| **Linked symbols** | mora se "pojave zajedno" | ❌ |
| **Persistent symbol** | ostaje između sesija (sticky game state) | ❌ |
| **Lightning symbols** | numeric value, Lightning Link | ❌ |
| **Prize / Cash-on-reels** | direktna isplata na grid-u | ❌ |
| **Transforming symbol** | menja u drugi simbol pod uslovom | ❌ |
| **Chained / Linked-pay** | susedi povezuju isti simbol | ❌ |
| **Sticky multiplier** | mult koji se zadržava | ❌ |
| **Reactor / Bomb symbol** | uklanja zonu (3×3) | ❌ |

### 1.4 Feature taksonomija

| Feature | Status |
|---|---|
| Free Spins (basic) | ✅ |
| FS + globalni multiplier | ✅ |
| FS + retrigger | ✅ |
| FS + ekspanzioni multiplier (Sweet Bonanza) | ❌ |
| FS + sticky wilds | ⚠️ |
| FS + extra reels / rows | ❌ |
| FS + persistent state (cumulative) | ❌ |
| FS + win-both-ways switch | ❌ |
| **Hold & Win / Hold & Spin** | ✅ |
| H&W + level progression (Mini→Grand) | ⚠️ |
| H&W + reset on no-new | ⚠️ |
| H&W + collect feature | ❌ |
| **Cascade / Avalanche** | ⚠️ stub |
| Cascade + ekspanzioni multiplier | ❌ |
| Megaways + cascade | ❌ |
| **Mystery reveal** | ❌ |
| **Symbol upgrade** | ❌ |
| **Symbol collection** | ❌ |
| **Respins (single)** | ❌ |
| Sticky respins (re-spin until no new) | ❌ |
| Walking-wild respins | ❌ |
| **Pick bonus** (interactive) | ❌ |
| **Wheel bonus** | ❌ |
| **Bonus game** (mini-game) | ❌ |
| **Mystery box / Mystery prize** | ❌ |
| **Buy feature** (Feature Buy) | ❌ |
| **Ante bet / Bet boost** | ❌ |
| **Gamble (double-or-nothing)** | ❌ |
| **Side bet** | ❌ |
| **Hot/Cold modes** | ❌ |
| **Anti-streak / smart compensation** | ❌ |
| **Tournament mode** | ❌ |
| **Crash / multiplier-only** (non-reel) | ❌ |
| **Megaclusters (BTG)** | ❌ |
| **Drop-the-pop** | ❌ |
| **Hold & Roll dice features** | ❌ |
| **Lightning / Cash Connection** | ❌ |
| **Money cart / Bonanza Billion** | ❌ |
| **Powerball / pot scoop** | ❌ |

### 1.5 Jackpot sistemi

| Tip | Engine treba | Status |
|---|---|---|
| Fixed jackpot | konstantna isplata | ⚠️ |
| Mystery progressive | random trigger pri uslovu | ❌ |
| Must-hit-by progressive | upper-bound trigger | ❌ |
| Multi-level progressive (Mini/Minor/Major/Grand/Mega) | tier orchestrator | ❌ |
| Standalone progressive | seed + contribution stream | ❌ |
| Local linked | inter-machine sync | ❌ |
| Wide-area progressive | network-driven | ❌ |
| Lightning Link / Cash Connection | persistent + tier | ❌ |
| Pots of Gold / wheel pick | pick-game eval | ❌ |
| Jackpot ladder | tier escalation | ❌ |
| Time-based jackpot | wall-clock or spin-count | ❌ |
| Banked / compensated | "owed" pool | ❌ |

---

## 2. MATEMATIKA — sve klopke

### 2.1 Numerička preciznost

| Problem | Posledica | Rešenje |
|---|---|---|
| **f64 drift na 10⁹+ spins** | RTP odstupa od teorije | BigInt akumulator za `winCredits`, `winSquared` (✅ delimično) |
| **f64 za probability** | sum != 1.0 | `Decimal.js` 50-digit (✅) + Rust `rust_decimal` (❌) |
| **Modulo bias na RNG** | non-uniform sample | rejection sampling, ne `rng % N` |
| **Round-half-up vs banker** | inconsistent payout | dokumentovan i fiksiran u config-u |
| **Rational vs float weights** | reel weight sum ≠ stripLen | force integer weights, validate `sum == strip.length` |
| **Catastrophic cancellation u variansi** | negative variance | Welford online (✅ proveriti) ili Kahan summation |
| **Cross-language float divergence** | TS ≠ Rust ≠ GPU | ban transcendentals u hot path; ili explicit f32→u32 bridge |
| **Underflow malih verovatnoća** | p < 1e-308 → 0 | log-space, scaled bigint |
| **Combinatorial overflow** | 117k× ways = bigint | u64 ili bigint za enumeraciju |

### 2.2 RNG

| Problem | Trenutno | Treba |
|---|---|---|
| Mulberry32 period = 2³² | ✅ u TS i Rust | **Premali za >4G spins** |
| Statistički kvalitet | OK za 10⁹ | **TestU01 BigCrush za certification** |
| Cross-language identičnost | ✅ verified | drži kao zlato |
| Splittable RNG za paralelno | ❌ koristimo seed offset | **SplitMix64 → Xoshiro256** ili PCG |
| GLI-19 compliance | nije evaluiran | mora **NIST SP800-22** ili equivalent |
| Reproducibility cross-platform | ✅ za x64 | **proveriti ARM** (M1/M2/M3) — endianness OK ali wrapping_mul? |
| Seed exhaustion (32-bit) | rizik | **upgrade na 64-bit state** |

**Preporuka:** dual-track RNG — Mulberry32 za "match TS legacy", PCG-64 ili Xoshiro256** kao **default** za sve nove igre + certification.

### 2.3 RTP — closed-form vs MC

| Komponenta | Closed-form moguć? | Trenutno |
|---|---|---|
| Base game lines | ✅ uvek (enumeracija reel strip-ova) | ❌ samo MC |
| Scatter pay-anywhere | ✅ (multinomial) | ❌ samo MC |
| FS sa fixed param | ✅ Markov chain | ❌ samo MC |
| FS sa retrigger | ✅ geometric expectation | ❌ |
| H&W (fixed trigger) | ⚠️ semi-analytic (kombinatorika coins) | ❌ |
| Cascade | ⚠️ Markov (state = preživeli simboli) | ❌ |
| Megaways | ❌ MC obavezan (visok state space) | n/a |
| Picks/wheels | ✅ trivijalan EV | ❌ |
| Multi-level jackpot | ✅ tier probabilities | ❌ |

**Cilj:** "engine ti kaže **teoretski RTP** sa 12 decimala čim učita config." MC je samo confidence interval check.

### 2.4 Variance, volatilnost, distribucije

| Metric | Status |
|---|---|
| Mean (RTP) | ✅ |
| Variance / SD | ⚠️ Welford OK |
| Skewness | ❌ |
| Kurtosis | ❌ |
| Coefficient of variation | ❌ |
| **Volatility Index (10⁵ × σ / μ²)** | ❌ — GLI standard |
| Hit frequency per feature | ⚠️ |
| Bonus contribution % to RTP | ⚠️ |
| Max win frequency | ❌ |
| Win distribution histogram (buckets) | ⚠️ rust ima |
| 95% / 99% / 99.9% confidence intervals | ❌ |
| P(win > X) cumulative | ❌ |
| Expected hit count per N spins | ❌ |
| Time-to-bonus distribution | ❌ |
| Bonus-to-bonus distance histogram | ❌ |

### 2.5 PAR sheet (regulatorni obavezan)

| Polje | Status |
|---|---|
| Theoretical hold % | ⚠️ |
| Hit frequency | ⚠️ |
| Average win per spin | ⚠️ |
| Volatility index | ❌ |
| Bonus frequency | ⚠️ |
| Bonus contribution | ⚠️ |
| Max payout multiplier | ⚠️ |
| Min/max bet | ✅ config |
| Symbol weights per reel | ✅ |
| Stop probability per reel position | ❌ |
| Win-frequency distribution table | ⚠️ |
| Confidence interval at 1B / 10B spins | ❌ |
| 95% RTP band | ❌ |
| Cycle length (LCM od strip-ova) | ❌ |
| Max win expected frequency | ❌ |
| Bonus EV breakdown | ❌ |
| PAR sheet PDF export | ❌ |

---

## 3. EDGE CASES — pun spisak

### 3.1 Numerički

- Division by zero u: scatter weight, hit-rate kad nema hit-a, average payout kad nema win-a.
- f64 sum ≠ 1.0 nakon 10⁶ adicija → koristiti `1.0 - sum(others)` pattern.
- BigInt → Number gubitak preciznosti na variansi (✅ rešeno).
- Negative variance iz numeričkog šuma → clamp na 0.
- log(0), log(-x) — guard.
- Probability product underflow (10⁻³⁰⁰⁰) → log-space.

### 3.2 Konfiguracijski

- Reel strip kraći od grid visine → guard.
- Paytable referencira non-existent simbol → schema validation (✅ delimično).
- Scatter trigger count > total scatter na stripovima → unreachable feature.
- Sum weights na wheel-u ≠ 100 / nije konzistentan → normalizovati ili reject.
- Cycle count (Π stripLen) preko bigint → guard.
- FS multiplier × retrigger × base-multiplier kombinatorna eksplozija → cap-and-warn.
- Max win cap niži od jednog teorijskog hit-a → unreachable.
- Megaways high reel = 7 ali strip nema 7 stack-ova → unreachable depth.

### 3.3 Logika feature-a

- FS retrigger tokom poslednjeg FS spina — da li ulazi u brojač?
- H&W trigger tokom H&W — re-entry? (obično ne, ali config-defined)
- Cascade infinite loop ako wild × wild generiše wild → cycle detector / hard cap.
- Pick bonus sa 0 valid pick-ova → fallback path.
- Wheel sa svim "lose" segmentima → mora postojati min EV guarantee.
- Mystery reveal koji otkriva scatter — da li može retrigger?
- Sticky wild + cascade — kako ostaje?
- Megaways win evaluation kad reel ima 1 simbol → ways = 1 × ostalo.
- Both-ways evaluation sa istom linijom — duplo plaća? (industrija: zavisi od igre)

### 3.4 RNG / determinizam

- Paralelizam menja redosled — sums asocijativni samo do f64 preciznosti.
- Seed = 0 → degenerate state za neke RNG-ove.
- Worker thread crash → resume sa istog seed-a.
- Cross-platform: ARM big.LITTLE schedulers menjaju redosled, ne i rezultat (mora biti tako).
- WASM build različit od native — proveriti.

### 3.5 Performance

- Hot loop alocira Vec<u8> svaki spin → arena allocator.
- Megaways: 117,649 ways × line eval = puna iteracija → bitmask short-circuit.
- Cascade Markov state može da bude eksponencijalan → ograničiti.
- Cluster pays = union-find po grid-u svaki cascade — preallocate disjoint-set.
- JSON config parse svaki spin (loš design) — parse once, share Arc.

### 3.6 Regulatorni

- GLI-11 zahteva: deterministička isplata po datom grid-u (no random tie-break).
- "Compensated" vs "non-compensated" math — engine mora moći oba.
- Min RTP (npr. UK 85%, Italy 90%, NL 92.5%) — config-time validation.
- Max payout (npr. UK £250k slot cap) — engine cap layer.
- Auto-play limits — orthogonal ali engine treba state za broj spinova.
- "Bonus must complete on losing all stake" math — specific rule.

---

## 4. PERFORMANSA — gde dobijamo redove veličine

### 4.1 Trenutno

- Rust + Rayon: ~50-200M spins/sec na M2 (single 5×3 game, lines only).
- TS Node: ~2-5M spins/sec.

### 4.2 Tehnike za **najbrži ikada**

| Tehnika | Speedup očekivan | Status |
|---|---|---|
| **SIMD vectorization (AVX-512 / NEON)** | 4-16× | ❌ |
| **Bitpacked grid (u128 = 5×5 grid)** | 2-5× | ❌ |
| **Lookup table za male reel-ove** | 10-100× za enumerable | ❌ |
| **Closed-form RTP (skip MC)** | ∞× | ❌ |
| **GPU compute (CUDA / Metal / Vulkan)** | 50-500× | ❌ |
| **Branch-free evaluators** | 2-3× | ⚠️ |
| **Arena / bump allocator** | 1.5-3× | ❌ |
| **Lock-free atomic stats (✅)** | 2× već uradjeno | ✅ |
| **Hot/cold split u struct layout-u** | 1.2-1.5× | ❌ |
| **Const-eval kombinatorike na compile-time** | varies | ❌ |
| **Inline reel strip u code (per-game build)** | 1.5× | ❌ |
| **mmap reel strip-ova za huge configs** | n/a obično | ❌ |
| **CPU cache prefetch hints** | 1.1-1.3× | ❌ |
| **PGO / BOLT** | 10-30% | ❌ |
| **Profile-driven inlining ključnih staza** | varies | ❌ |

**Target:** **1B spins/sec** na single M-series chip za 5×3 lines, ~100M/sec za Megaways.

### 4.3 GPU strategija

- CUDA kernel: 1 thread = 1 spin, grid = millions.
- RNG: counter-based (Philox, Threefry) → savršen za GPU.
- Constraint: paytable mora stati u shared memory (4-16 KB) — svi standardni stane.
- Cascade / stateful features: thread divergence problem → batched approach.
- Validation: GPU result mora match-ovati CPU bit-for-bit za istu seed sekvencu (ili dokumentovani delta).

---

## 5. ARHITEKTURALNE RUPE — sve što ne valja u trenutnom design-u

### 5.1 Hardkodovano što ne sme da bude

- Feature evaluacija u TS je if/else po feature kind (✅ delimično data-driven, ali H&W i FS imaju zakucanu logiku).
- Mulberry32 je default — treba **RNG plugin layer**.
- BASE_REELS / FREE_SPINS_REELS kao TS const — treba sve iz config JSON.
- `NUM_REELS = 5` const — treba dynamic.
- Paytable struktura pretpostavlja line pay — ways/cluster mora biti **prvi-klas**.
- Symbol enum (HP_*/LP_*/WILD/SCATTER/BONUS) — treba **arbitrary symbol IDs** (igra može imati 20+ simbola).
- TS i Rust imaju **dva** evaluatora — DRY problem.

### 5.2 Šta nedostaje kao **first-class**

- **Game DSL / IR** — config bi trebao da bude *grammar*, ne JSON klamfa.
- **Symbol behavior interface** — `OnLanding(grid, pos) -> Effects[]`.
- **Effect pipeline** — multiplier_add, multiplier_mul, expand_reel, collect, transform.
- **Cascade orchestrator** — re-evaluate loop with state.
- **Picker / interactive bonus eval** — even if MC-driven, treba framework.
- **Jackpot manager** — multi-tier, contribution, must-hit-by.
- **State machine za feature stacking** — FS u H&W u FS itd.

### 5.3 Testing rupe

- Nema property-based testova (proptest / fast-check).
- Nema differential testa TS vs Rust **po spinu** (samo aggregate RTP).
- Nema fuzz testa za config (malicious JSON crashing engine).
- Nema known-answer tests sa publikovanih PAR sheet-a (Cleopatra, Starburst itd.).
- Nema regression suite — RTP može diftati nakon refactora i niko ne primeti.
- Nema performance regression test.

### 5.4 Toolchain rupe

- Nema **config builder UI** (web tool za design slot-a).
- Nema **PAR sheet generator** (auto-PDF).
- Nema **certification report** (GLI format).
- Nema **simulator dashboard** (real-time RTP graph).
- Nema **reel strip optimizer** (target RTP → suggested weights).
- Nema **convergence detector** (kada MC dovoljno za N significant digits).

---

## 6. FUTURISTIČKI / "10-godina-napred" feature-i

- **Auto-tuner**: zadaš target RTP + volatilnost + hit-rate → engine generiše reel stripove.
- **Differential privacy player simulator** — modeluje player behavior, ne samo math.
- **ML-driven anti-fraud** — flag-uje sumnjive spin sequence-e.
- **Quantum-RNG ready** (skin za bilo koji entropy source).
- **Verifiable computation** — zk-SNARK proof da spin nije nameštan (relevantno za crypto-casino).
- **Online RTP monitor** — real-time hash-chain spin log + RTP confidence.
- **Cross-game wallet math** — engine zna o multi-game progresivima.
- **A/B math testing framework** — dve verzije iste igre, RTP-equivalent ali volatilnost-different.
- **Auto-generated GLI certification PDF**.
- **Format converters** — import sa Playtech / Microgaming / NetEnt config dijalekata.

---

## 7. PRIORITY MATRIX

| Težina | Impact | Stavka |
|---|---|---|
| 🔥 P0 | bulletproof | Closed-form RTP za base + scatter (TS+Rust) |
| 🔥 P0 | universal | Generic Symbol IDs + arbitrary count |
| 🔥 P0 | universal | Ways / Megaways / Cluster evaluatori |
| 🔥 P0 | universal | Cascade orchestrator (proper, ne stub) |
| 🔥 P0 | bulletproof | Differential testa TS↔Rust per-spin |
| 🔥 P0 | bulletproof | TestU01 BigCrush RNG certification |
| 🔥 P0 | speed | SIMD lines/ways evaluator (Rust) |
| 🔥 P1 | universal | Symbol behavior plugin layer (expanding, sticky, multiplier, etc.) |
| 🔥 P1 | universal | Multi-level jackpot manager |
| 🔥 P1 | universal | Feature stacking state machine |
| 🔥 P1 | bulletproof | Property-based testing + fuzzing |
| 🔥 P1 | speed | GPU backend (Metal first — dev mašina) |
| 🟡 P2 | UX | Web config builder |
| 🟡 P2 | regul | PAR sheet PDF generator |
| 🟡 P2 | speed | PGO + BOLT build pipeline |
| 🟢 P3 | future | Auto-tuner |
| 🟢 P3 | future | zk-SNARK proof layer |

---

## 8. DEFINITION OF "DONE-UNIVERSAL"

Engine je univerzalan kada može da implementira sledećih **20 reference igara** iz config-a, sa RTP-om koji se poklapa sa publikovanim PAR sheet-om (±0.05% nakon 10⁹ spins):

1. **Starburst** — both-ways, expanding wild, respins
2. **Cleopatra** — asymmetric pay, scatter mult
3. **Sweet Bonanza** — cluster cascade, mult symbols
4. **Gates of Olympus** — pay-anywhere, mult collect, ante-bet, buy-feature
5. **Big Bass Bonanza** — money symbol collect FS
6. **Bonanza** — Megaways + cascade + unlimited multiplier
7. **Book of Dead** — expanding symbol FS
8. **Wolf Gold** — Hold & Win multi-jackpot
9. **Money Train 3** — persistent multiplier + symbol upgrade FS
10. **Reactoonz** — cluster cascade + charge meter + side feature
11. **Dead or Alive 2** — sticky wilds multi-mode FS
12. **Mega Moolah** — multi-tier WAP jackpot wheel
13. **Mega Joker** — supermeter mode (state switch)
14. **Lightning Link** — money symbol + hold + multi-tier jackpot
15. **Dragon Link** — sa MTH (must-hit-by) jackpot
16. **Buffalo Stampede** — stacked wilds + bonus
17. **Cash Connection** — pseudo-must-hit + level progression
18. **88 Fortunes** — pick bonus + multi-level
19. **Aviator-like crash** (non-reel) — kao corner case
20. **Fishin' Frenzy Megaways** — money collect + Megaways + cascade

Kad svih 20 prolazi: **DONE-UNIVERSAL**.

---

## 9. ZAKLJUČAK

Trenutni engine je solidan **template** za 5×3 lines + FS + H&W. Univerzalan **nije**. Da bismo stigli do "best ever":

1. **Rewrite config-as-IR** (deklarativni AST umesto JSON-klamfe).
2. **Plugin layer za symbol behavior i feature kinds**.
3. **Closed-form RTP first, MC as confidence**.
4. **SIMD + GPU za speed**.
5. **20 reference igara kao acceptance test**.
6. **Property tests + fuzzing + RNG certification**.

Procena: 8-14 nedelja punog rada za univerzalan + bulletproof, +4-8 za speed-record.
