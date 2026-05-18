/**
 * CORTI W206-ONBOARDING — support portal unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  searchArticles,
  filterByCategory,
  defaultTicketDraft,
  validateTicket,
  makeTicketId,
  probeComponents,
  aggregateStatus,
} from '../src/data.js';
import type { ApiComponent, KbData } from '../src/types.js';
import kbJson from '../data/kb.json' assert { type: 'json' };

const KB = kbJson as KbData;

describe('knowledge base data integrity', () => {
  it('ships at least 20 articles', () => {
    expect(KB.articles.length).toBeGreaterThanOrEqual(20);
  });

  it('every article carries id, category, question, body, tags, lastUpdated', () => {
    for (const a of KB.articles) {
      expect(a.id).toMatch(/^kb-\d{3}$/);
      expect(typeof a.question).toBe('string');
      expect(a.question.length).toBeGreaterThan(0);
      expect(Array.isArray(a.tags)).toBe(true);
      expect(a.body.length).toBeGreaterThanOrEqual(40);
      expect(KB.categories).toContain(a.category);
    }
  });

  it('covers all 6 categories', () => {
    const cats = new Set(KB.articles.map((a) => a.category));
    expect(cats.size).toBeGreaterThanOrEqual(5);
  });
});

describe('searchArticles', () => {
  it('returns everything for empty query', () => {
    expect(searchArticles(KB.articles, '').length).toBe(KB.articles.length);
  });

  it('matches case-insensitively across question + body + tags', () => {
    const r = searchArticles(KB.articles, 'TRIAL');
    expect(r.length).toBeGreaterThan(0);
  });

  it('returns empty array for a nonsense query', () => {
    const r = searchArticles(KB.articles, 'zzz-no-such-keyword');
    expect(r.length).toBe(0);
  });
});

describe('filterByCategory', () => {
  it('keeps everything for "All"', () => {
    expect(filterByCategory(KB.articles, 'All').length).toBe(KB.articles.length);
  });

  it('filters to a single category', () => {
    const r = filterByCategory(KB.articles, 'Math engine');
    expect(r.length).toBeGreaterThan(0);
    for (const a of r) expect(a.category).toBe('Math engine');
  });
});

describe('ticket flow', () => {
  it('defaultTicketDraft has expected shape', () => {
    const d = defaultTicketDraft();
    expect(d.severity).toBe('normal');
    expect(d.category).toBeTruthy();
  });

  it('rejects empty subject + short body', () => {
    const d = defaultTicketDraft();
    d.email = 'a@b.co';
    d.subject = 'hi';
    d.body = 'short';
    const v = validateTicket(d);
    expect(v.ok).toBe(false);
    expect(v.errors.subject).toBeDefined();
    expect(v.errors.body).toBeDefined();
  });

  it('accepts well-formed ticket', () => {
    const d = defaultTicketDraft();
    d.email = 'boki@example.com';
    d.subject = 'MC sim hanging on cluster grid';
    d.body = 'Running a 100M MC on Quick Hit Platinum hangs after 2M spins. M2 Mac, 16GB.';
    const v = validateTicket(d);
    expect(v.ok).toBe(true);
  });

  it('makeTicketId returns tk-YYYYMMDD-NNNN pattern', () => {
    const id = makeTicketId(new Date('2026-05-18T10:00:00Z'));
    expect(id).toMatch(/^tk-20260518-\d{4}$/);
  });

  it('rejects invalid email', () => {
    const d = defaultTicketDraft();
    d.email = 'not-an-email';
    d.subject = 'Valid subject here';
    d.body = 'Long enough body to pass minimum char threshold';
    const v = validateTicket(d);
    expect(v.errors.email).toBeDefined();
  });
});

describe('status aggregation', () => {
  const mk = (status: 'operational' | 'degraded' | 'outage'): ApiComponent => ({
    id: 't',
    name: 'T',
    status,
    url: '/x',
  });

  it('all operational → operational', () => {
    expect(aggregateStatus([mk('operational'), mk('operational')])).toBe('operational');
  });
  it('any degraded → degraded', () => {
    expect(aggregateStatus([mk('operational'), mk('degraded')])).toBe('degraded');
  });
  it('any outage → outage', () => {
    expect(aggregateStatus([mk('operational'), mk('outage'), mk('degraded')])).toBe('outage');
  });

  it('probeComponents flips to operational on 200', async () => {
    const fake: typeof fetch = async (_url: RequestInfo | URL) => {
      return new Response('{}', { status: 200 });
    };
    const out = await probeComponents([{ id: 't', name: 'T', status: 'outage', url: '/x' }], 'http://x', fake);
    expect(out[0].status).toBe('operational');
  });

  it('probeComponents flips to outage on fetch throw', async () => {
    const fake: typeof fetch = async () => {
      throw new Error('network down');
    };
    const out = await probeComponents([{ id: 't', name: 'T', status: 'operational', url: '/x' }], 'http://x', fake);
    expect(out[0].status).toBe('outage');
  });
});

describe('KB metadata', () => {
  it('ships 3+ historical incidents', () => {
    expect(KB.incidents.length).toBeGreaterThanOrEqual(3);
  });
  it('ships at least 5 status components', () => {
    expect(KB.components.length).toBeGreaterThanOrEqual(5);
  });
});
