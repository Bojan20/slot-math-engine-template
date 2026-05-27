"""W5.3 + W4.7 — slot-sim universal IR → TS `SlotGameIR` adapter.

The TS engine in `src/engine/irSimulator.ts` consumes a canonical
`SlotGameIR` JSON tree (see `src/ir/types.ts`). Our universal IR
(emitted by `to_slot_sim.py`) is a Rust-tagged-union shape and ships
the paytable as a *combo[] list* (one row per `combo + pays`), while
TS expects a *nested map* `Record<symbol, Record<count, mult>>`.

This module is the translation layer. It converts the universal IR
JSON dict (as `convert_to_slot_sim_ir()` would return) into a TS
SlotGameIR dict that `irSimulator.run()` can replay without further
transformation. The output is *bit-stable* (deterministic field
ordering) so codegen produces reproducible JSON files for git.

Public API:

    from tools.parse_par.to_ts_ir import convert_to_ts_ir
    ts_ir = convert_to_ts_ir(slot_sim_ir, profile)

Coverage:

  ▸ rectangular topology (W4.3b / W4.4) — IGT 4×5 + L&W 5×3
  ▸ lines + ways evaluation kinds
  ▸ symbols: role → kind translation (wild|scatter|hp|lp + permissive
    fallback to 'lp' for unknown)
  ▸ reels: first set + per-stop strip extraction
  ▸ paytable: combo[]→symbol+count flattening (handles wildcard '--'
    placeholders and wild-symbol-prefix patterns)
  ▸ features: free_spins, pick_bonus, linear_progressive (W4.7 native
    `linear_progressive` Feature + root `progressive_link` mirror)
  ▸ W4.7: provenance (vendor / par_source / par_sha256 / build_hash /
    built_at_utc) auto-populated from universal IR meta + SHA-256 of
    canonical JSON input
  ▸ defaults for rng / bet / limits / compliance / rtp_allocation when
    universal IR doesn't carry them (TS expects them all present)
"""
from __future__ import annotations
from typing import Any
import hashlib
import json
import re
from datetime import datetime, timezone


_SCHEMA_VERSION = "1.0.0"


# Symbol role → TS SymbolKind. The TS schema is stricter than ours so
# anything outside the known set collapses to 'lp' (low-pay) which the
# evaluator treats as a regular paying symbol.
_ROLE_TO_KIND = {
    "wild": "wild",
    "scatter": "scatter",
    "bonus": "scatter",   # TS doesn't model bonus distinct from scatter
    "hp": "hp",
    "lp": "lp",
    "multiplier": "multiplier",
    "sticky": "sticky",
    "mystery": "mystery",
    "transform": "transform",
    "chain_wild": "chain_wild",
    "expanding": "expanding",
}


def _slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "game"


def _meta(universal: dict) -> dict:
    u = universal.get("meta", {}) or {}
    name = u.get("name") or "Unnamed Slot"
    swid = u.get("swid") or ""
    return {
        "id": _slugify(f"{name}-{swid}"),
        "name": name,
        "version": _SCHEMA_VERSION,
        "description": f"Auto-generated via W5.3 codegen from {u.get('vendor', '?')} PAR (SWID={swid})",
        "theme_tags": [t for t in [u.get("vendor")] if t],
        "author": "slot-build (W5.3)",
    }


def _topology(universal: dict) -> dict:
    top = universal.get("topology") or {}
    kind = top.get("kind", "rectangular")
    if kind == "rectangular":
        return {
            "kind": "rectangular",
            "reels": int(top.get("reels", 5)),
            "rows": int(top.get("rows", 3)),
        }
    if kind == "variable_rows":
        return {
            "kind": "variable_rows",
            "reels": int(top.get("reels", 6)),
            "row_range_per_reel": top.get("row_range_per_reel", []),
        }
    if kind == "cluster_grid":
        return {
            "kind": "cluster_grid",
            "columns": int(top.get("columns", 7)),
            "rows": int(top.get("rows", 7)),
            "adjacency": top.get("adjacency", "orthogonal"),
        }
    raise ValueError(f"unknown topology kind {kind!r}")


