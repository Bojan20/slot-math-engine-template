/**
 * W152 Wave 15 — Faza 14.2 — Continuous certification daily dossier tests.
 *
 * The `scripts/cert-daily.mjs` script is the long-term no-silent-drift
 * guardian: it re-runs every reference fixture at a fixed seed + spin
 * count and hashes the canonical concatenation of per-fixture rows into
 * the daily SHA-256 fingerprint. The dossier feeds three artifacts:
 *
 *   * `<UTC>.json` — full per-fixture rows + drift slice vs golden.
 *   * `HEAD.json` — pointer to today's dossier.
 *   * `CHAIN.json` — append-only ledger { date, sha256, prevSha256 }.
 *
 * This spec smoke-tests the dossier post-conditions without re-running
 * the script (we expect the script to be invoked manually or via cron;
 * unit tests stay in the second-budget).
 *
 * We exercise:
 *   * HEAD.json exists and parses.
 *   * Required fields are present.
 *   * The fixture row keys cover at least the standard 20 reference
 *     game IDs (regression guard against accidental skips).
 *   * SHA-256 matches the canonical recomputation of fixture rows.
 *   * CHAIN.json grows monotonically — latest entry's prevSha256 either
 *     matches the previous entry's sha256 or is null on first row.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const HEAD = join(REPO_ROOT, 'reports', 'acceptance', 'cert-daily', 'HEAD.json');
const CHAIN = join(REPO_ROOT, 'reports', 'acceptance', 'cert-daily', 'CHAIN.json');

const haveHead = existsSync(HEAD);

interface Dossier {
  schemaVersion: string;
  generatedAtUtc: string;
  engineCommit: string | null;
  seed: number;
  spins: number;
  sha256: string;
  fixtures: Record<
    string,
    {
      rtp?: number;
      hitRate?: number;
      maxWinX?: number;
      features?: Record<string, number | null>;
      error?: string;
    }
  >;
  drift: Record<string, unknown>;
  driftDetected: boolean;
}

function loadHead(): Dossier | null {
  return haveHead ? (JSON.parse(readFileSync(HEAD, 'utf-8')) as Dossier) : null;
}

function canonicalRow(id: string, row: Dossier['fixtures'][string]): string {
  if (row.error || row.rtp === undefined) {
    return JSON.stringify({
      id,
      rtp: row.rtp,
      hitRate: row.hitRate,
      maxWinX: row.maxWinX,
      features: row.features,
    });
  }
  const featuresOrdered = Object.fromEntries(
    Object.keys(row.features ?? {})
      .sort()
      .map((k) => [k, (row.features as Record<string, number | null>)[k]]),
  );
  return JSON.stringify({
    id,
    rtp: row.rtp,
    hitRate: row.hitRate,
    maxWinX: row.maxWinX,
    features: featuresOrdered,
  });
}

describe.skipIf(!haveHead)(
  'Faza 14.2 — cert-daily dossier (HEAD.json post-conditions)',
  () => {
    it('HEAD.json parses + carries the required fields', () => {
      const d = loadHead()!;
      expect(d.schemaVersion).toBe('1.0.0');
      expect(typeof d.generatedAtUtc).toBe('string');
      expect(typeof d.seed).toBe('number');
      expect(typeof d.spins).toBe('number');
      expect(typeof d.sha256).toBe('string');
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof d.driftDetected).toBe('boolean');
    });

    it('seed pinned to 12345 + spins ≥ 1', () => {
      const d = loadHead()!;
      expect(d.seed).toBe(12345);
      expect(d.spins).toBeGreaterThanOrEqual(1);
    });

    it('fixture map covers at least 20 reference games', () => {
      const d = loadHead()!;
      const ok = Object.entries(d.fixtures).filter(([, v]) => !v.error);
      expect(ok.length).toBeGreaterThanOrEqual(20);
    });

    it('every successful fixture row carries rtp + hitRate + maxWinX + features', () => {
      const d = loadHead()!;
      for (const [id, row] of Object.entries(d.fixtures)) {
        if (row.error) continue;
        expect(typeof row.rtp, `rtp for ${id}`).toBe('number');
        expect(typeof row.hitRate, `hitRate for ${id}`).toBe('number');
        expect(typeof row.maxWinX, `maxWinX for ${id}`).toBe('number');
        expect(row.features, `features for ${id}`).toBeDefined();
      }
    });

    it('SHA-256 fingerprint matches canonical recomputation', () => {
      const d = loadHead()!;
      const ids = Object.keys(d.fixtures).sort();
      const input = ids.map((id) => canonicalRow(id, d.fixtures[id])).join('\n');
      const recomputed = createHash('sha256').update(input).digest('hex');
      expect(recomputed).toBe(d.sha256);
    });

    it('drift slice exists for every fixture id', () => {
      const d = loadHead()!;
      for (const id of Object.keys(d.fixtures)) {
        expect(d.drift, `drift entry for ${id}`).toHaveProperty(id);
      }
    });
  },
);

describe.skipIf(!haveHead)(
  'Faza 14.2 — CHAIN.json append-only ledger',
  () => {
    it('chain file exists alongside HEAD', () => {
      expect(existsSync(CHAIN)).toBe(true);
    });

    it('every chain entry has date + sha256 + prevSha256', () => {
      const chain = JSON.parse(readFileSync(CHAIN, 'utf-8')) as Array<{
        date: string;
        sha256: string;
        prevSha256: string | null;
        driftDetected: boolean;
      }>;
      expect(Array.isArray(chain)).toBe(true);
      expect(chain.length).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < chain.length; i++) {
        const e = chain[i];
        expect(typeof e.date).toBe('string');
        expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
        if (i === 0) {
          expect(e.prevSha256).toBeNull();
        } else {
          expect(e.prevSha256).toBe(chain[i - 1].sha256);
        }
      }
    });

    it('latest chain entry matches HEAD.json sha256', () => {
      const chain = JSON.parse(readFileSync(CHAIN, 'utf-8')) as Array<{
        sha256: string;
      }>;
      const head = loadHead()!;
      expect(chain[chain.length - 1].sha256).toBe(head.sha256);
    });
  },
);

describe('Faza 14.2 cert-daily smoke (auto-skip if HEAD missing)', () => {
  it.skipIf(haveHead)(
    'HEAD.json missing — run `node scripts/cert-daily.mjs`',
    () => {
      expect(true).toBe(true);
    },
  );
});
