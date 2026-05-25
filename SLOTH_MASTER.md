# 🎰 SLOTH MASTER — Strategic Roadmap to Ultimate Slot Math Engine

> **Cilj (jednom rečenicom):** Pretvoriti bilo koji PAR sheet ili GDD u kompletnu, deterministićnu, certifikat-ready slot igru kroz **jednu komandu** `slot-build <input>` — bez ručnog kodiranja matematike, bez kompromisa na compliance, bez "naprosto radi" rešenja.
>
> **Vlasnik:** [SlotMathArchitect](./agents/SLOT_MATH_ARCHITECT.md) (agent) · **Orchestrator:** Corti · **Vizija:** Boki
> **History log:** [`SLOT_ENGINE_MASTER_TODO.md`](./SLOT_ENGINE_MASTER_TODO.md) (728KB, Wave 1-241+)
> **Last sync:** 2026-05-25 15:40

---

## 📐 Mission acceptance (kad se misija smatra završenom)

| # | Kriterijum | Status |
|---|---|:---:|
| 1 | `slot-build <PAR.xlsx>` → 30s → playable Studio sim + cert paket | 🚧 W4.x |
| 2 | `slot-build <GDD.pdf>` → 60s → IR draft + math placeholder + Studio scaffold | ⏳ Phase 4 |
| 3 | 12×12 primitiv kombinacija matrice radi iz IR-a (Topology × Feature) | ⏳ Phase 1-3 |
| 4 | Vendor parity: L&W ✅, IGT ✅, Aristocrat, NetEnt, Pragmatic — 5+ profila × 3+ test PAR-a | 🚧 2/5 |
| 5 | Jurisdikcijska compliance: 12 profila (UKGC/MGA/GLI-16/19/NV/NJ/PA/MI/ON/BC/AAMS/Quebec) | 🚧 Faza 11 |
| 6 | Closed-form solver coverage: 100+ feature patterns iz INDUSTRY_PATTERN_CATALOG | 🚧 77/100 |
| 7 | 10⁹ spinova / 60s na M2 Max — sustained MC throughput | ✅ landed (Wave 3) |
| 8 | Studio UI: A/B compare, real-time MC, IR editor, vendor + jurisdiction switcher | 🚧 Phase 5 |
| 9 | GLI-16 auto cert paket (HSM seed, RNG 90B, PAR commitment, audit log) | 🚧 Phase 3 |
| 10 | Genetic optimizer: target RTP+vol → 1000 varijanti za 24h sa Pareto fitness | ⏳ Phase 6 (W7.1) |

---

## 🗺️ 7-FAZA Roadmap

### **PHASE 1 — Math Foundation** _(univerzalni IR + jurisdikcija + invariante)_
**Status:** 🟢 **~90% done** (faze 1-3 iz `SLOT_ENGINE_MASTER_TODO.md` zatvorene + W4.1 univerzalni engine)

| # | Wave | Status | Evidence |
|---|---|:---:|---|
| P1.1 | Universal IR schema (Lines/Ways/Megaways/Cluster + 12 Feature variants) | ✅ | `engine/slot-sim/src/ir.rs` (W4.1 = `dc65435`) |
| P1.2 | TS↔Rust bit-parity IR roundtrip | ✅ | `tests/ir_roundtrip.rs` |
| P1.3 | Cross-validate (referential integrity, paytable shape, RTP allocation) | ✅ | `rust-sim/src/ir/validate.rs` |
| P1.4 | Closed-form solvers (Lines, Ways, Scatter, Wild substitution, Pattern) | ✅ | 77/100 (target 100+) |
| P1.5 | Jurisdiction profiles: UKGC, MGA, GLI-16, GLI-19, NV, NJ + auto-fix | ✅ | `rust-sim/src/jurisdiction/` (Faza 11.9) |
| P1.6 | **P1.6 — Closed-form solver expansion** to 100+ patterns | 🚧 | gap analysis u `docs/INDUSTRY_PATTERN_CATALOG.md` |
| P1.7 | **P1.7 — Jurisdiction profiles expansion** (PA, MI, ON, BC, AAMS, Quebec, SE, IT, DE GlüStV) | 🚧 | 6 nedostaje |
| P1.8 | **P1.8 — Math invariant continuous fuzzer** (random IR → must-pass invariants) | ⏳ | new |

