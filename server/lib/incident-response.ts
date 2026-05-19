/**
 * W215 Faza 600.4 — Incident response engine.
 *
 * Captures the operational lifecycle of an incident: open → ack →
 * mitigate → resolve, with auto-classification by category + impact
 * scope, and a deterministic escalation matrix per severity. All
 * timestamps are caller-injected ISO strings so the engine is pure
 * and unit-testable.
 *
 * Severity matrix (`DEFAULT_SEVERITY_MATRIX`):
 *
 *   - SEV1 = global outage or security/data incident, any scope
 *   - SEV2 = single-tenant outage, regional security event,
 *           compliance breach
 *   - SEV3 = degraded performance, partial feature outage
 *   - SEV4 = cosmetic / non-customer-impacting
 *
 * Postmortems are mandatory for SEV1/SEV2.
 */

// ---------------------------------------------------------------------------
// Enums + types
// ---------------------------------------------------------------------------

export enum IncidentSeverity {
  SEV1 = 'SEV1',
  SEV2 = 'SEV2',
  SEV3 = 'SEV3',
  SEV4 = 'SEV4',
}

export enum IncidentCategory {
  outage = 'outage',
  security = 'security',
  data = 'data',
  compliance = 'compliance',
  performance = 'performance',
}

export type IncidentStatus = 'open' | 'acknowledged' | 'mitigated' | 'resolved';

export type ImpactScope = 'global' | 'regional' | 'tenant' | 'partial' | 'cosmetic';

export type EscalationRole =
  | 'on-call-sre'
  | 'sre-lead'
  | 'incident-manager'
  | 'security-lead'
  | 'tpm'
  | 'cto'
  | 'ceo'
  | 'regulator-liaison'
  | 'comms-lead'
  | 'backlog';

export interface OpenIncidentInput {
  readonly id: string;
  readonly category: IncidentCategory;
  readonly impactScope: ImpactScope;
  readonly openedAt: string;
  readonly affectedTenants?: ReadonlyArray<string>;
  readonly detectedAt?: string; // first signal — for MTTD
  readonly summary?: string;
}

export interface Incident {
  readonly id: string;
  readonly severity: IncidentSeverity;
  readonly category: IncidentCategory;
  readonly impactScope: ImpactScope;
  readonly status: IncidentStatus;
  readonly openedAt: string;
  readonly detectedAt: string;
  readonly acknowledgedAt?: string;
  readonly mitigatedAt?: string;
  readonly closedAt?: string;
  readonly mttd_seconds?: number;
  readonly mtta_seconds?: number;
  readonly mttr_seconds?: number;
  readonly postmortemRequired: boolean;
  readonly assignedRole: EscalationRole;
  readonly affectedTenants: ReadonlyArray<string>;
  readonly summary: string;
}

export interface EscalationRoute {
  readonly primary: EscalationRole;
  readonly secondary: EscalationRole;
  readonly ceo_alert: boolean;
  readonly regulator_notify: boolean;
}

export interface WindowSummary {
  readonly windowHours: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly total: number;
  readonly bySeverity: Readonly<Record<IncidentSeverity, number>>;
  readonly mttrSecondsP50: number | null;
  readonly mttrSecondsP95: number | null;
  readonly postmortemsOpen: number;
  readonly regulatorNotifiable: number;
}

// ---------------------------------------------------------------------------
// Severity matrix
// ---------------------------------------------------------------------------

interface SeverityRule {
  readonly category: IncidentCategory;
  readonly impactScope: ImpactScope;
  readonly severity: IncidentSeverity;
}

/**
 * Canonical matrix. Walked top-to-bottom; first match wins. The
 * default rule (last entry) catches anything unmatched as SEV4.
 */
