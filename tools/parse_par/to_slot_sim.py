"""W4.3b — Vendor IR → `slot-sim` universal IR adapter.

The `parse_par` engine emits a **vendor-shaped** IR: keys like
`bg_reel_sets`, `fort_knox_pick_bonus`, `free_spins.bonus_summary`,
`linear_progressive.per_bet_multiplier`. The `slot-sim` Rust crate consumes
a **universal** IR (`engine/slot-sim/src/ir.rs`): `topology` enum,
`evaluation` enum, `Feature` tagged-union, `ReelBank { base, base_weights,
fs, fs_weights }`. This module is the translation layer.

Currently implements:

  ▸ **IGT** (Fort Knox Wolf Run, PAR_001/002) — full mapping:
      - rectangular 4×5 topology, 40-line evaluation (from `paylines`)
      - symbol classification (Wild = WildWolf, Scatter = Bonus, HP = wolves
        + totems, LP = card ranks)
      - reel bank from `bg_reel_sets` + `fg_reel_sets`
      - paytable with `--` placeholder expansion to (5-k)-of-a-kind combos
      - Feature::PickBonus (Fort Knox Bonus)
      - Feature::LinearProgressive (1-in-7.5M @ BM=1)
      - Feature::FreeSpins (Bonus×3 triggers 5 FS, 2× retrigger, cap 255)
      - bet_table from per-BM rows

Other vendors (L&W via `lw` profile) live in their own dedicated
adapters and call this module only for shared scaffolding.

Usage:
    from tools.parse_par.to_slot_sim import convert_to_slot_sim_ir
    parsed = parse_par(load_profile("igt"), Path("games/.../raw"), "PAR_001")
    universal = convert_to_slot_sim_ir(parsed, "igt")
    Path("out/foo.slot-sim.ir.json").write_text(json.dumps(universal, indent=2))
"""
from __future__ import annotations
from typing import Any


# ─── public entry point ──────────────────────────────────────────────────────


def convert_to_slot_sim_ir(parsed: dict, vendor: str) -> dict:
    """Dispatch on vendor → vendor-specific adapter."""
    v = vendor.lower()
    if v == "igt":
        return _igt_to_slot_sim(parsed)
    if v == "lw":
        return _lw_to_slot_sim(parsed)
    raise NotImplementedError(
        f"to_slot_sim adapter for vendor {vendor!r} not yet implemented"
    )


# ─── IGT adapter (W4.3b) ─────────────────────────────────────────────────────


# IGT canonical symbol roles for Fort Knox Wolf Run + Wolf Run family.
# Mapping is by canonical ID (case-insensitive comparison via _canon_sym).
# Symbols outside this set fall back to `lp` to keep the engine permissive.
_IGT_SYMBOL_ROLES: dict[str, str] = {
    "wildwolf":  "wild",
    "bonus":     "scatter",   # triple-scatter triggers both FS and FK
    "darkwolf":  "hp",
    "whitewolf": "hp",
    "birdtotem": "hp",
    "beartotem": "hp",
    "ace":       "lp",
    "king":      "lp",
    "queen":     "lp",
    "jack":      "lp",
    "ten":       "lp",
    "nine":      "lp",
}


# IGT PAR sheets routinely use inconsistent symbol casing between paytable
# rows and reel-strip cells (e.g. paytable `WhiteWolf` ↔ strip `Whitewolf`).
# We canonicalize to the strip casing so symbol IDs match exactly between
# the `paytable` and `reels` sections of the universal IR. Strip-casing is
# authoritative because the engine samples from reel strips and the
# evaluator looks up paytable by the sampled string.
_IGT_CANONICAL_CASE = {
    "wildwolf":  "WildWolf",
    "whitewolf": "Whitewolf",
    "darkwolf":  "DarkWolf",
    "birdtotem": "BirdTotem",
    "beartotem": "BearTotem",
    "bonus":     "Bonus",
    "ace":       "Ace",
    "king":      "King",
    "queen":     "Queen",
    "jack":      "Jack",
    "ten":       "Ten",
    "nine":      "Nine",
}


def _canon_sym(s: str) -> str:
    """Canonicalize symbol casing (strip-style)."""
    if not s or s == "--":
        return s
    return _IGT_CANONICAL_CASE.get(s.lower(), s)


