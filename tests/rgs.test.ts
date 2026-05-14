/**
 * W152 P2-11 — RGS pluggable surface integration tests.
 *
 * Covers all four pillars + the orchestrator end-to-end:
 *   1. Wallet contract: debit/credit/rollback/balance + idempotency
 *      + promo-token short-circuit + edge errors.
 *   2. Auth signers: HMAC determinism + constant-time verify; JWT
 *      reuses the HMAC primitive; RSA round-trips via injected impl.
 *   3. Canonical JSON: stable key order, ASCII-only.
 *   4. RgsProtocol: signEnvelope round-trip; debit honours promo
 *      validator; round events forwarded; deadline guard triggers.
 */

import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  HmacSha256Signer,
  InMemoryMockWallet,
  JwtHs256Signer,
  RgsProtocol,
  RsaSha256Signer,
  type AuthSigner,
  type BetRequest,
  type RoundEvent,
  type WinRequest,
} from '../src/rgs/index.js';

function secret(n = 32): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7 + 11) & 0xff;
  return out;
}

function makeBet(overrides: Partial<BetRequest> = {}): BetRequest {
  return {
    transactionUuid: overrides.transactionUuid ?? 'uuid-1',
    playerId: overrides.playerId ?? 'p1',
    currency: overrides.currency ?? 'EUR',
    amountMc: overrides.amountMc ?? 1000,
    gameId: overrides.gameId ?? 'test-game:1.0',
    roundId: overrides.roundId ?? 'round-1',
    promoToken: overrides.promoToken,
    metadata: overrides.metadata,
  };
}

// ─── Wallet contract ───────────────────────────────────────────────────────

describe('W152 P2-11 — InMemoryMockWallet', () => {
  it('debit reduces balance and credit restores it', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 10_000);

    const debit = await w.debit(makeBet({ amountMc: 1000 }));
    expect(debit.ok).toBe(true);
    if (debit.ok) expect(debit.data.amountMc).toBe(9_000);

    const credit = await w.credit({
      transactionUuid: 'uuid-credit',
      playerId: 'p1',
      currency: 'EUR',
      amountMc: 500,
      gameId: 'g',
      roundId: 'round-1',
    });
    expect(credit.ok).toBe(true);
    if (credit.ok) expect(credit.data.amountMc).toBe(9_500);
  });

  it('idempotency: same uuid returns cached response (no double-debit)', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 10_000);
    const a = await w.debit(makeBet({ amountMc: 1000 }));
    const b = await w.debit(makeBet({ amountMc: 1000 }));
    expect(a).toEqual(b);
    // Balance only debited once.
    const bal = await w.balance('p1', 'EUR');
    expect(bal.ok).toBe(true);
    if (bal.ok) expect(bal.data.amountMc).toBe(9_000);
  });

  it('insufficient funds → INSUFFICIENT_FUNDS error, balance unchanged', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 100);
    const r = await w.debit(makeBet({ amountMc: 500 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INSUFFICIENT_FUNDS');
    const bal = await w.balance('p1', 'EUR');
    if (bal.ok) expect(bal.data.amountMc).toBe(100);
  });

  it('unknown player → PLAYER_NOT_FOUND on debit + balance', async () => {
    const w = new InMemoryMockWallet();
    const r = await w.debit(makeBet({ playerId: 'ghost', amountMc: 100 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('PLAYER_NOT_FOUND');
    const b = await w.balance('ghost', 'EUR');
    expect(b.ok).toBe(false);
  });

  it('currency mismatch is rejected', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 10_000);
    const r = await w.debit(makeBet({ currency: 'USD' }));
    // currency: 'USD' under playerId 'p1' is not seeded → PLAYER_NOT_FOUND.
    expect(r.ok).toBe(false);
  });

  it('promo token bypasses real-balance debit', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 1000);
    const r = await w.debit(makeBet({ amountMc: 99_999, promoToken: 'FREE-SPIN' }));
    expect(r.ok).toBe(true);
    const bal = await w.balance('p1', 'EUR');
    if (bal.ok) expect(bal.data.amountMc).toBe(1000); // unchanged
  });

  it('rollback is idempotent and never fails loud on unknown uuid', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 5000);
    await w.debit(makeBet({ amountMc: 1000 }));
    const a = await w.rollback('uuid-1');
    const b = await w.rollback('uuid-1');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // Even a fully unknown uuid returns ok:true (no-op safety).
    const u = await w.rollback('never-existed');
    expect(u.ok).toBe(true);
  });

  it('negative debit is rejected', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 1000);
    const r = await w.debit(makeBet({ amountMc: -10 }));
    expect(r.ok).toBe(false);
  });

  it('credit accepts zero (settle-with-no-win round)', async () => {
    const w = new InMemoryMockWallet();
    w.seed('p1', 'EUR', 1000);
    const r = await w.credit({
      transactionUuid: 'win-zero',
      playerId: 'p1',
      currency: 'EUR',
      amountMc: 0,
      gameId: 'g',
      roundId: 'round-1',
    });
    expect(r.ok).toBe(true);
  });
});

