/**
 * Precision Tests
 *
 * Verifies integer credits system and bigint overflow prevention.
 */

import { describe, it, expect } from 'vitest';
import {
  CREDIT_SCALE,
  betToCredits,
  creditsToMoney,
  calculateWinCredits,
  calculatePayoutCredits,
  applyMultiplier,
  getWinMultiplier,
  isValidCreditAmount,
  CreditAccumulator
} from '../src/utils/credits.js';
import {
  BigIntSumSquared,
  BigIntSum,
  calculateVarianceBigInt,
  needsBigInt,
  shouldUseBigInt,
  BIGINT_SPIN_THRESHOLD
} from '../src/utils/bigintStats.js';

describe('Integer Credits System', () => {
  describe('Conversion Functions', () => {
    it('should convert bet to credits correctly', () => {
      expect(betToCredits(1)).toBe(100);
      expect(betToCredits(10)).toBe(1000);
      expect(betToCredits(0.5)).toBe(50);
      expect(betToCredits(0.01)).toBe(1);
    });

    it('should convert credits to money correctly', () => {
      expect(creditsToMoney(100)).toBe(1);
      expect(creditsToMoney(1000)).toBe(10);
      expect(creditsToMoney(50)).toBe(0.5);
      expect(creditsToMoney(1)).toBe(0.01);
    });

    it('should be reversible (bet -> credits -> money)', () => {
      const bets = [1, 5, 10, 0.5, 0.25, 100];
      for (const bet of bets) {
        const credits = betToCredits(bet);
        const money = creditsToMoney(credits);
        expect(money).toBe(bet);
      }
    });
  });

  describe('Win Calculations', () => {
    it('should calculate integer win credits', () => {
      const betCredits = betToCredits(1); // 100 credits

      // 5x win
      const win5x = calculatePayoutCredits(betCredits, 5);
      expect(win5x).toBe(500);
      expect(creditsToMoney(win5x)).toBe(5);

      // 100x win
      const win100x = calculatePayoutCredits(betCredits, 100);
      expect(win100x).toBe(10000);
      expect(creditsToMoney(win100x)).toBe(100);
    });

    it('should apply multipliers correctly', () => {
      const winCredits = 500; // 5x win in credits

      expect(applyMultiplier(winCredits, 1)).toBe(500);
      expect(applyMultiplier(winCredits, 2)).toBe(1000);
      expect(applyMultiplier(winCredits, 3)).toBe(1500);
      expect(applyMultiplier(winCredits, 10)).toBe(5000);
    });

    it('should handle non-integer multipliers', () => {
      const winCredits = 100;

      // 1.5x multiplier
      const result = applyMultiplier(winCredits, 1.5);
      expect(result).toBe(150);

      // 2.5x multiplier
      const result2 = applyMultiplier(winCredits, 2.5);
      expect(result2).toBe(250);
    });

    it('should calculate win multiplier correctly', () => {
      const betCredits = 100;

      expect(getWinMultiplier(500, betCredits)).toBe(5);
      expect(getWinMultiplier(10000, betCredits)).toBe(100);
      expect(getWinMultiplier(0, betCredits)).toBe(0);
    });
  });

  describe('Credit Validation', () => {
    it('should validate credit amounts', () => {
      expect(isValidCreditAmount(100)).toBe(true);
      expect(isValidCreditAmount(0)).toBe(true);
      expect(isValidCreditAmount(1000000)).toBe(true);

      expect(isValidCreditAmount(-1)).toBe(false);
      expect(isValidCreditAmount(1.5)).toBe(false);
      expect(isValidCreditAmount(Infinity)).toBe(false);
      expect(isValidCreditAmount(NaN)).toBe(false);
    });
  });

  describe('Credit Accumulator', () => {
    it('should accumulate credits correctly', () => {
      const acc = new CreditAccumulator();

      acc.add(100);
      acc.add(200);
      acc.add(300);

      expect(acc.getTotal()).toBe(600);
      expect(acc.getCount()).toBe(3);
      expect(acc.getMeanCredits()).toBe(200);
      expect(acc.getTotalAsMoney()).toBe(6);
      expect(acc.getMeanAsMoney()).toBe(2);
    });

    it('should merge accumulators', () => {
      const acc1 = new CreditAccumulator();
      const acc2 = new CreditAccumulator();

      acc1.add(100);
      acc1.add(200);
      acc2.add(300);
      acc2.add(400);

      acc1.merge(acc2);

      expect(acc1.getTotal()).toBe(1000);
      expect(acc1.getCount()).toBe(4);
    });

    it('should reset correctly', () => {
      const acc = new CreditAccumulator();
      acc.add(100);
      acc.add(200);

      acc.reset();

      expect(acc.getTotal()).toBe(0);
      expect(acc.getCount()).toBe(0);
    });
  });

  describe('Precision Edge Cases', () => {
    it('should avoid floating point errors', () => {
      // Classic floating point issue: 0.1 + 0.2 ≠ 0.3
      // With integer credits, we avoid this
      const bet1 = 0.1;
      const bet2 = 0.2;

      const credits1 = betToCredits(bet1);
      const credits2 = betToCredits(bet2);
      const totalCredits = credits1 + credits2;

      expect(totalCredits).toBe(30); // 10 + 20 = 30 credits exactly
      expect(creditsToMoney(totalCredits)).toBe(0.3);
    });

    it('should handle large accumulations without drift', () => {
      const acc = new CreditAccumulator();
      const winCredits = 100; // 1x win

      // Simulate 1M wins
      const iterations = 1_000_000;
      for (let i = 0; i < iterations; i++) {
        acc.add(winCredits);
      }

      // Should be exactly 100M credits
      expect(acc.getTotal()).toBe(100_000_000);
      expect(acc.getMeanCredits()).toBe(100);
    });
  });
});