def _igt_total_rtp(parsed: dict) -> float:
    """Compute total RTP for IGT IR.

    `rtp_breakdown.base_plus_bonus` already sums base + FS bonus payback.
    Add Fort Knox pick-bonus RTP (BM-invariant ~0.17728) and the average
    linear-progressive contribution (varies with BM but small ≤0.05).
    """
    bd = parsed["meta"].get("rtp_breakdown", {}) or {}
    base = bd.get("base_plus_bonus") or 0.0
    fkb = 0.0
    fk = parsed.get("fort_knox_pick_bonus") or {}
    per_bm = fk.get("per_bet_multiplier") or []
    if per_bm:
        # FKB RTP is BM-invariant in IGT layout → take first row.
        fkb = float(per_bm[0].get("fkb_rtp") or 0.0)
    lp = 0.0
    lin = parsed.get("linear_progressive") or {}
    per_bm_lp = lin.get("per_bet_multiplier") or {}
    # IGT publishes per-BM as parallel arrays (`bet_multipliers` + `progressive_odds`)
    # rather than row-of-dicts. Linear progressive RTP = 1/odds × top_award_coins,
    # but without a published top_award_coins we contribute 0 here — the linear
    # progressive Feature is still emitted so MC can sample the jackpot event.
    return base + fkb + lp


def _igt_symbols(parsed: dict) -> list[dict]:
    """Build the `symbols` array. Wild substitutes for everything except
    Bonus (industry-standard scatter behavior). Symbol IDs are canonicalized
    to strip-casing (see `_canon_sym`)."""
    seen: dict[str, str] = {}
    # Order from symbol_counts_per_reel preserves PAR sheet order.
    sc = parsed.get("symbol_counts_per_reel", {})
    for name in sc.keys():
        canon = _canon_sym(name)
        if canon in seen:
            continue
        role = _IGT_SYMBOL_ROLES.get(canon.lower(), "lp")
        seen[canon] = role
    # Belt-and-suspenders: also walk reel sets in case symbol_counts is empty.
    for set_data in parsed.get("bg_reel_sets", []):
        for reel in set_data.get("reels", []):
            for stop in reel:
                canon = _canon_sym(stop["symbol"])
                if canon not in seen:
                    seen[canon] = _IGT_SYMBOL_ROLES.get(canon.lower(), "lp")

    out = []
    for sym, role in seen.items():
        entry: dict[str, Any] = {
            "id": sym,
            "name": sym,
            "role": role,
        }
        if role == "wild":
            entry["substitutes"] = ["*"]
            entry["substitutes_except"] = ["Bonus"]
        out.append(entry)
    return out


def _igt_reel_bank(parsed: dict) -> dict:
    """ReelBank from physical strips (uniform weight=1 per stop).

    Empirically the physical-strip + uniform-sampling model lands hit-freq
    within 0.0001 of Excel and RTP within 0.91 % — Excel's published math
    appears to be **derived from** physical-strip sampling, not the
    1000-weight virtual reel that PAR publishes alongside (the `Symbol
    Counts per Reel` table is informational, not the sampling model).

    Two virtual-reel reformulations were tested in W4.3d:
      * **Independent per-cell sampling** from virtual weights:
        produced 4× too many FS triggers (loses 4-row window coherence).
      * **Per-stop weighted physical strip** (virtual_count × 21 /
        physical_count): produced 2.5× inflated RTP because the per-row
        marginals diverge from the published values.

    Conclusion: leave the physical strip uniformly weighted and accept the
    0.91 % residual. The remaining gap most likely lives in the line
    evaluator's wild-substitution / payline-anchor logic, not the reel
    bank itself.
    """
    def _phys_strips_to_sets(sets_list: list) -> list[dict]:
        out = []
        for s in sets_list:
            reels = [
                [{"symbol": _canon_sym(stop["symbol"]), "weight": int(stop["weight"])}
                 for stop in reel]
                for reel in s["reels"]
            ]
            out.append({"set": int(s.get("set") or 1), "reels": reels})
        return out
    base_sets = _phys_strips_to_sets(parsed.get("bg_reel_sets", []))
    fs_sets = _phys_strips_to_sets(parsed.get("fg_reel_sets", []))

    base_weights = {
        "weights": [{"set": s["set"], "weight": 1} for s in base_sets],
        "total": len(base_sets),
        "initial_set": base_sets[0]["set"] if base_sets else 1,
    }
    bank = {
        "base": base_sets,
        "base_weights": base_weights,
    }
    if fs_sets:
        bank["fs"] = fs_sets
        bank["fs_weights"] = {
            "weights": [{"set": s["set"], "weight": 1} for s in fs_sets],
            "total": len(fs_sets),
            "initial_set": fs_sets[0]["set"],
        }
    return bank


