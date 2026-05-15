/**
 * W152 Wave 20 — featurePurchaseEV tests (Faza 15.C.3).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluatePurchasePricing,
  expectedPurchasePathRtp,
  batchEvaluatePricing,
} from '../src/features/featurePurchaseEV.js';

describe('evaluatePurchasePricing — aligned', () => {
  it('aligned when buy RTP equals base within tolerance', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: 0.961,
      tolerancePercentagePoints: 0.02,
    });
    expect(v.status).toBe('aligned');
  });
  it('overpriced when buy RTP < base by more than tolerance', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: 0.92, // 4pp under base
      tolerancePercentagePoints: 0.02,
    });
    expect(v.status).toBe('overpriced');
    expect(v.diagnostic).toMatch(/deceptive marketing/);
  });
  it('underpriced when buy RTP > base by more than tolerance', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: 0.99, // 3pp over base
      tolerancePercentagePoints: 0.02,
    });
    expect(v.status).toBe('underpriced');
    expect(v.diagnostic).toMatch(/excessive bet/);
  });
});

describe('evaluatePurchasePricing — invalid inputs', () => {
  it('invalid on negative price', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: -10,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: 0.96,
    });
    expect(v.status).toBe('invalid');
  });
  it('invalid on out-of-range baseGameRtp', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 2.0,
      expectedBuyPathRtp: 0.96,
    });
    expect(v.status).toBe('invalid');
  });
  it('invalid on out-of-range expectedBuyPathRtp', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: -0.1,
    });
    expect(v.status).toBe('invalid');
  });
  it('invalid on negative tolerance', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: 0.96,
      tolerancePercentagePoints: -0.01,
    });
    expect(v.status).toBe('invalid');
  });
});

describe('evaluatePurchasePricing — variantId', () => {
  it('echoes variantId in verdict', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: 0.96,
      variantId: 'fs-buy-100x',
    });
    expect(v.variantId).toBe('fs-buy-100x');
  });
  it('null variantId when not provided', () => {
    const v = evaluatePurchasePricing({
      priceMultiplier: 100,
      baseGameRtp: 0.96,
      expectedBuyPathRtp: 0.96,
    });
    expect(v.variantId).toBeNull();
  });
});

describe('expectedPurchasePathRtp', () => {
  it('multiplies trigger × feature RTP', () => {
    expect(expectedPurchasePathRtp(1.0, 0.96, 100)).toBeCloseTo(0.96);
    expect(expectedPurchasePathRtp(0.5, 0.96, 100)).toBeCloseTo(0.48);
  });
  it('rejects out-of-range trigger probability', () => {
    expect(() => expectedPurchasePathRtp(-0.1, 0.96, 100)).toThrow(RangeError);
    expect(() => expectedPurchasePathRtp(1.5, 0.96, 100)).toThrow(RangeError);
  });
  it('rejects negative featureRtp', () => {
    expect(() => expectedPurchasePathRtp(1.0, -0.5, 100)).toThrow(RangeError);
  });
  it('rejects non-positive priceMultiplier', () => {
    expect(() => expectedPurchasePathRtp(1.0, 0.96, 0)).toThrow(RangeError);
  });
});

describe('batchEvaluatePricing', () => {
  it('aggregates pass/fail counts', () => {
    const r = batchEvaluatePricing([
      { priceMultiplier: 100, baseGameRtp: 0.96, expectedBuyPathRtp: 0.961 }, // aligned
      { priceMultiplier: 100, baseGameRtp: 0.96, expectedBuyPathRtp: 0.99 }, // underpriced
      { priceMultiplier: 100, baseGameRtp: 0.96, expectedBuyPathRtp: 0.5 }, // overpriced
      { priceMultiplier: -1, baseGameRtp: 0.96, expectedBuyPathRtp: 0.96 }, // invalid
    ]);
    expect(r.aligned).toBe(1);
    expect(r.underpriced).toBe(1);
    expect(r.overpriced).toBe(1);
    expect(r.invalid).toBe(1);
    expect(r.results).toHaveLength(4);
  });
});