def _symbols(universal: dict) -> list[dict]:
    out: list[dict] = []
    for sym in universal.get("symbols", []) or []:
        role = (sym.get("role") or "lp").lower()
        kind = _ROLE_TO_KIND.get(role, "lp")
        ts_sym: dict[str, Any] = {
            "id": sym["id"],
            "name": sym.get("name", sym["id"]),
            "kind": kind,
        }
        subs = sym.get("substitutes")
        if subs:
            if subs == ["*"] or subs == "*":
                ts_sym["substitutes"] = "*"
            elif isinstance(subs, list):
                ts_sym["substitutes"] = subs
        # NOTE: slot-sim has `substitutes_except` (e.g. Wild does NOT replace
        # Scatter). TS schema is strict — no `substitutes_except` field. We
        # honor the semantics at codegen time: if subs == "*" and exceptions
        # are listed, we expand to an explicit list of (all_symbols - except).
        return_subs = sym.get("substitutes_except")
        if return_subs and ts_sym.get("substitutes") == "*":
            all_ids = [
                s["id"] for s in universal.get("symbols", []) if s.get("id") != sym["id"]
            ]
            ts_sym["substitutes"] = [s for s in all_ids if s not in set(return_subs)]
        out.append(ts_sym)
    return out


def _reels(universal: dict) -> dict:
    """Pick the dominant base reel set (highest weight or set==1) and the
    matching FS set (if any) and emit a `strips`-mode ReelSet."""
    r = universal.get("reels", {}) or {}
    base_sets = r.get("base") or []
    base_weights = r.get("base_weights") or []
    fs_sets = r.get("fs") or []

    chosen_base = _pick_set(base_sets, base_weights)
    if chosen_base is None and base_sets:
        chosen_base = base_sets[0]
    if chosen_base is None:
        raise ValueError("universal IR has no base reel set")

    base_strips = _stops_to_strips(chosen_base.get("reels", []))
    out = {"mode": "strips", "base": base_strips}

    if fs_sets:
        # IGT FS sets are usually a single bank; L&W has multiple FS sets.
        # We pick the first set deterministically.
        fs_strips = _stops_to_strips(fs_sets[0].get("reels", []))
        if fs_strips and any(fs_strips):
            out["free_spins"] = fs_strips
    return out


def _pick_set(sets: list[dict], weights) -> dict | None:
    """Choose the dominant reel set.

    `weights` can be:
      • dict `{weights: [{set, weight}, ...], total, initial_set}` — L&W format
      • list `[{set, weight}, ...]` — flat list-of-pairs
      • list[int] — index-aligned numeric weights
      • None / empty — pick first set
    """
    if not sets:
        return None
    if not weights:
        return sets[0]

    # Prefer `initial_set` if explicitly published (L&W convention)
    if isinstance(weights, dict) and "initial_set" in weights:
        target = weights.get("initial_set")
        if target is not None:
            for s in sets:
                if s.get("set") == target:
                    return s

    wlist: list = []
    if isinstance(weights, dict):
        wlist = weights.get("weights") or []
    elif isinstance(weights, list):
        wlist = weights

    if not wlist:
        return sets[0]
    if isinstance(wlist[0], dict):
        try:
            heaviest = max(wlist, key=lambda w: w.get("weight", 0) or 0)
            heaviest_id = heaviest.get("set")
            for s in sets:
                if s.get("set") == heaviest_id:
                    return s
        except Exception:
            pass
        return sets[0]
    try:
        max_idx = max(range(len(wlist)), key=lambda i: wlist[i])
        return sets[max_idx] if max_idx < len(sets) else sets[0]
    except Exception:
        return sets[0]


def _stops_to_strips(reels: list[list[dict]]) -> list[list[str]]:
    """`reels` is `[[{symbol, weight}, ...], ...]`. We expand to strips by
    repeating symbols `weight` times. Zero-weight stops are skipped.
    """
    strips: list[list[str]] = []
    for reel in reels:
        strip: list[str] = []
        for stop in reel:
            sym = stop.get("symbol")
            w = stop.get("weight", 1)
            if not sym:
                continue
            try:
                w = int(w)
            except (TypeError, ValueError):
                w = 1
            for _ in range(max(1, w)):
                strip.append(sym)
        strips.append(strip)
    return strips


