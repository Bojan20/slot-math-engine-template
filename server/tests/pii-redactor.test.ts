/**
 * W213 Faza 600.2 — PII redactor specs.
 *
 * Covers email / phone / card / IP redactors, the auto-detect string
 * redactor, and the deep `redactRecord` walker used by the logger.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  hashPii,
  setRedactorSalt,
  redactEmail,
  redactPhone,
  redactCardNumber,
  redactIp,
  redactString,
  redactRecord,
  PII_FIELD_NAMES,
} from '../lib/pii-redactor.js';

beforeAll(() => {
  // Deterministic salt so hashPii is repeatable across the suite.
  setRedactorSalt('w213-test-salt');
});

describe('redactEmail', () => {
  it('keeps the first two chars of the local part and the full domain', () => {
    expect(redactEmail('boki@example.com')).toBe('bo***@example.com');
  });
  it('handles single-character local part by keeping the one char', () => {
    expect(redactEmail('a@example.com')).toBe('a***@example.com');
  });
  it('returns a sentinel for malformed input', () => {
    expect(redactEmail('not-an-email')).toBe('<redacted-email>');
  });
  it('returns redacted for non-string', () => {
    expect(redactEmail(undefined as unknown as string)).toBe('<redacted>');
  });
});

describe('redactPhone', () => {
  it('preserves the country code prefix and last two digits', () => {
    const out = redactPhone('+381 64 123 4567');
    // 11 digits, keep first 4 and last 2 — middle is masked
    expect(out).toMatch(/^\+?\d{0,1}3{0,1}81.*\*+.*67$/);
    expect(out.endsWith('67')).toBe(true);
  });
  it('returns sentinel for inputs with fewer than 4 digits', () => {
    expect(redactPhone('12')).toBe('<redacted-phone>');
  });
});

describe('redactCardNumber', () => {
  it('keeps only the last four digits', () => {
    expect(redactCardNumber('4111 1111 1111 1234')).toBe('**** **** **** 1234');
  });
  it('rejects malformed inputs', () => {
    expect(redactCardNumber('411')).toBe('<redacted-card>');
  });
});

describe('redactIp', () => {
  it('masks the host octets of an IPv4 address', () => {
    expect(redactIp('192.168.1.42')).toBe('192.168.x.x');
  });
  it('truncates IPv6 to a /32 prefix', () => {
    expect(redactIp('fe80::1234:5678:9abc')).toBe('fe80::****');
  });
});

describe('hashPii', () => {
  it('returns a stable 12-char hex digest for the same input', () => {
    const a = hashPii('boki@example.com');
    const b = hashPii('boki@example.com');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
  it('returns different digests for different inputs', () => {
    expect(hashPii('a@b.com')).not.toBe(hashPii('c@d.com'));
  });
});

describe('redactString auto-detect', () => {
  it('detects emails', () => {
    expect(redactString('boki@example.com')).toBe('bo***@example.com');
  });
  it('detects IPv4', () => {
    expect(redactString('10.0.0.1')).toBe('10.0.x.x');
  });
  it('passes through non-PII strings', () => {
    expect(redactString('hello world')).toBe('hello world');
  });
});

describe('redactRecord deep walker', () => {
  it('redacts every PII field by name', () => {
    const out = redactRecord({
      userId: 'usr_1',
      email: 'boki@example.com',
      phone: '+381 64 123 4567',
      meta: { ip: '192.168.1.1', card_number: '4111 1111 1111 9876' },
      safe: 'kept',
    });
    expect(out.email).toBe('bo***@example.com');
    expect(out.phone).toMatch(/67$/);
    expect(out.meta.ip).toBe('192.168.x.x');
    expect(out.meta.card_number).toBe('**** **** **** 9876');
    expect(out.userId).toBe('usr_1');
    expect(out.safe).toBe('kept');
  });
  it('preserves null/undefined and primitive values', () => {
    const out = redactRecord({ a: null, b: undefined, c: 42, d: true });
    expect(out).toEqual({ a: null, b: undefined, c: 42, d: true });
  });
  it('handles arrays of records', () => {
    const out = redactRecord([{ email: 'a@b.com' }, { email: 'c@d.com' }]);
    expect(out[0].email).toBe('a***@b.com');
    expect(out[1].email).toBe('c***@d.com');
  });
  it('treats the standard PII field-name catalog as canonical', () => {
    for (const k of ['email', 'phone', 'card_number', 'ip', 'remoteAddress']) {
      expect(PII_FIELD_NAMES.has(k)).toBe(true);
    }
  });
});

describe('integration with structured logger', () => {
  it('redacted email no longer matches the W212 PII regex sentinel', () => {
    const before = 'boki@example.com';
    const after = redactEmail(before);
    // Same sentinel used by scripts/security/audit.mjs auditPii:
    expect(/(hash|pseudo|redacted|\*\*\*)/.test(after)).toBe(true);
  });
});
