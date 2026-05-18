# Backend API — CORTI 200.4-BACKEND

Production-style HTTP API exposed by the Fastify server in `server/`.
All endpoints accept and return JSON unless otherwise noted. All
monetary values are integer minor units (cents).

Base URL: `http://localhost:4000` (override via `PORT` env var).

CORS: enabled with `origin: true` so the studio at any local origin
can hit the API directly during development.

## Health

### GET `/api/health`

Used by the studio for backend auto-detection.

```jsonc
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

## Sessions

### POST `/api/session/create`

Open a session for a player in a jurisdiction.

Body:
```jsonc
{
  "playerId": "p1",
  "jurisdiction": "UKGC",      // optional: UKGC | MGA | SE | NJ | GENERIC
  "lossLimitMinor": 50000      // optional: override default
}
```

Response `201`:
```jsonc
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

Errors: `400 playerId_required`.

### GET `/api/session/:sessionId`

Full state of the session including running totals.

Response `200`: see `SessionState` in `state/sessions.ts`.
Error: `404 not_found`.

### DELETE `/api/session/:sessionId`

Close the session.

Response `200`:
```jsonc
{ "closed": true, "totalWageredMinor": 1500, "totalWonMinor": 1280, "netResultMinor": -220 }
```

### POST `/api/session/:sessionId/spin`

Run a spin against the session's wallet.

Body:
```jsonc
{
  "gameId": "lw-m1",
  "betMinor": 100,
  "seed": "optional-rng-seed",
  "autoplay": false        // optional; UKGC rejects autoplay=true
}
```

Response `200`:
```jsonc
{
  "spinId": "spin-sess-...-00000003",
  "result": { "winMinor": 250, "gameId": "lw-m1" },
  "balanceMinor": 100150,
  "winMinor": 250,
  "merkleCommit": "<sha256-hex>",
  "lossLimitReached": false
}
```

Errors:
- `400 invalid_bet | gameId_required`
- `402 insufficient_funds`
- `403 session_closed | autoplay_banned_in_jurisdiction | spin_pacing_violation | loss_limit_reached | game_not_allowed_in_jurisdiction`
- `404 game_not_found | session_not_found`

UKGC enforces: autoplay banned + min 2500ms between spins.

## Wallet

### GET `/api/wallet/:playerId/balance`

```jsonc
{ "playerId": "p1", "balanceMinor": 125000, "currency": "EUR", "lastUpdate": "..." }
```

### POST `/api/wallet/:playerId/deposit`

Body: `{ "amountMinor": 5000, "ref": "psp-1", "sessionId": "sess-..." }`

`sessionId` is optional — when present, the deposit is also recorded in
the session's audit chain.

Response: `{ "newBalanceMinor": 105000, "transactionId": "tx-...", "status": "approved" | "pending" }`

Deposits over 5,000,000 minor units return `status: "pending"` (mock PSP
review threshold).

### POST `/api/wallet/:playerId/withdraw`

Body: `{ "amountMinor": 2500, "ref": "...", "sessionId": "..." }`

Response: `{ "newBalanceMinor": ..., "transactionId": ..., "status": "approved" | "pending" | "declined", "reason"?: "insufficient_funds" }`

### GET `/api/wallet/:playerId/transactions`

```jsonc
{ "transactions": [ ... ], "count": 12 }
```

## Audit

### POST `/api/audit/append`

Append an entry to a session's hash-chain.

Body: `{ "sessionId": "sess-...", "type": "spin", "payload": { ... } }`

Response `201`:
```jsonc
{
  "auditId": "audit-sess-...-00000001",
  "timestamp": "...",
  "sha256": "<current hash>",
  "seq": 1,
  "prev": "<previous current hash>"
}
```

### GET `/api/audit/:sessionId`

```jsonc
{
  "sessionId": "sess-...",
  "entries": [ ... ],
  "merkleRoot": "<sha256-hex>",
  "count": 17,
  "chainOk": true
}
```

### GET `/api/audit/replay/:auditId`

Returns the entry plus its previous and next neighbours plus a chain
integrity flag for the whole session.

```jsonc
{
  "previous": { ... } | null,
  "current":  { ... },
  "next":     { ... } | null,
  "chainOk": true
}
```

Error: `404 audit_id_not_found`.

## Lobby

### GET `/api/lobby/games?jurisdiction=UKGC&category=lw-mgaps`

Both query params optional.

```jsonc
{
  "games": [
    {
      "id": "lw-m1",
      "title": "M1 Dragon Spin CrossLink Water",
      "supplier": "L&W Bally",
      "year": 2024,
      "topology": "rectangular",
      "mGap": "M1",
      "category": "lw-mgaps",
      "rtp": 0.955,
      "jurisdictions": ["UKGC","MGA","SE","NJ","GENERIC"],
      "thumbnail": "/thumbnails/lw-m1.png"
    }
  ],
  "count": 26
}
```

### POST `/api/lobby/launch`

Body: `{ "gameId": "lw-m1", "sessionId": "sess-..." }`

Response `200`:
```jsonc
{
  "launchUrl": "/play/lw-m1?session=...&token=...",
  "gameConfig": { "gameId": "lw-m1", "irFile": "lw-mgaps/M1-...ir.json", "rtp": 0.955, "topology": "rectangular" },
  "sessionToken": "<sha256-hex>"
}
```

Errors:
- `400 gameId_and_sessionId_required`
- `403 session_closed | game_not_allowed_in_jurisdiction`
- `404 game_not_found | session_not_found`

## Cert

### POST `/api/cert/submit`

Body: `{ "ir": { ... slot game IR ... }, "jurisdiction": "UKGC" }`

Response `201`:
```jsonc
{
  "submissionId": "cert-...",
  "status": "completed",
  "estimatedCompletion": "2026-05-19T14:00:00.000Z",
  "irSha256": "<canonical IR hash>"
}
```

Mock pipeline auto-advances through `submitted → validating →
par_generated → packaged → completed`. Real implementation hooks into
GLI / BMM / iTechLabs lab APIs.

### GET `/api/cert/:submissionId`

```jsonc
{
  "submissionId": "cert-...",
  "status": "completed",
  "jurisdiction": "UKGC",
  "createdAt": "...",
  "estimatedCompletion": "...",
  "irSha256": "...",
  "parSheet": { "sections": 12, "rtp": 0.955, "sha256": "..." },
  "operatorPackage": { "sizeBytes": 240, "sha256": "...", "downloadUrl": "/api/cert/cert-.../download" }
}
```

### GET `/api/cert/:submissionId/download`

Streams the operator-package zip bytes.

Headers:
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="operator-package-cert-....zip"`
- `X-Package-Sha256: <hex>`

## Studio bridge

The studio entrypoint (`web/studio/src/main.ts`) probes
`http://localhost:4000/api/health` on boot.

- If reachable, `window.__studio_backend__.connected === true` and a
  toast appears: "Backend connected".
- If not, the bridge stays installed but `connected === false`. UI code
  reads the flag and falls back to local stubs.

Override the backend URL with a meta tag:

```html
<meta name="studio-backend-url" content="https://api.studio.example.com" />
```

## Determinism + correctness

- Audit canonical JSON uses sorted keys → reproducible hashes across
  language runtimes.
- Mock spin RNG is deterministic from `(seed, spinNo)` — same inputs
  always give same `winMinor`, so audit replay is bit-identical.
- Wallet arithmetic is in integer minor units only — no float drift.
