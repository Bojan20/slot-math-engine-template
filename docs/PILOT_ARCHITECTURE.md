# Pilot Architecture — W211 Faza 700.0

*Companion to `docs/PILOT_GUIDE.md`.*

This document captures the system-level architecture of the L&W pilot
flow built in W211. It shows the data-flow between the seed script,
integration harness, dossier generator, server-side state stores, and
the underlying W208-W210 infrastructure they depend on.

## System diagram (text-art)

```
                              ┌─────────────────────────────┐
                              │  CI / sales engineering CLI │
                              └──────────────┬──────────────┘
                                             │
                  ┌──────────────────────────┼──────────────────────────┐
                  │                          │                          │
                  ▼                          ▼                          ▼
        ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
        │ pilot:seed       │       │ pilot:integration│       │ pilot:dossier    │
        │ (mjs script)     │       │ (mjs script)     │       │ (mjs script)     │
        └────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
                 │                          │                          │
                 ▼                          ▼                          ▼
        ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
        │ lw-pilot-tenant  │──────▶│ integration-suite│──────▶│ L_AND_W_PILOT_   │
        │ .json + creds.env│       │ -latest.json     │       │ DOSSIER.md / html│
        └──────────────────┘       └────────┬─────────┘       └──────────────────┘
                                            │
                                            ▼
                                ┌──────────────────────────┐
                                │ POST /api/pilot/runs     │
                                └────────────┬─────────────┘
                                             │
                                             ▼
                                ┌──────────────────────────┐
                                │  pilot_runs (mem | pg)   │
                                └──────────────────────────┘
```

All `mjs` scripts run with Node 18+ stdlib only — no extra npm
dependencies. Server-side stores are TypeScript strict.

## Layer touchpoints

The integration harness exercises every major server-side layer. The
table below maps each suite step to the W208-W210 module(s) it
validates.

| Step | Server-side touchpoint | Test surface |
| --- | --- | --- |
| 1. auth | `lib/marketplace-auth.ts` (HMAC) + tenant resolver | apiKeyHash round-trip |
| 2. wallet-handshake | `lib/wallet/providers/generic-pam.ts` | healthcheck + balances |
| 3. catalog-browse | `routes/marketplace.ts` + `data/templates.json` | filter by `lw_gap_target` |
| 4. license-verify | `lib/marketplace-auth.ts` (JWT) | tenant claim + expiry |
| 5. single-spin | `routes/session.ts` + `state/audit.ts` | hash-chain advance |
| 6. bulk-spin | session API + RTP-drift detector | p99 + drift gates |
| 7. replay | RNG cross-platform parity | bit-identical digest |
| 8. cert-export | `scripts/cert-dossier-build.mjs` | HSM signature |
| 9. canary | `lib/deployment/canary.ts` | 4 health gates |
| 10. rollback | `lib/deployment/rollback.ts` | RTO < 5s |

## State store — `pilot_runs`

Schema (migration `013_pilot_runs.sql`):

| Column | Type | Notes |
| --- | --- | --- |
| `run_id` | UUID PK | Generated server-side if not provided |
| `tenant_id` | UUID | FK in spirit to `tenants(tenant_id)` |
| `started_at` | TIMESTAMPTZ | Suite start wallclock |
| `completed_at` | TIMESTAMPTZ | Suite end wallclock |
| `total_elapsed_ms` | BIGINT | Suite duration |
| `pass_count` | INTEGER | # verdicts with `ok=true` |
| `fail_count` | INTEGER | # verdicts with `ok=false` |
| `overall_ok` | BOOLEAN | `fail_count === 0` |
| `verdicts` | JSONB | Array of per-step verdicts |
| `result_hash` | VARCHAR(64) | sha256 of canonicalised summary |

Indexes target the common admin queries: by tenant, by tenant +
completed time, and by overall_ok (red/green dashboard).

### Two backends, one API

The route handler in `server/routes/pilot.ts` accepts either backend:

```
type Store = PilotRunStore | PostgresPilotRunStore;
```

