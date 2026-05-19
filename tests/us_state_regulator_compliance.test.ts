import { describe, it, expect } from 'vitest';
import { solveUsStateCompliance, simulateUsStateCompliance } from '../src/features/usStateRegulatorCompliance.js';

const baseCfg = {
  states: [
    { state: 'NJ', minRtp: 0.85, maxRtp: 0.96, actualRtp: 0.93, auditCadenceDays: 30, actualAuditCadenceDays: 28, annualLicensingFee: 50_000, perViolationFine: 500_000, annualViolationProb: 0.05 },
    { state: 'PA', minRtp: 0.85, maxRtp: 0.96, actualRtp: 0.92, auditCadenceDays: 30, actualAuditCadenceDays: 30, annualLicensingFee: 75_000, perViolationFine: 750_000, annualViolationProb: 0.04 },
    { state: 'MI', minRtp: 0.87, maxRtp: 0.95, actualRtp: 0.91, auditCadenceDays: 45, actualAuditCadenceDays: 40, annualLicensingFee: 60_000, perViolationFine: 600_000, annualViolationProb: 0.06 },
  ],
  totalRevenueCapacity: 5_000_000,
};

describe('usStateCompliance — validation', () => {
  it('rejects empty states', () => {
    expect(() => solveUsStateCompliance({ ...baseCfg, states: [] })).toThrow();
  });
  it('rejects too many states', () => {
    const tooMany = Array.from({ length: 35 }, () => ({ ...baseCfg.states[0], state: 'XX' }));
    expect(() => solveUsStateCompliance({ ...baseCfg, states: tooMany })).toThrow();
  });
  it('rejects bad RTP range', () => {
    const bad = [{ ...baseCfg.states[0], minRtp: 0.95, maxRtp: 0.90 }];
    expect(() => solveUsStateCompliance({ ...baseCfg, states: bad })).toThrow();
  });
  it('rejects bad violation prob', () => {
    const bad = [{ ...baseCfg.states[0], annualViolationProb: 1.5 }];
    expect(() => solveUsStateCompliance({ ...baseCfg, states: bad })).toThrow();
  });
});

describe('usStateCompliance — math', () => {
  it('all compliant for clean defaults', () => {
    const r = solveUsStateCompliance(baseCfg);
    expect(r.isCompliantAllStates).toBe(true);
  });
  it('detects non-compliant RTP', () => {
    const bad = [{ ...baseCfg.states[0], actualRtp: 0.50 }];
    const r = solveUsStateCompliance({ ...baseCfg, states: bad });
    expect(r.perStateCompliance[0]).toBe(false);
  });
  it('detects late audit', () => {
    const bad = [{ ...baseCfg.states[0], actualAuditCadenceDays: 60 }];
    const r = solveUsStateCompliance({ ...baseCfg, states: bad });
    expect(r.perStateCompliance[0]).toBe(false);
  });
  it('fraction compliant = correct count / N', () => {
    const r = solveUsStateCompliance(baseCfg);
    expect(r.fractionStatesCompliant).toBeCloseTo(1.0, 4);
  });
  it('total fees = sum', () => {
    const r = solveUsStateCompliance(baseCfg);
    expect(r.totalAnnualLicensingFees).toBe(185_000);
  });
  it('expected fines = Σ p · fine', () => {
    const r = solveUsStateCompliance(baseCfg);
    const expected = 0.05 * 500_000 + 0.04 * 750_000 + 0.06 * 600_000;
    expect(r.totalExpectedAnnualFines).toBeCloseTo(expected, 0);
  });
});

describe('usStateCompliance — MC', () => {
  it('MC mean exists', () => {
    const mc = simulateUsStateCompliance(baseCfg, 12345, 500);
    expect(mc.observedTotalFinesMean).toBeGreaterThanOrEqual(0);
  });
  it('determinism', () => {
    const a = simulateUsStateCompliance(baseCfg, 42, 100);
    const b = simulateUsStateCompliance(baseCfg, 42, 100);
    expect(a.observedTotalFinesMean).toBe(b.observedTotalFinesMean);
  });
});
