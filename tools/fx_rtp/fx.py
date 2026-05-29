"""PHASE 40 — FX-normalised RTP kernel."""

from __future__ import annotations

from dataclasses import dataclass, field


# Jurisdictional currency restrictions (illustrative 2024 baseline).
_JURISDICTION_CURRENCIES: dict[str, set[str]] = {
    "UKGC":       {"GBP"},
    "MGA":        {"EUR", "GBP", "USD"},
    "NV":         {"USD"},
    "ON":         {"CAD"},
    "AAMS":       {"EUR"},
    "EU-GA-2024": {"EUR", "GBP", "USD"},
}


@dataclass(frozen=True)
class FXTable:
    """Pinned FX rates relative to a base currency."""
    base_currency: str
    rates: dict[str, float]    # rates["EUR"] = 1 base unit → X EUR
    # rate[base] should be 1.0 by convention
    pinned_iso_timestamp: str = ""

    def __post_init__(self) -> None:
        if not self.base_currency:
            raise ValueError("base_currency must be non-empty")
        for code, rate in self.rates.items():
            if not isinstance(rate, (int, float)) or rate <= 0:
                raise ValueError(f"FX rate for {code} must be > 0")
        if self.base_currency not in self.rates:
            raise ValueError(f"base_currency {self.base_currency!r} missing from rates")
        if abs(self.rates[self.base_currency] - 1.0) > 1e-9:
            raise ValueError("base_currency rate must equal 1.0")

    def to_base(self, amount: float, code: str) -> float:
        if code not in self.rates:
            raise ValueError(f"unknown currency: {code!r}")
        return amount / self.rates[code]


@dataclass(frozen=True)
class CurrencyRTPInputs:
    currency: str
    total_bet_native: float
    total_payout_native: float


@dataclass
class NormalisedRTPResult:
    schema_version: str = "urn:slotmath:fx-rtp:v1"
    base_currency: str = ""
    per_currency_raw_rtp: dict[str, float] = field(default_factory=dict)
    per_currency_bet_base: dict[str, float] = field(default_factory=dict)
    per_currency_payout_base: dict[str, float] = field(default_factory=dict)
    total_bet_base: float = 0.0
    total_payout_base: float = 0.0
    normalised_rtp: float = 0.0


def compute_normalised_rtp(
    *,
    fx_table: FXTable,
    inputs: list[CurrencyRTPInputs],
) -> NormalisedRTPResult:
    """Normalise per-currency bet/payout streams into base-currency RTP."""
    if not inputs:
        return NormalisedRTPResult(base_currency=fx_table.base_currency)
    result = NormalisedRTPResult(base_currency=fx_table.base_currency)
    total_bet_base = 0.0
    total_pay_base = 0.0
    for inp in inputs:
        if inp.total_bet_native < 0 or inp.total_payout_native < 0:
            raise ValueError(
                f"bet/payout for {inp.currency} must be ≥ 0"
            )
        bet_base = fx_table.to_base(inp.total_bet_native, inp.currency)
        pay_base = fx_table.to_base(inp.total_payout_native, inp.currency)
        raw = (
            inp.total_payout_native / inp.total_bet_native
            if inp.total_bet_native > 0 else 0.0
        )
        result.per_currency_raw_rtp[inp.currency] = round(raw, 8)
        result.per_currency_bet_base[inp.currency] = round(bet_base, 6)
        result.per_currency_payout_base[inp.currency] = round(pay_base, 6)
        total_bet_base += bet_base
        total_pay_base += pay_base
    result.total_bet_base = round(total_bet_base, 6)
    result.total_payout_base = round(total_pay_base, 6)
    if total_bet_base > 0:
        result.normalised_rtp = round(total_pay_base / total_bet_base, 8)
    return result


def list_jurisdiction_allowed_currencies(jurisdiction: str) -> list[str]:
    if jurisdiction not in _JURISDICTION_CURRENCIES:
        raise ValueError(f"unknown jurisdiction: {jurisdiction!r}")
    return sorted(_JURISDICTION_CURRENCIES[jurisdiction])
