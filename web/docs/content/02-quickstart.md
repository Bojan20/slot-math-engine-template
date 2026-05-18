# Quickstart

This page walks you from `npm install` to computing RTP for a five-reel slot in under five minutes.

## Prereqs

- Node 18 or newer
- `git`
- Optional: Docker, if you want to spin up Postgres for the server

## Install

```bash
git clone https://github.com/slot-math-engine/template.git
cd slot-math-engine-template
npm install
npm run build
```

That builds the TypeScript engine into `dist/`. The first build takes ~30s.

## Run the full vitest suite

```bash
npm test
```

You should see **6352 passing specs** with zero regressions. If anything fails, run `npm run lint` first to catch any local TS drift.

## Boot the backend server

```bash
npm run server:dev
```

Listens on `http://localhost:4000`. Health probe:

```bash
curl http://localhost:4000/api/health
```

## Compute RTP via the SDK

```typescript
import { SlotMathClient, IRBuilder } from '@slot-math-engine/sdk';

const client = new SlotMathClient({ apiUrl: 'http://localhost:4000' });

const ir = new IRBuilder()
  .gameId('demo-1')
  .topology({ kind: 'rectangular', reels: 5, rows: 3 })
  .symbolPool({ HP: 3, MP: 3, LP: 3, WILD: 1 })
  .feature('free_spins', { trigger: 3, count: 10 })
  .rtpTarget(0.955)
  .build();

const result = await client.computeRTP(ir);
console.log(`RTP=${result.rtp.toFixed(4)} hitFreq=${result.hitFrequency.toFixed(3)}`);
```

Expected output:

```
RTP=0.9550 hitFreq=0.270
```

## Run a server-authoritative spin

```typescript
const spin = await client.spin('demo-1', 'sess-abc', 1.0);
console.log(`spinId=${spin.spinId} totalWin=${spin.totalWin} balance=${spin.balance}`);
```

Every spin is appended to the audit hash-chain (Merkle commit returned in the response) so a regulator can replay the chain offline.

## Boot the Studio

```bash
npm run studio:dev
```

Opens on `http://localhost:5173`. Drag-drop an IR file or use the **Generate** button to scaffold a 5x3 layout.

## Next steps

- Read **IR Schema** for the full IR document grammar
- Read **Studio Workflow** to see how designers, math, and producers interact
- See **REST API** for the full endpoint reference
