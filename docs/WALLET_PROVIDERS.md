# Wallet Provider Connectors (W210 Faza 600.0)

The `slot-math-engine-template` ships with a generic wallet-provider
adapter framework so operators can plug their PAM (Player Account
Management) or aggregator wallet into the spin flow with a small
config change.

This document is the operator-facing reference: how the framework is
structured, how to add a new connector, the security model behind the
at-rest-encrypted credentials, and the production runbook.

---

## 1. Architecture overview

```
              ┌───────────────────────────────────┐
              │      Game / Spin orchestrator     │
              └─────────────────┬─────────────────┘
                                │
                                ▼
              ┌───────────────────────────────────┐
              │  WalletOrchestrator (provider-    │
              │  agnostic spin atomicity layer)   │
              └─────────────────┬─────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │   TenantWalletConfigStore         │
              │   (encrypted credentials at rest) │
              └─────────────────┬─────────────────┘
                                │ provider name
                                ▼
              ┌─────────────────────────────────────────┐
              │   Wallet provider registry              │
              │   ┌──────────────────────────────────┐  │
              │   │  generic-pam                     │  │
              │   │  microgaming-style               │  │
              │   │  netent-aggregator               │  │
              │   │  playtech-style                  │  │
              │   └──────────────────────────────────┘  │
              └─────────────────────────────────────────┘
                                │
                                ▼
                       Operator HTTP API
```

The orchestrator:
- looks up the tenant's active provider config
- instantiates a `WalletProvider` (cached per tenant)
- runs `debit → playSpin → credit` atomically
- rolls back on game or credit failure
- logs every call with `provider`, `op`, `tenantId`, `latencyMs` via the
  W208 structured logger
- caches healthcheck results for 30 seconds via the W208 cache

---

## 2. Provider matrix

| Provider name        | Style                      | Auth mode          | Notes                                          |
| -------------------- | -------------------------- | ------------------ | ---------------------------------------------- |
| `generic-pam`        | JSON REST + HMAC-SHA256    | `token`            | Lowest-common-denominator, ~200 aggregators    |
| `microgaming-style`  | sessionId, cash+bonus     | `sessionId`        | Microgaming Quickfire legacy compatibility     |
| `netent-aggregator`  | JWT + Idempotency-Key      | JWT                | NetEnt / MGS Quickfire pattern                 |
| `playtech-style`     | cashier_session + brand    | cashier_session_id | Playtech IMS protocol                          |

All providers conform to the same `WalletProvider` interface:
```ts
interface WalletProvider {
  name: string;
  debit(playerToken, amount, currency, ref): Promise<WalletTx>;
  credit(playerToken, amount, currency, ref): Promise<WalletTx>;
  rollback(originalRef): Promise<WalletTx>;
  getBalance(playerToken): Promise<{ amount, currency }>;
  authenticate(token): Promise<AuthClaims>;
  healthcheck(): Promise<{ ok, latencyMs }>;
}
```

---

## 3. HMAC signing — generic-pam example

Every request signs `METHOD\nPATH\nBODY` under the configured shared
secret and ships the result as `X-Signature: hex(HMAC-SHA256(...))`:

```
POST /debit
Headers:
  Content-Type: application/json
  X-Operator-Id: pilot-1
  X-Timestamp: 1747569600000
  X-Signature: 9c1bf3a06cf4e2c08e44f7a91a4d4b5c…  (64 hex chars)
Body:
  {"playerToken":"tok-abc","amount":1000,"currency":"EUR","ref":"spin-42"}
```

To verify the signature server-side:
```ts
import { createHmac } from 'crypto';
const expect = createHmac('sha256', secret)
  .update(`POST\n/debit\n${rawBody}`)
  .digest('hex');
if (expect !== req.headers['x-signature']) throw new Error('bad_sig');
```

Other providers use slightly different signature payload schemes —
see the source of each `providers/*.ts` file.

---

## 4. Error mapping

Every `WalletProvider` throws `WalletProviderError` with a canonical
`code`:

