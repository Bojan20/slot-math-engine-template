"""PHASE 38 — IR inspector HTML emitter."""

from __future__ import annotations

import hashlib
import html
import json
from fractions import Fraction
from typing import Any


def _canonical_hash(ir: dict[str, Any]) -> str:
    canon = json.dumps(ir, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canon).hexdigest()


def _esc(s: Any) -> str:
    return html.escape(str(s))


def _reel_freqs(reels_block: dict) -> list[dict[str, Fraction]]:
    base = reels_block.get("base") if isinstance(reels_block, dict) else None
    if not isinstance(base, list) or not base:
        return []
    first = base[0]
    reels = first.get("reels") if isinstance(first, dict) else None
    if not isinstance(reels, list):
        return []
    out = []
    for reel in reels:
        weights: dict[str, int] = {}
        total = 0
        if isinstance(reel, list):
            for cell in reel:
                if isinstance(cell, dict):
                    sym = str(cell.get("symbol", ""))
                    w = int(cell.get("weight", 1))
                else:
                    sym = str(cell)
                    w = 1
                weights[sym] = weights.get(sym, 0) + w
                total += w
        if total == 0:
            out.append({})
            continue
        out.append({k: Fraction(v, total) for k, v in weights.items()})
    return out


def _bernoulli_rtp(ir: dict[str, Any], reel_freqs: list[dict[str, Fraction]]) -> float:
    paytable = ir.get("paytable") or []
    rtp = Fraction(0)
    for entry in paytable:
        if not isinstance(entry, dict):
            continue
        combo = entry.get("combo")
        pay = entry.get("pays") or entry.get("pay") or 0
        if not isinstance(combo, list) or not isinstance(pay, (int, float)):
            continue
        p = Fraction(1)
        for i, sym in enumerate(combo):
            if i >= len(reel_freqs):
                p = Fraction(0)
                break
            if sym in ("--", "*", "", None):
                continue
            f = reel_freqs[i].get(str(sym), Fraction(0))
            if f == 0:
                p = Fraction(0)
                break
            p *= f
        try:
            pay_frac = Fraction(pay).limit_denominator(10**9)
        except (OverflowError, ValueError):
            pay_frac = Fraction(0)
        rtp += p * pay_frac
    try:
        return float(rtp)
    except (OverflowError, ZeroDivisionError):
        return 0.0


def emit_inspector_html(ir: dict[str, Any]) -> str:
    """Emit a self-contained HTML inspector page."""
    meta = ir.get("meta") or {}
    topo = ir.get("topology") or {}
    paytable = ir.get("paytable") or []
    features = ir.get("features") or []
    reels_block = ir.get("reels") or {}
    freqs = _reel_freqs(reels_block)
    rtp = _bernoulli_rtp(ir, freqs)
    ir_hash = _canonical_hash(ir)

    style = """
      body { font-family: -apple-system, system-ui, sans-serif;
              background: #0d1117; color: #c9d1d9; padding: 24px; }
      h1 { color: #58a6ff; margin-top: 0; }
      h2 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 4px; }
      table { border-collapse: collapse; margin: 8px 0; }
      th, td { padding: 4px 12px; border-bottom: 1px solid #30363d;
                text-align: left; font-size: 13px; }
      th { color: #8b949e; font-weight: 500; }
      .stat { display: inline-block; background: #161b22; border: 1px solid #30363d;
               border-radius: 6px; padding: 8px 14px; margin-right: 12px; }
      .stat .label { color: #8b949e; font-size: 11px; text-transform: uppercase; }
      .stat .value { font-size: 18px; font-weight: 600; color: #58a6ff; }
      code { background: #161b22; padding: 2px 6px; border-radius: 4px;
              font-family: SF Mono, monospace; font-size: 12px; }
    """

    out: list[str] = []
    out.append("<!doctype html>")
    out.append("<html><head><meta charset='utf-8'>")
    out.append(f"<title>Slot Math Inspector — {_esc(meta.get('name', 'Game'))}</title>")
    out.append(f"<style>{style}</style></head><body>")
    out.append(f"<h1>Slot Math Inspector — {_esc(meta.get('name', 'Game'))}</h1>")

    # Stats strip
    out.append("<div>")
    out.append(f"<div class='stat'><div class='label'>Target RTP</div>"
                f"<div class='value'>{_esc(meta.get('target_rtp', '—'))}</div></div>")
    out.append(f"<div class='stat'><div class='label'>Closed-form RTP</div>"
                f"<div class='value'>{rtp:.6f}</div></div>")
    out.append(f"<div class='stat'><div class='label'>Reels × Rows</div>"
                f"<div class='value'>{_esc(topo.get('reels', '?'))}×{_esc(topo.get('rows', '?'))}</div></div>")
    out.append(f"<div class='stat'><div class='label'>Paytable rows</div>"
                f"<div class='value'>{len(paytable)}</div></div>")
    out.append(f"<div class='stat'><div class='label'>Features</div>"
                f"<div class='value'>{len(features)}</div></div>")
    out.append("</div>")

    # Reel frequencies
    out.append("<h2>Per-reel symbol frequencies (rational)</h2>")
    out.append("<table><tr><th>Reel</th><th>Frequencies</th></tr>")
    for i, d in enumerate(freqs):
        parts = ", ".join(f"<code>{_esc(k)}: {_esc(v)}</code>"
                            for k, v in sorted(d.items()))
        out.append(f"<tr><td>{i}</td><td>{parts}</td></tr>")
    out.append("</table>")

    # Paytable
    out.append("<h2>Paytable</h2>")
    out.append("<table><tr><th>#</th><th>Combo</th><th>Pays</th><th>Scope</th></tr>")
    for i, e in enumerate(paytable):
        if not isinstance(e, dict):
            continue
        combo = " ".join(_esc(s) for s in (e.get("combo") or []))
        pays = _esc(e.get("pays", e.get("pay", "")))
        scope = _esc(e.get("scope", ""))
        out.append(f"<tr><td>{i}</td><td><code>{combo}</code></td>"
                    f"<td>{pays}</td><td>{scope}</td></tr>")
    out.append("</table>")

    # Features
    if features:
        out.append("<h2>Features</h2>")
        out.append("<table><tr><th>#</th><th>Kind</th><th>Params</th></tr>")
        for i, f in enumerate(features):
            if not isinstance(f, dict):
                continue
            kind = _esc(f.get("kind", "?"))
            params = ", ".join(
                f"<code>{_esc(k)}={_esc(v)}</code>"
                for k, v in f.items() if k != "kind"
            )
            out.append(f"<tr><td>{i}</td><td>{kind}</td><td>{params}</td></tr>")
        out.append("</table>")

    # Tamper-evidence
    out.append("<h2>Tamper-evidence</h2>")
    out.append(f"<p>Canonical SHA-256: <code>{ir_hash}</code></p>")
    out.append("</body></html>")
    return "\n".join(out)
