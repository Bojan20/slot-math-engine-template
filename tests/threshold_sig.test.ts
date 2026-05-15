/**
 * W152 Wave 22 — thresholdSig tests (Faza 8.6).
 */

import { describe, it, expect } from 'vitest';
import {
  canonicalisePayload,
  payloadHash,
  aggregateAndVerify,
  buildReleaseRequest,
  type JackpotPayload,
  type SignaturePart,
} from '../src/jackpot/thresholdSig.js';

const PAYLOAD: JackpotPayload = {
  jackpotId: 'wap-mini-001',
  amountMinor: 1_000_00,
  currency: 'EUR',
  payoutRequestId: 'req-2026-05-15-001',
  recipientOperator: 'op-alpha',
  cycleEpoch: 42,
};

function makeSig(signerId: string): SignaturePart {
  return {
    signerId,
    signatureHex: 'a'.repeat(128),
    signedAtUtc: '2026-05-15T03:00:00Z',
  };
}

describe('canonicalisePayload', () => {
  it('produces deterministic JSON', () => {
    const a = canonicalisePayload(PAYLOAD);
    const b = canonicalisePayload({ ...PAYLOAD });
    expect(a).toBe(b);
  });
  it('keys are sorted alphabetically', () => {
    const c = canonicalisePayload(PAYLOAD);
    expect(c).toBe(
      '{"amountMinor":100000,"currency":"EUR","cycleEpoch":42,"jackpotId":"wap-mini-001","payoutRequestId":"req-2026-05-15-001","recipientOperator":"op-alpha"}',
    );
  });
});

describe('payloadHash', () => {
  it('returns 64-char hex', () => {
    const h = payloadHash(PAYLOAD);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('deterministic', () => {
    expect(payloadHash(PAYLOAD)).toBe(payloadHash({ ...PAYLOAD }));
  });
  it('changes with any field', () => {
    const a = payloadHash(PAYLOAD);
    const b = payloadHash({ ...PAYLOAD, cycleEpoch: 43 });
    expect(a).not.toBe(b);
  });
});

describe('aggregateAndVerify — config guards', () => {
  it('rejects t > n', () => {
    expect(() =>
      aggregateAndVerify(PAYLOAD, [], { t: 5, n: 3 }),
    ).toThrow(RangeError);
  });
  it('rejects t < 1', () => {
    expect(() =>
      aggregateAndVerify(PAYLOAD, [], { t: 0, n: 3 }),
    ).toThrow(RangeError);
  });
  it('rejects n < 1', () => {
    expect(() =>
      aggregateAndVerify(PAYLOAD, [], { t: 1, n: 0 }),
    ).toThrow(RangeError);
  });
  it('rejects non-integer t/n', () => {
    expect(() =>
      aggregateAndVerify(PAYLOAD, [], { t: 1.5, n: 3 }),
    ).toThrow(RangeError);
  });
});

describe('aggregateAndVerify — replay detection', () => {
  it('throws on duplicate signerId', () => {
    expect(() =>
      aggregateAndVerify(PAYLOAD, [makeSig('A'), makeSig('A')], { t: 1, n: 3 }),
    ).toThrow(/duplicate signerId/);
  });
});

describe('aggregateAndVerify — happy path', () => {
  it('passes when ≥ t valid signatures', () => {
    const v = aggregateAndVerify(
      PAYLOAD,
      [makeSig('A'), makeSig('B'), makeSig('C')],
      { t: 2, n: 3 },
    );
    expect(v.satisfied).toBe(true);
    expect(v.validSignatureCount).toBe(3);
  });
  it('fails when < t valid', () => {
    const v = aggregateAndVerify(PAYLOAD, [makeSig('A')], { t: 2, n: 3 });
    expect(v.satisfied).toBe(false);
    expect(v.reason).toMatch(/Only 1\/2/);
  });
  it('counts only verified signatures', () => {
    const v = aggregateAndVerify(
      PAYLOAD,
      [makeSig('A'), makeSig('B')],
      {
        t: 2,
        n: 3,
        verifySignature: (id) => id === 'A', // only A verifies
      },
    );
    expect(v.satisfied).toBe(false);
    expect(v.validSignerIds).toEqual(['A']);
    expect(v.invalidSignerIds).toEqual(['B']);
  });
});

describe('aggregateAndVerify — payloadHash echoed in verdict', () => {
  it('verdict includes payloadHash hex', () => {
    const v = aggregateAndVerify(PAYLOAD, [makeSig('A')], { t: 1, n: 1 });
    expect(v.payloadHashHex).toBe(payloadHash(PAYLOAD));
  });
});

describe('buildReleaseRequest', () => {
  it('bundles payload + signatures + verdict', () => {
    const req = buildReleaseRequest(
      PAYLOAD,
      [makeSig('A'), makeSig('B')],
      { t: 2, n: 3 },
    );
    expect(req.payload).toEqual(PAYLOAD);
    expect(req.signatures).toHaveLength(2);
    expect(req.verdict.satisfied).toBe(true);
    expect(req.builtAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('Custom verifier integration', () => {
  it('rejects all signatures when verifier returns false', () => {
    const v = aggregateAndVerify(
      PAYLOAD,
      [makeSig('A'), makeSig('B'), makeSig('C')],
      { t: 1, n: 3, verifySignature: () => false },
    );
    expect(v.satisfied).toBe(false);
    expect(v.validSignerIds).toEqual([]);
    expect(v.invalidSignerIds).toEqual(['A', 'B', 'C']);
  });
  it('verifier sees correct hash', () => {
    let observed = '';
    aggregateAndVerify(PAYLOAD, [makeSig('A')], {
      t: 1,
      n: 1,
      verifySignature: (_id, hash) => {
        observed = hash;
        return true;
      },
    });
    expect(observed).toBe(payloadHash(PAYLOAD));
  });
});
