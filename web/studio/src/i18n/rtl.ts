// W208 — Right-to-left (RTL) locale skeleton.
//
// The W208 seed ships en/es/pt/de — all LTR. This module is the
// infrastructure layer for future Arabic / Hebrew / Persian / Urdu
// expansion (planned for a later W2xx wave).
//
// Contract:
//   - isRtlLocale(code) returns true for any RTL BCP-47 base tag
//   - applyDirectionToDocument(locale) toggles <html dir="rtl"|"ltr">
//     and writes the --text-align-start CSS custom property so CSS can
//     consume it as `text-align: var(--text-align-start)`.
//
// CSS authoring guidance:
//   .label { text-align: var(--text-align-start, left); }

import type { Locale } from './types.js';

/**
 * Base tags of known RTL scripts. Pulled from CLDR rtlBase data. Extend
 * here when a new RTL locale is added to SUPPORTED_LOCALES.
 */
const RTL_BASE_TAGS = new Set<string>(['ar', 'arc', 'ckb', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ps', 'sd', 'ug', 'ur', 'yi']);

/**
 * Return true when the given locale code should render right-to-left.
 * Accepts both seeded `Locale` codes and arbitrary BCP-47 base tags
 * (so it works for forward-compatible additions like "ar-EG").
 */
export function isRtlLocale(code: Locale | string): boolean {
  if (!code) return false;
  const base = String(code).toLowerCase().split('-')[0] ?? '';
  return RTL_BASE_TAGS.has(base);
}

/**
 * Mutate the `<html>` element's `dir` attribute and the
 * `--text-align-start` CSS variable to reflect the locale's direction.
 * Safe to call in non-browser contexts (no-op when document is undef).
 */
export function applyDirectionToDocument(code: Locale | string): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (!html) return;
  const rtl = isRtlLocale(code);
  html.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  html.style.setProperty('--text-align-start', rtl ? 'right' : 'left');
  html.style.setProperty('--text-align-end', rtl ? 'left' : 'right');
}

/**
 * Pure helper — returns the `dir` string ('ltr' | 'rtl') for a locale.
 * Useful for SSR / unit-test assertions where document is unavailable.
 */
export function directionFor(code: Locale | string): 'ltr' | 'rtl' {
  return isRtlLocale(code) ? 'rtl' : 'ltr';
}
