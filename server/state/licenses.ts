/**
 * CORTI W206-ONBOARDING — license registry.
 *
 * In-memory store for customer licenses with 3 tiers (trial / pro /
 * enterprise) backing the customer self-serve signup funnel. Each
 * license carries:
 *   - key             32-hex bound to tenantId + tier + createdAt
 *   - tenantId        FK into TenantStore (1:1 today, room to grow)
 *   - tier            'trial' | 'pro' | 'enterprise'
 *   - limits          per-tier feature caps (games, mc runs, cert subs)
 *   - usage           rolling daily/monthly counters
 *   - expiresAt       trial expiry — pro/enterprise default 1y
 *   - status          'active' | 'expired' | 'locked'
 *
 * Trial expiry hooks emit warnings at -5d and lockout at +1d.
 * Real deployment would back this with Postgres + a billing provider.
 */
import { randomBytes } from 'node:crypto';

export type LicenseTier = 'trial' | 'pro' | 'enterprise';
export type LicenseStatus = 'active' | 'expired' | 'locked';

export interface TierLimits {
  /** Max games created (-1 = unlimited). */
  maxGames: number;
  /** MC runs allowed per day. */
  mcRunsPerDay: number;
  /** Cert submissions allowed per calendar month. */
  certSubmissionsPerMonth: number;
  /** Operator-facing label. */
  supportLevel: 'community' | 'email_24h' | 'phone_csm';
  /** Monthly price in USD. */
  priceUsdPerMonth: number;
  /** Trial flag for UX. */
  isTrial: boolean;
}

export const TIER_LIMITS: Record<LicenseTier, TierLimits> = {
  trial: {
    maxGames: 3,
    mcRunsPerDay: 50,
    certSubmissionsPerMonth: 5,
    supportLevel: 'community',
    priceUsdPerMonth: 0,
    isTrial: true,
  },
  pro: {
    maxGames: 25,
    mcRunsPerDay: 1000,
    certSubmissionsPerMonth: 50,
    supportLevel: 'email_24h',
    priceUsdPerMonth: 5000,
    isTrial: false,
  },
  enterprise: {
    maxGames: -1,
    mcRunsPerDay: -1,
    certSubmissionsPerMonth: -1,
    supportLevel: 'phone_csm',
    priceUsdPerMonth: 25000,
    isTrial: false,
  },
};

export interface LicenseUsage {
  /** Games created (lifetime). */
  gamesCreated: number;
  /** MC runs (today, YYYY-MM-DD bucket). */
  mcRunsToday: number;
  /** Cert submissions this month (YYYY-MM bucket). */
  certSubmissionsThisMonth: number;
  /** Last reset markers — YYYY-MM-DD / YYYY-MM. */
  dailyBucket: string;
  monthlyBucket: string;
}

export interface License {
  key: string;
  tenantId: string;
  tier: LicenseTier;
  status: LicenseStatus;
  createdAt: string;
  expiresAt: string;
  email: string;
  company: string;
  useCase: string;
  usage: LicenseUsage;
}

export interface CreateLicenseInput {
  tenantId: string;
  tier: LicenseTier;
  email: string;
  company: string;
  useCase: string;
  /** Override expiry — used by tests; defaults to tier-appropriate. */
  expiresAt?: string;
  /** Override createdAt — used by tests. */
  createdAt?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dailyBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function monthlyBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function defaultExpiry(tier: LicenseTier, createdAt: Date): string {
  if (tier === 'trial') return new Date(createdAt.getTime() + 30 * DAY_MS).toISOString();
  return new Date(createdAt.getTime() + 365 * DAY_MS).toISOString();
}

export function makeLicenseKey(seed?: string): string {
  if (seed) {
    // Deterministic key for tests: hash-like 32 hex.
    let h = 0n;
    for (let i = 0; i < seed.length; i++) h = (h * 131n + BigInt(seed.charCodeAt(i))) % (1n << 128n);
    return 'lic_' + h.toString(16).padStart(32, '0').slice(0, 32);
  }
  return 'lic_' + randomBytes(16).toString('hex');
}

export class LicenseStore {
  private readonly licenses = new Map<string, License>();
  private readonly byTenant = new Map<string, string>(); // tenantId -> key

