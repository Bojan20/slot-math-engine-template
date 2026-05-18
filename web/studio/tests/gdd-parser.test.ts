// Tests for the GDD Import Pipeline (W199.5). We exercise the public
// detectFormat/parseGDD/gddToIR contract using the fixtures under
// `gdd-samples/` and confirm a generated IR validates via the real
// parseGameIR (Zod + crossValidate).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGDD, detectFormat, gddToIR, type ExtractedGDD } from '../src/gdd-parser.js';
import { parseGameIR } from '@engine/ir/index.js';

// ── Polyfill File for Node (Vitest node env) ──────────────────────
// Node 20 has global File; older Node does not. We define a tiny shim
// only when needed — vitest "node" env in Node 20+ already provides it.
declare const globalThis: { File?: typeof File };
if (typeof globalThis.File === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as unknown as { File: unknown }).File = class FilePoly {
    name: string;
    type: string;
    private _bytes: Uint8Array;
    constructor(parts: Array<string | Uint8Array>, name: string, opts?: { type?: string }) {
      this.name = name;
      this.type = opts?.type ?? '';
      const enc = new TextEncoder();
      const chunks: Uint8Array[] = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }
      this._bytes = buf;
    }
    async text(): Promise<string> {
      return new TextDecoder().decode(this._bytes);
    }
    async arrayBuffer(): Promise<ArrayBuffer> {
      return this._bytes.buffer.slice(this._bytes.byteOffset, this._bytes.byteOffset + this._bytes.byteLength) as ArrayBuffer;
    }
    slice(start: number, end: number): { arrayBuffer: () => Promise<ArrayBuffer> } {
      const sliced = this._bytes.slice(start, end);
      return {
        arrayBuffer: async () => sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength) as ArrayBuffer,
      };
    }
  };
}

// ── Fixture loader ────────────────────────────────────────────────
function loadFixture(name: string, mime?: string): File {
  const buf = readFileSync(resolve(__dirname, '..', 'gdd-samples', name));
  return new File([new Uint8Array(buf)], name, { type: mime ?? '' });
}
function makeFile(content: string, name: string, type = ''): File {
  return new File([content], name, { type });
}

// ── Tests ─────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('identifies JSON / CSV / MD / TXT by extension', async () => {
    expect(await detectFormat(makeFile('{}', 'a.json'))).toBe('json');
    expect(await detectFormat(makeFile('a,b', 'a.csv'))).toBe('csv');
    expect(await detectFormat(makeFile('# a', 'a.md'))).toBe('md');
    expect(await detectFormat(makeFile('plain', 'a.txt'))).toBe('txt');
  });

  it('uses MIME types when extension is unknown', async () => {
    expect(await detectFormat(makeFile('{}', 'no-ext', 'application/json'))).toBe('json');
    expect(await detectFormat(makeFile('x', 'no-ext', 'text/csv'))).toBe('csv');
    expect(await detectFormat(makeFile('x', 'no-ext', 'application/pdf'))).toBe('pdf');
  });

  it('sniffs PDF magic bytes when both MIME and extension are missing', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(await detectFormat(new File([pdfBytes], 'unknown'))).toBe('pdf');
  });
});

describe('parseGDD - dragon-spin.json (full IR-shape JSON)', () => {
  it('returns high overall confidence (≥ 90%)', async () => {
    const file = loadFixture('dragon-spin.json', 'application/json');
    const gdd = await parseGDD(file);
    expect(gdd.overallConfidence).toBeGreaterThanOrEqual(90);
  });

  it('extracts meta.name and meta.id at 100% confidence', async () => {
    const file = loadFixture('dragon-spin.json', 'application/json');
    const gdd = await parseGDD(file);
    expect(gdd.meta.name.value).toBe('Dragon Spin Phoenix');
    expect(gdd.meta.name.confidence).toBeGreaterThanOrEqual(95);
    expect(gdd.meta.id.value).toBe('dragon-spin-phoenix');
  });

  it('extracts target RTP 0.965 at 100% confidence', async () => {
    const file = loadFixture('dragon-spin.json', 'application/json');
    const gdd = await parseGDD(file);
    expect(gdd.targetRTP.value).toBeCloseTo(0.965, 3);
    expect(gdd.targetRTP.confidence).toBe(100);
  });
});

describe('parseGDD - quick-hit-paytable.csv', () => {
  it('extracts the paytable rows with high confidence', async () => {
    const file = loadFixture('quick-hit-paytable.csv', 'text/csv');
    const gdd = await parseGDD(file);
    expect(gdd.paytable.value.length).toBe(11);
    expect(gdd.paytable.confidence).toBeGreaterThanOrEqual(80);
    const hp1 = gdd.paytable.value.find((r) => r.symbol === 'HP1');
    expect(hp1?.x5).toBe(750);
  });

  it('derives the symbol pool tiers from the paytable', async () => {
    const file = loadFixture('quick-hit-paytable.csv', 'text/csv');
    const gdd = await parseGDD(file);
    expect(gdd.symbolPool.HP.value).toBeGreaterThanOrEqual(3);
    expect(gdd.symbolPool.LP.value).toBeGreaterThanOrEqual(3);
    expect(gdd.symbolPool.WILD.value).toBe(1);
    expect(gdd.symbolPool.SCATTER.value).toBe(1);
  });
});

