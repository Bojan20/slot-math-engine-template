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

## 9. INTERMEDIATE WRAPUP

Sekcije 1–8 pokrivaju **igračku perspektivu** — mehanike i math kakve igrač i designer vide. Aristocrat / Light & Wonder / IGT / Pragmatic interno **ne staju tu** — imaju kompletan **server-side stack**, **jurisdikcijske dialekte**, **provably-fair audit layer**, **AML/RG mreže**, **observability sloj** i **proprietary IR formate**. Sekcije 10–18 dodaju to što velika firma stvarno treba, plus sloj iznad njih (futuristic) gde nijedna kompanija danas javno nije.

---

## 10. SERVER-SIDE / RGS MATH LAYER

Slot math nije sam u sebi — sedi unutar **Remote Game Server (RGS)** koji vodi transakciju. Velike firme imaju **dva mozga**: math engine (RNG + isplata) i game server (wallet + state + audit). Engine MORA da expose-uje API-je tako da se ovo radi bez "rupa".

### 10.1 Transakcioni integritet

| Zahtev | Industrija danas | Engine mora |
|---|---|---|
| **Atomic spin** | Aristocrat/L&W koriste two-phase commit (debit wager → spin → credit win) | API: `beginSpin(walletTxId) → spinId; commitSpin(spinId) ⇄ rollbackSpin(spinId)` |
| **Idempotency key** | duplicate request iste sesije ne sme da naplati 2× | `spinId = hash(playerSession, nonce)` deterministički |
| **Crash-mid-feature** | igrač u FS, server padne na spin 7/15 — mora da nastavi tačno odatle | `serializeFeatureState() → blob; resumeFromState(blob)` deterministički + isti seed-pos |
| **Wallet rollback** | ako server odbije win post-eval, engine mora da postoji bez side effect-a | engine je pure-function po definiciji (commit-flush je server posao) |
| **Network partition** kod WAP jackpota | igrač hit-uje Mega Moolah ali central server ne potvrđuje | engine vrati `PendingJackpot` koji se finalizuje van engine-a |
| **Hot wallet overflow** | operator nema cash za Mega Moolah trigger | engine emituje `JackpotPaymentRequired` event, ne crash |

### 10.2 Spin recall / replay (regulatorni)

Većina jurisdikcija zahteva da **bilo koji spin može da se reprodukuje 5+ godina kasnije**, bit-identično, kao dokaz da igra nije bila namjestena.

| Zahtev | Engine mora |
|---|---|
| **Spin signature** | hash(config_version, seed_chain, spin_index, math_version) — emituje se uz svaki rezultat |
| **Math version pinning** | spin recall mora da koristi **istu verziju matematike** koja je bila aktivna u trenutku originalnog spin-a |
| **Cross-version replay** | engine emituje compatibility shim — math v3.2 spin se može reprodukovati v3.3 engine-om uz `--replay-mode=v3.2` |
| **Audit hash chain** | svaki spin = `H(prev_hash, spin_data)` — hash chain se nedeljno svedoči ka regulatoru |
| **Forensic dump** | `slot-sim replay --spin-sig=...` rekonstruiše ceo grid + feature stack + final win |
| **Storage** | spin signature je 64 bytes / spin → 100M spinova/dan = ~6 GB/dan po stolu, S3 archival |

### 10.3 Bonus money math (operator-awarded)

Operator daje igraču free spinove ili no-deposit bonus → ne ide kroz wallet kao real money → drugačiji RTP track.

| Tip bonusa | Engine treba |
|---|---|
| **Free spins award** | wager=0, win ide u "bonus balance" pool, ne realan |
| **Cashable bonus + wager requirement (WR)** | track `cumulativeWager` × multiplier dok ne ispuni WR; tek tada balance je real |
| **Sticky bonus** | nikad ne postaje real, samo igra |
| **Bonus contribution rate per game** | slot doprinosi 100% ka WR, blackjack 10% — engine zna |
| **Max bet enforcement during bonus** | dok je WR aktivan, max bet je obično $5 |
| **Bonus expiry** | timer, engine pamti `bonusGrantedAt` + `bonusExpiresAt` |
| **No-deposit free spin RTP track** | odvojen MC + PAR sa "bonus-mode RTP" — operator izveštava regulatoru |

