/**
 * W214 Faza 800.1 Agent C — ROI Preview component.
 *
 * Simplified, marketing-friendly ROI calculator (3 sliders → 2 outputs).
 * Pure kernel + DOM mounter, deliberately decoupled so the kernel is
 * exhaustively unit-testable in `tests/roi-preview.test.ts` without
 * a DOM. The full 5-input calculator lives in `web/pitch/src/roi-calculator.ts`
 * (W211); this is a stripped-down public-facing version that drives the
 * landing page and the bottom of the pricing page.
 *
 *   inputs : gamesPerYear, costPerGame, jurisdictions
 *   outputs: annualSavings, threeYearNpv
 *
 * Constants are conservative (mirror W211 defaults) so a prospect's
 * own ROI never under-promises against the full calculator they'd run
 * post-pilot.
 */

export interface RoiPreviewInputs {
  gamesPerYear: number;
  costPerGame: number; // USD
  jurisdictions: number;
}

export interface RoiPreviewOutputs {
  annualSavings: number;
  threeYearNpv: number;
  inputs: RoiPreviewInputs;
}

export interface RoiPreviewConstants {
  /** Closed-form acceleration → 75% cost displaced. */
  costReductionPct: number;
  /** Each extra jurisdiction adds this fraction to savings. */
  jurisdictionAmp: number;
  /** Discount rate for NPV (WACC-style, 10%). */
  discountRate: number;
}

export const DEFAULT_CONSTANTS: RoiPreviewConstants = {
  costReductionPct: 0.75,
  jurisdictionAmp: 0.08,
  discountRate: 0.1,
};

export const DEFAULT_INPUTS: RoiPreviewInputs = {
  gamesPerYear: 20,
  costPerGame: 200_000,
  jurisdictions: 5,
};

/** Clamp inputs so a 0/negative never produces a misleading number. */
export function clampInputs(i: RoiPreviewInputs): RoiPreviewInputs {
  return {
    gamesPerYear: Math.max(1, Math.min(200, Math.round(i.gamesPerYear))),
    costPerGame: Math.max(10_000, Math.min(1_000_000, Math.round(i.costPerGame))),
    jurisdictions: Math.max(1, Math.min(15, Math.round(i.jurisdictions))),
  };
}

export function annualSavings(
  i: RoiPreviewInputs,
  k: RoiPreviewConstants = DEFAULT_CONSTANTS
): number {
  const c = clampInputs(i);
  const base = c.gamesPerYear * c.costPerGame * k.costReductionPct;
  const amp = 1 + Math.max(0, c.jurisdictions - 1) * k.jurisdictionAmp;
  return Math.round(base * amp);
}

/** 3-year NPV = sum of discounted annual savings (years 1..3). */
export function threeYearNpv(
  i: RoiPreviewInputs,
  k: RoiPreviewConstants = DEFAULT_CONSTANTS
): number {
  const annual = annualSavings(i, k);
  let npv = 0;
  for (let y = 1; y <= 3; y++) {
    npv += annual / Math.pow(1 + k.discountRate, y);
  }
  return Math.round(npv);
}

export function computeRoiPreview(
  i: RoiPreviewInputs,
  k: RoiPreviewConstants = DEFAULT_CONSTANTS
): RoiPreviewOutputs {
  return {
    annualSavings: annualSavings(i, k),
    threeYearNpv: threeYearNpv(i, k),
    inputs: clampInputs(i),
  };
}

/** USD formatter — "$1.4M", "$420K", "$8K". */
export function formatUsd(n: number): string {
  if (n >= 1_000_000) {
    return '$' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  }
  if (n >= 1_000) {
    return '$' + Math.round(n / 1_000) + 'K';
  }
  return '$' + n.toFixed(0);
}

