# GaaS WebSocket

`GET /api/gaas/live` upgrades to a WebSocket that streams real-time spin and wallet events to subscribed sessions. The protocol is intentionally tiny: every frame is a single JSON object with a discriminated `type` field.

## Connect

```
ws://localhost:4000/api/gaas/live?apiKey=YOUR_KEY
```

For TLS the upgrade URL is `wss://...`. In dev mode (empty `GAAS_API_KEYS`) the apiKey can be omitted.

## Lifecycle

1. Client opens the socket
2. Server emits `session-start`
3. Client sends `subscribe` to listen to one or more `sessionIds`
4. For each spin in those sessions the server emits a `spin` frame
5. Wallet debits and credits emit `wallet-update`
6. Server sends `ping` every 30s; client should reply with `pong`
7. On `session-end` the server sends a summary and closes

## Server-emitted frames

| `type` | Shape |
|---|---|
| `session-start` | `{ type, sessionId, timestamp }` |
| `spin` | `{ type, spinId, gameId, sessionId, result, balance, win, merkleCommit, timestamp }` |
| `wallet-update` | `{ type, playerId, balance, transactionId, timestamp }` |
| `session-end` | `{ type, sessionId, summary, timestamp }` |
| `ping` | `{ type, ts }` |
| `subscribed` | `{ type, sessionIds, timestamp }` |
| `unsubscribed` | `{ type, timestamp }` |
| `spin-ack` | `{ type, data, timestamp }` |
| `error` | `{ type, error, code? }` |

## Client-sent commands

| `type` | Shape |
|---|---|
| `subscribe` | `{ type, sessionIds: string[] }` |
| `unsubscribe` | `{ type }` |
| `spin` | `{ type, bet, gameId, sessionId }` |
| `ping` | `{ type, ts? }` |

## Heartbeat

The server emits `ping` every 30 seconds. Clients can either:

- Reply with `{ type: 'ping', ts: <serverTs> }` (the SDK does this automatically)
- Reply with a native WebSocket pong frame

Connections idle for more than 90 seconds are dropped.

## Reference client - TypeScript SDK

```typescript
import { SlotMathLiveClient } from '@slot-math-engine/sdk';

const live = new SlotMathLiveClient({
  apiUrl: 'http://localhost:4000',
  apiKey: 'YOUR_KEY',
});

live.on('session-start', (e) => console.log('session', e.sessionId));
live.on('spin',          (e) => console.log('win=', e.win, 'balance=', e.balance));
live.on('wallet-update', (e) => console.log('balance', e.balance));
live.on('error',         (e) => console.error('ws error', e.error));

await live.connect();
live.subscribe(['sess-abc']);
```

## Plain-`ws` example - Node

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:4000/api/gaas/live?apiKey=K');

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'subscribe', sessionIds: ['sess-abc'] }));
});

ws.on('message', (data) => {
  const frame = JSON.parse(data.toString());
  if (frame.type === 'ping') {
    ws.send(JSON.stringify({ type: 'ping', ts: frame.ts }));
    return;
  }
  console.log(frame);
});
```

## Use the playground

The **Playground** page in this docs site has a **Test WS** button that opens the configured URL and waits for the `session-start` frame. Use it to verify a freshly deployed backend before wiring up the SDK.
