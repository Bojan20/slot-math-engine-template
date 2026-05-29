"""W5.7 — Convert math_dsl ts-shape IR → slot-sim universal IR.

The `tools.math_dsl.compile.compile_to_ir` emits a "ts-shape" IR:

    {
        "topology":   {"kind":"rectangular", "reels": R, "rows": ROW},
        "evaluation": {"kind":"lines", "paylines": [[r,...]], "min_match": 3, ...},
        "symbols":    [{"id","name","kind","substitutes"?}, ...],
        "reels":      {"mode":"weighted", "base":[{sym: w_float, ...}, ...]},
        "paytable":   {sym: {"3": pay, "4": pay, "5": pay}, ...},
        "features":   [...] (ts-flavored),
        ...
    }

The slot-sim engine (`engine/slot-sim/src/ir.rs`) consumes a different
"universal" shape:

    {
        "meta":       {"name","vendor","swid","family","rtp_total",
                       "hit_frequency","win_frequency","notes","sampling_mode"},
        "topology":   {"kind":"rectangular","reels":R,"rows":ROW},
        "evaluation": {"kind":"lines","lines":[[r,...]],"min_count":3},
        "symbols":    [{"id","name","role","substitutes"?,"substitutes_except":[]}, ...],
        "reels":      {"base":[{"set":1,"reels":[[{symbol,weight:i64}, ...]],"label":...}],
                       "base_weights":{"weights":[{"set":1,"weight":1}],"total":1,
                                       "initial_set":1},
                       "fs":[...] (optional), "fs_weights":...},
        "paytable":   [{"combo":[sym]*k+["--"]*(R-k),"pays":...,"scope":"line"}, ...],
        "features":   [{"kind":"free_spins","trigger_symbol":...,...}, ...],
        "bet_table":  {"lines":N,"multipliers":[1],"total_bets":[N*1]}
    }

Same math, different field shape.  This converter is the bridge.

The converter is intentionally one-shot and does NOT touch the upstream
math_dsl / smt modules — those stay untouched per the W5.7 mission rules.
"""

from __future__ import annotations

import copy
import json
from typing import Any


# ─── helpers ────────────────────────────────────────────────────────────


# math_dsl symbol kinds → slot-sim SymbolRole values (snake_case so serde
# round-trips them via `rename_all = "snake_case"` on the Rust enum).
_KIND_TO_ROLE: dict[str, str] = {
    "lp": "lp",
    "hp": "hp",
    "wild": "wild",
    "scatter": "scatter",
    "bonus": "bonus",
    # Less-common kinds map to the closest engine role.
    "multiplier": "lp",
    "sticky": "lp",
    "expanding": "lp",
    "mystery": "lp",
    "transform": "lp",
    "chain_wild": "wild",
}


def _weight_to_i64(w_float: float, *, scale: int = 1000) -> int:
    """Convert a Z3-real weight (typically in [1, reel_length=50]) to the
    integer-weight contract the slot-sim ReelStop expects.

    Multiplying by `scale=1000` preserves three decimal digits of the
    solver's fractional resolution while keeping totals in the millions,
    far below the i64 ceiling. Rounding error per stop is ≤ 0.5 ‰ which
    is comfortably tighter than the 1 % MC RTP gate.
    """
    return max(1, int(round(float(w_float) * scale)))


def _ts_paylines_to_universal_lines(
    paylines: list[list[int]],
) -> list[list[int]]:
    """ts-IR `paylines` is `list[list[int]]` (row index per reel).  The
    universal IR `evaluation.lines` is `list[list[Option<u32>]]`; plain
    int values deserialize to `Some(int)`, which is what we want for
    every-cell-active fixed paylines (no skipped cells in this demo).
    """
    return [list(map(int, line)) for line in paylines]


def _ts_paytable_to_universal_combos(
    paytable: dict[str, dict[str, float]],
    n_reels: int,
) -> list[dict[str, Any]]:
    """ts-IR paytable is `{symbol: {"3": pay, "4": pay, "5": pay}}`.
    Universal paytable is a flat list of `{combo, pays, scope, marker}`
    entries.  Generate one entry per (sym, k) with the combo padded by
    `--` on the right to length `n_reels`.
    """
    out: list[dict[str, Any]] = []
    for sym, ladder in sorted(paytable.items()):
        for k_str, pay in sorted(ladder.items(), key=lambda kv: int(kv[0])):
            k = int(k_str)
            if k < 1 or k > n_reels or float(pay) <= 0:
                continue
            combo = [sym] * k + ["--"] * (n_reels - k)
            out.append({
                "combo": combo,
                "pays": float(pay),
                "scope": "line",
                "marker": "",
            })
    return out


