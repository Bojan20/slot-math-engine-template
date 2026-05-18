# TypeScript SDK

`@slot-math-engine/sdk` is the official npm package for talking to the engine. It is a thin TypeScript layer over the REST + WebSocket APIs plus a fluent IR builder and a kernel-author helper.

## Install

```bash
npm install @slot-math-engine/sdk
```

Requires Node 18+ (native `fetch`) or a modern browser. Node 22+ also exposes `WebSocket` globally; older runtimes can pass `opts.webSocketImpl` (e.g. the `ws` package).

## Public surface

| Symbol | Purpose |
|---|---|
| `SlotMathClient` | REST client wrapping the HTTP API |
| `SlotMathLiveClient` | WebSocket client for `/api/gaas/live` |
| `IRBuilder` | Fluent builder for IR documents |
| `defineKernel` | Author a new math kernel |
| `validateParams` | Runtime param-spec validation |
| `defaultMC` | Drop-in Monte-Carlo helper |
| `IRDocument` | IR type definition |
| `RTPResult` | Closed-form RTP result type |
| `SpinResult` | Server-authoritative spin result |
| `LiveEvent` | Discriminated union of WS server frames |
| `LiveCommand` | Discriminated union of WS client commands |

## `SlotMathClient`

```typescript
const client = new SlotMathClient({
  apiUrl: 'http://localhost:4000',
  apiKey: 'YOUR_KEY',  // optional
  timeoutMs: 10_000,   // optional, default 10s
});
```

Methods:

| Method | Returns |
|---|---|
| `health()` | `{ ok, name, version }` |
| `computeRTP(ir)` | `RTPResult` |
| `renderIR(ir)` | `RenderConfig` |
| `spin(gameId, sessionId, betAmount)` | `SpinResult` |
| `seamlessHandshake(operatorId)` | `SeamlessHandshake` |
| `listGames(jurisdiction?)` | `{ games, count }` |

## `IRBuilder`

```typescript
const ir = new IRBuilder()
  .gameId('demo-game')
  .topology({ kind: 'rectangular', reels: 5, rows: 3 })
  .symbolPool({ HP: 3, MP: 3, LP: 3, WILD: 1 })
  .feature('free_spins', { trigger: 3, count: 10 })
  .rtpTarget(0.955)
  .jurisdictions(['UKGC', 'MGA'])
  .build();
```

Calling `.build()` validates that `gameId`, `topology`, and `symbols` are present. Anything else is optional and is filled with sane defaults by the engine.

## `SlotMathLiveClient`

See **GaaS WebSocket** for the full protocol. Quick example:

```typescript
const live = new SlotMathLiveClient({ apiUrl: 'http://localhost:4000' });

live.onAny((e) => console.log('frame', e));

await live.connect();
live.subscribe(['sess-abc']);
live.send({ type: 'spin', bet: 1, gameId: 'demo-1', sessionId: 'sess-abc' });
```

## `defineKernel`

Authors a kernel definition you can register with the engine:

```typescript
import { defineKernel, validateParams } from '@slot-math-engine/sdk';

const cascadePyramid = defineKernel({
  name: 'cascade-multiplier-pyramid',
  version: '1.0.0',
  family: 'cascade',
  paramSpec: [
    { key: 'pTrigger', type: 'number', min: 0, max: 1 },
    { key: 'multiplier', type: 'integer', min: 1, max: 100 },
  ],
  closedForm: (ctx, params) => {
    validateParams(cascadePyramid.paramSpec, params as Record<string, unknown>);
    const p = params.pTrigger as number;
    const m = params.multiplier as number;
    return { rtp: p * m * 0.5, hitFrequency: p };
  },
});
```

## Error handling

REST errors throw an `ApiError`:

```typescript
try {
  await client.spin('bad-game', 'bad-sess', 1);
} catch (e) {
  const err = e as ApiError;
  console.error(err.statusCode, err.body);
}
```

WebSocket errors arrive as `{ type: 'error', error: '...' }` frames. Register a handler:

```typescript
live.on('error', (e) => console.error('ws error', e.error));
```

## TypeScript definitions

Everything exported from the package is fully typed. No `.d.ts` shim needed. `npx tsc --noEmit` against your code should be enough to catch any shape mismatch with the SDK contract.

## License

MIT.