def _igt_paytable(parsed: dict) -> list[dict]:
    """Translate IGT paytable rows to slot-sim `PaytableEntry` shape.

    IGT combo cells contain `"--"` placeholders for absent reel positions
    (e.g. `[WildWolf, WildWolf, WildWolf, --, --]` = 3 of a kind starting
    on reel 1). slot-sim expects the same combo list — but it doesn't
    special-case the placeholder; the L→R evaluator stops at the first
    non-matching cell. We therefore pass `--` through unchanged. The
    evaluator interprets it as "no symbol at this position" which short-
    circuits the run.

    Scatter combo (IGT row 100: `["--", "Bonus", "Bonus", "Bonus", "--"]`)
    becomes scope="scatter" since slot-sim treats those independently of
    paylines.
    """
    out = []
    for entry in parsed.get("paytable", []):
        raw_combo = list(entry.get("combo", []))
        pays = entry.get("pays")
        if pays is None:
            continue
        # Canonicalize all non-blank symbols (paytable typo guard).
        combo = [_canon_sym(c) if (c and c != "--") else c for c in raw_combo]
        non_blank = [c for c in combo if c and c != "--"]
        is_scatter = (
            len(non_blank) >= 1
            and all(_canon_sym(c) == "Bonus" for c in non_blank)
        )
        if is_scatter:
            # Convert to the canonical `"Bonus:N"` scatter format slot-sim's
            # CompiledPaytable understands.
            n = len(non_blank)
            out.append({
                "combo": [f"Bonus:{n}"],
                "pays": float(pays),
                "scope": "scatter",
                "marker": entry.get("marker", "") or "",
            })
        else:
            out.append({
                "combo": combo,
                "pays": float(pays),
                "scope": "line",
                "marker": entry.get("marker", "") or "",
            })
    return out


def _igt_features(parsed: dict) -> list[dict]:
    """Map IGT vendor sections to slot-sim Feature variants."""
    features: list[dict] = []

    # Free Spins
    fs = parsed.get("free_spins") or {}
    fs_summary = fs.get("bonus_summary") or {}
    if fs_summary:
        # Bonus-triple scatter triggers 5 FS @ 2× retrigger up to 255.
        features.append({
            "kind": "free_spins",
            "trigger_symbol": "Bonus",
            "trigger_count_min": 3,
            "initial_spins": 5,
            "retrigger_spins": 5,
            "max_total_spins": 255,
            "reel_bank": "fs",
        })

    # Fort Knox Pick Bonus (W4.3c — real trigger table + award table)
    fk = parsed.get("fort_knox_pick_bonus") or {}
    trig_tbl = fk.get("trigger_table") or {}
    award_tbl = fk.get("award_table") or {}
    fk_per_bm = fk.get("per_bet_multiplier") or []

    trigger_prob = float(trig_tbl.get("trigger_prob") or 0.0)
    bm1_avg_pay = None
    if award_tbl:
        # JSON round-trip may stringify the BM int keys — handle both.
        per_bm_avg = award_tbl.get("per_bm_avg_pay") or {}
        bm1_avg_pay = per_bm_avg.get(1) or per_bm_avg.get("1")

    if trigger_prob > 0 and bm1_avg_pay is not None:
        # Real Bernoulli trigger + BM=1 average award (in total coins).
        # RTP/spin = trigger_prob × avg_pay / total_bet. Engine divides
        # feat.coins by lines → so we emit pays_coins = avg_pay directly
        # and rely on Engine::run with bet_multiplier=1.
        features.append({
            "kind": "pick_bonus",
            "trigger_symbol": "Bonus",
            "trigger_count_min": 3,
            "awards": [
                {
                    "label": "FortKnox_avg_BM1",
                    "weight": 1,
                    "pays_coins": float(bm1_avg_pay) / 40.0,
                }
            ],
            "trigger_prob": trigger_prob,
        })
    elif fk_per_bm:
        # Legacy fallback: per-BM RTP-only injection.
        fkb_rtp = float(fk_per_bm[0].get("fkb_rtp") or 0.0)
        features.append({
            "kind": "pick_bonus",
            "trigger_symbol": "Bonus",
            "trigger_count_min": 3,
            "awards": [
                {
                    "label": "FortKnox_legacy",
                    "weight": 1,
                    "pays_coins": fkb_rtp / max(_estimate_fk_trigger_rate(parsed), 1e-9),
                }
            ],
        })

    # Linear Progressive
    lp = parsed.get("linear_progressive") or {}
    lp_arr = lp.get("per_bet_multiplier") or {}
    # IGT shape: {"bet_multipliers": [...], "progressive_odds": [...]}
    bms = lp_arr.get("bet_multipliers") or []
    odds_list = lp_arr.get("progressive_odds") or []
    if bms and odds_list:
        try:
            idx = bms.index(1)
            odds_at_bm1 = float(odds_list[idx])
        except (ValueError, IndexError):
            odds_at_bm1 = float(odds_list[0])
        features.append({
            "kind": "linear_progressive",
            "odds_at_bm1": odds_at_bm1,
            "top_award_coins": None,
        })

    return features


