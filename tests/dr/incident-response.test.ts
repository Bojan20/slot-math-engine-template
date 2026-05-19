/**
 * W215 Faza 600.4 — Incident response engine specs.
 */
import { describe, it, expect } from 'vitest';
import {
  IncidentResponseEngine,
  IncidentSeverity,
  IncidentCategory,
  classifySeverity,
  getEscalationRoute,
  requiresPostmortem,
  DEFAULT_SEVERITY_MATRIX,
} from '../../server/lib/incident-response.js';

const T0 = '2026-05-19T08:00:00Z';
const T1 = '2026-05-19T08:01:00Z';
const T2 = '2026-05-19T08:05:00Z';
const T3 = '2026-05-19T08:20:00Z';

describe('W215 IR · classifySeverity matrix', () => {
  it('outage + global → SEV1', () => {
    expect(classifySeverity(IncidentCategory.outage, 'global')).toBe(IncidentSeverity.SEV1);
  });

  it('security + global → SEV1', () => {
    expect(classifySeverity(IncidentCategory.security, 'global')).toBe(IncidentSeverity.SEV1);
  });

  it('security + regional → SEV1 (escalated)', () => {
    expect(classifySeverity(IncidentCategory.security, 'regional')).toBe(IncidentSeverity.SEV1);
  });

  it('outage + tenant → SEV2', () => {
    expect(classifySeverity(IncidentCategory.outage, 'tenant')).toBe(IncidentSeverity.SEV2);
  });

  it('compliance + tenant → SEV2', () => {
    expect(classifySeverity(IncidentCategory.compliance, 'tenant')).toBe(IncidentSeverity.SEV2);
  });

  it('performance + global → SEV2', () => {
    expect(classifySeverity(IncidentCategory.performance, 'global')).toBe(IncidentSeverity.SEV2);
  });

  it('performance + partial → SEV3', () => {
    expect(classifySeverity(IncidentCategory.performance, 'partial')).toBe(IncidentSeverity.SEV3);
  });

  it('outage + partial → SEV3', () => {
    expect(classifySeverity(IncidentCategory.outage, 'partial')).toBe(IncidentSeverity.SEV3);
  });

  it('any + cosmetic → SEV4', () => {
    expect(classifySeverity(IncidentCategory.outage, 'cosmetic')).toBe(IncidentSeverity.SEV4);
    expect(classifySeverity(IncidentCategory.performance, 'cosmetic')).toBe(IncidentSeverity.SEV4);
  });

  it('matrix is frozen', () => {
    expect(Object.isFrozen(DEFAULT_SEVERITY_MATRIX)).toBe(true);
  });
});

describe('W215 IR · requiresPostmortem', () => {
  it('SEV1 yes', () => {
    expect(requiresPostmortem(IncidentSeverity.SEV1)).toBe(true);
  });

  it('SEV2 yes', () => {
    expect(requiresPostmortem(IncidentSeverity.SEV2)).toBe(true);
  });

  it('SEV3 no', () => {
    expect(requiresPostmortem(IncidentSeverity.SEV3)).toBe(false);
  });

  it('SEV4 no', () => {
    expect(requiresPostmortem(IncidentSeverity.SEV4)).toBe(false);
  });
});

describe('W215 IR · getEscalationRoute', () => {
  it('SEV1 → CTO + sre-lead + CEO alert', () => {
    const r = getEscalationRoute(IncidentSeverity.SEV1, IncidentCategory.outage);
    expect(r.primary).toBe('cto');
    expect(r.secondary).toBe('sre-lead');
    expect(r.ceo_alert).toBe(true);
  });

  it('SEV1 compliance triggers regulator notify', () => {
    const r = getEscalationRoute(IncidentSeverity.SEV1, IncidentCategory.compliance);
    expect(r.regulator_notify).toBe(true);
  });

  it('SEV1 data triggers regulator notify', () => {
    const r = getEscalationRoute(IncidentSeverity.SEV1, IncidentCategory.data);
    expect(r.regulator_notify).toBe(true);
  });

  it('SEV1 security triggers regulator notify', () => {
    const r = getEscalationRoute(IncidentSeverity.SEV1, IncidentCategory.security);
    expect(r.regulator_notify).toBe(true);
  });

  it('SEV1 performance does NOT trigger regulator notify', () => {
    const r = getEscalationRoute(IncidentSeverity.SEV1, IncidentCategory.performance);
    expect(r.regulator_notify).toBe(false);
  });

  it('SEV2 → sre-lead + tpm, no CEO', () => {
    const r = getEscalationRoute(IncidentSeverity.SEV2, IncidentCategory.outage);
    expect(r.primary).toBe('sre-lead');
    expect(r.secondary).toBe('tpm');
    expect(r.ceo_alert).toBe(false);
  });

  it('SEV2 compliance triggers regulator notify', () => {
    const r = getEscalationRoute(IncidentSeverity.SEV2, IncidentCategory.compliance);
    expect(r.regulator_notify).toBe(true);
  });

  it('SEV3 → on-call-sre', () => {
    expect(getEscalationRoute(IncidentSeverity.SEV3, IncidentCategory.performance).primary).toBe('on-call-sre');
  });

  it('SEV4 → backlog', () => {
    expect(getEscalationRoute(IncidentSeverity.SEV4, IncidentCategory.performance).primary).toBe('backlog');
  });
});

