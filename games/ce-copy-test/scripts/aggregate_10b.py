#!/usr/bin/env python3
"""CE COPY TEST — 10B verification aggregator.

Parses `reports/10b/ce-10b.<swid>.log` (output of `ce-sim --spins 10000000000`)
and produces a single Markdown + JSON report comparing every PAR_100spins
metric (cert summary tab) against the 10B sim result. Verdict per metric:
  - ✅ within 0.1 % of Excel
  - 🟡 within 0.5 % of Excel
  - ❌ above 0.5 %

Output:
  - reports/par-verification-10b.md
  - reports/par-verification-10b.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "reports" / "10b"
OUT_MD = ROOT / "reports" / "par-verification-10b.md"
OUT_JSON = ROOT / "reports" / "par-verification-10b.json"

SWIDS = ["200-1637-001", "200-1637-002", "200-1637-003"]

# Excel targets per PAR_100spins + PAR-001 row 1..3 summary
TARGETS = {
    "200-1637-001": {
        "total_rtp": 0.960000018370437,
        "base_game_rtp": 0.419000003813447,
        "ce_from_base_rtp": 0.409104936666577,
        "free_spins_rtp_total": 0.0700000107591113 + 0.0618950673666612,
        "ce_from_fs_rtp": 0.0618950673666612,
        "hit_freq": 0.19030599,
        "win_freq": 0.08936075,
        "fs_trigger_one_in": 139.9,
        "ce_base_trigger_one_in": 120.8,
        "ce_fs_trigger_one_in": 468.99,
        "avg_ce_win_base": 49.42,
        "avg_ce_win_fs": 29.03,
        "avg_fs_bonus": 9.79,
        "wins_10x_one_in": 52,
        "wins_20x_one_in": 91,
        "wins_50x_one_in": 307,
        "wins_100x_one_in": 631,
        "wins_200x_one_in": 30048,
        "wins_500x_one_in": 61652,
        "grand_one_in": 4986475,
    },
    "200-1637-002": {
        "total_rtp": 0.950000015007889,
        "base_game_rtp": None,  # PAR-002 base game RTP from L68
        "ce_from_base_rtp": None,
        "free_spins_rtp_total": None,
        "ce_from_fs_rtp": None,
        "hit_freq": 0.1902107,
        "win_freq": None,
        "fs_trigger_one_in": 139.9,
        "ce_base_trigger_one_in": 120.8,
        "ce_fs_trigger_one_in": 468.99,
        "grand_one_in": 4986475,
    },
    "200-1637-003": {
        "total_rtp": 0.931000016534967,
        "base_game_rtp": None,
        "ce_from_base_rtp": None,
        "free_spins_rtp_total": None,
        "ce_from_fs_rtp": None,
        "hit_freq": 0.19066094,
        "win_freq": None,
        "fs_trigger_one_in": 139.9,
        "ce_base_trigger_one_in": 120.8,
        "ce_fs_trigger_one_in": 468.99,
        "grand_one_in": 4986475,
    },
}


def parse_log(path: Path) -> dict:
    text = path.read_text()
    out = {}
    # Spins, elapsed, throughput
    m = re.search(r"Spins:\s+(\d+)", text)
    if m:
        out["spins"] = int(m.group(1))
    m = re.search(r"Spins/sec:\s+(\d+)", text)
    if m:
        out["spins_per_sec"] = int(m.group(1))
    m = re.search(r"Elapsed:\s+([0-9.]+)([a-z]+)", text)
    if m:
        out["elapsed"] = m.group(0).removeprefix("Elapsed:").strip()
    # RTP breakdown
    patterns = {
        "base_game_rtp": r"Base game RTP\s+:\s+([0-9.]+)",
        "ce_from_base_rtp": r"CE from base RTP\s+:\s+([0-9.]+)",
        "free_spins_rtp_total": r"Free Spins RTP\s+:\s+([0-9.]+)",
        "fs_lines": r"FS line wins\s+:\s+([0-9.]+)",
        "fs_big_volcano": r"FS Big Volcano\s+:\s+([0-9.]+)",
        "ce_from_fs_rtp": r"CE from FS\s+:\s+([0-9.]+)",
        "total_rtp": r"Total RTP\s+:\s+([0-9.]+)",
        "hit_freq": r"Hit freq\s+:\s+([0-9.]+)",
        "win_freq": r"Win freq\s+:\s+([0-9.]+)",
    }
    for k, p in patterns.items():
        m = re.search(p, text)
        if m:
            out[k] = float(m.group(1))
    # Triggers
    for k, lbl in [
        ("fs_trigger_one_in", "Free Spins trigger 1 in"),
        ("ce_base_trigger_one_in", "Cash Eruption base 1 in"),
        ("ce_fs_trigger_one_in", "Cash Eruption FS 1 in"),
    ]:
        m = re.search(re.escape(lbl) + r"\s*:\s+([0-9.]+)", text)
        if m:
            out[k] = float(m.group(1))
    m = re.search(r"GRAND hits\s+:\s+(\d+)", text)
    if m:
        out["grand_hits"] = int(m.group(1))
        if out.get("spins"):
            out["grand_one_in"] = out["spins"] / out["grand_hits"] if out["grand_hits"] > 0 else float("inf")
    # Average feature wins
    m = re.search(r"Avg CE win \(base\)\s+:\s+([0-9.]+)", text)
    if m:
        out["avg_ce_win_base"] = float(m.group(1))
    m = re.search(r"Avg CE win \(FS\)\s+:\s+([0-9.]+)", text)
    if m:
        out["avg_ce_win_fs"] = float(m.group(1))
    m = re.search(r"Avg Free Spins bonus\s+:\s+([0-9.]+)", text)
    if m:
        out["avg_fs_bonus"] = float(m.group(1))
    # Volatility buckets
    for k, lbl in [
        ("wins_10x_one_in", "10x+"),
        ("wins_20x_one_in", "20x+"),
        ("wins_50x_one_in", "50x+"),
        ("wins_100x_one_in", "100x+"),
        ("wins_200x_one_in", "200x+"),
        ("wins_500x_one_in", "500x+"),
    ]:
        m = re.search(re.escape(lbl) + r"\s+1 in\s+([0-9.]+)", text)
        if m:
            out[k] = float(m.group(1))
    m = re.search(r"Max single spin \(x\)\s+:\s+([0-9.]+)", text)
    if m:
        out["max_single_x"] = float(m.group(1))
    return out


def verdict_pct(sim_val, target):
    if sim_val is None or target is None:
        return "?", None
    if target == 0:
        return "?", None
    diff = (sim_val - target) / target * 100.0
    if abs(diff) < 0.1:
        return "✅", diff
    elif abs(diff) < 0.5:
        return "🟡", diff
    else:
        return "❌", diff


def main():
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    md_lines = [
        "# CE COPY TEST — 10B spinova verifikacioni izveštaj",
        "",
        "## Cilj",
        "Svaki broj iz PAR_100spins cert summary taba (Cash Eruption Excel)",
        "validovan kroz 10 milijardi simulisanih spinova po SWID-u na bet",
        "multiplier-u 1.",
        "",
    ]
    all_json = {}
    for swid in SWIDS:
        log = LOG_DIR / f"ce-10b.{swid}.log"
        if not log.exists():
            md_lines.append(f"## {swid} — ⏳ PENDING (log nedostaje: `{log}`)\n")
            continue
        sim = parse_log(log)
        tgt = TARGETS.get(swid, {})
        all_json[swid] = {"sim": sim, "targets": tgt, "verdicts": {}}
        md_lines.append(f"## {swid} — {sim.get('spins', '?')} spinova @ {sim.get('spins_per_sec', '?')} spins/sec, {sim.get('elapsed', '?')}")
        md_lines.append("")
        md_lines.append("| Metrika | Sim (10B) | Excel target | Δ % | Status |")
        md_lines.append("|---|---:|---:|---:|:---:|")
        for k in [
            "total_rtp",
            "base_game_rtp",
            "ce_from_base_rtp",
            "free_spins_rtp_total",
            "ce_from_fs_rtp",
            "hit_freq",
            "win_freq",
            "fs_trigger_one_in",
            "ce_base_trigger_one_in",
            "ce_fs_trigger_one_in",
            "avg_ce_win_base",
            "avg_ce_win_fs",
            "avg_fs_bonus",
            "wins_10x_one_in",
            "wins_20x_one_in",
            "wins_50x_one_in",
            "wins_100x_one_in",
            "wins_200x_one_in",
            "wins_500x_one_in",
            "grand_one_in",
        ]:
            sim_v = sim.get(k)
            tgt_v = tgt.get(k)
            sym, diff = verdict_pct(sim_v, tgt_v)
            all_json[swid]["verdicts"][k] = {"sim": sim_v, "target": tgt_v, "diff_pct": diff, "status": sym}
            sim_s = f"{sim_v:.6f}" if isinstance(sim_v, float) and sim_v < 10 else (f"{sim_v:.2f}" if isinstance(sim_v, float) else str(sim_v))
            tgt_s = f"{tgt_v:.6f}" if isinstance(tgt_v, float) and tgt_v < 10 else (f"{tgt_v:.2f}" if isinstance(tgt_v, float) else str(tgt_v))
            diff_s = f"{diff:+.4f} %" if diff is not None else "n/a"
            md_lines.append(f"| **{k}** | {sim_s} | {tgt_s} | {diff_s} | {sym} |")
        md_lines.append("")
        md_lines.append(f"_Max single spin: {sim.get('max_single_x', '?')}× — GRAND hits: {sim.get('grand_hits', 0)}_")
        md_lines.append("")
    OUT_MD.write_text("\n".join(md_lines))
    OUT_JSON.write_text(json.dumps(all_json, indent=2, ensure_ascii=False))
    print(f"→ {OUT_MD}")
    print(f"→ {OUT_JSON}")


if __name__ == "__main__":
    main()