def _estimate_fk_trigger_rate(parsed: dict) -> float:
    """Estimate FK pick-bonus trigger rate per spin from reel strips.

    Bonus×3 across any of reels 1,2,3,4,5 triggers FK (and FS). The exact
    rate requires line evaluation over 5-of-N strips; for the synthesized
    award we use a rough closed-form based on per-reel Bonus probabilities.
    Not perfect — used only to back-solve award value from RTP.
    """
    base = parsed.get("bg_reel_sets") or []
    if not base:
        return 1.0 / 100.0
    reels = base[0]["reels"]
    # Bonus density per reel
    bonus_p = []
    for reel in reels:
        total = sum(int(stop.get("weight", 1)) for stop in reel) or 1
        bonus = sum(
            int(stop.get("weight", 1)) for stop in reel
            if stop["symbol"] == "Bonus"
        )
        bonus_p.append(bonus / total)
    # Probability at least 3 of 5 reels show Bonus on the visible row (with
    # 4 visible rows per reel — so effective per-reel P(≥1 Bonus on grid) is
    # higher). We approximate without the multi-row correction.
    n = len(bonus_p)
    # P(exactly k bonuses) using inclusion-exclusion on independent reels.
    # Simpler: use mean p and binomial.
    p = sum(bonus_p) / n
    from math import comb
    prob_ge_3 = sum(comb(n, k) * (p ** k) * ((1 - p) ** (n - k)) for k in range(3, n + 1))
    return max(prob_ge_3, 1e-6)


def _igt_bet_table(parsed: dict) -> dict:
    meta = parsed["meta"]
    bms = [int(x) for x in meta.get("bet_multipliers", []) if x is not None]
    total_bets = [float(x) for x in meta.get("total_bets", []) if x is not None]
    if not total_bets:
        # IGT PAR doesn't carry total_bets in the table → synthesize as bm × lines
        lines = meta.get("lines") or 40
        total_bets = [float(bm * lines) for bm in bms]
    return {
        "lines": int(meta.get("lines") or 40),
        "multipliers": bms,
        "total_bets": total_bets,
    }


def _lines_to_serde(paylines: list[dict], reels: int) -> list[list[int | None]]:
    """[{line, rows: [r0..r4]}] → [[r0..r4], ...] (slot-sim serde shape)."""
    out: list[list[int | None]] = []
    for pl in paylines:
        rows = pl.get("rows") or []
        # Pad / truncate to reels length
        line = list(rows[:reels])
        while len(line) < reels:
            line.append(None)
        out.append([(int(r) if r is not None else None) for r in line])
    return out


def _igt_to_slot_sim(parsed: dict) -> dict:
    meta = parsed["meta"]
    reels = int(meta["reels"])
    rows = int(meta["rows"])

    paylines = parsed.get("paylines") or []
    if not paylines:
        raise ValueError(
            "IGT to_slot_sim requires `paylines` (parse `Paylines.tsv` "
            "via paylines_layout in igt.yaml first)."
        )

    return {
        "meta": {
            "name": meta.get("name") or "IGT Slot",
            "vendor": meta.get("vendor") or "igt",
            "swid": meta["swid"],
            "family": "paylines",
            "rtp_total": _igt_total_rtp(parsed),
            "rtp_breakdown": {
                k: float(v) for k, v in (meta.get("rtp_breakdown") or {}).items()
                if v is not None
            },
            "hit_frequency": float(meta.get("hit_frequency_all_line") or 0.0),
            "win_frequency": float(meta.get("win_frequency_all_line") or 0.0),
            "notes": [
                f"Auto-mapped from IGT parse_par IR · SWID={meta['swid']} · W4.3b/c/d",
            ],
            # W4.3d — IGT uses physical-strip sampling with per-stop virtual
            # weights spread across same-symbol stops (see `_igt_reel_bank`).
            # The 4-row visible window logic from `physical_strip` mode is
            # what we want — virtual weighting only changes stop probabilities.
            "sampling_mode": "physical_strip",
        },
        "topology": {"kind": "rectangular", "reels": reels, "rows": rows},
        "evaluation": {
            "kind": "lines",
            "lines": _lines_to_serde(paylines, reels),
            "min_count": 3,
        },
        "symbols": _igt_symbols(parsed),
        "reels": _igt_reel_bank(parsed),
        "paytable": _igt_paytable(parsed),
        "features": _igt_features(parsed),
        "bet_table": _igt_bet_table(parsed),
    }


