/**
 * CORTI W207-ANALYTICS — Thompson Sampling A/B test bandit.
 *
 *   - Each variant has a Beta(α, β) posterior over its conversion rate.
 *   - On a conversion (1) we increment α; on a non-conversion (0) we increment β.
 *   - `sample()` draws from each variant's Beta and returns the argmax — that
 *     variant gets routed traffic for the next decision.
 *   - `trafficSplit()` runs N Thompson samples and returns the empirical
 *     winning frequency — that is the adaptive traffic split.
 *   - `confidence(winnerId)` runs N samples and returns P(winner beats all
 *     other variants). When this exceeds the convergence threshold (default
 *     0.95) we recommend `promote`.
 *
 * All RNG is injectable for deterministic tests. Default is `Math.random`.
 */

export interface VariantPrior {
  id: string;
  /** Beta α prior (successes + 1). Default 1. */
  alpha?: number;
  /** Beta β prior (failures + 1). Default 1. */
  beta?: number;
}

export interface Variant {
  id: string;
  alpha: number;
  beta: number;
  exposures: number;
  conversions: number;
}

export interface ABTestOptions {
  /** RNG; defaults to Math.random. */
  rng?: () => number;
  /** Threshold (0..1) at which `recommendation()` says "promote". Default 0.95. */
  convergenceThreshold?: number;
  /** Number of Thompson samples for traffic-split / confidence. Default 2000. */
  samples?: number;
}

export interface PromotionRecommendation {
  winnerId: string | null;
  confidence: number;
  promote: boolean;
}

/** Numerically stable sampler for Beta(α, β) via Gamma(α,1)/Gamma(β,1) ratio. */
function gammaSample(shape: number, rng: () => number): number {
  // Marsaglia & Tsang — for shape >= 1.
  if (shape < 1) {
    const u = rng();
    return gammaSample(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number;
    let v: number;
    do {
      // Box-Muller for a standard normal
      const u1 = Math.max(rng(), 1e-12);
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaSample(alpha: number, beta: number, rng: () => number): number {
  const x = gammaSample(alpha, rng);
  const y = gammaSample(beta, rng);
  return x / (x + y);
}

export class ABTestSampler {
  private readonly variants = new Map<string, Variant>();
  private readonly rng: () => number;
  private readonly convergence: number;
  private readonly samples: number;

  constructor(priors: VariantPrior[], opts: ABTestOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.convergence = opts.convergenceThreshold ?? 0.95;
    this.samples = Math.max(100, opts.samples ?? 2000);
    if (priors.length < 2) {
      throw new Error('ABTestSampler requires ≥2 variants');
    }
    for (const p of priors) {
      this.variants.set(p.id, {
        id: p.id,
        alpha: p.alpha ?? 1,
        beta: p.beta ?? 1,
        exposures: 0,
        conversions: 0,
      });
    }
  }

  variantIds(): string[] {
    return Array.from(this.variants.keys());
  }

  /** Record an exposure outcome. `converted` true = success. */
  update(id: string, converted: boolean): void {
    const v = this.variants.get(id);
    if (!v) throw new Error(`unknown variant ${id}`);
    v.exposures += 1;
    if (converted) {
      v.alpha += 1;
      v.conversions += 1;
    } else {
      v.beta += 1;
    }
  }

  /** Single Thompson draw — returns the winning variant id this round. */
  sample(): string {
    let bestId = '';
    let bestScore = -Infinity;
    for (const v of this.variants.values()) {
      const score = betaSample(v.alpha, v.beta, this.rng);
      if (score > bestScore) {
        bestScore = score;
        bestId = v.id;
      }
    }
    return bestId;
  }

  /** Posterior mean per variant. */
  posteriorMean(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const v of this.variants.values()) {
      out[v.id] = v.alpha / (v.alpha + v.beta);
    }
    return out;
  }

  /** Adaptive traffic split — runs N Thompson samples, returns empirical winner frequency. */
  trafficSplit(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const id of this.variantIds()) counts[id] = 0;
    for (let i = 0; i < this.samples; i++) {
      counts[this.sample()] += 1;
    }
    const out: Record<string, number> = {};
    for (const id of Object.keys(counts)) out[id] = counts[id] / this.samples;
    return out;
  }

  /** P(winnerId beats every other variant) via N Thompson samples. */
  confidence(winnerId: string): number {
    if (!this.variants.has(winnerId)) return 0;
    let wins = 0;
    for (let i = 0; i < this.samples; i++) {
      if (this.sample() === winnerId) wins += 1;
    }
    return wins / this.samples;
  }

  /** Recommendation: best posterior mean + confidence-based promote flag. */
  recommendation(): PromotionRecommendation {
    let bestId: string | null = null;
    let bestMean = -1;
    const means = this.posteriorMean();
    for (const [id, mean] of Object.entries(means)) {
      if (mean > bestMean) { bestMean = mean; bestId = id; }
    }
    if (!bestId) return { winnerId: null, confidence: 0, promote: false };
    const conf = this.confidence(bestId);
    return { winnerId: bestId, confidence: conf, promote: conf >= this.convergence };
  }

  /** Snapshot — useful for dashboards. */
  snapshot(): Variant[] {
    return Array.from(this.variants.values()).map((v) => ({ ...v }));
  }

  /** Reset all variants to fresh priors. */
  reset(priors: VariantPrior[]): void {
    this.variants.clear();
    for (const p of priors) {
      this.variants.set(p.id, {
        id: p.id,
        alpha: p.alpha ?? 1,
        beta: p.beta ?? 1,
        exposures: 0,
        conversions: 0,
      });
    }
  }
}