describe('W215 IR · openIncident', () => {
  it('auto-classifies and assigns role', () => {
    const eng = new IncidentResponseEngine();
    const inc = eng.openIncident({
      id: 'inc-1',
      category: IncidentCategory.outage,
      impactScope: 'global',
      openedAt: T0,
    });
    expect(inc.severity).toBe(IncidentSeverity.SEV1);
    expect(inc.assignedRole).toBe('cto');
    expect(inc.postmortemRequired).toBe(true);
    expect(inc.status).toBe('open');
  });

  it('computes MTTD from detectedAt → openedAt', () => {
    const eng = new IncidentResponseEngine();
    const inc = eng.openIncident({
      id: 'inc-2',
      category: IncidentCategory.outage,
      impactScope: 'global',
      detectedAt: '2026-05-19T07:59:00Z',
      openedAt: T0,
    });
    expect(inc.mttd_seconds).toBe(60);
  });

  it('rejects duplicate id', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'dup', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    expect(() =>
      eng.openIncident({ id: 'dup', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 }),
    ).toThrow(/duplicate_incident_id/);
  });

  it('copies affected tenants list', () => {
    const eng = new IncidentResponseEngine();
    const tenants = ['t-1', 't-2'];
    const inc = eng.openIncident({
      id: 'inc-tenants',
      category: IncidentCategory.outage,
      impactScope: 'tenant',
      openedAt: T0,
      affectedTenants: tenants,
    });
    expect(inc.affectedTenants).toEqual(tenants);
    // Mutating the input must not mutate the recorded list.
    tenants.push('t-3');
    expect(inc.affectedTenants).toHaveLength(2);
  });

  it('summary defaults to category/scope', () => {
    const eng = new IncidentResponseEngine();
    const inc = eng.openIncident({
      id: 'inc-sum',
      category: IncidentCategory.security,
      impactScope: 'tenant',
      openedAt: T0,
    });
    expect(inc.summary).toBe('security / tenant');
  });
});

describe('W215 IR · lifecycle', () => {
  it('acknowledge stamps MTTA', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'lc-1', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    const acked = eng.acknowledge('lc-1', T1);
    expect(acked.status).toBe('acknowledged');
    expect(acked.mtta_seconds).toBe(60);
  });

  it('mitigate sets mitigatedAt', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'lc-2', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    eng.acknowledge('lc-2', T1);
    const mit = eng.mitigate('lc-2', T2);
    expect(mit.status).toBe('mitigated');
    expect(mit.mitigatedAt).toBe(T2);
  });

  it('resolve stamps MTTR', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'lc-3', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    eng.acknowledge('lc-3', T1);
    const res = eng.resolve('lc-3', T3);
    expect(res.status).toBe('resolved');
    expect(res.mttr_seconds).toBe(20 * 60);
  });

  it('cannot acknowledge an already-resolved incident', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'lc-4', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    eng.acknowledge('lc-4', T1);
    eng.resolve('lc-4', T3);
    expect(() => eng.acknowledge('lc-4', T3)).toThrow(/cannot_ack/);
  });

  it('cannot mitigate a resolved incident', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'lc-5', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    eng.resolve('lc-5', T2);
    expect(() => eng.mitigate('lc-5', T3)).toThrow(/cannot_mitigate/);
  });

  it('cannot resolve twice', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'lc-6', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    eng.resolve('lc-6', T2);
    expect(() => eng.resolve('lc-6', T3)).toThrow(/already_resolved/);
  });

  it('throws on unknown id for all transitions', () => {
    const eng = new IncidentResponseEngine();
    expect(() => eng.acknowledge('nope', T1)).toThrow(/unknown_incident/);
    expect(() => eng.mitigate('nope', T1)).toThrow(/unknown_incident/);
    expect(() => eng.resolve('nope', T1)).toThrow(/unknown_incident/);
  });
});