### 10.4 Multi-currency / FX

| Zahtev | Engine mora |
|---|---|
| **Native bet denominations** po valuti | EUR €0.10/0.20/0.50/1, USD $0.01/0.10/1, INR ₹1/5/10 — config |
| **Banker's rounding (HALF_EVEN)** u EUR, HALF_UP u USD | jurisdikcija-driven rounding mode |
| **No-rounding payout** kod kripto (8 decimala) | Decimal precision configurabilan po currency |
| **FX rate snapshot** za multi-currency progressive | jackpot pool u "engine currency", isplata FX-konvertovana |
| **Currency-specific min/max bet** | constraint validator |
| **Tax withhold u realnom vremenu** | US W-2G (>$1200), engine vraća `taxableWin: true/false` flag |

### 10.5 Operator config layer (iznad math)

Operator po jurisdikciji menja:
- **Min/max bet** po marketu
- **RTP profile** (igra može imati 3 RTP varijante: 92%, 94%, 96% — UK koristi 92%, Italy 94%)
- **Feature toggles** (UK ban-uje buy-feature, EU ne — engine zna)
- **Auto-play limits** (max spins, max loss before stop, mandatory break duration)
- **Reality checks** (svakih X minuta pop-up "igraš 60min, izgubio €Y" — engine zna stanje)
- **Pre-set bet limits** za logged-in user

Engine mora da podržava sve ovo **bez ponovnog build-a** — config layered (engine config + market config + operator config + player config).

---

## 11. JURISDIKCIJSKA TIPOLOGIJA MATH-A

Slot nije slot u svim zemljama isti pravni objekat. Engine mora da podržava **fundamentalno drugačiju matematiku** po jurisdikciji.

### 11.1 US Class II vs Class III

| | Class II (Tribal / Lottery-backed) | Class III (Commercial) |
|---|---|---|
| **Definicija** | Centralno bingo igra "obučena" kao slot | Pravi slot RNG po stolu |
| **Math** | igrač biva grupisan sa N drugih, bingo card draw determinira win, slot animacija je samo prezentacija | nezavisni RNG po spinu |
| **Engine treba** | "Bingo coordinator" mode — server determinira win, lokalni engine prikazuje | "Standalone" mode |
| **Regulatori** | NIGC (federalni), pleme | Nevada GCB, NJ DGE, MGA, UKGC |
| **Mehanike** | drugačiji RTP eqs (na nivou bingo grupe ne ind. spina) | klasičan RTP per-spin |

### 11.2 Italy VLT specifika

- **Centralno determinisano** preko ADM mreže
- **AAMS RNG** (državni RNG distribuiše stage outcomes)
- **Predeterminisani ticket** (ticket-in/ticket-out, ne real-time wallet)
- **Cycle-bound** math (igra mora hit-ovati RTP unutar definisanog ciklusa)
- **Min RTP 70% video lottery / 90% comma6a** — engine validira

### 11.3 UK compensated math

UK Gambling Commission razlikuje:
- **Non-compensated (true random)** — svaki spin nezavisan, RTP "long run"
- **Compensated** — igra prati "outstanding RTP owed" i prilagođava buduće spinove

Compensated math nije popularan ali postoji u **AWP machines** (Amusement With Prizes, pub gaming):
- Engine drži state `cycleProgress`, `outstandingPayout`
- Vrati win po cycle kompletiranju, ne čistom RNG-u
- Engine mora podržati **oba režima** kao IR opciju

### 11.4 Centrally-determined (Washington State, lottery-backed)

- **Server poseduje pool** outcomes (npr. 1M predeterminisanih tiketa)
- Igrač "izvlači" sledeći neiskorišćen ticket
- RNG odlučuje **redosled** ne sadržaj
- Engine treba `ticketPoolDraw()` mode

### 11.5 Bingo-pattern slot (Class II detail)

