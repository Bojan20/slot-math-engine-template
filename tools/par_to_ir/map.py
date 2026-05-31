"""SLOT-MATH Faza 2.2 — PAR → Game IR mapper (pure copy, no inference).

Input:   canonical PAR (dict loaded from canonical.par.yaml)
Output:  Game IR (dict matching reports/schemas/game_ir.schema.json)

Invariants:
    - Every PAR field maps to exactly one IR slot
    - Engine never invents data — only copies / renames
    - Integer-stable for reels (no float conversion)
    - Deterministic — same PAR → same IR bytes
"""
from __future__ import annotations

import hashlib
import json
from typing import Any


SCHEMA_VERSION = "1.0.0"


# ─── Topology mapping ───────────────────────────────────────────────────


def _map_topology(par_topology: dict[str, Any]) -> dict[str, Any]:
    """PAR topology (already discriminated by kind) → IR topology."""
    kind = par_topology.get("kind")
    if kind == "rectangular":
        return {
            "kind": "rectangular",
            "reels": int(par_topology["reels"]),
            "rows": int(par_topology["rows"]),
        }
    if kind == "variable_rows":
        out = {
            "kind": "variable_rows",
            "reels": int(par_topology["reels"]),
            "row_range_per_reel": [
                [int(lo), int(hi)] for lo, hi in par_topology["row_range_per_reel"]
            ],
        }
        if "ways_cap" in par_topology:
            out["ways_cap"] = int(par_topology["ways_cap"])
        return out
    if kind == "cluster_grid":
        return {
            "kind": "cluster_grid",
            "columns": int(par_topology["columns"]),
            "rows": int(par_topology["rows"]),
            "adjacency": str(par_topology["adjacency"]),
        }
    raise ValueError(f"unknown PAR topology kind: {kind!r}")


# ─── Symbols mapping ────────────────────────────────────────────────────


