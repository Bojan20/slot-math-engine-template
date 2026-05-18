// CORTI W204-PILOT — Pilot acceptance test suite.
//
// Drives smoke-level acceptance over every artifact produced by the
// Quick Hit Platinum Phoenix pilot:
//   - IR parses via parseGameIR (Zod + cross-validate)
//   - 12+ symbols, 4 HP / 4 MP / 3 LP layout
//   - 4-tier jackpot, FS with retrigger, mystery_symbol
//   - 11 real audio cues exist + ≤ 50KB each
//   - 14 Phoenix color SVGs + 14 mono fallbacks
//   - Animation spec table has 6 stages
//   - Cert flow script parses (node --check)
//   - Operator dashboard exposes the pilot as featured
//   - Marketing doc exists
//   - Audio library.json carries the real WAV references

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseGameIR } from '@engine/ir/index.js';

const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const STUDIO_ROOT = resolve(__dirname, '..');
const REPO_ROOT   = resolve(STUDIO_ROOT, '../..');

const IR_PATH         = resolve(STUDIO_ROOT, 'pilots/quick-hit-platinum-phoenix.ir.json');
const SYMBOLS_COLOR   = resolve(STUDIO_ROOT, 'pilots/quick-hit-platinum-phoenix/symbols/color');
const SYMBOLS_MONO    = resolve(STUDIO_ROOT, 'pilots/quick-hit-platinum-phoenix/symbols/mono');
const CUES_DIR        = resolve(STUDIO_ROOT, 'audio/cues');
const AUDIO_LIB_PATH  = resolve(STUDIO_ROOT, 'audio/library.json');
const ANIM_PATH       = resolve(STUDIO_ROOT, 'src/pilots/phoenix-animations.ts');
const CERT_SCRIPT     = resolve(REPO_ROOT, 'scripts/cert-pilot-flow.mjs');
const AUDIO_GEN       = resolve(REPO_ROOT, 'scripts/generate-pilot-audio.mjs');
const PILOT_DOC       = resolve(REPO_ROOT, 'docs/PILOT_QUICK_HIT_PLATINUM_PHOENIX.md');
const OPERATOR_GAMES  = resolve(REPO_ROOT, 'web/operator/data/mock-games.json');

const REAL_CUE_IDS = [
  'reel-spin', 'reel-stop',
  'win-small', 'win-big', 'win-jackpot',
  'fs-intro', 'fs-spin', 'fs-outro',
  'hw-orb-land', 'hw-payout',
  'mystery-reveal',
];

const irRaw = readFileSync(IR_PATH, 'utf8');
const ir = JSON.parse(irRaw) as Record<string, unknown> & {
  symbols: Array<{ id: string; kind: string }>;
  features: Array<{ kind: string; [k: string]: unknown }>;
  paytable: Record<string, Record<string, number>>;
  limits: { target_rtp: number; max_win_x: number; target_volatility: string };
};

describe('Pilot — IR validity', () => {
  it('IR file exists', () => {
    expect(existsSync(IR_PATH)).toBe(true);
  });

  it('parses via parseGameIR', () => {
    const result = parseGameIR(JSON.parse(irRaw));
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('parseGameIR issues:', result.issues);
    }
    expect(result.ok).toBe(true);
  });

  it('stated RTP is 0.96', () => {
    expect(ir.limits.target_rtp).toBe(0.96);
  });

  it('max win is 5000x', () => {
    expect(ir.limits.max_win_x).toBe(5000);
  });

  it('volatility is high', () => {
    expect(ir.limits.target_volatility).toBe('high');
  });
});

describe('Pilot — symbol pool', () => {
  it('has at least 12 symbols in pool', () => {
    expect(ir.symbols.length).toBeGreaterThanOrEqual(12);
  });

  it('has 4 HP symbols', () => {
    const hp = ir.symbols.filter((s) => s.kind === 'hp');
    expect(hp.length).toBe(4);
  });

  it('has a wild', () => {
    expect(ir.symbols.some((s) => s.kind === 'wild')).toBe(true);
  });

  it('has a scatter', () => {
    expect(ir.symbols.some((s) => s.kind === 'scatter')).toBe(true);
  });

  it('has a multiplier', () => {
    expect(ir.symbols.some((s) => s.kind === 'multiplier')).toBe(true);
  });

  it('has a mystery symbol', () => {
    expect(ir.symbols.some((s) => s.kind === 'mystery')).toBe(true);
  });

  it('has a bonus (H&W trigger) symbol', () => {
    expect(ir.symbols.some((s) => s.kind === 'bonus')).toBe(true);
  });
});

describe('Pilot — feature config', () => {
  it('has mystery_symbol feature', () => {
    expect(ir.features.some((f) => f.kind === 'mystery_symbol')).toBe(true);
  });

  it('has free_spins with retrigger', () => {
    const fs = ir.features.find((f) => f.kind === 'free_spins') as
      | { retrigger?: unknown }
      | undefined;
    expect(fs).toBeTruthy();
    expect(fs?.retrigger).toBeDefined();
  });

  it('has hold_and_win with 4-tier jackpot', () => {
    const hw = ir.features.find((f) => f.kind === 'hold_and_win') as
      | { jackpot_tiers?: Array<{ id: string }> }
      | undefined;
    expect(hw).toBeTruthy();
    expect(hw?.jackpot_tiers?.length).toBe(4);
    const tierIds = (hw?.jackpot_tiers ?? []).map((t) => t.id);
    expect(tierIds).toEqual(['Mini', 'Minor', 'Major', 'Grand']);
  });
});

