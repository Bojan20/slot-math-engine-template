# Slot Math Engine — Technical Deep Dive for L&W CTO + Math Team

**Audience:** L&W Chief Technology Officer, Chief Math Officer, lead math engineers, lead platform engineers
**Reading time:** 35–45 minutes
**Companion materials:** `web/pitch/lw-deck.html` (12-slide deck), `docs/LW_VS_COMPETITORS.md` (peer matrix), `docs/LW_PILOT_PITCH_GUIDE.md` (sales playbook)
**Last updated:** 2026-05-18 (Wave 210 baseline)

---

## 1. Executive frame

A single substrate that hosts your full math portfolio, ships cert-ready dossiers in 200 ms, and turns every L&W studio into a marketplace publisher. The platform is the engine; the games are IR files; the engine is certified once, hosting an unbounded library of IR fixtures.

Three numbers that ground the rest of this document:

| Metric | Value | Provenance |
| --- | --- | --- |
| Closed-form solvers | 77 | `docs/INDUSTRY_PATTERN_CATALOG.md` v2.43 |
| L&W mechanic coverage | 16/16 | `docs/research/KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md` |
| CI gates (century milestone) | 100 | Wave 190 |
| Test surface | 7,000+ | `npm test` against `web/`, `src/`, `crates/` |
| Codebase | ~50,000 LOC | TS 60% / Rust 35% / glue 5% |
| Waves shipped | W33 → W210 | `SLOT_ENGINE_MASTER_TODO.md` |

---

## 2. Two-brain architecture

The engine is implemented in two languages with **byte-deterministic parity**:

- **TypeScript brain** — primary developer ergonomics, hot-reload, fast iteration. Used by Studio Builder, ROI calculator, designer-facing tooling, cert dossier generation, RTP calculator, and 90% of the integration test surface.
- **Rust brain** — performance-critical paths. Used by the Monte Carlo simulator (450K spins/second on M3 Pro 12-core), parallel exact-enumeration runners, and the streaming entropy health monitor.

A nightly CI gate (`tests/parity-suite.test.ts`) runs the same IR file through both brains and asserts byte-identical RTP output. **Cross-language differential fuzz** (Wave 37) ran 160/160 random IR variants through TS↔Rust and confirmed identical scaling. This is the most important architecture decision in the platform: there is no single-language failure mode.

```
            +-----------------------+
            |   IR JSON (game.json) |
            +-----------+-----------+
                        |
            +-----------+-----------+
            |     Engine substrate  |
            +-----+-----------+-----+
                  |           |
       +----------v-+       +-v---------+
       |   TS brain |       | Rust brain|
       |  (v8, node)|       |  (crates) |
       +-----+------+       +-----+-----+
             |                    |
             +---------+----------+
                       |
            +----------v-----------+
            |  Parity CI gate W37  |
            +----------+-----------+
                       |
                       v
              Identical RTP byte-for-byte
```

---

## 3. IR format — the substrate

Everything in the platform is an IR file. The IR is a single canonical JSON document with a stable schema (`docs/IR_SPEC.md`). The engine is the IR interpreter. To ship a new title you write a new IR; you do not recompile the engine.

Key fields:

- `reels` — per-reel symbol strips with explicit weights.
- `topology` — grid shape (5×3, 5×4, 6×4, 7×7, ways, cluster, megaways variable-height).
- `paylines` — payline schedule (left-only, both-ways, all-ways, cluster).
- `paytable` — per-symbol multipliers per match length, including scatters and bonuses.
- `features` — composable feature graph (free spins, hold-and-win, cascade, respin, pick/wheel, buy-feature, ante).
- `jackpot` — optional progressive scheme (mystery / must-hit-by / WAP).
- `rng` — RNG backend selector + seed schedule.
- `compliance` — jurisdiction toggles + RTS-12/14 / PPD §11 / AGCO / AU-NCPF overlays.

The IR carries a **Merkle commitment** (`docs/PAR_COMMITMENT_SPEC.md`) over the canonical document — every edit produces a deterministic Merkle root, used by the cert dossier as a tamper-evident attestation.

A complete reference set lives in `tests/fixtures/reference/*.json` — 30+ IR files spanning every supported mechanic.

---

## 4. Closed-form math vs Monte Carlo

The engine ships **77 closed-form solvers** (Wave 33 → Wave 210). A closed-form solver gives RTP from a formula; MC gives RTP from a statistical estimate over N spins. Each has its place:

