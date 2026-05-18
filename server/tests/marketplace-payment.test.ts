/**
 * CORTI W209 Faza 500.0 — payment stub + webhook tests.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  StubPaymentProvider,
  StripeProvider,
  validateWebhookSignature,
  newIdempotencyNonce,
} from '../lib/payment-stub.js';

describe('StubPaymentProvider', () => {
  it('forceSuccess always returns ok:true', async () => {
    const p = new StubPaymentProvider({ forceSuccess: true });
    const r = await p.charge({
      amount: 500,
      currency: 'USD',
      source: { type: 'card', token: 'tok_test' },
    });
    expect(r.ok).toBe(true);
    expect(r.reference).toMatch(/^pi_stub_/);
  });

  it('forceFailure always returns ok:false with errorCode', async () => {
    const p = new StubPaymentProvider({ forceFailure: true });
    const r = await p.charge({
      amount: 500,
      currency: 'USD',
      source: { type: 'card', token: 'tok_test' },
    });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('card_declined');
  });

  it('amount=0 succeeds with a pi_free_ reference (free items)', async () => {
    const p = new StubPaymentProvider({ forceSuccess: true });
    const r = await p.charge({
      amount: 0,
      currency: 'USD',
      source: { type: 'card' },
    });
    expect(r.ok).toBe(true);
    expect(r.reference.startsWith('pi_free_')).toBe(true);
  });

  it('negative amount is rejected', async () => {
    const p = new StubPaymentProvider({ forceSuccess: true });
    const r = await p.charge({
      amount: -1,
      currency: 'USD',
      source: { type: 'card' },
    });
    expect(r.ok).toBe(false);
  });

  it('refund returns ok:true with a refundId', async () => {
    const p = new StubPaymentProvider();
    const r = await p.refund({ reference: 'pi_x_123' });
    expect(r.ok).toBe(true);
    expect(r.refundId.startsWith('re_stub_')).toBe(true);
  });
});

describe('StripeProvider (placeholder)', () => {
  it('charge throws TODO marker', async () => {
    const s = new StripeProvider();
    await expect(
      s.charge({
        amount: 100,
        currency: 'USD',
        source: { type: 'card' },
      })
    ).rejects.toThrow(/TODO\(w21x\)/);
  });
});

describe('validateWebhookSignature', () => {
  const body = JSON.stringify({ event: 'payment.succeeded', id: 'evt_1' });
  const secret = 'whsec_test_secret';
  const sig = createHmac('sha256', secret).update(body).digest('hex');

  it('returns ok when signature matches secret', () => {
    const v = validateWebhookSignature({
      rawBody: body,
      signatureHeader: sig,
      secret,
    });
    expect(v.ok).toBe(true);
  });

  it('rejects mismatched signature', () => {
    const v = validateWebhookSignature({
      rawBody: body,
      signatureHeader: 'deadbeef',
      secret,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('invalid_signature');
  });

  it('rejects when secret missing', () => {
    const v = validateWebhookSignature({
      rawBody: body,
      signatureHeader: sig,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('missing_secret');
  });

  it('rejects when signature header missing', () => {
    const v = validateWebhookSignature({
      rawBody: body,
      signatureHeader: undefined,
      secret,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('missing_signature');
  });
});

describe('newIdempotencyNonce', () => {
  it('emits unique UUID-shaped strings', () => {
    const a = newIdempotencyNonce();
    const b = newIdempotencyNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
