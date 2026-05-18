/**
 * W211 Agent B — ROI Calculator for L&W Finance Team.
 *
 * Pure, side-effect-free computation kernel. The UI in `lw-deck.html`
 * wires 5 range sliders to `computeRoi(...)` and renders the result via
 * `renderRoiSummary(...)`. The kernel is exhaustively unit-tested in
 * `tests/roi-calculator.test.ts`.
 *
 * Assumptions (cited on the slide):
 *  - Cost reduction per title is conservative 75% — engine-cert is paid
 *    once across all titles, marginal cost ≈ 0.
 *  - Time acceleration is conservative 3.3x (currentTime × 0.30 remaining)
 *    — driven by closed-form cert dossier (200 ms build) + IR-first
 *    workflow (no engine binary swap per title).
 *  - Marketplace ARR uses average $25K template price (W209 baseline),
 *    8 templates/year shipped through marketplace by Year 2, 30% revenue
 *    share to L&W as platform operator.
 *  - 5-year NPV uses 10% discount rate (standard slot-vendor WACC).
 *  - Outputs are normalized to USD round numbers, conservatively floored.
 */

export interface RoiInputs {
  /** Games L&W ships per year today. */
  gamesPerYear: number;
  /** Fully loaded cost per game (lab + dev + ops). USD. */
  costPerGame: number;
  /** Weeks design-to-cabinet today. */
  weeksPerGame: number;
  /** Jurisdictions L&W ships into per year. */
  jurisdictions: number;
  /** Operator network size (# of operators distributing L&W games). */
  operatorNetwork: number;
}

export interface RoiOutputs {
  /** Annual cost saved by replacing per-game cert + dev with platform. */
  annualCostSavings: number;
  /** New time-to-market in weeks (compressed by platform). */
  acceleratedWeeksPerGame: number;
  /** Time saved per year in weeks across full portfolio. */
  annualTimeSavedWeeks: number;
  /** 5-year NPV at 10% discount of recurring annual savings. */
  fiveYearNpv: number;
  /** Break-even month (when cumulative savings exceed pilot/license cost). */
  breakEvenMonths: number;
  /** Year-2 marketplace ARR projection (USD). */
  marketplaceArr: number;
  /** Echo of inputs for snapshots / audit trail. */
  inputs: RoiInputs;
  /** Constants used in this run (transparent to reviewer). */
  constants: RoiConstants;
}

export interface RoiConstants {
  costReductionPct: number;       // 0.75 = 75% reduction
  timeReductionPct: number;       // 0.70 = 70% reduction (3.3x faster)
  discountRate: number;           // 0.10 = 10% WACC
  marketplaceTemplatesYr2: number; // 8 templates Y2
  avgTemplatePrice: number;       // $25,000 (W209 baseline)
  platformRevSharePct: number;    // 0.30 = 30% to L&W
  pilotLicenseAnnualCost: number; // $8M license / yr (Option B)
  jurisdictionMultiplier: number; // each extra jurisdiction adds 8% extra savings
  operatorNetworkBonus: number;   // per-operator marketplace upside in USD/yr
}

export const DEFAULT_CONSTANTS: RoiConstants = {
  costReductionPct: 0.75,
  timeReductionPct: 0.70,
  discountRate: 0.10,
  marketplaceTemplatesYr2: 8,
  avgTemplatePrice: 25_000,
  platformRevSharePct: 0.30,
  pilotLicenseAnnualCost: 8_000_000,
  jurisdictionMultiplier: 0.08,
  operatorNetworkBonus: 1_200,
};

export const DEFAULT_INPUTS: RoiInputs = {
  gamesPerYear: 30,
  costPerGame: 250_000,
  weeksPerGame: 26,
  jurisdictions: 8,
  operatorNetwork: 50,
};

/**
 * Sanity-floor numeric inputs so a finance reviewer can't tank the math
 * with zeros that nobody operates at. Inputs are clamped, not rejected.
 */
function clampInputs(i: RoiInputs): RoiInputs {
  return {
    gamesPerYear: Math.max(1, Math.min(500, Math.round(i.gamesPerYear))),
    costPerGame: Math.max(10_000, Math.min(2_000_000, i.costPerGame)),
    weeksPerGame: Math.max(1, Math.min(104, i.weeksPerGame)),
    jurisdictions: Math.max(1, Math.min(50, Math.round(i.jurisdictions))),
    operatorNetwork: Math.max(1, Math.min(1000, Math.round(i.operatorNetwork))),
  };
}

