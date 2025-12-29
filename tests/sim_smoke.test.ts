/**
 * Simulation Smoke Tests
 *
 * Verifies deterministic behavior and result stability.
 */

import { describe, it, expect } from 'vitest';
import { RNG } from '../src/engine/rng.js';
import { spin } from '../src/engine/spin.js';
import { evaluate } from '../src/engine/evaluate.js';
import { playFreeSpins } from '../src/engine/features.js';
import { StatsAccumulator } from '../src/sim/accumulator.js';
import { hash64, deriveWorkerSeeds, checksumObject } from '../src/utils/hash.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

describe('RNG Determinism', () => {
  it('should produce same sequence with same seed', () => {
    const rng1 = new RNG(12345);
    const rng2 = new RNG(12345);

    const seq1 = Array.from({ length: 100 }, () => rng1.random());
    const seq2 = Array.from({ length: 100 }, () => rng2.random());

    expect(seq1).toEqual(seq2);
  });

  it('should produce different sequences with different seeds', () => {
    const rng1 = new RNG(12345);
    const rng2 = new RNG(54321);

    const seq1 = Array.from({ length: 100 }, () => rng1.random());
    const seq2 = Array.from({ length: 100 }, () => rng2.random());

    expect(seq1).not.toEqual(seq2);
  });

  it('should produce values in [0, 1) range', () => {
    const rng = new RNG(12345);

    for (let i = 0; i < 10000; i++) {
      const val = rng.random();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe('Hash Functions', () => {
  it('should derive unique worker seeds', () => {
    const seeds = deriveWorkerSeeds(12345, 8);

    expect(seeds.length).toBe(8);

    // All seeds should be unique
    const unique = new Set(seeds);
    expect(unique.size).toBe(8);
  });

  it('should produce consistent hashes', () => {
    const hash1 = hash64(12345, 0);
    const hash2 = hash64(12345, 0);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = hash64(12345, 0);
    const hash2 = hash64(12345, 1);
    const hash3 = hash64(54321, 0);

    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});

describe('Small Simulation Determinism', () => {
  it('should produce same results for same seed (10K spins)', () => {
    const bet = 1;
    const seed = 12345;
    const spins = 10000;

    // Run simulation twice
    const runSim = () => {
      const rng = new RNG(seed);
      const accumulator = new StatsAccumulator(bet, 0);

      for (let i = 0; i < spins; i++) {
        const spinData = spin(rng, false);
        const result = evaluate(spinData.grid, rng, 1);

        accumulator.recordBaseSpin(
          result.lineWinTotal,
          result.scatterWin,
          result.multiplier,
          result.triggeredFS
        );

        if (result.triggeredFS) {
          const fsResult = playFreeSpins(result.freeSpinsAwarded, rng, 1);
          accumulator.recordFreeSpinsSession(
            fsResult.totalWin,
            fsResult.spinsPlayed,
            fsResult.retriggerCount,
            result.scatterWin * result.multiplier
          );
        }
      }

      return accumulator.getStatistics();
    };

    const stats1 = runSim();
    const stats2 = runSim();

    // These should be identical
    expect(stats1.spinCount).toBe(stats2.spinCount);
    expect(stats1.rtp.total).toBe(stats2.rtp.total);
    expect(stats1.hitRate).toBe(stats2.hitRate);
    expect(stats1.extremes.maxWin).toBe(stats2.extremes.maxWin);
    expect(stats1.freeSpins.totalTriggers).toBe(stats2.freeSpins.totalTriggers);
  });

  it('should have RTP in reasonable range (10K spins)', () => {
    const rng = new RNG(12345);
    const accumulator = new StatsAccumulator(1, 0);

    for (let i = 0; i < 10000; i++) {
      const spinData = spin(rng, false);
      const result = evaluate(spinData.grid, rng, 1);

      accumulator.recordBaseSpin(
        result.lineWinTotal,
        result.scatterWin,
        result.multiplier,
        result.triggeredFS
      );

      if (result.triggeredFS) {
        const fsResult = playFreeSpins(result.freeSpinsAwarded, rng, 1);
        accumulator.recordFreeSpinsSession(
          fsResult.totalWin,
          fsResult.spinsPlayed,
          fsResult.retriggerCount,
          result.scatterWin * result.multiplier
        );
      }
    }

    const stats = accumulator.getStatistics();

    // RTP should be within very wide range for 10K spins
    // (variance is high with small sample)
    expect(stats.rtp.total).toBeGreaterThan(50);
    expect(stats.rtp.total).toBeLessThan(150);

    // Hit rate should be reasonable
    expect(stats.hitRate).toBeGreaterThan(10);
    expect(stats.hitRate).toBeLessThan(60);
  });
});

describe('Stats Accumulator', () => {
  it('should correctly calculate confidence interval', () => {
    const accumulator = new StatsAccumulator(1, 0);

    // Simulate some fixed wins with variance
    for (let i = 0; i < 1000; i++) {
      // Alternate between 0 and 1 to create variance
      accumulator.recordBaseSpin(i % 2 === 0 ? 0.5 : 0, 0, 1, false);
    }

    const stats = accumulator.getStatistics();

    expect(stats.rtp.ci95Margin).toBeGreaterThan(0);
    expect(stats.rtp.ci95Low).toBeLessThan(stats.rtp.total);
    expect(stats.rtp.ci95High).toBeGreaterThan(stats.rtp.total);
  });

  it('should correctly merge accumulators', () => {
    const acc1 = new StatsAccumulator(1, 0);
    const acc2 = new StatsAccumulator(1, 1);

    // Add some data to each
    for (let i = 0; i < 100; i++) {
      acc1.recordBaseSpin(0.5, 0, 1, false);
      acc2.recordBaseSpin(1.0, 0, 1, false);
    }

    const data1 = acc1.getData();

    acc2.merge(data1);

    const stats = acc2.getStatistics();

    expect(stats.spinCount).toBe(200);
    expect(stats.hitRate).toBe(100); // All wins
  });

  it('should track histogram correctly', () => {
    const accumulator = new StatsAccumulator(1, 0);

    // Record dead spins
    for (let i = 0; i < 50; i++) {
      accumulator.recordBaseSpin(0, 0, 1, false);
    }

    // Record small wins
    for (let i = 0; i < 30; i++) {
      accumulator.recordBaseSpin(0.5, 0, 1, false);
    }

    // Record medium wins
    for (let i = 0; i < 20; i++) {
      accumulator.recordBaseSpin(5, 0, 1, false);
    }

    const stats = accumulator.getStatistics();

    // Check histogram distribution
    const deadBin = stats.histogram.find(b => b.label === '0x (Dead)');
    const smallBin = stats.histogram.find(b => b.label === '0.2-0.5x');
    const mediumBin = stats.histogram.find(b => b.label === '2-5x');

    expect(deadBin?.count).toBe(50);
    expect(smallBin?.count).toBe(30);
    expect(mediumBin?.count).toBe(20);
  });
});

describe('Config Checksum', () => {
  it('should produce stable checksum for same config', () => {
    const checksum1 = checksumObject(GAME_CONFIG);
    const checksum2 = checksumObject(GAME_CONFIG);

    expect(checksum1).toBe(checksum2);
  });

  it('should produce different checksum for different config', () => {
    const config1 = { ...GAME_CONFIG };
    const config2 = { ...GAME_CONFIG, targetRTP: 0.95 };

    const checksum1 = checksumObject(config1);
    const checksum2 = checksumObject(config2);

    expect(checksum1).not.toBe(checksum2);
  });
});
