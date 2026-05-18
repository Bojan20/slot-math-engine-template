/**
 * W210 Faza 600.0 — Live Operator Integration / Production Deployment
 * Rehearsal. Deployment manifest schema + validators + JSON Schema export.
 *
 * A `DeploymentManifest` captures the exact, signed contract between the
 * platform and a tenant: which game versions, which jurisdiction, which
 * wallet provider, the cert verdicts that authorize the deploy, plus
 * canary parameters and rollback triggers.
 *
 * The manifest is content-addressable: two deployments with identical
 * fields produce identical canonical-JSON which can be hashed for the
 * audit trail. Validators are pure (no I/O, no clock, no randomness) so
 * they're suitable for cert dossier generation and CI gating.
 *
 * Wire-format compatibility: this module exports a JSON Schema (draft-07)
 * via `manifestJsonSchema()` so external tooling (regulator review portal,
 * operator marketplace) can validate uploaded manifests without pulling in
 * the TypeScript types.
 */
export type CanaryStrategy = 'linear' | 'exponential' | 'adaptive';
export type DeploymentStatus =
  | 'pending'
  | 'canary'
  | 'rolling'
  | 'live'
  | 'rolled_back'
  | 'failed';

export interface ComplianceVerdict {
  /** ISO-2 jurisdiction code (e.g. 'UKGC', 'MGA', 'NJ', 'SE'). */
  jurisdiction: string;
  /** Cert lab vendor — 'GLI' | 'BMM' | 'iTechLabs' | 'internal'. */
  lab: string;
  /** ISO-8601 verdict timestamp. */
  issuedAt: string;
  /** Cert verdict — pass / conditional / fail. */
  status: 'pass' | 'conditional' | 'fail';
  /** Optional opaque dossier hash for traceability. */
  dossierHash?: string;
}

export interface ObservabilityConfig {
  /** Metrics endpoint scrape interval in seconds. */
  scrapeIntervalSec: number;
  /** Alerting webhook URLs. */
  alertWebhooks: string[];
  /** Dashboard names to surface in the operator console. */
  dashboards: string[];
}

export interface RollbackTriggers {
  /** Δ_RTP percentage points beyond which auto-rollback fires. */
  rtpDriftPp: number;
  /** Error rate fraction (0..1) over the canary window. */
  errorRate: number;
  /** Latency p99 multiplier vs baseline. */
  latencyP99Multiplier: number;
  /** If true, an audit-log corruption alert triggers rollback. */
  auditCorruption: boolean;
}

export interface DeploymentManifest {
  /** Semver version of the deployment artifact. */
  version: string;
  /** Tenant UUID owning the deployment. */
  tenantId: string;
  /** ISO-2 jurisdiction code. */
  jurisdiction: string;
  /** List of game IDs (and pinned versions) to ship. */
  games: { id: string; version: string }[];
  /** Wallet integration provider id (e.g. 'stub', 'pay-svc', 'in-house'). */
  walletProvider: string;
  /** Cert verdicts that authorize this deployment. */
  complianceVerdicts: ComplianceVerdict[];
  /** Target rollout percent (0..100). 100 = full traffic. */
  rolloutPercent: number;
  /** Strategy for stepping canary stages. */
  canaryStrategy: CanaryStrategy;
  /** Auto-rollback gate thresholds. */
  rollbackTriggers: RollbackTriggers;
  /** Observability wiring. */
  observabilityConfig: ObservabilityConfig;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateVersion(v: unknown): ValidationIssue | null {
  if (typeof v !== 'string') return { field: 'version', message: 'must be string' };
  if (!SEMVER.test(v)) return { field: 'version', message: 'must be semver' };
  return null;
}

export function validateTenantId(v: unknown): ValidationIssue | null {
  if (typeof v !== 'string') return { field: 'tenantId', message: 'must be string' };
  if (!UUID.test(v)) return { field: 'tenantId', message: 'must be UUID' };
  return null;
}

export function validateJurisdiction(v: unknown): ValidationIssue | null {
  if (typeof v !== 'string') return { field: 'jurisdiction', message: 'must be string' };
  if (!/^[A-Z]{2,8}$/.test(v))
    return { field: 'jurisdiction', message: 'must be 2..8 uppercase code' };
  return null;
}

export function validateGames(v: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!Array.isArray(v)) {
    out.push({ field: 'games', message: 'must be array' });
    return out;
  }
  if (v.length === 0) out.push({ field: 'games', message: 'must have ≥1 game' });
  for (let i = 0; i < v.length; i++) {
    const g = v[i] as { id?: unknown; version?: unknown };
    if (typeof g?.id !== 'string' || g.id.length === 0)
      out.push({ field: `games[${i}].id`, message: 'must be non-empty string' });
    if (typeof g?.version !== 'string' || !SEMVER.test(g.version))
      out.push({ field: `games[${i}].version`, message: 'must be semver' });
  }
  return out;
}