**Acceptance Phase 1:** 100+ solvers + 12+ jurisdikcija + 0 invariant violations na 10M random IR fuzz.

---

### **PHASE 2 — Vendor Parity** _(reverse-eng iz PAR layouts)_
**Status:** 🟡 **30% done** (L&W + IGT base ✅, ostali otvoreni)

| # | Wave | Status | Evidence |
|---|---|:---:|---|
| P2.1 | `parse_par` engine + vendor profile YAML system | ✅ | `tools/parse_par/` (W4.2 = `612bc68`) |
| P2.2 | **W4.3a — Per-reel IGT strip parser** ("Reel N / Weights" stripe layout) | ✅ | `tools/parse_par/core.py::_parse_reel_sets_stripe` + `igt.yaml` v2 — strip lengths bit-exact (71/109/70/101/89 base, 105/94/102/68/91 fs PAR_001; FS reel 1 = 107 for PAR_002) |
| P2.3 | **W4.3b — IGT → slot-sim model** (FK pick bonus + linear progressive primitive mapping) | ✅ | `tools/parse_par/to_slot_sim.py` + paylines_layout in `igt.yaml` + Rust roundtrip test. IR JSON deserializes to `slot_sim::ir::Ir`, engine runs 10k+ spins, line-eval RTP ~0.70 (gap = features::run_features stub = W4.3c) |
| P2.4 | **W4.3c — IGT feature dispatch + 10B MC verify** PAR_001+002 vs Excel (target ≤0.05%) | 🚧 NEXT | implement `run_features` for FreeSpins/PickBonus/LinearProgressive; then 10B MC parity gate |
| P2.5 | **W4.4 — Aristocrat profile** (Lightning Link / Dragon Link layout) | ⏳ | new profile YAML + 3 PAR test |
| P2.6 | **W4.5 — NetEnt profile** (Cluster Pays + Avalanche layout) | ⏳ | new |
| P2.7 | **W4.6 — Pragmatic Play profile** (Megaways + Sticky Bonus) | ⏳ | new |
| P2.8 | **W4.7 — Vendor parity dashboard** (CLI `parse-par-doctor` + HTML report) | ⏳ | new |

**Acceptance Phase 2:** 5 vendor profila × 3 PAR-a each = 15 round-trip bit-identical + sve u CI.

---

### **PHASE 3 — Auto-Build Pipeline** _(`slot-build` end-to-end)_
**Status:** 🔴 **0% done** — sledeća glavna inicijativa posle Phase 2

| # | Wave | Status |
|---|---|:---:|
| P3.1 | **W5.1 — `slot-build` CLI scaffold** (`<input>` → detect format → dispatch parser → IR) | ⏳ |
| P3.2 | **W5.2 — IR → Rust engine codegen** (Tera template iz IR → `games/{slug}/src/`) | ⏳ |
| P3.3 | **W5.3 — IR → TS engine codegen** (mirror za RGS klijent) | ⏳ |
| P3.4 | **W5.4 — IR → Studio UI skeleton** (Svelte/Phaser scaffold sa reel viz + paytable + features panel) | ⏳ |
| P3.5 | **W5.5 — Auto MC verify** (1B spinova post-build, gate sa Excel target ≤0.05%) | ⏳ |
| P3.6 | **W5.6 — Auto cert paket** (HSM seed + RNG 90B + PAR commitment hash + audit log → ZIP) | ⏳ |
| P3.7 | **W5.7 — `slot-build` integration tests** (E2E sa CE + Fort Knox + 1 sintetički Megaways) | ⏳ |

