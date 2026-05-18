// W209 Agent B — Re-skin wizard for the template marketplace.
//
// Six-step state machine that takes the user from "pick template" to
// "export IR + asset bundle". Pure state functions — UI layer subscribes
// and renders. Localized symbol names are read via the W208 i18n core
// (consumer passes the t() fn so this module stays UI-agnostic).
//
// Flow:
//   1. Pick template      (chooseTemplate)
//   2. Pick theme         (chooseTheme)
//   3. Symbol re-name     (renameSymbol)        ← uses i18n locale string
//   4. Paytable tweak     (setPaytableValue)
//   5. Preview            (buildPreview)
//   6. Export             (exportBundle)
//
// "Clone Quick Hit Dragons → Quick Hit Phoenix" is the demo use case.

import type { TemplateEntry } from './templates.js';

export type WizardStep = 'pick-template' | 'pick-theme' | 'rename-symbols' | 'paytable' | 'preview' | 'export';

export const WIZARD_STEPS: WizardStep[] = [
  'pick-template',
  'pick-theme',
  'rename-symbols',
  'paytable',
  'preview',
  'export',
];

/** Translator signature compatible with the studio W208 i18n core. */
export type Translator = (key: string, params?: Record<string, unknown>) => string;

export interface ReskinSymbolRename {
  /** Canonical paytable symbol id (e.g. "HP1", "WILD1"). */
  symbolId: string;
  /** Per-locale display labels — keyed by BCP-47 tag. */
  labels: Record<string, string>;
}

export interface ReskinPaytableTweak {
  /** "HP1@5", "WILD@3", etc — symbol@matchLen. */
  payKey: string;
  /** Multiplier (e.g. 250 = 250x bet). */
  multiplier: number;
}

export interface WizardState {
  step: WizardStep;
  templateId: string | null;
  /** Theme id from the studio theming engine. */
  themeId: string | null;
  /** New display name for the cloned game. */
  newDisplayName: string;
  symbolRenames: ReskinSymbolRename[];
  paytableTweaks: ReskinPaytableTweak[];
  /** Locale of the rename screen — drives label key into i18n. */
  activeLocale: string;
  /** Snapshot of the preview reels for step 5. */
  previewReels: string[][];
  /** Issues a warning when validation finds problems before export. */
  errors: string[];
}

export function createWizardState(): WizardState {
  return {
    step: 'pick-template',
    templateId: null,
    themeId: null,
    newDisplayName: '',
    symbolRenames: [],
    paytableTweaks: [],
    activeLocale: 'en',
    previewReels: [],
    errors: [],
  };
}

export function chooseTemplate(state: WizardState, template: TemplateEntry): WizardState {
  return {
    ...state,
    templateId: template.id,
    newDisplayName: state.newDisplayName || `${template.displayName} Reskin`,
    step: 'pick-theme',
  };
}

export function chooseTheme(state: WizardState, themeId: string): WizardState {
  return { ...state, themeId, step: 'rename-symbols' };
}

export function renameSymbol(
  state: WizardState,
  symbolId: string,
  locale: string,
  label: string,
): WizardState {
  const existing = state.symbolRenames.find((s) => s.symbolId === symbolId);
  if (existing) {
    return {
      ...state,
      symbolRenames: state.symbolRenames.map((s) =>
        s.symbolId === symbolId
          ? { ...s, labels: { ...s.labels, [locale]: label } }
          : s,
      ),
    };
  }
  return {
    ...state,
    symbolRenames: [...state.symbolRenames, { symbolId, labels: { [locale]: label } }],
  };
}

export function setPaytableValue(
  state: WizardState,
  payKey: string,
  multiplier: number,
): WizardState {
  const others = state.paytableTweaks.filter((p) => p.payKey !== payKey);
  return { ...state, paytableTweaks: [...others, { payKey, multiplier }] };
}

export function setNewDisplayName(state: WizardState, name: string): WizardState {
  return { ...state, newDisplayName: name };
}

export function setActiveLocale(state: WizardState, locale: string): WizardState {
  return { ...state, activeLocale: locale };
}

/** Step navigation — clamped to valid range. */
export function nextStep(state: WizardState): WizardState {
  const idx = WIZARD_STEPS.indexOf(state.step);
  const next = WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)];
  return { ...state, step: next };
}

export function prevStep(state: WizardState): WizardState {
  const idx = WIZARD_STEPS.indexOf(state.step);
  const prev = WIZARD_STEPS[Math.max(idx - 1, 0)];
  return { ...state, step: prev };
}

export function goToStep(state: WizardState, step: WizardStep): WizardState {
  return { ...state, step };
}

/** Build the preview reels — a deterministic 5x3 / 6x4 / dual-grid
 *  shuffle of the template's symbols, biased toward the renamed labels. */