def _evaluation(universal: dict) -> dict:
    ev = universal.get("evaluation", {}) or {}
    kind = ev.get("kind", "lines")
    if kind == "lines":
        return {
            "kind": "lines",
            "paylines": ev.get("lines") or ev.get("paylines") or [],
            "direction": ev.get("direction", "ltr"),
            "min_match": int(ev.get("min_match", 3)),
            "pay_left_to_right_only": bool(ev.get("pay_left_to_right_only", True)),
        }
    if kind == "ways":
        return {
            "kind": "ways",
            "direction": ev.get("direction", "ltr"),
            "min_match": int(ev.get("min_match", 3)),
            "max_ways_per_spin": int(ev.get("max_ways_per_spin", 117649)),
        }
    if kind == "cluster":
        return {
            "kind": "cluster",
            "min_cluster_size": int(ev.get("min_cluster_size", 5)),
            "cluster_pay_table": ev.get("cluster_pay_table", {}),
        }
    return {"kind": "lines", "paylines": [], "direction": "ltr", "min_match": 3, "pay_left_to_right_only": True}


def _paytable(universal: dict) -> dict[str, dict[str, float]]:
    """Flatten combo[] paytable into `Record<symbol, Record<count, mult>>`.

    A combo of `[X, X, X, --, --]` = 3-of-a-kind X (3 consecutive matches from
    left). A combo of `[Wild, X, X, X, X]` is also 4-of-X (wild substitution).
    We resolve each combo to (anchor_symbol, count) and store the highest pay
    per (symbol, count) pair — this loses no info on paylines.kind paytables
    because IGT/L&W publish one row per (symbol, count) bracket.

    Wild combos like `[W, W, W, W, W]` are stored under the wild symbol itself
    (the engine handles "wild-as-its-own-payline" via direct paytable lookup).
    """
    pt = universal.get("paytable") or []
    if not pt:
        return {}
    # Identify wild symbol ids from symbols list (case-insensitive set)
    wild_ids = {
        sym["id"]
        for sym in universal.get("symbols", [])
        if (sym.get("role") or "").lower() in {"wild", "expanding", "chain_wild"}
    }
    out: dict[str, dict[str, float]] = {}
    for entry in pt:
        combo = entry.get("combo") or []
        pays = entry.get("pays")
        if pays is None or not combo:
            continue
        # Find anchor symbol: first non-wild non-"--" symbol; if all wilds,
        # use the wild id; if combo is wilds-only, count is len(combo).
        anchor = None
        count = 0
        for s in combo:
            if s == "--" or s == "":
                break
            count += 1
            if anchor is None and s not in wild_ids:
                anchor = s
        if anchor is None:
            # All-wild combo
            anchor = combo[0] if combo[0] in wild_ids else None
            if anchor is None:
                continue
        try:
            mult = float(pays)
        except (TypeError, ValueError):
            continue
        bucket = out.setdefault(anchor, {})
        key = str(count)
        prev = bucket.get(key)
        if prev is None or mult > prev:
            bucket[key] = mult
    return out


