# GaaS API — Gaming-as-a-Service

CORTI 200.7-MARKETPLACE introduces a GaaS API layer on top of the
existing slot-math-engine backend so external operators can integrate
without forking the engine.

## Base URL

`http://localhost:4000` (dev). Production deploys behind your own
domain.

## Authentication

Pass `x-api-key: <KEY>` on every request. Keys are configured via the
`GAAS_API_KEYS` env var (comma-separated). When the var is empty the
server runs in dev mode and accepts all requests.

## Endpoints

### POST /api/gaas/compute-rtp

Compute closed-form RTP estimate from an IR document.

**Body** — IR document (subset accepted):

```json
{
  "gameId": "demo-1",
  "topology": { "kind": "rectangular", "reels": 5, "rows": 3 },
  "symbols": { "HP": 3, "MP": 3, "LP": 3 },
  "features": { "free_spins": { "trigger": 3, "count": 10 } },
  "rtpTarget": 0.955
}
```

**Response**:

```json
{
  "rtp": 0.955,
  "hitFrequency": 0.27,
  "variance": 1.4,
  "method": "closed-form"
}
```

**Errors**: `400 invalid_ir` (missing `symbols` or `topology`).

### POST /api/gaas/render-ir

Return the runtime config an operator's client must load to render
the game.

**Body**: IR document (must include `gameId` and `topology`).

**Response**:

```json
{
  "gameId": "demo-1",
  "topology": { "kind": "rectangular", "reels": 5, "rows": 3 },
  "rtp": 0.955,
  "irFile": "runtime/demo-1.ir.json",
  "uiHints": { "reels": 5, "rows": 3, "features": ["free_spins"] }
}
```

### POST /api/gaas/spin

Server-authoritative spin. The backend:

1. Resolves the session + game
2. Validates jurisdiction
3. Atomically debits the wallet
4. Computes the outcome with a deterministic RNG (seed = sessionId + spin-counter)
5. Credits any win
6. Appends to the audit hash-chain
7. Returns the outcome + post-spin balance

**Body**:

```json
{
  "gameId": "demo-1",
  "sessionId": "sess-abc",
  "betAmount": 1.00
}
```

**Response**:

```json
{
  "spinId": "gaas-spin-sess-abc-0",
  "reelStop": [["HP","MP","LP"], ...],
  "totalWin": 0,
  "wins": [],
  "hash": "<sha256>",
  "balance": 99.0
}
```

**Errors**: `400 invalid_spin_request`, `402 insufficient_funds`,
`403 session_closed` / `game_not_allowed_in_jurisdiction`,
`404 session_not_found` / `game_not_found`.

### GET /api/gaas/seamless?operatorId=&lt;id&gt;

Operator handshake. Returns the wallet + spin endpoints the operator
should integrate against plus a per-operator public key fingerprint.

**Response**:

```json
{
  "operatorId": "opX",
  "walletEndpoint": "https://api.example.com/api/wallet",
  "spinEndpoint":   "https://api.example.com/api/gaas/spin",
  "publicKey": "<sha256>",
  "timestamp": "2026-05-18T10:00:00Z"
}
```

### GET /api/gaas/live?sessionId=&lt;id&gt;&since=&lt;seq&gt;

Live event stream. Returns all audit events for the session newer than
`since`. The intended deployment swaps this for a true WebSocket
without changing the wire shape.

**Response**:

```json
{
  "sessionId": "sess-abc",
  "events": [
    { "type": "gaas.spin", "seq": 0, "timestamp": "...", "payload": { ... } }
  ],
  "cursor": 0
}
```

## SDK

Use `@slot-math-engine/sdk` to call this API without writing raw HTTP:

```typescript
import { SlotMathClient, IRBuilder } from '@slot-math-engine/sdk';

const client = new SlotMathClient({
  apiUrl: 'http://localhost:4000',
  apiKey: 'mykey',
});

const ir = new IRBuilder()
  .gameId('demo-1')
  .topology({ kind: 'rectangular', reels: 5, rows: 3 })
  .symbolPool({ HP: 3, MP: 3, LP: 3 })
  .build();

const rtp = await client.computeRTP(ir);
const spin = await client.spin('demo-1', 'sess-abc', 1.0);
```

## Audit + Determinism

Every spin is deterministically reproducible given the seed
`sessionId:spinCounter`. The hash-chain in `AuditStore` is the same one
used by the rest of the engine, so a regulator's standard chain
verification still applies.
