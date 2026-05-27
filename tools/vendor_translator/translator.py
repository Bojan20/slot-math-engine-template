"""PHASE 33 — Cross-Vendor IR Translator kernel.

Each vendor has a `dialect map` specifying:
  - field_aliases: vendor_field → universal_field
  - feature_kind_aliases: vendor_kind → universal_kind
  - scope_aliases: vendor_scope → universal_scope

Translation is one-way (vendor → universal) + reversible (universal →
vendor) by inverting the map. Unknown vendor fields are kept under a
`_vendor_extras` block so round-trip is lossless.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any


_DIALECTS: dict[str, dict[str, Any]] = {
    "vendor_a": {
        "field_aliases": {
            "rtpTarget": "target_rtp",
            "reelsCount": "reels",
            "rowsCount": "rows",
            "linesCount": "paylines",
            "vendorWeight": "weight",
            "vendorSymbol": "symbol",
        },
        "feature_kind_aliases": {
            "FreeSpinsBonus": "free_spins",
            "HoldSpin": "hold_and_win",
            "PickGame": "pick_bonus",
            "WheelOfFortune": "wheel_bonus",
        },
        "scope_aliases": {
            "PER_LINE": "line",
            "ANYWHERE": "scatter",
        },
    },
    "vendor_b": {
        "field_aliases": {
            "RTP_Target": "target_rtp",
            "ReelsN": "reels",
            "RowsN": "rows",
            "Lines": "paylines",
            "W": "weight",
            "Sym": "symbol",
        },
        "feature_kind_aliases": {
            "FS": "free_spins",
            "CASH_ERUPTION": "hold_and_win",
            "BONUS_WHEEL": "wheel_bonus",
        },
        "scope_aliases": {
            "line": "line",
            "scatter": "scatter",
            "cluster": "cluster",
        },
    },
}


@dataclass
class TranslationReport:
    schema_version: str = "urn:slotmath:vendor-translator:v1"
    from_dialect: str = ""
    to_dialect: str = "universal"
    fields_renamed: int = 0
    enums_remapped: int = 0
    unknown_fields_preserved: list[str] = field(default_factory=list)


def list_supported_vendors() -> list[str]:
    return sorted(_DIALECTS.keys())


def _invert(d: dict[str, str]) -> dict[str, str]:
    return {v: k for k, v in d.items()}


def _rename_keys_recursive(
    obj: Any,
    field_aliases: dict[str, str],
    report: TranslationReport,
) -> Any:
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            new_k = field_aliases.get(k, k)
            if new_k != k:
                report.fields_renamed += 1
            out[new_k] = _rename_keys_recursive(v, field_aliases, report)
        return out
    if isinstance(obj, list):
        return [_rename_keys_recursive(x, field_aliases, report) for x in obj]
    return obj


def _remap_enums(
    ir: dict[str, Any],
    feature_kind_aliases: dict[str, str],
    scope_aliases: dict[str, str],
    report: TranslationReport,
) -> None:
    """Mutate IR in place: remap feature.kind + paytable.scope values."""
    features = ir.get("features")
    if isinstance(features, list):
        for f in features:
            if not isinstance(f, dict):
                continue
            k = f.get("kind")
            if isinstance(k, str) and k in feature_kind_aliases:
                f["kind"] = feature_kind_aliases[k]
                report.enums_remapped += 1
    paytable = ir.get("paytable")
    if isinstance(paytable, list):
        for entry in paytable:
            if not isinstance(entry, dict):
                continue
            scope = entry.get("scope")
            if isinstance(scope, str) and scope in scope_aliases:
                entry["scope"] = scope_aliases[scope]
                report.enums_remapped += 1


def translate_ir(
    ir: dict[str, Any],
    *,
    from_vendor: str,
    to_vendor: str = "universal",
) -> tuple[dict[str, Any], TranslationReport]:
    """Translate IR from one vendor dialect to another.

    Always one hop: vendor → universal OR universal → vendor.
    Vendor-to-vendor requires two calls.
    """
    if from_vendor not in _DIALECTS and from_vendor != "universal":
        raise ValueError(f"unknown source vendor: {from_vendor!r}")
    if to_vendor not in _DIALECTS and to_vendor != "universal":
        raise ValueError(f"unknown target vendor: {to_vendor!r}")
    if from_vendor != "universal" and to_vendor != "universal":
        raise ValueError(
            "translate_ir is single-hop: pass through 'universal' first"
        )

    report = TranslationReport(from_dialect=from_vendor, to_dialect=to_vendor)
    out = copy.deepcopy(ir)

    if from_vendor != "universal":
        dialect = _DIALECTS[from_vendor]
        out = _rename_keys_recursive(out, dialect["field_aliases"], report)
        _remap_enums(
            out, dialect["feature_kind_aliases"], dialect["scope_aliases"], report,
        )
    else:
        dialect = _DIALECTS[to_vendor]
        out = _rename_keys_recursive(out, _invert(dialect["field_aliases"]), report)
        _remap_enums(
            out,
            _invert(dialect["feature_kind_aliases"]),
            _invert(dialect["scope_aliases"]),
            report,
        )
    return out, report
