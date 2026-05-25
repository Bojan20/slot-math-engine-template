"""W4.9e — per-FS-reel-set RTP attribution audit.

Standalone Python MC of FS line evaluation per individual reel set,
weighted to compute total FS per-spin RTP. Mirrors the engine's
`free_spins::run` line-eval semantics:

  ▸ weighted strip sampling (matches `Strip::sample_stop`)
  ▸ 3-row centered visible window (matches `Strip::visible`)
  ▸ linked-reel block (single stop shared across reels listed in
    `Feature::FreeSpins.linked_reels`)
  ▸ left-to-right anchor walk with wild prefix + canonical Big_X→X
    matching (matches `evaluate_lines`)
  ▸ Big Volcano:1 scatter pay = 1× total bet when count ≥ 1

Output columns: set id, weight, weight share, isolated RTP per FS spin,
× weight share contribution.

Use to identify which sets pay differently from Excel target so the
adapter can be re-calibrated. Example invocation:

    python -m tools.diagnostics.fs_rtp_audit \\
        games/<game-slug>/out/<vendor>.<swid>.slot-sim.ir.json

Run by W4.9e wave to root-cause the residual FS line eval gap.
"""
from __future__ import annotations
import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any


def canon(sym: str) -> str:
    return sym[4:] if sym.startswith("Big ") else sym


def _sample_stop(entries: list[dict], rng: random.Random) -> int:
    total_w = sum(s["weight"] for s in entries)
    r = rng.randint(0, total_w - 1)
    cum = 0
    for i, s in enumerate(entries):
        cum += s["weight"]
        if r < cum:
            return i
    return len(entries) - 1


