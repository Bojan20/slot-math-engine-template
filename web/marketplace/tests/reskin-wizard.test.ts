// W209 Agent B — Re-skin wizard specs.

import { describe, it, expect } from 'vitest';
import templatesJson from '../data/templates.json' assert { type: 'json' };
import type { TemplateEntry } from '../src/templates.js';
import {
  WIZARD_STEPS,
  buildPreview,
  chooseTemplate,
  chooseTheme,
  createWizardState,
  exportBundle,
  goToStep,
  layoutDimensions,
  nextStep,
  prevStep,
  renameSymbol,
  runQuickHitDragonsToPhoenixDemo,
  setActiveLocale,
  setNewDisplayName,
  setPaytableValue,
  validateForExport,
} from '../src/reskin-wizard.js';

const TEMPLATES = (templatesJson as { templates: TemplateEntry[] }).templates;
const QHD = TEMPLATES.find((t) => t.id === 'tpl-quick-hit-dragons')!;

describe('reskin-wizard · navigation', () => {
  it('initial state starts at pick-template', () => {
    const s = createWizardState();
    expect(s.step).toBe('pick-template');
    expect(s.templateId).toBeNull();
  });

  it('chooseTemplate advances to pick-theme and seeds display name', () => {
    const s = chooseTemplate(createWizardState(), QHD);
    expect(s.step).toBe('pick-theme');
    expect(s.templateId).toBe('tpl-quick-hit-dragons');
    expect(s.newDisplayName).toContain('Quick Hit Dragons');
  });

  it('chooseTheme advances to rename-symbols', () => {
    let s = chooseTemplate(createWizardState(), QHD);
    s = chooseTheme(s, 'mythological');
    expect(s.step).toBe('rename-symbols');
    expect(s.themeId).toBe('mythological');
  });

  it('nextStep / prevStep clamp at boundaries', () => {
    let s = createWizardState();
    for (let i = 0; i < 20; i++) s = nextStep(s);
    expect(s.step).toBe(WIZARD_STEPS[WIZARD_STEPS.length - 1]);
    for (let i = 0; i < 20; i++) s = prevStep(s);
    expect(s.step).toBe(WIZARD_STEPS[0]);
  });

  it('goToStep jumps directly', () => {
    const s = goToStep(createWizardState(), 'export');
    expect(s.step).toBe('export');
  });
});

describe('reskin-wizard · symbol rename + locale', () => {
  it('renames a symbol for a single locale', () => {
    const s = renameSymbol(createWizardState(), 'HP1', 'en', 'Phoenix');
    expect(s.symbolRenames.length).toBe(1);
    expect(s.symbolRenames[0].labels.en).toBe('Phoenix');
  });

  it('adds locale to existing symbol rename without losing prior labels', () => {
    let s = renameSymbol(createWizardState(), 'HP1', 'en', 'Phoenix');
    s = renameSymbol(s, 'HP1', 'es', 'Fénix');
    expect(s.symbolRenames.length).toBe(1);
    expect(s.symbolRenames[0].labels.en).toBe('Phoenix');
    expect(s.symbolRenames[0].labels.es).toBe('Fénix');
  });

  it('setActiveLocale updates the wizard locale only', () => {
    const s = setActiveLocale(createWizardState(), 'pt');
    expect(s.activeLocale).toBe('pt');
  });
});

describe('reskin-wizard · paytable + display name', () => {
  it('setPaytableValue replaces previous value for same key', () => {
    let s = setPaytableValue(createWizardState(), 'HP1@5', 250);
    s = setPaytableValue(s, 'HP1@5', 500);
    expect(s.paytableTweaks.length).toBe(1);
    expect(s.paytableTweaks[0].multiplier).toBe(500);
  });

  it('setNewDisplayName updates name', () => {
    const s = setNewDisplayName(createWizardState(), 'Quick Hit Phoenix');
    expect(s.newDisplayName).toBe('Quick Hit Phoenix');
  });
});

describe('reskin-wizard · preview', () => {
  it('buildPreview builds reels matching template layout', () => {
    let s = chooseTemplate(createWizardState(), QHD);
    s = chooseTheme(s, 'mythological');
    s = buildPreview(s, QHD);
    const { cols, rows } = layoutDimensions(QHD.layout);
    expect(s.previewReels.length).toBe(cols);
    expect(s.previewReels[0].length).toBe(rows);
    expect(s.step).toBe('preview');
  });

  it('layoutDimensions handles 5x3, 6x4, dual-grid, megaways', () => {
    expect(layoutDimensions('5x3')).toEqual({ cols: 5, rows: 3 });
    expect(layoutDimensions('6x4')).toEqual({ cols: 6, rows: 4 });
    expect(layoutDimensions('dual-grid').cols).toBeGreaterThan(0);
    expect(layoutDimensions('megaways').cols).toBeGreaterThan(0);
  });
});

describe('reskin-wizard · validate + export', () => {
  it('validateForExport flags missing fields', () => {
    const errs = validateForExport(createWizardState());
    expect(errs.length).toBeGreaterThan(0);
  });

  it('exportBundle throws when validation fails', () => {
    expect(() => exportBundle(createWizardState(), QHD)).toThrow();
  });

  it('exportBundle produces manifest + ir + 3 files when ready', () => {
    let s = chooseTemplate(createWizardState(), QHD);
    s = chooseTheme(s, 'mythological');
    s = setNewDisplayName(s, 'Quick Hit Phoenix');
    s = renameSymbol(s, 'HP1', 'en', 'Phoenix');
    s = buildPreview(s, QHD);
    const out = exportBundle(s, QHD, () => new Date('2026-05-18T10:00:00Z'));
    expect(out.manifest.sourceTemplateId).toBe('tpl-quick-hit-dragons');
    expect(out.ir.name).toBe('Quick Hit Phoenix');
    expect(out.files.length).toBe(3);
    expect(out.files.map((f) => f.name)).toEqual(['manifest.json', 'game.ir.json', 'README.md']);
  });

  it('end-to-end Quick Hit Dragons → Phoenix demo bundle has expected IR fields', () => {
    const out = runQuickHitDragonsToPhoenixDemo(QHD, () => new Date('2026-05-18T10:00:00Z'));
    expect(out.ir.name).toBe('Quick Hit Phoenix');
    expect(out.ir.theme).toBe('mythological');
    expect(out.manifest.symbolRenameCount).toBeGreaterThan(0);
    expect(out.manifest.paytableTweakCount).toBeGreaterThan(0);
  });
});