**Acceptance Phase 3:** `slot-build CE_PAR-001.xlsx` → 30 sec → folder `games/ce-par-001/` sa Rust+TS+Studio+cert ZIP, playable u Studio.

---

### **PHASE 4 — GDD Ingestion** _(NLP-driven PDF/Excel → IR)_
**Status:** 🔴 **0% done** — najambicioznija faza, predviđen Q3 2026

| # | Wave | Status |
|---|---|:---:|
| P4.1 | **W6.1 — GDD PDF extractor** (PyMuPDF + layout heuristics → semi-structured JSON) | ⏳ |
| P4.2 | **W6.2 — Spec language (DSL)** — `gdd.toml`: theme, reels, features, paytable hints, volatility target | ⏳ |
| P4.3 | **W6.3 — LLM-assisted GDD→DSL** (Kimi/Claude orchestration, no creative LLM in math path) | ⏳ |
| P4.4 | **W6.4 — DSL → IR synthesizer** (math hole-filling sa SMT/Z3 ili genetic solver) | ⏳ |
| P4.5 | **W6.5 — `slot-build GDD.pdf`** (full pipeline: PDF → DSL → IR → engine + Studio) | ⏳ |
| P4.6 | **W6.6 — Human-in-loop review UI** (Studio: "GDD parsed this way — confirm or edit IR") | ⏳ |

**Acceptance Phase 4:** GDD PDF od stranog studija → 60s → IR + playable scaffold + math placeholder gde GDD nije eksplicitan. Human edit u Studio loop.

---

### **PHASE 5 — Studio UI Integration** _(real-time math + visualization)_
**Status:** 🟡 **40% done** (Studio v5-final-studio + Workspaces ✅, real-time MC partial)

| # | Wave | Status |
|---|---|:---:|
| P5.1 | Studio v5-final-studio scaffold | ✅ |
| P5.2 | Workspaces × Variants (Compare A/B) | ✅ |
| P5.3 | **WebWorker auto-MC za import bez validated_metrics** | ⏳ (lessons-learned negative iz prošlosti) |
| P5.4 | **Real-time RTP/volatility/hit-rate gauge** (10M streaming MC) | ⏳ |
| P5.5 | **IR JSON editor** (sa schema validation + live error highlight) | ⏳ |
| P5.6 | **Vendor + Jurisdiction switcher** (dropdowns sa diff preview) | ⏳ |
| P5.7 | **Reel strip visualizer** (D3.js — RTP contribution per simbol, per reel position) | ⏳ |
| P5.8 | **Paytable heatmap** (RTP contribution per row) | ⏳ |
| P5.9 | **Studio E2E Playwright suite** (regression za sve feature panels) | ⏳ |

**Acceptance Phase 5:** Import IR → instant gauge + viz → user edit → re-MC u 5s → A/B compare → export cert paket.

---

### **PHASE 6 — Self-Evolution** _(genetic / SMT / quantum-inspired)_
**Status:** 🟢 **W7.2 QMC sweeper landed** (`05ef411`), ostalo ⏳

| # | Wave | Status |
|---|---|:---:|
| P6.1 | **W7.2 — Quasi-Monte Carlo sweeper** (Sobol/Halton/Lattice, 10× brže za tail) | ✅ (`05ef411`) |
| P6.2 | **W7.1 — Self-Evolving Math Genome** (DEAP/evolution-rs, reels=DNK, paytable=enzimi, features=traits) | ⏳ industry-first |
| P6.3 | **W7.3 — SMT/Z3 solver** za egzaktan RTP-target IR sinteza (paytable + reel weights) | ⏳ industry-first |
| P6.4 | **W7.4 — Multi-objective Pareto** (RTP × volatility × hit-rate × max-win → frontier) | ⏳ |
| P6.5 | **W7.5 — Verifiable PAR provenance** (Merkle commitment + signature chain + reproducible build) | ⏳ industry-first |
| P6.6 | **W7.6 — Active-learning balance loop** (real RGS telemetry → re-balance suggest) | ⏳ |