describe('BigInt Statistics', () => {
  describe('BigIntSumSquared', () => {
    it('should accumulate squared values', () => {
      const sumSq = new BigIntSumSquared();

      sumSq.add(10);
      sumSq.add(20);
      sumSq.add(30);

      // 10² + 20² + 30² = 100 + 400 + 900 = 1400
      expect(sumSq.getValue()).toBe(1400n);
      expect(sumSq.toNumber()).toBe(1400);
    });

    it('should serialize and deserialize', () => {
      const sumSq = new BigIntSumSquared();
      sumSq.add(1000);
      sumSq.add(2000);

      const serialized = sumSq.serialize();
      const restored = BigIntSumSquared.deserialize(serialized);

      expect(restored.getValue()).toBe(sumSq.getValue());
    });

    it('should merge correctly', () => {
      const sumSq1 = new BigIntSumSquared();
      const sumSq2 = new BigIntSumSquared();

      sumSq1.add(10);
      sumSq1.add(20);
      sumSq2.add(30);
      sumSq2.add(40);

      sumSq1.merge(sumSq2);

      // 100 + 400 + 900 + 1600 = 3000
      expect(sumSq1.getValue()).toBe(3000n);
    });

    it('should handle very large values', () => {
      const sumSq = new BigIntSumSquared();
      const largeWin = 10_000_000; // 10M credits

      // Add 1000 large wins
      for (let i = 0; i < 1000; i++) {
        sumSq.add(largeWin);
      }

      // Each squared = 10^14, total = 10^17
      // This would overflow Number but bigint handles it
      const expected = BigInt(largeWin) * BigInt(largeWin) * 1000n;
      expect(sumSq.getValue()).toBe(expected);
    });
  });

  describe('BigIntSum', () => {
    it('should accumulate sums', () => {
      const sum = new BigIntSum();

      sum.add(100);
      sum.add(200);
      sum.add(300);

      expect(sum.getValue()).toBe(600n);
      expect(sum.getCount()).toBe(3n);
    });

    it('should serialize and deserialize', () => {
      const sum = new BigIntSum();
      sum.add(1000);
      sum.add(2000);

      const serialized = sum.serialize();
      const restored = BigIntSum.deserialize(serialized);

      expect(restored.getValue()).toBe(sum.getValue());
      expect(restored.getCount()).toBe(sum.getCount());
    });
  });

  describe('Variance Calculation', () => {
    it('should calculate variance with bigint', () => {
      // Simple case: values 10, 20, 30
      // Mean = 20
      // Variance = ((10-20)² + (20-20)² + (30-20)²) / 3 = (100 + 0 + 100) / 3 = 66.67
      // Or using E[X²] - E[X]²: (100 + 400 + 900) / 3 - 400 = 466.67 - 400 = 66.67

      const sumSq = 100n + 400n + 900n; // = 1400
      const sum = 10 + 20 + 30; // = 60
      const count = 3;

      const variance = calculateVarianceBigInt(sumSq, sum, count);
      expect(variance).toBeCloseTo(66.67, 1);
    });

    it('should handle edge cases', () => {
      expect(calculateVarianceBigInt(0n, 0, 0)).toBe(0);
      expect(calculateVarianceBigInt(100n, 10, 1)).toBe(0);
    });
  });

  describe('Threshold Detection', () => {
    it('should detect when bigint is needed', () => {
      expect(needsBigInt(Number.MAX_SAFE_INTEGER * 0.95)).toBe(true);
      expect(needsBigInt(1000000)).toBe(false);
    });

    it('should estimate bigint necessity for simulations', () => {
      // 1B spins with 5000x max win - definitely needs bigint
      expect(shouldUseBigInt(1_000_000_000, 5000)).toBe(true);

      // 1M spins with 100x max win - doesn't need bigint
      expect(shouldUseBigInt(1_000_000, 100)).toBe(false);

      // 100M spins with high max win - may need bigint
      // Formula: spinCount × maxWin² > MAX_SAFE_INTEGER × 0.5
      // 100M × 1000² = 10^14, MAX_SAFE_INTEGER × 0.5 ≈ 4.5 × 10^15
      // Actually this is safe, so adjust the test
      expect(shouldUseBigInt(100_000_000, 10000)).toBe(true); // 100M × 10000² = 10^16 > threshold
    });

    it('should have correct threshold constant', () => {
      expect(BIGINT_SPIN_THRESHOLD).toBe(100_000_000);
    });
  });

  describe('Overflow Prevention', () => {
    it('should not overflow with large simulations', () => {
      const sumSq = new BigIntSumSquared();
      const winCredits = 100_000; // 1000x win in credits

      // Simulate 100K large wins
      for (let i = 0; i < 100_000; i++) {
        sumSq.add(winCredits);
      }

      // This would be 100K × (100K)² = 10^15 - still fits in Number
      // but demonstrates the pattern works
      const value = sumSq.getValue();
      expect(value).toBeGreaterThan(0n);

      // Value should be exactly: 100K × 10^10 = 10^15
      const expected = BigInt(100_000) * BigInt(winCredits) * BigInt(winCredits);
      expect(value).toBe(expected);
    });

    it('should handle worst case: 1B spins × 5000x wins', () => {
      // Simulate the math without actually running 1B iterations
      const spins = 1_000_000_000n;
      const maxWinCredits = 500_000n; // 5000x in credits

      // Theoretical sum of squares (all max wins)
      const theoreticalSumSq = spins * maxWinCredits * maxWinCredits;

      // This would be 2.5 × 10^20, way beyond Number.MAX_SAFE_INTEGER (~9 × 10^15)
      expect(theoreticalSumSq).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));

      // But bigint handles it fine
      const sumSq = new BigIntSumSquared();
      sumSq.addSquared(theoreticalSumSq);
      expect(sumSq.getValue()).toBe(theoreticalSumSq);
    });
  });
});

describe('Integration: Credits + BigInt', () => {
  it('should work together for accurate RTP simulation', () => {
    const betCredits = betToCredits(1); // 100 credits
    const sumSq = new BigIntSumSquared();
    let totalWin = 0;
    const spins = 10000;

    // Simulate various wins
    for (let i = 0; i < spins; i++) {
      let winCredits = 0;

      if (i % 10 === 0) {
        // 10% hit rate with 3x win
        winCredits = calculatePayoutCredits(betCredits, 3);
      }

      totalWin += winCredits;
      sumSq.add(winCredits);
    }

    // RTP should be about 30% (10% × 3x)
    const rtp = totalWin / (betCredits * spins);
    expect(rtp).toBeCloseTo(0.3, 1);

    // Variance can be calculated
    const variance = calculateVarianceBigInt(
      sumSq.getValue(),
      totalWin,
      spins
    );
    expect(variance).toBeGreaterThan(0);
  });
});
