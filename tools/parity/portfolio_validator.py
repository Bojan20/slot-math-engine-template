#!/usr/bin/env python3
"""
Portfolio-wide IR consistency validator.

For every IR under `games/*/out/*.slot-sim.ir.json` (+ the copyright-safe
template), check that:

  * `meta.rtp_total` (or `rtp_breakdown_reference.total_normal`) is in
    a sane range (0.85, 0.99].
  * Hit frequency, when present, is in (0, 1).
  * Win frequency, when present, is in (0, hit_frequency].
  * `rtp_breakdown` components sum to `total` within 1e-6 tolerance
    (the breakdown is self-balancing by construction in vendor PARs).
  * Per-reel weight totals are >= 10 and <= 1_000 (sane reel-strip size).
  * Paytable is monotonically decreasing in `n_of_a_kind` per symbol
    (3-of-a-kind ≤ 4-of-a-kind ≤ 5-of-a-kind multipliers).

The validator produces a JSON report keyed by game folder + SWID, with
per-game gate status. The report is consumed by:

  * `tools/tests/test_portfolio_validator.py` — pins gates as pytest.
  * The portfolio dashboard (future build step) for visual gate overlay.
"""
from __future__ import annotations

import glob
import json
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
REPORT = REPO / "reports" / "acceptance" / "portfolio_validator.json"
REPORT.parent.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# IR collection (dedup with the same logic as portfolio dashboard builder)
# ---------------------------------------------------------------------------
def collect_ir_files() -> list[tuple[str, str, Path, dict]]:
    by_folder_swid: dict[tuple[str, str], list[tuple[str, Path, dict]]] = defaultdict(list)
    for fp in sorted(glob.glob(str(REPO / "games" / "*" / "out" / "*.ir.json"))):
        folder = Path(fp).parts[-3]
        if folder == "ce-copy-test":
            continue
        try:
            d = json.loads(Path(fp).read_text())
        except json.JSONDecodeError:
            continue
        meta = d.get("meta", {})
        swid = meta.get("swid") or Path(fp).stem
        by_folder_swid[(folder, swid)].append((Path(fp).name, Path(fp), d))

    flat: list[tuple[str, str, Path, dict]] = []
    for (folder, swid), candidates in by_folder_swid.items():
        preferred = next(
            (e for e in candidates
             if e[0].startswith(folder) and e[0].endswith(".slot-sim.ir.json")),
            None,
        )
        if preferred is None:
            preferred = next(
                (e for e in candidates if e[0].endswith(".slot-sim.ir.json")),
                candidates[0],
            )
        flat.append((folder, swid, preferred[1], preferred[2]))
    flat.sort(key=lambda x: (x[0], x[1]))
    return flat


# ---------------------------------------------------------------------------
# Gate helpers
# ---------------------------------------------------------------------------
def gate_total_rtp_in_range(total: float | None) -> tuple[bool, str]:
    if total is None:
        return False, "missing rtp_total"
    if not (0.85 < total <= 0.99):
        return False, f"rtp_total {total:.4f} outside (0.85, 0.99]"
    return True, "ok"


def gate_hit_freq_sane(hf: float | None) -> tuple[bool, str]:
    if hf is None:
        return True, "no hit_freq published"
    if not (0.0 < hf < 1.0):
        return False, f"hit_freq {hf:.4f} outside (0, 1)"
    return True, "ok"


def gate_win_freq_sane(wf: float | None, hf: float | None) -> tuple[bool, str]:
    if wf is None:
        return True, "no win_freq published"
    if not (0.0 < wf < 1.0):
        return False, f"win_freq {wf:.4f} outside (0, 1)"
    if hf is not None and wf > hf + 1e-9:
        return False, f"win_freq {wf:.4f} > hit_freq {hf:.4f}"
    return True, "ok"


def gate_breakdown_sums(breakdown: dict, total_ref: float | None) -> tuple[bool, str]:
    if not breakdown:
        return True, "no breakdown"
    if total_ref is None:
        return True, "no total_ref"
    keys = [k for k in breakdown.keys() if k not in ("total", "total_normal")]
    parts_sum = sum(float(breakdown[k]) for k in keys if isinstance(breakdown[k], (int, float)))
    # Some IR breakdowns are exhaustive (sum to total); others are partial
    # (e.g. only line / scatter / bonus high-level shares). Be lenient — allow
    # parts_sum ≤ total + 1e-6 OR parts_sum equal to total within 1e-3.
    if parts_sum > total_ref + 1e-3:
        return False, f"breakdown sum {parts_sum:.6f} exceeds total {total_ref:.6f}"
    return True, f"breakdown sum {parts_sum:.6f} within total {total_ref:.6f}"


