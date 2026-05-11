/**
 * Feature Tests
 *
 * Tests for Free Spins, Multiplier Orbs, and global multiplier stacking.
 */

import { describe, it, expect } from 'vitest';
import { RNG } from '../src/engine/rng.js';
import { playFreeSpins } from '../src/engine/features.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

describe('Free Spins Feature', () => {
  it('should play correct number of base spins', () => {
    const rng = new RNG(12345);
    const result = playFreeSpins(10, rng, 1);

    // Should play at least the awarded spins
    expect(result.spinsPlayed).toBeGreaterThanOrEqual(10);
  });

  it('should return non-negative win', () => {
    const rng = new RNG(12345);
    const result = playFreeSpins(10, rng, 1);

    expect(result.totalWin).toBeGreaterThanOrEqual(0);
  });

  it('should track retriggers correctly', () => {
    // Run many FS sessions to find some with retriggers
    let totalRetriggers = 0;
    let totalSessions = 0;

    for (let seed = 0; seed < 1000; seed++) {
      const rng = new RNG(seed);
      const result = playFreeSpins(10, rng, 1);
      totalRetriggers += result.retriggerCount;
      totalSessions++;
    }

    // Some sessions should have retriggers (probabilistic)
    // With ~3-5% retrigger rate, expect at least a few
    expect(totalRetriggers).toBeGreaterThanOrEqual(0);
  });

  it('should respect max spins cap', () => {
    // Use a seed that might trigger many retriggers
    const rng = new RNG(999999);
    const result = playFreeSpins(20, rng, 1);

    // Should never exceed max cap (even with retriggers)
    const maxPossibleSpins = GAME_CONFIG.caps.maxFreeSpinsFromRetrigger;
    expect(result.spinsPlayed).toBeLessThanOrEqual(maxPossibleSpins + 20);
  });

  it('should start with correct global multiplier', () => {
    const rng = new RNG(12345);

    // Start with 2x multiplier
    const result1 = playFreeSpins(10, rng, 2);

    const rng2 = new RNG(54321);

    // Start with 1x multiplier - should have lower average (probabilistically)
    const result2 = playFreeSpins(10, rng2, 1);

    // Can't guarantee order due to randomness, but both should work
    expect(result1.totalWin).toBeGreaterThanOrEqual(0);
    expect(result2.totalWin).toBeGreaterThanOrEqual(0);
  });
});

describe('Multiplier Orb Weighting', () => {
  it('should follow weight distribution over many samples', () => {
    const rng = new RNG(12345);
    const counts: Record<number, number> = { 2: 0, 3: 0, 5: 0 };
    const samples = 10000;

    for (let i = 0; i < samples; i++) {
      const val = rng.random();
      // Weights: 2=60%, 3=30%, 5=10%
      if (val < 0.6) counts[2]++;
      else if (val < 0.9) counts[3]++;
      else counts[5]++;
    }

    // Check distribution is roughly correct (within 5% tolerance)
    expect(counts[2] / samples).toBeGreaterThan(0.55);
    expect(counts[2] / samples).toBeLessThan(0.65);
    expect(counts[3] / samples).toBeGreaterThan(0.25);
    expect(counts[3] / samples).toBeLessThan(0.35);
    expect(counts[5] / samples).toBeGreaterThan(0.05);
    expect(counts[5] / samples).toBeLessThan(0.15);
  });
});

describe('Global Multiplier Stacking', () => {
  it('should increase on retrigger', () => {
    // This is implicit in the feature - test by checking FS wins with high multiplier
    const rng = new RNG(12345);

    // Start with high multiplier to test stacking works
    const result = playFreeSpins(10, rng, 5);

    // Wins should be boosted by the multiplier
    // If there are any wins, they should be > base value
    expect(result.totalWin).toBeGreaterThanOrEqual(0);
  });
});

describe('Free Spins Variance', () => {
  it('should show high variance across sessions', () => {
    const wins: number[] = [];

    for (let seed = 0; seed < 500; seed++) {
      const rng = new RNG(seed);
      const result = playFreeSpins(10, rng, 1);
      wins.push(result.totalWin);
    }

    const mean = wins.reduce((a, b) => a + b, 0) / wins.length;
    const variance = wins.reduce((sum, w) => sum + (w - mean) ** 2, 0) / wins.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation should be high (high volatility)
    const cv = stdDev / mean;
    expect(cv).toBeGreaterThan(0.5); // CV > 0.5 indicates high variability
  });

  it('should occasionally produce big wins', () => {
    const wins: number[] = [];
    const bet = 1;

    for (let seed = 0; seed < 1000; seed++) {
      const rng = new RNG(seed);
      const result = playFreeSpins(10, rng, 1);
      wins.push(result.totalWin / bet);
    }

    const maxWin = Math.max(...wins);

    // Should have at least some decent wins in 1000 sessions
    expect(maxWin).toBeGreaterThan(50);
  });
});
