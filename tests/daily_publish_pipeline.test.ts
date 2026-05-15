/**
 * W152 Wave 24 — dailyPublishPipeline tests (Faza 13.11).
 */

import { describe, it, expect } from 'vitest';
import {
  sha256Hex,
  verifyChainIntegrity,
  publishDossier,
  publishUnpublishedSince,
  type ChainLedger,
} from '../src/cert/dailyPublishPipeline.js';

describe('sha256Hex', () => {
  it('returns 64-char lowercase hex', () => {
    const h = sha256Hex('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('deterministic', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
  });
  it('changes with input', () => {
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
  });
});

describe('verifyChainIntegrity', () => {
  it('passes empty chain', () => {
    expect(verifyChainIntegrity({ chain: [] }).ok).toBe(true);
  });
  it('passes single-entry chain with prevSha256=null', () => {
    expect(
      verifyChainIntegrity({
        chain: [{ date: '2026-01-01', sha256: 'a'.repeat(64), prevSha256: null }],
      }).ok,
    ).toBe(true);
  });
  it('passes 3-entry valid chain', () => {
    const ledger: ChainLedger = {
      chain: [
        { date: '2026-01-01', sha256: 'a'.repeat(64), prevSha256: null },
        { date: '2026-01-02', sha256: 'b'.repeat(64), prevSha256: 'a'.repeat(64) },
        { date: '2026-01-03', sha256: 'c'.repeat(64), prevSha256: 'b'.repeat(64) },
      ],
    };
    expect(verifyChainIntegrity(ledger).ok).toBe(true);
  });
  it('detects broken link', () => {
    const ledger: ChainLedger = {
      chain: [
        { date: '2026-01-01', sha256: 'a'.repeat(64), prevSha256: null },
        { date: '2026-01-02', sha256: 'b'.repeat(64), prevSha256: 'WRONG' },
      ],
    };
    const r = verifyChainIntegrity(ledger);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(1);
    expect(r.reason).toMatch(/expected/);
  });
  it('detects non-null prevSha256 on first entry', () => {
    const ledger: ChainLedger = {
      chain: [{ date: '2026-01-01', sha256: 'a'.repeat(64), prevSha256: 'b'.repeat(64) }],
    };
    expect(verifyChainIntegrity(ledger).ok).toBe(false);
  });
});

describe('publishDossier', () => {
  const dossier = '{"hello":"world"}';
  const dossierHash = sha256Hex(dossier);
  const validLedger: ChainLedger = {
    chain: [{ date: '2026-01-01', sha256: dossierHash, prevSha256: null }],
  };

  it('publishes successfully when integrity passes', async () => {
    const calls: string[] = [];
    const v = await publishDossier(dossier, '2026-01-01', validLedger, {
      publish: async (json, key) => {
        calls.push(key);
        return { url: `https://x/${key}` };
      },
    });
    expect(v.publishedUrl).toBe('https://x/cert-daily/2026-01-01.json');
    expect(v.integrityOk).toBe(true);
    expect(v.error).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('respects custom keyPrefix', async () => {
    const v = await publishDossier(dossier, '2026-01-01', validLedger, {
      keyPrefix: 'audit/',
      publish: async (_json, key) => ({ url: key }),
    });
    expect(v.publishedUrl).toBe('audit/2026-01-01.json');
  });

  it('refuses publish on hash chain failure (strict)', async () => {
    const ledger: ChainLedger = {
      chain: [{ date: '2026-01-01', sha256: 'a'.repeat(64), prevSha256: 'WRONG' }],
    };
    const v = await publishDossier(dossier, '2026-01-01', ledger, {
      publish: async () => ({ url: 'x' }),
      strictIntegrityCheck: true,
    });
    expect(v.publishedUrl).toBeNull();
    expect(v.integrityOk).toBe(false);
    expect(v.error).toMatch(/Hash chain integrity/);
  });

  it('detects hash mismatch between dossier and ledger', async () => {
    const wrongLedger: ChainLedger = {
      chain: [{ date: '2026-01-01', sha256: 'WRONG'.repeat(13).slice(0, 64), prevSha256: null }],
    };
    const v = await publishDossier(dossier, '2026-01-01', wrongLedger, {
      publish: async () => ({ url: 'x' }),
    });
    expect(v.publishedUrl).toBeNull();
    expect(v.error).toMatch(/Dossier hash/);
  });

  it('records error from publish callback', async () => {
    const v = await publishDossier(dossier, '2026-01-01', validLedger, {
      publish: async () => {
        throw new Error('S3 5xx');
      },
    });
    expect(v.publishedUrl).toBeNull();
    expect(v.error).toBe('S3 5xx');
  });
});

describe('publishUnpublishedSince', () => {
  const ledger: ChainLedger = {
    chain: [
      { date: '2026-01-01', sha256: sha256Hex('d1'), prevSha256: null },
      { date: '2026-01-02', sha256: sha256Hex('d2'), prevSha256: sha256Hex('d1') },
      { date: '2026-01-03', sha256: sha256Hex('d3'), prevSha256: sha256Hex('d2') },
    ],
  };
  const dossierLoader = async (date: string): Promise<string> => {
    const map: Record<string, string> = {
      '2026-01-01': 'd1',
      '2026-01-02': 'd2',
      '2026-01-03': 'd3',
    };
    return map[date];
  };

  it('publishes all when bookmark is null', async () => {
    const calls: string[] = [];
    const verdicts = await publishUnpublishedSince(dossierLoader, ledger, null, {
      publish: async (_json, key) => {
        calls.push(key);
        return { url: key };
      },
    });
    expect(verdicts).toHaveLength(3);
    expect(calls).toHaveLength(3);
  });

  it('publishes only new entries since bookmark', async () => {
    const verdicts = await publishUnpublishedSince(dossierLoader, ledger, '2026-01-01', {
      publish: async (_json, key) => ({ url: key }),
    });
    expect(verdicts).toHaveLength(2); // 01-02 and 01-03
  });

  it('publishes nothing when bookmark is at chain head', async () => {
    const verdicts = await publishUnpublishedSince(dossierLoader, ledger, '2026-01-03', {
      publish: async () => ({ url: 'x' }),
    });
    expect(verdicts).toHaveLength(0);
  });

  it('stops on first error in strict mode', async () => {
    let callCount = 0;
    const verdicts = await publishUnpublishedSince(dossierLoader, ledger, null, {
      publish: async () => {
        callCount += 1;
        if (callCount === 2) throw new Error('S3 down');
        return { url: 'x' };
      },
      strictIntegrityCheck: true,
    });
    expect(verdicts.length).toBeGreaterThanOrEqual(1);
    expect(verdicts[verdicts.length - 1].error).toBeDefined();
  });
});
