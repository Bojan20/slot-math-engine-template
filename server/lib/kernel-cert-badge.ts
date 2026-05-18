/**
 * W209 Faza 500.0 — Marketplace Activation (Agent A).
 *
 * Certification badge system. Three tiers:
 *
 *   1. Verified           — auto-granted on all-6-gates-pass at submit time.
 *   2. Engineering Team Endorsed — admin-granted after manual review +
 *                           sample game using the kernel.
 *   3. Production Proven  — auto-granted when used in 3+ live operator
 *                           games for 90+ days each.
 *
 * The store is in-memory for the MVP — Agent C wires a Postgres-backed
 * `BadgeStore` in a follow-up patch. We expose:
 *
 *   getKernelBadges(kernelId)            → { badges, details }
 *   grantBadge(kernelId, badgeId, ...)   → idempotent
 *   revokeBadge(kernelId, badgeId)       → for admin recall
 *   evaluateProductionProven(kernelId, usage) → auto-grants on threshold
 *
 * Each badge has an SVG renderer in the cyan + onyx palette (v5 design).
 * The SVG is intentionally compact so it fits inline in `<img src>`
 * data URLs or static asset directories.
 */

export type BadgeId = 'verified' | 'endorsed' | 'production-proven';

export interface BadgeDetail {
  id: BadgeId;
  label: string;
  grantedAt: string;
  grantedBy: string;
  /** Optional supporting facts (e.g. game-count for prod-proven). */
  evidence?: Record<string, number | string>;
  /** Optional ISO timestamp of revocation. */
  revokedAt?: string;
}

export interface BadgeQuery {
  badges: BadgeId[];
  details: BadgeDetail[];
}

export interface ProductionUsage {
  liveGameCount: number;
  /** Max days any single deployment has been live. */
  maxLiveDays: number;
}

const PRODUCTION_GAME_THRESHOLD = 3;
const PRODUCTION_DAYS_THRESHOLD = 90;

const BADGE_LABELS: Record<BadgeId, string> = {
  verified: 'Verified',
  endorsed: 'Engineering Team Endorsed',
  'production-proven': 'Production Proven',
};

const ALL_BADGES: BadgeId[] = ['verified', 'endorsed', 'production-proven'];

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const _store = new Map<string, Map<BadgeId, BadgeDetail>>();

function _ensure(kernelId: string): Map<BadgeId, BadgeDetail> {
  let m = _store.get(kernelId);
  if (!m) {
    m = new Map();
    _store.set(kernelId, m);
  }
  return m;
}

export function _resetBadgeStore(): void {
  _store.clear();
}

/** Idempotently grant a badge. Updates `grantedAt` only on first grant. */
export function grantBadge(
  kernelId: string,
  badgeId: BadgeId,
  grantedBy: string,
  evidence?: Record<string, number | string>,
  now: () => Date = () => new Date()
): BadgeDetail {
  if (!ALL_BADGES.includes(badgeId)) {
    throw new Error(`unknown badgeId: ${badgeId}`);
  }
  const m = _ensure(kernelId);
  const existing = m.get(badgeId);
  if (existing && !existing.revokedAt) return existing;
  const detail: BadgeDetail = {
    id: badgeId,
    label: BADGE_LABELS[badgeId],
    grantedAt: now().toISOString(),
    grantedBy,
    ...(evidence ? { evidence } : {}),
  };
  m.set(badgeId, detail);
  return detail;
}

/** Revoke a badge (admin action). Idempotent — second call is no-op. */
export function revokeBadge(
  kernelId: string,
  badgeId: BadgeId,
  now: () => Date = () => new Date()
): boolean {
  const m = _store.get(kernelId);
  if (!m) return false;
  const d = m.get(badgeId);
  if (!d || d.revokedAt) return false;
  d.revokedAt = now().toISOString();
  return true;
}

/** Return the set of active (non-revoked) badges for a kernel. */
export function getKernelBadges(kernelId: string): BadgeQuery {
  const m = _store.get(kernelId);
  if (!m) return { badges: [], details: [] };
  const details: BadgeDetail[] = [];
  const badges: BadgeId[] = [];
  for (const id of ALL_BADGES) {
    const d = m.get(id);
    if (d && !d.revokedAt) {
      badges.push(id);
      details.push(d);
    }
  }
  return { badges, details };
}

/**
 * Evaluate "Production Proven" criteria from usage stats. Auto-grants the
 * badge if the kernel meets the threshold; returns the badge detail on
 * grant, `null` otherwise (already had / not eligible).
 */
export function evaluateProductionProven(
  kernelId: string,
  usage: ProductionUsage,
  now: () => Date = () => new Date()
): BadgeDetail | null {
  if (
    usage.liveGameCount < PRODUCTION_GAME_THRESHOLD ||
    usage.maxLiveDays < PRODUCTION_DAYS_THRESHOLD
  ) {
    return null;
  }
  const existing = getKernelBadges(kernelId).badges.includes('production-proven');
  if (existing) return null;
  return grantBadge(
    kernelId,
    'production-proven',
    'system-auto',
    { liveGameCount: usage.liveGameCount, maxLiveDays: usage.maxLiveDays },
    now
  );
}

// ---------------------------------------------------------------------------
// SVG renderers (cyan + onyx, v5 design)
// ---------------------------------------------------------------------------

const PALETTE = {
  onyx: '#0d1117',
  cyan: '#00e1ff',
  cyanDim: '#0099aa',
  ink: '#e6edf3',
  warn: '#ffa657',
  ok: '#3fb950',
};

const SVG_HEAD = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="32" viewBox="0 0 160 32" role="img" aria-label="kernel certification badge">`;
const SVG_TAIL = `</svg>`;

function badgeBase(label: string, color: string): string {
  return [
    SVG_HEAD,
    `<rect width="160" height="32" rx="4" fill="${PALETTE.onyx}"/>`,
    `<rect x="0" y="0" width="6" height="32" fill="${color}"/>`,
    `<text x="14" y="20" font-family="Inter,sans-serif" font-size="11" font-weight="600" fill="${PALETTE.ink}">${label}</text>`,
    SVG_TAIL,
  ].join('');
}

export function renderBadgeSvg(badge: BadgeId): string {
  switch (badge) {
    case 'verified':
      return badgeBase('VERIFIED', PALETTE.cyan);
    case 'endorsed':
      return badgeBase('ENG TEAM ENDORSED', PALETTE.cyanDim);
    case 'production-proven':
      return badgeBase('PRODUCTION PROVEN', PALETTE.ok);
  }
}

/** Render all granted badges as an inline SVG row. */
export function renderBadgesRow(badges: BadgeId[]): string {
  return badges.map(renderBadgeSvg).join('\n');
}

// ---------------------------------------------------------------------------
// Public read endpoint stub
// ---------------------------------------------------------------------------

/**
 * Stub handler for GET `/api/marketplace/kernels/:id/badges`. Pure
 * function so Agent C can wire it into Fastify without re-implementing
 * the JSON shape.
 */
export function handleBadgesGet(kernelId: string): {
  kernelId: string;
  badges: BadgeId[];
  details: BadgeDetail[];
  svgRow: string;
} {
  const q = getKernelBadges(kernelId);
  return {
    kernelId,
    badges: q.badges,
    details: q.details,
    svgRow: renderBadgesRow(q.badges),
  };
}

export { ALL_BADGES, BADGE_LABELS, PRODUCTION_GAME_THRESHOLD, PRODUCTION_DAYS_THRESHOLD };
