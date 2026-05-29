"""W6.2 — JSON schema the LLM must populate via tool-use.

We expose the schema as both:

* ``GDD_TOOL_SCHEMA`` — the Anthropic tool-use ``input_schema`` block
  shipped to the model so it returns *structured* JSON, never raw YAML.
* ``validate_payload`` — a pure-Python validator that mirrors the
  schema and runs *post*-LLM (so we double-check even when the SDK is
  mocked).  It uses no external dependencies (no ``jsonschema``).

The schema is intentionally a *narrow projection* of the
``tools.math_dsl.spec`` grammar — the LLM only emits fields the W5.7
pipeline + ``parse_spec`` actually consume.  Anything else is the
compiler's job (defaults, paytables, reel distributions).

Schema is versioned via ``SCHEMA_VERSION`` (re-exported from
``prompt.py``) so cache keys invalidate cleanly across upgrades.
"""

from __future__ import annotations

from typing import Any


# Public schema — frozen so cache keys remain stable.
GDD_TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "description": "Game name; 3-80 chars, used as meta.name.",
        },
        "theme_tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "1-5 thematic tags (e.g. ['wolf','mythic']).",
        },
        "archetype": {
            "type": "string",
            "enum": ["lines", "ways", "megaways", "hold_and_win", "cascade"],
            "description": (
                "Mechanic family.  Note: W5.7 pipeline only auto-runs "
                "for 'lines'.  Other archetypes still produce a valid "
                "parse_spec GDD that downstream archetype-aware "
                "tooling can consume."
            ),
        },
        "reels": {"type": "integer", "minimum": 3, "maximum": 7},
        "rows": {"type": "integer", "minimum": 2, "maximum": 7},
        "paylines": {"type": "integer", "minimum": 1, "maximum": 50},
        "target_rtp": {"type": "number", "minimum": 0.80, "maximum": 0.99},
        "volatility_class": {
            "type": "string",
            "enum": ["low", "medium", "high", "ultra"],
        },
        "hit_freq_target": {
            "type": "number",
            "minimum": 0.05,
            "maximum": 0.60,
        },
        "max_win_x": {"type": "number", "minimum": 100, "maximum": 100000},
        "features": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": [
                            "free_spins", "hold_and_win", "cascade",
                            "respin", "pick", "wheel", "buy_feature",
                            "ante_bet", "gamble", "mystery_symbol",
                            "symbol_upgrade", "linear_progressive",
                        ],
                    },
                    "trigger_count_min": {"type": "integer"},
                    "initial_spins": {"type": "integer"},
                    "global_multiplier": {"type": "number"},
                    "trigger_prob": {"type": "number"},
                    "avg_pay_per_trigger": {"type": "number"},
                },
                "required": ["kind"],
                "additionalProperties": True,
            },
            "minItems": 1,
            "maxItems": 5,
        },
        "symbols_hint": {
            "type": "object",
            "properties": {
                "n_hp": {"type": "integer", "minimum": 1, "maximum": 6},
                "n_lp": {"type": "integer", "minimum": 1, "maximum": 6},
                "theme_hp_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["n_hp", "n_lp"],
        },
    },
    "required": [
        "name", "archetype", "reels", "rows", "target_rtp",
        "volatility_class", "features", "symbols_hint",
    ],
    "additionalProperties": False,
}


_VALID_VOLATILITY = ("low", "medium", "high", "ultra")
_VALID_ARCHETYPES = ("lines", "ways", "megaways", "hold_and_win", "cascade")
_VALID_FEATURE_KINDS = {
    "free_spins", "hold_and_win", "cascade", "respin", "pick", "wheel",
    "buy_feature", "ante_bet", "gamble", "mystery_symbol",
    "symbol_upgrade", "linear_progressive",
}