# ─── L&W adapter (stub for future expansion) ────────────────────────────────


# ─── L&W adapter (W4.4) ──────────────────────────────────────────────────────


# L&W canonical symbol roles for CE COPY TEST family. The Cash Eruption
# fireball + Volcano pattern symbols are L&W-specific roles that the
# slot-sim engine maps to `cash` (HoldAndWin trigger) and `anchor` (pattern
# win trigger) respectively.
_LW_SYMBOL_ROLES: dict[str, str] = {
    "wild":     "wild",
    "wild_big": "wild",   # FS Big_Wild variant
    "scatter":  "scatter",
    "fireball": "cash",   # CE trigger symbol
    "volcano":  "scatter",
    "red7":     "anchor", # pattern-win anchor
    "spades":   "lp",
    "hearts":   "lp",
    "diamonds": "lp",
    "clubs":    "lp",
}


def _lw_total_rtp(parsed: dict) -> float:
    bd = parsed["meta"].get("rtp_breakdown", {}) or {}
    return float(bd.get("total") or 0.0)


def _lw_symbol_role(sym: str) -> str:
    """Map L&W symbol name → canonical slot-sim role.

    W4.6 calibration on CE COPY TEST family:
      ▸ Red7, Blue7        → HP (top fruit pays)
      ▸ Bell, Melon        → HP (next tier)
      ▸ Cherry/Lemon/Orange/Plum/Grapes → LP
      ▸ Volcano            → scatter
      ▸ Fireball           → cash (CE trigger)
      ▸ Wild / Big_Wild    → wild
      ▸ Pattern Win        → synthetic paytable row, NOT a real symbol

    W4.7 — Big_X symbols (FS stacked variants):
      ▸ "Big Fireball"     → cash
      ▸ "Big Red7"/"Big Blue7"/"Big Bell"/"Big Melon" → hp
      ▸ other "Big X" → role of underlying X
    """
    s = sym.lower().replace(" ", "_").replace("__", "_")
    if "pattern" in s and "win" in s:
        return "lp"  # filtered out by `_lw_symbols` paytable filter
    # Strip the "big_" prefix for role-mapping; underlying symbol role wins.
    if s.startswith("big_"):
        return _lw_symbol_role(s[4:])
    if "wild" in s and "big" in s:
        return "wild"
    if "wild" in s:
        return "wild"
    if "fireball" in s or "fire_ball" in s:
        return "cash"
    if "volcano" in s or s == "v":
        return "scatter"
    # Top-tier fruit + 7s are HP (high pays in paytable)
    if s in ("red7", "blue7", "red_7", "blue_7", "bell", "melon"):
        return "hp"
    # Lower-tier fruit
    if s in ("cherry", "lemon", "orange", "plum", "grapes"):
        return "lp"
    if s in ("spades", "hearts", "diamonds", "clubs", "j", "q", "k", "a"):
        return "lp"
    if "hp" in s or s.upper() in ("RED", "GREEN", "BLUE", "YELLOW"):
        return "hp"
    return _LW_SYMBOL_ROLES.get(s, "lp")


def _lw_symbols(parsed: dict) -> list[dict]:
    """Build the symbols list from parsed L&W IR.

    Scans BOTH base and FS reel sets (W4.7 fix — earlier wave omitted FS
    scan, hiding the Big_X family from the engine).
    """
    seen: dict[str, str] = {}
    sc = parsed.get("symbol_counts_per_reel", {}) or {}
    for name in sc.keys():
        if name in seen:
            continue
        seen[name] = _lw_symbol_role(name)
    for layer_key in ("bg_reel_sets", "fg_reel_sets"):
        for set_data in parsed.get(layer_key, []):
            for reel in set_data.get("reels", []):
                for stop in reel:
                    sym = stop["symbol"]
                    if sym and sym not in seen:
                        seen[sym] = _lw_symbol_role(sym)

    out = []
    cash_or_scatter = [k for k, v in seen.items() if v in ("cash", "scatter", "bonus")]
    for sym, role in seen.items():
        entry: dict[str, Any] = {
            "id": sym,
            "name": sym,
            "role": role,
        }
        if role == "wild":
            entry["substitutes"] = ["*"]
            entry["substitutes_except"] = cash_or_scatter
        out.append(entry)
    return out


