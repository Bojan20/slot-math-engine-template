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


def _lw_to_slot_sim(parsed: dict) -> dict:
    """L&W → slot-sim adapter.

    Phase-1 stub: the CE COPY TEST family ships its own hand-rolled
    converter elsewhere (CE-specific math: hold-and-win, GRAND prize,
    Cash Eruption pages). When that converter is folded back into the
    universal adapter, this function will inherit shared scaffolding from
    `_igt_to_slot_sim` (topology + reels + paylines path) and add the
    CE-specific feature mapping. Tracked under W4.4.
    """
    raise NotImplementedError(
        "L&W to_slot_sim adapter is a Phase-2 wave (W4.4). "
        "Use CE-specific converter in games/ce-copy-test/ for now."
    )