**Acceptance Phase 6:** Korisnik unese target {RTP: 96%, vol: 18, hit-rate: 28%, max-win: 5000×} → 24h → 1000 IR varijanti na Pareto frontu + svaka prošla jurisdikciju.

---

### **PHASE 7 — Industry Parity Dashboard** _(commercialization)_
**Status:** 🔴 **0% done** — Phase 7 je commercialization, posle Phase 1-6

| # | Wave | Status |
|---|---|:---:|
| P7.1 | **W8.1 — 1000-template marketplace** (open + premium IRs, hash-pinned) | ⏳ |
| P7.2 | **W8.2 — White-label SaaS** (multi-tenant, per-operator branding) | ⏳ (docs done) |
| P7.3 | **W8.3 — GaaS API** (slot-build kao API endpoint) | ⏳ (docs done) |
| P7.4 | **W8.4 — Pilot programi** (L&W, Aristocrat, NetEnt outreach) | 🚧 outreach docs landed |
| P7.5 | **W8.5 — Public benchmark** (vs commercial slot studios — RTP accuracy, build speed) | ⏳ |
| P7.6 | **W8.6 — Open marketplace contributor flow** (community PR templates) | ⏳ |

**Acceptance Phase 7:** Commercial pilot live sa min 1 mid-tier studio + 100+ community templates u marketplace.

---

## 🎯 IMMEDIATE NEXT (sledeća 3 wave-a)

| Prio | Wave | Trajanje | Output |
|:---:|---|---|---|
| 🥇 1 | **W4.3c — IGT feature dispatch + 10B MC verify** | 2-3h impl + 90min sim | FreeSpins/PickBonus/LinearProgressive runners; 10B parity ≤0.05% |
| 🥈 2 | **W5.1 — `slot-build` CLI scaffold** | 60-90 min | `<input>` → detect format → dispatch parser → IR; entry point |
| 🥉 3 | **W4.4 — L&W → slot-sim adapter** | 90-120 min | Mirror IGT path for CE COPY TEST: CE-specific HoldAndWin + GRAND + Cash Eruption mapping |

### ✅ Just landed

| Wave | Commit | Δ |
|---|---|---|
| W4.3a | `d393d25` | `_parse_reel_sets_stripe()` + IGT profile v2 + 10 stripe unit tests; strip lengths bit-exact vs Excel Total row |
| W4.3b | _(pending)_ | `tools/parse_par/to_slot_sim.py` + paylines_layout in `igt.yaml` + Rust roundtrip test (6/6); IGT IR deserializes to `slot_sim::ir::Ir` and engine runs without panic |

**Posle W4.3c**: ulazimo u **Phase 3 — Auto-Build Pipeline** (W5.1 `slot-build` CLI scaffold).

---

## 📜 Closed wave summary (history pointer)

Ne ponavljam ovde — sve detaljno u `SLOT_ENGINE_MASTER_TODO.md`. Highlights:
- Wave 181-196: KIMI L&W portfolio (16 solvers landed)
- Wave 234-241: Rust mutation kill (197 specs, 10 modula, 100% effective)
- Wave 239: TS Stryker scoped 91.23%
- Wave 3.x: CE COPY TEST 30B / 3 SWID / ≤0.05% Excel parity ✅
- Wave 4.1: Universal `slot-sim` engine (IR-driven, game-agnostic)
- Wave 4.2: Universal `parse_par` + vendor profile YAML (L&W + IGT)
- Wave 7.2: Quasi-Monte Carlo sweeper (Sobol/Halton/Lattice)

---

## 🔄 Update protocol

Svaki put kad SlotMathArchitect ili Corti landa wave:
1. Flip status u relevantnoj Phase tabeli ovde
2. Update "IMMEDIATE NEXT" sa novim sledeća-3
3. Update mission acceptance ako neki kriterijum napreduje
4. Auto-commit + push (per `rule_master_todo_auto_commit.md`)

---

_Living document. Hash-pinovan u git-u, ne brisati istoriju, samo append._
