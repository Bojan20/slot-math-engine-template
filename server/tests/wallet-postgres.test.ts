/**
 * CORTI W206-PERSISTENCE — Postgres-backed WalletStore.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PgConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { PostgresWalletStore } from '../state/wallet-pg.js';
import { fakePoolFactory } from './fake-pg.js';

async function freshStore(): Promise<{ store: PostgresWalletStore; conn: PgConnection }> {
  const conn = new PgConnection({ poolFactory: fakePoolFactory() });
  await runMigrations(conn);
  return { store: new PostgresWalletStore(conn), conn };
}

describe('PostgresWalletStore', () => {
  let store: PostgresWalletStore;
  let conn: PgConnection;
  beforeEach(async () => {
    const f = await freshStore();
    store = f.store;
    conn = f.conn;
  });

  it('getOrCreate seeds a new wallet with starting balance', async () => {
    const w = await store.getOrCreate('p1');
    expect(w.balanceMinor).toBe(100_000);
    expect(w.currency).toBe('EUR');
  });

  it('getOrCreate is idempotent', async () => {
    await store.getOrCreate('p2');
    const w = await store.getOrCreate('p2');
    expect(w.balanceMinor).toBe(100_000); // unchanged
  });

  it('balance() returns null for unknown player', async () => {
    expect(await store.balance('ghost')).toBeNull();
  });

  it('deposit increases balance under threshold', async () => {
    const res = await store.deposit('p3', { amountMinor: 5_000 });
    expect(res.status).toBe('approved');
    expect(res.newBalanceMinor).toBe(105_000);
  });

  it('deposit ≥ threshold is held as pending', async () => {
    const res = await store.deposit('p4', { amountMinor: 5_000_000 });
    expect(res.status).toBe('pending');
    expect(res.newBalanceMinor).toBe(100_000);
  });

  it('deposit rejects negative amount', async () => {
    await expect(store.deposit('p5', { amountMinor: -1 })).rejects.toThrow();
  });

  it('withdraw decreases balance and records txn', async () => {
    await store.getOrCreate('p6');
    const res = await store.withdraw('p6', { amountMinor: 1_000 });
    expect(res.status).toBe('approved');
    expect(res.newBalanceMinor).toBe(99_000);
  });

  it('withdraw is declined on insufficient funds', async () => {
    await store.getOrCreate('p7');
    const res = await store.withdraw('p7', { amountMinor: 999_999_999 });
    expect(res.status).toBe('declined');
    expect(res.reason).toBe('insufficient_funds');
  });

  it('wager debits and returns txn record', async () => {
    await store.getOrCreate('p8');
    const tx = await store.wager('p8', 500);
    expect(tx).not.toBeNull();
    expect(tx?.kind).toBe('wager');
    const w = await store.balance('p8');
    expect(w?.balanceMinor).toBe(99_500);
  });

  it('wager returns null when amount exceeds balance', async () => {
    await store.getOrCreate('p9');
    const tx = await store.wager('p9', 999_999_999);
    expect(tx).toBeNull();
    const w = await store.balance('p9');
    expect(w?.balanceMinor).toBe(100_000); // unchanged
  });

  it('credit increases balance', async () => {
    await store.getOrCreate('p10');
    await store.credit('p10', 250);
    const w = await store.balance('p10');
    expect(w?.balanceMinor).toBe(100_250);
  });

  it('transactions() returns full history in order', async () => {
    await store.getOrCreate('p11');
    await store.deposit('p11', { amountMinor: 100 });
    await store.wager('p11', 50);
    await store.credit('p11', 200);
    const txns = await store.transactions('p11');
    expect(txns.length).toBe(3);
    expect(txns.map((t) => t.kind)).toEqual(['deposit', 'wager', 'win']);
  });

  it('survives restart — balance + history readable via new store instance', async () => {
    await store.getOrCreate('pRestart');
    await store.wager('pRestart', 1_000);
    const reborn = new PostgresWalletStore(conn);
    const w = await reborn.balance('pRestart');
    expect(w?.balanceMinor).toBe(99_000);
    expect((await reborn.transactions('pRestart')).length).toBe(1);
  });
});
