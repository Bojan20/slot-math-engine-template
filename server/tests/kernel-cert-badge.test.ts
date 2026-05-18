/**
 * W209 Faza 500.0 — kernel-cert-badge specs (Agent A).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  grantBadge,
  revokeBadge,
  getKernelBadges,
  evaluateProductionProven,
  renderBadgeSvg,
  renderBadgesRow,
  handleBadgesGet,
  _resetBadgeStore,
  PRODUCTION_GAME_THRESHOLD,
  PRODUCTION_DAYS_THRESHOLD,
} from '../lib/kernel-cert-badge.js';

const FIXED_NOW = () => new Date('2026-05-18T10:00:00.000Z');

describe('kernel-cert-badge · grant + query', () => {
  beforeEach(() => _resetBadgeStore());

  it('grantBadge creates an entry and getKernelBadges sees it', () => {
    grantBadge('k-1', 'verified', 'system-auto', undefined, FIXED_NOW);
    const q = getKernelBadges('k-1');
    expect(q.badges).toEqual(['verified']);
    expect(q.details[0].grantedAt).toBe('2026-05-18T10:00:00.000Z');
  });

  it('grantBadge is idempotent — repeat call keeps original timestamp', () => {
    const first = grantBadge('k-1', 'verified', 'system-auto', undefined, FIXED_NOW);
    const later = grantBadge(
      'k-1',
      'verified',
      'system-auto',
      undefined,
      () => new Date('2027-01-01T00:00:00.000Z')
    );
    expect(later.grantedAt).toBe(first.grantedAt);
  });

  it('rejects unknown badgeId', () => {
    // @ts-expect-error – intentional bad
    expect(() => grantBadge('k-1', 'gold', 'admin')).toThrow(/unknown badgeId/);
  });

  it('returns empty for unknown kernel', () => {
    const q = getKernelBadges('does-not-exist');
    expect(q.badges).toEqual([]);
    expect(q.details).toEqual([]);
  });

  it('supports all 3 badge levels concurrently', () => {
    grantBadge('k-2', 'verified', 'system-auto', undefined, FIXED_NOW);
    grantBadge('k-2', 'endorsed', 'admin@eng', undefined, FIXED_NOW);
    grantBadge('k-2', 'production-proven', 'system-auto', undefined, FIXED_NOW);
    const q = getKernelBadges('k-2');
    expect(q.badges.length).toBe(3);
  });
});

describe('kernel-cert-badge · revocation', () => {
  beforeEach(() => _resetBadgeStore());

  it('revokeBadge hides the badge from active queries', () => {
    grantBadge('k-1', 'verified', 'system-auto', undefined, FIXED_NOW);
    expect(revokeBadge('k-1', 'verified', FIXED_NOW)).toBe(true);
    const q = getKernelBadges('k-1');
    expect(q.badges).toEqual([]);
  });

  it('revokeBadge on unknown badge returns false', () => {
    expect(revokeBadge('k-1', 'verified', FIXED_NOW)).toBe(false);
  });
});

describe('kernel-cert-badge · production-proven auto-evaluation', () => {
  beforeEach(() => _resetBadgeStore());

  it('grants when liveGameCount >= 3 AND maxLiveDays >= 90', () => {
    const r = evaluateProductionProven(
      'k-1',
      { liveGameCount: 3, maxLiveDays: 90 },
      FIXED_NOW
    );
    expect(r).not.toBeNull();
    expect(r?.id).toBe('production-proven');
    expect(getKernelBadges('k-1').badges).toContain('production-proven');
  });

  it('does NOT grant when below game threshold', () => {
    const r = evaluateProductionProven(
      'k-2',
      { liveGameCount: PRODUCTION_GAME_THRESHOLD - 1, maxLiveDays: 365 },
      FIXED_NOW
    );
    expect(r).toBeNull();
  });

  it('does NOT grant when below days threshold', () => {
    const r = evaluateProductionProven(
      'k-3',
      { liveGameCount: 10, maxLiveDays: PRODUCTION_DAYS_THRESHOLD - 1 },
      FIXED_NOW
    );
    expect(r).toBeNull();
  });

  it('is idempotent — second eval with eligible usage returns null', () => {
    evaluateProductionProven('k-4', { liveGameCount: 5, maxLiveDays: 120 }, FIXED_NOW);
    const second = evaluateProductionProven('k-4', { liveGameCount: 5, maxLiveDays: 120 }, FIXED_NOW);
    expect(second).toBeNull();
  });
});

describe('kernel-cert-badge · SVG renderer', () => {
  it('renderBadgeSvg includes the cyan accent for verified', () => {
    const svg = renderBadgeSvg('verified');
    expect(svg).toMatch(/<svg/);
    expect(svg).toMatch(/00e1ff/i); // cyan
    expect(svg).toMatch(/VERIFIED/);
  });

  it('renderBadgesRow concatenates multiple SVGs', () => {
    const row = renderBadgesRow(['verified', 'endorsed']);
    expect(row.split('<svg').length - 1).toBe(2);
  });

  it('renderBadgesRow on empty array returns empty string', () => {
    expect(renderBadgesRow([])).toBe('');
  });
});

describe('kernel-cert-badge · handleBadgesGet (endpoint stub)', () => {
  beforeEach(() => _resetBadgeStore());

  it('returns full payload shape for the GET endpoint', () => {
    grantBadge('k-9', 'verified', 'system-auto', undefined, FIXED_NOW);
    const res = handleBadgesGet('k-9');
    expect(res.kernelId).toBe('k-9');
    expect(res.badges).toEqual(['verified']);
    expect(res.svgRow).toMatch(/<svg/);
  });

  it('returns empty arrays + empty svgRow for unknown kernel', () => {
    const res = handleBadgesGet('nope');
    expect(res.badges).toEqual([]);
    expect(res.svgRow).toBe('');
  });
});