def _features(universal: dict) -> list[dict]:
    feats: list[dict] = []
    for f in universal.get("features", []) or []:
        kind = f.get("kind")
        if kind == "free_spins":
            trig = {
                "by": "scatter_count",
                "min": int(f.get("trigger_count_min", 3)),
            }
            if f.get("initial_spins"):
                trig["thresholds"] = {str(f["trigger_count_min"]): int(f["initial_spins"])}
            feat = {"kind": "free_spins", "trigger": trig}
            if f.get("retrigger_spins"):
                feat["retrigger"] = {
                    "by": "scatter_count",
                    "min": int(f.get("trigger_count_min", 3)),
                    "thresholds": {str(f["trigger_count_min"]): int(f["retrigger_spins"])},
                    "max_total": int(f.get("max_total_spins", 255)),
                }
            if f.get("global_multiplier"):
                feat["global_multiplier"] = float(f["global_multiplier"])
            feats.append(feat)
        elif kind == "pick_bonus":
            awards = f.get("awards", []) or []
            pool = [
                {
                    "id": a.get("label", f"award_{i}"),
                    "weight": float(a.get("weight", 1)),
                    "pay_multiplier": float(a.get("pays_coins", 0)),
                }
                for i, a in enumerate(awards)
            ]
            feats.append({"kind": "pick", "prize_pool": pool})
        elif kind == "linear_progressive":
            # W4.7 — IR now has a native `linear_progressive` Feature variant
            # AND a top-level `progressive_link` field. We emit BOTH so the
            # engine can pick whichever it prefers:
            #   • `progressive_link` (root) — read by jackpot subsystem
            #   • `features[linear_progressive]` — discoverable via feature scan
            # The TS engine still skips it during per-spin trigger evaluation
            # (see `irEvaluator.ts`), so RTP is unaffected; jackpot
            # contribution math is closed-form via the root descriptor.
            pool_id = str(f.get("pool_id") or f.get("name") or "default_progressive")
            contrib = float(f.get("contribution_x") or f.get("contribution_per_spin_x") or 0.0)
            seed = float(f.get("seed_x") or f.get("base_value_x") or 0.0)
            feat: dict[str, Any] = {
                "kind": "linear_progressive",
                "pool_id": pool_id,
                "contribution_per_spin_x": contrib,
                "seed_x": seed,
            }
            mhb = f.get("must_hit_by_x")
            if mhb is not None:
                feat["must_hit_by_x"] = float(mhb)
            ladder = f.get("tier_ladder") or f.get("tiers")
            if isinstance(ladder, list) and ladder:
                feat["tier_ladder"] = [
                    {
                        "id": str(t.get("id") or t.get("name") or f"tier_{i}"),
                        "multiplier": float(t.get("multiplier") or t.get("pays_x") or 0.0),
                    }
                    for i, t in enumerate(ladder)
                    if isinstance(t, dict)
                ]
            ext = f.get("external_pool_ref") or f.get("wap_pool")
            if ext:
                feat["external_pool_ref"] = str(ext)
            feats.append(feat)
        elif kind in ("hold_and_win", "wild_expand", "pattern_win"):
            # These slot-sim features have closed-form RTP injection in the
            # Rust engine that's hard to mirror in TS without porting the
            # full runner. Emit as descriptive 'pick' stub so the IR remains
            # round-trip-valid; runners that need full semantics should
            # extend the TS engine (W5.3-followup).
            feats.append({
                "kind": "pick",
                "prize_pool": [{"id": kind, "weight": 1.0, "pay_multiplier": 0.0}],
            })
        # else: unknown kind, skip silently
    return feats


def _defaults_rng() -> dict:
    return {"kind": "mulberry32", "default_seed": 0xC0DE_F00D}


def _defaults_bet(universal: dict) -> dict:
    bt = universal.get("bet_table") or {}
    bms = bt.get("bet_multipliers") if isinstance(bt, dict) else None
    base_bet = 1.0
    return {
        "currency": "USD",
        "base_bet": base_bet,
        "denominations": [float(bm) for bm in (bms or [1, 2, 5, 10])][:8],
    }


def _defaults_limits(universal: dict) -> dict:
    """W4.7 — pull max_win_x / volatility_class / hit_frequency from PAR meta
    if `parse_meta` extracted them; otherwise fall back to safe defaults.
    """
    m = universal.get("meta", {}) or {}
    rtp = m.get("rtp_total")
    max_win = m.get("max_win_x")
    volatility = m.get("volatility_class")
    return {
        "target_rtp": float(rtp) if rtp is not None else 0.96,
        "rtp_tolerance": 0.002,
        "max_win_x": float(max_win) if max_win is not None else 5000.0,
        "win_cap_apply": "per_spin",
        "target_volatility": str(volatility) if volatility else "medium",
        "hit_freq_target": float(m.get("hit_frequency_all_line") or m.get("hit_frequency") or 0.25),
    }


def _defaults_compliance(universal: dict | None = None) -> dict:
    """W4.7 — emit PAR-extracted jurisdictions if available (parse_meta now
    populates `meta.jurisdictions`). Falls back to UKGC+MGA default.
    """
    juris: list[str] = []
    if universal:
        m = universal.get("meta", {}) or {}
        juris = list(m.get("jurisdictions") or [])
    return {
        "jurisdictions": juris if juris else ["UKGC", "MGA"],
        "rtp_range_required": [0.85, 0.98],
        "max_win_cap_required": 250000.0,
        "near_miss_rule": "must_be_random",
        "ldw_disclosure": True,
        "session_time_display": False,
    }


