// W208 — Studio i18n core (Faza 400.1 Bootstrap).
//
// Vanilla-TS i18n with zero external deps. Strategic choice: we own
// 100% of the surface so we can evolve it for cert-paper-trail needs
// (e.g. embed locale into operator-package metadata) without fighting
// upstream library opinions.
//
// Public surface:
//   t(key, params?)              translate
//   t.plural(key, count, params) ICU-style plural via Intl.PluralRules
//   t.num(value, opts?)          locale-aware number formatting
//   t.currency(value, ccy, opts?)
//   t.date(date, opts?)          locale-aware date formatting
//   setLocale(locale)            switch & persist
//   getCurrentLocale()           read
//   loadLocale(locale)           preload/lazy-hook (sync today, async-ready)
//   getSupportedLocales()        readonly list
//   onLocaleChange(cb)           subscribe
//
// Fallback: missing key in active locale → English source → raw key.
// In dev mode (import.meta.env.DEV) a console.warn is emitted on miss.

import { en } from './locales/en.js';
import { es } from './locales/es.js';
import { pt } from './locales/pt.js';
import { de } from './locales/de.js';
import {
  LOCALE_STORAGE_KEY,
  LOCALE_DISPLAY,
  SUPPORTED_LOCALES,
  type Locale,
  type TranslationKey,
  type TranslationDict,
} from './types.js';
import { applyDirectionToDocument } from './rtl.js';

const DICTS: Record<Locale, TranslationDict> = {
  en: en as TranslationDict,
  es,
  pt,
  de,
};

const DEFAULT_LOCALE: Locale = 'en';
let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<(locale: Locale) => void>();

// ── Dev-mode detection (Vite injects import.meta.env, Node tests don't)
function isDev(): boolean {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    return Boolean(meta?.env?.DEV);
  } catch {
    return false;
  }
}

// ── Storage helpers (SSR / Node safe) ──────────────────────────────
function readStoredLocale(): Locale | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)) {
      return raw as Locale;
    }
  } catch {
    /* localStorage blocked (private mode) — fall through */
  }
  return null;
}

function persistLocale(loc: Locale): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCALE_STORAGE_KEY, loc);
  } catch {
    /* swallow */
  }
}

function updateHtmlLang(loc: Locale): void {
  try {
    if (typeof document === 'undefined') return;
    document.documentElement?.setAttribute('lang', loc);
    applyDirectionToDocument(loc);
  } catch {
    /* swallow */
  }
}

// ── Init on module load: hydrate from localStorage if present ──────
const stored = readStoredLocale();
if (stored) {
  currentLocale = stored;
  updateHtmlLang(stored);
}

// ── Parameter interpolation: replace {name} with params.name ───────
function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const v = params[key];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}

// ── Translate ───────────────────────────────────────────────────────
function translate(key: string, params?: Record<string, unknown>): string {
  const active = DICTS[currentLocale] as Record<string, string>;
  const fallback = DICTS[DEFAULT_LOCALE] as Record<string, string>;
  let raw = active[key];
  if (raw === undefined) {
    raw = fallback[key];
    if (raw === undefined) {
      if (isDev()) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: "${key}"`);
      }
      return key;
    }
    if (isDev() && currentLocale !== DEFAULT_LOCALE) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] key "${key}" missing in "${currentLocale}", using "${DEFAULT_LOCALE}"`);
    }
  }
  return interpolate(raw, params);
}

// ── Pluralisation via Intl.PluralRules ─────────────────────────────
function plural(
  baseKey: string,
  count: number,
  params?: Record<string, unknown>,
): string {
  let category: string;
  try {
    category = new Intl.PluralRules(currentLocale).select(count);
  } catch {
    category = count === 1 ? 'one' : 'other';
  }
  const merged = { ...(params ?? {}), count };
  const dict = DICTS[currentLocale] as Record<string, string>;
  const en_dict = DICTS[DEFAULT_LOCALE] as Record<string, string>;
  const tryKey = (k: string): string | undefined => dict[k] ?? en_dict[k];
  const candidate =
    tryKey(`${baseKey}.${category}`) ??
    tryKey(`${baseKey}.other`) ??
    tryKey(baseKey);
  if (candidate === undefined) {
    if (isDev()) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing plural key: "${baseKey}"`);
    }
    return baseKey;
  }
  return interpolate(candidate, merged);
}

// ── Number / currency / date helpers ───────────────────────────────
function num(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale, opts).format(value);
}

function currency(value: number, ccy: string, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale, {
    style: 'currency',
    currency: ccy,
    ...opts,
  }).format(value);
}

function date(value: Date | number, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(currentLocale, opts).format(value);
}

// ── Public `t` callable with helper methods attached ───────────────
export interface TFunction {
  (key: TranslationKey, params?: Record<string, unknown>): string;
  /** Permissive overload for synthetic / plural keys not in the union. */
  (key: string, params?: Record<string, unknown>): string;
  plural: typeof plural;
  num: typeof num;
  currency: typeof currency;
  date: typeof date;
}

export const t: TFunction = Object.assign(
  (key: string, params?: Record<string, unknown>): string => translate(key, params),
  { plural, num, currency, date },
) as TFunction;

// ── Mutator / accessor surface ─────────────────────────────────────
export function setLocale(loc: Locale | string): Locale {
  const resolved = (SUPPORTED_LOCALES as readonly string[]).includes(loc as string)
    ? (loc as Locale)
    : DEFAULT_LOCALE;
  if (resolved !== currentLocale) {
    currentLocale = resolved;
    persistLocale(resolved);
    updateHtmlLang(resolved);
    for (const cb of listeners) {
      try {
        cb(resolved);
      } catch {
        /* ignore listener errors */
      }
    }
  } else {
    // Persist + html lang refresh even if already-current (idempotent boot).
    persistLocale(resolved);
    updateHtmlLang(resolved);
  }
  return resolved;
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}

/**
 * Today the locale dicts are statically bundled (small, ~4kB each), so
 * loadLocale() is a synchronous identity. The async signature lets us
 * swap to dynamic `import()` in a future wave without changing callers.
 */
export async function loadLocale(loc: Locale): Promise<void> {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(loc)) {
    throw new Error(`unsupported locale: ${loc}`);
  }
  // No-op: bundled. Future: return import(`./locales/${loc}.js`).
  await Promise.resolve();
}

export function getSupportedLocales(): readonly Locale[] {
  return SUPPORTED_LOCALES;
}

export function getLocaleDisplay(loc: Locale): { flag: string; name: string } {
  return LOCALE_DISPLAY[loc];
}

export function onLocaleChange(cb: (locale: Locale) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reset state — used by tests. Not part of the public app surface. */
export function __resetForTests(): void {
  currentLocale = DEFAULT_LOCALE;
  listeners.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    /* swallow */
  }
}

export type { Locale, TranslationKey, TranslationDict } from './types.js';