| Element | Math impact |
|---|---|
| Igrač dobija bingo card sa 24 broja | 75-ball ili 90-ball varijanta |
| Server izvlači brojeve | igrač markira card |
| Slot animacija predstavlja card pattern | win = matched pattern, ne reel-stop |
| Engine zna kompletnu **bingo pattern → slot grid prevodilac** | mapping je config |
| RTP ekv. **grupni** ne individualni | "igra protiv drugih, ne protiv kuće" |

### 11.6 Skill-based slots (Nevada experiment)

- **Skill influence** je dozvoljen do max 20% RTP varijance po igraču
- Igrač donosi odluku (timing klik, target select)
- Engine mora razdvojiti **pure RNG RTP** od **skill modifier**
- Min-skill-RTP, max-skill-RTP kao two-bound parameter

### 11.7 Regulatorne RTP granice (tabela)

| Jurisdikcija | Min RTP | Max payout cap | Posebnost |
|---|---|---|---|
| UK | 85% | £250k | spin time min 2.5s, max bet £2 |
| Italy | 70% VLT / 90% AWP | €100k / €5k | ADM RNG, compensated AWP |
| Nemačka | 90% | €1000/h max loss | spin time min 5s, deposit limit |
| Spain | 85% | €500/spin | self-exclusion registry |
| Netherlands | 92.5% | €5000/sesh | wager limits |
| Sweden | 88% (online) | no cap | self-exclusion + cooling-off |
| Denmark | 88% | no cap | tax model embedded |
| Portugal | 87% | no cap | bet contribution |
| Nevada (NV) | 75% | none | most permissive |
| New Jersey | 83% | none | hourly hash-chain audit |
| Ontario (AGCO) | 80% | none | mandatory pop-ups |
| Australia (NSW) | 87% | $1000/spin max | spin time 3s min |
| Malta (MGA) | 92% | none | EU baseline |

Engine mora **statički proveriti** da config ne krši ovo pre deploy-a, **dinamički** odbiti spin koji prelazi.

---

## 12. PROVIDER-SPECIFIC MEHANIKE — atlas

Velike firme su patentirale mehanike. Da bi engine bio "univerzalan", mora ih sve podržati kao plugin (uz pretpostavku da konzument ima license / sopstveni klon).

### 12.1 Aristocrat

| Mehanika | Math |
|---|---|
| **Reel Power** (Buffalo) | 1024 ways, simboli stacked |
| **Hyperhold** | 4-tier jackpot + hold-and-spin |
| **Lightning Link** | money coins + tier jackpot + sticky |
| **Dragon Link** | LL varianta + must-hit-by |
| **Mighty Cash** | sticky cash sa "Mighty" multiplier reveal |
| **Outback Pack** | wild reel + free games trigger fix |
| **Big Wheel** | wheel + multi-tier + retrigger ladder |

### 12.2 Light & Wonder (Scientific Games)

| Mehanika | Math |
|---|---|
| **88 Fortunes** sa Fu Bat | jackpot pick game + multi-level |
| **Quick Hit** | scatter pay + multiplier scale (3=2x, 4=10x, 5=50x...) |
| **Wonder 4** | 4 independent slot screens spinned together |
| **Money Money Money** | persistent dollar reel column |
| **Wheel of Fortune Triple Action** | wheel re-entry tiers |

### 12.3 Big Time Gaming

| Mehanika | Math |
|---|---|
| **Megaways™** | 2-7 simbola po reel, 6-th horizontal scatter row, do 117,649 ways |
| **Megaclusters** | cluster sa exponential expansion |
| **xWays** (Nolimit) | random N×1 stacks reveal N simbola (lokalna varijanta megaways) |
| **xNudge wild** | nudge dok ceo reel ne pokrije |
| **xBomb wild** | uklanja sve oko sebe |

### 12.4 Pragmatic Play

| Mehanika | Math |
|---|---|
| **Tumble feature** (Sweet Bonanza) | cluster cascade sa per-cluster reel |
| **Multiplier sky** | sticky mult symbol agregira tokom FS |
| **Ante bet** | 25% extra bet za 2× FS trigger probability |
| **Bonus Buy** | 100× bet za FS trigger, 250× za super FS |
| **Money Pot Respin** (Bigger Bass) | H&W coin + multiplier orb |

