# CHAOS_ENGINEERING.md — slot-math-engine-template

_Last updated: 2026-05-18 (W212 Faza 600.1)_

This document describes the chaos engineering framework that ships with
`slot-math-engine-template`. It is intended for SREs running staging
soaks and for cert-lab reviewers who want to confirm the platform's
negative-path behaviour.

---

## 1. Framework overview

Source: `server/lib/chaos/` and `scripts/chaos/`.

The framework is **always env-gated**:

```ts
const ctrl = new ChaosController();
ctrl.isEnabled();
// → false when NODE_ENV === 'production' OR CHAOS_ENABLED !== 'true'
```

Two switches must both be set before any fault can fire:

| Variable        | Required value | Notes                          |
|---              |---             |---                             |
| `NODE_ENV`      | NOT `production` | hard-coded refusal in `ChaosController.isEnabled()` |
| `CHAOS_ENABLED` | `true`         | otherwise every `injectIf()` is a no-op |

There is **no override** for production. The check is duplicated in the
admin chaos route (`/api/admin/chaos/*`) so a misconfigured staging
deployment can't accidentally start mutating production traffic.

---

## 2. Supported faults

| Name                  | What it does                                             | Default probability |
|---                    |---                                                       |---                  |
| `cache.miss`          | Force a cache miss even on a real hit                    | 0.10                |
| `wallet.timeout`      | Inject a hard 5 s timeout on wallet calls                | 0.05                |
| `db.slow-query`       | Sleep 200–500 ms before a DB query                       | 0.05                |
| `hsm.key-rotation`    | Return a rotated key id mid-request                      | 0.02                |
| `audit.chain-gap`     | Break a hash-chain link; observer must detect            | 0.02                |
| `tenant.context-loss` | Drop the `tenantId` from AsyncLocalStorage               | 0.02                |

Each fault lives in `server/lib/chaos/faults/<name>.ts` with an
`enable*()` toggle helper for the admin route.

---

## 3. Admin chaos UI

| Endpoint                       | Method | Body                          | Role  |
|---                             |---     |---                            |---    |
| `/api/admin/chaos`             | GET    | —                             | admin |
| `/api/admin/chaos/enable`      | POST   | `{ name, probability }`        | admin |
| `/api/admin/chaos/disable`     | POST   | `{ name }` or `{ all: true }` | admin |
| `/api/admin/chaos/reset`       | POST   | —                             | admin |

`GET` returns the active faults, their counters
(`considered` / `injected`), and the env gate state so a dashboard can
render an explicit "chaos OFF" badge in production.

---

## 4. Scenarios

The orchestrator at `scripts/chaos/run-all-scenarios.mjs` runs every
scenario and emits a summary table. Each scenario is also runnable
standalone (`node scripts/chaos/scenario-*.mjs`).

| Scenario                       | Validates                                                   |
|---                             |---                                                          |
| `scenario-wallet-cascade-failure` | Backpressure under provider outage + clean recovery       |
| `scenario-db-partition`           | Cache-only fallback during DB partition + recovery        |
| `scenario-noisy-neighbor`         | Per-tenant rate limit isolates a loud tenant              |
| `scenario-cert-pipeline-corrupt`  | Observer catches chain gaps + forensic surface preserved  |
| `scenario-marketplace-flood`     | Marketplace rate limit rejects floods, admin can publish   |

All five scenarios complete in well under 60 s on a developer laptop.

Run them all with `npm run chaos:run-all`.

---

## 5. Blast-radius rules

- **Never** ship a chaos fault enabled on production. The gating check
  in `ChaosController.isEnabled()` enforces this and is duplicated in
  `routes/chaos.ts`.
- Probability must be ≤ 0.10 on staging. Higher values are only allowed
  for one-off scenario rehearsals run by SRE.
- Chaos must not amplify a real outage: every fault is required to fail
  the request *cleanly* (with a structured error) rather than crash the
  process.
- Tenant context loss faults must always be paired with the safe-assert
  helper (`safeAssertTenant`) so the request returns a 5xx instead of
  silently proceeding.

---

## 6. Prod-safe boundaries

The chaos framework runs alongside production code without any runtime
overhead when disabled:

- `shouldInject(name)` short-circuits when `isEnabled()` returns false.
- The framework holds no timers, no sockets, and no external resources.
- The admin route returns 403 for every mutating action when the env
  gate is off; the GET endpoint always works so dashboards can render a
  green "chaos OFF" badge.

---

## 7. Adding a new fault

1. Add the name to `FAULT_NAMES` in `server/lib/chaos/index.ts`.
2. Create `server/lib/chaos/faults/<name>.ts` with an `enable*()` toggle
   helper and a wrapper that takes the `ChaosController`.
3. Wire a server test under `server/tests/chaos-w212.test.ts`.
4. (Optional) Add a `scenario-<name>.mjs` if the failure mode warrants
   a multi-step rehearsal.
5. Document the fault in §2 of this file.

---

## 8. CI integration

`npm run chaos:run-all` is run as part of the W212 CI gate.
`npm run security:audit` is run as part of the pre-commit hook.
Both must exit 0 before a PR can land on `main`.
