# REST API

The Fastify server (`server/`) exposes a JSON REST API on port `4000`. All monetary values are integer minor units (cents). CORS is permissive in dev. The auto-generated route reference lives at **Auto-generated routes** in the sidebar; this page is the hand-curated narrative version.

## Base URL

```
http://localhost:4000
```

Production deploys behind your own domain. TLS terminates at your reverse proxy.

## Authentication

- **HTTP**: `x-api-key: <KEY>` header. Configure keys via `GAAS_API_KEYS` env var (comma-separated). Empty = dev mode (open).
- **WebSocket**: `?apiKey=<KEY>` query param on the upgrade URL.

## Route groups

| Prefix | File | Purpose |
|---|---|---|
| `/api/health` | `routes/health.ts` | Liveness + Prometheus metrics |
| `/api/session` | `routes/session.ts` | Player session lifecycle |
| `/api/wallet` | `routes/wallet.ts` | Wallet balance + transactions |
| `/api/audit` | `routes/audit.ts` | Hash-chain replay + verify |
| `/api/lobby` | `routes/lobby.ts` | Game registry + launch |
| `/api/gaas` | `routes/gaas.ts` | GaaS RTP, render, spin, seamless, WS |
| `/api/cert` | `routes/cert.ts` | Cert lab submit + verify |
| `/api/license` | `routes/license.ts` | Tenant licensing |
| `/api/signup` | `routes/signup.ts` | Self-serve onboarding |
| `/api/admin` | `routes/admin.ts` | Tenant + RBAC admin |

## Health

### `GET /api/health`

```json
{
  "ok": true,
  "name": "slot-math-engine-backend",
  "version": "0.1.0",
  "uptime": 12.34,
  "sessions": 3,
  "games": 26,
  "auditSessions": 3,
  "auditEntries": 17
}
```

### `GET /api/health/deep`

Runs a canary spin + audit-chain verify and reports per-component latency. Use this as your downstream liveness probe in Kubernetes.

### `GET /api/metrics`

Prometheus text-format export. Wire this into your Prometheus scrape config.

## Session

### `POST /api/session/create`

Open a session for a player.

```json
{
  "playerId": "p1",
  "jurisdiction": "UKGC",
  "lossLimitMinor": 50000
}
```

Response `201`:

```json
{
  "sessionId": "sess-mpb9w-000001",
  "playerId": "p1",
  "jurisdiction": "UKGC",
  "createdAt": "2026-05-18T14:00:00.000Z",
  "expiresAt": "2026-05-18T15:00:00.000Z",
  "balanceMinor": 100000,
  "currency": "EUR",
  "lossLimitMinor": 50000
}
```

### `POST /api/session/:sessionId/spin`

Run a spin against the session's wallet.

```json
{ "gameId": "lw-m1", "betMinor": 100, "seed": "optional", "autoplay": false }
```

UKGC sessions reject `autoplay: true`.

### `GET /api/session/:sessionId`

Full state including running totals.

### `DELETE /api/session/:sessionId`

Close the session and return the net result.

## GaaS

### `POST /api/gaas/compute-rtp`

Closed-form RTP estimate from an IR document. See **IR Schema** for the body shape.

### `POST /api/gaas/render-ir`

Returns the runtime config a UI driver needs to render the game (topology + uiHints).

### `POST /api/gaas/spin`

Server-authoritative spin keyed by `(gameId, sessionId, betAmount)`. Returns spin id, reel stop, win breakdown, and post-spin balance. Every response is appended to the audit hash-chain.

### `GET /api/gaas/seamless?operatorId=...`

Operator integration handshake. Returns the wallet endpoint, spin endpoint, and the ed25519 public key the operator should verify signed responses with.

### `GET /api/gaas/live` (WebSocket)

Real-time spin / wallet event stream. See **GaaS WebSocket** for the protocol.

## Audit

### `GET /api/audit/:sessionId`

Returns the hash-chain entries for a session, suitable for regulator replay.

### `POST /api/audit/:sessionId/verify`

Verifies the chain matches the merkle root. Returns `{ ok: boolean, mismatch?: number }`.

## Cert

### `POST /api/cert/submit`

Uploads an operator-package.zip to the cert lab queue. Returns a tracking id.

### `GET /api/cert/:trackingId`

Returns cert status + a signed PDF URL when ready.

## Error envelope

All errors use the same envelope:

```json
{ "error": "machine_readable_code", "message": "human readable" }
```

Status codes follow the usual REST conventions: 400 for bad input, 401 for missing API key, 404 for not-found, 409 for state conflict, 500 for unexpected internal failures.
