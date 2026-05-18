/**
 * W211 Faza 700.0 — Real L&W Pilot Onboard — pilot run store + routes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { build } from '../index.js';
import { PgConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { PilotRunStore } from '../state/pilot-runs.js';
import { PostgresPilotRunStore } from '../state/pilot-runs-pg.js';
import { fakePoolFactory } from './fake-pg.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

function sampleVerdicts(allPass = true) {
  return [
    { step: 'auth', ok: true, elapsedMs: 5, metrics: { tenantId: TENANT_A } },
    { step: 'wallet', ok: true, elapsedMs: 12 },
    { step: 'spin', ok: allPass, elapsedMs: 33, metrics: { spins: 100 } },
  ];
}

describe('PilotRunStore (in-memory)', () => {
  let store: PilotRunStore;
  beforeEach(() => {
    store = new PilotRunStore();
  });

  it('record() returns a record with id, hash, and pass/fail counts', () => {
    const r = store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    expect(r.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.tenantId).toBe(TENANT_A);
    expect(r.passCount).toBe(3);
    expect(r.failCount).toBe(0);
    expect(r.overallOk).toBe(true);
    expect(r.resultHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('record() flags overallOk=false when any verdict fails', () => {
    const r = store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts(false) });
    expect(r.passCount).toBe(2);
    expect(r.failCount).toBe(1);
    expect(r.overallOk).toBe(false);
  });

  it('record() throws on missing tenantId', () => {
    expect(() =>
      store.record({ tenantId: '', verdicts: sampleVerdicts() })
    ).toThrow(/tenantId required/);
  });

  it('record() throws on non-array verdicts', () => {
    expect(() =>
      store.record({ tenantId: TENANT_A, verdicts: 'oops' as unknown as never })
    ).toThrow();
  });

  it('get() returns the stored record', () => {
    const a = store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    const b = store.get(a.runId);
    expect(b?.runId).toBe(a.runId);
  });

  it('get() returns null when unknown', () => {
    expect(store.get('nope')).toBeNull();
  });

  it('list() filters by tenant and overallOk', () => {
    store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts(false) });
    store.record({ tenantId: TENANT_B, verdicts: sampleVerdicts() });
    expect(store.list().length).toBe(3);
    expect(store.list({ tenantId: TENANT_A }).length).toBe(2);
    expect(store.list({ tenantId: TENANT_A, overallOk: false }).length).toBe(1);
    expect(store.count({ overallOk: true })).toBe(2);
  });

  it('delete() removes a record', () => {
    const r = store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    expect(store.delete(r.runId)).toBe(true);
    expect(store.get(r.runId)).toBeNull();
    expect(store.delete(r.runId)).toBe(false);
  });

  it('reset() clears all rows', () => {
    store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    store.reset();
    expect(store.list().length).toBe(0);
  });

  it('resultHash is deterministic for identical input', () => {
    const a = store.record({
      runId: 'run-1',
      tenantId: TENANT_A,
      startedAt: '2026-05-18T00:00:00.000Z',
      completedAt: '2026-05-18T00:00:01.000Z',
      totalElapsedMs: 1000,
      verdicts: sampleVerdicts(),
    });
    store.reset();
    const b = store.record({
      runId: 'run-1',
      tenantId: TENANT_A,
      startedAt: '2026-05-18T00:00:00.000Z',
      completedAt: '2026-05-18T00:00:01.000Z',
      totalElapsedMs: 1000,
      verdicts: sampleVerdicts(),
    });
    expect(a.resultHash).toBe(b.resultHash);
  });
});

describe('PostgresPilotRunStore', () => {
  let store: PostgresPilotRunStore;
  beforeEach(async () => {
    const conn = new PgConnection({ poolFactory: fakePoolFactory() });
    await runMigrations(conn);
    store = new PostgresPilotRunStore(conn);
  });

  it('round-trips a record via record/get', async () => {
    const r = await store.record({
      tenantId: TENANT_A,
      verdicts: sampleVerdicts(),
    });
    const got = await store.get(r.runId);
    expect(got?.runId).toBe(r.runId);
    expect(got?.passCount).toBe(3);
    expect(got?.failCount).toBe(0);
  });

  it('list filters by tenant + overall_ok', async () => {
    await store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    await store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts(false) });
    await store.record({ tenantId: TENANT_B, verdicts: sampleVerdicts() });
    const all = await store.list();
    expect(all.length).toBe(3);
    const aOnly = await store.list({ tenantId: TENANT_A });
    expect(aOnly.length).toBe(2);
    const aFail = await store.list({ tenantId: TENANT_A, overallOk: false });
    expect(aFail.length).toBe(1);
  });

  it('delete removes the row', async () => {
    const r = await store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    expect(await store.delete(r.runId)).toBe(true);
    expect(await store.get(r.runId)).toBeNull();
  });

  it('reset wipes the table', async () => {
    await store.record({ tenantId: TENANT_A, verdicts: sampleVerdicts() });
    await store.reset();
    expect((await store.list()).length).toBe(0);
  });
});

describe('GET/POST /api/pilot/runs routes', () => {
  it('POST creates a run, GET lists it, GET :id returns detail', async () => {
    const app = await build();
    const post = await app.inject({
      method: 'POST',
      url: '/api/pilot/runs',
      payload: {
        tenantId: TENANT_A,
        verdicts: sampleVerdicts(),
      },
    });
    expect(post.statusCode).toBe(201);
    const created = post.json();
    expect(created.run.runId).toMatch(/^[0-9a-f-]{36}$/);

    const list = await app.inject({ method: 'GET', url: '/api/pilot/runs' });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBeGreaterThanOrEqual(1);

    const single = await app.inject({
      method: 'GET',
      url: `/api/pilot/runs/${created.run.runId}`,
    });
    expect(single.statusCode).toBe(200);
    expect(single.json().run.tenantId).toBe(TENANT_A);
    await app.close();
  });

  it('POST rejects missing tenantId / bad verdicts', async () => {
    const app = await build();
    const noTenant = await app.inject({
      method: 'POST',
      url: '/api/pilot/runs',
      payload: { verdicts: sampleVerdicts() },
    });
    expect(noTenant.statusCode).toBe(400);
    expect(noTenant.json().error).toBe('tenantId_required');

    const badVerdicts = await app.inject({
      method: 'POST',
      url: '/api/pilot/runs',
      payload: { tenantId: TENANT_A, verdicts: 'oops' },
    });
    expect(badVerdicts.statusCode).toBe(400);
    expect(badVerdicts.json().error).toBe('verdicts_must_be_array');
    await app.close();
  });

  it('GET /api/pilot/runs/:id returns 404 for unknown id', async () => {
    const app = await build();
    const r = await app.inject({
      method: 'GET',
      url: '/api/pilot/runs/does-not-exist',
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toBe('pilot_run_not_found');
    await app.close();
  });

  it('GET /api/pilot/runs supports ?tenant=&ok= filters', async () => {
    const app = await build();
    await app.inject({
      method: 'POST',
      url: '/api/pilot/runs',
      payload: { tenantId: TENANT_A, verdicts: sampleVerdicts() },
    });
    await app.inject({
      method: 'POST',
      url: '/api/pilot/runs',
      payload: { tenantId: TENANT_A, verdicts: sampleVerdicts(false) },
    });
    await app.inject({
      method: 'POST',
      url: '/api/pilot/runs',
      payload: { tenantId: TENANT_B, verdicts: sampleVerdicts() },
    });
    const okOnly = await app.inject({
      method: 'GET',
      url: `/api/pilot/runs?tenant=${TENANT_A}&ok=true`,
    });
    expect(okOnly.statusCode).toBe(200);
    expect(okOnly.json().total).toBe(1);
    await app.close();
  });
});
