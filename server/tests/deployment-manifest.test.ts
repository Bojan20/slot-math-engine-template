/**
 * W210 Faza 600.0 — Deployment manifest validation + JSON schema.
 */
import { describe, it, expect } from 'vitest';
import {
  validateManifest,
  validateVersion,
  validateTenantId,
  validateJurisdiction,
  validateGames,
  validateRolloutPercent,
  validateCanaryStrategy,
  validateRollbackTriggers,
  validateObservabilityConfig,
  validateComplianceVerdicts,
  canonicalize,
  manifestJsonSchema,
  defaultManifest,
  type DeploymentManifest,
} from '../lib/deployment/manifest.js';

describe('deployment manifest — field validators', () => {
  it('accepts valid semver, rejects garbage', () => {
    expect(validateVersion('1.0.0')).toBeNull();
    expect(validateVersion('10.20.30-rc.1')).toBeNull();
    expect(validateVersion('1.0')!.field).toBe('version');
    expect(validateVersion(42)!.field).toBe('version');
  });

  it('accepts valid UUID tenantId', () => {
    expect(
      validateTenantId('11111111-2222-3333-4444-555555555555')
    ).toBeNull();
    expect(validateTenantId('not-a-uuid')!.field).toBe('tenantId');
  });

  it('accepts 2..8 uppercase jurisdiction codes', () => {
    expect(validateJurisdiction('UKGC')).toBeNull();
    expect(validateJurisdiction('GENERIC')).toBeNull();
    expect(validateJurisdiction('uk')!.field).toBe('jurisdiction');
    expect(validateJurisdiction('TOOLONGCODE')!.field).toBe('jurisdiction');
  });

  it('games must be non-empty array of {id, semver-version}', () => {
    expect(
      validateGames([{ id: 'g1', version: '1.0.0' }]).length
    ).toBe(0);
    expect(validateGames([]).some((x) => x.field === 'games')).toBe(true);
    expect(
      validateGames([{ id: '', version: '1.0.0' }]).some((x) =>
        x.field.includes('id')
      )
    ).toBe(true);
    expect(
      validateGames([{ id: 'g', version: 'bad' }]).some((x) =>
        x.field.includes('version')
      )
    ).toBe(true);
  });

  it('rolloutPercent must be number in [0,100]', () => {
    expect(validateRolloutPercent(0)).toBeNull();
    expect(validateRolloutPercent(50)).toBeNull();
    expect(validateRolloutPercent(100)).toBeNull();
    expect(validateRolloutPercent(101)!.field).toBe('rolloutPercent');
    expect(validateRolloutPercent(-1)!.field).toBe('rolloutPercent');
  });

  it('canaryStrategy must be enum', () => {
    expect(validateCanaryStrategy('linear')).toBeNull();
    expect(validateCanaryStrategy('exponential')).toBeNull();
    expect(validateCanaryStrategy('adaptive')).toBeNull();
    expect(validateCanaryStrategy('hopscotch')!.field).toBe('canaryStrategy');
  });

  it('rollbackTriggers requires four numeric/bool fields', () => {
    expect(
      validateRollbackTriggers({
        rtpDriftPp: 1,
        errorRate: 0.01,
        latencyP99Multiplier: 1.5,
        auditCorruption: true,
      })
    ).toHaveLength(0);
    expect(validateRollbackTriggers({}).length).toBeGreaterThan(0);
    expect(
      validateRollbackTriggers({
        rtpDriftPp: 1,
        errorRate: 5, // out of range
        latencyP99Multiplier: 1.5,
        auditCorruption: true,
      }).length
    ).toBeGreaterThan(0);
  });

  it('observabilityConfig must be object with arrays + positive scrape', () => {
    expect(
      validateObservabilityConfig({
        scrapeIntervalSec: 15,
        alertWebhooks: [],
        dashboards: [],
      })
    ).toHaveLength(0);
    expect(
      validateObservabilityConfig({
        scrapeIntervalSec: -1,
        alertWebhooks: [],
        dashboards: [],
      }).length
    ).toBeGreaterThan(0);
  });

  it('complianceVerdicts requires ≥1 verdict with ISO-8601', () => {
    expect(
      validateComplianceVerdicts([
        {
          jurisdiction: 'UKGC',
          lab: 'GLI',
          issuedAt: '2026-01-01T00:00:00Z',
          status: 'pass',
        },
      ])
    ).toHaveLength(0);
    expect(validateComplianceVerdicts([]).length).toBeGreaterThan(0);
    expect(
      validateComplianceVerdicts([
        {
          jurisdiction: 'UKGC',
          lab: 'GLI',
          issuedAt: 'yesterday',
          status: 'pass',
        },
      ]).length
    ).toBeGreaterThan(0);
  });
});

describe('deployment manifest — aggregate validateManifest()', () => {
  it('default manifest is valid', () => {
    const r = validateManifest(defaultManifest());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('rejects null root', () => {
    expect(validateManifest(null).ok).toBe(false);
  });

  it('flags missing jurisdiction verdict as a cross-field violation', () => {
    const m = defaultManifest({
      jurisdiction: 'UKGC',
      complianceVerdicts: [
        {
          jurisdiction: 'MGA',
          lab: 'GLI',
          issuedAt: '2026-01-01T00:00:00Z',
          status: 'pass',
        },
      ],
    });
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(
      r.issues.some((i) => i.message.includes('missing verdict'))
    ).toBe(true);
  });

  it('refuses to deploy when jurisdiction verdict is fail', () => {
    const m = defaultManifest({
      jurisdiction: 'UKGC',
      complianceVerdicts: [
        {
          jurisdiction: 'UKGC',
          lab: 'GLI',
          issuedAt: '2026-01-01T00:00:00Z',
          status: 'fail',
        },
      ],
    });
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(
      r.issues.some((i) => i.message.includes('cannot deploy'))
    ).toBe(true);
  });

  it('canonicalize sorts keys deterministically', () => {
    const m: DeploymentManifest = defaultManifest();
    const a = canonicalize(m);
    const m2: DeploymentManifest = { ...m };
    // re-order top-level keys
    const reorderedRaw = JSON.parse(JSON.stringify(m2));
    const reordered: DeploymentManifest = {
      observabilityConfig: reorderedRaw.observabilityConfig,
      rollbackTriggers: reorderedRaw.rollbackTriggers,
      canaryStrategy: reorderedRaw.canaryStrategy,
      rolloutPercent: reorderedRaw.rolloutPercent,
      complianceVerdicts: reorderedRaw.complianceVerdicts,
      walletProvider: reorderedRaw.walletProvider,
      games: reorderedRaw.games,
      jurisdiction: reorderedRaw.jurisdiction,
      tenantId: reorderedRaw.tenantId,
      version: reorderedRaw.version,
    };
    expect(canonicalize(reordered)).toBe(a);
  });

  it('exports a draft-07 JSON Schema with all required top-level fields', () => {
    const schema = manifestJsonSchema();
    expect(schema.$schema).toContain('draft-07');
    const required = schema.required as string[];
    expect(required).toContain('version');
    expect(required).toContain('tenantId');
    expect(required).toContain('jurisdiction');
    expect(required).toContain('games');
    expect(required).toContain('walletProvider');
    expect(required).toContain('complianceVerdicts');
    expect(required).toContain('rolloutPercent');
    expect(required).toContain('canaryStrategy');
    expect(required).toContain('rollbackTriggers');
    expect(required).toContain('observabilityConfig');
  });
});