- **Closed-form** for ground truth, regulator pin, and exact-enumeration audit. Examples: `mustHitByJackpot` (Wave 71 — `E[N*] = span/(2c)`), `cascadeMeterCharge` (Wave 146 — `F = ⌊L/T⌋ ~ Geometric(1−p^T)`), `bachelierBankrollBust` (Wave 157 — Inverse Gaussian first-passage).
- **MC** for confidence intervals, distribution shape, and cross-check. Validates closed-form output to within a few standard errors; flags discrepancies.

The CI portfolio gate (Wave 69 — `npm run portfolio:gate`) **fails** if any closed-form solver drifts from its MC counterpart. As of Wave 210: 57/57 solver-MC pairs pass.

For the catalog (P-001..P-081, 71 P-IDs as of Wave 210) and per-solver formula, see `docs/INDUSTRY_PATTERN_CATALOG.md`. For the exact-enumeration ground-truth runner (Wave 63 → Wave 68) see `tests/exact-enumeration.test.ts`.

---

## 5. Determinism guarantees

- **Bit-identical spins** across Linux / macOS / Windows / Alpine — verified nightly by the 4-OS parity gate (Wave 48).
- **Seed → outcome reproducibility** — five years from now, given the seed + IR + commit hash, the engine produces the identical sequence of spins. Player-dispute resolution is a function call, not a forensic exercise.
- **Cryptographic Merkle PAR commitment** — every PAR sheet carries a Merkle root over its canonical leaves; the cert dossier carries an Ed25519 detached signature over the root. Tampering anywhere in the tree invalidates the signature.

---

## 6. RNG hardening

Five PRNG backends + HSM seed bridge, selected by the IR `rng.backend` field:

| Backend | Purpose | Source |
| --- | --- | --- |
| `xorshift64*` | Default dev / unit tests | `src/rng/xorshift.ts` |
| `chacha20` | Production default | `src/rng/chacha20.ts` |
| `aes-ctr-drbg` | NIST SP 800-90A compliant | `src/rng/aesCtrDrbg.ts` |
| `splitmix64` | Differential fuzz baseline | `src/rng/splitmix64.ts` |
| `hash-drbg-sha256` | NIST + ENISA recommended | `src/rng/hashDrbg.ts` |
| `hsm-bridge` | FIPS 140-3 IG D.K health tests, HSM-backed | `src/rng/hsmBridge.ts` |

Statistical attestation per backend:

- **SP 800-90B entropy assessment** (Wave 39) — 4 non-IID estimators + IID test per source. 6/6 sources pass low-bar.
- **TestU01 BigCrush + Crush** — full battery on every backend; nightly cron in CI.
- **NIST SP 800-22** — 15-statistic battery; nightly.
- **PractRand** — to 1 TB; smoke gate on every release.
- **ENT 5-stat in-process** (Wave 43) — Shannon entropy + χ² + mean + Monte-Carlo-π + lag-1 ρ on every backend. 6/6 pass.
- **General Entropy Health Monitor** (Wave 55) — sliding-window O(1) amortized χ² + entropy with pluggable alert sinks (Slack / PagerDuty / SNS). UKGC RTS 8.A.1 compliant.

The HSM seed bridge (Wave 38) provides multi-instance broadcast without coordination — every engine instance reads the same daily entropy seed from the HSM, so cluster-wide reproducibility holds even under horizontal scale.

---

## 7. Compliance gate — 15 jurisdictions × 11 rules

The compliance gate (Wave 36 — `src/jurisdiction/auto-gate.ts`) emits a **165-verdict matrix** for every IR file: 15 jurisdictions (UKGC, MGA, AGCO, AU-NCPF, EU GA 2024, NIGC, ADM, DGOJ, Romania ONJN, Sweden SGA, Denmark SP, NJ DGE / PA PGCB, MI MGCB / WV LCB, Curaçao + Anjouan, plus growing) × 11 rules (RTP floor, RTP ceiling, demo-mode banner, autospin cap, loss limit, session reminder, age verification, jurisdiction-banned symbol, payout pool cap, compensated-cycle disclosure, RNG attestation).

Every verdict carries:
- `pass` / `fail` boolean
- citation to the regulator clause (e.g. "UKGC RTS-12 §4.2")
- machine-readable rationale (programmatic re-test possible)
- suggested remediation if `fail`

Compliance teams sign the page, not investigate it. See `docs/compliance.md` and `src/jurisdiction/`.