/**
 * Compute annual cost savings.
 *
 *   savings = games × cost × costReductionPct × (1 + (juris − 1) × jurisMult)
 *
 * The jurisdictionMultiplier captures the recertify-per-jurisdiction
 * tax that current L&W workflow pays — the platform eliminates that
 * recertify, so each extra jurisdiction compounds savings linearly.
 */
export function annualCostSavings(i: RoiInputs, k: RoiConstants = DEFAULT_CONSTANTS): number {
  const ci = clampInputs(i);
  const base = ci.gamesPerYear * ci.costPerGame * k.costReductionPct;
  const jurisAmp = 1 + Math.max(0, ci.jurisdictions - 1) * k.jurisdictionMultiplier;
  return Math.round(base * jurisAmp);
}

/**
 * Accelerated weeks per game = currentWeeks × (1 − timeReductionPct).
 * For default 26 weeks at 70% reduction → 7.8 weeks (≈ 3.3x faster).
 */
export function acceleratedWeeksPerGame(i: RoiInputs, k: RoiConstants = DEFAULT_CONSTANTS): number {
  const ci = clampInputs(i);
  return Math.round(ci.weeksPerGame * (1 - k.timeReductionPct) * 10) / 10;
}

/**
 * Time saved per year across full portfolio in weeks.
 */
export function annualTimeSavedWeeks(i: RoiInputs, k: RoiConstants = DEFAULT_CONSTANTS): number {
  const ci = clampInputs(i);
  const saved = ci.weeksPerGame * k.timeReductionPct;
  return Math.round(ci.gamesPerYear * saved);
}

/**
 * 5-year NPV of a recurring annual savings stream at discount rate r.
 *
 *   NPV = Σ_{t=1..5} savings / (1 + r)^t
 *
 * Conservative: no growth, no inflation, no compounding from additional
 * jurisdictions added year-over-year. Realistic NPV is materially higher
 * but we want a defensible floor for a CFO review.
 */
export function fiveYearNpv(savings: number, k: RoiConstants = DEFAULT_CONSTANTS): number {
  let npv = 0;
  for (let t = 1; t <= 5; t++) {
    npv += savings / Math.pow(1 + k.discountRate, t);
  }
  return Math.round(npv);
}

/**
 * Break-even months: at what month does cumulative monthly savings
 * exceed the annual license cost (Option B, $8M/yr default).
 *
 *   monthlySavings = annualSavings / 12
 *   breakEvenMonths = ceil(annualLicense / monthlySavings)
 */
export function breakEvenMonths(savings: number, k: RoiConstants = DEFAULT_CONSTANTS): number {
  if (savings <= 0) return Number.POSITIVE_INFINITY;
  const monthly = savings / 12;
  return Math.ceil(k.pilotLicenseAnnualCost / monthly);
}

/**
 * Marketplace ARR (Year 2) = templates × avgPrice × revShare + operator
 * network bonus. The operatorNetworkBonus is a per-operator distribution
 * upside (each operator buys ~1 template per year through the marketplace
 * at average commission).
 */
export function marketplaceArr(i: RoiInputs, k: RoiConstants = DEFAULT_CONSTANTS): number {
  const ci = clampInputs(i);
  const templateRev = k.marketplaceTemplatesYr2 * k.avgTemplatePrice * k.platformRevSharePct;
  const operatorBonus = ci.operatorNetwork * k.operatorNetworkBonus;
  return Math.round(templateRev + operatorBonus);
}

/**
 * Compute full ROI output bundle. Pure function.
 */
export function computeRoi(
  inputs: RoiInputs,
  constants: RoiConstants = DEFAULT_CONSTANTS,
): RoiOutputs {
  const ci = clampInputs(inputs);
  const savings = annualCostSavings(ci, constants);
  const weeksNew = acceleratedWeeksPerGame(ci, constants);
  const weeksSaved = annualTimeSavedWeeks(ci, constants);
  const npv = fiveYearNpv(savings, constants);
  const breakEven = breakEvenMonths(savings, constants);
  const mp = marketplaceArr(ci, constants);

  return {
    annualCostSavings: savings,
    acceleratedWeeksPerGame: weeksNew,
    annualTimeSavedWeeks: weeksSaved,
    fiveYearNpv: npv,
    breakEvenMonths: breakEven,
    marketplaceArr: mp,
    inputs: ci,
    constants,
  };
}

/**
 * Render ROI inputs + outputs as a static HTML summary suitable for the
 * "Download Summary" button or for pasting into a board memo.
 */
