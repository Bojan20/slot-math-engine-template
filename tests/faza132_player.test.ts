import { describe, it, expect } from 'vitest';
import { PlayerBehaviorSimulator, PLAYER_PROFILES } from '../src/player/index.js';
import type { SessionSimConfig } from '../src/player/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCasualConfig(overrides: Partial<SessionSimConfig> = {}): SessionSimConfig {
  return {
    profile: PLAYER_PROFILES.casual,
    initialBankroll: 1000,
    gameRtp: 0.96,
    gameHitRate: 0.35,
    gameVolatility: 1.0,
    numSessions: 50,
    seed: 42,
    ...overrides,
  };
}

const VALID_CHURN_REASONS = new Set(['bankrupt', 'time_limit', 'loss_streak', 'target_reached']);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Faza 13.2 — Player Behavior Simulator', () => {
  // PLY-01
  it('PLY-01: can construct PlayerBehaviorSimulator', () => {
    const sim = new PlayerBehaviorSimulator();
    expect(sim).toBeDefined();
    expect(typeof sim.simulate).toBe('function');
  });

  // PLY-02
  it('PLY-02: simulate resolves to a PlayerSimulationResult', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig());
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  // PLY-03
  it('PLY-03: result has all required fields', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig());
    const requiredFields = [
      'profile', 'numSessions', 'avgSessionDuration', 'avgSpinsPerSession',
      'avgTotalWagered', 'avgTotalWon', 'avgPerceivedRtp', 'mathRtp',
      'churnReasons', 'bankruptcyRate', 'lossStreakChurnRate', 'sessions',
    ];
    for (const field of requiredFields) {
      expect(result, `missing field: ${field}`).toHaveProperty(field);
    }
  });

  // PLY-04
  it('PLY-04: numSessions in result matches config', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 20 }));
    expect(result.numSessions).toBe(20);
  });

  // PLY-05
  it('PLY-05: sessions.length equals numSessions', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 30 }));
    expect(result.sessions.length).toBe(30);
  });

  // PLY-06
  it('PLY-06: avgSessionDuration > 0', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig());
    expect(result.avgSessionDuration).toBeGreaterThan(0);
  });

  // PLY-07
  it('PLY-07: each session has a valid churnReason', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 100 }));
    for (const session of result.sessions) {
      expect(VALID_CHURN_REASONS.has(session.churnReason)).toBe(true);
    }
  });

  // PLY-08
  it('PLY-08: bankruptcyRate = bankrupt count / numSessions', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 100 }));
    const bankruptCount = result.sessions.filter((s) => s.churnReason === 'bankrupt').length;
    expect(result.bankruptcyRate).toBeCloseTo(bankruptCount / result.numSessions, 5);
  });

  // PLY-09
  it('PLY-09: lossStreakChurnRate = loss_streak count / numSessions', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 100 }));
    const lsCount = result.sessions.filter((s) => s.churnReason === 'loss_streak').length;
    expect(result.lossStreakChurnRate).toBeCloseTo(lsCount / result.numSessions, 5);
  });

  // PLY-10
  it('PLY-10: churnReasons values sum to numSessions', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 80 }));
    const sum = Object.values(result.churnReasons).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.numSessions);
  });

  // PLY-11
  it('PLY-11: all sessions have finalBankroll >= 0', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 50 }));
    for (const session of result.sessions) {
      expect(session.finalBankroll).toBeGreaterThanOrEqual(0);
    }
  });

  // PLY-12
  it('PLY-12: same seed produces deterministic results', async () => {
    const sim = new PlayerBehaviorSimulator();
    const cfg = makeCasualConfig({ seed: 1234, numSessions: 20 });
    const r1 = await sim.simulate(cfg);
    const r2 = await sim.simulate(cfg);
    expect(r1.avgSessionDuration).toBe(r2.avgSessionDuration);
    expect(r1.mathRtp).toBe(r2.mathRtp);
    expect(r1.sessions[0]!.totalSpins).toBe(r2.sessions[0]!.totalSpins);
  });

  // PLY-13
  it('PLY-13: different seeds produce different results', async () => {
    const sim = new PlayerBehaviorSimulator();
    const r1 = await sim.simulate(makeCasualConfig({ seed: 1, numSessions: 50 }));
    const r2 = await sim.simulate(makeCasualConfig({ seed: 999, numSessions: 50 }));
    // Very unlikely to be identical across 50 sessions
    expect(r1.avgSpinsPerSession).not.toBe(r2.avgSpinsPerSession);
  });

  // PLY-14
  it('PLY-14: high_roller has more avg spins per session than casual', async () => {
    const sim = new PlayerBehaviorSimulator();
    const casualResult = await sim.simulate(makeCasualConfig({ numSessions: 100, seed: 7 }));
    const hrResult = await sim.simulate({
      profile: PLAYER_PROFILES.high_roller,
      initialBankroll: 10000,
      gameRtp: 0.96,
      gameHitRate: 0.35,
      numSessions: 100,
      seed: 7,
    });
    expect(hrResult.avgSpinsPerSession).toBeGreaterThan(casualResult.avgSpinsPerSession);
  });

  // PLY-15
  it('PLY-15: PLAYER_PROFILES.casual has correct spinsPerMinute', () => {
    expect(PLAYER_PROFILES.casual.spinsPerMinute).toBe(10);
  });

  // PLY-16
  it('PLY-16: PLAYER_PROFILES.whale has correct betFractionOfBankroll', () => {
    expect(PLAYER_PROFILES.whale.betFractionOfBankroll).toBe(0.005);
  });

  // PLY-17
  it('PLY-17: PLAYER_PROFILES.regular has correct churnAfterLosses', () => {
    expect(PLAYER_PROFILES.regular.churnAfterLosses).toBe(15);
  });

  // PLY-18
  it('PLY-18: PLAYER_PROFILES.high_roller has correct recencyBias', () => {
    expect(PLAYER_PROFILES.high_roller.recencyBias).toBe(0.3);
  });

  // PLY-19
  it('PLY-19: perceivedRtp != mathRtp for sessions (recency bias effect)', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 50, seed: 12345 }));
    // At least some sessions should have differing perceived vs math RTP
    const hasDiff = result.sessions.some(
      (s) => Math.abs(s.perceivedRtp - s.mathematicalRtp) > 0.001,
    );
    expect(hasDiff).toBe(true);
  });

  // PLY-20
  it('PLY-20: spins array length equals totalSpins', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 30 }));
    for (const session of result.sessions) {
      expect(session.spins.length).toBe(session.totalSpins);
    }
  });

  // PLY-21
  it('PLY-21: each spin has required fields: bet, win, bankroll, consecutiveLosses', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 10 }));
    for (const session of result.sessions) {
      for (const spin of session.spins) {
        expect(spin).toHaveProperty('bet');
        expect(spin).toHaveProperty('win');
        expect(spin).toHaveProperty('bankroll');
        expect(spin).toHaveProperty('consecutiveLosses');
      }
    }
  });

  // PLY-22
  it('PLY-22: bet > 0 for all spins', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 20 }));
    for (const session of result.sessions) {
      for (const spin of session.spins) {
        expect(spin.bet).toBeGreaterThan(0);
      }
    }
  });

  // PLY-23
  it('PLY-23: win >= 0 for all spins', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 20 }));
    for (const session of result.sessions) {
      for (const spin of session.spins) {
        expect(spin.win).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // PLY-24
  it('PLY-24: churnReasons proportions sum to 1.0', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig({ numSessions: 100 }));
    const total = Object.values(result.churnReasons).reduce((a, b) => a + b, 0);
    const sum = total / result.numSessions;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  // PLY-25
  it('PLY-25: profile field in result matches config profile', async () => {
    const sim = new PlayerBehaviorSimulator();
    const result = await sim.simulate(makeCasualConfig());
    expect(result.profile).toBe('casual');
    const whaleResult = await sim.simulate({
      profile: PLAYER_PROFILES.whale,
      initialBankroll: 50000,
      gameRtp: 0.96,
      gameHitRate: 0.30,
      numSessions: 10,
      seed: 1,
    });
    expect(whaleResult.profile).toBe('whale');
  });
});
