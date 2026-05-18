# FAQ + Troubleshooting

## General

### What is closed-form RTP?

A closed-form RTP is an analytical formula for the expected return - no simulation needed. The engine ships 77 closed-form kernels, one per mechanic family, so you compute RTP in milliseconds instead of running 50M-spin Monte-Carlo.

### Why bother with Monte-Carlo if you have closed-form?

Two reasons. (1) Regulators want the validation. (2) The closed-form catches the analytical mean but the MC corpus catches variance + extreme-tail behaviour (max-win cap truncation, multi-feature interactions).

### What is the audit hash-chain?

Every spin response is appended to a per-session sha256 hash-chain. The chain head is signed with the engine's HSM ed25519 key. A regulator can replay the chain offline and re-verify every spin against the closed-form kernel. This is what gives us cert-grade chain-of-custody.

### Can I run the engine offline?

Yes. The Studio + math validator work fully offline. The server is the only piece that wants a database; for offline cert work you can run it against a temporary sqlite file.

## SDK

### Why is `fetch` undefined in my Node 16 project?

Native `fetch` lands in Node 18. Either upgrade Node or pass a polyfill:

```typescript
import nodeFetch from 'node-fetch';
const client = new SlotMathClient({ apiUrl, fetch: nodeFetch as any });
```

### How do I authenticate?

Pass `apiKey` to the client constructor. The SDK adds `x-api-key` on every request. WebSocket clients pass `apiKey` as a query param.

### `SlotMathLiveClient` says no WebSocket impl

Node 22+ exposes `WebSocket` globally. On older Node use the `ws` package:

```typescript
import { WebSocket } from 'ws';
const live = new SlotMathLiveClient({ apiUrl, webSocketImpl: WebSocket as any });
```

## REST API

### My request returns 401 `api_key_required`

Either set `GAAS_API_KEYS=key1,key2` on the server and pass `x-api-key`, or leave `GAAS_API_KEYS` empty for dev mode (open access).

### Why is `betAmount` a decimal but `betMinor` is an integer?

GaaS endpoints accept `betAmount` in major units (e.g. dollars) because that's what cabinets emit. The internal wallet and audit chain use integer minor units (cents) to avoid floating-point drift. The server converts on entry.

### Why are reels returned as `string[][]`?

Each inner array is a single reel position from top to bottom. Outer index is reel id 0..n-1. The cabinet driver uses this shape directly for the spin-stop animation.

## IR

### My IR fails `parseGameIR` with "topology.rows must be number or number[]"

`rows` is a single integer for fixed grids (e.g. 3 for a 5x3) and an array of per-reel heights for megaways (e.g. `[2,3,4,5,4,3]`). Strings are not accepted.

### Why is `paytable` optional?

The engine derives a fair paytable from `symbols` + `rtpTarget` when `paytable` is omitted. This is fine for prototypes; producers usually pin an explicit paytable before cert.

## Cert

### What is in operator-package.zip?

```
operator-package.zip
├── ir.canonical.json       canonical IR
├── paytable.json           explicit paytable
├── par-usif.v1.json        PAR sheet
├── audit-chain.json        hash-chain export
├── jurisdiction-emit.json  per-jurisdiction overlay report
├── signature.ed25519       detached signature over the above
└── manifest.json           index + sha256 per file
```

### How do I verify a signed cert PDF?

```bash
npm run cert:verify -- --pdf ./cert.pdf
```

The script extracts the embedded ed25519 signature and re-verifies it against the engine's public key.

## Deploy

### How big does Postgres get?

The audit chain is the biggest line item. Budget ~1 KB per spin uncompressed. A typical operator does 50M spins/day -> ~50 GB/day. We recommend partitioning by day and archiving > 90 days to S3.

### Where are my logs?

The server uses pino with JSON output to stdout. Wire it into your log shipper (Loki, ELK, Datadog). The `LOG_LEVEL` env var controls verbosity.

## Studio

### Studio shows "backend offline"

The Studio auto-detects the backend by GET `/api/health`. Make sure the server is up on port `4000` (or set `VITE_API_URL` in `web/studio/.env.local`).

### Why does `npm run studio:test` fail with a vite-plugin error?

Run `cd web/studio && npm install` once; the studio is a separate npm workspace and its devDependencies aren't installed by the root `npm install`.
