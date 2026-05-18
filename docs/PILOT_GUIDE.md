# Pilot Guide — Light & Wonder Pilot Onboarding

*W211 Faza 700.0 — last revised 2026-05-18.*

This guide walks sales engineering through the full lifecycle of a
Light & Wonder pilot tenant on the slot-math-engine platform — from the
day-0 seed through the day-30 production cutover. Every command in this
guide is reproducible (deterministic inputs, env-driven keys) so the
internal demo replays bit-for-bit on every machine.

> **Audience.** Sales engineering, deployment SRE, customer success.
> Each section maps to a wave of W210/W211 infrastructure (catalog,
> wallet, audit, canary, cert) so support escalation paths point at the
> right team.

## Phase overview

| Phase | Day | Owner | Deliverable |
| --- | --- | --- | --- |
| Phase 0 — Seed | Day 0 | Sales eng | Tenant `dist/pilot/lw-pilot-tenant.json` + credentials |
| Phase 1 — Integration | Day 1 | Sales eng + customer | 10-step suite green, summary table archived |
| Phase 2 — Dossier | Day 7 | Customer success | Branded markdown + html dossier shared with prospect |
| Phase 3 — Production | Day 30 | SRE | Canary 1 → 100%, cert dossier filed, rollback drilled |

## Phase 0 — Day 0: Seed the pilot tenant

```bash
npm run pilot:seed              # one-shot bootstrap
npm run pilot:seed:force        # regenerate on top of an existing seed
```

The seed script (`scripts/pilot/seed-lw-pilot.mjs`) produces:

- `dist/pilot/lw-pilot-tenant.json` — full pilot state (tenant id,
  wallet config, players, installed templates, license JWTs, initial
  state hash).
- `dist/pilot/credentials.env` — env file the rest of the pilot demo
  reads. **Do not commit.** Add the path to your local `.gitignore` if
  you redirect it elsewhere.

The pilot tenant is fixed to:

| Field | Value |
| --- | --- |
| Operator | Light & Wonder Pilot UK |
| Tenant UUID | `11111111-2222-3333-4444-555555555555` |
| Jurisdictions | UKGC, MGA |
| Currency | GBP |
| Installed templates | Quick Hit Dragons, Pearl of Atlantis, Lava Phoenix |
| Demo players | alice, bob, carla, diego, eve (each £1000) |

> **Why these three templates?** They cover the L&W M5 (mystery
> progressive), M14 (nested mini-slot) and M7 (colossal reels) gap
> closures from W181-W190 — i.e. the three pieces of W209 marketplace
> content L&W cares about most for a pilot.

The seed is idempotent: re-running without `--force` reuses the existing
state file, so demo replays match exactly.

## Phase 1 — Day 1: Integration suite

```bash
npm run pilot:integration            # 10,000 spins, ~10s synthetic
npm run pilot:integration:quick      # 200 spins, < 1s — for sanity checks
```

The suite (`scripts/pilot/run-integration-suite.mjs`) exercises every
production layer in sequence:

| # | Step | What it touches |
| --- | --- | --- |
| 1 | auth | Operator API key + tenant JWT signing |
| 2 | wallet-handshake | generic-pam adapter healthcheck + player balances |
| 3 | catalog-browse | W209 marketplace template listing + L&W gap filter |
| 4 | license-verify | Per-template license JWT shape + tenant claim |
| 5 | single-spin | Debit → spin → credit → audit-chain advance |
| 6 | bulk-spin | 10K spins, p99 < 100ms, RTP within 0.75pp |
| 7 | replay | Bit-identical re-derive of one spin |
| 8 | cert-export | `cert-dossier-build` for GLI-UKGC, HSM-signed |
| 9 | canary | 4-stage rollout 1%→5%→25%→100% with health gates |
| 10 | rollback | Synthetic RTP-drift anomaly → rollback < 5s |

Each step emits a verdict object with `step`, `ok`, `elapsedMs`, and
metrics. The final summary table prints PASS/FAIL counts and exits
non-zero if any step failed.

The suite is **synthetic by default** — it does not require the Fastify
server to be running. To exercise the live backend instead, pass
`--live --target=http://host:port`.

Suite results are written to `dist/pilot/integration-suite-latest.json`.
The dossier generator consumes this file.

### Recording runs on the server

