/**
 * W215 Faza 800.2 Agent C — analytics.js tests.
 *
 * Drives the client-side AnalyticsClient through its ESM exports.
 * Verifies:
 *   * event schema + validation
 *   * batching (size + interval)
 *   * DNT respect (navigator + window + sessionStorage)
 *   * deterministic session ID hashing
 *   * fetch payload shape
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// @ts-expect-error vanilla ESM JS imported into TS test
import {
  AnalyticsClient,
  hashDigest,
  computeSessionId,
  isDntEnabled,
  validateEvent,
} from '../../web/marketing/analytics/analytics.js';

describe('hashDigest', () => {
  it('produces a 32-hex-char digest', () => {
    const h = hashDigest('hello');
    expect(typeof h).toBe('string');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
  it('is deterministic for the same input', () => {
    expect(hashDigest('abc')).toBe(hashDigest('abc'));
  });
  it('differs for distinct inputs', () => {
    expect(hashDigest('abc')).not.toBe(hashDigest('abd'));
  });
});

describe('computeSessionId', () => {
  it('uses loadTs + ua + screen', () => {
    const a = computeSessionId({ loadTs: 1000, ua: 'A', screen: '1x1' });
    const b = computeSessionId({ loadTs: 1000, ua: 'A', screen: '1x1' });
    expect(a).toBe(b);
  });
  it('changes when loadTs changes', () => {
    const a = computeSessionId({ loadTs: 1, ua: 'A', screen: '1x1' });
    const b = computeSessionId({ loadTs: 2, ua: 'A', screen: '1x1' });
    expect(a).not.toBe(b);
  });
  it('changes when ua changes', () => {
    const a = computeSessionId({ loadTs: 1, ua: 'A', screen: '1x1' });
    const b = computeSessionId({ loadTs: 1, ua: 'B', screen: '1x1' });
    expect(a).not.toBe(b);
  });
});

describe('isDntEnabled', () => {
  it('respects navigator.doNotTrack === "1"', () => {
    expect(isDntEnabled({ navigator: { doNotTrack: '1' } })).toBe(true);
  });
  it('respects "yes" variant', () => {
    expect(isDntEnabled({ navigator: { doNotTrack: 'yes' } })).toBe(true);
  });
  it('respects window.doNotTrack', () => {
    expect(isDntEnabled({ window: { doNotTrack: '1' } })).toBe(true);
  });
  it('respects sessionStorage opt-out flag', () => {
    const ss = { getItem: (k: string) => (k === 'smeAnalyticsOptOut' ? 'true' : null) };
    expect(isDntEnabled({ sessionStorage: ss })).toBe(true);
  });
  it('returns false when no signal', () => {
    expect(isDntEnabled({ navigator: { doNotTrack: '0' } })).toBe(false);
  });
});

describe('validateEvent', () => {
  it('accepts a minimum valid event', () => {
    expect(validateEvent({ type: 'pageview' })).toBe(true);
  });
  it('rejects missing type', () => {
    expect(validateEvent({})).toBe(false);
  });
  it('rejects oversized type', () => {
    expect(validateEvent({ type: 'a'.repeat(100) })).toBe(false);
  });
  it('rejects non-object props', () => {
    expect(validateEvent({ type: 'x', props: 'nope' })).toBe(false);
  });
});

describe('AnalyticsClient', () => {
  let fetched: Array<{ url: string; body: string }>;
  let fetchFn: (url: string, init?: { body?: string }) => Promise<{ ok: boolean }>;

  beforeEach(() => {
    fetched = [];
    fetchFn = vi.fn(async (url: string, init?: { body?: string }) => {
      fetched.push({ url, body: init?.body ?? '' });
      return { ok: true };
    });
  });

  it('drops events when disabled', () => {
    const c = new AnalyticsClient({ fetchFn, env: { navigator: { doNotTrack: '1' } } });
    expect(c.isEnabled()).toBe(false);
    expect(c.track('pageview')).toBe(false);
  });

  it('enqueues but does not flush before batchMax', () => {
    const c = new AnalyticsClient({ fetchFn, batchMax: 5 });
    c.track('pageview');
    c.track('scroll-depth-25');
    expect(fetched.length).toBe(0);
    expect(c.queue.length).toBe(2);
  });

  it('flushes on reaching batchMax', async () => {
    const c = new AnalyticsClient({ fetchFn, batchMax: 3 });
    c.track('pageview');
    c.track('scroll-depth-25');
    c.track('scroll-depth-50');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched.length).toBe(1);
    const payload = JSON.parse(fetched[0].body);
    expect(payload.events.length).toBe(3);
    expect(payload.sessionId).toBeTypeOf('string');
  });

  it('explicit flush returns the batch sent', async () => {
    const c = new AnalyticsClient({ fetchFn });
    c.track('cta-click', { destination: '/x' });
    const sent = await c.flush();
    expect(sent.length).toBe(1);
    expect(sent[0].type).toBe('cta-click');
  });

  it('rejects oversized type via validateEvent', () => {
    const c = new AnalyticsClient({ fetchFn });
    expect(c.track('x'.repeat(80))).toBe(false);
  });

  it('uses provided sessionId verbatim', () => {
    const c = new AnalyticsClient({ fetchFn, sessionId: 'fixed-session' });
    expect(c.sessionId).toBe('fixed-session');
  });

  it('flushes the right endpoint', async () => {
    const c = new AnalyticsClient({ fetchFn, endpoint: '/api/x', batchMax: 1 });
    c.track('pageview');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched[0].url).toBe('/api/x');
  });

  it('queues a default event timestamp', () => {
    const c = new AnalyticsClient({ fetchFn, now: () => 1234 });
    c.track('pageview');
    expect(c.queue[0].ts).toBe(1234);
  });

  it('keeps props payload intact', () => {
    const c = new AnalyticsClient({ fetchFn });
    c.track('cta-click', { destination: '/contact', label: 'Talk to sales' });
    expect(c.queue[0].props.destination).toBe('/contact');
    expect(c.queue[0].props.label).toBe('Talk to sales');
  });

  it('does not double-flush an empty queue', async () => {
    const c = new AnalyticsClient({ fetchFn });
    const sent = await c.flush();
    expect(sent).toEqual([]);
    expect(fetched.length).toBe(0);
  });

  it('re-enqueues on transient fetch failure', async () => {
    const failing = vi.fn(async () => { throw new Error('net'); });
    const c = new AnalyticsClient({ fetchFn: failing, batchMax: 1 });
    c.track('pageview');
    await new Promise((r) => setTimeout(r, 0));
    expect(c.queue.length).toBeGreaterThan(0);
  });

  it('flushIntervalMs is configurable', () => {
    const c = new AnalyticsClient({ fetchFn, flushIntervalMs: 99 });
    expect(c.flushIntervalMs).toBe(99);
  });

  it('isEnabled toggles', () => {
    const c = new AnalyticsClient({ fetchFn });
    c.setEnabled(false);
    expect(c.isEnabled()).toBe(false);
    c.setEnabled(true);
    expect(c.isEnabled()).toBe(true);
  });

  it('serializes events with type+ts+props keys', () => {
    const c = new AnalyticsClient({ fetchFn });
    c.track('pageview', { p: 'x' });
    const e = c.queue[0];
    expect(Object.keys(e).sort()).toEqual(['props', 'ts', 'type']);
  });

  it('honours DNT through env.sessionStorage', () => {
    const ss = { getItem: () => 'true' };
    const c = new AnalyticsClient({ fetchFn, env: { sessionStorage: ss } });
    expect(c.isEnabled()).toBe(false);
  });

  it('keeps sessionId stable across track calls', () => {
    const c = new AnalyticsClient({ fetchFn });
    const sid = c.sessionId;
    c.track('pageview');
    c.track('cta-click');
    expect(c.sessionId).toBe(sid);
  });

  it('flush clears its scheduled timer', async () => {
    const c = new AnalyticsClient({ fetchFn });
    c.track('pageview');
    expect(c.timer).not.toBe(null);
    await c.flush();
    expect(c.timer).toBe(null);
  });

  it('batch posts include sessionId at top level', async () => {
    const c = new AnalyticsClient({ fetchFn, sessionId: 'sid-xyz', batchMax: 1 });
    c.track('pageview');
    await new Promise((r) => setTimeout(r, 0));
    const body = JSON.parse(fetched[0].body);
    expect(body.sessionId).toBe('sid-xyz');
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('default endpoint is /api/marketing/event', () => {
    const c = new AnalyticsClient({ fetchFn });
    expect(c.endpoint).toBe('/api/marketing/event');
  });
});
