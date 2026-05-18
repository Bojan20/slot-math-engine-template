// W208 — Public i18n type surface.
//
// Re-exports the TranslationKey union (generated from the English source
// of truth) so consumers get autocomplete + compile-time safety on
// t('…') calls without circular imports.

export type { TranslationKey, TranslationDict } from './locales/en.js';

export type Locale = 'en' | 'es' | 'pt' | 'de';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'es', 'pt', 'de'] as const;

export const LOCALE_DISPLAY: Record<Locale, { flag: string; name: string }> = {
  en: { flag: '🇬🇧', name: 'English' },
  es: { flag: '🇪🇸', name: 'Español' },
  pt: { flag: '🇧🇷', name: 'Português' },
  de: { flag: '🇩🇪', name: 'Deutsch' },
};

/** Storage key for the persisted user-selected locale. */
export const LOCALE_STORAGE_KEY = 'slot-math-studio.locale';

/** Pluralisation categories per Intl.PluralRules. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * Optional plural-form rule map. Keys can register variants like
 *   t.plural('items', n)
 * which then resolves to e.g. 'items.one' / 'items.other'.
 */
export type PluralRuleMap = Partial<Record<PluralCategory, string>>;
