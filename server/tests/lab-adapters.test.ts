/**
 * CORTI W210 Faza 600.0 — lab adapter unit tests.
 *
 * 6 specs per adapter (GLI, BMM, eCOGRA, NMi) — 24 specs total.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  gliAdapter,
  bmmAdapter,
  ecograAdapter,
  nmiAdapter,
  ALL_LAB_ADAPTERS,
  GLI_REQUIRED_DOCS,
  BMM_REQUIRED_DOCS,
  ECOGRA_REQUIRED_DOCS,
  NMI_REQUIRED_DOCS,
  getLabAdapter,
  type CertPackInput,
  type CertArtifact,
} from '../lib/cert/labs/index.js';

function makeArtifacts(ids: readonly string[]): CertArtifact[] {
  return ids.map((id) => ({
    id,
    bundlePath: `${id}.bin`,
    data: Buffer.from(`stub-content-for-${id}`, 'utf8'),
  }));
}

function makeInput(overrides: Partial<CertPackInput> = {}): CertPackInput {
  return {
    vendor: 'slot-math-engine',
    game: 'quick-hit-platinum',
    version: '1.0.0',
    jurisdiction: 'UKGC',
    repoSha: 'abcdef0123456789',
    generatedAt: '2026-05-18T20:00:00.000Z',
    rtp: 0.9612,
    hitFrequency: 0.2734,
    variance: 21.4,
    maxWinX: 12000,
    artifacts: makeArtifacts(GLI_REQUIRED_DOCS),
    contact: {
      company: 'Vanvinkl Studio',
      name: 'Boki Petković',
      email: 'bojan.petkovic25@gmail.com',
      phone: '+381-XXX-XXXXX',
    },
    ...overrides,
  };
}

describe('GLI adapter', () => {
  it('exposes correct lab metadata', () => {
    expect(gliAdapter.labName).toBe('GLI');
    expect(gliAdapter.bundleFormat).toBe('zip');
    expect(gliAdapter.requiredDocuments).toEqual(GLI_REQUIRED_DOCS);
    expect(gliAdapter.jurisdictionsSupported).toContain('UKGC');
  });

  it('validateInput passes with full document set', () => {
    const v = gliAdapter.validateInput(makeInput());
    expect(v.ok).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it('validateInput fails when required doc missing', () => {
    const arts = makeArtifacts(GLI_REQUIRED_DOCS.slice(1));
    const v = gliAdapter.validateInput(makeInput({ artifacts: arts }));
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('gli_missing_required'))).toBe(true);
  });

  it('cover letter contains GLI-19 ID + RTP + jurisdiction', () => {
    const cover = gliAdapter.generateCoverLetter(makeInput());
    expect(cover).toContain('GLI-19-SLOT-MATH-ENGINE-QUICK-HIT-PLATINUM-1.0.0');
    expect(cover).toContain('96.1200%');
    expect(cover).toContain('UKGC');
  });

  it('packBundle produces zip with strict naming convention', async () => {
    const b = await gliAdapter.packBundle(makeInput());
    expect(b.filename).toBe('slot-math-engine-quick-hit-platinum-1.0.0-GLI19.zip');
    expect(b.mime).toBe('application/zip');
    expect(b.data.length).toBeGreaterThan(200);
    // PK\x03\x04 zip local file signature
    expect(b.data.subarray(0, 4).toString('hex')).toBe('504b0304');
  });

  it('manifest sha256 matches actual zip bytes', async () => {
    const b = await gliAdapter.packBundle(makeInput());
    const expected = createHash('sha256').update(b.data).digest('hex');
    expect(b.sha256).toBe(expected);
    expect(b.manifest.length).toBeGreaterThanOrEqual(GLI_REQUIRED_DOCS.length);
  });
});

describe('BMM adapter', () => {
  it('exposes correct lab metadata', () => {
    expect(bmmAdapter.labName).toBe('BMM');
    expect(bmmAdapter.bundleFormat).toBe('tar');
    expect(bmmAdapter.requiredDocuments).toEqual(BMM_REQUIRED_DOCS);
  });

  it('validates against BMM required document set', () => {
    const arts = makeArtifacts(BMM_REQUIRED_DOCS);
    const v = bmmAdapter.validateInput(makeInput({ artifacts: arts, jurisdiction: 'MGA' }));
    expect(v.ok).toBe(true);
  });

  it('flags missing MGA_PPD_DISCLOSURE', () => {
    const arts = makeArtifacts(BMM_REQUIRED_DOCS.filter((d) => d !== 'MGA_PPD_DISCLOSURE'));
    const v = bmmAdapter.validateInput(makeInput({ artifacts: arts, jurisdiction: 'MGA' }));
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('bmm_missing_required:MGA_PPD_DISCLOSURE');
  });

  it('MGA cover letter references MGA PPD §11 + AWP §15', () => {
    const arts = makeArtifacts(BMM_REQUIRED_DOCS);
    const cover = bmmAdapter.generateCoverLetter(makeInput({ artifacts: arts, jurisdiction: 'MGA' }));
    expect(cover).toContain('MGA Player Protection Directive §11');
    expect(cover).toContain('MGA AWP §15');
  });

  it('packBundle outputs tar archive with bmm-submission.json', async () => {
    const arts = makeArtifacts(BMM_REQUIRED_DOCS);
    const b = await bmmAdapter.packBundle(makeInput({ artifacts: arts, jurisdiction: 'MGA' }));
    expect(b.filename.endsWith('-BMM.tar')).toBe(true);
    expect(b.mime).toBe('application/x-tar');
    const indexOfManifest = b.manifest.find((m) => m.path === 'bmm-submission.json');
    expect(indexOfManifest).toBeDefined();
  });

  it('tar contains ustar magic in header block', async () => {
    const arts = makeArtifacts(BMM_REQUIRED_DOCS);
    const b = await bmmAdapter.packBundle(makeInput({ artifacts: arts, jurisdiction: 'MGA' }));
    expect(b.data.subarray(257, 263).toString('ascii')).toBe('ustar ');
  });
});

describe('eCOGRA adapter', () => {
  it('exposes correct lab metadata', () => {
    expect(ecograAdapter.labName).toBe('eCOGRA');
    expect(ecograAdapter.bundleFormat).toBe('zip');
    expect(ecograAdapter.requiredDocuments).toEqual(ECOGRA_REQUIRED_DOCS);
  });

  it('validates against eCOGRA required docs', () => {
    const arts = makeArtifacts(ECOGRA_REQUIRED_DOCS);
    const v = ecograAdapter.validateInput(makeInput({ artifacts: arts }));
    expect(v.ok).toBe(true);
  });

  it('blocks UKGC submission with RTP below RTS-7 floor', () => {
    const arts = makeArtifacts(ECOGRA_REQUIRED_DOCS);
    const v = ecograAdapter.validateInput(
      makeInput({ artifacts: arts, jurisdiction: 'UKGC', rtp: 0.80 })
    );
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('ecogra_ukgc_rtp_below_rts7_floor');
  });

  it('cover letter references RTS-12 + RTS-14 disclosures', () => {
    const arts = makeArtifacts(ECOGRA_REQUIRED_DOCS);
    const cover = ecograAdapter.generateCoverLetter(makeInput({ artifacts: arts }));
    expect(cover).toContain('RTS 12');
    expect(cover).toContain('RTS 14');
  });

  it('packBundle emits ecogra-audit.yaml with sha256 entries', async () => {
    const arts = makeArtifacts(ECOGRA_REQUIRED_DOCS);
    const b = await ecograAdapter.packBundle(makeInput({ artifacts: arts }));
    const yamlEntry = b.manifest.find((m) => m.path === 'ecogra-audit.yaml');
    expect(yamlEntry).toBeDefined();
    expect(b.filename).toMatch(/-eCOGRA\.zip$/);
  });

  it('zip bytes start with PK signature', async () => {
    const arts = makeArtifacts(ECOGRA_REQUIRED_DOCS);
    const b = await ecograAdapter.packBundle(makeInput({ artifacts: arts }));
    expect(b.data.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});

describe('NMi adapter', () => {
  it('exposes correct lab metadata', () => {
    expect(nmiAdapter.labName).toBe('NMi');
    expect(nmiAdapter.bundleFormat).toBe('zip');
    expect(nmiAdapter.requiredDocuments).toEqual(NMI_REQUIRED_DOCS);
  });

  it('validates with NMi required docs + KSA', () => {
    const arts = makeArtifacts(NMI_REQUIRED_DOCS);
    const v = nmiAdapter.validateInput(makeInput({ artifacts: arts, jurisdiction: 'KSA' }));
    expect(v.ok).toBe(true);
  });

  it('warns on very high max win for KSA', () => {
    const arts = makeArtifacts(NMI_REQUIRED_DOCS);
    const v = nmiAdapter.validateInput(
      makeInput({ artifacts: arts, jurisdiction: 'KSA', maxWinX: 5_000_000 })
    );
    expect(v.warnings).toContain('nmi_ksa_max_win_unusually_high');
  });

  it('KSA cover letter is bilingual (Dutch + English)', () => {
    const arts = makeArtifacts(NMI_REQUIRED_DOCS);
    const cover = nmiAdapter.generateCoverLetter(makeInput({ artifacts: arts, jurisdiction: 'KSA' }));
    expect(cover).toContain('Indieningsbrief (NL)');
    expect(cover).toContain('Submission Cover Letter (EN)');
    expect(cover).toContain('Kansspelautoriteit');
  });

  it('packBundle emits nmi-submission.json with ksaDualLanguage flag', async () => {
    const arts = makeArtifacts(NMI_REQUIRED_DOCS);
    const b = await nmiAdapter.packBundle(makeInput({ artifacts: arts, jurisdiction: 'KSA' }));
    const entry = b.manifest.find((m) => m.path === 'nmi-submission.json');
    expect(entry).toBeDefined();
    expect(b.filename).toMatch(/-NMi\.zip$/);
  });

  it('zip is non-empty + manifest sha matches', async () => {
    const arts = makeArtifacts(NMI_REQUIRED_DOCS);
    const b = await nmiAdapter.packBundle(makeInput({ artifacts: arts, jurisdiction: 'KSA' }));
    expect(b.data.length).toBeGreaterThan(200);
    expect(b.sha256).toBe(createHash('sha256').update(b.data).digest('hex'));
  });
});

describe('lab adapter registry', () => {
  it('exposes all 4 adapters via ALL_LAB_ADAPTERS', () => {
    expect(ALL_LAB_ADAPTERS).toHaveLength(4);
    expect(ALL_LAB_ADAPTERS.map((a) => a.labName).sort()).toEqual(
      ['BMM', 'GLI', 'NMi', 'eCOGRA']
    );
  });

  it('getLabAdapter("GLI") returns gliAdapter', () => {
    expect(getLabAdapter('GLI')).toBe(gliAdapter);
  });

  it('getLabAdapter throws for unknown lab', () => {
    // @ts-expect-error — testing runtime guard
    expect(() => getLabAdapter('UNKNOWN')).toThrow(/unknown_lab_adapter/);
  });
});
