/**
 * Example: Operator integration.
 *
 * Production-style operator code. Connects to the engine GaaS layer, opens
 * a session for a player, runs a few spins, and tails the WebSocket for
 * wallet updates.
 *
 * Expected output (truncated):
 *   handshake -> publicKey=302a300506032b6570032100...
 *   session sess-... opened, balance=1.00
 *   spin spin-...: win=0.00, balance=0.99
 *   spin spin-...: win=0.50, balance=1.49
 *   live wallet-update: 1.49 -> 1.49
 *
 * Run:
 *   tsx examples/operator-integration.ts
 */

import { SlotMathClient, SlotMathLiveClient } from '@slot-math-engine/sdk';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const API_KEY = process.env.API_KEY ?? '';

async function main(): Promise<void> {
  const client = new SlotMathClient({ apiUrl: API_URL, apiKey: API_KEY });

  // 1. Handshake - get the public key + wallet/spin endpoints.
  const handshake = await client.seamlessHandshake('demo-operator');
  console.log('handshake -> publicKey=' + handshake.publicKey.slice(0, 40) + '...');

  // 2. Open a session.
  const session = (await fetch(`${API_URL}/api/session/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ playerId: 'p1', jurisdiction: 'GENERIC' }),
  }).then((r) => r.json())) as { sessionId: string; balanceMinor: number };
  console.log(`session ${session.sessionId} opened, balance=${(session.balanceMinor / 100).toFixed(2)}`);

  // 3. Run two spins.
  for (let i = 0; i < 2; i++) {
    const spin = await client.spin('demo-1', session.sessionId, 1.0);
    console.log(`spin ${spin.spinId}: win=${spin.totalWin.toFixed(2)}, balance=${spin.balance.toFixed(2)}`);
  }

  // 4. Subscribe to the live stream for any subsequent spins.
  const live = new SlotMathLiveClient({ apiUrl: API_URL, apiKey: API_KEY });
  live.on('wallet-update', (e) => {
    console.log(`live wallet-update: ${(e.balance).toFixed(2)}`);
  });
  await live.connect();
  live.subscribe([session.sessionId]);

  // close after 5s (in real ops you'd keep the socket open).
  setTimeout(() => live.close(), 5000);
}

main().catch((err) => {
  console.error('operator integration failed', err);
  process.exit(1);
});
