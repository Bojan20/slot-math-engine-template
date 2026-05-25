#!/usr/bin/env python3
"""CE COPY TEST — bet-mult sweep aggregator.

Parses `reports/sweep-bet-mult/<swid>-bm<N>.log` and produces a single
matrix MD + JSON report. Each cell holds RTP / hit_freq / win_freq /
ce_trigger frequencies for that (SWID, bet-mult) pair.

The Excel PAR sheet only publishes bet-mult=1 targets, so this report
focuses on **cross-bet-mult invariance**:

  - CE feature RTP komponente (ce_from_base, ce_from_fs) treba da budu
    invarijantne po bet-mult-u (CE pool is normalized per total bet).
  - FS RTP komponente treba da budu invarijantne.
  - Total RTP per SWID treba da bude ista konstanta za sve bet-mult-ove
    (osim numeričke MC variance).

Verdict:
  - ✅ relative spread (max-min)/mean < 0.05 % across bet-mults
  - 🟡 spread < 0.2 %
  - ❌ spread ≥ 0.2 %

Args (positional):
  1. CSV SWIDs (e.g. "200-1637-001,200-1637-002")
  2. CSV bet-mults (e.g. "1,2,5,10")
"""

from __future__ import annotations

import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "reports" / "sweep-bet-mult"
OUT_MD = LOG_DIR / "MATRIX.md"
OUT_JSON = LOG_DIR / "MATRIX.json"

if len(sys.argv) >= 3:
    SWIDS = sys.argv[1].split(",")
    BMS = [int(x) for x in sys.argv[2].split(",")]
else:
    SWIDS = ["200-1637-001", "200-1637-002", "200-1637-003"]
    BMS = [1, 2, 5, 10]


PATTERNS = {
    "total_rtp": r"Total RTP\s+:\s+([0-9.]+)",
    "base_game_rtp": r"Base game RTP\s+:\s+([0-9.]+)",
    "ce_from_base_rtp": r"CE from base RTP\s+:\s+([0-9.]+)",
    "free_spins_rtp_total": r"Free Spins RTP\s+:\s+([0-9.]+)",
    "ce_from_fs_rtp": r"CE from FS\s+:\s+([0-9.]+)",
    "hit_freq": r"Hit freq\s+:\s+([0-9.]+)",
    "win_freq": r"Win freq\s+:\s+([0-9.]+)",
    "fs_trigger_one_in": r"Free Spins trigger 1 in\s*:\s+([0-9.]+)",
    "ce_base_trigger_one_in": r"Pattern-CE base 1 in\s*:\s+([0-9.]+)",
    "ce_fs_trigger_one_in": r"Pattern-CE FS 1 in\s*:\s+([0-9.]+)",
    "avg_ce_win_base": r"Avg CE win \(base\)\s+:\s+([0-9.]+)",
    "avg_ce_win_fs": r"Avg CE win \(FS\)\s+:\s+([0-9.]+)",
    "avg_fs_bonus": r"Avg Free Spins bonus\s+:\s+([0-9.]+)",
}


def parse_log(path: Path) -> dict:
    if not path.exists():
        return {}
    txt = path.read_text()
    out: dict = {}
    m = re.search(r"Spins:\s+(\d+)", txt)
    if m:
        out["spins"] = int(m.group(1))
    m = re.search(r"Spins/sec:\s+(\d+)", txt)
    if m:
        out["spins_per_sec"] = int(m.group(1))
    m = re.search(r"Elapsed:\s+(\S+)", txt)
    if m:
        out["elapsed"] = m.group(1)
    for k, p in PATTERNS.items():
        m = re.search(p, txt)
        if m:
            out[k] = float(m.group(1))
    return out


def spread_pct(values: list[float]) -> float:
    """Relative spread (max - min) / mean in percent."""
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return 0.0
    mn, mx = min(vals), max(vals)
    me = statistics.fmean(vals)
    if me == 0:
        return 0.0
    return (mx - mn) / me * 100.0


def verdict(spread: float) -> str:
    if spread < 0.05:
        return "✅"
    if spread < 0.2:
        return "🟡"
    return "❌"


