# @slot-math-engine/sdk

Public SDK for `slot-math-engine`. Lets third-party developers compute
RTP, run server-authoritative spins, and author their own math kernels
on top of the engine.

## Install

```bash
npm install @slot-math-engine/sdk
```

> Requires Node >= 18 (uses native `fetch`).

## Quickstart

```typescript
import { SlotMathClient, IRBuilder } from '@slot-math-engine/sdk';

const client = new SlotMathClient({
  apiUrl: 'http://localhost:4000',
  apiKey: 'YOUR_KEY', // optional
});

// 1. Build an IR document fluently
const ir = new IRBuilder()
  .gameId('demo-game-1')
  .topology({ kind: 'rectangular', reels: 5, rows: 3 })
  .symbolPool({ HP: 3, MP: 3, LP: 3 })
  .feature('free_spins', { trigger: 3, count: 10 })
  .rtpTarget(0.955)
  .build();

// 2. Compute closed-form RTP
const result = await client.computeRTP(ir);
console.log(result.rtp, result.hitFrequency);

// 3. Server-authoritative spin
const spin = await client.spin('demo-game-1', 'sess-abc', 1.0);
console.log(spin.totalWin, spin.balance);
```

## Authoring a kernel

```typescript
import { defineKernel, validateParams } from '@slot-math-engine/sdk';

const myKernel = defineKernel({
  name: 'cascade-multiplier-pyramid',
  version: '1.0.0',
  family: 'cascade',
  paramSpec: [
    { key: 'pTrigger', type: 'number', min: 0, max: 1 },
    { key: 'multiplier', type: 'integer', min: 1, max: 100 },
  ],
  closedForm: (ctx, params) => {
    validateParams(myKernel.paramSpec, params as Record<string, unknown>);
    const p = params.pTrigger as number;
    const m = params.multiplier as number;
    return {
      rtp: p * m * 0.5,
      hitFrequency: p,
    };
  },
});
```

## Public surface

| Symbol | Purpose |
|---|---|
| `SlotMathClient` | REST client wrapping the engine HTTP API |
| `IRBuilder` | Fluent IR document builder |
| `defineKernel` | Author a new math kernel |
| `validateParams` | Runtime param-spec validation |
| `defaultMC` | Drop-in Monte-Carlo helper |
| `IRDocument` | IR type definition |
| `RTPResult` | Closed-form RTP result type |
| `SpinResult` | Server-authoritative spin result |

## License

MIT.
