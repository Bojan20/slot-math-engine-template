// CORTI 200.8 — i18n stub module for the studio shell.
//
// Provides setLocale() / t() / availableLocales() helpers. Locale
// dictionaries live in `i18n/<code>.json` and are imported at build
// time so the studio works in `file://` contexts without network
// fetches.
//
// Designed to be tree-shakeable: the studio shell calls `setLocale()`
// once on boot, then `t('key')` everywhere. Missing keys fall back
// to English, then to the raw key string if EN is also missing.

import EN from './en.json';
import DE from './de.json';
import FR from './fr.json';
import ES from './es.json';
import IT from './it.json';
import JA from './ja.json';
import ZH from './zh.json';

export interface LocaleDict {
  locale: string;
  name: string;
  strings: Record<string, string>;
}

export const LOCALES: Record<string, LocaleDict> = {
  en: EN as LocaleDict,
  de: DE as LocaleDict,
  fr: FR as LocaleDict,
  es: ES as LocaleDict,
  it: IT as LocaleDict,
  ja: JA as LocaleDict,
  zh: ZH as LocaleDict,
};

const DEFAULT_LOCALE = 'en';
let currentLocale: string = DEFAULT_LOCALE;

/**
 * Set the active locale code. Unknown codes silently fall back to EN.
 * Returns the resolved locale id (always one that exists in LOCALES).
 */
export function setLocale(code: string): string {
  if (LOCALES[code]) {
    currentLocale = code;
  } else {
    currentLocale = DEFAULT_LOCALE;
  }
  return currentLocale;
}

/** Get the currently active locale id. */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Lookup a translated string for `key`. Falls back to EN, then to
 * the raw key if not present anywhere.
 */
export function t(key: string): string {
  const active = LOCALES[currentLocale]?.strings[key];
  if (active !== undefined) return active;
  const fallback = LOCALES[DEFAULT_LOCALE]?.strings[key];
  if (fallback !== undefined) return fallback;
  return key;
}

/** Return all available locale ids in display order (EN first). */
export function availableLocales(): string[] {
  const all = Object.keys(LOCALES);
  const en = all.filter((c) => c === 'en');
  const rest = all.filter((c) => c !== 'en').sort();
  return [...en, ...rest];
}

/** Get the display name for a locale code (e.g. 'Français' for 'fr'). */
export function localeName(code: string): string {
  return LOCALES[code]?.name ?? code;
}

/** Reset to EN — used by tests. */
export function resetLocale(): void {
  currentLocale = DEFAULT_LOCALE;
}