### 12.5 NetEnt / Evolution

| Mehanika | Math |
|---|---|
| **Starburst expanding wild** | wild → full-reel expand + sticky 3 respinova |
| **Reactoonz Quantum Leap** | cluster + charge meter + 5 mini features |
| **Avalanche** | NetEnt's cascading reels |
| **Re-Spin to Win** | per-reel respin sa charge cost |

### 12.6 Play'n GO

| Mehanika | Math |
|---|---|
| **Expanding symbol FS** (Book of Dead) | jedan random simbol expand-uje na 3-symbol stack |
| **Pearl & Symbol upgrades** | persistent FS state ulazi u sledeću sesiju |
| **Reactor cascade** | sa multi-multiplier ladder |

### 12.7 Relax Gaming / Hacksaw

| Mehanika | Math |
|---|---|
| **Money Train Persistence** | meter sa special simbolima retained kroz FS |
| **Hand of Anubis** | per-spin reel modifier random reveal |
| **Wanted Dead or a Wild** | three-mode FS choice |

Engine treba **mehanic atlas** — registar svake patentirane (ili poznate) mehanike sa referencom na koji plugin je implementuje. Korisnik dolazi sa "hoću ovakvu Mighty Cash" i odmah vidi: "config preset X + plugin Y + Z param-i".

---

## 13. KRIPTO / AUDIT / PROVABLY-FAIR LAYER

### 13.1 Hash-chain audit log

```
spin[N].audit_hash = H(spin[N-1].audit_hash || spin[N].outcome || spin[N].seed)
```

- Hash chain se objavljuje **publicly daily** (S3 + IPFS dual)
- Bilo koji entitet može da **rebuild** chain → ako njegov hash matuje, sve sigurno
- Engine treba `--hash-chain-mode` koji emituje audit_hash uz svaki spin

### 13.2 Commit-reveal (kripto casino standard)

- Server **commit-uje** SHA256(server_seed) PRE igre
- Igrač daje **client_seed**
- Combined `actual_seed = H(server_seed || client_seed || nonce)`
- Posle sesije server **reveals** server_seed → igrač verifikuje hash
- Engine treba `commitRevealMode: { serverSeed, clientSeed, nonce, revealAfter }`

### 13.3 ZK-SNARK provable fair

- Spin se mathski reprezentuje kao **circuit**
- Server proizvodi **proof** da je grid ispravno generisan iz `actual_seed`
- Igrač verifikuje proof bez gledanja seed-a (privacy-preserving)
- Engine mora da imati IR za circuit (faza futuristic 13.x)
- Crypto-casino primer: Stake.com koristi `provably_fair_v3`

### 13.4 Multi-party computation (MPC) za WAP

Federacioni provideri (4+ operatori share Mega Moolah pool):
- **Nijedan provider ne sme** sam da pokrene jackpot
- MPC protokol: jackpot hit zahteva **t-of-n** signature
- Engine zna kako da emit signature request, ne i kako da je sam reši (server posao)

### 13.5 Tamper detection

- Engine **runtime hash-uje sopstveni binary** (cargo `embed-resource` + `sha256_self`)
- Ako se ne podudara sa registrovanim binary → refuse to start
- Regulatori (GLI) zovu ovo "**Binary Verification**"

---

## 14. PLAYER-FACING SISTEMI

### 14.1 Responsible Gambling (RG)

| Hook | Engine treba |
|---|---|
| **Spin time minimum** (UK 2.5s, DE 5s) | enforce min duration u spin API |
| **Max loss / time limits** | engine pamti session loss, refuse spin kad limit prekoračen |
| **Self-exclusion check** | pre svakog spina, query exclusion list (config callback) |
| **Reality check pop-ups** | engine emit-uje `reality_check_due` event |
| **Cool-off** | engine refuses spin tokom cool-off periode |
| **Funder source check** | velika operacija zahteva proof of funds — engine ne odlučuje, ali ne nagrađuje pre verifikacije |