def _ts_reels_to_universal_bank(
    ts_reels: dict,
    symbol_ids: list[str],
) -> dict[str, Any]:
    """ts-IR `{"mode":"weighted","base":[{sym:w,...},...]}` →
    universal `{"base":[{"set":1,"reels":[[{symbol,weight},...],...]}],
                "base_weights":{...}}`.

    `symbol_ids` is consulted to preserve a deterministic per-reel stop
    order (sorted-by-id), so the engine sees a stable reel layout from
    one demo run to the next.
    """
    if not isinstance(ts_reels, dict) or ts_reels.get("mode") != "weighted":
        raise ValueError(
            f"expected ts-IR `reels.mode == 'weighted'`, got {ts_reels!r}"
        )
    per_reel_weight_maps = ts_reels.get("base") or []
    reels: list[list[dict[str, Any]]] = []
    for reel_map in per_reel_weight_maps:
        stops: list[dict[str, Any]] = []
        for sid in symbol_ids:
            w_float = reel_map.get(sid)
            if w_float is None or float(w_float) <= 0:
                continue
            stops.append({
                "symbol": sid,
                "weight": _weight_to_i64(w_float),
            })
        if not stops:
            # Safety: never emit a zero-stop reel — the engine asserts ≥1.
            stops.append({"symbol": symbol_ids[0], "weight": 1})
        reels.append(stops)

    return {
        "base": [{"set": 1, "reels": reels, "label": "BG"}],
        "base_weights": {
            "weights": [{"set": 1, "weight": 1}],
            "total": 1,
            "initial_set": 1,
        },
    }


def _ts_features_to_universal(
    ts_features: list[dict],
    *,
    scatter_id: str | None,
    has_fs_bank: bool,
) -> list[dict[str, Any]]:
    """ts-IR features → universal slot-sim Feature variants.

    Only the demo's minimal feature set is mapped:
      * `free_spins` → engine `FreeSpins` (uses base reels as the FS
        bank when `has_fs_bank` is False; the demo doesn't define a
        distinct FS strip, so FS spins re-use the base reels — the
        engine `reel_bank` lookup falls through to `base` when `fs`
        is empty).

    Any unrecognised feature kind is dropped silently so the converter
    stays forward-compatible with future ts-IR feature additions
    without breaking the W5.7 demo path.
    """
    out: list[dict[str, Any]] = []
    for feat in ts_features:
        kind = feat.get("kind")
        if kind == "free_spins":
            trigger = feat.get("trigger") or {}
            min_count = int(trigger.get("min") or 3)
            thresholds = trigger.get("thresholds") or {}
            initial = int(thresholds.get(str(min_count)) or 5)
            retrigger_block = feat.get("retrigger") or {}
            retrigger_thr = retrigger_block.get("thresholds") or {}
            retrigger = int(retrigger_thr.get(str(min_count)) or 0)
            max_total = retrigger_block.get("max_total")
            out.append({
                "kind": "free_spins",
                "trigger_symbol": scatter_id or "scatter",
                "trigger_count_min": min_count,
                "initial_spins": initial,
                "retrigger_spins": int(retrigger or 0),
                "max_total_spins": int(max_total) if max_total else None,
                # When no FS bank is present we point the engine back at
                # `base` so FS spins reuse the base reels.  This matches
                # what `dsl_to_slot_sim_ir` does when the designer omits
                # an explicit FS strip.
                "reel_bank": "fs" if has_fs_bank else "base",
                "scatter_pay_total_bet": 0.0,
            })
        # Other feature kinds (cascade / linear_progressive / pick / ...)
        # are intentionally NOT translated here — the W5.7 demo keeps
        # the feature set minimal so the SMT solver converges quickly.
    return out


# ─── public entry ───────────────────────────────────────────────────────