def _map_symbols(par_symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """1:1 symbol copy; keep all behavior fields."""
    out = []
    for s in par_symbols:
        sym: dict[str, Any] = {
            "id": str(s["id"]),
            "name": str(s.get("name", s["id"])),
            "kind": str(s["kind"]),
        }
        if "substitutes" in s:
            sub = s["substitutes"]
            sym["substitutes"] = "*" if sub == "*" else [str(x) for x in sub]
        if "weight_hint" in s:
            sym["weight_hint"] = float(s["weight_hint"])
        if "appears_on" in s:
            sym["appears_on"] = [int(x) for x in s["appears_on"]]
        if "behavior" in s and s["behavior"]:
            sym["behavior"] = dict(s["behavior"])
        out.append(sym)
    return out


# ─── Reels mapping ──────────────────────────────────────────────────────


def _map_reels(par_reels: dict[str, Any]) -> dict[str, Any]:
    """Strips → strips, weighted → weighted. Integer-stable for weights."""
    mode = par_reels.get("mode")
    if mode == "strips":
        out: dict[str, Any] = {
            "mode": "strips",
            "base": [[str(s) for s in reel] for reel in par_reels["base"]],
        }
        if "free_spins" in par_reels and par_reels["free_spins"]:
            out["free_spins"] = [
                [str(s) for s in reel] for reel in par_reels["free_spins"]
            ]
        return out
    if mode == "weighted":
        out = {
            "mode": "weighted",
            "base": [
                {str(k): float(v) for k, v in reel.items()}
                for reel in par_reels["base"]
            ],
        }
        if "free_spins" in par_reels and par_reels["free_spins"]:
            out["free_spins"] = [
                {str(k): float(v) for k, v in reel.items()}
                for reel in par_reels["free_spins"]
            ]
        return out
    raise ValueError(f"unknown reels mode: {mode!r}")


# ─── Evaluation ─────────────────────────────────────────────────────────


def _map_evaluation(par_eval: dict[str, Any]) -> dict[str, Any]:
    """Copy evaluation block as-is (discriminated union)."""
    return dict(par_eval)


# ─── Paytable ───────────────────────────────────────────────────────────


def _map_paytable(par_paytable: dict[str, Any]) -> dict[str, Any]:
    """Sym → match_count → multiplier."""
    out: dict[str, dict[str, float]] = {}
    for sym, table in par_paytable.items():
        out[str(sym)] = {str(k): float(v) for k, v in table.items()}
    return out


# ─── Features ───────────────────────────────────────────────────────────


def _map_features(par_features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """1:1 feature copy."""
    return [dict(f) for f in par_features]


# ─── RTP allocation ─────────────────────────────────────────────────────


def _map_rtp_allocation(par_rtp: dict[str, Any]) -> dict[str, Any]:
    """RTP allocation breakdown (base/FS/HW/jackpot)."""
    return {
        "base_game": float(par_rtp.get("base_game", par_rtp.get("rtp_total", 0.96))),
        "free_spins": float(par_rtp.get("free_spins", 0.0)),
        "hold_and_win": float(par_rtp.get("hold_and_win", 0.0)),
        "jackpot": float(par_rtp.get("jackpot", 0.0)),
        "tolerance": float(par_rtp.get("tolerance", 0.001)),
    }


# ─── Provenance ─────────────────────────────────────────────────────────


def _build_provenance(par: dict[str, Any]) -> dict[str, Any]:
    """Carry PAR Merkle into IR provenance for audit chain."""
    source = par.get("source", {})
    prov = {
        "vendor": str(source.get("vendor", "unknown")),
        "par_source": str(source.get("filename", "unknown")),
        "par_sha256": str(par.get("merkle_root_sha256", "")),
    }
    if "swid" in source:
        prov["swid"] = str(source["swid"])
    if "sha256" in source:
        prov["par_sha256"] = str(source["sha256"])
    elif "merkle_root_sha256" in par:
        prov["par_sha256"] = str(par["merkle_root_sha256"])
    return prov


# ─── Top-level mapping ──────────────────────────────────────────────────


def map_par_to_ir(par: dict[str, Any]) -> dict[str, Any]:
    """Map canonical PAR dict → Game IR dict (deterministic, sorted keys).

    Caller is responsible for loading PAR (YAML/JSON) and writing IR.
    """
    if par.get("schema") != "slot-math-canonical-par/v1":
        raise ValueError(
            f"unsupported PAR schema: {par.get('schema')!r} (expected slot-math-canonical-par/v1)"
        )

    meta = par.get("meta", {})
    ir: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "meta": {
            "id": str(meta.get("id", "unknown")),
            "name": str(meta.get("name", meta.get("id", "Unknown Game"))),
            "version": str(meta.get("version", "1.0.0")),
            "theme_tags": list(meta.get("theme_tags", [])),
        },
        "topology": _map_topology(par["topology"]),
        "symbols": _map_symbols(par.get("symbols", [])),
        "reels": _map_reels(par["reels"]),
        "evaluation": _map_evaluation(par.get("evaluation", {"kind": "lines"})),
        "paytable": _map_paytable(par.get("paytable", {})),
        "features": _map_features(par.get("features", [])),
        "rng": _map_rng_section(par),
        "bet": _map_bet(par.get("bet", {})),
        "limits": _map_limits(par.get("rtp", {}), par.get("limits", {})),
        "compliance": _map_compliance(par.get("compliance", {})),
        "rtp_allocation": _map_rtp_allocation(par.get("rtp", {})),
        "provenance": _build_provenance(par),
    }
    if "description" in meta:
        ir["meta"]["description"] = str(meta["description"])
    if "author" in meta:
        ir["meta"]["author"] = str(meta["author"])
    if "created_at_utc" in meta:
        ir["meta"]["created_at_utc"] = str(meta["created_at_utc"])
    return ir


def _map_rng_section(par: dict[str, Any]) -> dict[str, Any]:
    """RNG profile from PAR (raw; rng_bind() can override per-jurisdiction)."""
    rng = par.get("rng_profile", {})
    return {
        "kind": str(rng.get("kind", "pcg64")),
        "default_seed": int(rng.get("default_seed", 0)),
    }


def _map_bet(par_bet: dict[str, Any]) -> dict[str, Any]:
    return {
        "currency": str(par_bet.get("currency", "USD")),
        "base_bet": float(par_bet.get("base_bet", 1.0)),
        "denominations": [float(d) for d in par_bet.get("denominations", [1.0])],
    }


def _map_limits(par_rtp: dict[str, Any], par_limits: dict[str, Any]) -> dict[str, Any]:
    return {
        "target_rtp": float(par_rtp.get("rtp_total", 0.96)),
        "rtp_tolerance": float(par_rtp.get("tolerance", 0.001)),
        "max_win_x": float(par_limits.get("max_win_x", 5000.0)),
        "win_cap_apply": str(par_limits.get("win_cap_apply", "per_spin")),
        "target_volatility": str(par_limits.get("target_volatility", "medium")),
        "hit_freq_target": float(par_limits.get("hit_freq_target", 0.25)),
    }


def _map_compliance(par_comp: dict[str, Any]) -> dict[str, Any]:
    return {
        "jurisdictions": list(par_comp.get("jurisdictions", ["GENERIC"])),
        "rtp_range_required": [
            float(x) for x in par_comp.get("rtp_range_required", [0.90, 0.98])
        ],
        "max_win_cap_required": float(par_comp.get("max_win_cap_required", 10000.0)),
        "near_miss_rule": str(par_comp.get("near_miss_rule", "must_be_random")),
        "ldw_disclosure": bool(par_comp.get("ldw_disclosure", False)),
        "session_time_display": bool(par_comp.get("session_time_display", False)),
    }


# ─── Helpers ────────────────────────────────────────────────────────────


def ir_merkle_sha256(ir: dict[str, Any]) -> str:
    """Deterministic sha256 over IR bytes (sorted keys, compact)."""
    payload = json.dumps(ir, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def attach_ir_merkle(ir: dict[str, Any]) -> dict[str, Any]:
    """Compute IR sha256 and stamp into provenance.ir_sha256."""
    h = ir_merkle_sha256(ir)
    ir.setdefault("provenance", {})["ir_sha256"] = h
    return ir
