"""W6.2 — Validated LLM JSON → canonical GDD YAML emitter.

The compiler is a *pure function* of the validated JSON payload — no
network, no clock, no environment lookups.  Same input always
produces the same output (byte-identical) so cache hits + re-runs
remain reproducible.

Output shape mirrors ``tools/greenfield_demo/wolf_eruption_mythic.gdd``
(W5.7 lines pipeline) when ``archetype == "lines"``; other archetypes
emit math_dsl-parse_spec-conformant shapes with:

* topology.kind == "variable_rows" + ``row_range_per_reel`` for
  megaways
* a hold_and_win or cascade feature in the ``features`` list for
  those archetypes
* ``paylines`` only for lines / hold_and_win

The emitted YAML always parses cleanly via
:func:`tools.math_dsl.spec.parse_spec`.
"""

from __future__ import annotations

import json
from typing import Any

from tools.gdd_llm_ingest.schema import validate_payload


class GddCompileError(ValueError):
    """Raised when an LLM payload is malformed or cannot be compiled."""


# ─── Defaults seeded from the proven greenfield_demo GDDs ───────────────


# Per-archetype default symbol id lists (HP first, then LP).  These
# IDs are deliberately generic — the LLM can override via
# ``symbols_hint.theme_hp_ids``.
_DEFAULT_HP_IDS = [
    "hp_alpha", "hp_beta", "hp_gamma", "hp_delta", "hp_epsilon", "hp_zeta",
]
_DEFAULT_LP_IDS = ["lp_a", "lp_k", "lp_q", "lp_j", "lp_t", "lp_n"]


# Per-archetype tunings chosen so the resulting GDD lands close to a
# realistic feasible region.  Numbers cribbed straight from the
# canonical wolf_eruption_mythic / golden_holdwin demos.
_ARCHETYPE_DEFAULTS: dict[str, dict[str, Any]] = {
    "lines": {
        "hit_freq_default": 0.21,
        "pay_min": 0.2,
        "pay_max": 1000.0,
        "reel_length": 50,
        "wild_share": 0.04,
        "scatter_share": 0.02,
        "initial_spins": 5,
        "global_multiplier": 1.0,
        "max_win_x": 5000,
        "rtp_tolerance": 0.005,
    },
    "ways": {
        "hit_freq_default": 0.40,
        "pay_min": 0.05,
        "pay_max": 5.0,
        "reel_length": 30,
        "wild_share": 0.03,
        "scatter_share": 0.025,
        "initial_spins": 8,
        "global_multiplier": 1.0,
        "max_win_x": 10000,
        "rtp_tolerance": 0.01,
    },
    "megaways": {
        "hit_freq_default": 0.30,
        "pay_min": 0.01,
        "pay_max": 1.0,
        "reel_length": 50,
        "wild_share": 0.03,
        "scatter_share": 0.025,
        "initial_spins": 10,
        "global_multiplier": 1.0,
        "max_win_x": 25000,
        "rtp_tolerance": 0.01,
    },
    "hold_and_win": {
        "hit_freq_default": 0.25,
        "pay_min": 0.2,
        "pay_max": 1000.0,
        "reel_length": 50,
        "wild_share": 0.04,
        "scatter_share": 0.02,
        "initial_spins": 5,
        "global_multiplier": 1.0,
        "max_win_x": 5000,
        "rtp_tolerance": 0.005,
    },
    "cascade": {
        "hit_freq_default": 0.45,
        "pay_min": 0.03,
        "pay_max": 2.0,
        "reel_length": 30,
        "wild_share": 0.02,
        "scatter_share": 0.025,
        "initial_spins": 10,
        "global_multiplier": 1.0,
        "max_win_x": 10000,
        "rtp_tolerance": 0.01,
    },
}


# ─── Public entry ───────────────────────────────────────────────────────


def validate_llm_payload(payload: dict[str, Any]) -> None:
    """Raise :class:`GddCompileError` if ``payload`` is not schema-valid."""
    errors = validate_payload(payload)
    if errors:
        raise GddCompileError(
            "LLM payload schema validation failed:\n  - "
            + "\n  - ".join(errors)
        )


def _slug(name: str) -> str:
    return (
        "".join(c if c.isalnum() else "-" for c in name.lower())
        .strip("-")
        .replace("--", "-")
    ) or "llm-demo"


def _swid(payload: dict[str, Any]) -> str:
    """Deterministic synthetic SWID derived from name + archetype.

    9999-XXX block reserved for synthetic / demo games (matches W5.7
    convention).  We avoid Python's hash randomisation by using a
    stable sum-of-ord modulo 1000.
    """
    seed_text = f"{payload['name']}|{payload['archetype']}"
    digest = sum(ord(c) for c in seed_text) % 1000
    return f"200-9999-{digest:03d}"


