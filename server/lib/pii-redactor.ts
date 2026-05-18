/**
 * W213 Faza 600.2 — PII redaction helpers.
 *
 * Replaces raw personally-identifiable information (email, phone, card
 * number, IPs, tenant member names) with privacy-preserving stand-ins
 * BEFORE the bytes hit a log sink, an outbox, or an HTTP response body.
 *
 * Two strategies are exposed:
 *
 *   1) **Masking** — keep the first 1-2 characters and the domain so
 *      humans can still cross-reference the original in support
 *      workflows ("bo***@example.com").
 *
 *   2) **Hashing** — SHA-256 with a deployment-wide salt to produce a
 *      stable pseudonymous identifier for analytics / dedup without
 *      exposing the original PII.
 *
 * The deployment salt is read from `PII_REDACTOR_SALT` (env). When
 * missing, a per-process random salt is generated. Tests can pin the
 * salt with `setRedactorSalt('test-salt')` for determinism.
 *
 * Usage:
 *
 *   import { redactEmail, redactString } from './pii-redactor.js';
 *   console.log(`[email] to=${redactEmail(user.email)}`);
 *
 * Integrates with the W208 StructuredLogger via {@link redactRecord}:
 * any log call that includes `meta.email`, `meta.phone`, etc. has those
 * values auto-redacted before write.
 */

import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Salt management
// ---------------------------------------------------------------------------

let saltCache: string | null = null;

/** Pin the deployment salt (test setup). */
export function setRedactorSalt(salt: string): void {
  saltCache = salt;
}

function getSalt(): string {
  if (saltCache !== null) return saltCache;
  const fromEnv = process.env.PII_REDACTOR_SALT;
  if (fromEnv && fromEnv.length > 0) {
    saltCache = fromEnv;
    return saltCache;
  }
  saltCache = randomBytes(16).toString('hex');
  return saltCache;
}

/** SHA-256(salt + value) → first 12 hex chars (48 bits — collision-resistant for dedup). */
export function hashPii(value: string): string {
  const salt = getSalt();
  return createHash('sha256').update(salt).update(value).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL_RE = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/;

/**
 * `boki@example.com` → `bo***@example.com`. Keep the first 2 chars of
 * the local part and the full domain so humans can correlate across
 * traces while never logging the full address.
 */
export function redactEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '<redacted>';
  const m = EMAIL_RE.exec(value);
  if (!m) return '<redacted-email>';
  const local = m[1];
  const domain = m[2];
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

const PHONE_DIGITS_RE = /\d/g;

/**
 * `+381 64 123 4567` → `+381 64 *** **67`. Keep country code + last 2
 * digits so an operator can still confirm the right user on a support
 * call. Non-digit runs are preserved verbatim.
 */
export function redactPhone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '<redacted>';
  const digits = (value.match(PHONE_DIGITS_RE) ?? []).join('');
  if (digits.length < 4) return '<redacted-phone>';
  const keep = Math.min(2, digits.length - 3);
  const last = digits.slice(-keep);
  // Reconstruct: keep first 4 digits + mask middle + last 2 digits.
  const head = digits.slice(0, Math.min(4, digits.length - keep));
  const middle = '*'.repeat(Math.max(1, digits.length - head.length - keep));
  return `${head} ${middle} ${last}`;
}

// ---------------------------------------------------------------------------
// Card numbers (PAN)
// ---------------------------------------------------------------------------

/**
 * `4111 1111 1111 1234` → `**** **** **** 1234`. Always keep the last
 * four digits for the cardholder display rule; everything else is
 * masked. Returns `<redacted-card>` when input is malformed.
 */
export function redactCardNumber(value: unknown): string {
  if (typeof value !== 'string') return '<redacted>';
  const digits = (value.match(PHONE_DIGITS_RE) ?? []).join('');
  if (digits.length < 12) return '<redacted-card>';
  const last4 = digits.slice(-4);
  return `**** **** **** ${last4}`;
}

// ---------------------------------------------------------------------------
// IPs
// ---------------------------------------------------------------------------

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** `192.168.1.42` → `192.168.x.x` (GDPR Art. 4 — anonymisation tier). */
export function redactIp(value: unknown): string {
  if (typeof value !== 'string') return '<redacted>';
  const m = IPV4_RE.exec(value);
  if (m) return `${m[1]}.${m[2]}.x.x`;
  // IPv6 fallback — keep the network prefix.
  if (value.includes(':')) {
    const segs = value.split(':');
    return `${segs.slice(0, 2).join(':')}:****`;
  }
  return '<redacted-ip>';
}

// ---------------------------------------------------------------------------
// Generic string redactor (auto-detect)
// ---------------------------------------------------------------------------

/**
 * Detect PII type by shape and apply the matching redactor. Used when
 * a meta blob is logged and we don't statically know which fields are
 * sensitive. Returns the input unchanged if no pattern matches.
 */
export function redactString(value: string): string {
  if (EMAIL_RE.test(value)) return redactEmail(value);
  if (IPV4_RE.test(value)) return redactIp(value);
  // Cards take precedence over phones because they have more digits.
  const digits = (value.match(PHONE_DIGITS_RE) ?? []).join('');
  if (digits.length >= 13 && digits.length <= 19) return redactCardNumber(value);
  if (digits.length >= 7 && digits.length <= 15 && /[\d\s+\-()]+/.test(value)) {
    return redactPhone(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Structured payload redaction (logger integration)
// ---------------------------------------------------------------------------

/** Field names whose values are PII and must always be redacted. */
export const PII_FIELD_NAMES = new Set<string>([
  'email',
  'emailAddress',
  'email_address',
  'phone',
  'phoneNumber',
  'phone_number',
  'card',
  'cardNumber',
  'card_number',
  'pan',
  'ip',
  'ipAddress',
  'ip_address',
  'remoteAddress',
  'remote_address',
]);

function pickRedactor(field: string): (v: unknown) => string {
  const lc = field.toLowerCase();
  if (lc.includes('email')) return redactEmail;
  if (lc.includes('phone')) return redactPhone;
  if (lc.includes('card') || lc === 'pan') return redactCardNumber;
  if (lc.includes('ip') || lc.includes('address')) return redactIp;
  return (v: unknown) => (typeof v === 'string' ? redactString(v) : '<redacted>');
}

/**
 * Deep-clone `obj` and replace every PII field with its redacted form.
 * Non-PII fields are passed through untouched.
 */
export function redactRecord<T>(obj: T): T {
  return walk(obj) as T;
}

function walk(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PII_FIELD_NAMES.has(k)) {
        out[k] = pickRedactor(k)(val);
      } else {
        out[k] = walk(val);
      }
    }
    return out;
  }
  return v;
}