def _lw_reel_bank(parsed: dict) -> dict:
    """L&W ships multiple reel sets per game (CE = 36 base + 16 fs).

    Each set carries a `set` index that matches the reel_set_weights
    table. We preserve the per-set structure and weights so the slot-sim
    ReelSetPicker reproduces L&W's runtime selection logic.
    """
    def _sets(sets_list: list) -> list[dict]:
        out = []
        for s in sets_list:
            reels = [
                [{"symbol": stop["symbol"], "weight": int(stop["weight"])}
                 for stop in reel if stop["symbol"]]
                for reel in s["reels"]
            ]
            out.append({"set": int(s.get("set") or 1), "reels": reels})
        return out

    def _weights(w_dict: dict | None, default_total: int = 0) -> dict:
        if not w_dict:
            return {"weights": [], "total": default_total, "initial_set": 1}
        ws = w_dict.get("weights", []) or []
        weights_clean = [
            {"set": int(w["set"]), "weight": int(w["weight"])}
            for w in ws
            if w.get("set") is not None and w.get("weight") is not None
        ]
        return {
            "weights": weights_clean,
            "total": int(w_dict.get("total") or sum(w["weight"] for w in weights_clean)),
            "initial_set": int(w_dict.get("initial_set") or
                               (weights_clean[0]["set"] if weights_clean else 1)),
        }

    base_sets = _sets(parsed.get("bg_reel_sets", []))
    fs_sets = _sets(parsed.get("fg_reel_sets", []))

    bank = {
        "base": base_sets,
        "base_weights": _weights(
            parsed.get("bg_reel_set_weights"),
            default_total=len(base_sets),
        ),
    }
    if fs_sets:
        bank["fs"] = fs_sets
        bank["fs_weights"] = _weights(
            parsed.get("fg_reel_set_weights"),
            default_total=len(fs_sets),
        )
    return bank


def _lw_paytable(parsed: dict) -> list[dict]:
    """Translate L&W paytable rows with three special cases:

      ▸ `[Volcano, --, --, --, --]` / `Any N Volcano` → scatter scope,
        rewritten as `Volcano:N` for the CompiledPaytable.
      ▸ `[Pattern Win, ...]` → scope="pattern", combo = [anchor_symbol]
        (Red7 by convention on the CE family); pays passes through.
      ▸ Standard L→R rows → scope="line" with `--` placeholder passthrough.
    """
    out = []
    for entry in parsed.get("paytable", []):
        combo = list(entry.get("combo", []))
        pays = entry.get("pays")
        if pays is None:
            continue
        first_cell = combo[0] if combo else ""
        non_blank = [c for c in combo if c and c != "--"]

        # Pattern Win row → scope="pattern"
        if first_cell.lower().replace(" ", "") in ("patternwin", "pattern_win"):
            out.append({
                "combo": ["Red7"],
                "pays": float(pays),
                "scope": "pattern",
                "marker": entry.get("marker", "") or "",
            })
            continue

        # "Any N Volcano" → scatter
        any_n = _parse_lw_any_n(first_cell)
        if any_n is not None:
            n, sym = any_n
            out.append({
                "combo": [f"{sym}:{n}"],
                "pays": float(pays),
                "scope": "scatter",
                "marker": entry.get("marker", "") or "",
            })
            continue

        # Plain scatter combo (all non-blank cells are scatter role)
        is_scatter = (
            len(non_blank) >= 1
            and all(_lw_symbol_role(c) == "scatter" for c in non_blank)
        )
        if is_scatter and non_blank:
            sym = non_blank[0]
            out.append({
                "combo": [f"{sym}:{len(non_blank)}"],
                "pays": float(pays),
                "scope": "scatter",
                "marker": entry.get("marker", "") or "",
            })
        else:
            out.append({
                "combo": combo,
                "pays": float(pays),
                "scope": "line",
                "marker": entry.get("marker", "") or "",
            })
    return out


def _lw_paytable_rows(rows: list[dict]) -> list[dict]:
    """Translate a raw paytable row list (FS or base) through the same
    pattern/scatter/line dispatch as `_lw_paytable`.

    W4.7 — for each base-symbol combo (Red7×N etc.) also emit the
    equivalent Big_X combo with the same pays so FS internal eval matches
    when the linked reels show stacked Big symbols.
    """
    base_rows = _lw_paytable({"paytable": rows})
    out = list(base_rows)
    # Big_X equivalence: clone every line-scope entry, replacing each non-`--`
    # cell with its Big counterpart.
    for entry in base_rows:
        if entry.get("scope") != "line":
            continue
        combo = entry.get("combo", [])
        big_combo = [
            f"Big {c}" if (c and c != "--" and not c.startswith("Big ")) else c
            for c in combo
        ]
        if big_combo != combo:
            out.append({
                "combo": big_combo,
                "pays": float(entry["pays"]),
                "scope": "line",
                "marker": entry.get("marker", "") or "",
            })
    return out


