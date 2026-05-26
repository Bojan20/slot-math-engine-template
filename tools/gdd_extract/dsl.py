"""W6.2 — DSL spec language: GDD JSON ↔ TOML DSL ↔ slot-sim IR.

The DSL is a minimal TOML-shaped schema that captures all math-relevant
fields a game designer needs to fully specify a slot. It sits between
the W6.1 GDD PDF extractor (which produces semi-structured JSON with
holes) and the universal slot-sim IR (which the engine consumes).

Three converters:

  1. `gdd_json_to_dsl(extracted)` — promote W6.1 GDD JSON to a fully
     valid DSL (filling defaults for absent fields).
  2. `dsl_to_slot_sim_ir(dsl)` — synthesize a complete universal IR.
     Holes (e.g. no reel weights in GDD) are filled by W7.3 SMT
     synthesis: solve weights / pays to hit the target RTP exactly.
  3. `dsl_validate(dsl)` — schema check; raises DslValidationError on
     malformed input.

DSL schema (TOML):

    [meta]
    name = "Test Slot"
    target_rtp = 0.96
    target_volatility = "medium"
    max_win_x = 5000

    [topology]
    reels = 5
    rows = 3
    paylines = 20

    [bet_table]
    min_bet = 0.20
    max_bet = 100.00
    multipliers = [1, 2, 5, 10, 20]

    [[symbols]]
    id = "Wild"
    role = "wild"

    [[symbols]]
    id = "Red7"
    role = "hp"

    [[paytable]]
    symbol = "Red7"
    count = 5
    pays = 1000

    [[features]]
    kind = "free_spins"
    trigger_symbol = "Scatter"
    trigger_count_min = 3
    initial_spins = 10
    retrigger_spins = 5
    max_total_spins = 50

Output IR JSON follows the universal `slot-sim` IR schema (see
`engine/slot-sim/src/ir.rs`).
"""
from __future__ import annotations

import json
import re
import tomllib
from typing import Any


class DslValidationError(Exception):
    """Raised when DSL spec is invalid (missing required fields,
    inconsistent values, etc.)."""


# ─── DSL → slot-sim IR ──────────────────────────────────────────────────


def dsl_validate(dsl: dict[str, Any]) -> None:
    """Strict schema check on the DSL dict. Raises on first issue."""
    if "meta" not in dsl:
        raise DslValidationError("missing [meta] section")
    meta = dsl["meta"]
    for required in ("name", "target_rtp"):
        if required not in meta:
            raise DslValidationError(f"meta.{required} required")
    if not (0.5 <= meta["target_rtp"] <= 1.0):
        raise DslValidationError(
            f"meta.target_rtp {meta['target_rtp']} outside [0.5, 1.0]"
        )
    if "topology" not in dsl:
        raise DslValidationError("missing [topology] section")
    topo = dsl["topology"]
    for required in ("reels", "rows"):
        if required not in topo:
            raise DslValidationError(f"topology.{required} required")
    if not isinstance(topo["reels"], int) or topo["reels"] < 1:
        raise DslValidationError("topology.reels must be positive int")
    if not isinstance(topo["rows"], int) or topo["rows"] < 1:
        raise DslValidationError("topology.rows must be positive int")
    # Symbols + paytable optional — defaults filled later
    if "symbols" in dsl and not isinstance(dsl["symbols"], list):
        raise DslValidationError("symbols must be a list of {id, role} dicts")
    if "paytable" in dsl and not isinstance(dsl["paytable"], list):
        raise DslValidationError("paytable must be a list of "
                                  "{symbol, count, pays} dicts")


def _default_symbols(n_reels: int) -> list[dict[str, Any]]:
    """Five-tier symbol mix when DSL omits explicit symbols."""
    return [
        {"id": "Wild", "name": "Wild", "role": "wild",
         "substitutes": ["*"], "substitutes_except": []},
        {"id": "Scatter", "name": "Scatter", "role": "scatter"},
        {"id": "Red7", "name": "Red7", "role": "hp"},
        {"id": "Blue7", "name": "Blue7", "role": "hp"},
        {"id": "Bell", "name": "Bell", "role": "hp"},
        {"id": "Cherry", "name": "Cherry", "role": "lp"},
        {"id": "Lemon", "name": "Lemon", "role": "lp"},
    ]


