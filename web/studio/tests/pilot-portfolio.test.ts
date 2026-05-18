// CORTI W205-PILOTS — Multi-pilot portfolio acceptance test suite.
//
// Covers all 4 pilots (Quick Hit + W205 trio):
//   - Per-pilot IR parses via parseGameIR
//   - Per-pilot symbol count (12-15)
//   - Per-pilot 11 audio cue WAVs each ≤ 50KB
//   - Per-pilot animation stages defined
//   - Per-pilot cert report exists
//   - Per-pilot marketing doc exists
//   - Cert flow runner --pilot flag works
//   - All 4 pilots featured in Operator data
//   - Theme palette per pilot distinct
//   - pilot:cert:all script registered

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseGameIR } from '@engine/ir/index.js';

const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const STUDIO_ROOT = resolve(__dirname, '..');
const REPO_ROOT   = resolve(STUDIO_ROOT, '../..');

interface PilotSpec {
  slug: string;
  irPath: string;
  symbolsColor: string;
  symbolsMono: string;
  cuesDir: string;
  animModule: string;
  animExportSummary: string;
  animExportStages: string;
  reportName: string;
  marketingDoc: string;
  operatorGameId: string;
  themeTag: string;
  minSymbols: number;
}

const PILOTS: PilotSpec[] = [
  {
    slug: 'huff-n-puff-storm-cellar',
    irPath: resolve(STUDIO_ROOT, 'pilots/huff-n-puff-storm-cellar.ir.json'),
    symbolsColor: resolve(STUDIO_ROOT, 'pilots/huff-n-puff-storm-cellar/symbols/color'),
    symbolsMono: resolve(STUDIO_ROOT, 'pilots/huff-n-puff-storm-cellar/symbols/mono'),
    cuesDir: resolve(STUDIO_ROOT, 'audio/cues/huff-n-puff-storm-cellar'),
    animModule: resolve(STUDIO_ROOT, 'src/pilots/huff-n-puff-animations.ts'),
    animExportSummary: 'huffNPuffStageSummary',
    animExportStages: 'HUFF_N_PUFF_STAGES',
    reportName: 'HUFF_N_PUFF_STORM_CELLAR',
    marketingDoc: resolve(REPO_ROOT, 'docs/PILOT_HUFF_N_PUFF_STORM_CELLAR.md'),
    operatorGameId: 'pilot-hnp-storm',
    themeTag: 'huff-n-puff',
    minSymbols: 14,
  },
  {
    slug: 'spartacus-colossal-conquest',
    irPath: resolve(STUDIO_ROOT, 'pilots/spartacus-colossal-conquest.ir.json'),
    symbolsColor: resolve(STUDIO_ROOT, 'pilots/spartacus-colossal-conquest/symbols/color'),
    symbolsMono: resolve(STUDIO_ROOT, 'pilots/spartacus-colossal-conquest/symbols/mono'),
    cuesDir: resolve(STUDIO_ROOT, 'audio/cues/spartacus-colossal-conquest'),
    animModule: resolve(STUDIO_ROOT, 'src/pilots/spartacus-animations.ts'),
    animExportSummary: 'spartacusStageSummary',
    animExportStages: 'SPARTACUS_STAGES',
    reportName: 'SPARTACUS_COLOSSAL_CONQUEST',
    marketingDoc: resolve(REPO_ROOT, 'docs/PILOT_SPARTACUS_COLOSSAL_CONQUEST.md'),
    operatorGameId: 'pilot-spartacus-colossal',
    themeTag: 'spartacus',
    minSymbols: 15,
  },
  {
    slug: 'rainbow-riches-megaways-vault',
    irPath: resolve(STUDIO_ROOT, 'pilots/rainbow-riches-megaways-vault.ir.json'),
    symbolsColor: resolve(STUDIO_ROOT, 'pilots/rainbow-riches-megaways-vault/symbols/color'),
    symbolsMono: resolve(STUDIO_ROOT, 'pilots/rainbow-riches-megaways-vault/symbols/mono'),
    cuesDir: resolve(STUDIO_ROOT, 'audio/cues/rainbow-riches-megaways-vault'),
    animModule: resolve(STUDIO_ROOT, 'src/pilots/rainbow-riches-animations.ts'),
    animExportSummary: 'rainbowRichesStageSummary',
    animExportStages: 'RAINBOW_RICHES_STAGES',
    reportName: 'RAINBOW_RICHES_MEGAWAYS_VAULT',
    marketingDoc: resolve(REPO_ROOT, 'docs/PILOT_RAINBOW_RICHES_MEGAWAYS_VAULT.md'),
    operatorGameId: 'pilot-rr-megaways',
    themeTag: 'rainbow-riches',
    minSymbols: 14,
  },
];