def _format_scalar(v: Any) -> str:
    """Canonical YAML scalar formatting for determinism.

    * floats: ``{:.6f}`` (no trailing-zero stripping so byte-identical
      across runs).  Integer-equal floats round to int.
    * strings: bare when safe, quoted otherwise.
    * booleans / None: lowercase tokens.
    """
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        # Preserve integers as ints in YAML
        if v.is_integer() and abs(v) < 1e9:
            return str(int(v))
        return f"{v:.6f}"
    s = str(v)
    needs_quote = (
        not s
        or any(c in s for c in (": #,[]{}\n\""))
        or s.lower() in ("null", "true", "false", "yes", "no", "on", "off", "~")
        or s.strip() != s
    )
    if needs_quote:
        esc = s.replace('"', '\\"')
        return f'"{esc}"'
    return s


def _build_symbols(payload: dict[str, Any]) -> list[dict[str, Any]]:
    sh = payload["symbols_hint"]
    n_hp = int(sh["n_hp"])
    n_lp = int(sh["n_lp"])
    theme_hp = list(sh.get("theme_hp_ids") or [])
    hp_ids: list[str] = []
    for i in range(n_hp):
        if i < len(theme_hp):
            tid = str(theme_hp[i]).strip().lower()
            if not tid.startswith("hp_"):
                tid = f"hp_{tid}"
            hp_ids.append(tid)
        else:
            hp_ids.append(_DEFAULT_HP_IDS[i % len(_DEFAULT_HP_IDS)])
    lp_ids = [_DEFAULT_LP_IDS[i] for i in range(n_lp)]

    symbols: list[dict[str, Any]] = [
        {"id": "wild", "kind": "wild", "substitutes": "*"},
        {"id": "scatter", "kind": "scatter"},
    ]
    for hid in hp_ids:
        symbols.append({"id": hid, "kind": "hp"})
    for lid in lp_ids:
        symbols.append({"id": lid, "kind": "lp"})
    return symbols


def _build_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    arch = payload["archetype"]
    defaults = _ARCHETYPE_DEFAULTS[arch]
    feats_in = list(payload.get("features") or [])
    if not feats_in:
        feats_in = [{"kind": "free_spins"}]

    out: list[dict[str, Any]] = []
    seen_kinds: set[str] = set()
    for f in feats_in:
        kind = str(f["kind"])
        if kind in seen_kinds:
            continue
        seen_kinds.add(kind)
        if kind == "free_spins":
            out.append({
                "kind": "free_spins",
                "trigger_count_min": int(f.get("trigger_count_min") or 3),
                "initial_spins": int(f.get("initial_spins")
                                      or defaults["initial_spins"]),
                "global_multiplier": float(f.get("global_multiplier")
                                            or defaults["global_multiplier"]),
            })
        elif kind == "hold_and_win":
            out.append({
                "kind": "hold_and_win",
                "trigger_count_min": int(f.get("trigger_count_min") or 6),
                "respins_initial": int(f.get("respins_initial") or 3),
            })
        elif kind == "cascade":
            out.append({
                "kind": "cascade",
                "replacement": str(f.get("replacement") or "drop"),
                "max_chain": int(f.get("max_chain") or 20),
            })
        elif kind == "linear_progressive":
            out.append({
                "kind": "linear_progressive",
                "pool_id": str(f.get("pool_id") or "wap-default"),
                "contribution_x": float(f.get("contribution_x") or 0.005),
                "seed_x": float(f.get("seed_x") or 100.0),
            })
        else:
            # Generic feature pass-through (kind only — schema already
            # filtered to known kinds).
            out.append({"kind": kind})

    # Auto-inject the archetype-defining feature when the LLM forgot.
    if payload["archetype"] == "hold_and_win" and "hold_and_win" not in seen_kinds:
        out.append({
            "kind": "hold_and_win",
            "trigger_count_min": 6,
            "respins_initial": 3,
        })
    if payload["archetype"] == "cascade" and "cascade" not in seen_kinds:
        out.append({
            "kind": "cascade",
            "replacement": "drop",
            "max_chain": 20,
        })
    return out


def _build_topology(payload: dict[str, Any]) -> dict[str, Any]:
    arch = payload["archetype"]
    reels = int(payload["reels"])
    rows = int(payload["rows"])
    if arch == "megaways":
        # Canonical 2..6 row range per reel.
        return {
            "kind": "variable_rows",
            "reels": reels,
            "row_range_per_reel": [[2, 6] for _ in range(reels)],
            "ways_cap": 117649,
        }
    return {"kind": "rectangular", "reels": reels, "rows": rows}