`POST /api/pilot/runs` stores the summary in the `pilot_runs` table
(in-memory by default, Postgres via `USE_POSTGRES=true`). Admin can
query later via `GET /api/pilot/runs` or `GET /api/pilot/runs/:id`.

```bash
curl -X POST -H content-type:application/json \
  -d @dist/pilot/integration-suite-latest.json \
  http://localhost:4000/api/pilot/runs
```

## Phase 2 — Day 7: Build the evaluation dossier

```bash
npm run pilot:dossier
```

`scripts/pilot/build-pilot-dossier.mjs` reads the seed + suite outputs
and produces a 12-section evaluation dossier in both markdown and
printer-ready HTML:

1. Executive Summary
2. Pilot Tenant Overview
3. Wallet Integration Verification
4. Catalog Acceptance
5. License Compliance
6. Spin Determinism Proof
7. RTP Accuracy Verification
8. Performance Profile
9. Canary Deployment Trace
10. Rollback Readiness
11. Cert Lab Submission Sample
12. Revenue & Cost Model *(placeholder for Agent B's ROI numbers)*

Outputs land in `dist/pilot/`:

- `L_AND_W_PILOT_DOSSIER.md`
- `L_AND_W_PILOT_DOSSIER.html` (vanilla CSS, printer-friendly via
  `@media print`)

Hand this to the customer's procurement + compliance teams. They can
trace every claim back to either the seed file, the suite verdicts, or
the W210 cert dossier the suite produced in step 8.

## Phase 3 — Day 30: Production cutover

By day 30 you should have:

1. **Wallet integration verified** against the customer's real PAM
   endpoint (replace the synthetic `wallet.lw-pilot.example.com` URL in
   `dist/pilot/lw-pilot-tenant.json` and re-run the integration suite
   in `--live` mode).
2. **Cert dossier signed off** by the lab. The Day 1 suite produced a
   GLI-UKGC bundle; submit additional labs via the W210 cert CLI:
   ```bash
   node scripts/cert-dossier-build.mjs --game=tpl-quick-hit-dragons \
     --lab=BMM --jurisdiction=MGA --output=dist/cert
   ```
3. **Canary rehearsed end-to-end.** Run the deployment manifest through
   the W210 canary controller against the real production cluster:
   ```bash
   node scripts/deployment/prepare-green.mjs
   node scripts/deployment/traffic-shift.mjs --target=1
   node scripts/deployment/health-probe.mjs
   # promote / rollback per playbook
   ```
4. **Rollback drilled.** Trigger a synthetic anomaly during the canary
   hold window (e.g. inject RTP drift through the test harness) and
   confirm rollback completes in under 5 seconds with zero data loss.

After steps 1-4 pass, flip the tenant to 100% traffic and start the
W210 RTP-drift detector + audit chain monitor. The `pilot_runs` table
remains the long-lived record of every pre-production rehearsal.

## Quick reference

| Command | Purpose |
| --- | --- |
| `npm run pilot:seed` | Bootstrap tenant state |
| `npm run pilot:integration` | Full 10-step suite |
| `npm run pilot:integration:quick` | 200-spin sanity check |
| `npm run pilot:dossier` | Build evaluation dossier |
| `npm run pilot:all` | All three in sequence (<2 minutes) |
| `npm run cert:submit` | Submit cert dossier to a lab |
| `npm run smoke:all` | Run all 6 smoke tests |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `pilot state not found` | Skipped `pilot:seed` | Run `npm run pilot:seed` first |
| Cert export verdict FAIL | `reports/` tree missing | The cert builder falls back to placeholders; warn customer that production runs require the full report bundle |
| RTP drift > 0.5pp on `bulk-spin` | RNG seed altered | Re-derive the state hash with `pilot:seed:force` |
| `403 tenant_required` from /api/pilot/runs | Tenant header missing | Pilot routes are admin-public — confirm `tenantIsolationPreHandler` includes `/api/pilot` if you changed defaults |
| Postgres `relation pilot_runs does not exist` | Migration 013 not applied | Restart server with `USE_POSTGRES=true`, or run `npm run db:migrate` |

## Related runbooks

- W210 canary deployment — `docs/CANARY_PLAYBOOK.md`
- W209 marketplace licensing — `docs/MARKETPLACE_LICENSE.md`
- W208 multi-tenant hardening — `docs/TENANT_ISOLATION.md`
- Cert lab submission — `docs/CERT_PROCESS.md`

End of guide.