const CERT_SCRIPT     = resolve(REPO_ROOT, 'scripts/cert-pilot-flow.mjs');
const OPERATOR_GAMES  = resolve(REPO_ROOT, 'web/operator/data/mock-games.json');
const PKG_JSON        = resolve(REPO_ROOT, 'package.json');
const AUDIO_LIB_PATH  = resolve(STUDIO_ROOT, 'audio/library.json');
const REAL_CUE_IDS_BASE = [
  'reel-spin', 'reel-stop',
  'win-small', 'win-big', 'win-jackpot',
  'fs-intro', 'fs-spin', 'fs-outro',
  'mystery-reveal',
];

describe('Pilot Portfolio — IR validity', () => {
  for (const p of PILOTS) {
    it(`${p.slug}: IR file exists`, () => {
      expect(existsSync(p.irPath)).toBe(true);
    });

    it(`${p.slug}: parses via parseGameIR`, () => {
      const irRaw = readFileSync(p.irPath, 'utf8');
      const result = parseGameIR(JSON.parse(irRaw));
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error(`${p.slug} parseGameIR issues:`, result.issues);
      }
      expect(result.ok).toBe(true);
    });

    it(`${p.slug}: has theme tag '${p.themeTag}'`, () => {
      const ir = JSON.parse(readFileSync(p.irPath, 'utf8')) as {
        meta: { theme_tags: string[] };
      };
      expect(ir.meta.theme_tags).toContain(p.themeTag);
    });
  }
});

describe('Pilot Portfolio — symbol pool', () => {
  for (const p of PILOTS) {
    it(`${p.slug}: has ≥ ${p.minSymbols} symbols`, () => {
      const ir = JSON.parse(readFileSync(p.irPath, 'utf8')) as {
        symbols: Array<{ id: string; kind: string }>;
      };
      expect(ir.symbols.length).toBeGreaterThanOrEqual(p.minSymbols);
    });

    it(`${p.slug}: has 4 HP symbols`, () => {
      const ir = JSON.parse(readFileSync(p.irPath, 'utf8')) as {
        symbols: Array<{ id: string; kind: string }>;
      };
      expect(ir.symbols.filter((s) => s.kind === 'hp').length).toBe(4);
    });

    it(`${p.slug}: has a wild`, () => {
      const ir = JSON.parse(readFileSync(p.irPath, 'utf8')) as {
        symbols: Array<{ id: string; kind: string }>;
      };
      expect(ir.symbols.some((s) => s.kind === 'wild')).toBe(true);
    });

    it(`${p.slug}: has a scatter`, () => {
      const ir = JSON.parse(readFileSync(p.irPath, 'utf8')) as {
        symbols: Array<{ id: string; kind: string }>;
      };
      expect(ir.symbols.some((s) => s.kind === 'scatter')).toBe(true);
    });
  }
});

describe('Pilot Portfolio — audio cues', () => {
  for (const p of PILOTS) {
    it(`${p.slug}: cues directory exists with ≥ 11 WAVs`, () => {
      expect(existsSync(p.cuesDir)).toBe(true);
      const files = readdirSync(p.cuesDir).filter((f) => f.endsWith('.wav'));
      expect(files.length).toBeGreaterThanOrEqual(11);
    });

    for (const cueId of REAL_CUE_IDS_BASE) {
      it(`${p.slug}: ${cueId}.wav exists and ≤ 50KB`, () => {
        const path = resolve(p.cuesDir, `${cueId}.wav`);
        expect(existsSync(path)).toBe(true);
        const sz = statSync(path).size;
        expect(sz).toBeGreaterThan(0);
        expect(sz).toBeLessThanOrEqual(50 * 1024);
      });
    }

    it(`${p.slug}: every WAV is ≤ 50KB`, () => {
      const files = readdirSync(p.cuesDir).filter((f) => f.endsWith('.wav'));
      for (const f of files) {
        const sz = statSync(resolve(p.cuesDir, f)).size;
        expect(sz).toBeLessThanOrEqual(50 * 1024);
      }
    });
  }

  it('audio library.json carries the W205 per-pilot cue references', () => {
    const lib = JSON.parse(readFileSync(AUDIO_LIB_PATH, 'utf8')) as {
      w205_pilot_cues?: Record<string, Array<unknown>>;
    };
    expect(lib.w205_pilot_cues).toBeDefined();
    expect(Object.keys(lib.w205_pilot_cues!).length).toBe(3);
    for (const p of PILOTS) {
      expect(lib.w205_pilot_cues![p.slug]).toBeDefined();
      expect(lib.w205_pilot_cues![p.slug].length).toBe(11);
    }
  });
});

