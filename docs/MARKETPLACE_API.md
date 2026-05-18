# Marketplace API — v1.0

CORTI W209 Faza 500.0 — Marketplace Activation backend.

Base URL: `https://<host>/api/marketplace`

This is the **v1.0** of the marketplace REST API. Payment integration
is a **stub** (`StubPaymentProvider`, 95% success / 5% failure) that
records charges to the DB without contacting a real PSP. Real Stripe
/ Adyen integration is staged for W21x — the `StripeProvider`
placeholder is already wired so swap-in is a 1-line change in
`server/index.ts`.

License JWTs are signed with the on-disk HSM keypair
(`server/state/hsm.ts`, Ed25519). The header advertises
`alg: 'Ed25519'`, the `kid` is the first 16 chars of the public key
hex, and the payload is a JWT-style claim set (see
[License JWT shape](#license-jwt-shape)).

---

## Auth model

Three independent flows:

| Caller   | Mechanism                | Header                |
|----------|--------------------------|-----------------------|
| Author   | Author API key (SHA-256) | `X-Author-Key: mk_live_…` |
| Operator | Tenant resolver (W208)   | `X-Tenant-Id: op-…`   |
| Public   | None                     | —                     |

Author keys are issued once during registration (`/authors/register`)
and only the SHA-256 hash is persisted server-side. Operators are
identified by the existing W208 `X-Tenant-Id` resolver. Public reads
(kernel catalogue, author profile, template catalogue) need no auth.

---

## Endpoints

### Kernels

| Method | Path                                           | Auth     | Description                              |
|--------|------------------------------------------------|----------|------------------------------------------|
| POST   | `/kernels/submit`                              | Author   | Submit a new kernel (manifest + IR code) |
| GET    | `/kernels`                                     | Public   | List, filter by `status`/`author`/`lw_gap`/`p_id` |
| GET    | `/kernels/:id`                                 | Public   | Kernel detail incl. badges + test verdict |
| POST   | `/kernels/:id/run-gates`                       | Admin    | Re-run acceptance gates                  |
| POST   | `/kernels/:id/approve`                         | Admin    | Mark approved → active                   |
| POST   | `/kernels/:id/reject`                          | Admin    | Reject with reason                       |

#### Submission request

```json
POST /api/marketplace/kernels/submit
X-Author-Key: mk_live_…

{
  "manifest": {
    "name": "Wizard of Oz Munchkinland",
    "version": "1.0.0",
    "lwGap": "M14_P1",
    "pId": "P-072",
    "badges": ["sas-ready", "lab-verified"]
  },
  "code": "<IR YAML inline>",
  "priceUsd": 5000,
  "licenseType": "perpetual"
}
```

Response (201):

```json
{ "submissionId": "9d4cb55a-...-...", "kernel": { ...full record... } }
```

### Templates

| Method | Path                  | Auth   | Description           |
|--------|-----------------------|--------|-----------------------|
| GET    | `/templates`          | Public | List active templates |
| GET    | `/templates/:id`      | Public | Template detail       |

### Purchases

| Method | Path                                | Auth     | Description                              |
|--------|-------------------------------------|----------|------------------------------------------|
| POST   | `/purchase`                         | Operator | Buy a kernel/template, issue license JWT |
| GET    | `/purchases`                        | Operator | List my tenant's purchases               |
| POST   | `/purchase/:id/refund`              | Operator | Refund (must own purchase)               |

#### Sample purchase request + response

```json
POST /api/marketplace/purchase
X-Tenant-Id: op-acme

{
  "itemId": "9d4cb55a-...",
  "itemType": "kernel",
  "paymentSource": { "type": "card", "token": "tok_test_visa" },
  "currency": "USD"
}
```

Response (201):

```json
{
  "purchaseId": "1f0c80a2-2a3a-4b1d-9b3a-fa07e9a4b6c5",
  "licenseJwt": "eyJhbGciOiJFZDI1NTE5IiwidHlwIjoiSldUIiwia2lkIjoiYWJjZGVm...",
  "receipt": {
    "itemId": "9d4cb55a-...",
    "itemType": "kernel",
    "amount": 5000,
    "currency": "USD",
    "paymentRef": "pi_stub_8a7e2c1b9d0f4321",
    "purchasedAt": "2026-05-18T10:14:55.823Z"
  }
}
```

#### Payment failure (402)

```json
{
  "error": "payment_failed",
  "providerError": "card_declined",
  "reference": "pi_failed_..."
}
```

### Authors

| Method | Path                                 | Auth   | Description                            |
|--------|--------------------------------------|--------|----------------------------------------|
| POST   | `/authors/register`                  | Public | Register, KYC auto-approved (MVP)      |
| GET    | `/authors/:id`                       | Public | Profile + their kernels + templates    |
| POST   | `/authors/me/payout-method`          | Author | Set bank / PayPal / crypto payout      |
| GET    | `/authors/me/earnings`               | Author | Payouts + lifetime USD                 |

### License verification

| Method | Path                          | Auth   | Description                           |
|--------|-------------------------------|--------|---------------------------------------|
| POST   | `/license/verify`             | Public | Verify a license JWT against the HSM  |

Request:

```json
{ "licenseJwt": "eyJhbGciOiJFZDI1NTE5...sigsigsig" }
```

Response (200):

```json
{
  "valid": true,
  "claims": {
    "iss": "slot-math-engine",
    "sub": "op-acme",
    "aud": "marketplace.kernel",
    "itemId": "9d4cb55a-...",
    "itemType": "kernel",
    "iat": 1747606495,
    "exp": 0,
    "purchaseId": "1f0c80a2-...",
    "licenseType": "perpetual",
    "jti": "f7e2c1b9d0f4a321"
  }
}
```

Reasons for `valid: false`: `malformed`, `signature_invalid`, `expired`.

### Payment webhook

| Method | Path                              | Auth                              | Description                           |
|--------|-----------------------------------|-----------------------------------|---------------------------------------|
| POST   | `/webhooks/payment`               | HMAC `X-Webhook-Signature`        | Stub PSP webhook receiver             |

The handler computes `HMAC-SHA-256(rawBody, MARKETPLACE_WEBHOOK_SECRET)`
and compares against the header in constant time. On a bad / missing
signature we return **200 OK** with `{ received: false, reason: ... }`
so a misconfigured PSP doesn't loop on retries — operator alerts then
pick up the diagnostic.

---

## License JWT shape

```
Header  : { "alg": "Ed25519", "typ": "JWT", "kid": "<first16chars-of-pubkey>" }
Payload : MarketplaceLicenseClaims
Sig     : Ed25519(SHA-512(header_b64.payload_b64))
```

`MarketplaceLicenseClaims`:

| Field          | Type      | Notes                                              |
|----------------|-----------|----------------------------------------------------|
| `iss`          | string    | Always `slot-math-engine`                          |
| `sub`          | string    | Buyer tenant id                                    |
| `aud`          | string    | `marketplace.kernel` or `marketplace.template`     |
| `itemId`       | UUID      | Kernel or template id                              |
| `itemType`     | enum      | `kernel` / `template`                              |
| `iat`          | int       | Issued at, unix seconds                            |
| `exp`          | int       | Expiry, unix seconds (0 = perpetual)               |
| `purchaseId`   | UUID      | Purchase row id                                    |
| `licenseType`  | enum      | `perpetual` / `subscription` / `metered`           |
| `jti`          | hex       | 16-char anti-replay nonce                          |

---

## Error codes

| HTTP | Code                          | When                                          |
|------|-------------------------------|-----------------------------------------------|
| 400  | `tenant_required`             | Purchase endpoint hit without `X-Tenant-Id`   |
| 400  | `manifest.name_required`      | Submission without manifest.name              |
| 400  | `itemId_and_itemType_required`| Purchase without `itemId` + `itemType`        |
| 401  | `author_api_key_required`     | Author endpoint without header                |
| 401  | `author_api_key_invalid`      | Header present but no matching author         |
| 402  | `payment_failed`              | PSP returned non-ok                           |
| 403  | `forbidden`                   | Refund attempt against another tenant         |
| 404  | `kernel_not_found` etc.       | Item / author / purchase missing              |
| 409  | `item_not_available`          | Item is pending/rejected/archived             |
| 409  | `purchase_not_refundable`     | Already refunded / expired                    |
| 429  | `rate_limit_exceeded`         | Per-tenant rate limit (purchase=5 r/s, REST=100 r/s) |

---

## Rate limits

The W208 global REST limiter applies at **100 req/s per tenant**
(burst 200). The purchase endpoint adds a tighter tenant-scoped
bucket at **5 req/s** (burst 20) to discourage card-testing.

---

## Status

**v1.0 — payment stub, real PSP integration W21x.**

- Stub provider: 95% success / 5% failure (deterministic via seed in tests).
- `StripeProvider` shipped as a TODO placeholder.
- Webhook signature verification is wired but the dispatch table for
  event types (`payment.succeeded` / `charge.refunded` / `chargeback.created`)
  is intentionally a no-op — fleshed out alongside the real provider.
- KYC is auto-approved during registration; replace with the real
  identity-provider check (e.g. Persona, Sumsub) in W21x.