def _build_constraints(payload: dict[str, Any]) -> dict[str, Any]:
    arch = payload["archetype"]
    defaults = _ARCHETYPE_DEFAULTS[arch]
    hit_freq = float(payload.get("hit_freq_target")
                     or defaults["hit_freq_default"])
    max_win = float(payload.get("max_win_x") or defaults["max_win_x"])
    return {
        "target_rtp": float(payload["target_rtp"]),
        "rtp_tolerance": defaults["rtp_tolerance"],
        "volatility_class": str(payload["volatility_class"]),
        "hit_freq_target": hit_freq,
        "max_win_x": max_win,
        "jurisdictions": ["UKGC", "MGA", "ADM"],
        "pay_ladder_monotonic": True,
        "pay_min": defaults["pay_min"],
        "pay_max": defaults["pay_max"],
    }


def _build_hints(payload: dict[str, Any]) -> dict[str, Any]:
    arch = payload["archetype"]
    defaults = _ARCHETYPE_DEFAULTS[arch]
    return {
        "reel_length": defaults["reel_length"],
        "wild_share": defaults["wild_share"],
        "scatter_share": defaults["scatter_share"],
    }


def compile_to_gdd_yaml(payload: dict[str, Any]) -> str:
    """Compile a validated LLM payload into a canonical GDD YAML string.

    Strict determinism: keys emitted in a fixed order; floats formatted
    via :func:`_format_scalar`; no timestamps; no environment lookups.
    """
    validate_llm_payload(payload)
    arch = payload["archetype"]
    swid = _swid(payload)
    symbols = _build_symbols(payload)
    features = _build_features(payload)
    topology = _build_topology(payload)
    constraints = _build_constraints(payload)
    hints = _build_hints(payload)
    theme_tags = list(payload.get("theme_tags") or [])

    paylines: int | None
    if arch in ("lines", "hold_and_win"):
        paylines = int(payload.get("paylines") or 20)
    else:
        paylines = None

    lines: list[str] = []
    lines.append("# GDD generated by W6.2 LLM ingest.")
    lines.append("# Deterministic: same prompt + same schema_version =>")
    lines.append("# bit-identical YAML.  Do not hand-edit.")
    lines.append(f"# archetype: {arch}")
    lines.append(f"# swid: {swid}")
    lines.append("")
    lines.append('schema_version: "1.0.0"')
    lines.append("")
    lines.append("meta:")
    lines.append(f"  name: {_format_scalar(payload['name'])}")
    lines.append('  vendor: "studio-internal"')
    lines.append(f"  swid: {_format_scalar(swid)}")
    lines.append('  author: "gdd-llm-ingest@studio"')
    lines.append(
        '  description: "Generated by W6.2 LLM ingest from NL prompt; '
        f'archetype={arch}."'
    )
    if theme_tags:
        tag_str = ", ".join(_format_scalar(t) for t in theme_tags)
        lines.append(f"  theme_tags: [{tag_str}]")
    lines.append("")
    # Topology
    lines.append("topology:")
    for k in ("kind", "reels", "rows", "row_range_per_reel", "ways_cap"):
        if k not in topology:
            continue
        v = topology[k]
        if isinstance(v, list):
            if v and isinstance(v[0], list):
                lines.append(f"  {k}:")
                for it in v:
                    inner = ", ".join(str(x) for x in it)
                    lines.append(f"    - [{inner}]")
            else:
                inner = ", ".join(_format_scalar(x) for x in v)
                lines.append(f"  {k}: [{inner}]")
        else:
            lines.append(f"  {k}: {_format_scalar(v)}")
    lines.append("")
    # Symbols
    lines.append("symbols:")
    for s in symbols:
        lines.append(f"  - id: {_format_scalar(s['id'])}")
        lines.append(f"    kind: {_format_scalar(s['kind'])}")
        if "substitutes" in s:
            lines.append(f"    substitutes: {_format_scalar(s['substitutes'])}")
    lines.append("")
    # Features
    lines.append("features:")
    for f in features:
        keys = list(f.items())
        lines.append(f"  - kind: {_format_scalar(f['kind'])}")
        for k, v in keys:
            if k == "kind":
                continue
            lines.append(f"    {k}: {_format_scalar(v)}")
    lines.append("")
    # Paylines (lines / hold_and_win only)
    if paylines is not None:
        lines.append(f"paylines: {paylines}")
        lines.append("")
    # Constraints
    lines.append("constraints:")
    for k, v in constraints.items():
        if isinstance(v, list):
            inner = ", ".join(_format_scalar(x) for x in v)
            lines.append(f"  {k}: [{inner}]")
        else:
            lines.append(f"  {k}: {_format_scalar(v)}")
    lines.append("")
    # Hints
    lines.append("hints:")
    for k, v in hints.items():
        lines.append(f"  {k}: {_format_scalar(v)}")
    return "\n".join(lines) + "\n"


def canonical_payload_json(payload: dict[str, Any]) -> str:
    """Sorted-key, indent=2 JSON dump used for cache write + hashing."""
    return json.dumps(payload, indent=2, sort_keys=True)
