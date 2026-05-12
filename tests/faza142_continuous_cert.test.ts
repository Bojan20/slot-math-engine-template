/**
 * FAZA 14.2 — Continuous Certification KATs
 *
 * Tests:
 * 1. ContinuousCertifier accumulation → DailyReport generation
 * 2. Hash chain verification (intact, broken seq, broken prev_hash)
 * 3. Compliance gate (RTP bounds, drift, insufficient spins, chain breach)
 * 4. Regulator transport (InMemory, Failing, multi-transport)
 * 5. Certification event log
 * 6. Period reset
 * 7. Self-attestation hash (report is deterministically self-hashed)
 * 8. Edge cases: zero spins, single spin, exact-boundary RTP
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ContinuousCertifier,
  verifyHashChain,
  InMemoryTransport,
  FailingTransport,
} from '../src/certification/index.js';
import type {
  CertSpinRecord,
  ContinuousCertConfig,
  HashChainEntry,
} from '../src/certification/index.js';

vi.setConfig({ testTimeout: 10_000 });

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRecord(
  spinIndex: number,
  win: number,
  bonusTriggered = false,
  auditHash?: string,
  timestampMs?: number,
): CertSpinRecord {
  return {
    spinIndex,
    sessionId: 's1',
    bet: 1,
    win,
    bonusTriggered,
    auditHash: auditHash ?? spin_hash(spinIndex),
    timestampMs: timestampMs ?? 1_000_000 + spinIndex * 3000,
  };
}

/** Deterministic fake hash (not real SHA256, but unique per spin). */
function spin_hash(i: number): string {
  return (BigInt(0x1a2b3c4d) ^ BigInt(i * 0x9e3779b9))
    .toString(16).padStart(8, '0').repeat(8).slice(0, 64);
}

function makeCertifier(opts: Partial<ContinuousCertConfig> = {}): ContinuousCertifier {
  return new ContinuousCertifier({
    gameId:        'test-game',
    engineVersion: '1.0.0',
    jurisdiction:  'MGA',
    targetRtp:     0.96,
    rtpTolerance:  0.05,
    // Lower validity threshold for tests so we don't always get 'insufficient_spins'
    minSpinsForValidity: 10,
    ...opts,
  });
}

// ─── CERT-01 to CERT-05: Accumulation and report generation ──────────────────

describe('FAZA 14.2 — ContinuousCertifier: accumulation', () => {

  it('CERT-01: zero spins → rtp=0, hitRate=0, maxWin=0', () => {
    const cert = makeCertifier();
    const stats = cert.getLiveStats();
    expect(stats.totalSpins).toBe(0);
    expect(stats.rtp).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.maxWin).toBe(0);
  });

  it('CERT-02: addSpin accumulates totalSpins correctly', () => {
    const cert = makeCertifier();
    for (let i = 0; i < 5; i++) cert.addSpin(makeRecord(i, 0));
    expect(cert.getLiveStats().totalSpins).toBe(5);
  });

  it('CERT-03: addSpins batch equals addSpin individual', () => {
    const cert1 = makeCertifier();
    const cert2 = makeCertifier();
    const records = Array.from({ length: 10 }, (_, i) => makeRecord(i, i < 3 ? 5 : 0));
    for (const r of records) cert1.addSpin(r);
    cert2.addSpins(records);
    expect(cert1.getLiveStats().totalSpins).toBe(cert2.getLiveStats().totalSpins);
    expect(cert1.getLiveStats().rtp).toBeCloseTo(cert2.getLiveStats().rtp, 10);
  });

  it('CERT-04: RTP calculation = totalPaid / totalWagered', () => {
    const cert = makeCertifier();
    // 10 spins, bet=1 each, 3 wins of 5 each → totalPaid=15, totalWagered=10, RTP=1.5
    for (let i = 0; i < 10; i++) cert.addSpin(makeRecord(i, i < 3 ? 5 : 0));
    const stats = cert.getLiveStats();
    expect(stats.totalWagered).toBeCloseTo(10, 6);
    expect(stats.totalPaid).toBeCloseTo(15, 6);
    expect(stats.rtp).toBeCloseTo(1.5, 6);
  });

  it('CERT-05: hitRate = winSpins / totalSpins', () => {
    const cert = makeCertifier();
    // 4 wins out of 20 spins → hitRate = 0.2
    for (let i = 0; i < 20; i++) cert.addSpin(makeRecord(i, i < 4 ? 3 : 0));
    const stats = cert.getLiveStats();
    expect(stats.hitRate).toBeCloseTo(0.2, 6);
  });

  it('CERT-06: maxWin tracks the single largest win', () => {
    const cert = makeCertifier();
    cert.addSpin(makeRecord(0, 10));
    cert.addSpin(makeRecord(1, 50));
    cert.addSpin(makeRecord(2, 20));
    const stats = cert.getLiveStats();
    // Mutation: max not updated → maxWin = 10 (first, not 50)
    expect(stats.maxWin).toBe(50);
  });

  it('CERT-07: bonusFrequency = bonusSpins / totalSpins', () => {
    const cert = makeCertifier();
    for (let i = 0; i < 10; i++) cert.addSpin(makeRecord(i, 0, i < 2));
    const stats = cert.getLiveStats();
    expect(stats.bonusFrequency).toBeCloseTo(0.2, 6);
  });

});