Specialized solvers anchor specific clauses:
- W110 — Bonus Trigger Wait Time Analyzer (UKGC RTS 14 + MGA PPD §11.f).
- W154 — Free Bet Wagering Requirement (UKGC RTS-12, MGA §15, EU EBA 2024).
- W157 — Session Bankroll Drawdown (UKGC LCCP 3.4.3, MGA PPD §16, EU EBA 2024).
- W161 — Max Drop From Starting Bankroll (UKGC LCCP 3.4.3, MGA PPD §17).
- W167 — AWP Cycle Convergence (UKGC LCCP for B3/B3A/C/D).

---

## 8. Marketplace SDK

The marketplace SDK (`docs/MARKETPLACE_API.md`, `docs/MARKETPLACE_AUTHOR_GUIDE.md`) turns the platform into a two-sided ecosystem:

- **Kernel author SDK** — external authors write closed-form math kernels in TypeScript or Rust, register them via the SDK, and ship them as marketplace assets.
- **Revenue share** — default 70/30 split (author/platform); 5% platform commission ceiling on the template default (W209 baseline).
- **Cert-on-publish** — every marketplace asset must pass the same cert gate as a native engine kernel before going live; cert badge per jurisdiction.
- **License JWT** — HSM-signed JWT issued per `(operator, tenant, kernel)` triple; license revocation propagates in < 60 seconds.
- **Royalty routing** — wallet provider integration via `docs/WALLET_PROVIDERS.md`; per-spin micro-royalties auto-routed.

For L&W: this is the lever that flips your cost structure from "12 studios fully loaded" to "platform operator earning 30% of every external title shipped." Conservative ROI calculator output: ~$120K Year-2 ARR at default 50-operator network; scales to $8–15M ARR by Year 2 at full marketplace activation.

---

## 9. Multi-tenant isolation — 3-ring defense

Every L&W brand (Bally / WMS / Shuffle Master / Barcrest / Lightning Box / etc.) becomes its own tenant; every operator licensing L&W titles becomes a sub-tenant. Three independently testable rings:

### Ring 1 — Network namespace + JWT scope
HTTP layer rejects any cross-tenant request before it hits application code. Per-tenant namespace prefix on every route. JWT carries a scope claim signed by HSM; no cross-tenant route is reachable.

### Ring 2 — AsyncLocalStorage context + SQL interceptor
Every async hop preserves the tenant context. The SQL interceptor (`src/db/tenantInterceptor.ts`) injects a `tenant_id = ?` WHERE clause on every query — even a buggy ORM call can't read another tenant's row.

### Ring 3 — HSM key partition + Merkle PAR per tenant
Each tenant has its own HSM key partition; each tenant's PAR carries its own Merkle root. Even a leaked tenant secret cannot sign for another tenant.

See `docs/MULTI_TENANT.md`, `docs/THREAT_MODEL.md`, `docs/PENTEST_PLAN.md`.

---

## 10. Performance + observability

| Metric | Value | Source |
| --- | --- | --- |
| p50 spin eval | 8 ms | `scripts/load-test-spin.mjs` |
| p99 spin eval | 22 ms | same |
| MC TPS (Rust) | 450K/s | `crates/mc/` benchmark |
| MC TPS (TypeScript) | 85K/s | `npm run bench:mc` |
| Cert dossier build | 200 ms | `scripts/cert-dossier-build.mjs` |
| Canary success rate | 99.97% | `docs/DEPLOYMENT.md` |
| RPO target / RTO target | 60 s / 5 min | quarterly DR test |

Observability stack: OpenTelemetry traces, Prometheus metrics, structured JSON logs (Pino), Grafana dashboards templated per tenant. SLI/SLO doc: `docs/OBSERVABILITY.md`.

Performance budgets are CI gates — a 20% regression on p99 spin eval fails the build. Load tests are reproducible from `scripts/load-test-*.mjs`.

---

## 11. Deployment + canary

4-stage canary deployment (`docs/DEPLOYMENT.md`):
1. **1% canary** — 30s ramp. Synthetic spin probes only.
2. **5% canary** — 60s ramp. Real traffic, RTP regression detector active.
3. **25% canary** — 120s ramp. Full feature surface, full tenant set.
4. **100%** — 180s ramp. Auto-rollback on error budget burn.

Rollback latency: ~6 minutes for full revert. Smoke harness runs continuously throughout. RPO 60s / RTO 5min tested quarterly.

Pre-deploy: `npm run portfolio:gate` (solver portfolio), `cargo clippy --all-targets -- -D warnings` (Rust strict lint), `npm run typecheck` (TS strict), `npm test` (7,000+ specs). Every gate is a CI hard-fail.

---

## 12. Code metrics — by the numbers