def validate_payload(payload: dict[str, Any]) -> list[str]:
    """Return a list of human-readable validation errors (empty == OK).

    Pure-Python (no jsonschema dep) so it runs in CI's slim image and is
    deterministic.  Matches GDD_TOOL_SCHEMA semantics 1:1.
    """
    errors: list[str] = []
    if not isinstance(payload, dict):
        return [f"payload must be a JSON object, got {type(payload).__name__}"]

    # Required keys
    for key in (
        "name", "archetype", "reels", "rows", "target_rtp",
        "volatility_class", "features", "symbols_hint",
    ):
        if key not in payload:
            errors.append(f"missing required key: {key!r}")

    if "name" in payload:
        n = payload["name"]
        if not isinstance(n, str) or not (3 <= len(n) <= 80):
            errors.append("`name` must be a string 3-80 chars")

    if "archetype" in payload:
        if payload["archetype"] not in _VALID_ARCHETYPES:
            errors.append(
                f"`archetype` must be one of {list(_VALID_ARCHETYPES)}; "
                f"got {payload['archetype']!r}"
            )

    if "reels" in payload:
        if not isinstance(payload["reels"], int) or not (
            3 <= payload["reels"] <= 7
        ):
            errors.append("`reels` must be an int in [3, 7]")

    if "rows" in payload:
        if not isinstance(payload["rows"], int) or not (
            2 <= payload["rows"] <= 7
        ):
            errors.append("`rows` must be an int in [2, 7]")

    if "paylines" in payload:
        if not isinstance(payload["paylines"], int) or not (
            1 <= payload["paylines"] <= 50
        ):
            errors.append("`paylines` must be an int in [1, 50] when present")

    if "target_rtp" in payload:
        rtp = payload["target_rtp"]
        if not isinstance(rtp, (int, float)) or not (0.80 <= rtp <= 0.99):
            errors.append("`target_rtp` must be a float in [0.80, 0.99]")

    if "volatility_class" in payload:
        if payload["volatility_class"] not in _VALID_VOLATILITY:
            errors.append(
                f"`volatility_class` must be one of "
                f"{list(_VALID_VOLATILITY)}"
            )

    if "hit_freq_target" in payload:
        hf = payload["hit_freq_target"]
        if not isinstance(hf, (int, float)) or not (0.05 <= hf <= 0.60):
            errors.append("`hit_freq_target` must be a float in [0.05, 0.60]")

    if "max_win_x" in payload:
        mw = payload["max_win_x"]
        if not isinstance(mw, (int, float)) or not (100 <= mw <= 100_000):
            errors.append("`max_win_x` must be a number in [100, 100000]")

    if "features" in payload:
        feats = payload["features"]
        if not isinstance(feats, list) or not (1 <= len(feats) <= 5):
            errors.append("`features` must be a list of 1-5 items")
        else:
            for i, f in enumerate(feats):
                if not isinstance(f, dict):
                    errors.append(f"features[{i}] must be an object")
                    continue
                if "kind" not in f:
                    errors.append(f"features[{i}] missing `kind`")
                elif f["kind"] not in _VALID_FEATURE_KINDS:
                    errors.append(
                        f"features[{i}].kind={f['kind']!r} not in "
                        f"valid feature kinds"
                    )

    if "symbols_hint" in payload:
        sh = payload["symbols_hint"]
        if not isinstance(sh, dict):
            errors.append("`symbols_hint` must be an object")
        else:
            for k in ("n_hp", "n_lp"):
                if k not in sh:
                    errors.append(f"`symbols_hint.{k}` is required")
                    continue
                v = sh[k]
                if not isinstance(v, int) or not (1 <= v <= 6):
                    errors.append(f"`symbols_hint.{k}` must be int in [1, 6]")

    # additionalProperties=False — reject unknown keys at top level.
    allowed = set(GDD_TOOL_SCHEMA["properties"].keys())
    for k in payload:
        if k not in allowed:
            errors.append(f"unknown top-level key {k!r}")

    return errors
