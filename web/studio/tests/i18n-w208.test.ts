// W208 Faza 400.1 — i18n bootstrap test suite.
//
// Targets the new studio/src/i18n/ module (separate from the legacy
// web/studio/i18n/i18n.ts shell-level shim). Covers: parity, t()
// fallback, parameter interpolation, pluralisation, locale-aware
// formatting helpers, RTL detection, and persistence.
//
// All tests run under the node vitest env. DOM-dependent surface is
// covered with a stubbed document/localStorage.

import { describe, it, expect, beforeEach } from 'vitest';
import { en } from '../src/i18n/locales/en.js';
import { es } from '../src/i18n/locales/es.js';
import { pt } from '../src/i18n/locales/pt.js';
import { de } from '../src/i18n/locales/de.js';
import {
  t,
  setLocale,
  getCurrentLocale,
  getSupportedLocales,
  getLocaleDisplay,
  loadLocale,
  onLocaleChange,
  __resetForTests,
} from '../src/i18n/index.js';
import { isRtlLocale, directionFor } from '../src/i18n/rtl.js';
import { LOCALE_STORAGE_KEY } from '../src/i18n/types.js';

// ── Minimal localStorage stub (node has no DOM) ─────────────────────
interface MemStore {
  store: Map<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  clear(): void;
}

function installLocalStorageStub(): MemStore {
  const mem: MemStore = {
    store: new Map(),
    getItem(k) {
      return this.store.has(k) ? (this.store.get(k) as string) : null;
    },
    setItem(k, v) {
      this.store.set(k, v);
    },
    removeItem(k) {
      this.store.delete(k);
    },
    clear() {
      this.store.clear();
    },
  };
  (globalThis as unknown as { localStorage: MemStore }).localStorage = mem;
  return mem;
}

