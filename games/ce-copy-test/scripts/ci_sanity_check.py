#!/usr/bin/env python3
"""CE COPY TEST — CI sanity verdict check.

Diff-uje 1B (ili manji) sim log protiv Excel PAR target-a sa konfigurabilnom
tolerance-om. Drugačiji thresholds nego full 10B aggregate (1B ima više
MC variance, posebno za niske-rate trigger-e).

Exit:
  0 — sve metrike unutar tol
  1 — bilo koja metrika preko tol

Args:
  --logs DIR          dir koji sadrži sanity-<swid>.log
  --swids CSV         e.g. "200-1637-001,200-1637-002"
  --tol-rtp PCT       % tolerance za RTP-style metrike (default 0.5)
  --tol-trigger PCT   % tolerance za trigger 1-in-N metrike (default 2.0)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Reuse same targets table as 10B aggregator — but verdict thresholds
# are looser because 1B has higher MC variance.
_CE_FROM_BASE_RTP = 0.409104936666577
_FS_LINES_RTP = 0.0700000107591113
_CE_FROM_FS_RTP = 0.0618950673666612
_FS_TOTAL_RTP = _FS_LINES_RTP + _CE_FROM_FS_RTP

_SHARED_RTP = {
    "ce_from_base_rtp": _CE_FROM_BASE_RTP,
    "free_spins_rtp_total": _FS_TOTAL_RTP,
    "ce_from_fs_rtp": _CE_FROM_FS_RTP,
    "fs_trigger_one_in": 139.9,
    "ce_base_trigger_one_in": 120.8,
    "ce_fs_trigger_one_in": 468.99,
    "avg_ce_win_base": 49.42,
    "avg_ce_win_fs": 29.03,
    "avg_fs_bonus": 9.79,
}

TARGETS = {
    "200-1637-001": {
        **_SHARED_RTP,
        "total_rtp": 0.960000018370437,
        "base_game_rtp": 0.419000003813447,
        "hit_freq": 0.19030599,
        "win_freq": 0.08936075,
    },
    "200-1637-002": {
        **_SHARED_RTP,
        "total_rtp": 0.950000015007889,
        "base_game_rtp": 0.409000000450898,
        "hit_freq": 0.1902107,
        "win_freq": 0.0889773,
    },
    "200-1637-003": {
        **_SHARED_RTP,
        "total_rtp": 0.931000016534967,
        "base_game_rtp": 0.390000001977976,
        "hit_freq": 0.19066094,
        "win_freq": 0.08770657,
    },
}

# Metrike koje su 1-in-N (trigger frequencies) — koriste trigger tol.
TRIGGER_METRICS = {
    "fs_trigger_one_in",
    "ce_base_trigger_one_in",
    "ce_fs_trigger_one_in",
}

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
    txt = path.read_text()
    out: dict = {}
    for k, p in PATTERNS.items():
        m = re.search(p, txt)
        if m:
            out[k] = float(m.group(1))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--logs", required=True, type=Path)
    ap.add_argument("--swids", required=True)
    ap.add_argument("--tol-rtp", type=float, default=0.5)
    ap.add_argument("--tol-trigger", type=float, default=2.0)
    args = ap.parse_args()

    swids = args.swids.split(",")
    fails: list[str] = []

    for swid in swids:
        log = args.logs / f"sanity-{swid}.log"
        if not log.exists():
            fails.append(f"{swid}: log missing ({log})")
            continue
        sim = parse_log(log)
        tgt = TARGETS.get(swid, {})
        for k, target in tgt.items():
            sim_v = sim.get(k)
            if sim_v is None:
                fails.append(f"{swid}: missing {k} in log")
                continue
            if target == 0:
                continue
            diff_pct = abs((sim_v - target) / target * 100.0)
            tol = args.tol_trigger if k in TRIGGER_METRICS else args.tol_rtp
            status = "✅" if diff_pct < tol else "❌"
            print(f"  [{status}] {swid:14s} {k:26s} sim={sim_v:>12.6f} tgt={target:>12.6f} Δ={diff_pct:+.4f}% (tol {tol}%)")
            if diff_pct >= tol:
                fails.append(f"{swid}/{k}: |Δ|={diff_pct:.4f}% ≥ tol={tol}%")

    if fails:
        print()
        print(f"💥 {len(fails)} metric(s) failed:")
        for f in fails:
            print(f"  - {f}")
        return 1
    print()
    print("🏁 ALL CHECKS PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