// ─── Auth signers ──────────────────────────────────────────────────────────

describe('W152 P2-11 — Auth signers', () => {
  it('HmacSha256Signer determinism + verify', async () => {
    const s = new HmacSha256Signer(secret());
    const payload = new TextEncoder().encode('hello');
    const a = await s.sign(payload);
    const b = await s.sign(payload);
    expect(a).toEqual(b);
    expect(await s.verify(payload, a)).toBe(true);
  });

  it('HmacSha256Signer rejects flipped signature', async () => {
    const s = new HmacSha256Signer(secret());
    const payload = new TextEncoder().encode('x');
    const sig = await s.sign(payload);
    sig[0] ^= 0xff;
    expect(await s.verify(payload, sig)).toBe(false);
  });

  it('HmacSha256Signer rejects short secret', () => {
    expect(() => new HmacSha256Signer(secret(8))).toThrow(/32 bytes/);
  });

  it('JwtHs256Signer round-trips via underlying HMAC', async () => {
    const s = new JwtHs256Signer(secret());
    expect(s.schemeId).toBe('jwt-hs256');
    const payload = new TextEncoder().encode('header.payload');
    const sig = await s.sign(payload);
    expect(await s.verify(payload, sig)).toBe(true);
  });

  it('RsaSha256Signer delegates to injected impl', async () => {
    const seen: { signCalls: number; verifyCalls: number } = {
      signCalls: 0,
      verifyCalls: 0,
    };
    const fakeSig = new Uint8Array([1, 2, 3, 4]);
    const rsa = new RsaSha256Signer({
      async sign(payload) {
        seen.signCalls++;
        expect(payload).toBeInstanceOf(Uint8Array);
        return fakeSig;
      },
      async verify(_payload, sig) {
        seen.verifyCalls++;
        return sig === fakeSig;
      },
    });
    const sig = await rsa.sign(new TextEncoder().encode('p'));
    expect(sig).toBe(fakeSig);
    expect(await rsa.verify(new TextEncoder().encode('p'), sig)).toBe(true);
    expect(seen.signCalls).toBe(1);
    expect(seen.verifyCalls).toBe(1);
  });
});

// ─── Canonical JSON ────────────────────────────────────────────────────────