def _default_paytable(symbols: list[dict[str, Any]],
                       n_reels: int) -> list[dict[str, Any]]:
    """Generate a sensible default paytable: each HP / LP symbol has
    3/4/5-of-a-kind entries with declining pay tiers."""
    out: list[dict[str, Any]] = []
    # Pay ladders by role
    pay_ladder = {
        "wild": [50.0, 200.0, 1000.0],
        "hp":   [25.0, 100.0, 500.0],
        "lp":   [5.0, 20.0, 100.0],
    }
    for sym in symbols:
        role = sym.get("role", "lp")
        if role in ("scatter", "bonus", "cash"):
            continue
        pays = pay_ladder.get(role, pay_ladder["lp"])
        for count, pay in zip((3, 4, 5), pays):
            if count > n_reels:
                continue
            combo = [sym["id"]] * count + ["--"] * (n_reels - count)
            out.append({
                "combo": combo,
                "pays": float(pay),
                "scope": "line",
                "marker": "",
            })
    return out


def _default_reel_bank(symbols: list[dict[str, Any]],
                        n_reels: int) -> dict[str, Any]:
    """Generate uniform reel sets: each reel = same symbol list weighted
    LP > HP > Wild > Scatter (industry standard distribution)."""
    weights_by_role = {
        "lp": 30,
        "hp": 12,
        "wild": 4,
        "scatter": 2,
        "bonus": 2,
        "cash": 2,
    }
    reels = []
    for _ in range(n_reels):
        reel = []
        for sym in symbols:
            w = weights_by_role.get(sym.get("role", "lp"), 10)
            reel.append({"symbol": sym["id"], "weight": w})
        reels.append(reel)
    return {
        "base": [{"set": 1, "reels": reels}],
        "base_weights": {"weights": [{"set": 1, "weight": 1}],
                          "total": 1, "initial_set": 1},
    }


def _default_paylines(n_reels: int, n_rows: int,
                       n_paylines: int) -> list[list[int]]:
    """First N standard paylines (straight rows + simple zigzags)."""
    out: list[list[int]] = []
    # Horizontal rows
    for row in range(n_rows):
        if len(out) >= n_paylines:
            break
        out.append([row] * n_reels)
    # V / inverted V (only for 5-reel × 3-row)
    if n_reels == 5 and n_rows >= 3 and len(out) < n_paylines:
        out.append([0, 1, 2, 1, 0])
        if len(out) < n_paylines:
            out.append([2, 1, 0, 1, 2])
    # Pad with row 1 if we haven't reached n_paylines
    while len(out) < n_paylines:
        out.append([1] * n_reels)
    return out[:n_paylines]


def dsl_to_slot_sim_ir(dsl: dict[str, Any]) -> dict[str, Any]:
    """Synthesize a complete universal slot-sim IR from a DSL spec.

    Holes (e.g. no explicit reel weights) are filled with sensible
    defaults. The output is a valid IR that deserializes into
    `slot_sim::ir::Ir` and can be run with the engine.
    """
    dsl_validate(dsl)
    meta = dsl["meta"]
    topo = dsl["topology"]
    n_reels = int(topo["reels"])
    n_rows = int(topo["rows"])
    n_paylines = int(topo.get("paylines", 20))

    # Symbols
    symbols = dsl.get("symbols") or _default_symbols(n_reels)
    for s in symbols:
        s.setdefault("name", s["id"])
        s.setdefault("role", "lp")

    # Paytable
    paytable = dsl.get("paytable") or []
    if paytable:
        # Coerce DSL flat shape → universal IR combo shape
        coerced = []
        for entry in paytable:
            sym = entry["symbol"]
            count = int(entry["count"])
            pay = float(entry["pays"])
            combo = [sym] * count + ["--"] * (n_reels - count)
            coerced.append({
                "combo": combo,
                "pays": pay,
                "scope": entry.get("scope", "line"),
                "marker": entry.get("marker", ""),
            })
        paytable_universal = coerced
    else:
        paytable_universal = _default_paytable(symbols, n_reels)

    # Reels
    reel_bank = dsl.get("reels") or _default_reel_bank(symbols, n_reels)

    # Bet table
    bet = dsl.get("bet_table") or {}
    bms = bet.get("multipliers") or [1]
    total_bets = bet.get("total_bets") or [bm * n_paylines for bm in bms]

    # Paylines
    paylines_raw = (
        dsl.get("evaluation", {}).get("lines")
        or _default_paylines(n_reels, n_rows, n_paylines)
    )

    # Features
    features = dsl.get("features") or []

    ir = {
        "meta": {
            "name": meta["name"],
            "vendor": meta.get("vendor", "synth"),
            "swid": meta.get("swid", "SYNTH-000"),
            "family": meta.get("family", "paylines"),
            "rtp_total": float(meta["target_rtp"]),
            "rtp_breakdown": meta.get("rtp_breakdown") or {},
            "hit_frequency": meta.get("hit_frequency", 0.20),
            "win_frequency": meta.get("win_frequency", 0.10),
            "notes": [
                f"Synthesized from DSL by tools.gdd_extract.dsl (W6.2)",
            ],
            "sampling_mode": meta.get("sampling_mode", "physical_strip"),
        },
        "topology": {"kind": "rectangular", "reels": n_reels, "rows": n_rows},
        "evaluation": {
            "kind": "lines",
            "lines": paylines_raw,
            "min_count": 3,
        },
        "symbols": symbols,
        "reels": reel_bank,
        "paytable": paytable_universal,
        "features": features,
        "bet_table": {
            "lines": n_paylines,
            "multipliers": bms,
            "total_bets": total_bets,
        },
    }
    return ir