  create(input: CreateLicenseInput): License {
    if (!input.tenantId) throw new RangeError('tenantId required');
    if (!input.email) throw new RangeError('email required');
    if (!TIER_LIMITS[input.tier]) throw new RangeError(`unknown tier: ${input.tier}`);
    const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
    const expiresAt = input.expiresAt ?? defaultExpiry(input.tier, createdAt);
    const key = makeLicenseKey(`${input.tenantId}|${input.tier}|${createdAt.toISOString()}`);
    const license: License = {
      key,
      tenantId: input.tenantId,
      tier: input.tier,
      status: 'active',
      createdAt: createdAt.toISOString(),
      expiresAt,
      email: input.email,
      company: input.company,
      useCase: input.useCase,
      usage: {
        gamesCreated: 0,
        mcRunsToday: 0,
        certSubmissionsThisMonth: 0,
        dailyBucket: dailyBucket(createdAt),
        monthlyBucket: monthlyBucket(createdAt),
      },
    };
    this.licenses.set(key, license);
    this.byTenant.set(input.tenantId, key);
    return license;
  }

  get(key: string): License | null {
    return this.licenses.get(key) ?? null;
  }

  getByTenant(tenantId: string): License | null {
    const key = this.byTenant.get(tenantId);
    if (!key) return null;
    return this.licenses.get(key) ?? null;
  }

  list(): License[] {
    return Array.from(this.licenses.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  size(): number {
    return this.licenses.size;
  }

  /**
   * Upgrade tier. Resets expiresAt to 1y from now and bumps limits.
   */
  upgrade(key: string, newTier: LicenseTier, now: Date = new Date()): License {
    const license = this.licenses.get(key);
    if (!license) throw new RangeError(`license ${key} not found`);
    if (newTier === license.tier) return license;
    if (!TIER_LIMITS[newTier]) throw new RangeError(`unknown tier: ${newTier}`);
    license.tier = newTier;
    license.expiresAt = defaultExpiry(newTier, now);
    license.status = 'active';
    return license;
  }

  /**
   * Record usage. Rolls daily/monthly counters automatically.
   * Returns false when the per-tier cap would be exceeded.
   */
  recordUsage(
    key: string,
    kind: 'game' | 'mc_run' | 'cert_sub',
    now: Date = new Date()
  ): { ok: true } | { ok: false; reason: string } {
    const license = this.licenses.get(key);
    if (!license) return { ok: false, reason: 'license_not_found' };
    if (license.status !== 'active') return { ok: false, reason: `license_${license.status}` };
    // Roll buckets
    const today = dailyBucket(now);
    const thisMonth = monthlyBucket(now);
    if (license.usage.dailyBucket !== today) {
      license.usage.dailyBucket = today;
      license.usage.mcRunsToday = 0;
    }
    if (license.usage.monthlyBucket !== thisMonth) {
      license.usage.monthlyBucket = thisMonth;
      license.usage.certSubmissionsThisMonth = 0;
    }
    const limits = TIER_LIMITS[license.tier];
    if (kind === 'game') {
      if (limits.maxGames !== -1 && license.usage.gamesCreated >= limits.maxGames) {
        return { ok: false, reason: 'games_cap_exceeded' };
      }
      license.usage.gamesCreated++;
    } else if (kind === 'mc_run') {
      if (limits.mcRunsPerDay !== -1 && license.usage.mcRunsToday >= limits.mcRunsPerDay) {
        return { ok: false, reason: 'mc_runs_cap_exceeded' };
      }
      license.usage.mcRunsToday++;
    } else if (kind === 'cert_sub') {
      if (
        limits.certSubmissionsPerMonth !== -1 &&
        license.usage.certSubmissionsThisMonth >= limits.certSubmissionsPerMonth
      ) {
        return { ok: false, reason: 'cert_subs_cap_exceeded' };
      }
      license.usage.certSubmissionsThisMonth++;
    }
    return { ok: true };
  }

  /**
   * Trial expiry classification.
   *   - if expiresAt - now < 5 days  → 'warn'
   *   - if now > expiresAt + 1 day   → 'lockout'  (status becomes 'locked')
   *   - if now > expiresAt           → 'expired'  (status becomes 'expired')
   */
  checkExpiry(
    key: string,
    now: Date = new Date()
  ): { state: 'ok' | 'warn' | 'expired' | 'lockout'; daysUntil: number } {
    const license = this.licenses.get(key);
    if (!license) return { state: 'ok', daysUntil: Infinity };
    if (!TIER_LIMITS[license.tier].isTrial) return { state: 'ok', daysUntil: Infinity };
    const exp = new Date(license.expiresAt).getTime();
    const t = now.getTime();
    const daysUntil = Math.floor((exp - t) / DAY_MS);
    if (t > exp + DAY_MS) {
      license.status = 'locked';
      return { state: 'lockout', daysUntil };
    }
    if (t > exp) {
      license.status = 'expired';
      return { state: 'expired', daysUntil };
    }
    if (daysUntil <= 5) return { state: 'warn', daysUntil };
    return { state: 'ok', daysUntil };
  }

  /** Test-only. */
  reset(): void {
    this.licenses.clear();
    this.byTenant.clear();
  }
}