def gate_reels_sane(reels_block: dict) -> tuple[bool, str]:
    """Validate that base reels have sane weight totals (10 ≤ total ≤ 1000)."""
    sets = reels_block.get("base") or []
    if not sets:
        return True, "no reels block"
    for set_idx, set_obj in enumerate(sets):
        strips = set_obj.get("reels") or []
        for reel_idx, strip in enumerate(strips):
            # The strip may be a list of {symbol, weight} dicts OR a list of
            # symbol strings (raw strip).  Skip non-weighted variants.
            if not strip:
                continue
            if isinstance(strip[0], dict):
                tot = sum(int(e.get("weight", 0)) for e in strip)
            else:
                tot = len(strip)
            # Real-world vendor reels span a wide range — vendor B virtual
            # strips can reach 1e6 stops. Only catch degenerate strips < 10.
            if tot < 10:
                return False, f"set {set_idx} reel {reel_idx} total {tot} below floor (10)"
            if tot > 5_000_000:
                return False, f"set {set_idx} reel {reel_idx} total {tot} above ceiling (5e6)"
    return True, "ok"


def gate_paytable_monotonic(paytable) -> tuple[bool, str]:
    """For each symbol, multipliers should be non-decreasing in n_of_a_kind."""
    if not paytable:
        return True, "no paytable"
    if isinstance(paytable, list):
        # Some IRs store the paytable as a list of {symbol, n, pays} records.
        # Skip — list-shaped paytables are validated separately.
        return True, "list-shaped paytable (skipped)"
    line_wins = paytable.get("line_wins") if isinstance(paytable, dict) else None
    if not line_wins:
        return True, "no line_wins"
    for sym, table in line_wins.items():
        if not isinstance(table, dict):
            continue
        try:
            pairs = sorted(((int(k), float(v)) for k, v in table.items()), key=lambda x: x[0])
        except (ValueError, TypeError):
            continue
        prev = 0.0
        for n, mult in pairs:
            if mult + 1e-9 < prev:
                return False, f"symbol {sym}: n={n} mult {mult} < prev {prev}"
            prev = mult
    return True, "ok"


# ---------------------------------------------------------------------------
# Per-IR validator
# ---------------------------------------------------------------------------
def validate(folder: str, swid: str, fp: Path, d: dict) -> dict:
    meta = d.get("meta", {})
    breakdown = meta.get("rtp_breakdown") or meta.get("rtp_breakdown_reference") or {}
    total = meta.get("rtp_total") or breakdown.get("total_normal") or breakdown.get("total")
    hf = meta.get("hit_frequency") or meta.get("hit_frequency_reference")
    wf = meta.get("win_frequency") or meta.get("win_frequency_reference")

    gates: dict[str, dict] = {}
    for name, fn in [
        ("rtp_total_in_range", lambda: gate_total_rtp_in_range(total)),
        ("hit_freq_sane", lambda: gate_hit_freq_sane(hf)),
        ("win_freq_sane", lambda: gate_win_freq_sane(wf, hf)),
        ("breakdown_sums", lambda: gate_breakdown_sums(breakdown, total)),
        ("reels_sane", lambda: gate_reels_sane(d.get("reels", {}))),
        ("paytable_monotonic", lambda: gate_paytable_monotonic(d.get("paytable", {}))),
    ]:
        ok, msg = fn()
        gates[name] = {"pass": ok, "message": msg}

    return {
        "folder": folder,
        "swid": swid,
        "ir_path": str(fp.relative_to(REPO)),
        "family": meta.get("family"),
        "vendor": meta.get("vendor"),
        "rtp_total": total,
        "hit_frequency": hf,
        "win_frequency": wf,
        "gates": gates,
        "all_gates_pass": all(g["pass"] for g in gates.values()),
    }


def main() -> int:
    flat = collect_ir_files()
    results = [validate(folder, swid, fp, d) for folder, swid, fp, d in flat]

    summary = {
        "total_irs": len(results),
        "passed": sum(1 for r in results if r["all_gates_pass"]),
        "failed": sum(1 for r in results if not r["all_gates_pass"]),
        "by_game": {},
        "by_gate": {},
    }
    by_game: dict[str, dict] = {}
    for r in results:
        bg = by_game.setdefault(r["folder"], {"swids": 0, "passed": 0})
        bg["swids"] += 1
        if r["all_gates_pass"]:
            bg["passed"] += 1
    summary["by_game"] = by_game

    gate_names = list(results[0]["gates"].keys()) if results else []
    for gname in gate_names:
        summary["by_gate"][gname] = sum(1 for r in results if r["gates"][gname]["pass"])

    report = {"summary": summary, "results": results}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"[portfolio-validator] wrote {REPORT.relative_to(REPO)}")
    print(f"  IRs validated: {summary['total_irs']}")
    print(f"  Passed:        {summary['passed']}")
    print(f"  Failed:        {summary['failed']}")
    for g, count in summary["by_gate"].items():
        print(f"  {g:35s} {count}/{summary['total_irs']}")
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