### 14.2 Anti-Money-Laundering (AML)

| Hook | Engine treba |
|---|---|
| **Suspicious spin pattern detection** | tag "abnormal" — npr. min-bet 1000× za bonus eligibility cycle |
| **Velocity check** | broj spinova/min preko threshold → flag |
| **Win pattern flag** | konzistentna max-win frequency (>3σ) iznad očekivanog → flag |
| **Cash-out hold** | win iznad jurisdikcija threshold → engine vrati `holdRequired: true` |

### 14.3 Tournament mode

| Aspekt | Engine |
|---|---|
| **Leaderboard scoring** | total win × points formula |
| **Equal RNG seed** za sve igrače | engine podržava `tournamentMode: { sharedSeed, spinIdx }` |
| **Tournament-only reel set** | drugačiji RTP profil u tournament (publish-overrideable) |
| **Real-time leaderboard** | engine event hook za score update |

### 14.4 Social casino (free-to-play)

- Coins, ne pravi novac
- Engine isti math ali bez wallet transakcije
- Different RTP "feel" (popularno: visok hit-rate, nizak max win za social) — config override

### 14.5 Live casino blend

- Slot + live dealer multiplier reveal (npr. Crazy Time slot mode)
- Engine mora da expose-uje stage-by-stage outcome za live streaming layer

---

## 15. MATH OBSERVABILITY

Niko trenutno **javno** nema dobar observability layer za slot math u runtime-u. Ovo je space gde idemo iznad svih.

### 15.1 Live RTP heatmap

- Grid pozicija × simbol × vreme → 3D matrica osetljivosti
- Engine emit-uje stage outcome detalje
- Frontend renderuje heatmap (toplo = često hit, hladno = retko)
- Detekcija anomalije: pozicija (3,2) hit-uje 10× češće nego očekivano → bug u stripu

### 15.2 Convergence predictor (ML)

- Klasično: čekaj 10B spinova za 99.99% CI
- Smart: ML model (LSTM ili Gaussian process) kaže "posle 50M spinova, ovaj specifičan config konverguje za još 200M sa P=0.95"
- Engine zove `convergencePredictor.estimate(currentStats) → spinsRemaining`

### 15.3 Drift detector (kontinualno)

- Production igra emit-uje hash chain
- Posle 100M spinova u proizvodnji, engine **re-runs** isti config sa istim seed-skupom
- Ako rezultat se razlikuje → math je driftao (bug, hardware error, tampering)
- Auto-flag → regulator + freeze

### 15.4 Sensitivity analysis u runtime-u

- "Šta ako wild weight 12 → 13?" — engine instant emit-uje RTP delta
- Koristi analytical RTP solver (closed-form) za 0-cost reanalysis
- Operator vidi "RTP +0.2%" pre commit-a

### 15.5 Per-feature contribution graf

Live graf: base 53.2%, FS 21.4%, H&W 18.5%, bonus 2.9%, scatter pay 0.9% — sa hourly trending. Detekcija anomalije ako featurez doprinos ode izvan 2σ od istorijskog proseka.

### 15.6 Symbol balance audit (live)

- Realan symbol hit count po reel-u vs očekivan
- Chi-squared continuous test
- Ako >3σ → moguć tampering ili hardware error

---

## 16. UNIVERSAL SLOT INTERCHANGE FORMAT (USIF) — naš javni standard

Ovo je gde idemo dalje od **svih** velikih firmi. Niko nema otvoren standard.

### 16.1 Šta je

- **USIF v1.0** — JSON / YAML schema koja u potpunosti opisuje slot igru
- Pokriva: simbole, reels, paytables, evaluatore, behaviore, feature FSM-ove, jackpot tier-e, RNG choice, jurisdikcije
- **Verifikabilan** kroz formal validator (Zod + JSON Schema strict mode)
- **Round-trippable**: USIF → engine → run → USIF (engine ne dodaje skrivene parametre)
- **Versioned**: USIF v1.0 → USIF v1.1 (backward compatible minor), USIF v2.0 (breaking)

### 16.2 Public reference implementation