describe('W215 IR · summarizeWindow', () => {
  function seedHistory(): IncidentResponseEngine {
    const eng = new IncidentResponseEngine();
    // SEV1 outage global, resolved fast
    eng.openIncident({ id: 'a', category: IncidentCategory.outage, impactScope: 'global', openedAt: '2026-05-19T07:00:00Z' });
    eng.resolve('a', '2026-05-19T07:05:00Z');
    // SEV2 outage tenant, resolved slower
    eng.openIncident({ id: 'b', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: '2026-05-19T07:10:00Z' });
    eng.resolve('b', '2026-05-19T07:40:00Z');
    // SEV3 performance partial, still open
    eng.openIncident({ id: 'c', category: IncidentCategory.performance, impactScope: 'partial', openedAt: '2026-05-19T07:50:00Z' });
    // SEV1 data global, NOT resolved → postmortem open
    eng.openIncident({ id: 'd', category: IncidentCategory.data, impactScope: 'global', openedAt: '2026-05-19T07:55:00Z' });
    return eng;
  }

  it('rolls up counts by severity', () => {
    const eng = seedHistory();
    const s = eng.summarizeWindow('2026-05-19T08:00:00Z', 1);
    expect(s.total).toBe(4);
    expect(s.bySeverity.SEV1).toBe(2);
    expect(s.bySeverity.SEV2).toBe(1);
    expect(s.bySeverity.SEV3).toBe(1);
    expect(s.bySeverity.SEV4).toBe(0);
  });

  it('computes MTTR percentiles only on resolved incidents', () => {
    const eng = seedHistory();
    const s = eng.summarizeWindow('2026-05-19T08:00:00Z', 1);
    expect(s.mttrSecondsP50).not.toBeNull();
    expect(s.mttrSecondsP95).not.toBeNull();
  });

  it('counts open postmortems for unresolved SEV1/SEV2', () => {
    const eng = seedHistory();
    const s = eng.summarizeWindow('2026-05-19T08:00:00Z', 1);
    expect(s.postmortemsOpen).toBe(1); // only `d` (SEV1, open)
  });

  it('counts regulator-notifiable incidents', () => {
    const eng = seedHistory();
    const s = eng.summarizeWindow('2026-05-19T08:00:00Z', 1);
    // a (SEV1 outage) → no regulator; b (SEV2 outage) → no; d (SEV1 data) → yes
    expect(s.regulatorNotifiable).toBe(1);
  });

  it('rejects non-positive windows', () => {
    const eng = new IncidentResponseEngine();
    expect(() => eng.summarizeWindow('2026-05-19T08:00:00Z', 0)).toThrow(/invalid_window/);
    expect(() => eng.summarizeWindow('2026-05-19T08:00:00Z', -1)).toThrow(/invalid_window/);
  });

  it('returns nulls when no MTTR samples', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'open-only', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: '2026-05-19T07:55:00Z' });
    const s = eng.summarizeWindow('2026-05-19T08:00:00Z', 1);
    expect(s.mttrSecondsP50).toBeNull();
    expect(s.mttrSecondsP95).toBeNull();
  });
});

describe('W215 IR · list/get', () => {
  it('list reflects every recorded incident', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'x', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    eng.openIncident({ id: 'y', category: IncidentCategory.security, impactScope: 'tenant', openedAt: T0 });
    expect(eng.list()).toHaveLength(2);
  });

  it('get returns by id', () => {
    const eng = new IncidentResponseEngine();
    eng.openIncident({ id: 'z', category: IncidentCategory.outage, impactScope: 'tenant', openedAt: T0 });
    expect(eng.get('z')!.id).toBe('z');
    expect(eng.get('missing')).toBeUndefined();
  });
});
