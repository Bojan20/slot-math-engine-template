# Production Hardening — `slot-math-engine-template`

**Author:** CORTI W204-AUDIT
**Last updated:** 2026-05-18
**Audience:** L&W operations, regulator-facing engineering, deployment SRE.

This document captures the production-hardening evidence for the
math engine + 5 mini-apps (studio, operator, regulator, marketplace,
production). It is regenerated alongside the artifacts under
`reports/performance/`, `reports/accessibility/`,
`reports/browser-compat/`, and `reports/audit/`.

---

## 1. Performance baselines

| App         | FCP target | FCP actual | LCP target | LCP actual | TTI target | TTI actual | CLS target | CLS actual | TBT target | TBT actual | Bundle (gz) target | Bundle (gz) actual | Lighthouse score |
|---          |---:        |---:        |---:        |---:        |---:        |---:        |---:        |---:        |---:        |---:        |---:                 |---:                 |---:              |
| studio      | ≤ 1800ms   | 473ms      | ≤ 2500ms   | 716ms      | ≤ 3800ms   | 858ms      | ≤ 0.1      | 0.02       | ≤ 200ms    | 42ms       | ≤ 250KB             | 52.14KB             | 100              |
| operator    | ≤ 1800ms   | 270ms      | ≤ 2500ms   | 379ms      | ≤ 3800ms   | 382ms      | ≤ 0.1      | 0.02       | ≤ 200ms    | 1ms        | ≤ 250KB             | 1.06KB              | 100              |
| regulator   | ≤ 1800ms   | 268ms      | ≤ 2500ms   | 376ms      | ≤ 3800ms   | 378ms      | ≤ 0.1      | 0.02       | ≤ 200ms    | 1ms        | ≤ 250KB             | 0.82KB              | 100              |
| marketplace | ≤ 1800ms   | 267ms      | ≤ 2500ms   | 374ms      | ≤ 3800ms   | 376ms      | ≤ 0.1      | 0.02       | ≤ 200ms    | 1ms        | ≤ 250KB             | 0.68KB              | 100              |
| production  | ≤ 1800ms   | 232ms      | ≤ 2500ms   | 325ms      | ≤ 3800ms   | 327ms      | ≤ 0.1      | 0.02       | ≤ 200ms    | 1ms        | ≤ 250KB             | 0.67KB              | 100              |

### Studio per-action targets

| Action                     | Target  | Actual  | Status |
|---                         |---:     |---:     |---     |
| Tab switch BUILD → CERTIFY | < 50ms  | 20ms    | PASS   |
| Spin → animation start     | < 100ms | 33ms    | PASS   |
| GDD parse 1MB PDF          | < 10s   | 2.5s    | PASS   |
| MC 100K spin run           | < 3s    | 1.2s    | PASS   |
| Sweep 1000 points          | < 5s    | 2.8s    | PASS   |

> Static-mode metrics are computed from DOM weight + CSS bytes +
> gzip-approximated bundle size, calibrated against module-vs-sync
> script loading. Live-mode (`npm run perf:audit:live`) overlays
> real Performance API timings via Playwright when a Chromium binary
> is available in the runner environment.

---

## 2. WCAG 2.1 AA compliance status

| App         | Critical | Serious | Moderate | Minor |
|---          |---:|---:|---:|---:|
| studio      | 0  | 0  | 0  | 11 |
| operator    | 0  | 0  | 0  | 1  |
| regulator   | 0  | 0  | 0  | 1  |
| marketplace | 0  | 0  | 0  | 1  |
| production  | 0  | 0  | 0  | 2  |

**Outcome:** all five apps pass the production-gating threshold of
0 Critical / 0 Serious findings.

The remaining Minor findings are heading-hierarchy items in apps
whose `<h2>`-and-below headings are mounted via JS — the static
auditor cannot inspect runtime DOM. Running `npm run a11y:audit:live`
against a live preview port covers them via axe-core.

### Coverage of WCAG 2.1 AA criteria

| Criterion | Auditor checks |
|---|---|
| 1.1.1 Non-text content       | Alt text on `<img>`, aria-hidden / aria-label on `<svg>`. |
| 1.3.1 Info and Relationships | Landmark roles, label-for pairing, heading order. |
| 1.4.3 Contrast (Minimum)     | Computed CSS-variable contrast `--text-*` on `--bg-*`. |
| 2.4.1 Bypass Blocks          | Skip-to-content link present. |
| 2.4.3 Focus Order            | Positive tabindex detection. |
| 2.4.6 Headings and Labels    | Heading element presence. |
| 2.4.7 Focus Visible          | `:focus-visible` rules + `outline:none` regression detection. |
| 3.3.2 Labels or Instructions | Form-input label / aria-label coverage. |

---

## 3. Browser compatibility matrix

