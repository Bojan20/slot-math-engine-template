import { describe, it, expect } from 'vitest';
import { solveQuantumRng, simulateQuantumRng } from '../src/features/quantumResistantRng.js';

const baseCfg = {
  classicalKeyBits: 2048,
  attackerLogicalQubits: 100,
  pqcMigrationCost: 500_000,
  annualCryptoOperations: 10_000_000,
  perOperationBreachCost: 1,
  migrationHorizonYears: 10,
  pqcSecurityCategory: 3 as const,
  hybridModeEnabled: true,
};

describe('quantumRng — validation', () => {
  it('rejects key bits out of range', () => {
    expect(() => solveQuantumRng({ ...baseCfg, classicalKeyBits: 64 })).toThrow();
    expect(() => solveQuantumRng({ ...baseCfg, classicalKeyBits: 100000 })).toThrow();
  });
  it('rejects negative qubits', () => {
    expect(() => solveQuantumRng({ ...baseCfg, attackerLogicalQubits: -1 })).toThrow();
  });
  it('rejects invalid PQC category', () => {
    expect(() => solveQuantumRng({ ...baseCfg, pqcSecurityCategory: 2 as any })).toThrow();
  });
  it('rejects horizon ≤ 0', () => {
    expect(() => solveQuantumRng({ ...baseCfg, migrationHorizonYears: 0 })).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() => solveQuantumRng({ ...baseCfg, pqcMigrationCost: NaN })).toThrow();
  });
});

describe('quantumRng — math', () => {
  it('Shor qubits = 2·n', () => {
    const r = solveQuantumRng(baseCfg);
    expect(r.shorQubitsRequired).toBe(4096);
  });
  it('attacker cannot break 2048 w/ 100 qubits', () => {
    const r = solveQuantumRng(baseCfg);
    expect(r.attackerCanBreakClassical).toBe(false);
  });
  it('attacker can break with 4096 qubits', () => {
    const r = solveQuantumRng({ ...baseCfg, attackerLogicalQubits: 5000 });
    expect(r.attackerCanBreakClassical).toBe(true);
  });
  it('higher horizon → higher break prob', () => {
    const a = solveQuantumRng({ ...baseCfg, migrationHorizonYears: 1 });
    const b = solveQuantumRng({ ...baseCfg, migrationHorizonYears: 20 });
    expect(b.probBreakWithinHorizon).toBeGreaterThan(a.probBreakWithinHorizon);
  });
});

describe('quantumRng — NIST PQC compliance', () => {
  it('compliant Category III + hybrid', () => {
    const r = solveQuantumRng(baseCfg);
    expect(r.isCompliantNistPqc).toBe(true);
  });
  it('non-compliant Category I', () => {
    const r = solveQuantumRng({ ...baseCfg, pqcSecurityCategory: 1 });
    expect(r.isCompliantNistPqc).toBe(false);
  });
  it('non-compliant without hybrid', () => {
    const r = solveQuantumRng({ ...baseCfg, hybridModeEnabled: false });
    expect(r.isCompliantNistPqc).toBe(false);
  });
});

describe('quantumRng — score + ROI', () => {
  it('score ∈ [0, 1]', () => {
    const r = solveQuantumRng(baseCfg);
    expect(r.quantumReadinessScore).toBeGreaterThanOrEqual(0);
    expect(r.quantumReadinessScore).toBeLessThanOrEqual(1);
  });
  it('ROI > 0 when break prob high', () => {
    const r = solveQuantumRng({ ...baseCfg, attackerLogicalQubits: 4000, perOperationBreachCost: 10 });
    expect(r.pqcMigrationROI).toBeGreaterThan(0);
  });
});

describe('quantumRng — MC', () => {
  it('MC mean exists', () => {
    const mc = simulateQuantumRng(baseCfg, 12345, 200);
    expect(mc.observedExpectedAnnualBreachExposureMean).toBeGreaterThanOrEqual(0);
  });
  it('determinism', () => {
    const a = simulateQuantumRng(baseCfg, 42, 100);
    const b = simulateQuantumRng(baseCfg, 42, 100);
    expect(a.observedExpectedAnnualBreachExposureMean).toBe(b.observedExpectedAnnualBreachExposureMean);
  });
});