| Code                  | Mapped HTTP origins                    | Player-facing reason     |
| --------------------- | -------------------------------------- | ------------------------ |
| `auth_failed`         | 401/403, session_invalid               | Sessija istekla          |
| `insufficient_funds`  | 402 / `low_balance`                    | Nemate dovoljno          |
| `duplicate_ref`       | 409 / duplicate_ref                    | (silent) retry safe      |
| `unknown_ref`         | 404 / tx_not_found                     | (silent) rollback skipped|
| `provider_timeout`    | AbortError, timeout                    | Pokušajte ponovo         |
| `provider_unavailable`| 5xx                                    | Servis trenutno nedostupan|
| `invalid_signature`   | 401 with signature mismatch            | (operator misconfig)     |
| `invalid_currency`    | currency mismatch                      | (operator misconfig)     |
| `unknown`             | parse failures, etc.                   | Greška                   |

---

## 5. Adding a new connector

Three steps:

1. Implement `WalletProvider` in
   `server/lib/wallet/providers/<your-provider>.ts`.
2. Register the factory in `server/lib/wallet/registry.ts` (or via
   `registerProvider()` at boot for plugin-style add-ons).
3. Add a row to `web/onboarding/src/components/pilot-step2-wallet.ts`
   so operators can pick it during onboarding.

A connector typically clocks in at ~200–280 lines, with the bulk being
field mapping + error-code translation. Unit tests live in
`server/tests/wallet-providers.test.ts` — copy one of the existing
suites as a template.

---

## 6. Security model

### Credentials at rest

Provider credentials (apiSecret, operatorId, etc.) are stored encrypted
with AES-256-GCM via `server/lib/wallet/crypto.ts`. The blob format is:

```
[ 1B version=1 ][ 12B IV ][ 16B GCM auth tag ][ N B ciphertext ]
```

The encryption key is loaded from `WALLET_CONFIG_KEY` (32 raw bytes,
hex-encoded → 64 hex chars). In tests and dev a deterministic fallback
key is used; production MUST set the env var.

### Idempotency

Every debit/credit carries a `ref` (idempotency key). The same ref on
the same provider returns the same result, so a retried HTTP call after
a flaky network never double-charges the player.

Credit refs are `${originalRef}-win` by convention. Rollback refs
mirror the debit ref.

### Tenant isolation

The orchestrator resolves provider config exclusively via
`TenantWalletConfigStore.getTenantWalletConfig(tenantId)`. There is no
cross-tenant fallback path. The Postgres schema has a partial unique
index `UNIQUE(tenant_id) WHERE active = true` to enforce this at the
storage layer.

### Audit & observability

Every provider call emits a structured log via W208:
```
{"level":"info","msg":"wallet.debit.ok","meta":{"provider":"generic-pam",
 "tenantId":"t1","ref":"spin-42","latencyMs":118}}
```
A `wallet_provider_calls_total{provider, op, status}` counter feeds the
Prometheus scrape at `/api/admin/metrics`.

### Healthcheck endpoint

`POST /api/wallet/healthcheck` (admin role only) runs all configured
providers and returns the aggregated status. Results are cached for 30
seconds per tenant via the W208 cache layer to bound load on the
provider in flapping conditions.

---

## 7. Production runbook

| Symptom                                  | First action                                                 |
| ---------------------------------------- | ------------------------------------------------------------ |
| Many `provider_timeout` in logs          | Bump per-call `timeoutMs` in tenant config; ping provider    |
| `invalid_signature` after secret rotation | Re-save tenant wallet config with new apiSecret              |
| `duplicate_ref` after a deploy           | Ref collision — investigate ref generator; safe to retry     |
| Rollback failed                          | Manual ledger reconciliation; check audit chain              |
| 5xx → orchestrator returns provider_unavailable | Mark tenant degraded; failover or short-circuit spins |

`/api/wallet/healthcheck` runs in CI before promoting a build to live
operator. A non-`ok` response blocks the deploy.