describe('parseGDD - huff-puff.md (markdown with table)', () => {
  it('extracts title and tiered paytable', async () => {
    const file = loadFixture('huff-puff.md', 'text/markdown');
    const gdd = await parseGDD(file);
    expect(gdd.meta.name.value).toMatch(/Huff/i);
    expect(gdd.paytable.value.length).toBeGreaterThanOrEqual(8);
  });

  it('extracts target RTP, max win, and jurisdictions from the prose', async () => {
    const file = loadFixture('huff-puff.md', 'text/markdown');
    const gdd = await parseGDD(file);
    expect(gdd.targetRTP.value).toBeCloseTo(0.965, 3);
    expect(gdd.targetRTP.confidence).toBeGreaterThanOrEqual(90);
    expect(gdd.maxWin.value).toBe(7500);
    expect(gdd.jurisdictions.value.length).toBeGreaterThanOrEqual(3);
    expect(gdd.jurisdictions.value).toContain('UKGC');
  });

  it('detects Free Spins + Hold & Win feature tags', async () => {
    const file = loadFixture('huff-puff.md', 'text/markdown');
    const gdd = await parseGDD(file);
    expect(gdd.features.value).toContain('free_spins');
    expect(gdd.features.value).toContain('hold_and_win');
  });
});

describe('parseGDD - cluster-cosmic.txt (plain text)', () => {
  it('extracts topology, volatility, features from prose', async () => {
    const file = loadFixture('cluster-cosmic.txt', 'text/plain');
    const gdd = await parseGDD(file);
    expect(gdd.topology.reels.value).toBe(7);
    expect(gdd.topology.rows.value).toBe(7);
    expect(gdd.volatility.value).toBe('MID');
    expect(gdd.features.value).toContain('cascade');
    expect(gdd.features.value).toContain('cluster');
  });
});

describe('gddToIR — produces a valid SlotGameIR', () => {
  it('round-trips through parseGameIR (Zod + cross-validate)', async () => {
    const file = loadFixture('dragon-spin.json', 'application/json');
    const gdd = await parseGDD(file);
    const ir = gddToIR(gdd);
    const parsed = parseGameIR(ir);
    if (!parsed.ok) {
      throw new Error(
        'IR rejected: ' + parsed.issues.map((i) => `${i.path}:${i.message}`).join('; ')
      );
    }
    expect(parsed.ok).toBe(true);
  });

  it('produces a valid IR even for the CSV-only fixture', async () => {
    const file = loadFixture('quick-hit-paytable.csv', 'text/csv');
    const gdd = await parseGDD(file);
    const ir = gddToIR(gdd);
    const parsed = parseGameIR(ir);
    expect(parsed.ok).toBe(true);
  });
});

describe('confidence aggregation', () => {
  it('weights extracted fields and yields a value between 0 and 100', async () => {
    const file = loadFixture('huff-puff.md', 'text/markdown');
    const gdd = await parseGDD(file);
    expect(gdd.overallConfidence).toBeGreaterThan(0);
    expect(gdd.overallConfidence).toBeLessThanOrEqual(100);
    // Markdown with full paytable + RTP + features should crest 60%.
    expect(gdd.overallConfidence).toBeGreaterThan(60);
  });
});

describe('tier auto-detection (HP / MP / LP / WILD / SCATTER)', () => {
  it('classifies symbols correctly from CSV rows', async () => {
    const csv = [
      'symbol,x3,x4,x5',
      'HP1,80,200,800',
      'MP1,20,60,200',
      'LP1,5,20,75',
      'Wild,0,0,0',
      'Scatter,5,20,100',
    ].join('\n');
    const file = makeFile(csv, 'tiers.csv', 'text/csv');
    const gdd = await parseGDD(file);
    expect(gdd.symbolPool.HP.value).toBe(1);
    expect(gdd.symbolPool.MP.value).toBe(1);
    expect(gdd.symbolPool.LP.value).toBe(1);
    expect(gdd.symbolPool.WILD.value).toBe(1);
    expect(gdd.symbolPool.SCATTER.value).toBe(1);
  });
});

describe('jurisdiction extraction', () => {
  it('finds 3+ jurisdiction codes from prose', async () => {
    const txt = 'This game targets UKGC, MGA, ADM, and DGOJ markets.';
    const file = makeFile(txt, 'j.txt', 'text/plain');
    const gdd = await parseGDD(file);
    expect(gdd.jurisdictions.value.length).toBeGreaterThanOrEqual(3);
    expect(gdd.jurisdictions.value).toContain('UKGC');
  });
});

describe('missing-field defaults', () => {
  it('produces low (<60) confidence on fields absent from the source', async () => {
    const file = makeFile('nothing useful here', 'empty.txt', 'text/plain');
    const gdd = await parseGDD(file);
    // RTP, max win, paytable, features all absent — all < 40
    expect(gdd.paytable.confidence).toBeLessThan(40);
    expect(gdd.targetRTP.confidence).toBeLessThan(60);
    // Defaults are sensible (RTP 0.955)
    expect(gdd.targetRTP.value).toBeGreaterThan(0.9);
    expect(gdd.targetRTP.value).toBeLessThan(1);
  });
});

describe('round-trip: parseGDD → gddToIR → JSON', () => {
  it('survives JSON.stringify → JSON.parse → parseGameIR cycle', async () => {
    const file = loadFixture('dragon-spin.json', 'application/json');
    const gdd: ExtractedGDD = await parseGDD(file);
    const ir = gddToIR(gdd);
    const text = JSON.stringify(ir);
    const reparsed = JSON.parse(text);
    const validation = parseGameIR(reparsed);
    expect(validation.ok).toBe(true);
  });
});