/** Render the static markup. DOM-free unit-tested via tests/roi-preview.test.ts. */
export function renderRoiPreviewHtml(
  inputs: RoiPreviewInputs = DEFAULT_INPUTS
): string {
  const out = computeRoiPreview(inputs);
  return `
    <div class="roi-preview" id="roi-preview" data-component="roi-preview">
      <div class="inputs">
        <h3>Your portfolio</h3>
        <label>
          <span class="lbl-row"><span>Games per year</span>
            <span class="val" data-out="games">${inputs.gamesPerYear}</span></span>
          <input type="range" min="1" max="60" step="1"
                 value="${inputs.gamesPerYear}" data-input="games" />
        </label>
        <label>
          <span class="lbl-row"><span>Cost per game (USD)</span>
            <span class="val" data-out="cost">${formatUsd(inputs.costPerGame)}</span></span>
          <input type="range" min="50000" max="500000" step="10000"
                 value="${inputs.costPerGame}" data-input="cost" />
        </label>
        <label>
          <span class="lbl-row"><span>Jurisdictions</span>
            <span class="val" data-out="juris">${inputs.jurisdictions}</span></span>
          <input type="range" min="1" max="15" step="1"
                 value="${inputs.jurisdictions}" data-input="juris" />
        </label>
        <p style="font-size:0.85rem;color:var(--fg-dim);margin-top:18px">
          Conservative model. Want the full 5-input calculator with NPV,
          break-even months, and marketplace ARR?
          <a href="pages/contact.html">Request the pitch tarball.</a>
        </p>
      </div>
      <div class="outputs">
        <div class="out-row">
          <span class="out-lbl">Annual savings</span>
          <span class="out-val" data-out="annual">${formatUsd(out.annualSavings)}</span>
        </div>
        <div class="out-row">
          <span class="out-lbl">3-year NPV</span>
          <span class="out-val" data-out="npv">${formatUsd(out.threeYearNpv)}</span>
        </div>
        <div class="out-row" style="border:none;padding-top:18px">
          <a class="btn btn-primary btn-block" href="pages/pricing.html">
            See pricing tiers →
          </a>
        </div>
      </div>
    </div>`;
}

/** Mount + wire sliders. No-op when no <Document>. */
export function mountRoiPreview(
  root: HTMLElement,
  initial: RoiPreviewInputs = DEFAULT_INPUTS
): { read: () => RoiPreviewInputs; refresh: () => RoiPreviewOutputs } {
  root.innerHTML = renderRoiPreviewHtml(initial);
  const state: RoiPreviewInputs = { ...initial };
  const inGames = root.querySelector<HTMLInputElement>('[data-input="games"]');
  const inCost = root.querySelector<HTMLInputElement>('[data-input="cost"]');
  const inJuris = root.querySelector<HTMLInputElement>('[data-input="juris"]');
  const outGames = root.querySelector<HTMLElement>('[data-out="games"]');
  const outCost = root.querySelector<HTMLElement>('[data-out="cost"]');
  const outJuris = root.querySelector<HTMLElement>('[data-out="juris"]');
  const outAnnual = root.querySelector<HTMLElement>('[data-out="annual"]');
  const outNpv = root.querySelector<HTMLElement>('[data-out="npv"]');
  const refresh = (): RoiPreviewOutputs => {
    const o = computeRoiPreview(state);
    if (outGames) outGames.textContent = String(state.gamesPerYear);
    if (outCost) outCost.textContent = formatUsd(state.costPerGame);
    if (outJuris) outJuris.textContent = String(state.jurisdictions);
    if (outAnnual) outAnnual.textContent = formatUsd(o.annualSavings);
    if (outNpv) outNpv.textContent = formatUsd(o.threeYearNpv);
    return o;
  };
  inGames?.addEventListener('input', () => {
    state.gamesPerYear = Number(inGames.value);
    refresh();
  });
  inCost?.addEventListener('input', () => {
    state.costPerGame = Number(inCost.value);
    refresh();
  });
  inJuris?.addEventListener('input', () => {
    state.jurisdictions = Number(inJuris.value);
    refresh();
  });
  return { read: () => ({ ...state }), refresh };
}