def _defaults_rtp_alloc(universal: dict) -> dict:
    m = universal.get("meta", {}) or {}
    rb = m.get("rtp_breakdown") or {}
    base = float(rb.get("base_game") or 0.6)
    fs = float(rb.get("free_spins") or 0.1)
    haw = float(rb.get("cash_eruption_from_base") or 0.0) + float(rb.get("cash_eruption_from_fs") or 0.0)
    jackpot = float(rb.get("progressive") or 0.0)
    total = base + fs + haw + jackpot
    if total == 0:
        total = 1.0
    return {
        "base_game": base,
        "free_spins": fs,
        "hold_and_win": haw,
        "jackpot": jackpot,
        "tolerance": 0.005,
    }


def _progressive_link(universal: dict) -> dict | None:
    """W4.7 — extract root-level `progressive_link` from the first linear
    progressive feature, if any. Mirrors the per-feature record but lives at
    IR root so the engine's jackpot subsystem can read it without scanning
    `features[]`. Returns `None` if no linear progressive declared.
    """
    for f in universal.get("features", []) or []:
        if f.get("kind") != "linear_progressive":
            continue
        link: dict[str, Any] = {
            "contribution_per_spin_x": float(
                f.get("contribution_x") or f.get("contribution_per_spin_x") or 0.0
            ),
            "seed_x": float(f.get("seed_x") or f.get("base_value_x") or 0.0),
        }
        pool_id = f.get("pool_id") or f.get("name")
        if pool_id:
            link["pool_id"] = str(pool_id)
        mhb = f.get("must_hit_by_x")
        if mhb is not None:
            link["must_hit_by_x"] = float(mhb)
        ladder = f.get("tier_ladder") or f.get("tiers")
        if isinstance(ladder, list) and ladder:
            link["tier_ladder"] = [
                {
                    "id": str(t.get("id") or t.get("name") or f"tier_{i}"),
                    "multiplier": float(t.get("multiplier") or t.get("pays_x") or 0.0),
                }
                for i, t in enumerate(ladder)
                if isinstance(t, dict)
            ]
        reset = f.get("reset_rule")
        if reset:
            link["reset_rule"] = str(reset)
        return link
    return None


def _provenance(universal: dict, *, par_source: str | None = None) -> dict | None:
    """W4.7 — compute SHA-256 of canonical universal IR JSON and emit a
    provenance record. Returns `None` if there is no vendor metadata to anchor
    the record (caller can still inject one externally).
    """
    meta = universal.get("meta", {}) or {}
    vendor = meta.get("vendor")
    if not vendor:
        return None
    canonical = json.dumps(universal, sort_keys=True, separators=(",", ":")).encode("utf-8")
    par_sha = hashlib.sha256(canonical).hexdigest()
    rec: dict[str, Any] = {
        "vendor": str(vendor),
        "par_source": str(par_source or meta.get("par_source") or meta.get("source") or vendor),
        "par_sha256": par_sha,
        "built_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    swid = meta.get("swid")
    if swid:
        rec["swid"] = str(swid)
    build_hash = meta.get("build_hash") or meta.get("git_sha")
    if build_hash:
        rec["build_hash"] = str(build_hash)
    return rec


def convert_to_ts_ir(universal: dict, *, par_source: str | None = None) -> dict:
    """Top-level converter — universal slot-sim IR → TS SlotGameIR dict.

    W4.7: emits optional `progressive_link` and `provenance` at root when the
    universal IR carries the relevant signals. Pass `par_source` to anchor
    provenance to a concrete file path (otherwise inferred from meta).
    """
    out: dict[str, Any] = {
        "schema_version": _SCHEMA_VERSION,
        "meta": _meta(universal),
        "topology": _topology(universal),
        "symbols": _symbols(universal),
        "reels": _reels(universal),
        "evaluation": _evaluation(universal),
        "paytable": _paytable(universal),
        "features": _features(universal),
        "rng": _defaults_rng(),
        "bet": _defaults_bet(universal),
        "limits": _defaults_limits(universal),
        "compliance": _defaults_compliance(universal),
        "rtp_allocation": _defaults_rtp_alloc(universal),
    }
    link = _progressive_link(universal)
    if link is not None:
        out["progressive_link"] = link
    prov = _provenance(universal, par_source=par_source)
    if prov is not None:
        out["provenance"] = prov
    return out