describe('W208 i18n — locale registry parity', () => {
  it('English source declares at least 80 keys', () => {
    expect(Object.keys(en).length).toBeGreaterThanOrEqual(80);
  });

  it('Spanish has same key set as English', () => {
    const enKeys = new Set(Object.keys(en));
    const esKeys = new Set(Object.keys(es));
    expect(esKeys.size).toBe(enKeys.size);
    for (const k of enKeys) expect(esKeys.has(k), `es missing ${k}`).toBe(true);
  });

  it('Portuguese has same key set as English', () => {
    const enKeys = new Set(Object.keys(en));
    const ptKeys = new Set(Object.keys(pt));
    expect(ptKeys.size).toBe(enKeys.size);
    for (const k of enKeys) expect(ptKeys.has(k), `pt missing ${k}`).toBe(true);
  });

  it('German has same key set as English', () => {
    const enKeys = new Set(Object.keys(en));
    const deKeys = new Set(Object.keys(de));
    expect(deKeys.size).toBe(enKeys.size);
    for (const k of enKeys) expect(deKeys.has(k), `de missing ${k}`).toBe(true);
  });

  it('all 4 locales share the same key set (parity matrix)', () => {
    const ref = new Set(Object.keys(en));
    for (const [name, dict] of [
      ['es', es],
      ['pt', pt],
      ['de', de],
    ] as const) {
      const actual = new Set(Object.keys(dict));
      expect(actual.size, name).toBe(ref.size);
    }
  });

  it('every non-English value is a non-empty string', () => {
    for (const [name, dict] of [
      ['es', es],
      ['pt', pt],
      ['de', de],
    ] as const) {
      for (const [k, v] of Object.entries(dict)) {
        expect(typeof v, `${name}.${k} type`).toBe('string');
        expect(v.length, `${name}.${k} empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('W208 i18n — setLocale / getCurrentLocale', () => {
  beforeEach(() => {
    installLocalStorageStub();
    __resetForTests();
  });

  it('defaults to en', () => {
    expect(getCurrentLocale()).toBe('en');
  });

  it('setLocale switches active locale', () => {
    setLocale('es');
    expect(getCurrentLocale()).toBe('es');
  });

  it('setLocale with unknown code falls back to en', () => {
    setLocale('xx' as unknown as 'en');
    expect(getCurrentLocale()).toBe('en');
  });

  it('setLocale persists choice to localStorage', () => {
    const store = installLocalStorageStub();
    setLocale('de');
    expect(store.getItem(LOCALE_STORAGE_KEY)).toBe('de');
  });

  it('onLocaleChange fires when locale switches', () => {
    let seen: string | null = null;
    const off = onLocaleChange((l) => {
      seen = l;
    });
    setLocale('pt');
    expect(seen).toBe('pt');
    off();
  });
});

describe('W208 i18n — t() translation', () => {
  beforeEach(() => {
    installLocalStorageStub();
    __resetForTests();
  });

  it('returns English string by default', () => {
    expect(t('nav.build')).toBe('BUILD');
  });

  it('returns Spanish string when locale=es', () => {
    setLocale('es');
    expect(t('nav.build')).toBe('DISEÑAR');
  });

  it('returns Portuguese string when locale=pt', () => {
    setLocale('pt');
    expect(t('actions.save')).toBe('Salvar');
  });

  it('returns German string when locale=de', () => {
    setLocale('de');
    expect(t('actions.save')).toBe('Speichern');
  });

  it('interpolates {param} placeholders', () => {
    expect(t('errors.validation', { reason: 'bad input' })).toBe('Validation failed: bad input');
  });

  it('interpolates across locales (es)', () => {
    setLocale('es');
    expect(t('modals.confirm_delete.body', { name: 'Test' })).toBe(
      '¿Eliminar «Test»? Esta acción no se puede deshacer.',
    );
  });

  it('returns raw key when missing everywhere', () => {
    expect(t('nope.does.not.exist')).toBe('nope.does.not.exist');
  });

  it('falls back to English when key missing in active locale', () => {
    // Synthetic: inject a key only into en.
    (en as Record<string, string>).__test_fallback_w208 = 'fallback-en-value';
    setLocale('de');
    try {
      expect(t('__test_fallback_w208')).toBe('fallback-en-value');
    } finally {
      delete (en as Record<string, string>).__test_fallback_w208;
    }
  });

  it('leaves placeholder if param missing', () => {
    expect(t('errors.validation', {})).toBe('Validation failed: {reason}');
  });
});

describe('W208 i18n — t.plural via Intl.PluralRules', () => {
  beforeEach(() => {
    installLocalStorageStub();
    __resetForTests();
  });

  it('selects "one" for count=1 (English)', () => {
    (en as Record<string, string>).__plural_test_w208 = 'fallback';
    (en as Record<string, string>)['__plural_test_w208.one'] = '{count} item';
    (en as Record<string, string>)['__plural_test_w208.other'] = '{count} items';
    try {
      expect(t.plural('__plural_test_w208', 1)).toBe('1 item');
      expect(t.plural('__plural_test_w208', 5)).toBe('5 items');
    } finally {
      delete (en as Record<string, string>).__plural_test_w208;
      delete (en as Record<string, string>)['__plural_test_w208.one'];
      delete (en as Record<string, string>)['__plural_test_w208.other'];
    }
  });

  it('handles plurals across locales (German plural=one for 1)', () => {
    (en as Record<string, string>)['__pl2.one'] = '{count} Sache';
    (en as Record<string, string>)['__pl2.other'] = '{count} Sachen';
    (de as Record<string, string>)['__pl2.one'] = '{count} Sache';
    (de as Record<string, string>)['__pl2.other'] = '{count} Sachen';
    try {
      setLocale('de');
      expect(t.plural('__pl2', 1)).toBe('1 Sache');
      expect(t.plural('__pl2', 4)).toBe('4 Sachen');
    } finally {
      delete (en as Record<string, string>)['__pl2.one'];
      delete (en as Record<string, string>)['__pl2.other'];
      delete (de as Record<string, string>)['__pl2.one'];
      delete (de as Record<string, string>)['__pl2.other'];
    }
  });
});

describe('W208 i18n — t.num / t.currency / t.date formatting', () => {
  beforeEach(() => {
    installLocalStorageStub();
    __resetForTests();
  });

  it('formats numbers per-locale (en uses dot, de uses comma)', () => {
    setLocale('en');
    expect(t.num(1234.5)).toMatch(/1,234/);
    setLocale('de');
    expect(t.num(1234.5)).toMatch(/1\.234/);
  });

  it('formats currency with style:currency', () => {
    setLocale('en');
    const usd = t.currency(99.5, 'USD');
    expect(usd).toMatch(/99/);
    expect(usd).toMatch(/\$/);
  });

  it('formats dates per-locale', () => {
    const d = new Date('2026-05-18T00:00:00Z');
    setLocale('en');
    const enOut = t.date(d, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
    expect(enOut.length).toBeGreaterThan(0);
    setLocale('de');
    const deOut = t.date(d, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
    expect(deOut).not.toBe(enOut);
  });
});

describe('W208 i18n — supported locales / display', () => {
  it('reports exactly 4 supported locales (en/es/pt/de)', () => {
    expect([...getSupportedLocales()].sort()).toEqual(['de', 'en', 'es', 'pt']);
  });

  it('exposes flag + name per locale', () => {
    expect(getLocaleDisplay('en')).toEqual({ flag: '🇬🇧', name: 'English' });
    expect(getLocaleDisplay('es')).toEqual({ flag: '🇪🇸', name: 'Español' });
    expect(getLocaleDisplay('pt')).toEqual({ flag: '🇧🇷', name: 'Português' });
    expect(getLocaleDisplay('de')).toEqual({ flag: '🇩🇪', name: 'Deutsch' });
  });

  it('loadLocale resolves for known locales', async () => {
    await expect(loadLocale('es')).resolves.toBeUndefined();
  });

  it('loadLocale rejects for unknown locale', async () => {
    await expect(loadLocale('xx' as unknown as 'en')).rejects.toThrow();
  });
});

describe('W208 i18n — RTL skeleton', () => {
  it('isRtlLocale returns false for the 4 seeded LTR locales', () => {
    for (const code of ['en', 'es', 'pt', 'de'] as const) {
      expect(isRtlLocale(code), code).toBe(false);
    }
  });

  it('isRtlLocale returns true for Arabic/Hebrew/Persian/Urdu', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('he')).toBe(true);
    expect(isRtlLocale('fa')).toBe(true);
    expect(isRtlLocale('ur')).toBe(true);
  });

  it('handles regional sub-tags (ar-EG)', () => {
    expect(isRtlLocale('ar-EG')).toBe(true);
    expect(isRtlLocale('en-US')).toBe(false);
  });

  it('directionFor returns ltr/rtl strings', () => {
    expect(directionFor('en')).toBe('ltr');
    expect(directionFor('ar')).toBe('rtl');
  });
});