export const DEFAULT_SEVERITY_MATRIX: ReadonlyArray<SeverityRule> = Object.freeze([
  { category: IncidentCategory.outage, impactScope: 'global', severity: IncidentSeverity.SEV1 },
  { category: IncidentCategory.security, impactScope: 'global', severity: IncidentSeverity.SEV1 },
  { category: IncidentCategory.data, impactScope: 'global', severity: IncidentSeverity.SEV1 },
  { category: IncidentCategory.security, impactScope: 'regional', severity: IncidentSeverity.SEV1 },
  { category: IncidentCategory.data, impactScope: 'regional', severity: IncidentSeverity.SEV1 },
  { category: IncidentCategory.compliance, impactScope: 'global', severity: IncidentSeverity.SEV1 },
  { category: IncidentCategory.outage, impactScope: 'regional', severity: IncidentSeverity.SEV2 },
  { category: IncidentCategory.outage, impactScope: 'tenant', severity: IncidentSeverity.SEV2 },
  { category: IncidentCategory.security, impactScope: 'tenant', severity: IncidentSeverity.SEV2 },
  { category: IncidentCategory.data, impactScope: 'tenant', severity: IncidentSeverity.SEV2 },
  { category: IncidentCategory.compliance, impactScope: 'regional', severity: IncidentSeverity.SEV2 },
  { category: IncidentCategory.compliance, impactScope: 'tenant', severity: IncidentSeverity.SEV2 },
  { category: IncidentCategory.performance, impactScope: 'global', severity: IncidentSeverity.SEV2 },
  { category: IncidentCategory.outage, impactScope: 'partial', severity: IncidentSeverity.SEV3 },
  { category: IncidentCategory.performance, impactScope: 'regional', severity: IncidentSeverity.SEV3 },
  { category: IncidentCategory.performance, impactScope: 'tenant', severity: IncidentSeverity.SEV3 },
  { category: IncidentCategory.security, impactScope: 'partial', severity: IncidentSeverity.SEV3 },
  { category: IncidentCategory.data, impactScope: 'partial', severity: IncidentSeverity.SEV3 },
  { category: IncidentCategory.compliance, impactScope: 'partial', severity: IncidentSeverity.SEV3 },
  { category: IncidentCategory.performance, impactScope: 'partial', severity: IncidentSeverity.SEV3 },
]);

export function classifySeverity(
  category: IncidentCategory,
  impactScope: ImpactScope,
  matrix: ReadonlyArray<SeverityRule> = DEFAULT_SEVERITY_MATRIX,
): IncidentSeverity {
  for (const rule of matrix) {
    if (rule.category === category && rule.impactScope === impactScope) {
      return rule.severity;
    }
  }
  return IncidentSeverity.SEV4;
}

export function requiresPostmortem(severity: IncidentSeverity): boolean {
  return severity === IncidentSeverity.SEV1 || severity === IncidentSeverity.SEV2;
}

// ---------------------------------------------------------------------------
// Escalation matrix
// ---------------------------------------------------------------------------

export function getEscalationRoute(
  severity: IncidentSeverity,
  category: IncidentCategory,
): EscalationRoute {
  if (severity === IncidentSeverity.SEV1) {
    return {
      primary: 'cto',
      secondary: 'sre-lead',
      ceo_alert: true,
      regulator_notify: category === IncidentCategory.compliance
        || category === IncidentCategory.data
        || category === IncidentCategory.security,
    };
  }
  if (severity === IncidentSeverity.SEV2) {
    return {
      primary: 'sre-lead',
      secondary: 'tpm',
      ceo_alert: false,
      regulator_notify: category === IncidentCategory.compliance,
    };
  }
  if (severity === IncidentSeverity.SEV3) {
    return {
      primary: 'on-call-sre',
      secondary: 'incident-manager',
      ceo_alert: false,
      regulator_notify: false,
    };
  }
  return {
    primary: 'backlog',
    secondary: 'tpm',
    ceo_alert: false,
    regulator_notify: false,
  };
}

