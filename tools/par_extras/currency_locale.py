"""SLOT-MATH Faza 6.9 — Multi-currency + locale-aware formatting.

Per-jurisdiction currency clamp + locale-aware number/text presentation.
Math layer ALWAYS stays in canonical base-bet units (no currency leakage
into kernel). Only RGS presentation layer applies these conversions.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LocaleProfile:
    code: str             # ISO 639-1 + ISO 3166-1 ("en-GB", "sr-RS", "de-DE", ...)
    currency: str         # ISO 4217 ("GBP", "EUR", "USD", "RSD", ...)
    decimal_sep: str
    thousand_sep: str
    currency_position: str  # "before" or "after"


SUPPORTED_LOCALES: dict[str, LocaleProfile] = {
    "en-GB": LocaleProfile("en-GB", "GBP", ".", ",", "before"),
    "en-US": LocaleProfile("en-US", "USD", ".", ",", "before"),
    "sr-RS": LocaleProfile("sr-RS", "RSD", ",", ".", "after"),
    "de-DE": LocaleProfile("de-DE", "EUR", ",", ".", "after"),
    "fr-FR": LocaleProfile("fr-FR", "EUR", ",", " ", "after"),
    "es-ES": LocaleProfile("es-ES", "EUR", ",", ".", "after"),
    "it-IT": LocaleProfile("it-IT", "EUR", ",", ".", "after"),
    "nl-NL": LocaleProfile("nl-NL", "EUR", ",", ".", "before"),
    "pt-PT": LocaleProfile("pt-PT", "EUR", ",", ".", "after"),
    "fr-CA": LocaleProfile("fr-CA", "CAD", ",", " ", "after"),
    "en-CA": LocaleProfile("en-CA", "CAD", ".", ",", "before"),
    "ja-JP": LocaleProfile("ja-JP", "JPY", ".", ",", "before"),
    "zh-CN": LocaleProfile("zh-CN", "CNY", ".", ",", "before"),
}

SUPPORTED_CURRENCIES = {p.currency for p in SUPPORTED_LOCALES.values()}


# Static FX (illustrative; production hits a daily-refreshed FX provider)
_FX_TO_USD: dict[str, float] = {
    "USD": 1.0,
    "GBP": 1.27,
    "EUR": 1.08,
    "RSD": 0.0093,
    "CAD": 0.74,
    "JPY": 0.0067,
    "CNY": 0.14,
}


def convert_amount(amount: float, from_ccy: str, to_ccy: str) -> float:
    """Currency conversion via USD pivot."""
    if from_ccy == to_ccy:
        return amount
    if from_ccy not in _FX_TO_USD or to_ccy not in _FX_TO_USD:
        raise ValueError(f"unsupported currency: {from_ccy} or {to_ccy}")
    usd = amount * _FX_TO_USD[from_ccy]
    return usd / _FX_TO_USD[to_ccy]


def format_amount(amount: float, locale: str) -> str:
    """Render amount per locale convention (currency symbol + separators)."""
    if locale not in SUPPORTED_LOCALES:
        raise ValueError(f"unsupported locale: {locale}")
    profile = SUPPORTED_LOCALES[locale]
    # 2-decimal display, locale-specific separators
    intp, decp = f"{amount:.2f}".split(".")
    # Insert thousand separators
    n = len(intp)
    if n > 3:
        chunks = []
        while n > 3:
            chunks.append(intp[n - 3 : n])
            n -= 3
        chunks.append(intp[:n])
        intp = profile.thousand_sep.join(reversed(chunks))
    formatted = f"{intp}{profile.decimal_sep}{decp}"
    if profile.currency_position == "before":
        return f"{profile.currency} {formatted}"
    return f"{formatted} {profile.currency}"