def _visible(entries: list[dict], stop: int, rows: int = 3) -> list[str]:
    n = len(entries)
    offset_top = -(rows // 2)
    return [entries[(stop + offset_top + i) % n]["symbol"] for i in range(rows)]


def _spin_grid(
    rs_reels: list[list[dict]],
    linked: list[int],
    rng: random.Random,
    rows: int = 3,
) -> list[list[str]]:
    reels_n = len(rs_reels)
    grid = [[""] * reels_n for _ in range(rows)]
    linked_stop = None
    for r in range(reels_n):
        if linked and r in linked:
            if linked_stop is None:
                linked_stop = _sample_stop(rs_reels[r], rng)
            stop = linked_stop
        else:
            stop = _sample_stop(rs_reels[r], rng)
        view = _visible(rs_reels[r], stop, rows)
        for row in range(rows):
            grid[row][r] = view[row]
    return grid


def _evaluate_lines(
    grid: list[list[str]],
    paylines: list[list[int | None]],
    pt_lookup: dict[tuple[str, int], float],
    wild_ids: set[str],
) -> float:
    total = 0.0
    reels_n = len(grid[0])
    canon_wilds = {canon(w) for w in wild_ids} | wild_ids
    for line in paylines:
        cells: list[str | None] = [
            grid[line[r]][r] if line[r] is not None and line[r] < len(grid) else None
            for r in range(reels_n)
        ]
        canon_cells = [canon(c) if c else c for c in cells]
        anchor: str | None = None
        count = 0
        for i, c in enumerate(canon_cells):
            if c is None:
                break
            if c in canon_wilds:
                count += 1
                continue
            if anchor is None:
                anchor = c
                count = i + 1
            else:
                if c == anchor:
                    count += 1
                else:
                    break
        if anchor and count >= 3:
            best = 0.0
            k = count
            while k >= 3:
                p = pt_lookup.get((canon(anchor), k))
                if p is not None:
                    best = max(best, p)
                    break
                k -= 1
            total += best
    return total


def audit(ir_path: Path, *, spins_per_set: int = 100_000, seed: int = 42) -> dict[str, Any]:
    with open(ir_path) as f:
        ir = json.load(f)
    fs_sets = ir["reels"]["fs"]
    fs_weights_list = ir["reels"]["fs_weights"]["weights"]
    fs_feat = next(f for f in ir["features"] if f["kind"] == "free_spins")
    fs_paytable = fs_feat.get("fs_paytable", [])
    linked_reels: list[int] = fs_feat.get("linked_reels", []) or []
    paylines = ir["evaluation"]["lines"]
    lines_n = len(paylines)
    wild_ids = {s["id"] for s in ir["symbols"] if s["role"] == "wild"}

    # Paytable lookup (canonical anchor + count → pays)
    pt_lookup: dict[tuple[str, int], float] = {}
    big_volcano_pay = 0.0
    for entry in fs_paytable:
        if entry.get("scope") == "line":
            combo = entry["combo"]
            non_blank = [c for c in combo if c != "--"]
            if not non_blank:
                continue
            anchor = non_blank[0]
            count = len(non_blank)
            pt_lookup[(canon(anchor), count)] = float(entry["pays"])
        elif entry.get("scope") == "scatter":
            combo_str = " ".join(str(x) for x in entry.get("combo", []))
            if "Big Volcano" in combo_str:
                big_volcano_pay = float(entry["pays"])

    total_w = sum(w["weight"] for w in fs_weights_list)
    results: list[dict[str, Any]] = []
    weighted_total = 0.0
    for sw in fs_weights_list:
        set_id = sw["set"]
        weight = sw["weight"]
        if weight == 0:
            continue
        rs = next((s for s in fs_sets if s["set"] == set_id), None)
        if rs is None:
            continue
        rng = random.Random(seed + set_id)
        line_pay_sum = 0.0
        scatter_pay_sum = 0.0
        for _ in range(spins_per_set):
            grid = _spin_grid(rs["reels"], linked_reels, rng)
            line_pay_sum += _evaluate_lines(grid, paylines, pt_lookup, wild_ids)
            if big_volcano_pay > 0:
                bv_count = sum(1 for row in grid for c in row if "Big Volcano" in c)
                if bv_count >= 1:
                    scatter_pay_sum += big_volcano_pay * lines_n
        line_rtp = line_pay_sum / (spins_per_set * lines_n)
        scatter_rtp = scatter_pay_sum / (spins_per_set * lines_n)
        rtp = line_rtp + scatter_rtp
        share = weight / total_w
        contribution = rtp * share
        weighted_total += contribution
        results.append({
            "set": set_id,
            "weight": weight,
            "share": share,
            "line_rtp": line_rtp,
            "scatter_rtp": scatter_rtp,
            "rtp": rtp,
            "contribution": contribution,
        })

    return {
        "fs_weighted_rtp_per_spin": weighted_total,
        "spins_per_set": spins_per_set,
        "seed": seed,
        "lines": lines_n,
        "scatter_pay": big_volcano_pay,
        "results": sorted(results, key=lambda r: -r["weight"]),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="fs-rtp-audit")
    ap.add_argument("ir_path", help="path to *.slot-sim.ir.json")
    ap.add_argument("--spins-per-set", type=int, default=100_000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--json", action="store_true", help="emit JSON report instead of table")
    args = ap.parse_args(argv)
    out = audit(Path(args.ir_path), spins_per_set=args.spins_per_set, seed=args.seed)
    if args.json:
        print(json.dumps(out, indent=2))
        return 0
    print(f"FS RTP audit · {args.ir_path}")
    print(f"  spins_per_set: {args.spins_per_set:,}  seed: {args.seed}  lines: {out['lines']}")
    print(f"  scatter_pay (Big Volcano:1): {out['scatter_pay']}× total bet")
    print()
    print(f"  {'Set':>4}  {'Weight':>8}  {'Share%':>8}  {'LineRTP':>10}  {'ScatRTP':>10}  {'RTP':>10}  {'×Share':>10}")
    for r in out["results"]:
        print(
            f"  {r['set']:>4}  {r['weight']:>8}  "
            f"{r['share']*100:>7.2f}%  "
            f"{r['line_rtp']:>10.4f}  "
            f"{r['scatter_rtp']:>10.4f}  "
            f"{r['rtp']:>10.4f}  "
            f"{r['contribution']:>10.6f}"
        )
    print()
    print(f"  Total weighted FS RTP per FS spin: {out['fs_weighted_rtp_per_spin']:.6f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
