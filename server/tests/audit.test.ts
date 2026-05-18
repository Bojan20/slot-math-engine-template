import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';
import { sha256Hex, canonicalize, verifyChain } from '../lib/hashChain.js';

describe('Audit API', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('appends an entry and returns sha256', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/audit/append',
      payload: { sessionId: 's1', type: 'unit.test', payload: { x: 1 } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.auditId).toMatch(/^audit-/);
    expect(body.sha256).toHaveLength(64);
    expect(body.seq).toBe(0);
  });

  it('rejects append without sessionId or type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/audit/append',
      payload: { sessionId: 's1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('query returns entries + merkleRoot', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/audit/append',
      payload: { sessionId: 's2', type: 'a', payload: { i: 1 } },
    });
    await app.inject({
      method: 'POST',
      url: '/api/audit/append',
      payload: { sessionId: 's2', type: 'a', payload: { i: 2 } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/audit/s2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(2);
    expect(body.merkleRoot).toHaveLength(64);
    expect(body.chainOk).toBe(true);
  });

  it('hash-chain integrity: entry[i+1].prev === entry[i].current', async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/audit/append',
        payload: { sessionId: 's3', type: 't', payload: { i } },
      });
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/audit/s3',
    });
    const entries = res.json().entries;
    expect(entries).toHaveLength(5);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prev).toBe(entries[i - 1].current);
    }
  });

  it('replay returns previous/current/next neighbours', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/audit/append',
        payload: { sessionId: 's4', type: 'r', payload: { i } },
      });
      ids.push(r.json().auditId);
    }
    const res = await app.inject({
      method: 'GET',
      url: `/api/audit/replay/${ids[1]}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.previous?.auditId).toBe(ids[0]);
    expect(body.current.auditId).toBe(ids[1]);
    expect(body.next?.auditId).toBe(ids[2]);
    expect(body.chainOk).toBe(true);
  });

  it('replay first entry: previous is null', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/audit/append',
      payload: { sessionId: 's5', type: 'r', payload: {} },
    });
    const id = r.json().auditId;
    const res = await app.inject({
      method: 'GET',
      url: `/api/audit/replay/${id}`,
    });
    expect(res.json().previous).toBe(null);
    expect(res.json().next).toBe(null);
  });

  it('replay unknown id → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/audit/replay/audit-bogus',
    });
    expect(res.statusCode).toBe(404);
  });

  it('canonicalization is stable across key order', () => {
    const a = canonicalize({ b: 2, a: 1 });
    const b = canonicalize({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it('verifyChain detects tampered payload', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/audit/append',
      payload: { sessionId: 's6', type: 't', payload: { x: 1 } },
    });
    await app.inject({
      method: 'POST',
      url: '/api/audit/append',
      payload: { sessionId: 's6', type: 't', payload: { x: 2 } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/audit/s6',
    });
    const entries = res.json().entries;
    // Tamper with the first entry's payload — recompute should fail.
    const tampered = [...entries];
    tampered[0] = { ...tampered[0], payload: { x: 999 } };
    const v = verifyChain(tampered);
    expect(v.ok).toBe(false);
  });
});