def ts_ir_to_universal(
    ts_ir: dict[str, Any],
    *,
    swid: str,
    target_rtp: float,
    target_hit_freq: float,
    win_frequency_hint: float | None = None,
    notes_extra: list[str] | None = None,
) -> dict[str, Any]:
    """Convert a math_dsl ts-shape IR to the slot-sim universal shape.

    Arguments
    ---------
    ts_ir:
        The IR produced by `tools.math_dsl.compile.compile_to_ir` AND
        (typically) refined by `tools.smt.weight_synthesizer.synth_multi_objective`.
    swid:
        SWID to stamp into `meta.swid`.  For the W5.7 demo this is
        `200-9999-001`.
    target_rtp / target_hit_freq:
        Designer targets to record into the universal `meta` block.
        The engine uses these as the comparison baseline in MC stats
        output (`RTP: X (Excel Y)` line).
    win_frequency_hint:
        Optional published win-frequency.  When `None`, defaults to
        `target_hit_freq` so the engine has a non-zero baseline to
        compare against.
    notes_extra:
        Extra lines to append to `meta.notes` (provenance trail).
    """
    topo = ts_ir.get("topology") or {}
    if topo.get("kind") != "rectangular":
        raise ValueError(
            f"W5.7 demo only supports rectangular topology in the ts→universal "
            f"converter; got {topo.get('kind')!r}"
        )
    n_reels = int(topo.get("reels") or 5)
    n_rows = int(topo.get("rows") or 3)

    syms_ts = ts_ir.get("symbols") or []
    symbol_ids = [s["id"] for s in syms_ts]
    scatter_id: str | None = None
    universal_syms: list[dict[str, Any]] = []
    for s in syms_ts:
        kind = str(s.get("kind") or "lp")
        role = _KIND_TO_ROLE.get(kind, "lp")
        if role == "scatter" and scatter_id is None:
            scatter_id = str(s["id"])
        entry: dict[str, Any] = {
            "id": str(s["id"]),
            "name": str(s.get("name") or s["id"]),
            "role": role,
            "substitutes_except": [],
        }
        if s.get("substitutes") is not None:
            subs = s["substitutes"]
            if subs == "*":
                entry["substitutes"] = ["*"]
            elif isinstance(subs, list):
                entry["substitutes"] = list(subs)
        universal_syms.append(entry)

    eval_block = ts_ir.get("evaluation") or {}
    paylines_ts = eval_block.get("paylines") or []
    if not paylines_ts:
        raise ValueError("ts-IR has no `evaluation.paylines`")
    lines_universal = _ts_paylines_to_universal_lines(paylines_ts)
    min_count = int(eval_block.get("min_match") or 3)

    paytable_universal = _ts_paytable_to_universal_combos(
        ts_ir.get("paytable") or {}, n_reels,
    )
    if not paytable_universal:
        raise ValueError("ts-IR paytable empty after conversion")

    reels_universal = _ts_reels_to_universal_bank(
        ts_ir.get("reels") or {}, symbol_ids,
    )

    features_universal = _ts_features_to_universal(
        ts_ir.get("features") or [],
        scatter_id=scatter_id,
        has_fs_bank=False,
    )

    n_lines = len(lines_universal)
    bet_table = {
        "lines": n_lines,
        "multipliers": [1],
        "total_bets": [float(n_lines)],
    }

    meta_ts = ts_ir.get("meta") or {}
    name = str(meta_ts.get("name") or "Greenfield Demo")
    base_notes = [
        "Synthesized via W5.7 greenfield-demo pipeline:",
        "  math_dsl spec → math_dsl.compile → smt.weight_synthesizer "
        "(synth_multi_objective) → ts_to_universal.ts_ir_to_universal "
        "→ slot-sim MC → cert_bundle_swid packager.",
        "No PAR sheet exists for this game; the GDD is the single design input.",
    ]
    if notes_extra:
        base_notes.extend(str(n) for n in notes_extra)

    universal: dict[str, Any] = {
        "meta": {
            "name": name,
            "vendor": str(meta_ts.get("vendor") or "studio-internal"),
            "swid": swid,
            "family": "lines",
            "rtp_total": float(target_rtp),
            "rtp_breakdown": {"total": float(target_rtp)},
            "hit_frequency": float(target_hit_freq),
            "win_frequency": float(
                win_frequency_hint
                if win_frequency_hint is not None
                else target_hit_freq * 0.6
            ),
            "notes": base_notes,
            "sampling_mode": "physical_strip",
        },
        "topology": {"kind": "rectangular", "reels": n_reels, "rows": n_rows},
        "evaluation": {
            "kind": "lines",
            "lines": lines_universal,
            "min_count": min_count,
        },
        "symbols": universal_syms,
        "reels": reels_universal,
        "paytable": paytable_universal,
        "features": features_universal,
        "bet_table": bet_table,
    }
    return universal


def serialize_universal(ir: dict[str, Any]) -> bytes:
    """Canonical-JSON serialization for the universal IR.

    Sorted keys + 2-space indent + trailing newline so the same IR
    produces the same bytes across runs (matches `cert_bundle_swid`
    canon).
    """
    blob = json.dumps(ir, sort_keys=True, indent=2, ensure_ascii=False)
    return (blob + "\n").encode("utf-8")
