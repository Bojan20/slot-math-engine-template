// W209 Agent B — Pricing + license type model for game templates.
//
// Three license types:
//   - perpetual: upfront only, no royalty
//   - revenue-share: lower upfront + N% gross revenue (3-5% typical)
//   - hybrid: perpetual + capped revenue share
//
// Issues a license bundle (UUID + signed token stub). Agent C will
// wire the real backend; this module owns the deterministic shape.

export type LicenseType = 'perpetual' | 'revenue-share' | 'hybrid';

export interface PerpetualLicense {
  type: 'perpetual';
  upfront_usd: number;
}

export interface RevenueShareLicense {
  type: 'revenue-share';
  upfront_usd: number;
  /** Percentage of gross revenue (0..100, typical 3-5). */
  revenue_share_pct: number;
}

export interface HybridLicense {
  type: 'hybrid';
  upfront_usd: number;
  revenue_share_pct: number;
  /** Cap (USD) — once total royalty paid reaches cap, royalty stops. */
  revenue_cap_usd: number;
}

export type LicenseSpec = PerpetualLicense | RevenueShareLicense | HybridLicense;

export interface LicenseIssue {
  /** RFC4122-style UUID v4-ish (deterministic in tests via injectable rng). */
  uuid: string;
  /** Signed token blob — base64url(header.payload.sig-stub). */
  token: string;
  templateId: string;
  buyerId: string;
  spec: LicenseSpec;
  issuedAt: string;
  /** Expiry — null for perpetual / hybrid. */
  expiresAt: string | null;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  /** When ok, the parsed license bundle. */
  issue?: LicenseIssue;
}

/** Parse a license_terms string from templates.json. */
export function parseLicenseTerms(terms: string, priceUsd: number): LicenseSpec {
  // examples:
  //   "perpetual"
  //   "perpetual + revenue_share_3pct"
  //   "perpetual + revenue_share_4pct + cap_50000"
  //   "revenue_share_5pct"
  const norm = terms.toLowerCase().trim();
  const rsMatch = /revenue_share_(\d+(?:\.\d+)?)pct/.exec(norm);
  const capMatch = /cap_(\d+)/.exec(norm);

  if (norm === 'perpetual') {
    return { type: 'perpetual', upfront_usd: priceUsd };
  }
  if (norm.startsWith('perpetual') && rsMatch && capMatch) {
    return {
      type: 'hybrid',
      upfront_usd: priceUsd,
      revenue_share_pct: parseFloat(rsMatch[1]),
      revenue_cap_usd: parseInt(capMatch[1], 10),
    };
  }
  if (norm.startsWith('perpetual') && rsMatch) {
    // Treat "perpetual + revenue_share_Npct" as hybrid with an implicit cap
    // of 10x upfront (industry default in template marketplace contracts).
    return {
      type: 'hybrid',
      upfront_usd: priceUsd,
      revenue_share_pct: parseFloat(rsMatch[1]),
      revenue_cap_usd: priceUsd * 10,
    };
  }
  if (rsMatch) {
    return {
      type: 'revenue-share',
      upfront_usd: Math.round(priceUsd * 0.3),
      revenue_share_pct: parseFloat(rsMatch[1]),
    };
  }
  // Fallback
  return { type: 'perpetual', upfront_usd: priceUsd };
}

/** Compute first-12-month total cost given a projected gross-monthly. */
export function projectedCost12Mo(spec: LicenseSpec, monthlyGrossUsd: number): number {
  switch (spec.type) {
    case 'perpetual':
      return spec.upfront_usd;
    case 'revenue-share': {
      const royalty = monthlyGrossUsd * 12 * (spec.revenue_share_pct / 100);
      return spec.upfront_usd + Math.round(royalty);
    }
    case 'hybrid': {
      const uncapped = monthlyGrossUsd * 12 * (spec.revenue_share_pct / 100);
      const capped = Math.min(uncapped, spec.revenue_cap_usd);
      return spec.upfront_usd + Math.round(capped);
    }
  }
}

/** Deterministic uuid-like generator — replaceable via rng injection. */
export function makeUuid(rng: () => number = Math.random): string {
  const hex = (): string => {
    const v = Math.floor(rng() * 0x10000);
    return v.toString(16).padStart(4, '0');
  };
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** Base64url encode for JWT-style tokens. */
function b64url(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  // Browser fallback
  // eslint-disable-next-line no-undef
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Stub HMAC-ish signature — deterministic FNV-1a hex. Replace with real
 *  HMAC-SHA256 when Agent C wires the backend. */
function signStub(payload: string, secret: string): string {
  const seed = `${secret}:${payload}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Issue a license token. */
export function issueLicense(
  templateId: string,
  buyerId: string,
  spec: LicenseSpec,
  opts: {
    rng?: () => number;
    now?: () => Date;
    secret?: string;
  } = {},
): LicenseIssue {
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? (() => new Date());
  const secret = opts.secret ?? 'mp-stub-secret';

  const uuid = makeUuid(rng);
  const issuedAt = now().toISOString();
  // expiry rules: perpetual / hybrid -> null; revenue-share -> +12 months
  const expiresAt =
    spec.type === 'revenue-share'
      ? new Date(now().getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const header = b64url(JSON.stringify({ alg: 'STUB', typ: 'MPL' }));
  const payload = b64url(
    JSON.stringify({ uuid, templateId, buyerId, spec, issuedAt, expiresAt }),
  );
  const sig = signStub(`${header}.${payload}`, secret);
  const token = `${header}.${payload}.${sig}`;

  return { uuid, token, templateId, buyerId, spec, issuedAt, expiresAt };
}

/** Verify a token — replays the signing step and compares. */
export function verifyLicense(
  token: string,
  opts: { secret?: string; now?: () => Date } = {},
): VerifyResult {
  const secret = opts.secret ?? 'mp-stub-secret';
  const now = opts.now ?? (() => new Date());

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  const [header, payload, sig] = parts;
  const expected = signStub(`${header}.${payload}`, secret);
  if (sig !== expected) return { ok: false, reason: 'signature mismatch' };

  let parsed: Omit<LicenseIssue, 'token'>;
  try {
    const json = JSON.parse(
      typeof Buffer !== 'undefined'
        ? Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        // eslint-disable-next-line no-undef
        : decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))),
    );
    parsed = json as Omit<LicenseIssue, 'token'>;
  } catch {
    return { ok: false, reason: 'payload decode failed' };
  }

  if (parsed.expiresAt) {
    const exp = new Date(parsed.expiresAt).getTime();
    if (now().getTime() > exp) return { ok: false, reason: 'expired' };
  }

  return { ok: true, issue: { ...parsed, token } };
}