- **Naš engine** = reference (slot-math-engine-template)
- 30 reference games (poslat u faze 12) demonstriraju coverage
- Submission ka eCOGRA / GLI kao **kandidat za public standard**
- Otvoreni source pod MIT, ne GPL (industry adoption easier)

### 16.3 Format converters

USIF iz/u:
- Aristocrat AGS XML config (ako možemo reverse-engineer)
- Pragmatic JSON
- NetEnt internal
- Microgaming MGA format
- Playtech config
- Custom (any vendor)

Konverter je **lossy** kada vendor format nedostaju polja — engine emituje warning sa missing field-ovima.

### 16.4 USIF Hub (futuristic)

- Web portal: upload USIF, dobiješ instant RTP + PAR + 100M MC validation
- Community-shared mehanic library
- Reference igre kao public examples
- Open-source kompanije konkurišu na features → mreža efekta

---

## 17. DISASTER SCENARIJI — engine ne sme da padne

### 17.1 Math regression u produkciji

- Engine v3.2 deployed → posle 50M spinova RTP je 95.2% umesto 96%
- **Engine mora da auto-detektuje** (drift detector §15.3)
- Auto-rollback ka v3.1 hash-verified
- Notify regulator unutar 15min (regulator timeline)
- Postmortem: differential test isti seed v3.1 vs v3.2 → identify which line changed

### 17.2 RNG entropy collapse

- Hardware RNG (TRNG) fail-uje → engine pada na backup PRNG seeded od last-known-good
- Audit log događaja
- Forensic: did some spins use degenerate RNG?

### 17.3 Jackpot trigger overflow

- Mega Moolah pool je $20M, engine triggera ali central server reportuje pool kao $5M
- Engine emit `JackpotDiscrepancy` event, ne plaća lokalno
- Hold for human review

### 17.4 Player session crash mid-feature

- Igrač u FS spin 7/15 sa multiplier ladder na 3×, server crash
- Engine state je već persisted (svaki spin commit)
- Resume → spin 8/15 sa istim ladder
- Bit-identično kao bez crash-a

### 17.5 Config tampering attempt

- Malicious config sa weighting koje violentno krši UK 85% min RTP
- Engine **odbije** load (jurisdiction validator pre svega)
- Audit log: tampering attempt

### 17.6 Math version drift (cross-deployment)

- Producer ima v3.2, replica ima v3.2.1 (patch sa različitim rounding)
- Players na replicama dobijaju različite payout od originala
- Engine: `binary_version_hash` mora matchovati na svim instancama
- Health check fails → load balancer skida replicas

### 17.7 1T spin simulation aborts mid-run

- Engine na 800B/1T zbog out-of-memory ili crash
- **Checkpoint-resume** obavezan (svakih 10M spinova snapshot)
- Resume: read checkpoint → set RNG state → continue
- Final stats: merge svih checkpoint partial stats

---

## 18. ROADMAP "POST-ARISTOCRAT"

Aristocrat / Light & Wonder / IGT su industry-grade. Naš target je **biti iznad** — stvari koje niko ne radi javno (a većina ne interno):

### 18.1 Sub-1ns analytical spin

- Memoize celokupan analytical RTP graf
- Single spin = `lookup(grid_hash) → win`
- Achievable za male igre (≤ 5×3 sa < 10⁹ stanja) — closed-form prekompjutiraju
- **0 RNG poziva u "demo" mode** — instant playback

### 18.2 Continuous certification

- Production live emit-uje hash chain → automated regulator inbox
- Daily statistical report → regulator dashboard
- No manual "submit cert" — kontinualna verifikacija
- Niko trenutno ne radi ovo (regulatori još uvek koriste 5-godišnju re-cert)

### 18.3 Federated math ML (privacy-preserving)

- Multipli operateri kontribuiraju **anonimne** session stats
- ML model trenira preko federisanog dataset-a (homomorphic enc)
- Output: bolja convergence prediction, fraud detection, RG patterns
- Niko ne radi ovo zbog conflict of competitive concerns — naša mreža = neutralna treća strana

### 18.4 Cross-jurisdiction single config