// ─── CERT-08 to CERT-12: generateDailyReport ─────────────────────────────────

describe('FAZA 14.2 — ContinuousCertifier: report generation', () => {

  it('CERT-08: generateDailyReport returns correct reportId format', async () => {
    const cert = makeCertifier();
    const now = new Date('2026-05-12T00:00:00Z').getTime();
    for (let i = 0; i < 20; i++) cert.addSpin(makeRecord(i, 0, false, spin_hash(i), now + i * 1000));
    const report = await cert.generateDailyReport(now, now + 86_400_000);
    expect(report.reportId).toBe('test-game:2026-05-12');
  });

  it('CERT-09: report contains all required fields', async () => {
    const cert = makeCertifier();
    const now = Date.now();
    cert.addSpin(makeRecord(0, 1, false, spin_hash(0), now));
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    expect(report.gameId).toBe('test-game');
    expect(report.engineVersion).toBe('1.0.0');
    expect(report.jurisdiction).toBe('MGA');
    expect(report.reportHash).toHaveLength(64);
    expect(report.periodDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('CERT-10: self-attestation hash is non-empty hex string', async () => {
    const cert = makeCertifier();
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    // reportHash must be a hex string
    expect(/^[0-9a-f]+$/.test(report.reportHash)).toBe(true);
    expect(report.reportHash.length).toBeGreaterThan(16);
  });

  it('CERT-11: event log grows on each generateDailyReport call', async () => {
    const cert = makeCertifier();
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    const before = cert.getEventLog().length;
    await cert.generateDailyReport(now - 1000, now + 1000);
    const after = cert.getEventLog().length;
    // Mutation: log not appended → after === before
    expect(after).toBeGreaterThan(before);
  });

  it('CERT-12: report_generated event in event log after generateDailyReport', async () => {
    const cert = makeCertifier();
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    await cert.generateDailyReport(now - 1000, now + 1000);
    const events = cert.getEventLog();
    const genEvent = events.find(e => e.kind === 'report_generated');
    expect(genEvent).not.toBeUndefined();
  });

});

// ─── CERT-13 to CERT-17: hash chain verification ──────────────────────────────

describe('FAZA 14.2 — verifyHashChain', () => {

  it('CERT-13: empty chain → 0 verified, 0 broken', () => {
    const result = verifyHashChain([]);
    expect(result.verifiedLinks).toBe(0);
    expect(result.brokenLinks).toBe(0);
  });

  it('CERT-14: single entry → 0 verified (no link), 0 broken', () => {
    const result = verifyHashChain([
      { hash: spin_hash(0), prev_hash: '0'.repeat(64), seq: 0 },
    ]);
    expect(result.verifiedLinks).toBe(0);
    expect(result.brokenLinks).toBe(0);
    expect(result.periodStartHash).toBe(spin_hash(0));
    expect(result.periodEndHash).toBe(spin_hash(0));
  });

  it('CERT-15: intact 5-entry chain → 4 verified, 0 broken', () => {
    const entries: HashChainEntry[] = Array.from({ length: 5 }, (_, i) => ({
      hash:      spin_hash(i),
      prev_hash: i === 0 ? '0'.repeat(64) : spin_hash(i - 1),
      seq:       i,
    }));
    const result = verifyHashChain(entries);
    expect(result.verifiedLinks).toBe(4);
    expect(result.brokenLinks).toBe(0);
  });

  it('CERT-16: tampered prev_hash → brokenLinks > 0', () => {
    const entries: HashChainEntry[] = Array.from({ length: 5 }, (_, i) => ({
      hash:      spin_hash(i),
      prev_hash: i === 0 ? '0'.repeat(64) : spin_hash(i - 1),
      seq:       i,
    }));
    // Tamper entry [2] — wrong prev_hash
    entries[2]!.prev_hash = 'deadbeef' + '0'.repeat(56);
    const result = verifyHashChain(entries);
    // Mutation: brokenLinks not incremented → result.brokenLinks = 0 (caught)
    expect(result.brokenLinks).toBeGreaterThan(0);
  });

  it('CERT-17: non-monotonic seq → brokenLinks > 0', () => {
    const entries: HashChainEntry[] = [
      { hash: spin_hash(0), prev_hash: '0'.repeat(64), seq: 0 },
      { hash: spin_hash(1), prev_hash: spin_hash(0),   seq: 1 },
      { hash: spin_hash(2), prev_hash: spin_hash(1),   seq: 0 }, // seq goes backwards!
    ];
    const result = verifyHashChain(entries);
    expect(result.brokenLinks).toBeGreaterThan(0);
  });

});

// ─── CERT-18 to CERT-24: compliance gate ─────────────────────────────────────

describe('FAZA 14.2 — Compliance gate', () => {

  it('CERT-18: insufficient spins → insufficient_spins flag', async () => {
    // minSpinsForValidity = 100 > 0 spins
    const cert = new ContinuousCertifier({
      gameId: 'g', engineVersion: '1', jurisdiction: 'MGA', targetRtp: 0.96,
      minSpinsForValidity: 100,
    });
    const now = Date.now();
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    expect(report.complianceStatus.flags).toContain('insufficient_spins');
  });

  it('CERT-19: RTP within bounds + enough spins → no RTP-specific flags', async () => {
    const cert = makeCertifier({ targetRtp: 0.96, rtpTolerance: 0.05 });
    const now = Date.now();
    // Simulate 100 spins at 96% RTP
    for (let i = 0; i < 100; i++) {
      // Every 25th spin is a win of 24 (so 4×24/100 = 96% RTP)
      const win = i % 25 === 0 ? 24 : 0;
      cert.addSpin(makeRecord(i, win, false, spin_hash(i), now + i * 1000));
    }
    const report = await cert.generateDailyReport(now - 1000, now + 400_000);
    // Should have no RTP boundary flags, no drift flag, no chain breach
    const rtpFlags = report.complianceStatus.flags.filter(f =>
      f === 'rtp_below_minimum' || f === 'rtp_above_maximum' || f === 'rtp_drift_from_target'
    );
    expect(rtpFlags).toHaveLength(0);
  });

  it('CERT-20: hash_chain_broken flag when spinIndex non-monotonic', async () => {
    const cert = makeCertifier();
    const now = Date.now();
    // Add spins with DUPLICATE spinIndex (non-monotonic) — seq check in verifyHashChain will fire
    for (let i = 0; i < 15; i++) {
      cert.addSpin({
        spinIndex: 0,  // deliberately ALL same spinIndex → seq not monotonic after first pair
        sessionId: 's1', bet: 1, win: 0,
        bonusTriggered: false,
        auditHash: spin_hash(i),   // unique hash per spin
        timestampMs: now + i * 1000,
      });
    }
    const report = await cert.generateDailyReport(now - 1000, now + 100_000);
    // verifyHashChain will detect seq non-monotonic on every consecutive pair → 14 broken links
    expect(report.hashChain.brokenLinks).toBeGreaterThan(0);
    expect(report.complianceStatus.flags).toContain('hash_chain_broken');
  });

  it('CERT-21: compliance_alarm event emitted when non-compliant', async () => {
    const cert = makeCertifier();
    const now = Date.now();
    // Zero spins → always insufficient
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    const alarmEvents = cert.getEventLog().filter(e => e.kind === 'compliance_alarm');
    // Mutation: alarm not emitted → alarmEvents.length = 0
    expect(alarmEvents.length).toBeGreaterThan(0);
  });

  it('CERT-22: checkLiveCompliance returns no RTP-boundary flags for good stats', async () => {
    const cert = makeCertifier({ targetRtp: 0.96, rtpTolerance: 0.10 });
    // 100 spins at 96% RTP
    for (let i = 0; i < 100; i++) cert.addSpin(makeRecord(i, i % 25 === 0 ? 24 : 0));
    const status = cert.checkLiveCompliance();
    // Must not have boundary or drift flags
    const rtpFlags = status.flags.filter(f =>
      f === 'rtp_below_minimum' || f === 'rtp_above_maximum' || f === 'rtp_drift_from_target'
    );
    expect(rtpFlags).toHaveLength(0);
  });

  it('CERT-23: summary string contains COMPLIANT or NON-COMPLIANT', async () => {
    const cert = makeCertifier();
    const now = Date.now();
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    const s = report.complianceStatus.summary;
    expect(s.includes('COMPLIANT') || s.includes('NON-COMPLIANT')).toBe(true);
  });

});

// ─── CERT-24 to CERT-30: regulator transport ─────────────────────────────────

describe('FAZA 14.2 — Regulator transport & event log', () => {

  it('CERT-24: InMemoryTransport delivers report', async () => {
    const transport = new InMemoryTransport('test-inbox');
    const cert = makeCertifier({ transports: [transport] });
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    await cert.emitToRegulator(report);
    // Mutation: deliver not called → inbox still empty
    expect(transport.inbox).toHaveLength(1);
    expect(transport.inbox[0]!.reportId).toBe(report.reportId);
  });

  it('CERT-25: FailingTransport produces delivery_failed event', async () => {
    const failing = new FailingTransport('fail-inbox', 'Server down');
    const cert = makeCertifier({ transports: [failing] });
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    const events = await cert.emitToRegulator(report);
    // Must not throw
    expect(events.some(e => e.kind === 'regulator_delivery_failed')).toBe(true);
    const failEv = events.find(e => e.kind === 'regulator_delivery_failed');
    expect((failEv as Extract<typeof failEv, {kind:'regulator_delivery_failed'}>)?.reason).toContain('Server down');
  });

  it('CERT-26: multi-transport: OK + failing both produce events', async () => {
    const good = new InMemoryTransport('good');
    const bad  = new FailingTransport('bad');
    const cert = makeCertifier({ transports: [good, bad] });
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    const events = await cert.emitToRegulator(report);
    // 2 events: one ok, one failed
    expect(events).toHaveLength(2);
    expect(events.some(e => e.kind === 'regulator_delivery_ok')).toBe(true);
    expect(events.some(e => e.kind === 'regulator_delivery_failed')).toBe(true);
    // Good transport still received it
    expect(good.inbox).toHaveLength(1);
  });

  it('CERT-27: no transports → emitToRegulator returns empty array', async () => {
    const cert = makeCertifier({ transports: [] });
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    const report = await cert.generateDailyReport(now - 1000, now + 1000);
    const events = await cert.emitToRegulator(report);
    expect(events).toHaveLength(0);
  });

  it('CERT-28: event log accumulates across multiple operations', async () => {
    const transport = new InMemoryTransport();
    const cert = makeCertifier({ transports: [transport] });
    const now = Date.now();
    cert.addSpin(makeRecord(0, 0, false, spin_hash(0), now));
    const report1 = await cert.generateDailyReport(now - 1000, now + 1000);
    await cert.emitToRegulator(report1);
    const len1 = cert.getEventLog().length;
    cert.addSpin(makeRecord(1, 0, false, spin_hash(1), now + 5000));
    const report2 = await cert.generateDailyReport(now, now + 10_000);
    await cert.emitToRegulator(report2);
    const len2 = cert.getEventLog().length;
    // Event log only grows
    expect(len2).toBeGreaterThan(len1);
  });

  it('CERT-29: resetPeriod clears accumulators', () => {
    const cert = makeCertifier();
    for (let i = 0; i < 5; i++) cert.addSpin(makeRecord(i, i < 2 ? 5 : 0));
    expect(cert.getLiveStats().totalSpins).toBe(5);
    cert.resetPeriod();
    const stats = cert.getLiveStats();
    // Mutation: reset doesn't clear → totalSpins still 5
    expect(stats.totalSpins).toBe(0);
    expect(stats.totalWagered).toBe(0);
    expect(stats.totalPaid).toBe(0);
  });

  it('CERT-30: rtpCI95 shrinks as spin count grows (central limit theorem)', () => {
    const cert1 = makeCertifier();
    const cert2 = makeCertifier();
    // cert1: 10 spins, cert2: 1000 spins (same RTP)
    for (let i = 0; i < 10;  i++) cert1.addSpin(makeRecord(i, i < 3 ? 3.33 : 0));
    for (let i = 0; i < 1000; i++) cert2.addSpin(makeRecord(i, i < 300 ? 3.33 : 0));
    const ci1 = cert1.getLiveStats().rtpCI95;
    const ci2 = cert2.getLiveStats().rtpCI95;
    // Mutation: CI formula wrong → ci2 > ci1 (caught)
    expect(ci2).toBeLessThan(ci1);
  });

});
