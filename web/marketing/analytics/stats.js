/*
 * W215 Faza 800.2 Agent C — stats helpers for the analytics dashboard.
 *
 * Pure functions, dependency-free, browser + node compatible.
 *
 * bayesianCredibleInterval — Beta(α+s, β+f), α=β=1 (Bayes-Laplace).
 *   We use a Normal approximation around the posterior mean for the
 *   95 % equal-tailed CI:
 *       mean = (s+1)/(n+2)
 *       var  = mean*(1-mean) / (n+3)
 *       half = 1.96 * sqrt(var)
 *   This is accurate to <1 pp for n ≥ 50 and degrades gracefully
 *   towards an uninformative prior as n → 0.
 *
 * wilsonInterval — Wilson score interval for the same data, used as a
 * sanity-check companion.
 *
 * computeFunnelMetrics — landing→demo, demo→signup, end-to-end %.
 *
 * liftPercent — relative lift of (a) over (baseline), in %.
 *
 * chiSquareStat — for the A/B test suite chi-square uniformity check.
 */

export function bayesianCredibleInterval(successes, n, z = 1.96) {
  const s = Math.max(0, successes | 0);
  const N = Math.max(0, n | 0);
  const mean = (s + 1) / (N + 2);
  const variance = (mean * (1 - mean)) / (N + 3);
  const half = z * Math.sqrt(variance);
  return {
    mean,
    lo: Math.max(0, mean - half),
    hi: Math.min(1, mean + half),
  };
}

export function wilsonInterval(successes, n, z = 1.96) {
  if (n <= 0) return { lo: 0, hi: 1, mean: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { mean: p, lo: Math.max(0, centre - margin), hi: Math.min(1, centre + margin) };
}

export function computeFunnelMetrics(funnel) {
  const landing = Math.max(1, funnel.landing ?? 0);
  const demo    = funnel.demo    ?? 0;
  const signup  = funnel.signup  ?? 0;
  return {
    landingToDemo: demo / landing,
    demoToSignup:  demo > 0 ? signup / demo : 0,
    endToEnd:      signup / landing,
  };
}

export function liftPercent(rate, baseline) {
  if (!(baseline > 0)) return 0;
  return ((rate - baseline) / baseline) * 100;
}

export function formatPercent(x, digits = 2) {
  return `${(x * 100).toFixed(digits)}%`;
}

export function chiSquareStat(observed, expected) {
  if (observed.length !== expected.length) {
    throw new RangeError('observed/expected length mismatch');
  }
  let chi = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = expected[i];
    if (!(e > 0)) continue;
    const d = observed[i] - e;
    chi += (d * d) / e;
  }
  return chi;
}