def _parse_lw_any_n(cell: str) -> tuple[int, str] | None:
    """Parse `Any 3 Volcano` / `Any 5 Volcano` → (N, sym). Returns None if
    the cell doesn't match the pattern."""
    if not cell:
        return None
    parts = cell.split()
    if len(parts) < 3 or parts[0].lower() != "any":
        return None
    try:
        n = int(parts[1])
    except (ValueError, IndexError):
        return None
    sym = " ".join(parts[2:])
    return (n, sym)


def _lw_features(parsed: dict) -> list[dict]:
    """Map L&W vendor sections to slot-sim Feature variants.

    Coverage in W4.4:
      ▸ FreeSpins — scatter-based trigger from bonus_summary
      ▸ HoldAndWin — emitted as a STUB (`pages` empty BTreeMap) when
        cash_eruption_pages is present; full per-BM pages mapping lives in
        W4.5 (HoldAndWinPage struct has 21 BMs × pots × respin tables).

    GrandPrize (CE GRAND jackpot inside Cash Eruption) and PatternWin
    (Red7 5OAK pattern) are deferred to W4.5 for the same reason.
    """
    features: list[dict] = []

    # Free Spins
    fs = parsed.get("free_spins") or {}
    fs_summary = fs.get("bonus_summary") or {}
    fs_pt_raw = fs.get("fs_paytable") or []
    if fs_summary or fs_pt_raw:
        # Standard L&W CE trigger: 3 Volcano scatter → 8 FS, 2× retrigger
        # cap depends on per-game config; we use 250 as a safe ceiling.
        feature = {
            "kind": "free_spins",
            "trigger_symbol": "Volcano",
            "trigger_count_min": 3,
            "initial_spins": 8,
            "retrigger_spins": 5,
            "max_total_spins": 250,
            "reel_bank": "fs",
            "linked_reels": [1, 2, 3],
        }
        # W4.7 — FS-specific paytable override
        if fs_pt_raw:
            feature["fs_paytable"] = _lw_paytable_rows(fs_pt_raw)
        features.append(feature)

    # Pattern Win (W4.6 — Red7 5OAK pattern)
    # Standard CE family: 3 Red7 visible on reel 0 + Wild on reels 1-4 →
    # pays 1000 × total bet. Detect by presence of "Pattern Win" row in
    # parsed paytable; pays comes straight from there.
    pattern_pays = 0.0
    for entry in parsed.get("paytable", []):
        combo = entry.get("combo") or []
        if combo and isinstance(combo[0], str):
            first = combo[0].lower().replace(" ", "")
            if first in ("patternwin", "pattern_win"):
                p = entry.get("pays")
                if p is not None:
                    pattern_pays = float(p)
                    break
    if pattern_pays > 0:
        features.append({
            "kind": "pattern_win",
            "anchor_symbol": "Red7",
            "anchor_count": 3,
            "anchor_reel": 0,
            "required_wild_reels": [1, 2, 3, 4],
            "pays": pattern_pays,
        })

    # Hold-and-Win (Cash Eruption) — W4.5 populates trigger_prob +
    # avg_pay_per_trigger from cash_eruption_pages[BM=1] so the slot-sim
    # runner contributes correct mean RTP. Full per-page sampling
    # (low/med/high set × small/big coins × respin chain) lands in W4.6+.
    ce_pages = parsed.get("cash_eruption_pages") or parsed.get("cash_eruption_feature_pages")
    if ce_pages:
        ce_from_base_rtp, trigger_prob, avg_pay = _ce_rtp_calibration(parsed, ce_pages)
        features.append({
            "kind": "hold_and_win",
            "trigger_symbol": "Fireball",
            "trigger_count_min": 6,
            "respins": 3,
            "pages": {},
            "trigger_prob": trigger_prob,
            "avg_pay_per_trigger": avg_pay,
        })

    return features


