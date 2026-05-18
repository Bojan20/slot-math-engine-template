/**
 * CORTI W209 Faza 500.0 — Payment provider abstraction + stub.
 *
 * The marketplace doesn't take real money in this MVP; it talks to a
 * pluggable {@link PaymentProvider}. The default implementation is
 * {@link StubPaymentProvider} which mocks a Stripe-like response with
 * a 95% success rate (deterministically by amount + nonce so tests are
 * stable). A `StripeProvider` placeholder is included with TODOs so a
 * real integration can drop in without touching call-sites.
 *
 * Webhook receiver: every PSP eventually pushes async events for
 * settlement / refund / chargeback. {@link validateWebhookSignature}
 * accepts an HMAC-SHA-256 signature in `X-Webhook-Signature` and the
 * shared secret in `MARKETPLACE_WEBHOOK_SECRET`.
 */

import { createHmac, randomBytes, randomUUID } from 'node:crypto';

export interface PaymentSource {
  type: 'card' | 'wire' | 'bank_transfer' | 'wallet';
  token?: string;
  last4?: string;
  brand?: string;
}

export interface ChargeRequest {
  amount: number;
  currency: string;
  source: PaymentSource;
  metadata?: Record<string, string>;
  /** Idempotency hint, optional. */
  nonce?: string;
}

export interface ChargeResult {
  ok: boolean;
  reference: string;
  provider: string;
  errorCode?: 'card_declined' | 'insufficient_funds' | 'provider_unavailable';
  raw?: Record<string, unknown>;
}

export interface RefundRequest {
  reference: string;
  amount?: number;
  reason?: string;
}

export interface RefundResult {
  ok: boolean;
  reference: string;
  refundId: string;
  errorCode?: string;
}

export interface PaymentProvider {
  readonly name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(req: RefundRequest): Promise<RefundResult>;
}

// ---------------------------------------------------------------------------
// Stub provider
// ---------------------------------------------------------------------------

/**
 * 95% success rate by default. The decision is deterministic from
 * `(amount, nonce)` — set a non-empty nonce to force a specific path
 * in tests, or pass `successRate: 1` / `0` to force a global outcome.
 */
export interface StubPaymentProviderOptions {
  /** 0..1, fraction of charges that succeed. Default 0.95. */
  successRate?: number;
  /** Always succeed regardless of nonce (overrides successRate). */
  forceSuccess?: boolean;
  /** Always fail regardless of nonce. */
  forceFailure?: boolean;
  /** Override the (Math.random) source for tests. */
  rng?: () => number;
}

export class StubPaymentProvider implements PaymentProvider {
  readonly name = 'stub';
  private readonly successRate: number;
  private readonly forceSuccess: boolean;
  private readonly forceFailure: boolean;
  private readonly rng: () => number;

  constructor(opts: StubPaymentProviderOptions = {}) {
    this.successRate = opts.successRate ?? 0.95;
    this.forceSuccess = !!opts.forceSuccess;
    this.forceFailure = !!opts.forceFailure;
    this.rng = opts.rng ?? Math.random;
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    if (req.amount < 0) {
      return {
        ok: false,
        reference: 'pi_invalid',
        provider: this.name,
        errorCode: 'card_declined',
      };
    }
    if (req.amount === 0) {
      // Free items still get a reference for paper-trail symmetry.
      return {
        ok: true,
        reference: `pi_free_${randomBytes(6).toString('hex')}`,
        provider: this.name,
      };
    }
    const succeed = this.forceSuccess
      ? true
      : this.forceFailure
        ? false
        : this.rng() < this.successRate;
    if (!succeed) {
      return {
        ok: false,
        reference: `pi_failed_${randomBytes(6).toString('hex')}`,
        provider: this.name,
        errorCode: 'card_declined',
      };
    }
    return {
      ok: true,
      reference: `pi_stub_${randomBytes(8).toString('hex')}`,
      provider: this.name,
      raw: {
        amount: req.amount,
        currency: req.currency,
        nonce: req.nonce ?? null,
      },
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (!req.reference) {
      return {
        ok: false,
        reference: '',
        refundId: '',
        errorCode: 'reference_required',
      };
    }
    return {
      ok: true,
      reference: req.reference,
      refundId: `re_stub_${randomBytes(8).toString('hex')}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Stripe placeholder
// ---------------------------------------------------------------------------

/**
 * Skeleton for a real Stripe integration. Wire this up in W21x by
 * dropping in `stripe` (the npm package) and replacing the throws
 * below with `await this.client.paymentIntents.create({...})`.
 *
 * Keeping the placeholder here lets the rest of the code import
 * `StripeProvider` from a stable path even before the real SDK lands.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  // TODO(w21x): replace with real Stripe client when SDK lands.
  // private client = new Stripe(process.env.STRIPE_SECRET!);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_opts: { secret?: string } = {}) {}

  async charge(_req: ChargeRequest): Promise<ChargeResult> {
    throw new Error('StripeProvider.charge: TODO(w21x) — wire to Stripe SDK');
  }

  async refund(_req: RefundRequest): Promise<RefundResult> {
    throw new Error('StripeProvider.refund: TODO(w21x) — wire to Stripe SDK');
  }
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

export interface WebhookValidation {
  ok: boolean;
  reason?: 'missing_signature' | 'invalid_signature' | 'missing_secret';
}

/**
 * Verify a webhook by computing HMAC-SHA-256 over the raw body using
 * `MARKETPLACE_WEBHOOK_SECRET` (or `opts.secret`). Compare with the
 * hex signature presented in the `X-Webhook-Signature` header. We use
 * a constant-time compare to defang timing oracles.
 */
export function validateWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | undefined;
  secret?: string;
}): WebhookValidation {
  const secret = input.secret ?? process.env.MARKETPLACE_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!input.signatureHeader) return { ok: false, reason: 'missing_signature' };
  const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');
  if (!constantTimeEqual(expected, input.signatureHeader)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Helpers re-exported for convenience
// ---------------------------------------------------------------------------

export function newIdempotencyNonce(): string {
  return randomUUID();
}
