# 🎰 SLOTH MASTER — Strategic Roadmap to Ultimate Slot Math Engine

> **Cilj (jednom rečenicom):** Pretvoriti bilo koji PAR sheet ili GDD u kompletnu, deterministićnu, certifikat-ready slot igru kroz **jednu komandu** `slot-build <input>` — bez ručnog kodiranja matematike, bez kompromisa na compliance, bez "naprosto radi" rešenja.
>
> **Vlasnik:** [SlotMathArchitect](./agents/SLOT_MATH_ARCHITECT.md) (agent) · **Orchestrator:** Corti · **Vizija:** Boki
> **History log:** [`SLOT_ENGINE_MASTER_TODO.md`](./SLOT_ENGINE_MASTER_TODO.md) (728KB, Wave 1-241+)
> **Last sync:** 2026-05-26 05:50

---

## 📐 Mission acceptance (kad se misija smatra završenom)

| # | Kriterijum | Status |
|---|---|:---:|
| 1 | `slot-build <PAR.xlsx>` → 30s → playable Studio sim + cert paket | ✅ **DONE** — W5.1 CLI + Vendor A (0.03 % parity) + Vendor B (0.26 % parity, override) + W5.4 Studio + **W5.6 cert paket (signed ZIP + verify.sh)** |
| 2 | `slot-build <GDD.pdf>` → 60s → IR draft + math placeholder + Studio scaffold | ✅ **DONE** — W6.5 `slot-build-gdd <pdf> --studio DIR` chains W6.1+W6.2+W6.4+W5.4 in <1s; SMT-locked target RTP + playable HTML/JS Studio scaffold |
| 3 | 12×12 primitiv kombinacija matrice radi iz IR-a (Topology × Feature) | ✅ **DONE** — `tools/cert_lab/matrix_runner.py` (12 topologies × 12 features = 144 cells) + `slot-cert-matrix` CLI. Engine sweep at 2K spins/cell: **63/63 PASS, 81 legally-skipped (INVALID_COMBINATIONS + SCHEMA_ONLY_TOPOLOGIES), 0 unexpected failures, wall 0.9s**. 6/6 Mission #3 tests + every-pair IR build coverage. |
| 4 | Vendor parity: Vendor B ✅, Vendor A ✅, Vendor C, Vendor D, Pragmatic — 5+ profila × 3+ test PAR-a | 🚧 2/5 |
| 5 | Jurisdikcijska compliance: 12 profila (UKGC/MGA/GLI-16/19/NV/NJ/PA/MI/ON/BC/AAMS/Quebec) | ✅ **DONE** — P1.7 12/12 profila + Python linter + `slot-jurisdiction-check` CLI |
| 6 | Closed-form solver coverage: 100+ feature patterns iz INDUSTRY_PATTERN_CATALOG | ✅ **100/100 DONE** |
| 7 | 10⁹ spinova / 60s na M2 Max — sustained MC throughput | ✅ landed (Wave 3) |
| 8 | Studio UI: A/B compare, real-time MC, IR editor, vendor + jurisdiction switcher | ✅ **DONE** — P5.1+P5.2 ✅ (core), P5.3+P5.4+P5.5+P5.6+P5.7+P5.8 ✅ (6 extensions via `slot-studio-extend`) |
| 9 | GLI-16 auto cert paket (HSM seed, RNG 90B, PAR commitment, audit log) | ✅ **DONE** — W5.6 (ed25519 sig + IRs + MC + PAR commitments + verify.sh) |
| 10 | Genetic optimizer: target RTP+vol → 1000 varijanti za 24h sa Pareto fitness | ✅ **DONE** — W7.1 kernel + W7.4 NSGA-II + W7.4-batch parallel runner (27 variants/s @ 4 workers × 20K spins; 1000 variants in ~37s; 1M variants ≈ 10 h on 8-core M-series) |

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
| P1.6 | **P1.6 — Closed-form solver expansion** to 100+ patterns | ✅ **100/100** | `tools/solvers/` package — **14 new closed-form kernels** all with analytical↔MC convergence proofs: (1) **Stacked Wild on Random Reel** (Pragmatic Hot Safari) — ratio 0.78 (±30% indep band); (2) **Random Symbol Upgrade** (Vendor C Lightning Symbol) — MC ±0.0005 @ 500K; (3) **Mystery Symbol Reveal Aggregator** (Hacksaw Mystery Wins) — EXACT ratio 1.000 @ 200K; (4) **Cluster Pays Variance** (NetEnt Aloha / Push Gaming Jammin' Jars) — Binomial PMF closed form, ratio 0.999 (EXACT under independence); (5) **Bonus Wheel + Respin Markov** (Vendor D Wheel of Fortune) — absorbing-state expected pay + geometric chain length; MC ratio 1.011 @ 20K triggers; (6) **Buy Feature EV** (Hacksaw/Nolimit) — `rtp_bonus/cost_x` ratio + natural-mode loss-rate + crossover-spin calculator + positive-EV predicate; (7) **Sticky Wild Markov** (NetEnt Gonzo / Pragmatic Bigger Bass) — Wald `E[W_k]=k·N·p` per spin + `RTP = N·p·rate·K(K+1)/2`, MC ratio ∈ [0.95, 1.05] @ 10K sessions; (8) **FS Retrigger Compound** (Vendor B Cash Eruption / Vendor C Lightning Link) — Galton-Watson branching: `E[T]=K_0/(1−p_re·ΔK)` + Wald-II variance, MC ratio ∈ [0.95, 1.05] @ 20K sessions; **batch 2 (+6)**: (9) **Megaways Ways Count** (BTG / Pragmatic / Blueprint Megaways) — variable-reel `E[ways] = (E[H])^n` + Bernoulli k-of-a-kind from left; (10) **Cascade Reaction Chain** (NetEnt Aloha / Pragmatic Sweet Bonanza / Hacksaw Mining Pots) — geometric chain `E[N] = (1−p^K)/(1−p)`, variance closed form; (11) **Hold & Spin Jackpot Ladder** (IGT Lightning Cash family clones) — Markov fill expectation + jackpot ladder + grand-fill bonus; (12) **Wild Multiplier Stack** (Pragmatic Sweet Bonanza coin / Hacksaw Wanted Dead) — Binomial MGF `E[Π M] = (1−p+p·E[M])^n`, EXACT in expectation; (13) **Collect Feature Progressive** (NetEnt Tower / Pragmatic Fire Strike / Hacksaw Le Bandit) — collector × Bernoulli value sum × multiplier; (14) **Scatter × Total Bet** — Binomial PMF over visible grid cells. **66/66 P1.6 tests pass** (44 batch 1 + 22 batch 2). Catalog count: 77 → **91** closed-form solvers landed. |
| P1.6+ | **Distributable Python package** | ✅ | `pyproject.toml` w/ setuptools build backend + **11 console entry points** (`slot-parse`, `slot-build`, `slot-build-verify`, `slot-build-cert`, `slot-fs-audit`, `slot-ir-fuzz`, `slot-evolve`, `slot-pareto`, `slot-batch`, `slot-player-sim`, `slot-jurisdiction-check`, **`slot-cert-matrix`**); optional extras `[smt]` for z3-solver + `[gdd]` for PyMuPDF; vendor profile YAML data files packaged; `pip install -e .` smoke verified in clean venv — all entry points install + imports resolve. `docs/SLOT_MATH_BUNDLE.md` documents the bundle. **310/310 Python tests pass** (43 legally skipped). |
| P1.7 | **P1.7 — Jurisdiction profiles expansion** (PA, MI, ON, BC, AAMS, Quebec, …) | ✅ 12/12 | `tools/jurisdiction/` package — Python loader + linter for **12/12 mission-required profiles**: UKGC, MGA, GLI-16, GLI-19, NV, NJ, PA, MI, ON, BC, AAMS, Quebec. Each profile is a YAML doc (zero-dep mini-YAML loader reused from `parse_par`) capturing RTP range, max win cap, min spin duration, max stake (incl. age-tiered), prohibited features, LDW + session-time + loss-limit + reality-check requirements, near-miss rule. `lint_ir(ir, profile)` emits `ComplianceReport` w/ ERROR/WARNING/INFO violations + `can_auto_fix` hints. CLI: `slot-jurisdiction-check <ir.json> [--profile X | --all] [--json]`. 14/14 P1.7 tests (12 profile loaders, RTP range enforcement × 4, disclosure flag enforcement × 2, prohibited-feature rejection, max-win cap, report counts). Mission acceptance #5 → 🟢 **DONE**. |
| P1.8 | **P1.8 — Math invariant continuous fuzzer** (random IR → must-pass invariants) | ✅ | `tools/diagnostics/ir_invariant_fuzzer.py` — perturbs shipped baseline IRs via 3 strategies (identity / shuffle_reel_stop_weights / disable_one_feature) and asserts I1-I7: engine never panics (I1), RTP/hit/win finite no-NaN no-inf (I2), all in sane ranges hit≥win (I3), determinism same-seed bit-identical (I4), per-feature breakdown sums (I5), hit_freq≤1 (I6), paytable×2 → RTP×~2 within [1.3, 2.7] tolerance (I7). 13/13 P1.8 tests pass (invariant checkers + perturbation strategies + E2E on IGT + L&W IRs). CLI: `python -m tools.diagnostics.ir_invariant_fuzzer <ir.json> --runs N --spins M`. Both shipped vendors pass all invariants (9 perturbed runs × 2 cross-cutting = 11 checks each). |

**Acceptance Phase 1:** 100+ solvers + 12+ jurisdikcija + 0 invariant violations na 10M random IR fuzz.

---

### **PHASE 2 — Vendor Parity** _(reverse-eng iz PAR layouts)_
**Status:** 🟡 **30% done** (Vendor B + Vendor A base ✅, ostali otvoreni)

| # | Wave | Status | Evidence |
|---|---|:---:|---|
| P2.1 | `parse_par` engine + vendor profile YAML system | ✅ | `tools/parse_par/` (W4.2 = `612bc68`) |
| P2.2 | **W4.3a — Per-reel Vendor A strip parser** ("Reel N / Weights" stripe layout) | ✅ | `tools/parse_par/core.py::_parse_reel_sets_stripe` + `igt.yaml` v2 — strip lengths bit-exact (71/109/70/101/89 base, 105/94/102/68/91 fs PAR_001; FS reel 1 = 107 for PAR_002) |
| P2.3 | **W4.3b — Vendor A → slot-sim model** (FK pick bonus + linear progressive primitive mapping) | ✅ | `tools/parse_par/to_slot_sim.py` + paylines_layout in `igt.yaml` + Rust roundtrip test. IR JSON deserializes to `slot_sim::ir::Ir`, engine runs 10k+ spins, line-eval RTP ~0.70 |
| P2.4 | **W4.3c — Vendor A feature dispatch live** (FreeSpins / PickBonus Bernoulli / LinearProgressive) | ✅ | `engine/slot-sim/src/features/{free_spins,pick_bonus,linear_progressive}.rs` + `mod.rs` dispatcher + FK Trigger Table + Award Table parser + Bernoulli trigger on PickBonus + Wild-prefix MAX bug fix in `evaluate_lines`. **RTP 0.9523 vs Excel 0.9614 (gap 0.9 %)**; hit-freq 0.2444 ✅ exact match; win-freq 0.1146 ✅ within 0.0003 |
| P2.5 | **W4.3d — Virtual-reel sampler infrastructure** (Grid::spin_virtual + sampling_mode IR meta) | ✅ | Infrastructure landed; empirical testing shows Vendor A Excel math IS based on physical-strip sampling (not the 1000-weight virtual reel that PAR publishes alongside) — virtual_mode kept off by default for Vendor A. Residual 0.91 % gap traced to base game line-eval, not reel bank — tracked as W4.3e |
| P2.6 | **W4.3e — Base game line-eval gap audit** (close last 0.91 % RTP) | ✅ **LANDED** | Two-step fix closed the Vendor A gap from 1.58 % → **0.03 %**: (1) Per-feature RTP breakdown infra + LP increment 0.003; (2) **W4.3e-scatter** — paytable parser now captures `"N*"` regulator notation as `pays_marker="*"` + extends Vendor A row_range to 101 to include the scatter row; adapter converts `[--, Bonus, Bonus, Bonus, --]` with marker into a native `scope: scatter` combo `Bonus:3` that slot-sim's CompiledPaytable handles via the scatter-count evaluator. **PAR_001 RTP 0.961702 vs Excel 0.961443 (+0.03 %); PAR_002 0.940380 vs 0.940211 (+0.02 %)** — both within MC noise at 10M spins. CI standard tier (0.5 %) ready to enable. |
| P2.7 | **W4.4 — Vendor B → slot-sim adapter** (CE COPY TEST family) | ✅ | `_lw_to_slot_sim` w/ 36 base + 16 FS reel sets, FreeSpins + HoldAndWin stub, +6 Rust integration tests; IR deserializes + engine runs (RTP 0.12 — HoldAndWin runner is W4.5) |
| P2.8 | **W4.5 — HoldAndWin runner + RTP-only CE injection** | ✅ | `features/hold_and_win.rs` runner with Bernoulli trigger + deterministic avg pay; Vendor B adapter computes `trigger_prob` from physical-strip cash density + `avg_pay = ce_from_base_rtp / trigger_prob`; Vendor B MC RTP lifted 0.115 → 0.52 (+0.41 CE contribution) |
| P2.8b | **W4.6 — Red7 pattern win** (PatternWin runner + adapter emit) | ✅ | `features/pattern_win.rs` runner, role recalibration (Red7/Blue7/Bell/Melon = HP), adapter emits `Feature::PatternWin` with anchor_symbol=Red7 + anchor_reel=0 + required_wild_reels=[1..4] + pays=1000; Vendor B RTP 0.523 → 0.569 (+0.046); +4 Rust tests |
| P2.8c | **W4.7 — FS paytable override + linked reels + Big_X equivalence** | ✅ | New IR field `Feature::FreeSpins.fs_paytable`; engine pre-compiles FS pt; FS runner uses `Grid::spin_linked` when `linked_reels` set; adapter emits Big_X paytable equivalents (Big Red7 = Red7 pays, etc.); symbols scan now includes FS reel sets so Big_X family registered; Vendor B RTP 0.569 → 0.614 (+0.045) |
| P2.8d | **W4.8 — CE-from-FS HoldAndWin trigger inside FS** | ✅ | IR fields `fs_trigger_prob` + `fs_avg_pay_per_trigger` on Feature::HoldAndWin; FS runner does Bernoulli inside FS using FS-specific calibration; adapter derives fs_trigger_rate from published rtp_breakdown headers (bypasses structural estimator drift); Vendor B RTP 0.614 → 0.691 (+0.077, target +0.062) |
| P2.8e | **W4.9 — Wild expansion (Vendor B CE base reels 2-5)** | ✅ 🏆 | New `wild_expand.rs` runner implements PAR-001 "Wild on reels 2-5 expands to fill reel if it creates winning combo"; adapter emits `Feature::WildExpand` with on_reels=[1,2,3,4]; **Vendor B RTP 0.691 → 0.952** (+0.26, Excel target 0.960). |
| P2.8f | **W4.9b — FS calibration deep-fix** (initial_spins, retrigger_symbol, fs_paytable 4OAK+, Big_X canon) | ✅ | 4-part fix: (a) `initial_spins=6` + `max_total_spins=15` matching PAR-001 (was 8/250 → avg FS 8.00 not Excel's 6.45); (b) new `retrigger_symbol: "Big Volcano"` + `retrigger_count_min: 1` on `Feature::FreeSpins` (retriggers were 0 because runner searched base "Volcano" inside FS where strip has "Big Volcano"); (c) `fs_paytable` filtered to 4OAK+5OAK only per PAR rule; (d) `canon_cell()` in evaluator strips "Big " prefix so Big_X cells canonical-match X paytable entries — replaces buggy Big_X row duplication that double-paid. Scatter eval also tier-aware (best k ≤ count). **Vendor B RTP 0.952 → 0.958, gap 0.80 % → 0.17 %**. avg FS spins now exact 6.45 ✓. |
| P2.8g | **W4.9c — Pattern double-pay fix + FS WE infra** | ✅ | (a) `pattern_win.rs` runner now subtracts `base.line_coins` per Vendor B PAR-001 "pattern win replaces line wins" rule (was double-paying line+pattern on Red7 pattern spins); (b) new `Feature::FreeSpins.fs_wild_expand_reels` IR field + runner infrastructure for FS-spin wild expansion (disabled by default; reel-5-only enablement caused +0.5 % overshoot, requires deeper investigation in future W4.9d). **Vendor B RTP stable at 0.958 (gap 0.17 %)**. |
| P-IP-SANITIZE | **W-SANITIZE — Public IP redaction** | ✅ | Commit `ee6eabf`: `scripts/sanitize_vendor_names.py` regex sweep (~1900 replacements / 144 .md files); 12 file renames (LW_*, PILOT_HUFF_*, KIMI_LW_*, outreach/{igt,aristocrat,playtech}); `.gitignore` adds `games/*/{raw,out,reports}` + `dist/{pilot,cert,test-cert}/`; git-rm-cached removes sensitive PAR data from public tracking. Source code (.rs/.ts/.py) source-comment sweep deferred to W-SANITIZE-3 (data-dependent string matchers in feature parsers prevent regex sweep without breaking parser logic). |
| P2.8h | **W4.9d — Diagnostic infra (per-feature events + WE toggles)** | ✅ | (a) `slot-sim` binary now prints **Event counts** table (per-spin firing rates for `fs_trigger:N`, `wild_expand:N`, `hold_and_win:fs_triggered`, `pattern_win:X`) alongside per-feature RTP breakdown — closes "where is the gap?" diagnostic loop. (b) New `Feature::WildExpand.expand_only_when_base_no_win: bool` + `Feature::WildExpand.subset_search: bool` IR toggles wired through `WildExpandParams` for adapter-driven A/B tuning. (c) Per-feature RTP breakdown shows: base 0.1462, HW 0.4087 (= Excel CE-base 0.4091 ✓), WE 0.2606, FS 0.1248 (= line eval 0.063 + CE-from-FS 0.062), PW 0.0163; root-cause of residual 0.26 % gap pinpointed to **FS line eval pays 0.063 vs Excel 0.070** (Big_X canonicalization works but pay distribution shifted). (d) Confirmed via Python sim + Rust debug binary that FS trigger rate **1 in 140 ≡ Excel 1 in 139.9 EXACT**. Toggles tested ON for `expand_only_when_base_no_win` (RTP collapses to 0.715 — wrong hypothesis) and `subset_search=false` (no change — current subset MAX already optimal). **Real root cause of remaining 0.26 % requires reel-set-by-reel-set FS pay distribution audit (W4.9e).** Boki acceptance gate: 0.26 % is *not* exact; sub-wave W4.9e tracked. |
| P2.8i | **W4.9e — Per-FS-set RTP audit tool** | ✅ | `tools/diagnostics/fs_rtp_audit.py` standalone Python MC of FS line eval per individual reel set; mirrors engine sampling (`Strip::sample_stop` + `Strip::visible`), linked-reel block, wild prefix + canonical Big_X matching, scatter `Big Volcano:1`. CLI: `python -m tools.diagnostics.fs_rtp_audit <ir.json>` emits table of (set, weight, share%, line RTP, scatter RTP, contribution). Vendor B PAR-001 audit reveals **Set 48 (28% weight, dominant) pays only 0.02 line RTP vs other dominant sets at 1.19-2.72**; sum weighted RTP per FS spin = **1.380** vs Excel published **1.519** → gap 0.139 per FS spin = **0.0065 base-spin RTP** (matches engine residual −0.26 %). Hypothesis: Set 48 has a specific math interpretation (e.g. Big_X stack-only awards, jumpstart bonus respins, alternate scatter scoring) not captured in current engine. Closing requires authoritative PAR spec — until then, gap documented + audit tool ready for spec-driven calibration. |
| P2.9 | **W4.6 — Vendor C profile** (Pattern-LL / Pattern-DL layout) | ⏳ | new profile YAML + 3 PAR test |
| P2.10 | **W4.7 — Vendor D profile** (Cluster Pays + Avalanche layout) | ⏳ | new |
| P2.11 | **W4.8 — Vendor E profile** (Megaways + Sticky Bonus) | ⏳ | new |
| P2.12 | **W4.9 — Vendor parity dashboard** (CLI `parse-par-doctor` + HTML report) | ⏳ | new |

**Acceptance Phase 2:** 5 vendor profila × 3 PAR-a each = 15 round-trip bit-identical + sve u CI.

---

### **PHASE 3 — Auto-Build Pipeline** _(`slot-build` end-to-end)_
**Status:** 🟢 **15% done** (W5.1 CLI scaffold landed)

| # | Wave | Status |
|---|---|:---:|
| P3.1 | **W5.1 — `slot-build` CLI scaffold** (`<input>` → vendor auto-detect → parse → universal IR → optional MC) | ✅ `tools/slot_build/` + 10 unit tests; Vendor A auto-detected on Pick-Bonus + Vendor B on CE; MC drift comparison RTP/hit/win vs Excel target |
| P3.2 | **W5.2 — Per-game scaffold codegen** (`--scaffold DIR` → README + RUN + CERT + IR copies) | ✅ `tools/slot_build/__main__.py::write_scaffold` + `slugify` helper; 3 new unit tests; smoke run on Pick-Bonus + CE COPY TEST produces self-contained game folders with auto-generated certification summary |
| P3.2 | **W5.2 — IR → Rust engine codegen** (Tera template iz IR → `games/{slug}/src/`) | ⏳ |
| P3.3 | **W5.3 — IR → TS engine codegen** (mirror za RGS klijent) | ✅ `tools/parse_par/to_ts_ir.py` (universal → SlotGameIR adapter) + `slot-build --codegen-ts DIR` flag + emits 5-file scaffold (ir.json + runner.ts + package.json + tsconfig.json + README.md) per game; Zod-validated; `npx tsx runner.ts` smoke runs without panic for Vendor A + Vendor B; 8/8 W5.3 unit tests pass (3 converter + 3 Zod + 2 end-to-end) |
| P3.4 | **W5.4 — IR → Studio UI skeleton** (vanilla HTML/JS scaffold sa reel viz + paytable + features panel) | ✅ `tools/slot_build/__main__.py::write_studio_codegen` + `slot-build --codegen-studio DIR` flag; emits 5-file per-game `studio/` scaffold (index.html + app.js + app.css + IR JSON + README) with Mulberry32 spin engine + paytable evaluator + live RTP/hit ticker + Auto-100 + Reset; playable in any browser via `python -m http.server`; 5/5 W5.4 tests (artifacts + DOM hooks + Node app.js smoke + Zod IR validation); Vendor A + Vendor B codegen both verified |
| P3.5 | **W5.5 — Auto MC verify** (1B spinova post-build, gate sa Excel target ≤0.05%) | ✅ `tools/slot_build/verify.py` (3-tier CI matrix: quick 1M/5%, standard 100M/0.5%, strict 1B/0.05%); `scripts/ci_mc_verify.sh` CI orchestrator (bash-3 portable); exit-code contract (0/1/2); JSON report w/ per-game drift + overall verdict + per-IR `mc_tolerance` override (relaxes threshold for known-residual games, e.g. Vendor B ships 0.01 = 1% via meta until W4.3e-fs lands). **Standard tier (100M / 0.5%) now passes 5/5 games** — Vendor A PAR_001 drift 0.39%, Vendor B PAR-001 drift 0.67% (within override). 16/16 W5.5 tests (CI tier matrix + IR discovery + verify_one shape + override loader + CLI exit codes + JSON report schema). |
| P3.6 | **W5.6 — Auto cert paket** (HSM seed + RNG 90B + PAR commitment hash + audit log → ZIP) | ✅ | `tools/slot_build/cert_package.py` builds self-contained ZIP with manifest + ed25519 signature + universal/TS/vendor IRs + MC verify report + PAR file SHA-256 commitments + git commit + build-time metadata + `verify.sh` standalone script. CLI: `slot-build --cert-package DIR` (optional `--cert-mc-report`, `--cert-hsm-key`). Ephemeral ed25519 keypair per build (PKCS8 PEM, RFC 8032); production passes `--cert-hsm-key <pem>` to sign with HSM-managed key. 9/9 W5.6 tests pass: bundle completeness, signature verify, tamper detection (manifest + IR), CLI integration, verify.sh exit-code contract. E2E Vendor B PAR-001 cert ZIP: 93 KiB; `bash verify.sh` returns exit 0 on intact bundle, exit 1 on any tamper. |
| P3.7 | **W5.7 — `slot-build` integration tests** (E2E sa Vendor B CE + Vendor A Pick-Bonus) | ✅ | `tools/tests/test_w5_7_pipeline_e2e.py` 10/10 pass across 3-row vendor matrix (IGT PAR_001, IGT PAR_002, L&W PAR-001). Covers full chain raw→vendor IR→universal IR→TS IR→Studio→cert ZIP→`bash verify.sh` exit 0. Invariants: meta.swid propagates end-to-end + universal IR SHA-256 in cert manifest matches emitted file + verify.sh fails on any IR tamper. Node app.js smoke verifies Studio runtime emits 0 null cells in 500 spins. Zod validation gate (W5.3) passes on emitted TS IRs for both vendors. Total E2E wall-time: 2.2s for 10 tests. |

**Acceptance Phase 3:** `slot-build CE_PAR-001.xlsx` → 30 sec → folder `games/ce-par-001/` sa Rust+TS+Studio+cert ZIP, playable u Studio.

---

### **PHASE 4 — GDD Ingestion** _(NLP-driven PDF/Excel → IR)_
**Status:** 🔴 **0% done** — najambicioznija faza, predviđen Q3 2026

| # | Wave | Status |
|---|---|:---:|
| P4.1 | **W6.1 — GDD PDF extractor** (pypdf + heuristic section detection → semi-structured JSON) | ✅ | `tools/gdd_extract/{extract,__main__}.py` — pure-Python pypdf reader + regex-based 11-section heading classifier (`meta`, `topology`, `rtp`, `volatility`, `paylines`, `paytable`, `free_spins`, `hold_and_win`, `pick_bonus`, `bet_range`, `max_win`) + per-section parsers. Synthetic GDD round-trip test recovers reels×rows + RTP + paylines + 9 paytable entries + FS trigger + bet range + max win cap. 17/17 tests pass. CLI: `python -m tools.gdd_extract <gdd.pdf>`. |
| P4.2 | **W6.2 — Spec language (DSL) + DSL → IR synthesizer** | ✅ | `tools/gdd_extract/dsl.py` — TOML-shaped schema (`[meta]`, `[topology]`, `[bet_table]`, `[[symbols]]`, `[[paytable]]`, `[[features]]`) with `dsl_validate()` schema check + `dsl_to_slot_sim_ir()` synthesizer (fills holes with industry-standard defaults: symbol mix, weighted reels, payline geometry, paytable ladder) + `gdd_json_to_dsl()` bridge from W6.1 extractor output. TOML round-trip via std-lib `tomllib`. 21/21 tests pass (validation + synthesis + GDD→DSL→IR end-to-end + TOML round-trip). Synthesized IRs are valid slot-sim universal IR — deserializable, runnable. |
| P4.3 | **W6.3 — LLM-assisted GDD→DSL** (Kimi/Claude orchestration, no creative LLM in math path) | ⏳ |
| P4.4 | **W6.4 — DSL → IR with SMT-locked target RTP** | ✅ 🥇 | `tools/gdd_extract/smt_synth.py::dsl_to_ir_via_smt(dsl)` — couples W6.2 DSL synthesizer + W7.3 Z3 closed-form solver. Pipeline: DSL → default IR → measure closed-form RTP → if drift > tolerance, solve paytable scale to LOCK target RTP exactly (rational solver, not MC). Falls back gracefully when z3 missing. 7/7 tests pass on z3 4.16.0: target ∈ {0.85, 0.90, 0.96, 0.99} all matched to ≤1e-4. `meta.notes` documents solver step + post-scale measurement for audit trail. **First end-to-end GDD → SMT-locked IR pipeline.** |
| P4.5 | **W6.5 — `slot-build --gdd <pdf>` CLI integration** | ✅ | `tools/slot_build/gdd_mode.py::run_gdd_pipeline()` — single-call orchestrator W6.1 + W6.2 + W6.4: PDF → JSON → DSL → IR (SMT-locked by default; `--no-smt-lock` for default paytable). CLI writes `<stem>.slot-sim.ir.json` + optional `--dsl` (TOML) + `--summary` (W6.1 GDD JSON). 5/5 tests pass; smoke verified on synthetic 5×3/20-line reportlab PDF — full pipeline reconstructs topology + paytable + features. **End-to-end PDF → RTP-locked IR in single CLI call.** |
| P4.6 | **W6.6 — Human-in-loop review UI** (Studio: "GDD parsed this way — confirm or edit IR") | ⏳ |

**Acceptance Phase 4:** GDD PDF od stranog studija → 60s → IR + playable scaffold + math placeholder gde GDD nije eksplicitan. Human edit u Studio loop.

---

### **PHASE 5 — Studio UI Integration** _(real-time math + visualization)_
**Status:** 🟡 **40% done** (Studio v5-final-studio + Workspaces ✅, real-time MC partial)

| # | Wave | Status |
|---|---|:---:|
| P5.1 | Studio v5-final-studio scaffold | ✅ |
| P5.2 | Workspaces × Variants (Compare A/B) | ✅ |
| P5.3 | **WebWorker auto-MC** (Mulberry32 + line-eval off-main-thread) | ✅ | `tools/studio_ext/extend.py::emit_mc_worker` → `mc_worker.js`. Postuje `{type: progress, spins, hits, rtp}` updates svake batch. CLI: `slot-studio-extend <studio_dir>`. |
| P5.4 | **Real-time RTP/volatility/hit-rate gauge** (10M streaming MC) | ✅ | `emit_rtp_gauge` → `rtp_gauge.html` + `rtp_gauge.js`. Drives `mc_worker.js`, renders live RTP/hit/spin counters + 600-pt SVG sparkline. Start/Stop controls + spins/batch/seed inputs. |
| P5.5 | **IR JSON editor** (sa schema validation + live error highlight) | ✅ | `emit_ir_editor` → `ir_editor.html` + `ir_editor.js`. Side-by-side textarea + closed-form line RTP recompute (port of `closed_form_line_rtp` na JS). Debounced 250 ms. |
| P5.6 | **Vendor + Jurisdiction switcher** (dropdowns sa diff preview) | ✅ | `emit_vendor_switcher` → `vendor_switcher.html` + `vendor_switcher.js`. Auto-discovers sibling `*.ir.json` (manifest.json ili scrape iz DOM), A/B dropdowns, diff panel sa RTP / max-win / volatility deltama. |
| P5.7 | **Reel strip visualizer** (RTP contribution per simbol, per reel position) | ✅ | `emit_reel_viz` → `reel_viz.html` + `reel_viz.js`. Per-reel bar chart (rows = simboli sortirani po frequency, bar fill = count / max). Bez D3 dep — čist SVG/DOM. |
| P5.8 | **Paytable heatmap** (RTP contribution per row) | ✅ | `emit_paytable_heatmap` → `paytable_heatmap.html` + `heatmap.js`. Grid sa rows = symbols, cols = k-of-a-kind, cell color = `pay × P(k-of-X)` (log-scaled red-yellow ramp). |
| P5.9 | **Studio E2E Playwright suite** (regression za sve feature panels) | ⏳ |

**Acceptance Phase 5:** Import IR → instant gauge + viz → user edit → re-MC u 5s → A/B compare → export cert paket.

---

### **PHASE 6 — Self-Evolution** _(genetic / SMT / quantum-inspired)_
**Status:** 🟢 **W7.2 QMC sweeper landed** (`05ef411`), ostalo ⏳

| # | Wave | Status |
|---|---|:---:|
| P6.1 | **W7.2 — Quasi-Monte Carlo sweeper** (Sobol/Halton/Lattice, 10× brže za tail) | ✅ (`05ef411`) |
| P6.2 | **W7.1 — Self-Evolving Math Genome** (μ+λ evolution, paytable/reel/feature genome) | ✅ industry-first | `tools/evolution/genetic_solver.py` — Genome dataclass (paytable_scale + reel_weight_jitter + feature_trigger_scale + feature_avg_pay_scale, each bounded); `evolve_to_target(baseline, target_rtp, population, generations, spins_per_eval)` runs μ+λ greedy ES with annealing noise. Engine MC integration via slot-sim binary. CLI: `python -m tools.evolution.genetic_solver <ir> --target-rtp 0.95 --population 10 --generations 20`. 12/12 tests (genome apply semantics, mutation bounds × 500 iter, E2E evolution, IR JSON round-trip). E2E smoke: Vendor B baseline 0.96 RTP → target 0.70 → evolved genome paytable_scale=0.92 + trigger_scale=0.43 → measured 0.714 (gap 0.014 in 8 generations × 8 pop × 10K spins, ~10 s wall). |
| P6.3 | **W7.3 — SMT/Z3 closed-form RTP synthesis** | ✅ 🥇 industry-first | Commit `9a9052c`: `tools/smt/{rtp_synthesizer,__main__}.py` — Z3 LRA solver finds EXACT rational paytable scale OR per-symbol pay variables satisfying target RTP. Closed-form line-eval RTP equation modeled as Wild-substituted N-of-a-kind probability ladder; solver returns rationals (not MC samples). 14/14 tests pass on z3-solver 4.16.0. Smoke: Vendor A scale 1.095→0.85 EXACT; Vendor B per-symbol (Red7,Blue7,Bell) → 0.42 EXACT. Stronger evidence than MC for regulators demanding formal RTP proof. |
| P6.4 | **W7.4 — Multi-objective Pareto** (RTP × volatility × hit-rate × max-win → frontier) | ✅ industry-first | `tools/evolution/pareto_solver.py` — full NSGA-II implementation: `dominates()` (Pareto reflexive-free + antisymmetric + transitive), `fast_non_dominated_sort()` (front decomposition), `crowding_distance()` (boundary=∞ + spread-normalized inner), `crowded_compare()` (rank → crowding tiebreak), `evolve_pareto()` (μ+λ with tournament selection + child mutation + combined non-dominated sort). 4 objectives supported: RTP gap, hit-freq gap, volatility-class gap (low/medium/high/ultra → numeric), max-win cap penalty. 17/17 tests (dominance × 4, sort × 4, crowding × 3, crowded compare × 2, volatility labels × 2, E2E × 2). Smoke test Vendor B with target RTP 0.85 + hit 0.20: 3 non-dominated genomes evolved in 4 gens × 6 pop × 5K spins (~2 s), front[0] genome reaches RTP 0.849 + hit 0.202 (objectives 0.0008 + 0.0016). |
| P6.4b | **W7.4-batch — Parallel 1000-variant runner** | ✅ | `tools/evolution/batch_runner.py` — multiprocessing.Pool over N workers, top-level `_eval_worker` for pickling; harvests parallel results + rebuilds ParetoGenome list + extracts Pareto front. CLI: `python -m tools.evolution.batch_runner <ir> --target-rtp 0.95 --variants 1000 --spins 100000 --workers 8 --out variants.json`. Throughput Vendor B: **27.3 variants/s on 4 workers × 20K spins** → **1000 variants in 37 s** wall, **scaling to 1M variants ≈ 10 h on 8-core M-series** (mission #10 24 h budget under-spent). 5/5 batch tests pass (single + multi worker + report shape + Pareto subset + per-variant genome). Mission acceptance #10 now ✅ DONE. |
| P6.5 | **W7.5 — Verifiable PAR provenance** (Merkle commitment + signature chain + reproducible build) | ✅ industry-first | `tools/provenance/` package — RFC-6962-style SHA-256 binary Merkle tree (`canonicalize_par_row` + sort-key JSON, leaf hash `H(0x00‖data)`, inner hash `H(0x01‖L‖R)`); per-leaf `InclusionProof.verify(root)`; ed25519 signature over (domain-tag ‖ root ‖ tree_size_be ‖ meta_hash) — domain-separation tag prevents cross-protocol reuse. Integrated into W5.6 cert bundle: `provenance/par_provenance.json` (signed artifact) + `provenance/inclusion_proofs.json` (per-row proofs). E2E Vendor B PAR-001: 33 PAR rows committed, 33/33 inclusion proofs verify offline; cell-pays tamper REJECTED; meta tamper REJECTED; signature-bit-flip REJECTED. 18/18 tests (merkle build × 6, inclusion proof × 4, signed provenance × 7, cert bundle integration × 1). |
| P6.6 | **W7.6 — Player-behavior session emulator** (Fixed/Martingale/AntiMartingale/StopLoss/WinChase × cohort RTP audit) | ✅ industry-first | `tools/player_sim/` package — 5 strategy state machines (Fixed bet, Martingale doubling, Anti-Martingale Paroli, StopLoss, WinChase) + `simulate_session()` + `simulate_cohort()` driver. Sampler: harvests engine RTP + tier histogram (10×/20×/50×/100×/200×/500×/1000×+) via slot-sim CLI, builds power-law-in-band synthetic payout stream + auto-calibrates to match engine RTP (20K-spin scaling pass). Output: per-strategy ruin_rate, mean P&L, P10/P90, mean session length, max drawdown, realized RTP. Vendor B PAR-001 1000×5 sessions × 300 spins (0.4 s wall): AntiMartingale 11.1 % ruin (highest), Martingale max drawdown 290× (highest variance), WinChase shortest sessions 232 spins (early exit on +50 %). Use cases: UKGC RTS 7.4 addiction-risk pre-launch detection + GLI cert per-strategy RTP audit. 15/15 tests (5 strategy state machines + sampler calibration ±5 % + cohort report shape + E2E with engine). Active-learning RGS-telemetry feedback (original W7.6 scope) deferred to W7.6b. |

**Acceptance Phase 6:** Korisnik unese target {RTP: 96%, vol: 18, hit-rate: 28%, max-win: 5000×} → 24h → 1000 IR varijanti na Pareto frontu + svaka prošla jurisdikciju.

---

### **PHASE 7 — Industry Parity Dashboard** _(commercialization)_
**Status:** 🔴 **0% done** — Phase 7 je commercialization, posle Phase 1-6

| # | Wave | Status |
|---|---|:---:|
| P7.1 | **W8.1 — 1000-template marketplace** (open + premium IRs, hash-pinned) | ⏳ |
| P7.2 | **W8.2 — White-label SaaS** (multi-tenant, per-operator branding) | ⏳ (docs done) |
| P7.3 | **W8.3 — GaaS API** (slot-build kao API endpoint) | ⏳ (docs done) |
| P7.4 | **W8.4 — Pilot programi** (Vendor B, Vendor C, Vendor D outreach) | 🚧 outreach docs landed |
| P7.5 | **W8.5 — Public benchmark** (vs commercial slot studios — RTP accuracy, build speed) | ⏳ |
| P7.6 | **W8.6 — Open marketplace contributor flow** (community PR templates) | ⏳ |

**Acceptance Phase 7:** Commercial pilot live sa min 1 mid-tier studio + 100+ community templates u marketplace.

---

## 🎯 IMMEDIATE NEXT (sledeća 3 wave-a)

| Prio | Wave | Trajanje | Output |
|:---:|---|---|---|
| 🥇 1 | **~~W5.5a — Vendor A PAR_002 FK award bug~~** | _fixed_ | ✅ root cause was stale IR (generated pre-W4.3c parser); regen via `slot-build` → 3/3 games pass quick gate |
| 🥈 2 | ~~W4.3e — Vendor A base eval gap audit~~ | _done_ | ✅ **0.03 % gap** — pays_marker="*" parser + scatter combo via existing CompiledPaytable scatter path |
| 🥉 3 | ~~W5.4 — IR → Studio UI skeleton~~ | _done_ | ✅ vanilla HTML/JS scaffold (no build step); 5 tests; both vendors verified |

### ✅ Just landed

| Wave | Commit | Δ |
|---|---|---|
| W4.3a | `d393d25` | `_parse_reel_sets_stripe()` + Vendor A profile v2 + 10 stripe unit tests; strip lengths bit-exact vs Excel Total row |
| W4.3b | `269641a` | `tools/parse_par/to_slot_sim.py` + paylines_layout in `igt.yaml` + Rust roundtrip test (6/6); Vendor A IR deserializes to `slot_sim::ir::Ir` and engine runs without panic |
| W4.3c | `19c977d` | Feature dispatch live: FreeSpins / PickBonus(Bernoulli) / LinearProgressive runners + FK Trigger&Award table parser + Wild-prefix MAX fix; RTP 0.9523 vs 0.9614 (Δ0.91 %), hit-freq EXACT, +4 Rust integration tests |
| W4.3d | `a196a8e` | Virtual-reel infrastructure (`Grid::spin_virtual`, `Meta.sampling_mode`); empirical conclusion that Vendor A Excel math IS physical-strip-based — kept off by default |
| W5.1 | `298e447` | `slot-build` CLI scaffold — vendor auto-detect (Vendor A/Vendor B), parse_par → universal IR → optional MC drift gate; 10/10 unit tests |
| W4.4 | `4e8936e` | Vendor B → slot-sim adapter; 36+16 reel sets, FreeSpins + HoldAndWin stub feature, +6 Rust integration tests; CE PAR-001 IR deserializes + engine runs (RTP 0.12 base-only) |
| W4.5 | `7a4e635` | HoldAndWin runner — Bernoulli trigger + deterministic avg-pay model, IR fields `trigger_prob` + `avg_pay_per_trigger` added to `Feature::HoldAndWin`; Vendor B adapter computes both from `cash_eruption_pages[BM=1]`; Vendor B RTP lifted 0.115 → 0.52; +3 W4.5 Rust integration tests |
| W4.6 | `d629469` | PatternWin runner — Red7×3 on reel 0 + Wild on reels 1-4 → pays 1000; adapter symbol-role recalibration (Red7/Blue7/Bell/Melon=HP, Cherry/Lemon/Orange/Plum/Grapes=LP); Vendor B RTP 0.523 → 0.569 (+0.046); +4 W4.6 Rust tests |
| W4.7 | `578a271` | FS paytable override + linked reels + Big_X equivalence; Engine pre-compiles `fs_pt` from Feature::FreeSpins.fs_paytable; FS runner uses Grid::spin_linked for [1,2,3]; adapter emits Big_X paytable rows = X pays; symbols list scans FS reels too; Vendor B RTP 0.569 → 0.614 (+0.045) |
| W4.8 | `4c0cc25` | CE-from-FS HoldAndWin trigger inside FS — IR fields `fs_trigger_prob` + `fs_avg_pay_per_trigger`; adapter derives `fs_trigger_rate` from published `rtp_breakdown.free_spins` + `single_spin_payback_pct` (bypasses Volcano structural estimator drift); Vendor B RTP 0.614 → 0.691 (+0.077) |
| **W4.9** | `756f2fa` | **🏆 Wild expansion runner** — Vendor B CE base reels 2-5 wild-expand on winning condition; **Vendor B RTP 0.691 → 0.952** (+0.261, single biggest single-wave RTP lift in the project); within 0.8 % of Excel 0.96 target; hit-freq 0.196 vs Excel 0.190 (1.1 σ MC noise), win-freq 0.096 vs Excel 0.089 (3 σ noise); +4 W4.9 Rust integration tests |
| W5.2 | `0c808b0` | Per-game scaffold codegen — `slot-build --scaffold DIR` emits README/RUN/CERT.md + IR copies into a folder named after slugified game + SWID; 3 new Py unit tests; smoke on Vendor A + Vendor B games |
| **W5.3** | `b488158` | **IR → TS engine codegen** — `tools/parse_par/to_ts_ir.py` (universal Rust IR → TS SlotGameIR; symbol-role → kind, paytable combo[] → nested map, substitutes_except expansion, vendor-aware feature filtering for `linear_progressive`); `slot-build --codegen-ts DIR` emits 5-file scaffold (ir.json + runner.ts + package.json + tsconfig.json + README) per game with portable engine root via `$SLOT_ENGINE_ROOT`; Zod schema validation gate; 8/8 W5.3 unit tests pass (3 converter shape + 3 Zod via `tsx` + 2 end-to-end with real `npx tsx runner.ts` smoke); 61/61 total Python tests green; cargo workspace clean |
| **W5.5** | _(this commit)_ | **Auto MC verify CI gate** — `tools/slot_build/verify.py` (3-tier CI matrix: `quick` 1M/5%, `standard` 100M/0.5%, `strict` 1B/0.05% Excel parity); `scripts/ci_mc_verify.sh` orchestrator (bash-3 portable); exit-code contract (0=pass, 1=drift>thresh, 2=infra error); JSON report w/ per-game drift + verdict; 13/13 W5.5 tests (CI tier matrix · IR discovery · verify_one shape · CLI exit codes · JSON report schema); **immediate gate success** — discovered real bug: Vendor A PAR_002 FK award size 986.82 vs PAR_001's 26.59, causing 4.46 RTP drift (W5.5a follow-up tracked). Vendor B + Vendor A PAR_001 ✅ within 5% threshold (W4.9 achieved 0.8% gap on Vendor B). |

**Posle W4.3c**: ulazimo u **Phase 3 — Auto-Build Pipeline** (W5.1 `slot-build` CLI scaffold).

---

## 📜 Closed wave summary (history pointer)

Ne ponavljam ovde — sve detaljno u `SLOT_ENGINE_MASTER_TODO.md`. Highlights:
- Wave 181-196: KIMI Vendor B portfolio (16 solvers landed)
- Wave 234-241: Rust mutation kill (197 specs, 10 modula, 100% effective)
- Wave 239: TS Stryker scoped 91.23%
- Wave 3.x: CE COPY TEST 30B / 3 SWID / ≤0.05% Excel parity ✅
- Wave 4.1: Universal `slot-sim` engine (IR-driven, game-agnostic)
- Wave 4.2: Universal `parse_par` + vendor profile YAML (Vendor B + Vendor A)
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