export function validateWalletProvider(v: unknown): ValidationIssue | null {
  if (typeof v !== 'string' || v.length === 0)
    return { field: 'walletProvider', message: 'must be non-empty string' };
  return null;
}

export function validateComplianceVerdicts(v: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!Array.isArray(v)) {
    out.push({ field: 'complianceVerdicts', message: 'must be array' });
    return out;
  }
  if (v.length === 0)
    out.push({
      field: 'complianceVerdicts',
      message: 'at least one verdict required to deploy',
    });
  for (let i = 0; i < v.length; i++) {
    const ver = v[i] as Partial<ComplianceVerdict>;
    if (typeof ver?.jurisdiction !== 'string')
      out.push({ field: `complianceVerdicts[${i}].jurisdiction`, message: 'must be string' });
    if (typeof ver?.lab !== 'string')
      out.push({ field: `complianceVerdicts[${i}].lab`, message: 'must be string' });
    if (typeof ver?.issuedAt !== 'string' || !ISO_8601.test(ver.issuedAt))
      out.push({ field: `complianceVerdicts[${i}].issuedAt`, message: 'must be ISO-8601' });
    if (ver?.status !== 'pass' && ver?.status !== 'conditional' && ver?.status !== 'fail')
      out.push({
        field: `complianceVerdicts[${i}].status`,
        message: 'must be pass|conditional|fail',
      });
  }
  return out;
}

export function validateRolloutPercent(v: unknown): ValidationIssue | null {
  if (typeof v !== 'number' || !Number.isFinite(v))
    return { field: 'rolloutPercent', message: 'must be number' };
  if (v < 0 || v > 100)
    return { field: 'rolloutPercent', message: 'must be in [0,100]' };
  return null;
}

export function validateCanaryStrategy(v: unknown): ValidationIssue | null {
  if (v !== 'linear' && v !== 'exponential' && v !== 'adaptive')
    return { field: 'canaryStrategy', message: 'must be linear|exponential|adaptive' };
  return null;
}

export function validateRollbackTriggers(v: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (typeof v !== 'object' || v === null) {
    out.push({ field: 'rollbackTriggers', message: 'must be object' });
    return out;
  }
  const t = v as Partial<RollbackTriggers>;
  if (typeof t.rtpDriftPp !== 'number' || t.rtpDriftPp < 0 || t.rtpDriftPp > 100)
    out.push({ field: 'rollbackTriggers.rtpDriftPp', message: 'must be number in [0,100]' });
  if (typeof t.errorRate !== 'number' || t.errorRate < 0 || t.errorRate > 1)
    out.push({ field: 'rollbackTriggers.errorRate', message: 'must be number in [0,1]' });
  if (
    typeof t.latencyP99Multiplier !== 'number' ||
    t.latencyP99Multiplier < 1 ||
    t.latencyP99Multiplier > 100
  )
    out.push({
      field: 'rollbackTriggers.latencyP99Multiplier',
      message: 'must be number in [1,100]',
    });
  if (typeof t.auditCorruption !== 'boolean')
    out.push({ field: 'rollbackTriggers.auditCorruption', message: 'must be boolean' });
  return out;
}

export function validateObservabilityConfig(v: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (typeof v !== 'object' || v === null) {
    out.push({ field: 'observabilityConfig', message: 'must be object' });
    return out;
  }
  const o = v as Partial<ObservabilityConfig>;
  if (typeof o.scrapeIntervalSec !== 'number' || o.scrapeIntervalSec <= 0)
    out.push({
      field: 'observabilityConfig.scrapeIntervalSec',
      message: 'must be positive number',
    });
  if (!Array.isArray(o.alertWebhooks))
    out.push({
      field: 'observabilityConfig.alertWebhooks',
      message: 'must be array',
    });
  if (!Array.isArray(o.dashboards))
    out.push({
      field: 'observabilityConfig.dashboards',
      message: 'must be array',
    });
  return out;
}

