/**
 * CORTI W206-PERSISTENCE — Postgres-backed AuditStore + hash-chain.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PgConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { PostgresAuditStore } from '../state/audit-pg.js';
import { fakePoolFactory } from './fake-pg.js';
import { ZERO_HASH } from '../lib/hashChain.js';

async function freshStore(): Promise<{ store: PostgresAuditStore; conn: PgConnection }> {
  const conn = new PgConnection({ poolFactory: fakePoolFactory() });
  await runMigrations(conn);
  return { store: new PostgresAuditStore(conn), conn };
}

describe('PostgresAuditStore', () => {
  let store: PostgresAuditStore;
  let conn: PgConnection;
  beforeEach(async () => {
    const f = await freshStore();
    store = f.store;
    conn = f.conn;
  });

  it('append returns sealed entry with ZERO prev on first row', async () => {
    const e = await store.append({ sessionId: 's1', type: 'spin', payload: { v: 1 } });
    expect(e.prev).toBe(ZERO_HASH);
    expect(e.current).toMatch(/^[0-9a-f]{64}$/);
    expect(e.seq).toBe(0);
  });

  it('subsequent appends chain to previous hash', async () => {
    const a = await store.append({ sessionId: 's2', type: 'a', payload: 1 });
    const b = await store.append({ sessionId: 's2', type: 'b', payload: 2 });
    expect(b.prev).toBe(a.current);
    expect(b.seq).toBe(1);
  });

  it('verify() returns ok=true for an intact chain', async () => {
    await store.append({ sessionId: 's3', type: 'a', payload: 1 });
    await store.append({ sessionId: 's3', type: 'b', payload: 2 });
    await store.append({ sessionId: 's3', type: 'c', payload: 3 });
    const v = await store.verify('s3');
    expect(v.ok).toBe(true);
  });

  it('query() returns entries plus merkle root', async () => {
    await store.append({ sessionId: 's4', type: 'a', payload: 1 });
    await store.append({ sessionId: 's4', type: 'b', payload: 2 });
    const q = await store.query('s4');
    expect(q.count).toBe(2);
    expect(q.entries.length).toBe(2);
    expect(q.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it('query() returns empty result for unknown session', async () => {
    const q = await store.query('s-bogus');
    expect(q.count).toBe(0);
    expect(q.entries).toEqual([]);
  });

  it('replay() returns previous + next neighbours', async () => {
    const a = await store.append({ sessionId: 's5', type: 'a', payload: 1 });
    const b = await store.append({ sessionId: 's5', type: 'b', payload: 2 });
    const c = await store.append({ sessionId: 's5', type: 'c', payload: 3 });
    const r = await store.replay(b.auditId);
    expect(r?.previous?.auditId).toBe(a.auditId);
    expect(r?.next?.auditId).toBe(c.auditId);
    expect(r?.chainOk).toBe(true);
  });

  it('replay() returns null for malformed audit id', async () => {
    expect(await store.replay('not-an-audit-id')).toBeNull();
  });

  it('hash chain survives simulated restart (new store, same conn)', async () => {
    await store.append({ sessionId: 's6', type: 'a', payload: 1 });
    await store.append({ sessionId: 's6', type: 'b', payload: 2 });
    const reborn = new PostgresAuditStore(conn);
    const next = await reborn.append({ sessionId: 's6', type: 'c', payload: 3 });
    expect(next.seq).toBe(2);
    // Chain still verifies end-to-end.
    expect((await reborn.verify('s6')).ok).toBe(true);
  });

  it('sessionCount + totalEntries reflect the table', async () => {
    await store.append({ sessionId: 's7a', type: 'x', payload: 1 });
    await store.append({ sessionId: 's7a', type: 'x', payload: 2 });
    await store.append({ sessionId: 's7b', type: 'x', payload: 3 });
    expect(await store.sessionCount()).toBe(2);
    expect(await store.totalEntries()).toBe(3);
  });

  it('reset() empties the audit_log table', async () => {
    await store.append({ sessionId: 's8', type: 'x', payload: 1 });
    expect(await store.totalEntries()).toBe(1);
    await store.reset();
    expect(await store.totalEntries()).toBe(0);
  });
});
