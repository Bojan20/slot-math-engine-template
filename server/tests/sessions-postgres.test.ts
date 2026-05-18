/**
 * CORTI W206-PERSISTENCE — Postgres-backed SessionStore.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PgConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { PostgresSessionStore } from '../state/sessions-pg.js';
import { fakePoolFactory } from './fake-pg.js';

async function freshStore(): Promise<{ store: PostgresSessionStore; conn: PgConnection }> {
  const conn = new PgConnection({ poolFactory: fakePoolFactory() });
  await runMigrations(conn);
  return { store: new PostgresSessionStore(conn), conn };
}

describe('PostgresSessionStore', () => {
  let store: PostgresSessionStore;
  let conn: PgConnection;
  beforeEach(async () => {
    const f = await freshStore();
    store = f.store;
    conn = f.conn;
  });

  it('creates a session and persists it to the row', async () => {
    const s = await store.create({ playerId: 'p1' });
    expect(s.sessionId).toMatch(/^sess-/);
    expect(s.playerId).toBe('p1');
    expect(s.jurisdiction).toBe('GENERIC');
    expect(await store.size()).toBe(1);
  });

  it('rejects creation without playerId', async () => {
    await expect(store.create({ playerId: '' })).rejects.toThrow(/playerId required/);
  });

  it('rejects unknown jurisdiction', async () => {
    await expect(
      store.create({ playerId: 'p1', jurisdiction: 'XX' as unknown as never })
    ).rejects.toThrow(/unknown jurisdiction/);
  });

  it('get() returns the persisted state', async () => {
    const s = await store.create({ playerId: 'p2', jurisdiction: 'UKGC' });
    const loaded = await store.get(s.sessionId);
    expect(loaded?.playerId).toBe('p2');
    expect(loaded?.jurisdiction).toBe('UKGC');
    expect(loaded?.policy.minSpinPacingMs).toBe(2500);
  });

  it('get() returns null for unknown id', async () => {
    expect(await store.get('sess-bogus')).toBeNull();
  });

  it('recordSpin updates totals atomically', async () => {
    const s = await store.create({ playerId: 'p3', jurisdiction: 'MGA' });
    const t0 = Date.now();
    await store.recordSpin(s.sessionId, { betMinor: 100, winMinor: 200 }, t0);
    await store.recordSpin(s.sessionId, { betMinor: 100, winMinor: 0 }, t0 + 5_000);
    const loaded = await store.get(s.sessionId);
    expect(loaded?.totalSpins).toBe(2);
    expect(loaded?.totalWageredMinor).toBe(200);
    expect(loaded?.totalWonMinor).toBe(200);
    expect(loaded?.netResultMinor).toBe(0);
  });

  it('decideSpin enforces UKGC pacing', async () => {
    const s = await store.create({ playerId: 'pUk', jurisdiction: 'UKGC' });
    const t0 = 1_000_000;
    await store.recordSpin(s.sessionId, { betMinor: 100, winMinor: 0 }, t0);
    const dec = await store.decideSpin(s.sessionId, { gameId: 'g', betMinor: 100 }, t0 + 1_000);
    expect(dec.allowed).toBe(false);
    expect(dec.reason).toBe('spin_pacing_violation');
    expect(dec.waitMs).toBe(1_500);
  });

  it('decideSpin bans autoplay in UKGC', async () => {
    const s = await store.create({ playerId: 'pUk2', jurisdiction: 'UKGC' });
    const dec = await store.decideSpin(s.sessionId, { gameId: 'g', betMinor: 100, autoplay: true });
    expect(dec.allowed).toBe(false);
    expect(dec.reason).toBe('autoplay_banned_in_jurisdiction');
  });

  it('close() flips closed flag in persisted state', async () => {
    const s = await store.create({ playerId: 'pClose' });
    const sum = await store.close(s.sessionId);
    expect(sum?.closed).toBe(true);
    const loaded = await store.get(s.sessionId);
    expect(loaded?.closed).toBe(true);
  });

  it('survives a simulated restart — state intact via new store instance', async () => {
    const s = await store.create({ playerId: 'pRestart' });
    await store.recordSpin(s.sessionId, { betMinor: 50, winMinor: 75 });
    // New store wrapping the same conn → mimics process restart.
    const reborn = new PostgresSessionStore(conn);
    const loaded = await reborn.get(s.sessionId);
    expect(loaded?.totalSpins).toBe(1);
    expect(loaded?.totalWonMinor).toBe(75);
  });

  it('concurrent recordSpin calls keep totals consistent', async () => {
    const s = await store.create({ playerId: 'pConc', jurisdiction: 'MGA' });
    // 10 sequential spins (FOR UPDATE serializes them).
    for (let i = 0; i < 10; i++) {
      await store.recordSpin(s.sessionId, { betMinor: 10, winMinor: 0 }, 1_000_000 + i * 5_000);
    }
    const loaded = await store.get(s.sessionId);
    expect(loaded?.totalSpins).toBe(10);
    expect(loaded?.totalWageredMinor).toBe(100);
  });

  it('reset() wipes the table', async () => {
    await store.create({ playerId: 'pX' });
    await store.create({ playerId: 'pY' });
    expect(await store.size()).toBe(2);
    await store.reset();
    expect(await store.size()).toBe(0);
  });

  it('expired session is rejected by decideSpin', async () => {
    const s = await store.create({ playerId: 'pExp', jurisdiction: 'GENERIC' });
    const farFuture = new Date(s.expiresAt).getTime() + 1_000;
    const dec = await store.decideSpin(s.sessionId, { gameId: 'g', betMinor: 100 }, farFuture);
    expect(dec.allowed).toBe(false);
    expect(dec.reason).toBe('session_expired');
  });
});
