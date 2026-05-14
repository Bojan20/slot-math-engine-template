import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';

import {
  evaluateCompliance,
  renderCompliancePdf,
  type ComplianceCheckInput,
} from '../src/report/compliancePdf.js';
import { PROFILES } from '../src/jurisdiction/profiles.js';
import type { JurisdictionProfile } from '../src/jurisdiction/types.js';

function profile(id: string): JurisdictionProfile {
  const p = PROFILES.get(id);
  if (!p) throw new Error(`PROFILES missing ${id}`);
  return p;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const RTP_98 = 0.98;
const RTP_92 = 0.92;
const RTP_85 = 0.85;

const baseInput = (overrides: Partial<ComplianceCheckInput> = {}): ComplianceCheckInput => ({
  game: { name: 'TestSlot', version: '1.0.0', maxWin: 10_000 },
  results: { observedRTP: RTP_98, rtpPercent: 98.0 },
  simulation: { spins: 1_000_000, seed: 12345 },
  enforcement: {
    autoplayBlocked: true,
    turboBlocked: true,
    bonusWageringCapX: 10,
    maxStakePerSpin: 5.0,
    netPositionEmitted: true,
    falseWinCelebrationGuard: true,
    minSpinDurationMs: 2500,
  },
  features: [],
  ...overrides,
});

// ─── evaluateCompliance — UKGC ───────────────────────────────────────────────

describe('evaluateCompliance — UKGC', () => {
  const j = profile('UKGC');

  it('PASS when every gate is healthy', () => {
    const r = evaluateCompliance(baseInput(), j);
    expect(r.overallStatus).toBe('PASS');
    expect(r.failCount).toBe(0);
    // RTP, prohibitedFeatures, min-spin, autoplay, turbo, bonus, stake, LDW,
    // session-time, near-miss, plus max-win-cap-N/A = 11 total checks.
    expect(r.totalCount).toBeGreaterThanOrEqual(10);
  });

  it('FAILs the RTP band check when RTP < band lower bound', () => {
    const r = evaluateCompliance(
      baseInput({ results: { observedRTP: RTP_85, rtpPercent: 85.0 } }),
      j
    );
    expect(r.failCount).toBeGreaterThan(0);
    const rtp = r.checks.find((c) => c.id === 'rtp_band');
    expect(rtp?.status).toBe('FAIL');
  });

  it('FAILs when a prohibited feature is used', () => {
    const r = evaluateCompliance(
      baseInput({ features: [{ id: 'buy_feature' }] }),
      j
    );
    const ph = r.checks.find((c) => c.id === 'prohibited_features');
    expect(ph?.status).toBe('FAIL');
    expect(ph?.observed).toContain('buy_feature');
    expect(r.overallStatus).toBe('FAIL');
  });

  it('WARNs when enforcement metadata is absent', () => {
    const r = evaluateCompliance(
      { game: { maxWin: 10_000 }, results: { observedRTP: RTP_98 } },
      j
    );
    expect(r.warnCount).toBeGreaterThan(0);
    expect(r.overallStatus).toBe('WARN');
  });

  it('reports max-win-cap as N/A (UKGC is uncapped)', () => {
    const r = evaluateCompliance(baseInput(), j);
    const cap = r.checks.find((c) => c.id === 'max_win_cap');
    expect(cap?.status).toBe('N/A');
  });

  it('FAILs auto-play check when engine reports autoplay enabled', () => {
    const r = evaluateCompliance(
      baseInput({ enforcement: { ...baseInput().enforcement, autoplayBlocked: false } }),
      j
    );
    const ap = r.checks.find((c) => c.id === 'autoplay_prohibition');
    expect(ap?.status).toBe('FAIL');
  });

  it('citation reference is the regulator URL', () => {
    const r = evaluateCompliance(baseInput(), j);
    const rtp = r.checks.find((c) => c.id === 'rtp_band');
    expect(rtp?.citation).toBe(j.regulatorUrl);
  });
});

// ─── evaluateCompliance — MGA ────────────────────────────────────────────────

describe('evaluateCompliance — MGA', () => {
  const j = profile('MGA');
  it('PASS for an MGA-shaped sim report', () => {
    const r = evaluateCompliance(
      baseInput({
        results: { observedRTP: RTP_92, rtpPercent: 92.0 },
        enforcement: {
          autoplayBlocked: true,
          turboBlocked: false, // MGA does not prohibit turbo
          netPositionEmitted: true,
        },
      }),
      j
    );
    expect(r.jurisdiction).toBe('MGA');
    expect(r.failCount).toBe(0);
  });
});

// ─── evaluateCompliance — ADM (uncapped RTP top but capped bottom) ───────────

describe('evaluateCompliance — ADM', () => {
  const j = profile('ADM');
  it('produces deterministic generatedAt when caller supplies now', () => {
    const r1 = evaluateCompliance(baseInput(), j, { now: '2026-05-15T00:00:00Z' });
    const r2 = evaluateCompliance(baseInput(), j, { now: '2026-05-15T00:00:00Z' });
    expect(r1.generatedAt).toBe('2026-05-15T00:00:00Z');
    expect(r2.generatedAt).toBe(r1.generatedAt);
  });
});

// ─── determinism / shape stability ───────────────────────────────────────────

describe('evaluateCompliance — determinism', () => {
  it('same input → identical report (no clock, no RNG)', () => {
    const a = evaluateCompliance(baseInput(), profile("UKGC"), { now: 'X' });
    const b = evaluateCompliance(baseInput(), profile("UKGC"), { now: 'X' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('tally adds up (pass + fail + warn + n/a === total)', () => {
    const r = evaluateCompliance(baseInput(), profile("UKGC"));
    expect(r.passCount + r.failCount + r.warnCount + r.naCount).toBe(r.totalCount);
  });
});

// ─── PDF rendering — Buffer path ─────────────────────────────────────────────

describe('renderCompliancePdf — Buffer', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = (await renderCompliancePdf(baseInput(), profile("UKGC"))) as Buffer;
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
    // PDF magic bytes
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // Each PDF must terminate with %%EOF
    const tail = buf.subarray(Math.max(0, buf.length - 32)).toString('ascii');
    expect(tail).toContain('%%EOF');
  });

  // Helper: PDFKit hex-encodes show-strings as `<HEX>` inside TJ ops. Pull
  // every chunk out and concatenate (kerning adjustments split chunks, so
  // we MUST aggregate rather than search for a single literal).
  const extractAllPdfText = (buf: Buffer): string => {
    const t = buf.toString('latin1');
    const chunks: string[] = [];
    for (const m of t.matchAll(/<([0-9a-fA-F]+)>/g)) {
      const hex = m[1];
      if (hex.length % 2 !== 0) continue;
      const bytes = hex.match(/.{2}/g);
      if (!bytes) continue;
      chunks.push(bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join(''));
    }
    return chunks.join('');
  };

  it('PDF text content contains jurisdiction id and overall verdict', async () => {
    const buf = (await renderCompliancePdf(baseInput(), profile('UKGC'))) as Buffer;
    const text = extractAllPdfText(buf);
    expect(text).toContain('UKGC');
    expect(text).toContain('Overall:');
  });

  it('renders FAIL banner when RTP band is violated', async () => {
    const buf = (await renderCompliancePdf(
      baseInput({ results: { observedRTP: RTP_85, rtpPercent: 85.0 } }),
      profile('UKGC')
    )) as Buffer;
    const text = extractAllPdfText(buf);
    expect(text).toContain('FAIL');
  });
});

// ─── PDF rendering — stream path ─────────────────────────────────────────────

describe('renderCompliancePdf — stream', () => {
  it('writes to a Writable stream and completes', async () => {
    const chunks: Buffer[] = [];
    const pt = new PassThrough();
    pt.on('data', (c) => chunks.push(Buffer.from(c)));
    const done = new Promise<void>((resolve, reject) => {
      pt.on('end', resolve);
      pt.on('error', reject);
    });
    await renderCompliancePdf(baseInput(), profile("UKGC"), { output: pt });
    pt.end();
    await done;
    const buf = Buffer.concat(chunks);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
