/**
 * Example: Webhook handlers for analytics ingestion.
 *
 * The engine can be configured to POST audit + spin events to an operator
 * analytics endpoint instead of (or in addition to) streaming over the
 * WebSocket. This file shows the recommended handler shape and signature
 * verification.
 *
 * Expected output:
 *   webhook listener on :8081
 *   event: spin, sessionId=sess-abc, win=0.50, balance=99.50
 *
 * Run:
 *   tsx examples/webhook-handlers.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.WEBHOOK_PORT ?? 8081);
const SECRET = process.env.WEBHOOK_SECRET ?? 'dev-secret';

interface SpinEvent {
  type: 'spin';
  sessionId: string;
  spinId: string;
  gameId: string;
  win: number;
  balance: number;
  timestamp: string;
}

interface WalletEvent {
  type: 'wallet-update';
  playerId: string;
  balance: number;
  transactionId: string;
  timestamp: string;
}

type Event = SpinEvent | WalletEvent;

function verifySignature(body: string, headerSig: string | undefined): boolean {
  if (!headerSig) return false;
  const expected = createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(headerSig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function handleEvent(event: Event): void {
  if (event.type === 'spin') {
    console.log(
      `event: spin, sessionId=${event.sessionId}, win=${event.win.toFixed(2)}, balance=${event.balance.toFixed(2)}`
    );
  } else if (event.type === 'wallet-update') {
    console.log(`event: wallet-update, playerId=${event.playerId}, balance=${event.balance.toFixed(2)}`);
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('method_not_allowed');
    return;
  }
  const body = await readBody(req);
  const sig = req.headers['x-engine-signature'];
  const sigStr = Array.isArray(sig) ? sig[0] : sig;
  if (!verifySignature(body, sigStr)) {
    res.writeHead(401);
    res.end('bad_signature');
    return;
  }
  let event: Event;
  try {
    event = JSON.parse(body) as Event;
  } catch {
    res.writeHead(400);
    res.end('bad_json');
    return;
  }
  handleEvent(event);
  res.writeHead(200);
  res.end('ok');
});

server.listen(PORT, () => {
  console.log(`webhook listener on :${PORT}`);
});
