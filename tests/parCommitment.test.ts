/**
 * W152 Wave 40 — PAR Sheet Commitment tests (Kimi K9 acceptance).
 */

import { describe, it, expect } from 'vitest';
import {
  buildParWitnessRoot,
  buildParAttestation,
  attestationCanonicalHash,
  verifyAttestationIntegrity,
  auditorVerify,
} from '../src/zkproof/parCommitment.js';

const SAMPLE_IR = {
  schema_version: '1.0.0',
  meta: { id: 'g', name: 'G', version: '1.0.0', theme_tags: [] },
  topology: { kind: 'rectangular', reels: 5, rows: 3 },
  symbols: [
    { id: 'A', name: 'A', kind: 'lp' },
    { id: 'B', name: 'B', kind: 'hp' },
  ],
  reels: { mode: 'weighted', base: [{ A: 5, B: 3 }, { A: 5, B: 3 }, { A: 5, B: 3 }, { A: 5, B: 3 }, { A: 5, B: 3 }] },
  paytable: { A: { '3': 1, '4': 5, '5': 20 }, B: { '3': 5, '4': 20, '5': 100 } },
  evaluation: { kind: 'lines', paylines: [[1, 1, 1, 1, 1]], direction: 'ltr', min_match: 3 },
  features: [],
  rng: { kind: 'mulberry32', default_seed: 1 },
  bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
  limits: { target_rtp: 0.96, rtp_tolerance: 0.01, max_win_x: 5000, win_cap_apply: 'per_spin', target_volatility: 'medium', hit_freq_target: 0.3 },
  compliance: { jurisdictions: ['MGA'], rtp_range_required: [0.92, 0.99], max_win_cap_required: 5000, near_miss_rule: 'must_be_random', ldw_disclosure: true, session_time_display: true },
  rtp_allocation: { base_game: 1, free_spins: 0, hold_and_win: 0, jackpot: 0, tolerance: 0.01 },
};

function deepClone(o: unknown): unknown {
  return JSON.parse(JSON.stringify(o));
}