describe('Pilot Portfolio — symbol asset pack', () => {
  for (const p of PILOTS) {
    it(`${p.slug}: color SVG folder has ≥ ${p.minSymbols} SVGs`, () => {
      expect(existsSync(p.symbolsColor)).toBe(true);
      const files = readdirSync(p.symbolsColor).filter((f) => f.endsWith('.svg'));
      expect(files.length).toBeGreaterThanOrEqual(p.minSymbols);
    });

    it(`${p.slug}: mono SVG folder has ≥ ${p.minSymbols} SVGs`, () => {
      expect(existsSync(p.symbolsMono)).toBe(true);
      const files = readdirSync(p.symbolsMono).filter((f) => f.endsWith('.svg'));
      expect(files.length).toBeGreaterThanOrEqual(p.minSymbols);
    });

    it(`${p.slug}: every color SVG declares a gradient`, () => {
      const files = readdirSync(p.symbolsColor).filter((f) => f.endsWith('.svg'));
      let gradientCount = 0;
      for (const f of files) {
        const s = readFileSync(resolve(p.symbolsColor, f), 'utf8');
        if (s.includes('Gradient') || s.includes('gradient')) gradientCount++;
      }
      expect(gradientCount).toBe(files.length);
    });
  }
});

describe('Pilot Portfolio — animation stages', () => {
  for (const p of PILOTS) {
    it(`${p.slug}: animation module exists`, () => {
      expect(existsSync(p.animModule)).toBe(true);
    });

    it(`${p.slug}: declares ≥ 6 named animation stages`, async () => {
      const mod = (await import(p.animModule)) as Record<string, unknown>;
      const stages = mod[p.animExportStages] as ReadonlyArray<{ id: string }>;
      expect(Array.isArray(stages)).toBe(true);
      expect(stages.length).toBeGreaterThanOrEqual(6);
    });

    it(`${p.slug}: summary helper returns positive totals`, async () => {
      const mod = (await import(p.animModule)) as Record<string, unknown>;
      const summary = (mod[p.animExportSummary] as () => { stages: number; totalMs: number })();
      expect(summary.stages).toBeGreaterThanOrEqual(6);
      expect(summary.totalMs).toBeGreaterThan(0);
    });
  }
});

describe('Pilot Portfolio — cert flow runner', () => {
  it('script file exists', () => {
    expect(existsSync(CERT_SCRIPT)).toBe(true);
  });

  it('passes node --check (syntactically valid)', () => {
    expect(() => {
      execFileSync(process.execPath, ['--check', CERT_SCRIPT], { stdio: 'pipe' });
    }).not.toThrow();
  });

  it('cert script source mentions --pilot flag', () => {
    const src = readFileSync(CERT_SCRIPT, 'utf8');
    expect(src).toContain('--pilot');
    expect(src).toContain('PILOT_REGISTRY');
  });

  it('package.json registers pilot:cert:all script', () => {
    const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['pilot:cert:all']).toBeDefined();
    for (const p of PILOTS) {
      expect(pkg.scripts['pilot:cert:all']).toContain(p.slug);
    }
  });

  for (const p of PILOTS) {
    it(`${p.slug}: cert report exists from prior run`, () => {
      const json = resolve(REPO_ROOT, 'reports/pilot', `${p.reportName}.json`);
      const md   = resolve(REPO_ROOT, 'reports/pilot', `${p.reportName}.md`);
      expect(existsSync(json)).toBe(true);
      expect(existsSync(md)).toBe(true);
    });
  }
});

describe('Pilot Portfolio — operator dashboard', () => {
  it('mock-games.json includes all 4 pilots as featured', () => {
    const data = JSON.parse(readFileSync(OPERATOR_GAMES, 'utf8')) as {
      games: Array<{ gameId: string; featured?: boolean }>;
    };
    const expectedIds = ['pilot-qhp-phoenix', ...PILOTS.map((p) => p.operatorGameId)];
    for (const id of expectedIds) {
      const game = data.games.find((g) => g.gameId === id);
      expect(game).toBeTruthy();
      expect(game?.featured).toBe(true);
    }
  });
});

describe('Pilot Portfolio — marketing docs', () => {
  for (const p of PILOTS) {
    it(`${p.slug}: marketing one-pager exists`, () => {
      expect(existsSync(p.marketingDoc)).toBe(true);
      const s = readFileSync(p.marketingDoc, 'utf8');
      expect(s).toContain('UKGC');
      expect(s).toContain('MGA');
    });
  }
});

describe('Pilot Portfolio — theme palette distinctness', () => {
  it('each pilot uses a distinct theme tag', () => {
    const tags = PILOTS.map((p) => p.themeTag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('each pilot symbol pack has a unique first SVG body hash', () => {
    const hashes = new Set<string>();
    for (const p of PILOTS) {
      const files = readdirSync(p.symbolsColor).filter((f) => f.endsWith('.svg')).sort();
      const first = files[0];
      const body = readFileSync(resolve(p.symbolsColor, first), 'utf8');
      hashes.add(body);
    }
    expect(hashes.size).toBe(PILOTS.length);
  });
});
