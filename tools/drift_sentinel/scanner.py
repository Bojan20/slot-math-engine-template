"""Per-IR fingerprint + Bernoulli RTP estimate.

The fingerprint hashes a stable canonical subset of the IR — the
parts that, when changed, indicate a math-affecting modification.
Volatile fields (timestamps, source paths, ad-hoc notes) are
explicitly excluded so the sentinel doesn't churn on metadata-only
edits.

Handles BOTH IR shapes the repo uses:
  • Universal IR (`reels.base = [[sym, ...], ...]`)
  • Vendor IR (`bg_reel_sets = [{set: 1, reels: [[{symbol, weight}, …], …]}]`)
"""
from __future__ import annotations
import hashlib
import json
from typing import Any


# ─── canonical projection ──────────────────────────────────────────


def _flatten_reel(reel: Any) -> list[str]:
    """Return a list of symbol ids regardless of cell shape."""
    out: list[str] = []
    if not isinstance(reel, (list, tuple)):
        return out
    for cell in reel:
        if isinstance(cell, str):
            out.append(cell)
        elif isinstance(cell, dict):
            sym = cell.get("symbol") or cell.get("id") or cell.get("name")
            if isinstance(sym, str):
                out.append(sym)
        elif isinstance(cell, (list, tuple)) and cell:
            out.append(str(cell[0]))
    return out


def _extract_reels(ir: dict[str, Any]) -> list[list[str]]:
    """Return base-game reel strips as list[list[str]] regardless of IR
    shape."""
    # Universal IR: ir.reels.base = [[sym, ...], ...]
    reels = ir.get("reels")
    if isinstance(reels, dict):
        base = reels.get("base")
        if isinstance(base, list) and all(isinstance(r, list) for r in base):
            return [_flatten_reel(r) for r in base]
    # Vendor IR: ir.bg_reel_sets[0].reels = [...]
    bg = ir.get("bg_reel_sets") or []
    if isinstance(bg, list) and bg:
        first = bg[0]
        if isinstance(first, dict) and isinstance(first.get("reels"), list):
            return [_flatten_reel(r) for r in first["reels"]]
    return []


def _extract_paytable(ir: dict[str, Any]) -> list[tuple]:
    """Return paytable as a sorted tuple list keyed by (combo, pays)."""
    pt = ir.get("paytable") or []
    if not isinstance(pt, list):
        return []
    out: list[tuple] = []
    for entry in pt:
        if not isinstance(entry, dict):
            continue
        combo = entry.get("combo") or entry.get("symbols") or []
        if isinstance(combo, (list, tuple)):
            combo_t = tuple(str(c) for c in combo)
        else:
            combo_t = (str(combo),)
        try:
            pay = float(entry.get("pays")
                        or entry.get("pay")
                        or 0)
        except (TypeError, ValueError):
            pay = 0.0
        cs = entry.get("cluster_size")
        out.append((combo_t, pay, cs))
    out.sort(key=lambda t: (t[0], t[1], t[2] if t[2] is not None else -1))
    return out


def canonical_projection(ir: dict[str, Any]) -> dict[str, Any]:
    """Return the math-affecting subset of `ir` used for fingerprinting."""
    meta = ir.get("meta") or {}
    return {
        "vendor": meta.get("vendor"),
        "swid": meta.get("swid"),
        "topology": ir.get("topology") or {
            "reels": meta.get("reels"),
            "rows": meta.get("rows"),
        },
        "paytable": [
            {"combo": list(c), "pays": p,
             "cluster_size": cs}
            for (c, p, cs) in _extract_paytable(ir)
        ],
        "reels_base": _extract_reels(ir),
        "features": _normalize_features(ir.get("features")),
    }


def _normalize_features(feats: Any) -> list[str]:
    if not feats:
        return []
    if isinstance(feats, dict):
        return sorted(str(k) for k in feats.keys())
    if isinstance(feats, list):
        kinds: list[str] = []
        for f in feats:
            if isinstance(f, dict):
                k = f.get("kind") or f.get("type")
                if k:
                    kinds.append(str(k))
        return sorted(kinds)
    return []


# ─── fingerprint + RTP estimate ────────────────────────────────────


def fingerprint(ir: dict[str, Any]) -> str:
    """Stable SHA-256 hex of the canonical projection."""
    proj = canonical_projection(ir)
    payload = json.dumps(proj, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def bernoulli_rtp_estimate(ir: dict[str, Any]) -> float | None:
    """Order-of-magnitude RTP estimate from first base reel set ×
    paytable. Returns None when reels or paytable are missing.

    Per-line approximation: for each (combo, pays) entry, multiplies
    per-cell symbol frequencies along the match prefix and weights by
    `pays`. Sum across all combos approximates total line-game RTP."""
    reels = _extract_reels(ir)
    if not reels or not any(reels):
        return None

    p_per_reel: list[dict[str, float]] = []
    for reel in reels:
        if not reel:
            p_per_reel.append({})
            continue
        c: dict[str, int] = {}
        for cell in reel:
            c[cell] = c.get(cell, 0) + 1
        n = len(reel)
        p_per_reel.append({k: v / n for k, v in c.items()})

    pt = _extract_paytable(ir)
    if not pt:
        return None

    total = 0.0
    for combo_t, pay, _cs in pt:
        if pay <= 0 or not combo_t:
            continue
        first_sym = combo_t[0]
        if not first_sym or first_sym in ("--", "-", ""):
            continue
        # run length from left while same symbol
        run = 0
        for x in combo_t:
            if x == first_sym:
                run += 1
            else:
                break
        if run < 3:
            continue
        prob = 1.0
        for r_idx in range(run):
            if r_idx >= len(p_per_reel):
                prob = 0.0
                break
            prob *= p_per_reel[r_idx].get(first_sym, 0.0)
        if prob > 0:
            total += prob * pay
    return total