describe('W152 P2-11 — canonicalJson', () => {
  it('sorts keys deterministically at every depth', () => {
    const a = canonicalJson({ b: 2, a: 1, c: { y: 4, x: 3 } });
    const b = canonicalJson({ c: { x: 3, y: 4 }, a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"c":{"x":3,"y":4}}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles null and primitives', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(42)).toBe('42');
  });
});

// ─── RgsProtocol orchestrator ──────────────────────────────────────────────

describe('W152 P2-11 — RgsProtocol', () => {
  function build(args: {
    promoValidator?: (token: string) => Promise<{ valid: boolean }>;
    roundEventSink?: (event: RoundEvent) => Promise<void>;
    roundDeadlineMs?: number;
  } = {}): { rgs: RgsProtocol; wallet: InMemoryMockWallet; signer: AuthSigner } {
    const wallet = new InMemoryMockWallet();
    wallet.seed('p1', 'EUR', 10_000);
    const signer = new HmacSha256Signer(secret());
    const rgs = new RgsProtocol({
      wallet,
      signer,
      promoValidator: args.promoValidator
        ? async (token, bet) => args.promoValidator!(token)
        : undefined,
      roundEventSink: args.roundEventSink,
      roundDeadlineMs: args.roundDeadlineMs,
    });
    return { rgs, wallet, signer };
  }

  it('signEnvelope + verifyEnvelope round-trip on canonical body', async () => {
    const { rgs } = build();
    const body = { roundId: 'r1', amount: 100, currency: 'EUR' };
    const sig = await rgs.signEnvelope(body);
    expect(await rgs.verifyEnvelope(body, sig)).toBe(true);
    // Reordering keys client-side must still verify (canonicalisation).
    const reordered = { currency: 'EUR', amount: 100, roundId: 'r1' };
    expect(await rgs.verifyEnvelope(reordered, sig)).toBe(true);
  });

  it('debit honours promo validator (valid)', async () => {
    const { rgs } = build({
      promoValidator: async () => ({ valid: true }),
    });
    const r = await rgs.debit(makeBet({ promoToken: 'OK', amountMc: 999_999 }));
    expect(r.ok).toBe(true);
  });

  it('debit rejects invalid promo token (no wallet hit)', async () => {
    const { rgs, wallet } = build({
      promoValidator: async () => ({ valid: false }),
    });
    const r = await rgs.debit(makeBet({ promoToken: 'BAD' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('AUTH_FAILED');
    const bal = await wallet.balance('p1', 'EUR');
    if (bal.ok) expect(bal.data.amountMc).toBe(10_000); // untouched
  });

  it('emitRoundEvent forwards to sink', async () => {
    const received: RoundEvent[] = [];
    const { rgs } = build({
      roundEventSink: async (e) => {
        received.push(e);
      },
    });
    const event: RoundEvent = {
      playerId: 'p1',
      roundId: 'r1',
      gameId: 'g',
      betUuid: 'uuid-1',
      winUuid: 'uuid-w1',
      elapsedMs: 45,
      complianceHash: 'a'.repeat(64),
      ts: new Date().toISOString(),
    };
    await rgs.emitRoundEvent(event);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it('emitRoundEvent is no-op when no sink configured', async () => {
    const { rgs } = build();
    await expect(
      rgs.emitRoundEvent({
        playerId: 'p1',
        roundId: 'r1',
        gameId: 'g',
        betUuid: 'b',
        elapsedMs: 10,
        complianceHash: 'h',
        ts: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });

  it('withDeadline triggers UPSTREAM_TIMEOUT on slow op', async () => {
    const { rgs } = build({ roundDeadlineMs: 30 });
    const slow = (): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, 500));
    await expect(rgs.withDeadline(slow)).rejects.toThrow(/UPSTREAM_TIMEOUT/);
  });

  it('withDeadline returns value on fast op', async () => {
    const { rgs } = build({ roundDeadlineMs: 1000 });
    const fast = (): Promise<number> =>
      new Promise((resolve) => setTimeout(() => resolve(42), 5));
    expect(await rgs.withDeadline(fast)).toBe(42);
  });

  it('walletId + signerScheme exposed for audit logs', () => {
    const { rgs } = build();
    expect(rgs.walletId).toBe('in-memory-mock');
    expect(rgs.signerScheme).toBe('hmac-sha256');
  });
});

// ─── End-to-end: full round lifecycle ─────────────────────────────────────

describe('W152 P2-11 — end-to-end round', () => {
  it('debit → credit → rollback chain leaves balance consistent', async () => {
    const wallet = new InMemoryMockWallet();
    wallet.seed('p1', 'EUR', 100_000);
    const rgs = new RgsProtocol({
      wallet,
      signer: new HmacSha256Signer(secret()),
    });

    const bet = makeBet({ transactionUuid: 'bet-1', amountMc: 1000 });
    const debit = await rgs.debit(bet);
    expect(debit.ok).toBe(true);

    const win: WinRequest = {
      transactionUuid: 'win-1',
      playerId: 'p1',
      currency: 'EUR',
      amountMc: 1500,
      gameId: 'g',
      roundId: 'round-1',
    };
    const credit = await rgs.credit(win);
    expect(credit.ok).toBe(true);
    if (credit.ok) expect(credit.data.amountMc).toBe(100_500); // -1000 +1500

    const rb = await rgs.rollback('bet-1');
    expect(rb.ok).toBe(true);
  });
});
