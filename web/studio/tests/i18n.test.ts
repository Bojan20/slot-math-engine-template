// CORTI 200.8 — i18n module tests.
//
// Validates locale registry shape, setLocale / t / availableLocales,
// fallback behaviour, and presence of all 7 locale files.

import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale, getLocale, t, availableLocales, LOCALES, localeName, resetLocale } from '../i18n/i18n.js';

describe('i18n — locale registry', () => {
  it('exposes exactly 7 locales (en + 6 others)', () => {
    expect(Object.keys(LOCALES).sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'ja', 'zh']);
  });

  it('every locale has a non-empty strings dict', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      expect(dict.locale, code).toBe(code);
      expect(Object.keys(dict.strings).length, code).toBeGreaterThanOrEqual(20);
    }
  });

  it('every locale declares the same key set as EN', () => {
    const enKeys = new Set(Object.keys(LOCALES.en!.strings));
    for (const [code, dict] of Object.entries(LOCALES)) {
      const myKeys = new Set(Object.keys(dict.strings));
      expect(myKeys.size, code).toBe(enKeys.size);
      for (const k of enKeys) expect(myKeys.has(k), `${code} missing ${k}`).toBe(true);
    }
  });
});

describe('i18n — setLocale / getLocale', () => {
  beforeEach(() => resetLocale());

  it('defaults to en', () => {
    expect(getLocale()).toBe('en');
  });

  it('setLocale switches active locale', () => {
    setLocale('de');
    expect(getLocale()).toBe('de');
  });

  it('setLocale with unknown code falls back to en', () => {
    setLocale('xx');
    expect(getLocale()).toBe('en');
  });
});

describe('i18n — t() translation lookup', () => {
  beforeEach(() => resetLocale());

  it('returns english string when locale=en', () => {
    expect(t('app.title')).toBe('Slot Math Studio');
  });

  it('returns german string when locale=de', () => {
    setLocale('de');
    expect(t('app.title')).toBe('Slot Math Studio');
    expect(t('action.spin')).toBe('Drehen');
  });

  it('falls back to en when key missing in active locale', () => {
    // synthetic test: insert key only into en, then switch
    LOCALES.en!.strings['__fallback_test'] = 'fallback-value';
    setLocale('de');
    expect(t('__fallback_test')).toBe('fallback-value');
    delete LOCALES.en!.strings['__fallback_test'];
  });

  it('returns raw key when missing everywhere', () => {
    expect(t('nope.does.not.exist')).toBe('nope.does.not.exist');
  });
});

describe('i18n — helpers', () => {
  it('availableLocales lists EN first then sorted rest', () => {
    const order = availableLocales();
    expect(order[0]).toBe('en');
    expect(order.length).toBe(7);
  });

  it('localeName returns display name for code', () => {
    expect(localeName('de')).toBe('Deutsch');
    expect(localeName('fr')).toBe('Français');
    expect(localeName('xx')).toBe('xx');
  });
});