describe('PAR Commitment v1.0 — Wave 40 / Kimi K9', () => {
  describe('buildParWitnessRoot — Merkle root', () => {
    it('produces 64-char SHA-256 hex', () => {
      const root = buildParWitnessRoot(SAMPLE_IR);
      expect(root).toMatch(/^[a-f0-9]{64}$/);
    });

    it('deterministic — same IR produces identical root', () => {
      const a = buildParWitnessRoot(SAMPLE_IR);
      const b = buildParWitnessRoot(SAMPLE_IR);
      expect(a).toBe(b);
    });

    it('canonical — key order in IR does not affect root', () => {
      const reordered = {
        rtp_allocation: SAMPLE_IR.rtp_allocation,
        compliance: SAMPLE_IR.compliance,
        limits: SAMPLE_IR.limits,
        bet: SAMPLE_IR.bet,
        rng: SAMPLE_IR.rng,
        features: SAMPLE_IR.features,
        evaluation: SAMPLE_IR.evaluation,
        paytable: SAMPLE_IR.paytable,
        reels: SAMPLE_IR.reels,
        symbols: SAMPLE_IR.symbols,
        topology: SAMPLE_IR.topology,
        meta: SAMPLE_IR.meta,
        schema_version: SAMPLE_IR.schema_version,
      };
      expect(buildParWitnessRoot(reordered)).toBe(buildParWitnessRoot(SAMPLE_IR));
    });

    it('detects tampering — change one paytable entry → different root', () => {
      const tampered = deepClone(SAMPLE_IR) as typeof SAMPLE_IR;
      tampered.paytable.A['5'] = 999;
      expect(buildParWitnessRoot(tampered)).not.toBe(buildParWitnessRoot(SAMPLE_IR));
    });

    it('detects tampering — change one reel weight → different root', () => {
      const tampered = deepClone(SAMPLE_IR) as typeof SAMPLE_IR;
      tampered.reels.base[0].A = 99;
      expect(buildParWitnessRoot(tampered)).not.toBe(buildParWitnessRoot(SAMPLE_IR));
    });

    it('rejects non-object input', () => {
      expect(() => buildParWitnessRoot(null)).toThrow(/object/);
      expect(() => buildParWitnessRoot('string' as unknown)).toThrow(/object/);
    });
  });

  describe('buildParAttestation', () => {
    it('produces a complete attestation with canonicalHash', () => {
      const att = buildParAttestation({
        ir: SAMPLE_IR,
        publishedRtp: 0.96,
        publishedHitFreq: 0.30,
        publishedMaxWin: 5000,
        jurisdictions: ['UKGC', 'MGA'],
        gameId: 'demo-game-1',
        gameVersion: '1.0.0',
      });
      expect(att.schema).toBe('par-commitment/v1');
      expect(att.parWitnessRoot).toMatch(/^[a-f0-9]{64}$/);
      expect(att.canonicalHash).toMatch(/^[a-f0-9]{64}$/);
      expect(att.jurisdictions).toEqual(['MGA', 'UKGC']); // sorted
      expect(att.publishedRtp).toBe(0.96);
    });

    it('canonicalHash is deterministic for same input', () => {
      const fixedTime = '2026-05-15T22:00:00.000Z';
      const a = buildParAttestation({
        ir: SAMPLE_IR, publishedRtp: 0.96, publishedHitFreq: 0.3, publishedMaxWin: 5000,
        jurisdictions: ['MGA'], gameId: 'g', gameVersion: '1.0',
        attestedAtUtc: fixedTime,
      });
      const b = buildParAttestation({
        ir: SAMPLE_IR, publishedRtp: 0.96, publishedHitFreq: 0.3, publishedMaxWin: 5000,
        jurisdictions: ['MGA'], gameId: 'g', gameVersion: '1.0',
        attestedAtUtc: fixedTime,
      });
      expect(a.canonicalHash).toBe(b.canonicalHash);
      expect(a.parWitnessRoot).toBe(b.parWitnessRoot);
    });

    it('rejects out-of-range publishedRtp', () => {
      expect(() => buildParAttestation({
        ir: SAMPLE_IR, publishedRtp: -0.1, publishedHitFreq: 0.3, publishedMaxWin: 5000,
        jurisdictions: ['MGA'], gameId: 'g', gameVersion: '1.0',
      })).toThrow(/publishedRtp/);
      expect(() => buildParAttestation({
        ir: SAMPLE_IR, publishedRtp: 3.0, publishedHitFreq: 0.3, publishedMaxWin: 5000,
        jurisdictions: ['MGA'], gameId: 'g', gameVersion: '1.0',
      })).toThrow(/publishedRtp/);
    });

    it('rejects empty jurisdictions', () => {
      expect(() => buildParAttestation({
        ir: SAMPLE_IR, publishedRtp: 0.96, publishedHitFreq: 0.3, publishedMaxWin: 5000,
        jurisdictions: [], gameId: 'g', gameVersion: '1.0',
      })).toThrow(/jurisdictions/);
    });
  });

  describe('verifyAttestationIntegrity', () => {
    it('PASS on freshly built attestation', () => {
      const att = buildParAttestation({
        ir: SAMPLE_IR, publishedRtp: 0.96, publishedHitFreq: 0.3, publishedMaxWin: 5000,
        jurisdictions: ['MGA'], gameId: 'g', gameVersion: '1.0',
      });
      expect(verifyAttestationIntegrity(att)).toBe(true);
    });

    it('FAIL on tampered attestation field', () => {
      const att = buildParAttestation({
        ir: SAMPLE_IR, publishedRtp: 0.96, publishedHitFreq: 0.3, publishedMaxWin: 5000,
        jurisdictions: ['MGA'], gameId: 'g', gameVersion: '1.0',
      });
      const tampered = { ...att, publishedRtp: 0.99 }; // canonicalHash now stale
      expect(verifyAttestationIntegrity(tampered)).toBe(false);
    });
  });

  describe('auditorVerify', () => {
    const att = buildParAttestation({
      ir: SAMPLE_IR, publishedRtp: 0.96, publishedHitFreq: 0.3, publishedMaxWin: 5000,
      jurisdictions: ['MGA'], gameId: 'g', gameVersion: '1.0',
    });
    const signed = {
      attestation: att,
      signatureHex: 'ab'.repeat(64),
      algorithm: 'ECDSA_SHA_256',
    };

    it('PASS when auditor IR + RTP both match', () => {
      const r = auditorVerify({
        signedAttestation: signed,
        auditorIrWitness: SAMPLE_IR,
        auditorRtpEstimate: 0.961,
      });
      expect(r.verdict).toBe('PASS');
      expect(r.rootMatches).toBe(true);
      expect(r.rtpMatches).toBe(true);
    });

    it('FAIL when auditor IR has been tampered (different reel weights)', () => {
      const tampered = deepClone(SAMPLE_IR) as typeof SAMPLE_IR;
      tampered.reels.base[2].B = 99;
      const r = auditorVerify({
        signedAttestation: signed,
        auditorIrWitness: tampered,
        auditorRtpEstimate: 0.96,
      });
      expect(r.verdict).toBe('FAIL');
      expect(r.rootMatches).toBe(false);
      expect(r.notes.some((n) => n.includes('Merkle root mismatch'))).toBe(true);
    });

    it('FAIL when auditor RTP differs > tolerance', () => {
      const r = auditorVerify({
        signedAttestation: signed,
        auditorIrWitness: SAMPLE_IR,
        auditorRtpEstimate: 0.92, // 4pp off
        rtpToleranceAbsolute: 0.005,
      });
      expect(r.verdict).toBe('FAIL');
      expect(r.rootMatches).toBe(true);
      expect(r.rtpMatches).toBe(false);
      expect(r.notes.some((n) => n.includes('RTP mismatch'))).toBe(true);
    });

    it('honors custom rtpToleranceAbsolute', () => {
      const strict = auditorVerify({
        signedAttestation: signed,
        auditorIrWitness: SAMPLE_IR,
        auditorRtpEstimate: 0.962,
        rtpToleranceAbsolute: 0.001,
      });
      expect(strict.verdict).toBe('FAIL'); // 0.002 > 0.001
      const lenient = auditorVerify({
        signedAttestation: signed,
        auditorIrWitness: SAMPLE_IR,
        auditorRtpEstimate: 0.962,
        rtpToleranceAbsolute: 0.01,
      });
      expect(lenient.verdict).toBe('PASS');
    });
  });

  describe('attestationCanonicalHash', () => {
    it('produces 64-char hex', () => {
      const partial = {
        schema: 'par-commitment/v1' as const,
        parWitnessRoot: 'a'.repeat(64),
        publishedRtp: 0.96,
        publishedHitFreq: 0.3,
        publishedMaxWin: 5000,
        jurisdictions: ['MGA'],
        gameId: 'g',
        gameVersion: '1.0',
        attestedAtUtc: '2026-05-15T00:00:00Z',
      };
      const h = attestationCanonicalHash(partial);
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
