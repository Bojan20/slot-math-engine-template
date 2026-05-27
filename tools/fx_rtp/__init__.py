"""PHASE 40 — Currency-Independent RTP Calculator.

Normalises bet × payout streams across multiple currencies via a
pinned FX rate table. Outputs:
  - per-currency raw RTP (native)
  - normalised RTP in operator base currency
  - per-currency jurisdiction tournament-allowability flag

Pure stdlib.

Public API:
    from tools.fx_rtp import (
        FXTable,
        CurrencyRTPInputs,
        compute_normalised_rtp,
        list_jurisdiction_allowed_currencies,
    )
"""

from __future__ import annotations

from tools.fx_rtp.fx import (
    FXTable,
    CurrencyRTPInputs,
    NormalisedRTPResult,
    compute_normalised_rtp,
    list_jurisdiction_allowed_currencies,
)

__all__ = [
    "FXTable",
    "CurrencyRTPInputs",
    "NormalisedRTPResult",
    "compute_normalised_rtp",
    "list_jurisdiction_allowed_currencies",
]
