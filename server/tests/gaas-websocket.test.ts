/**
 * CORTI W204-PROTOCOLS — GaaS WebSocket /live endpoint tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

/**
 * Connect to the WS endpoint and buffer every parsed message in order.
 * Returns the buffer + a wait function that resolves to the next message
 * matching the predicate (consuming previously-buffered messages too).
 */
async function openWs(app: FastifyInstance): Promise<{
  ws: WebSocket;
  waitFor: (predicate?: (m: any) => boolean, timeoutMs?: number) => Promise<any>;
}> {
  const ws = await app.injectWS('/api/gaas/live');
  const buffer: any[] = [];
  const waiters: Array<{ predicate: (m: any) => boolean; resolve: (m: any) => void; reject: (e: Error) => void; t: NodeJS.Timeout }> = [];
  ws.on('message', (raw: Buffer) => {
    let parsed: any;
    try { parsed = JSON.parse(raw.toString()); } catch { return; }
    // Try to satisfy pending waiters first.
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i];
      if (w.predicate(parsed)) {
        clearTimeout(w.t);
        waiters.splice(i, 1);
        w.resolve(parsed);
        return;
      }
    }
    buffer.push(parsed);
  });
  const waitFor = (predicate: (m: any) => boolean = () => true, timeoutMs = 4000): Promise<any> => {
    // Drain buffer first.
    for (let i = 0; i < buffer.length; i++) {
      if (predicate(buffer[i])) {
        const m = buffer.splice(i, 1)[0];
        return Promise.resolve(m);
      }
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error('timeout waiting for ws message'));
      }, timeoutMs);
      waiters.push({ predicate, resolve, reject, t });
    });
  };
  return { ws, waitFor };
}

describe('GaaS WebSocket /live', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('handshake succeeds and emits session-start immediately', async () => {
    const { ws, waitFor } = await openWs(app);
    const msg = await waitFor((m) => m.type === 'session-start');
    expect(typeof msg.sessionId).toBe('string');
    expect(typeof msg.timestamp).toBe('string');
    ws.close();
  });

  it('subscribe acknowledges with the registered sessionIds', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    ws.send(JSON.stringify({ type: 'subscribe', sessionIds: ['s-a', 's-b'] }));
    const ack = await waitFor((m) => m.type === 'subscribed');
    expect(ack.sessionIds).toEqual(['s-a', 's-b']);
    ws.close();
  });

  it('unsubscribe clears the subscription set', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    ws.send(JSON.stringify({ type: 'subscribe', sessionIds: ['x'] }));
    await waitFor((m) => m.type === 'subscribed');
    ws.send(JSON.stringify({ type: 'unsubscribe' }));
    const ack = await waitFor((m) => m.type === 'unsubscribed');
    expect(ack.type).toBe('unsubscribed');
    ws.close();
  });

  it('emits an error message for invalid JSON', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    ws.send('not-json');
    const err = await waitFor((m) => m.type === 'error');
    expect(err.error).toBe('invalid_json');
    ws.close();
  });

  it('emits an error message when type is missing', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    ws.send(JSON.stringify({ foo: 1 }));
    const err = await waitFor((m) => m.type === 'error');
    expect(err.error).toBe('missing_type');
    ws.close();
  });

  it('emits an error for an unknown type', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    ws.send(JSON.stringify({ type: 'no-such-command' }));
    const err = await waitFor((m) => m.type === 'error');
    expect(err.error).toBe('unknown_type');
    ws.close();
  });

  it('responds to client ping with a pong carrying the ts', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    ws.send(JSON.stringify({ type: 'ping', ts: 12345 }));
    const pong = await waitFor((m) => m.type === 'pong');
    expect(pong.ts).toBe(12345);
    ws.close();
  });

  it('drives a server-authoritative spin via WebSocket command', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'wsp1', jurisdiction: 'MGA' },
    });
    const { sessionId } = create.json();

    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');

    ws.send(JSON.stringify({ type: 'subscribe', sessionIds: [sessionId] }));
    await waitFor((m) => m.type === 'subscribed');

    ws.send(JSON.stringify({ type: 'spin', bet: 1.0, gameId: 'test-game-1', sessionId }));
    const spinEvent = await waitFor((m) => m.type === 'spin');
    expect(spinEvent.sessionId).toBe(sessionId);
    expect(spinEvent.spinId).toMatch(/^gaas-spin-/);
    expect(typeof spinEvent.balance).toBe('number');
    ws.close();
  });

  it('rejects a spin command for unknown session with an error frame', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    ws.send(JSON.stringify({ type: 'spin', bet: 1.0, gameId: 'test-game-1', sessionId: 'no-such' }));
    const err = await waitFor((m) => m.type === 'error');
    expect(err.error).toBe('session_not_found');
    expect(err.code).toBe(404);
    ws.close();
  });

  it('close cleans up the connection without erroring', async () => {
    const { ws, waitFor } = await openWs(app);
    await waitFor((m) => m.type === 'session-start');
    const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));
    ws.close();
    await closed;
    expect(true).toBe(true);
  });

  it('two concurrent connections each receive their own session-start', async () => {
    const a = await openWs(app);
    const b = await openWs(app);
    const [ma, mb] = await Promise.all([
      a.waitFor((m) => m.type === 'session-start'),
      b.waitFor((m) => m.type === 'session-start'),
    ]);
    expect(ma.sessionId).not.toBe(mb.sessionId);
    a.ws.close();
    b.ws.close();
  });
});