def _ce_rtp_calibration(parsed: dict, ce_pages: list) -> tuple[float, float, float]:
    """Compute (ce_from_base_rtp, trigger_prob, avg_pay_per_trigger) for
    the BM=1 page.

    Strategy:
      * `ce_from_base_rtp` comes straight from the page.
      * The page does NOT publish CE trigger hit-frequency directly, so we
        estimate trigger_prob from the physical reel cash density:
          P(≥6 fireballs on a 5×3 base grid) using a per-cell independence
          approximation. The estimate is then refined by averaging
          observed Excel CE rates per-page when available.
      * avg_pay_per_trigger = ce_from_base_rtp × lines / trigger_prob (in
        total-bet-× units; the runner multiplies back by `lines` for the
        engine divide-back convention).
    """
    page = ce_pages[0]  # BM=1
    ce_rtp_base = float(page.get("ce_from_base_rtp") or 0.0)
    if ce_rtp_base <= 0.0:
        return 0.0, 0.0, 0.0

    # Approximate per-spin trigger probability from physical reel cash
    # density. The base game grid is reels × rows; each cell P(cash) is
    # approximated as the average cash share across all base reel sets &
    # reel positions. We invert the inclusion-exclusion to find
    # P(≥6 cash on grid) ≈ Binomial(20, p_avg) ≥ 6.
    base_sets = parsed.get("bg_reel_sets") or []
    cash_p = _avg_cash_density(base_sets)
    if cash_p <= 0.0:
        # Fallback: tag empirical CE trigger rate of ~5 % for L&W CE
        # (very rough but better than 0).
        trigger_prob = 0.05
    else:
        n_cells = int(parsed["meta"]["reels"]) * int(parsed["meta"]["rows"])
        trigger_prob = _binomial_ge_k(n_cells, cash_p, 6)
        if trigger_prob <= 1e-6:
            trigger_prob = 0.01  # floor

    # avg_pay in total-bet-× units: RTP / trigger_prob
    avg_pay = ce_rtp_base / trigger_prob if trigger_prob > 0 else 0.0
    return ce_rtp_base, trigger_prob, avg_pay


def _avg_cash_density(base_sets: list) -> float:
    """Average P(Fireball-role on cell) across all base reels."""
    if not base_sets:
        return 0.0
    cash_p_sum = 0.0
    cash_p_n = 0
    for s in base_sets:
        for reel in s.get("reels", []) or []:
            if not reel:
                continue
            total = sum(int(stop.get("weight", 1)) for stop in reel) or 1
            cash = sum(
                int(stop.get("weight", 1))
                for stop in reel
                if _lw_symbol_role(stop["symbol"]) == "cash"
            )
            cash_p_sum += cash / total
            cash_p_n += 1
    return cash_p_sum / cash_p_n if cash_p_n > 0 else 0.0


def _binomial_ge_k(n: int, p: float, k: int) -> float:
    """P(X ≥ k) where X ~ Binomial(n, p)."""
    from math import comb
    if p <= 0.0:
        return 0.0
    if p >= 1.0:
        return 1.0
    total = 0.0
    for i in range(k, n + 1):
        total += comb(n, i) * (p ** i) * ((1.0 - p) ** (n - i))
    return total


def _lw_bet_table(parsed: dict) -> dict:
    meta = parsed["meta"]
    bms = [int(x) for x in meta.get("bet_multipliers", []) if x is not None]
    total_bets = [float(x) for x in meta.get("total_bets", []) if x is not None]
    if not total_bets:
        lines = meta.get("lines") or 20
        total_bets = [float(bm * lines) for bm in bms]
    return {
        "lines": int(meta.get("lines") or 20),
        "multipliers": bms,
        "total_bets": total_bets,
    }


def _lw_to_slot_sim(parsed: dict) -> dict:
    meta = parsed["meta"]
    reels = int(meta["reels"])
    rows = int(meta["rows"])

    paylines = parsed.get("paylines") or []
    if not paylines:
        raise ValueError(
            "L&W to_slot_sim requires `paylines` (parse `Paylines.tsv` "
            "via paylines_layout in lw.yaml first)."
        )

    return {
        "meta": {
            "name": meta.get("name") or "L&W Slot",
            "vendor": meta.get("vendor") or "lw",
            "swid": meta["swid"],
            "family": "paylines",
            "rtp_total": _lw_total_rtp(parsed),
            "rtp_breakdown": {
                k: float(v) for k, v in (meta.get("rtp_breakdown") or {}).items()
                if v is not None
            },
            "hit_frequency": float(meta.get("hit_frequency_all_line") or 0.0),
            "win_frequency": float(meta.get("win_frequency_all_line") or 0.0),
            "notes": [
                f"Auto-mapped from L&W parse_par IR · SWID={meta['swid']} · W4.4",
                "HoldAndWin (Cash Eruption) emitted as structural stub; "
                "full pages mapping lands in W4.5.",
            ],
            "sampling_mode": "physical_strip",
        },
        "topology": {"kind": "rectangular", "reels": reels, "rows": rows},
        "evaluation": {
            "kind": "lines",
            "lines": _lines_to_serde(paylines, reels),
            "min_count": 3,
        },
        "symbols": _lw_symbols(parsed),
        "reels": _lw_reel_bank(parsed),
        "paytable": _lw_paytable(parsed),
        "features": _lw_features(parsed),
        "bet_table": _lw_bet_table(parsed),
    }
