/**
 * W214 Faza 800.1 Agent C — signup form kernel unit tests.
 *
 * Covers: validation rules, role enum, honeypot drop, operator-tier
 * detection from email domain, HTML render shape.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSignup,
  detectOperatorTier,
  renderSignupFormHtml,
  ROLE_LABELS,
} from '../components/signup-form.ts';

describe('Signup validation', () => {
  it('rejects empty name', () => {
    const v = validateSignup({
      name: '',
      email: 'a@b.com',
      company: 'Acme',
      role: 'CTO',
      message: '',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe('name');
  });
  it('rejects invalid email', () => {
    const v = validateSignup({
      name: 'Boki',
      email: 'not-an-email',
      company: 'Acme',
      role: 'CTO',
      message: '',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe('email');
  });
  it('rejects empty company', () => {
    const v = validateSignup({
      name: 'Boki',
      email: 'a@b.com',
      company: '',
      role: 'CTO',
      message: '',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe('company');
  });
  it('rejects unknown role', () => {
    const v = validateSignup({
      name: 'Boki',
      email: 'a@b.com',
      company: 'Acme',
      role: 'EvilLord' as never,
      message: '',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe('role');
  });
  it('rejects message > 2000 chars', () => {
    const v = validateSignup({
      name: 'Boki',
      email: 'a@b.com',
      company: 'Acme',
      role: 'CTO',
      message: 'x'.repeat(2001),
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe('message');
  });
  it('accepts a clean payload', () => {
    const v = validateSignup({
      name: 'Boki',
      email: 'boki@example.com',
      company: 'Acme',
      role: 'CTO',
      message: 'hi',
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.email).toBe('boki@example.com');
      expect(v.payload.role).toBe('CTO');
    }
  });
  it('normalises email to lowercase + trim', () => {
    const v = validateSignup({
      name: 'Boki',
      email: '  Boki@Example.COM  ',
      company: 'Acme',
      role: 'CTO',
      message: '',
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload.email).toBe('boki@example.com');
  });
  it('honeypot triggers field=company_website', () => {
    const v = validateSignup({
      name: 'Boki',
      email: 'a@b.com',
      company: 'Acme',
      role: 'CTO',
      message: '',
      company_website: 'http://spam.com',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe('company_website');
  });
});

describe('Operator tier detection', () => {
  it('returns tier1 for flutter.com', () => {
    expect(detectOperatorTier('boki@flutter.com')).toBe('tier1');
  });
  it('returns tier2 for betsson.com', () => {
    expect(detectOperatorTier('a@betsson.com')).toBe('tier2');
  });
  it('returns tier3 for unknown commercial domain', () => {
    expect(detectOperatorTier('a@random-studio.com')).toBe('tier3');
  });
  it('returns null for unrecognised tld', () => {
    expect(detectOperatorTier('a@something.invalid')).toBe(null);
  });
});

describe('renderSignupFormHtml', () => {
  it('emits a form with the right action', () => {
    const html = renderSignupFormHtml({ action: '/custom' });
    expect(html).toContain('action="/custom"');
  });
  it('renders every role option', () => {
    const html = renderSignupFormHtml();
    for (const k of Object.keys(ROLE_LABELS)) {
      expect(html).toContain(`value="${k}"`);
    }
  });
  it('includes the hidden honeypot field', () => {
    const html = renderSignupFormHtml();
    expect(html).toContain('name="company_website"');
    expect(html).toContain('class="honeypot"');
  });
});
