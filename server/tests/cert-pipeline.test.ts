/**
 * CORTI W210 Faza 600.0 — cert pipeline lifecycle tests.
 */

import { describe, it, expect } from 'vitest';
import {
  CertPipelineStore,
  PIPELINE_STAGES,
  ESTIMATED_DAYS_IN_STAGE,
} from '../state/cert-pipeline.js';

function makeStore(): CertPipelineStore {
  let t = Date.UTC(2026, 4, 18, 12, 0, 0);
  const tick = (): Date => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
  return new CertPipelineStore({ now: tick });
}

describe('CertPipelineStore', () => {
  it('exposes 7 stages in canonical order', () => {
    expect(PIPELINE_STAGES).toEqual([
      'draft',
      'packed',
      'submitted',
      'lab_questions',
      'revisions_needed',
      'approved',
      'production_ready',
    ]);
  });

  it('create returns a draft submission with audit row', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'GLI',
      vendor: 'slot-math',
      game: 'demo',
      version: '1.0',
      jurisdiction: 'UKGC',
    });
    expect(sub.stage).toBe('draft');
    expect(sub.audit).toHaveLength(1);
    expect(sub.audit[0].from).toBe(null);
    expect(sub.audit[0].to).toBe('draft');
  });

  it('records bundleSha256 on creation', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'BMM',
      vendor: 'v',
      game: 'g',
      version: '1.0',
      jurisdiction: 'MGA',
      bundleSha256: 'd'.repeat(64),
    });
    expect(sub.bundleSha256).toBe('d'.repeat(64));
    expect(sub.audit[0].bundleSha256).toBe('d'.repeat(64));
  });

  it('legal forward transition: draft → packed', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'eCOGRA', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'UKGC',
    });
    const next = s.transition({ id: sub.id, to: 'packed' });
    expect(next.stage).toBe('packed');
    expect(next.audit).toHaveLength(2);
    expect(next.audit[1].from).toBe('draft');
    expect(next.audit[1].to).toBe('packed');
  });

  it('full happy path: draft → packed → submitted → approved → production_ready', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'GLI', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'UKGC',
    });
    s.transition({ id: sub.id, to: 'packed' });
    s.transition({ id: sub.id, to: 'submitted' });
    s.transition({ id: sub.id, to: 'approved' });
    const final = s.transition({ id: sub.id, to: 'production_ready' });
    expect(final.stage).toBe('production_ready');
    expect(final.audit).toHaveLength(5);
  });

  it('rejects illegal transition: draft → approved', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'GLI', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'UKGC',
    });
    expect(() => s.transition({ id: sub.id, to: 'approved' })).toThrow(/illegal_transition/);
  });

  it('handles lab_questions → revisions_needed → submitted loop', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'BMM', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'MGA',
    });
    s.transition({ id: sub.id, to: 'packed' });
    s.transition({ id: sub.id, to: 'submitted' });
    s.transition({ id: sub.id, to: 'lab_questions', note: 'qa wants reels' });
    s.transition({ id: sub.id, to: 'revisions_needed' });
    const back = s.transition({ id: sub.id, to: 'submitted', note: 'rev2 sent' });
    expect(back.stage).toBe('submitted');
    expect(back.audit[back.audit.length - 1].note).toBe('rev2 sent');
  });

  it('throws on transition of unknown id', () => {
    const s = makeStore();
    expect(() => s.transition({ id: 'nope', to: 'packed' })).toThrow(/not_found/);
  });

  it('list() returns all created submissions', () => {
    const s = makeStore();
    s.create({ lab: 'GLI', vendor: 'v', game: 'a', version: '1.0', jurisdiction: 'UKGC' });
    s.create({ lab: 'BMM', vendor: 'v', game: 'b', version: '1.0', jurisdiction: 'MGA' });
    expect(s.list()).toHaveLength(2);
  });

  it('estimatedNextTransitionAt is set per stage from seeded map', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'GLI', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'UKGC',
    });
    const draftEstimate = new Date(sub.estimatedNextTransitionAt).getTime();
    const createdAt = new Date(sub.createdAt).getTime();
    const days = (draftEstimate - createdAt) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(ESTIMATED_DAYS_IN_STAGE.GLI.draft);
  });

  it('auditHash is deterministic for same chain', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'GLI', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'UKGC',
    });
    s.transition({ id: sub.id, to: 'packed' });
    const h1 = s.auditHash(sub.id);
    const h2 = s.auditHash(sub.id);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('auditHash changes after new transition', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'GLI', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'UKGC',
    });
    s.transition({ id: sub.id, to: 'packed' });
    const h1 = s.auditHash(sub.id);
    s.transition({ id: sub.id, to: 'submitted' });
    const h2 = s.auditHash(sub.id);
    expect(h2).not.toBe(h1);
  });

  it('daysRemaining returns positive value just after creation', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'GLI', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'UKGC',
    });
    expect(s.daysRemaining(sub.id)).toBeGreaterThanOrEqual(0);
  });

  it('seeded estimates vary per lab (GLI > eCOGRA on submitted)', () => {
    expect(ESTIMATED_DAYS_IN_STAGE.GLI.submitted).toBeGreaterThan(
      ESTIMATED_DAYS_IN_STAGE.eCOGRA.submitted
    );
  });

  it('bundleSha256 updates on transition if supplied', () => {
    const s = makeStore();
    const sub = s.create({
      lab: 'NMi', vendor: 'v', game: 'g', version: '1.0', jurisdiction: 'KSA',
    });
    const transitioned = s.transition({
      id: sub.id,
      to: 'packed',
      bundleSha256: 'a'.repeat(64),
    });
    expect(transitioned.bundleSha256).toBe('a'.repeat(64));
  });

  it('get returns undefined for unknown id', () => {
    const s = makeStore();
    expect(s.get('nope')).toBeUndefined();
  });
});