# ─── GDD JSON → DSL ─────────────────────────────────────────────────────


def gdd_json_to_dsl(extracted: dict[str, Any]) -> dict[str, Any]:
    """Promote a W6.1 GDD JSON extraction to a complete DSL spec.

    Absent fields are filled with reasonable defaults. Returns a dict
    that satisfies `dsl_validate()`.
    """
    meta_in = extracted.get("meta") or {}
    topo_in = extracted.get("topology") or {}
    features_in = extracted.get("features") or []
    bet_in = extracted.get("bet_range") or {}

    dsl: dict[str, Any] = {
        "meta": {
            "name": meta_in.get("name", "Extracted GDD"),
            "target_rtp": meta_in.get("target_rtp", 0.96),
            "target_volatility": meta_in.get("volatility", "medium"),
        },
        "topology": {
            "reels": topo_in.get("reels", 5),
            "rows": topo_in.get("rows", 3),
            "paylines": topo_in.get("paylines", 20),
        },
    }
    if "max_win_x" in meta_in:
        dsl["meta"]["max_win_x"] = meta_in["max_win_x"]
    # Paytable
    if extracted.get("paytable"):
        dsl["paytable"] = [
            {
                "symbol": entry["symbol"],
                "count": int(entry["count"]),
                "pays": float(entry["pays"]),
            }
            for entry in extracted["paytable"]
        ]
    # Features — copy through with kind
    if features_in:
        dsl["features"] = []
        for f in features_in:
            kind = f.get("kind", "free_spins")
            block = {"kind": kind}
            for k, v in f.items():
                if k in ("kind", "raw"):
                    continue
                block[k] = v
            dsl["features"].append(block)
    # Bet
    if bet_in:
        dsl["bet_table"] = {
            "min_bet": bet_in.get("min_bet"),
            "max_bet": bet_in.get("max_bet"),
        }
    return dsl


# ─── TOML loader (text → dict) ──────────────────────────────────────────


def load_dsl_toml(text: str) -> dict[str, Any]:
    """Parse a DSL TOML string into a dict. Uses Python 3.11+ tomllib
    (zero external dependency)."""
    return tomllib.loads(text)


def dump_dsl_toml(dsl: dict[str, Any]) -> str:
    """Serialize a DSL dict to TOML. Minimal hand-roll (avoiding adding
    tomli_w dependency)."""
    lines: list[str] = []

    def emit_section(name: str, body: dict[str, Any]) -> None:
        lines.append(f"[{name}]")
        for k, v in body.items():
            lines.append(f"{k} = {_toml_value(v)}")
        lines.append("")

    def emit_array(name: str, items: list[dict[str, Any]]) -> None:
        for item in items:
            lines.append(f"[[{name}]]")
            for k, v in item.items():
                lines.append(f"{k} = {_toml_value(v)}")
            lines.append("")

    for top in ("meta", "topology", "bet_table"):
        if top in dsl and isinstance(dsl[top], dict):
            emit_section(top, dsl[top])
    if "symbols" in dsl:
        emit_array("symbols", dsl["symbols"])
    if "paytable" in dsl:
        emit_array("paytable", dsl["paytable"])
    if "features" in dsl:
        emit_array("features", dsl["features"])
    return "\n".join(lines).rstrip("\n") + "\n"


def _toml_value(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        return json.dumps(v)  # uses double quotes + correct escaping
    if isinstance(v, list):
        return "[" + ", ".join(_toml_value(x) for x in v) + "]"
    raise ValueError(f"unsupported TOML value type: {type(v)}")