def main() -> None:
    data: dict[str, dict[int, dict]] = {}
    for swid in SWIDS:
        data[swid] = {}
        for bm in BMS:
            log_path = LOG_DIR / f"{swid}-bm{bm}.log"
            data[swid][bm] = parse_log(log_path)

    md_lines = [
        "# CE COPY TEST — bet-mult sweep matrix",
        "",
        f"- Spinova per cell: prvi log @ `{LOG_DIR}/SWEEP.log`",
        f"- SWIDs: `{', '.join(SWIDS)}`",
        f"- Bet-mults: `{', '.join(str(b) for b in BMS)}`",
        "",
        "## Cilj",
        "Cross-bet-mult observability. Excel PAR objavljuje target-e samo",
        "za bet-mult=1, pa za bet-mult>1 nemamo ground truth. Ova matrica",
        "služi za:",
        "  1. **Observability** — per bet-mult RTP komponente vidiš na klik",
        "  2. **Regression-check** — ako se neki bet-mult drastično pomeri",
        "     između git revizija, biće vidljivo u diff-u",
        "  3. **CE pool sanity** — bet-mult-specifične CE prize pool tabele",
        "     daju različite ce_from_base_rtp / ce_from_fs_rtp komponente,",
        "     dok base_game_rtp ostaje konstantan (BG je BM-invariant).",
        "",
        "### Šta je očekivano",
        "- `base_game_rtp`, `hit_freq`, `win_freq` → invariant po BM (✅ spread < 0.05 %)",
        "- `ce_from_base_rtp`, `ce_from_fs_rtp` → variraju po BM (CE pool scaling)",
        "- `fs_trigger_one_in`, `ce_*_trigger_one_in` → invariant po BM",
        "  (trigger probabilities su feature-only, ne BM-dependent)",
        "",
        "### Verdict legenda (samo za BM-invariant metrike)",
        "- ✅ spread `(max-min)/mean` < 0.05 %",
        "- 🟡 spread < 0.2 %",
        "- ❌ spread ≥ 0.2 % — istraži regression",
        "- _n/a_ — BM-specific metrika (CE pool); spread je informacija, ne verdict",
        "",
    ]

    # Metrike koje su BM-invariant (trigger probabilities + base game) — over te
    # verdict ima smisao. CE pool i FS RTP varijaju s BM-om, pa za njih verdict
    # nije smislen bez per-BM Excel target-a.
    BM_INVARIANT = {
        "base_game_rtp",
        "hit_freq",
        "win_freq",
        "fs_trigger_one_in",
        "ce_base_trigger_one_in",
        "ce_fs_trigger_one_in",
    }

    json_out: dict = {}
    for swid in SWIDS:
        md_lines.append(f"## {swid}")
        md_lines.append("")
        header = ["Metrika"] + [f"bm={bm}" for bm in BMS] + ["spread %", "verdict"]
        md_lines.append("| " + " | ".join(header) + " |")
        md_lines.append("|" + "|".join(["---"] * len(header)) + "|")
        swid_json: dict = {"cells": {bm: data[swid][bm] for bm in BMS}, "spreads": {}}
        for metric in PATTERNS.keys():
            row_vals = [data[swid][bm].get(metric) for bm in BMS]
            row = ["**" + metric + "**"]
            for v in row_vals:
                row.append(f"{v:.6f}" if isinstance(v, float) and v < 10 else (f"{v:.2f}" if isinstance(v, float) else "—"))
            sp = spread_pct([v for v in row_vals if v is not None])
            row.append(f"{sp:.4f} %")
            row.append(verdict(sp) if metric in BM_INVARIANT else "_n/a_")
            md_lines.append("| " + " | ".join(row) + " |")
            swid_json["spreads"][metric] = {
                "values": row_vals,
                "spread_pct": sp,
                "verdict": verdict(sp) if metric in BM_INVARIANT else None,
                "bm_invariant": metric in BM_INVARIANT,
            }
        md_lines.append("")
        json_out[swid] = swid_json

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("\n".join(md_lines))
    OUT_JSON.write_text(json.dumps(json_out, indent=2, ensure_ascii=False))
    print(f"→ {OUT_MD}")
    print(f"→ {OUT_JSON}")


if __name__ == "__main__":
    main()