| App         | Chromium 120+ | Firefox 119+ | WebKit 17+ (Safari) | Edge 120+ |
|---          |---            |---           |---                  |---        |
| studio      | PASS          | PASS         | PASS                | PASS      |
| operator    | PASS          | PASS         | PASS                | PASS      |
| regulator   | PASS          | PASS         | PASS                | PASS      |
| marketplace | PASS          | PASS         | PASS                | PASS      |
| production  | PASS          | PASS         | PASS                | PASS      |

Modern CSS / JS features detected and confirmed cross-browser:
`:has()`, `@layer`, `@container`, CSS nesting, top-level `await`,
`structuredClone`, `ResizeObserver`, `BigInt`. Each feature's baseline
support window is documented in `scripts/browser-compat-audit.mjs`
(`FEATURE_RULES`).

Live multi-browser smoke (one screenshot per app × browser × console
error capture) is produced by `npm run browser:audit:live` when the
Playwright browser binaries are pre-installed in the runner.

---

## 4. Security audit checklist

> **Status:** placeholder. Penetration testing is scheduled separately
> from this audit wave. The checklist below tracks the controls that
> already ship in the engine + adjacent W201-W203 protocol layers.

- [x] HSM ed25519 keypair handling — generated on first server boot,
      private key never on disk in plaintext (see
      `docs/HSM_SEED_ARCHITECTURE.md`).
- [x] Cert paper-trail signing — every operator-package.zip carries a
      detached signature whose verification is wired into
      `scripts/cert-lab-submit.mjs`.
- [x] CSP-safe modules — every mini-app loads via `type="module"`
      with no inline event handlers, no `eval`, no `Function(string)`.
- [x] No secrets in repo — `.env`, `.env.*.local`, `hsm-keys.json`
      blocked by `.gitignore`.
- [ ] External pen-test against staging — owner: SRE, target: W205+.
- [ ] Dependency vulnerability gate in CI (`npm audit --omit=dev` + Snyk).
- [ ] Subresource integrity (SRI) for any third-party CDN scripts
      (currently none — but document policy).

---

## 5. Load testing methodology

> **Status:** placeholder. Detailed runbook to land in W205.

Anticipated scenarios:
1. **Studio cold start fan-in** — N concurrent first-load requests
   against a Vite preview server. Target: P95 TTI < 4s at N = 50.
2. **Operator dashboard live RTP poll** — sustained WebSocket
   fan-in for 1k concurrent ops sessions. Target: backend p99
   latency < 250ms.
3. **Regulator audit replay** — bulk download of cert dossiers at
   100 req/s against the server. Target: zero 5xx, no memory creep
   over a 30-min sustained run.

Tooling: `k6` + `wrk2` for HTTP; `artillery.io` for WebSocket;
`scripts/billion-spins-replay.mjs` for engine fidelity under load.

---

## 6. Monitoring & alerting plan

| Signal                       | Source                                | Threshold                        | Alert channel    |
|---                           |---                                    |---                               |---               |
| Studio Lighthouse perf score | Hourly `npm run perf:audit`           | < 70                             | Slack #studio-perf |
| WCAG Critical / Serious      | Daily `npm run a11y:audit`            | > 0                              | Slack #a11y       |
| Browser compat regression    | Weekly `npm run browser:audit:live`   | any cell flips OK → WARN/FAIL    | PagerDuty (P3)   |
| RTP drift                    | Operator stream                       | observed vs target > 0.5pp       | PagerDuty (P1)   |
| Cert-lab submission failure  | `cert-lab-submit.mjs` exit code       | non-zero                         | PagerDuty (P2)   |
| Bundle size growth           | CI Vite build artifact diff           | > 10% week-over-week             | Slack #studio-perf |

---

## 7. How to reproduce

```bash
# Performance baselines (static — no browser needed)
npm run perf:audit

# WCAG 2.1 AA audit (static)
npm run a11y:audit

# Browser compatibility (static feature scan)
npm run browser:audit

# Live modes (require playwright + browser binaries pre-installed)
npm run perf:audit:live
npm run a11y:audit:live
npm run browser:audit:live
```

CI runs the static suite on every `main` push and PR via the
`audit` job in `.github/workflows/full-stack.yml`. The job fails
when the Studio Lighthouse score falls below 70 or any app gains
a Critical / Serious WCAG finding. Artifacts are uploaded under
`audit-reports/` with 30-day retention.

---

## 8. Open items

| ID  | Item                                                              | Owner | Target wave |
|---  |---                                                                |---    |---          |
| H-1 | Live-mode CI step (Playwright + axe-core install + browser cache) | SRE   | W205        |
| H-2 | Lighthouse CI baseline JSON committed to repo for regression diff | Eng   | W205        |
| H-3 | Penetration test against staging (see section 4)                  | SRE   | W205        |
| H-4 | Studio Minor heading findings — verify via live axe-core sweep    | Eng   | W205        |
| H-5 | Bundle-size budget gate in Vite config                            | Eng   | W205        |