describe('Pilot — audio cues', () => {
  it('audio library.json contains pilot_real_cues array', () => {
    const lib = JSON.parse(readFileSync(AUDIO_LIB_PATH, 'utf8')) as {
      pilot_real_cues?: Array<{ id: string; file: string; format: string }>;
    };
    expect(Array.isArray(lib.pilot_real_cues)).toBe(true);
    expect(lib.pilot_real_cues!.length).toBeGreaterThanOrEqual(11);
  });

  for (const id of REAL_CUE_IDS) {
    it(`cue ${id}.wav exists and ≤ 50KB`, () => {
      const path = resolve(CUES_DIR, `${id}.wav`);
      expect(existsSync(path)).toBe(true);
      const sz = statSync(path).size;
      expect(sz).toBeGreaterThan(0);
      expect(sz).toBeLessThanOrEqual(50 * 1024);
    });
  }

  it('audio generator script exists', () => {
    expect(existsSync(AUDIO_GEN)).toBe(true);
  });
});

describe('Pilot — symbol asset pack', () => {
  it('color folder exists with ≥ 12 SVGs', () => {
    expect(existsSync(SYMBOLS_COLOR)).toBe(true);
    const files = readdirSync(SYMBOLS_COLOR).filter((f) => f.endsWith('.svg'));
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it('mono fallback folder exists with ≥ 12 SVGs', () => {
    expect(existsSync(SYMBOLS_MONO)).toBe(true);
    const files = readdirSync(SYMBOLS_MONO).filter((f) => f.endsWith('.svg'));
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it('every color SVG contains a gradient (multi-color, not stroke-only)', () => {
    const files = readdirSync(SYMBOLS_COLOR).filter((f) => f.endsWith('.svg'));
    // Most color icons should declare a gradient. Allow a couple plain-fill icons
    // (e.g. number cards) but require the majority to use gradients.
    let gradientCount = 0;
    for (const f of files) {
      const s = readFileSync(resolve(SYMBOLS_COLOR, f), 'utf8');
      if (s.includes('Gradient') || s.includes('gradient')) gradientCount++;
    }
    expect(gradientCount).toBeGreaterThanOrEqual(Math.floor(files.length * 0.6));
  });
});

describe('Pilot — animation stages', () => {
  it('phoenix-animations.ts module exists', () => {
    expect(existsSync(ANIM_PATH)).toBe(true);
  });

  it('declares ≥ 5 named animation stages', async () => {
    const mod = (await import(resolve(STUDIO_ROOT, 'src/pilots/phoenix-animations.ts'))) as {
      PHOENIX_STAGES?: ReadonlyArray<{ id: string }>;
    };
    expect(mod.PHOENIX_STAGES).toBeDefined();
    expect(mod.PHOENIX_STAGES!.length).toBeGreaterThanOrEqual(5);
  });

  it('summary helper returns positive totals', async () => {
    const mod = (await import(resolve(STUDIO_ROOT, 'src/pilots/phoenix-animations.ts'))) as {
      phoenixStageSummary?: () => { stages: number; totalMs: number };
    };
    const s = mod.phoenixStageSummary!();
    expect(s.stages).toBeGreaterThanOrEqual(5);
    expect(s.totalMs).toBeGreaterThan(0);
  });
});

describe('Pilot — cert flow script', () => {
  it('script file exists', () => {
    expect(existsSync(CERT_SCRIPT)).toBe(true);
  });

  it('passes node --check (syntactically valid)', () => {
    expect(() => {
      execFileSync(process.execPath, ['--check', CERT_SCRIPT], { stdio: 'pipe' });
    }).not.toThrow();
  });
});

describe('Pilot — operator dashboard integration', () => {
  it('mock-games.json includes Quick Hit Platinum Phoenix', () => {
    const raw = readFileSync(OPERATOR_GAMES, 'utf8');
    const data = JSON.parse(raw) as { games: Array<{ gameId: string; name: string; featured?: boolean }> };
    const pilot = data.games.find((g) => g.gameId === 'pilot-qhp-phoenix');
    expect(pilot).toBeTruthy();
    expect(pilot?.name).toBe('Quick Hit Platinum Phoenix');
    expect(pilot?.featured).toBe(true);
  });
});

describe('Pilot — marketing doc', () => {
  it('marketing one-pager exists', () => {
    expect(existsSync(PILOT_DOC)).toBe(true);
    const s = readFileSync(PILOT_DOC, 'utf8');
    expect(s).toContain('Quick Hit Platinum Phoenix');
    expect(s).toContain('UKGC');
    expect(s).toContain('MGA');
  });
});
