// W209 Agent B — Licensing module specs.

import { describe, it, expect } from 'vitest';
import {
  parseLicenseTerms,
  projectedCost12Mo,
  issueLicense,
  verifyLicense,
  makeUuid,
} from '../src/licensing.js';

describe('licensing · parseLicenseTerms', () => {
  it('parses plain perpetual', () => {
    const s = parseLicenseTerms('perpetual', 25000);
    expect(s.type).toBe('perpetual');
    expect(s.upfront_usd).toBe(25000);
  });

  it('parses perpetual + revenue share as hybrid with default cap', () => {
    const s = parseLicenseTerms('perpetual + revenue_share_3pct', 25000);
    expect(s.type).toBe('hybrid');
    if (s.type !== 'hybrid') throw new Error('unreachable');
    expect(s.upfront_usd).toBe(25000);
    expect(s.revenue_share_pct).toBe(3);
    expect(s.revenue_cap_usd).toBe(250000);
  });

  it('parses explicit cap clause', () => {
    const s = parseLicenseTerms('perpetual + revenue_share_4pct + cap_50000', 30000);
    if (s.type !== 'hybrid') throw new Error('unreachable');
    expect(s.revenue_cap_usd).toBe(50000);
  });

  it('parses pure revenue share', () => {
    const s = parseLicenseTerms('revenue_share_5pct', 20000);
    if (s.type !== 'revenue-share') throw new Error('unreachable');
    expect(s.revenue_share_pct).toBe(5);
    expect(s.upfront_usd).toBe(6000); // 30% of priceUsd
  });
});

describe('licensing · projectedCost12Mo', () => {
  it('perpetual cost equals upfront regardless of monthly revenue', () => {
    expect(projectedCost12Mo({ type: 'perpetual', upfront_usd: 25000 }, 100000)).toBe(25000);
  });

  it('revenue-share adds 12 × monthly × pct', () => {
    const c = projectedCost12Mo(
      { type: 'revenue-share', upfront_usd: 6000, revenue_share_pct: 5 },
      10000,
    );
    // 6000 + 10000*12*0.05 = 6000 + 6000 = 12000
    expect(c).toBe(12000);
  });

  it('hybrid is capped', () => {
    const c = projectedCost12Mo(
      { type: 'hybrid', upfront_usd: 25000, revenue_share_pct: 3, revenue_cap_usd: 5000 },
      200000,
    );
    // royalty = 200000*12*0.03 = 72000 but cap=5000
    expect(c).toBe(30000);
  });
});

describe('licensing · issue + verify', () => {
  const seed = (n = 0x1234): (() => number) => {
    let x = n;
    return () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x80000000;
    };
  };

  it('issued token verifies successfully', () => {
    const spec = parseLicenseTerms('perpetual', 25000);
    const issue = issueLicense('tpl-quick-hit-dragons', 'buyer-001', spec, {
      rng: seed(),
      now: () => new Date('2026-05-18T10:00:00Z'),
    });
    const r = verifyLicense(issue.token);
    expect(r.ok).toBe(true);
    expect(r.issue?.templateId).toBe('tpl-quick-hit-dragons');
  });

  it('tampered token fails verification', () => {
    const spec = parseLicenseTerms('perpetual', 25000);
    const issue = issueLicense('tpl-x', 'buyer-1', spec, {
      rng: seed(),
      now: () => new Date('2026-05-18T10:00:00Z'),
    });
    const broken = issue.token.slice(0, -2) + 'zz';
    const r = verifyLicense(broken);
    expect(r.ok).toBe(false);
  });

  it('makeUuid emits stable shape', () => {
    const id = makeUuid(seed());
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('expired revenue-share token rejected', () => {
    const spec = parseLicenseTerms('revenue_share_5pct', 20000);
    const issue = issueLicense('tpl-x', 'buyer-1', spec, {
      rng: seed(),
      now: () => new Date('2025-01-01T00:00:00Z'),
    });
    const r = verifyLicense(issue.token, { now: () => new Date('2026-06-01T00:00:00Z') });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('expired');
  });
});