export function buildPreview(
  state: WizardState,
  template: TemplateEntry,
  t?: Translator,
): WizardState {
  const { cols, rows } = layoutDimensions(template.layout);
  const symbols = ['HP1', 'HP2', 'HP3', 'MP1', 'MP2', 'MP3', 'LP1', 'LP2', 'WILD1', 'SCATTER1'];
  const reels: string[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: string[] = [];
    for (let r = 0; r < rows; r++) {
      const idx = (c * 7 + r * 3) % symbols.length;
      const sid = symbols[idx];
      const rename = state.symbolRenames.find((s) => s.symbolId === sid);
      const localized = rename?.labels[state.activeLocale];
      const fallback = t ? t(`symbol.${sid.toLowerCase()}`) : sid;
      col.push(localized ?? fallback);
    }
    reels.push(col);
  }
  return { ...state, previewReels: reels, step: 'preview' };
}

/** Validation prior to export. */
export function validateForExport(state: WizardState): string[] {
  const errs: string[] = [];
  if (!state.templateId) errs.push('No template selected');
  if (!state.themeId) errs.push('No theme selected');
  if (!state.newDisplayName.trim()) errs.push('Display name is empty');
  for (const tweak of state.paytableTweaks) {
    if (tweak.multiplier < 0 || !Number.isFinite(tweak.multiplier)) {
      errs.push(`Paytable ${tweak.payKey} invalid multiplier`);
    }
  }
  return errs;
}

export interface ExportBundle {
  manifest: {
    schema: 'reskin-bundle-v1';
    generated: string;
    sourceTemplateId: string;
    newDisplayName: string;
    themeId: string;
    activeLocale: string;
    symbolRenameCount: number;
    paytableTweakCount: number;
  };
  ir: Record<string, unknown>;
  files: Array<{ name: string; content: string }>;
}

/** Build the IR + asset-bundle JSON. The actual ZIP write is the
 *  UI layer's responsibility (jszip). */
export function exportBundle(
  state: WizardState,
  template: TemplateEntry,
  now: () => Date = () => new Date(),
): ExportBundle {
  const errs = validateForExport(state);
  if (errs.length > 0) {
    throw new Error(`reskin validation failed: ${errs.join('; ')}`);
  }

  const ir = {
    schema: 'slot-ir-v1',
    name: state.newDisplayName,
    based_on: {
      template: template.id,
      pids: template.based_on_pids,
      lw_gap: template.lw_gap_target,
    },
    layout: template.layout,
    rtp_target: template.rtp_target,
    volatility: template.volatility,
    max_win_x: template.max_win_x,
    theme: state.themeId,
    locale_default: state.activeLocale,
    symbol_labels: state.symbolRenames,
    paytable_overrides: state.paytableTweaks,
  };

  const manifest: ExportBundle['manifest'] = {
    schema: 'reskin-bundle-v1',
    generated: now().toISOString(),
    sourceTemplateId: template.id,
    newDisplayName: state.newDisplayName,
    themeId: state.themeId ?? '',
    activeLocale: state.activeLocale,
    symbolRenameCount: state.symbolRenames.length,
    paytableTweakCount: state.paytableTweaks.length,
  };

  const files: ExportBundle['files'] = [
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'game.ir.json', content: JSON.stringify(ir, null, 2) },
    {
      name: 'README.md',
      content: [
        `# ${state.newDisplayName}`,
        ``,
        `Cloned from \`${template.id}\` using the marketplace re-skin wizard.`,
        ``,
        `- Theme: ${state.themeId}`,
        `- Layout: ${template.layout}`,
        `- RTP target: ${template.rtp_target}%`,
        `- L&W gap: ${template.lw_gap_target}`,
        `- Symbol renames: ${state.symbolRenames.length}`,
        `- Paytable overrides: ${state.paytableTweaks.length}`,
        ``,
      ].join('\n'),
    },
  ];

  return { manifest, ir, files };
}

/** Util — derive cols × rows from a layout string. */
export function layoutDimensions(layout: string): { cols: number; rows: number } {
  if (layout === 'dual-grid') return { cols: 5, rows: 3 }; // primary half
  if (layout === 'megaways') return { cols: 6, rows: 4 };
  const m = /^(\d+)x(\d+)$/.exec(layout);
  if (m) return { cols: parseInt(m[1], 10), rows: parseInt(m[2], 10) };
  return { cols: 5, rows: 3 };
}

/** Convenience helper exposed for tests + UI: full end-to-end clone. */
export function runQuickHitDragonsToPhoenixDemo(
  template: TemplateEntry,
  now: () => Date = () => new Date(),
): ExportBundle {
  let s = createWizardState();
  s = chooseTemplate(s, template);
  s = setNewDisplayName(s, 'Quick Hit Phoenix');
  s = chooseTheme(s, 'mythological');
  s = renameSymbol(s, 'HP1', 'en', 'Phoenix');
  s = renameSymbol(s, 'HP1', 'es', 'Fénix');
  s = renameSymbol(s, 'HP2', 'en', 'Flame');
  s = setPaytableValue(s, 'HP1@5', 500);
  s = setPaytableValue(s, 'WILD@5', 1000);
  s = buildPreview(s, template);
  return exportBundle(s, template, now);
}