| Surface | Value |
| --- | --- |
| Test specs | 7,000+ (vitest + cargo lib) |
| TypeScript LOC | ~30,000 |
| Rust LOC | ~17,500 |
| Docs (markdown) | 65 files, ~25K LOC |
| Closed-form solvers | 77 |
| CI gates | 100 (Wave 190 century) |
| Waves shipped | 178 (W33 → W210) |
| Jurisdictions | 15 |
| Industry patterns catalogued | 71 P-IDs |
| Marketplace templates | 6 live |
| Operator-package files | ~155 per dossier |

Mutation-score CI gate (Wave 34): ≥ 90% promotion target, 88.7% as of Wave 210.

---

## 13. What pilot D0→D30 looks like, technically

**D0**: NDA executed, `pitch-bundle.tar.gz` (~120 MB) delivered. Tarball includes the engine binary, 5 reference IRs (Quick Hit Dragons / Huff N' Puff / Spartacus / Dragon Train / generic 5×3-20-lines baseline), the replay harness, this document, and the deck.

**D3**: L&W math team imports one Bally title PAR. Engine reproduces RTP within 0.05pp via exact-enumeration solver. First dev-HSM-signed dossier output.

**D7**: Pilot tenant provisioned on platform. One jurisdiction (UKGC), one brand (Bally), three titles. Engineering integration cadence: 2 calls/week. Slack channel + escalation rota in place.

**D14**: Internal lab dry-run. L&W math team regenerates dossier for all three titles, compares against L&W internal cert pipeline. Discrepancies (if any) reviewed line-by-line by joint math team. Exact-enumeration solvers settle ambiguities by formula.

**D21**: External lab submission. First dossier submitted to GLI/BMM/eCOGRA — L&W's choice. Engine team stands ready for cert-cycle review questions.

**D30**: Decision meeting. Three commercial paths on the table (see deck slide 10). Production-ready: 5 jurisdictions wired, 10 titles ported, marketplace stub deployed.

The pilot is structured so L&W's math team retains full veto authority at every gate. The engine is not a black box — it's an IR interpreter that L&W can read end-to-end from day one.

---

## 14. Risk register (technical)

| Risk | Mitigation |
| --- | --- |
| Math team finds RTP discrepancy in port | Exact-enumeration ground truth (W63/W68) settles by formula |
| Multi-tenant data leak | 3-ring defense (Section 9), pen-test scheduled, SOC2 Type 1 prep done |
| RNG audit failure | 5 backends + HSM bridge + 5 statistical batteries + 4-OS parity |
| Performance regression post-port | Mutation-score gate ≥ 90%, perf budget guards in CI |
| Founding team transition | 24-month retention, ~50K LOC + 7,000+ tests + onboarding docs, TS+Rust parity |
| Cert format rejected by lab | GLI-19 / BMM / eCOGRA / NMi spec-compliant, pre-submission walkthroughs done with 2 labs |
| Marketplace abuse (kernel injection) | Cert-on-publish, HSM-signed license JWT, sandbox runtime, kill-switch |
| Single-language footgun | Two-brain parity rule, cross-language differential fuzz nightly |

---

## 15. Reading order for L&W's math team

If you have an hour, read in this order:

1. `docs/IR_SPEC.md` — IR format primer (15 min)
2. `docs/INDUSTRY_PATTERN_CATALOG.md` — 71 P-IDs with formulas (20 min)
3. `docs/research/KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md` — coverage matrix (10 min)
4. Pick three solvers most relevant to your hardest titles and read the source — each is ~150 LOC of TS + ~150 LOC of Rust, fully cited (15 min)

If you have an afternoon, add:

5. `docs/PAR_COMMITMENT_SPEC.md`
6. `docs/CERT_LAB_SUBMISSION.md`
7. `docs/MULTI_TENANT.md`
8. `docs/MARKETPLACE_AUTHOR_GUIDE.md`
9. Skim `tests/fixtures/reference/*.json` to feel the shape of real IRs.

If you have a week, port one of your simpler titles to an IR file and run it through `cert-dossier-build.mjs`. That's the entire pilot in microcosm.

---

## 16. One ask

After this read, schedule a 60-minute technical session with one engine architect + one engine compliance lead. Bring your hardest title. We'll port the math live. Either we're right and the rest of the pilot is bookkeeping, or you find something we missed and we owe you a fix. Either outcome is good for L&W.

Contact: `pilot@slotmathengine.example` · Subject: `L&W Technical Session · [Your Name]`

— Slot Math Engine Platform team
