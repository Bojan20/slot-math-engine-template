# slot-math-engine-template · server (CORTI 200.4-BACKEND)

Production-style Fastify backend for the studio. Real-money ready
skeleton: session lifecycle, mock wallet, append-only hash-chain audit,
game lobby, cert submission. All state is in-memory — a real deployment
must back the stores with Postgres + Redis + S3.

## Quick start

```bash
# from repo root
npm install                # fastify + tsx installed at root
npm run server:dev         # boots tsx watch on :4000
# in another shell:
curl http://localhost:4000/api/health
npm run server:test        # 46 vitest specs
npm run server:build       # tsc → dist/server/
npm run server:start       # node dist/server/index.js
```

Override the port: `PORT=4321 npm run server:dev`.

## Architecture

```
server/
├── index.ts                 # Fastify bootstrap + build()
├── tsconfig.json            # extends ES2022 + strict
├── vitest.config.ts         # in-process tests via app.inject()
├── lib/
│   └── hashChain.ts         # SHA-256 chain helper (canonical JSON)
├── state/                   # in-memory store classes
│   ├── sessions.ts          # jurisdiction-aware session store
│   ├── wallet.ts            # mock wallet (deposit/withdraw/wager)
│   ├── audit.ts             # session-scoped hash chains + Merkle
│   ├── games.ts             # 26-item IR library mirror
│   └── cert.ts              # mock cert lab pipeline
├── routes/                  # Fastify route registrars
│   ├── session.ts
│   ├── wallet.ts
│   ├── audit.ts
│   ├── lobby.ts
│   └── cert.ts
└── tests/                   # 46 vitest specs
    ├── helpers.ts
    ├── session.test.ts      # 13 specs
    ├── wallet.test.ts       # 9 specs
    ├── audit.test.ts        # 9 specs
    ├── lobby.test.ts        # 7 specs
    └── cert.test.ts         # 8 specs
```

## API reference

See [`docs/BACKEND_API.md`](../docs/BACKEND_API.md) for the canonical
OpenAPI-style spec.

## UKGC compliance

| Rule                            | Where enforced                  |
|---------------------------------|---------------------------------|
| Autoplay banned                 | `state/sessions.decideSpin`     |
| Min 2500ms between spins        | `state/sessions.decideSpin`     |
| Session loss limit (default 500.00) | `state/sessions.recordSpin` |
| Session timeout 1h              | `state/sessions.create`         |

Policies per jurisdiction live in `JURISDICTION_POLICIES`
(`state/sessions.ts`) — UKGC / MGA / SE / NJ / GENERIC out of the box.

## Hash-chain audit

Every audit entry is sealed with:

```
prev    = SHA-256(previous entry's `current` hash) // ZERO_HASH for the first
current = SHA-256(canonical-JSON({ seq, timestamp, type, payload, prev }))
```

Canonical JSON = sorted-keys serialization (`lib/hashChain.canonicalize`).
Chain verification (`verifyChain`) walks the list and confirms both that
links chain correctly and that every `current` is stable under
re-serialization — tampering with any payload field is detected.

Per-session Merkle root is exposed via `GET /api/audit/:sessionId` for
regulators that prefer to anchor whole sessions to a single hash.

## Security notes (production checklist)

- Replace in-memory stores with Postgres for sessions/wallet/cert and
  Redis for hot session state.
- Persist audit chains to an append-only log (NDJSON like
  `src/recall/journal.ts`, or a real WORM bucket).
- Mount the wallet routes behind PSP signed-payload verification.
- Wire `/api/cert/submit` to GLI / BMM / iTechLabs APIs.
- Add JWT-based auth middleware on every `/api/*` route except
  `/api/health`.
- Configure CORS origin to the production studio domain only.
- Run under a process supervisor (PM2 / systemd) with TLS termination
  in front (nginx / Caddy).

## Tests

```
npm run server:test
# 5 test files / 46 tests / ~380ms
```

All tests use Fastify's `app.inject()` — no real port binding, fast,
isolated stores per test via `buildTestApp()` helper.