function primaryRole(route: EscalationRoute): EscalationRole {
  return route.primary;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function diffSeconds(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    throw new Error(`invalid_ts: ${a} or ${b}`);
  }
  return Math.max(0, Math.round((tb - ta) / 1000));
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

export class IncidentResponseEngine {
  private readonly incidents = new Map<string, Incident>();

  openIncident(input: OpenIncidentInput): Incident {
    if (this.incidents.has(input.id)) {
      throw new Error(`duplicate_incident_id: ${input.id}`);
    }
    const severity = classifySeverity(input.category, input.impactScope);
    const route = getEscalationRoute(severity, input.category);
    const detectedAt = input.detectedAt ?? input.openedAt;
    const mttd = diffSeconds(detectedAt, input.openedAt);
    const incident: Incident = {
      id: input.id,
      severity,
      category: input.category,
      impactScope: input.impactScope,
      status: 'open',
      openedAt: input.openedAt,
      detectedAt,
      mttd_seconds: mttd,
      postmortemRequired: requiresPostmortem(severity),
      assignedRole: primaryRole(route),
      affectedTenants: input.affectedTenants ? [...input.affectedTenants] : [],
      summary: input.summary ?? `${input.category} / ${input.impactScope}`,
    };
    this.incidents.set(incident.id, incident);
    return incident;
  }

  acknowledge(id: string, ts: string): Incident {
    const inc = this.requireIncident(id);
    if (inc.status !== 'open') {
      throw new Error(`cannot_ack_${inc.status}_incident: ${id}`);
    }
    const mtta = diffSeconds(inc.openedAt, ts);
    const updated: Incident = {
      ...inc,
      status: 'acknowledged',
      acknowledgedAt: ts,
      mtta_seconds: mtta,
    };
    this.incidents.set(id, updated);
    return updated;
  }

  mitigate(id: string, ts: string): Incident {
    const inc = this.requireIncident(id);
    if (inc.status !== 'acknowledged' && inc.status !== 'open') {
      throw new Error(`cannot_mitigate_${inc.status}_incident: ${id}`);
    }
    const updated: Incident = {
      ...inc,
      status: 'mitigated',
      mitigatedAt: ts,
    };
    this.incidents.set(id, updated);
    return updated;
  }

  resolve(id: string, ts: string): Incident {
    const inc = this.requireIncident(id);
    if (inc.status === 'resolved') {
      throw new Error(`already_resolved: ${id}`);
    }
    const mttr = diffSeconds(inc.openedAt, ts);
    const updated: Incident = {
      ...inc,
      status: 'resolved',
      closedAt: ts,
      mttr_seconds: mttr,
    };
    this.incidents.set(id, updated);
    return updated;
  }

  classifySeverity(category: IncidentCategory, impactScope: ImpactScope): IncidentSeverity {
    return classifySeverity(category, impactScope);
  }

  requiresPostmortem(severity: IncidentSeverity): boolean {
    return requiresPostmortem(severity);
  }

  getEscalationRoute(severity: IncidentSeverity, category: IncidentCategory): EscalationRoute {
    return getEscalationRoute(severity, category);
  }

  get(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  list(): Incident[] {
    return [...this.incidents.values()];
  }

  /**
   * Roll up incident KPIs over a window ending at `now`. The window
   * matches incidents whose `openedAt` falls inside `[now - h, now]`.
   */
  summarizeWindow(now: string, windowHours: number): WindowSummary {
    if (windowHours <= 0 || !Number.isFinite(windowHours)) {
      throw new Error(`invalid_window: ${windowHours}`);
    }
    const end = Date.parse(now);
    if (Number.isNaN(end)) throw new Error(`invalid_now: ${now}`);
    const startMs = end - windowHours * 3600 * 1000;
    const windowStart = new Date(startMs).toISOString();
    const within = this.list().filter(inc => {
      const t = Date.parse(inc.openedAt);
      return t >= startMs && t <= end;
    });
    const bySeverity: Record<IncidentSeverity, number> = {
      [IncidentSeverity.SEV1]: 0,
      [IncidentSeverity.SEV2]: 0,
      [IncidentSeverity.SEV3]: 0,
      [IncidentSeverity.SEV4]: 0,
    };
    let regulatorNotifiable = 0;
    let postmortemsOpen = 0;
    const mttrSamples: number[] = [];
    for (const inc of within) {
      bySeverity[inc.severity] += 1;
      const route = getEscalationRoute(inc.severity, inc.category);
      if (route.regulator_notify) regulatorNotifiable += 1;
      if (inc.postmortemRequired && inc.status !== 'resolved') postmortemsOpen += 1;
      if (typeof inc.mttr_seconds === 'number') mttrSamples.push(inc.mttr_seconds);
    }
    return {
      windowHours,
      windowStart,
      windowEnd: now,
      total: within.length,
      bySeverity,
      mttrSecondsP50: percentile(mttrSamples, 50),
      mttrSecondsP95: percentile(mttrSamples, 95),
      postmortemsOpen,
      regulatorNotifiable,
    };
  }

  private requireIncident(id: string): Incident {
    const inc = this.incidents.get(id);
    if (!inc) throw new Error(`unknown_incident: ${id}`);
    return inc;
  }
}