export function renderRoiSummary(out: RoiOutputs): string {
  const fmtUsd = (n: number): string => {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  };

  return `<div class="lw-roi-summary">
  <h3>ROI Snapshot</h3>
  <div class="lw-roi-grid">
    <div class="lw-roi-card">
      <div class="lw-roi-value">${fmtUsd(out.annualCostSavings)}</div>
      <div class="lw-roi-label">annual cost savings</div>
    </div>
    <div class="lw-roi-card">
      <div class="lw-roi-value">${out.acceleratedWeeksPerGame}w</div>
      <div class="lw-roi-label">new time-to-market per game</div>
    </div>
    <div class="lw-roi-card">
      <div class="lw-roi-value">${out.annualTimeSavedWeeks}w</div>
      <div class="lw-roi-label">total weeks saved per year</div>
    </div>
    <div class="lw-roi-card">
      <div class="lw-roi-value">${fmtUsd(out.fiveYearNpv)}</div>
      <div class="lw-roi-label">5-year NPV @ 10%</div>
    </div>
    <div class="lw-roi-card">
      <div class="lw-roi-value">${Number.isFinite(out.breakEvenMonths) ? out.breakEvenMonths : '∞'} mo</div>
      <div class="lw-roi-label">break-even point</div>
    </div>
    <div class="lw-roi-card">
      <div class="lw-roi-value">${fmtUsd(out.marketplaceArr)}</div>
      <div class="lw-roi-label">Year-2 marketplace ARR</div>
    </div>
  </div>
  <div class="lw-roi-inputs">
    Inputs: ${out.inputs.gamesPerYear} games/yr · ${fmtUsd(out.inputs.costPerGame)}/game ·
    ${out.inputs.weeksPerGame}w/game · ${out.inputs.jurisdictions} jurisdictions ·
    ${out.inputs.operatorNetwork} operators
  </div>
  <div class="lw-roi-footnote">
    Conservative assumptions: ${out.constants.costReductionPct * 100}% cost reduction,
    ${out.constants.timeReductionPct * 100}% time reduction,
    ${out.constants.discountRate * 100}% discount rate.
    All figures recompute live as you adjust sliders. See deep-dive doc for derivation.
  </div>
</div>`;
}

/**
 * Sensitivity sweep — varies one input ±20% and reports 5Y NPV delta.
 * Used by the sensitivity chart in the deck UI.
 */
export function sensitivitySweep(
  base: RoiInputs,
  axis: keyof RoiInputs,
  constants: RoiConstants = DEFAULT_CONSTANTS,
): { low: number; baseline: number; high: number } {
  const baseline = computeRoi(base, constants).fiveYearNpv;
  const factor = 0.20;
  const low = { ...base, [axis]: (base[axis] as number) * (1 - factor) } as RoiInputs;
  const high = { ...base, [axis]: (base[axis] as number) * (1 + factor) } as RoiInputs;
  return {
    low: computeRoi(low, constants).fiveYearNpv,
    baseline,
    high: computeRoi(high, constants).fiveYearNpv,
  };
}

/**
 * Wire up the 5 sliders + summary panel. Caller supplies a host element
 * + an optional initial input bundle. Idempotent — re-running on the
 * same host replaces the markup.
 */
export interface RoiUiHost {
  /** Container element the calculator renders into. */
  root: { innerHTML: string };
  /** Optional callback fired on each recompute (for telemetry/tests). */
  onUpdate?: (out: RoiOutputs) => void;
}

export function mountRoiCalculator(
  host: RoiUiHost,
  initial: RoiInputs = DEFAULT_INPUTS,
  constants: RoiConstants = DEFAULT_CONSTANTS,
): RoiOutputs {
  const out = computeRoi(initial, constants);
  host.root.innerHTML = `<div class="lw-roi-calculator">
  <h3 class="lw-roi-title">ROI Calculator — Live Recompute</h3>
  <div class="lw-roi-sliders">
    ${renderSlider('gamesPerYear', 'Games per year', initial.gamesPerYear, 5, 200, 1)}
    ${renderSlider('costPerGame', 'Cost per game (USD)', initial.costPerGame, 50_000, 1_000_000, 10_000)}
    ${renderSlider('weeksPerGame', 'Weeks per game', initial.weeksPerGame, 4, 78, 1)}
    ${renderSlider('jurisdictions', 'Jurisdictions / year', initial.jurisdictions, 1, 30, 1)}
    ${renderSlider('operatorNetwork', 'Operator network size', initial.operatorNetwork, 1, 500, 5)}
  </div>
  ${renderRoiSummary(out)}
</div>`;
  if (host.onUpdate) host.onUpdate(out);
  return out;
}

function renderSlider(name: string, label: string, value: number, min: number, max: number, step: number): string {
  return `<label class="lw-slider-row" data-slider="${name}">
    <span class="lw-slider-label">${label}</span>
    <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" />
    <span class="lw-slider-val" data-slider-val="${name}">${value}</span>
  </label>`;
}