/** Comprehensive validator — returns aggregate ok + per-field issues. */
export function validateManifest(m: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (typeof m !== 'object' || m === null) {
    return { ok: false, issues: [{ field: '_root', message: 'must be object' }] };
  }
  const mm = m as Partial<DeploymentManifest>;
  const collect = (x: ValidationIssue | null): void => {
    if (x) issues.push(x);
  };
  collect(validateVersion(mm.version));
  collect(validateTenantId(mm.tenantId));
  collect(validateJurisdiction(mm.jurisdiction));
  issues.push(...validateGames(mm.games));
  collect(validateWalletProvider(mm.walletProvider));
  issues.push(...validateComplianceVerdicts(mm.complianceVerdicts));
  collect(validateRolloutPercent(mm.rolloutPercent));
  collect(validateCanaryStrategy(mm.canaryStrategy));
  issues.push(...validateRollbackTriggers(mm.rollbackTriggers));
  issues.push(...validateObservabilityConfig(mm.observabilityConfig));

  // Cross-field semantics: deployment only authorized if the verdict for
  // the chosen jurisdiction is 'pass' or 'conditional'.
  if (
    Array.isArray(mm.complianceVerdicts) &&
    typeof mm.jurisdiction === 'string'
  ) {
    const v = mm.complianceVerdicts.find(
      (x) => (x as ComplianceVerdict).jurisdiction === mm.jurisdiction
    ) as ComplianceVerdict | undefined;
    if (!v) {
      issues.push({
        field: 'complianceVerdicts',
        message: `missing verdict for jurisdiction ${mm.jurisdiction}`,
      });
    } else if (v.status === 'fail') {
      issues.push({
        field: 'complianceVerdicts',
        message: `verdict for ${mm.jurisdiction} is fail — cannot deploy`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Deep-stable JSON serialization. Sorts object keys recursively. */
export function canonicalize(m: DeploymentManifest): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x as Record<string, unknown>).sort()) {
        out[k] = sort((x as Record<string, unknown>)[k]);
      }
      return out;
    }
    return x;
  };
  return JSON.stringify(sort(m));
}

/** JSON Schema draft-07 export (consumed by regulator portal). */
export function manifestJsonSchema(): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'DeploymentManifest',
    type: 'object',
    required: [
      'version',
      'tenantId',
      'jurisdiction',
      'games',
      'walletProvider',
      'complianceVerdicts',
      'rolloutPercent',
      'canaryStrategy',
      'rollbackTriggers',
      'observabilityConfig',
    ],
    properties: {
      version: { type: 'string', pattern: SEMVER.source },
      tenantId: { type: 'string', pattern: UUID.source },
      jurisdiction: { type: 'string', pattern: '^[A-Z]{2,8}$' },
      games: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'version'],
          properties: {
            id: { type: 'string', minLength: 1 },
            version: { type: 'string', pattern: SEMVER.source },
          },
        },
      },
      walletProvider: { type: 'string', minLength: 1 },
      complianceVerdicts: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['jurisdiction', 'lab', 'issuedAt', 'status'],
          properties: {
            jurisdiction: { type: 'string' },
            lab: { type: 'string' },
            issuedAt: { type: 'string' },
            status: { enum: ['pass', 'conditional', 'fail'] },
            dossierHash: { type: 'string' },
          },
        },
      },
      rolloutPercent: { type: 'number', minimum: 0, maximum: 100 },
      canaryStrategy: { enum: ['linear', 'exponential', 'adaptive'] },
      rollbackTriggers: {
        type: 'object',
        required: ['rtpDriftPp', 'errorRate', 'latencyP99Multiplier', 'auditCorruption'],
        properties: {
          rtpDriftPp: { type: 'number', minimum: 0, maximum: 100 },
          errorRate: { type: 'number', minimum: 0, maximum: 1 },
          latencyP99Multiplier: { type: 'number', minimum: 1, maximum: 100 },
          auditCorruption: { type: 'boolean' },
        },
      },
      observabilityConfig: {
        type: 'object',
        required: ['scrapeIntervalSec', 'alertWebhooks', 'dashboards'],
        properties: {
          scrapeIntervalSec: { type: 'number', exclusiveMinimum: 0 },
          alertWebhooks: { type: 'array', items: { type: 'string' } },
          dashboards: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  };
}

/** Convenience: produce a baseline manifest with safe defaults. */
export function defaultManifest(
  overrides: Partial<DeploymentManifest> = {}
): DeploymentManifest {
  return {
    version: '1.0.0',
    tenantId: '00000000-0000-0000-0000-000000000000',
    jurisdiction: 'GENERIC',
    games: [{ id: 'test-game-1', version: '1.0.0' }],
    walletProvider: 'stub',
    complianceVerdicts: [
      {
        jurisdiction: 'GENERIC',
        lab: 'internal',
        issuedAt: '2026-01-01T00:00:00Z',
        status: 'pass',
      },
    ],
    rolloutPercent: 100,
    canaryStrategy: 'linear',
    rollbackTriggers: {
      rtpDriftPp: 1,
      errorRate: 0.01,
      latencyP99Multiplier: 1.5,
      auditCorruption: true,
    },
    observabilityConfig: {
      scrapeIntervalSec: 15,
      alertWebhooks: [],
      dashboards: ['dashboard-overview', 'dashboard-tenant'],
    },
    ...overrides,
  };
}