Selection happens at server-boot time the same way as other W206 stores:
`USE_POSTGRES=true` swaps the in-memory store for the PG-backed one. The
fake-pg test harness has matchers for `pilot_runs` so the same test
suite exercises both backends.

## Data-flow walkthrough

A typical day-1 demo run touches the following data:

1. `pilot:seed` writes `dist/pilot/lw-pilot-tenant.json` containing the
   tenant, operator credentials, encrypted wallet secret, list of
   installed templates (with license JWTs), and 5 demo players. The
   `initialStateHash` field is the sha256 over a canonical snapshot of
   the tenant payload — used as the audit-chain genesis hash.
2. `pilot:integration` reads the state file, runs the 10 steps, and
   writes `dist/pilot/integration-suite-latest.json`. Step 8 (cert
   export) writes a GLI-UKGC bundle to `dist/pilot/cert/` and signs the
   manifest with the in-process HSM keypair from
   `server/data/hsm-keys.json` (created on first run if absent).
3. Optionally, a `POST /api/pilot/runs` call posts the summary to the
   server which inserts a row in `pilot_runs`. The route is admin-only
   in spirit — it lives under `/api/pilot/` and the tenant-isolation
   prehandler is configured with `rejectMissing: false` so calls
   without an explicit tenant header still succeed.
4. `pilot:dossier` joins the seed + suite files and renders the
   12-section markdown + HTML.

## Security notes

- The seed script uses **deterministic HMAC-derived keys** for the
  operator API key, tenant JWT secret, license JWT secret, and the
  wallet secret encryption key. These keys are SAFE FOR DEMO ONLY.
  Production tenants must rotate them through the admin console (W208
  tenant config).
- The encryption used for the wallet secret is a versioned XOR + HMAC
  envelope (`enc:v1:...`). It is sufficient as a placeholder; production
  must promote to AES-GCM through the W210 wallet-crypto module
  (`server/lib/wallet/crypto.ts`).
- The license JWTs in the seed file are HMAC-signed rather than
  Ed25519-signed (to keep the script dependency-free). The server-side
  marketplace continues to issue real Ed25519 license JWTs via the W209
  HSM; the seed file's JWTs are placeholders the demo can verify
  structurally without an HSM.
- `result_hash` on a `pilot_runs` row covers the (run_id, tenant_id,
  timestamps, verdict bitmap). It is **not** a tamper-evident audit
  chain. The per-spin audit chain remains in the `audit_log` table.

## Files added in W211 Faza 700.0

| Path | Lines | Purpose |
| --- | --- | --- |
| `scripts/pilot/seed-lw-pilot.mjs` | ~250 | Seed pilot tenant |
| `scripts/pilot/run-integration-suite.mjs` | ~350 | 10-step suite |
| `scripts/pilot/build-pilot-dossier.mjs` | ~330 | Dossier generator |
| `server/state/pilot-runs.ts` | ~125 | In-memory store |
| `server/state/pilot-runs-pg.ts` | ~165 | Postgres store |
| `server/routes/pilot.ts` | ~105 | REST endpoints |
| `server/db/migrations/013_pilot_runs.sql` | 25 | DDL |
| `scripts/tests/pilot-seed.test.mjs` | ~140 | 10+ specs |
| `scripts/tests/pilot-integration.test.mjs` | ~175 | 15+ specs |
| `scripts/tests/pilot-dossier.test.mjs` | ~145 | 12+ specs |
| `server/tests/pilot-runs.test.ts` | ~200 | 14+ specs |
| `docs/PILOT_GUIDE.md` | ~225 | Sales-eng runbook |
| `docs/PILOT_ARCHITECTURE.md` | this file | System diagram + flow |

## Future work (W212+)

- Run the integration suite under the W208 latency-budget tracker so
  each step is observable in the operator console.
- Push `pilot_runs` rows to the W207 analytics pipeline for trend
  charts (PASS-rate per week, p99 over time).
- Promote the dossier HTML to a true PDF via `pdf-lib` (already a repo
  dep) so customers receive a single signed artefact.

End of architecture note.
