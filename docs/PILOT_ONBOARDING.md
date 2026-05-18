# Pilot Tenant Onboarding (W210 Faza 600.0)

This document is the operator engineering guide for the 5-step pilot
onboarding wizard shipped in `web/onboarding/`. The goal is **≤1 hour**
from "I have a contract" to "first spin against my wallet succeeds".

The flow assumes a technical contact who:
- knows their company's regulatory jurisdictions
- has a wallet provider already selected (PAM / Microgaming /
  NetEnt-Aggregator / Playtech)
- can produce an HMAC-shared secret + base URL for their wallet API
- can sign RTS/PPD attestations on behalf of the operator

---

## 1. Time budget

| Step                | Estimate | Cumulative |
| ------------------- | -------- | ---------- |
| 1 · Identity        | 10 min   | 10 min     |
| 2 · Wallet          | 20 min   | 30 min     |
| 3 · Catalog         | 10 min   | 40 min     |
| 4 · Compliance      | 15 min   | 55 min     |
| 5 · Preview         |  5 min   | 60 min     |

`estimateMinutesRemaining(state)` in `src/pilot-flow.ts` exposes the
live countdown for the UI.

---

## 2. Step-by-step

### Step 1 — Operator identity

Capture the basics:
- legal entity name
- primary contact email
- target jurisdictions (UKGC, MGA, SE, NJ, GENERIC, …)
- regulators (GamCom, MGA, Spelinspektionen, NJ DGE, …)

Validation: required name + at least one jurisdiction + valid email.
The jurisdiction list drives the compliance step's checklist later.

### Step 2 — Wallet integration

Pick one of the four built-in adapter types (`generic-pam`,
`microgaming-style`, `netent-aggregator`, `playtech-style`) and enter:
- baseUrl (HTTPS only — `http://` is hard-rejected)
- apiSecret (≥ 16 chars — anything shorter is rejected outright)
- operatorId

A **Test connection** button runs `provider.healthcheck()` through the
mocked HTTP client and reports the round-trip latency. The flow cannot
advance until a connection has succeeded.

Credentials are encrypted client-to-server in transit (TLS) and at
rest with AES-256-GCM. See `docs/WALLET_PROVIDERS.md §6`.

### Step 3 — Catalog selection

Pick from kernels + templates in the marketplace catalog (W209). Empty
selection is rejected — the operator must commit to at least one item
before going live. Selections become initial license rows in the
tenant's catalog post-deploy.

### Step 4 — Compliance attestation

The flow enumerates every jurisdiction added in step 1 and requires a
ticked checkbox per row plus a signer name. A timestamp is captured at
sign time and bundled into the submission. The audit trail records:
- which jurisdictions were attested
- who signed
- when (ISO 8601)

### Step 5 — Deploy preview

A read-only summary of everything captured, with the apiSecret redacted
(`***REDACTED***`) so a screenshot never leaks credentials. The operator
ticks an "I approve this deployment" box, optionally adds notes, then
submits.

---

## 3. Draft save & resume

- Every step has a **Save draft** button (debounced auto-save also
  fires after each field change in the live UI).
- Draft state is JSON-serialised and stored in
  `localStorage.corti-pilot-flow`.
- Draft history is capped at the last 10 timestamps for diagnostics.
- Operator can resume the flow on any machine that shares the same
  browser profile / session cookie.

To clear a draft (e.g. on staff rotation): `clearDraft()` removes the
localStorage key and resets the state machine.

---

## 4. Post-onboarding ops

| What                          | When                                       |
| ----------------------------- | ------------------------------------------ |
| Wallet healthcheck            | hourly via cron → `/api/wallet/healthcheck`|
| Daily reconciliation report   | EOD vs operator ledger                     |
| Rotate apiSecret              | every 90 days; re-run wizard step 2 only   |
| Quarterly RTS/PPD re-attest   | refresh step 4 (jurisdiction × operator)   |

The healthcheck cron writes to the structured logger with
`wallet.healthcheck.ok` / `.fail`, and feeds a Grafana panel sourced
from the Prometheus scrape.

---

## 5. Checklist before going live

- [ ] All 5 steps validated green
- [ ] Wallet test connection latency < 1500 ms
- [ ] At least one kernel or template selected
- [ ] All jurisdictions attested with a real signer name
- [ ] Healthcheck `POST /api/wallet/healthcheck` returns `ok: true`
- [ ] Audit chain shows a `pilot_submission` event with the deploy hash
- [ ] DR runbook page updated with the new tenant id

When every box ticks, the deploy gate releases the tenant config to
production and the orchestrator starts routing real spins through the
configured provider.