- Jedna USIF config → engine emit-uje jurisdikcija-specific variant
- UK build = 92% RTP, IT build = 90%, NV build = 96%
- Designer ne piše 3 igre — piše 1 sa `jurisdictionOverrides` blok

### 18.5 LLM-driven game balancing

- Designer kaže prirodnim jezikom: "hoću igru koja je 96% RTP, vol 4/5, hit-rate 22%, big-win freq 1/8000"
- LLM agent + auto-tuner → predlaže config
- Iterativni dialog: "smanji bonus contribution" → agent reweighs

### 18.6 Holographic strip encoding

- 117k Megaways state space → kompresan u **N-bit Bloom-filter-like** struct
- Approximation sa boundable error
- Useful za GPU shared mem (16KB) kad pun state ne staje
- Research direction — niko ne radi

### 18.7 Quantum advantage research

- Grover's algorithm može da **O(√N)** enumerate state space gde klasično je O(N)
- Cilj: enumerate Megaways 117k ways u efektivno √117k = 343 quantum koraka
- Trenutno samo research, nema praktične implementacije
- Engine emit-uje "QC-ready IR" čekajući da hardware sazri

### 18.8 Differential privacy PAR exports

- PAR sheet sadrži public stats — ali može da "curi" sensitivne game patterns
- Inject Laplace noise sa ε=0.1 → public RTP istinit, ali per-cell distribuc je obfuscovana
- Regulator dobija raw, public dobija DP-export
- Niko trenutno ne radi

### 18.9 Mining-pool style decentralized WAP

- Mega Moolah pool van centralne kontrole jednog provider-a
- Bitcoin-style consensus: 5+ operatori potpiše commit
- Pool grows kroz hash-verified contributions
- Hit → multi-sig payment iz pool-a
- Eliminate centralni rizik failure

### 18.10 Time-machine compliance

- Auto re-run istih 1M spinova posle 1 godine na produkcijskom kodu
- Mora da daje **bit-identičan** rezultat
- Dokazuje da nije bilo silent code change
- Audit dossier publikovan publicly

### 18.11 Sub-millisecond MC convergence

- Kombinacija: analytical RTP, QMC (Sobol), antithetic + control variates + importance sampling
- 1B spin equivalent CI sa **100 hiljada** stvarnih spinova → < 1ms wall clock
- Engine kao "live tuning console" — designer menja reel weight, vidi novi RTP **trenutno**

### 18.12 Adversarial config tester

- LLM agent + fuzzer **traži** edge config-e koji crash-uju ili violentno krše invariante
- Stalno radi (CI background)
- Auto-prijavi bug + propose fix
- Niko trenutno ne automatizuje ovo

---

## 19. FINALNI ZAKLJUČAK

Da bi engine bio **iznad svake postojeće firme**, treba da pokriva:

1. **Sve mehanike** (sekcije 1.1–1.5 + 12) — config-driven, plugin-based, bez hardkoda.
2. **Bulletproof math** (2) — closed-form first, MC verifikuje, cert-grade RNG.
3. **Server stack** (10) — atomic, idempotent, recall-replay, multi-currency.
4. **Jurisdikcijska adaptacija** (11) — Class II/III, VLT, compensated, lottery — sve.
5. **Crypto / audit layer** (13) — hash-chain, ZK, MPC za WAP.
6. **Player systems** (14) — RG, AML, tournament, social, live blend.
7. **Observability** (15) — live RTP heatmap, ML convergence predictor, drift detector.
8. **USIF javni standard** (16) — naš diferencijator.
9. **Disaster resilience** (17) — engine ne pada, ne plaća pogrešno, ne curi podatke.
10. **Post-Aristocrat features** (18) — gde niko trenutno nije.

Procena: **12–18 meseci** punog rada za pun obim. **6–9 meseci** za "industry-grade-universal" (1–12). **3–6 meseci** dodatno za "post-Aristocrat" diferencijatore (18).

Acceptance: engine prolazi 30 reference igara (faza 12), USIF v1.0 submitted javno, GLI re-cert-able, **1T spinova/sec single chip** kao demonstration of supremacy.
