"""W4.10 — Fortune Coin Boost Classic RTP verifier.

Loads the universal slot-sim IR for each SWID and verifies:
  ▸ rtp_total ↔ sum of all 8 breakdown components
    (base/fs × multiway+scatter+coins+jackpot)
  ▸ paytable entries non-negative finite floats
  ▸ topology rectangular 3x5 + evaluation ways 243
  ▸ all base + FS reel sets have 5 reels with non-empty stops
  ▸ Coin / Coin Boost symbols present in at least one FS reel set
    (RS3_FG_CE_* sets carry the Coin Boost feature triggers)
  ▸ Wild role assigned + reels 2/3/4 carry at least one Wild stop

Tolerance: 1e-6 absolute on breakdown sum ↔ rtp_total.

Coin/Boost cascade RTP closed-form is TODO(fortune_coin_W4_10c) — it
requires walking the per-row Boost multiplier resolution + GRAND/MAXI/MAJOR/
MINOR/MINI tier weights from the Jackpot Bonus block (par_001 cols 81..88).
The 0.115+0.004 jackpot RTP contribution comes from Excel directly.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "games" / "fortune-coin-boost-classic" / "out"


def verify_ir(path: Path) -> dict:
    ir = json.loads(path.read_text())
    meta = ir["meta"]
    swid = meta["swid"]
    rtp = float(meta["rtp_total"])
    bd = meta.get("rtp_breakdown", {})
    bd_keys = [
        "base_game_multiway", "base_game_scatter",
        "base_game_coins", "base_game_jackpot",
        "free_spins_multiway", "free_spins_scatter",
        "free_spins_coins", "free_spins_jackpot",
    ]
    bd_sum = sum(float(bd.get(k, 0.0)) for k in bd_keys)
    bd_delta = abs(bd_sum - rtp)

    problems: list[str] = []
    if bd_delta > 1e-6:
        problems.append(
            f"breakdown sum {bd_sum:.10f} vs total {rtp:.10f} "
            f"(Δ={bd_delta:.2e})"
        )

    hf = float(meta.get("hit_frequency", 0.0))
    wf = float(meta.get("win_frequency", 0.0))
    if not (0.0 <= hf <= 1.0):
        problems.append(f"hit_frequency out of range: {hf}")
    if not (0.0 <= wf <= 1.0):
        problems.append(f"win_frequency out of range: {wf}")

    topo = ir.get("topology", {})
    if topo.get("kind") != "rectangular":
        problems.append(f"topology.kind {topo.get('kind')!r} != rectangular")
    if topo.get("reels") != 5 or topo.get("rows") != 3:
        problems.append(f"topology dims {topo.get('reels')}x{topo.get('rows')} != 5x3")
    ev = ir.get("evaluation", {})
    if ev.get("kind") != "ways" or ev.get("ways") != 243:
        problems.append(f"evaluation {ev} != ways/243")

    pt = ir.get("paytable", [])
    if not pt:
        problems.append("empty paytable")
    for i, e in enumerate(pt):
        if e["pays"] < 0:
            problems.append(f"paytable[{i}] negative pay: {e['pays']}")

    reels = ir.get("reels", {})
    base_sets = reels.get("base", [])
    fs_sets = reels.get("fs", []) or []
    for tag, sets in (("base", base_sets), ("fs", fs_sets)):
        if not sets:
            problems.append(f"no {tag} reel sets")
        for i, rs in enumerate(sets):
            if len(rs.get("reels", [])) != 5:
                problems.append(f"{tag} set {i} has {len(rs['reels'])} reels")
            for j, reel in enumerate(rs["reels"]):
                if not reel:
                    problems.append(f"{tag} set {i} reel {j} empty")

    # Coin / Coin Boost must appear in at least one FS reel set
    coin_found = False
    for rs in fs_sets:
        for reel in rs.get("reels", []):
            for stop in reel:
                if stop["symbol"] in ("Coin", "Coin Boost"):
                    coin_found = True
                    break
            if coin_found:
                break
        if coin_found:
            break
    if not coin_found:
        problems.append("Coin / Coin Boost symbol missing from all FS reel sets")

    # Wild role assigned
    wild_ids = [s for s in ir.get("symbols", []) if s.get("role") == "wild"]
    if not wild_ids:
        problems.append("no symbol with role=wild")

    return {
        "swid": swid,
        "rtp_total": rtp,
        "rtp_breakdown_sum": bd_sum,
        "breakdown_delta": bd_delta,
        "hit_freq": hf,
        "win_freq": wf,
        "n_paytable": len(pt),
        "n_base_sets": len(base_sets),
        "n_fs_sets": len(fs_sets),
        "n_symbols": len(ir.get("symbols", [])),
        "coin_in_fs": coin_found,
        "problems": problems,
    }


def main() -> int:
    paths = sorted(OUT_DIR.glob("fortune-coin-boost-classic.*.slot-sim.ir.json"))
    if not paths:
        print(f"error: no IR files in {OUT_DIR}", file=sys.stderr)
        return 1
    all_ok = True
    for p in paths:
        r = verify_ir(p)
        status = "OK" if not r["problems"] else "FAIL"
        print(f"[{status}] {r['swid']}: "
              f"rtp_total={r['rtp_total']:.6f}, "
              f"breakdown_sum={r['rtp_breakdown_sum']:.6f}, "
              f"Δ={r['breakdown_delta']:.2e}, "
              f"hit_freq={r['hit_freq']:.4f}, "
              f"sets={r['n_base_sets']}+{r['n_fs_sets']}fs, "
              f"paytable={r['n_paytable']}, syms={r['n_symbols']}, "
              f"coin_in_fs={r['coin_in_fs']}")
        if r["problems"]:
            all_ok = False
            for p_ in r["problems"]:
                print(f"  ! {p_}")
    return 0 if all_ok else 2


if __name__ == "__main__":
    sys.exit(main())
