"""W4.8f + W4.10f — Probe residual MC RTP gap for Skeleton Key + Fortune Coin.

Five strategies, all silent on raw vendor values (only coordinates + counts
to stdout):

  1. String-marker probe in every cells.json sheet — locate (row, col) of
     reel-expansion / picker / cascade / replacement / probability tables.
  2. sharedStrings.xml dump — catch strings openpyxl may have skipped.
  3. Spin-replay tab walk — does PAR-Bonus / par_004 carry per-spin debug
     logs we can use to derive empirical picker distributions?
  4. calcChain.xml inspect — count formulas pointing at RTP_total cells and
     walk the dependency tree back to picker / per-set input cells.
  5. Constraint-system check — using `meta.rtp_breakdown` and existing
     per-reel-set IR data, determine whether picker weights can be solved
     organically (rank vs cols).

Emits `reports/residual_gap_probe.json`. Raw vendor numbers stay on disk.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[1]
CORPUS = REPO / "agents" / "math-agent" / "corpus"
GAMES = REPO / "games"
REPORTS = REPO / "reports"


MARKERS_LEVEL_A = [
    "Reel Expansion",
    "Spin Type Selector",
    "SpinType",
    "Picker",
    "Coin Boost",
    "Cascade Depth",
    "Symbol Replacement",
    "Substitution",
    "Probability",
    "Distribution",
    "Weight",
]

MARKERS_LEVEL_B = [
    "Spin Number",
    "Replay",
    "1000 spins",
    "100 spins",
    "Trial",
    "Sample",
    "BG Replay",
    "FS Replay",
]


def _load_cells(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    out = []
    for _coord, entry in data["cells"].items():
        out.append(entry)
    return out


def probe1_cells_markers(game: str) -> dict[str, dict[str, Any]]:
    """Probe 1 — scan every cells.json under <game>/ultimate_extract/sheets/."""
    sheets_dir = CORPUS / game / "ultimate_extract" / "sheets"
    out: dict[str, dict[str, Any]] = {}
    if not sheets_dir.exists():
        return out
    for sheet in sorted(sheets_dir.iterdir()):
        cells = _load_cells(sheet / "cells.json")
        hits: dict[str, list[dict]] = {m: [] for m in MARKERS_LEVEL_A}
        for c in cells:
            v = c.get("value")
            if not isinstance(v, str):
                continue
            for m in MARKERS_LEVEL_A:
                if m.lower() in v.lower():
                    hits[m].append({
                        "row": c["row"],
                        "col": c["col"],
                        "col_letter": c.get("col_letter", ""),
                        # we record only the marker label, not raw string,
                        # to avoid leaking vendor IP.
                    })
        out[sheet.name] = {
            "total_cells": len(cells),
            "marker_hits": {k: v for k, v in hits.items() if v},
        }
    return out


def probe2_shared_strings(game: str) -> dict[str, Any]:
    """Probe 2 — sharedStrings.xml dump (catches strings openpyxl skipped)."""
    xml_path = CORPUS / game / "ultimate_extract" / "xml_raw" / "xl" / "sharedStrings.xml"
    if not xml_path.exists():
        return {"found": False}
    raw = xml_path.read_text(encoding="utf-8", errors="ignore")
    # Strip XML tags + collapse whitespace to scan strings simply.
    text = re.sub(r"<[^>]+>", "\n", raw)
    marker_counts: dict[str, int] = {}
    for m in MARKERS_LEVEL_A + MARKERS_LEVEL_B:
        count = sum(1 for line in text.splitlines() if m.lower() in line.lower())
        if count > 0:
            marker_counts[m] = count
    return {
        "found": True,
        "size_bytes": len(raw),
        "marker_counts": marker_counts,
    }


def probe3_spin_replay_tabs(game: str) -> dict[str, Any]:
    """Probe 3 — does any sheet look like a per-spin debug replay log?

    Detection heuristic: column header row contains "Spin Number" /
    "Replay" / "Trial" marker AND the sheet has >= 100 data rows.
    """
    sheets_dir = CORPUS / game / "ultimate_extract" / "sheets"
    out: dict[str, Any] = {}
    if not sheets_dir.exists():
        return out
    for sheet in sorted(sheets_dir.iterdir()):
        cells = _load_cells(sheet / "cells.json")
        header_hits: list[dict] = []
        for c in cells:
            v = c.get("value")
            if not isinstance(v, str):
                continue
            for m in MARKERS_LEVEL_B:
                if m.lower() in v.lower():
                    header_hits.append({
                        "marker": m,
                        "row": c["row"],
                        "col": c["col"],
                    })
        # Estimate data-row count: max distinct row index.
        max_row = max((c["row"] for c in cells), default=0)
        out[sheet.name] = {
            "header_hits": header_hits,
            "max_row": max_row,
            "likely_replay": bool(header_hits) and max_row >= 100,
        }
    return out


def probe4_calc_chain(game: str) -> dict[str, Any]:
    """Probe 4 — calcChain.xml inspect.

    Counts formula targets per sheet ref and identifies how many formulas
    target the cells the IR uses for rtp_breakdown / rtp_total. Note: the
    actual formula text lives in worksheets/sheetN.xml, not calcChain.xml
    (which only carries dependency ordering).
    """
    calc_path = CORPUS / game / "ultimate_extract" / "xml_raw" / "xl" / "calcChain.xml"
    if not calc_path.exists():
        return {"found": False}
    raw = calc_path.read_text(encoding="utf-8", errors="ignore")
    # Each <c r="..." i="N" ...> entry = one formula step.
    refs = re.findall(r"<c\s+r=\"([^\"]+)\"\s+i=\"(\d+)\"", raw)
    by_sheet: dict[str, int] = {}
    for _ref, sheet_id in refs:
        by_sheet[sheet_id] = by_sheet.get(sheet_id, 0) + 1
    return {
        "found": True,
        "formula_count": len(refs),
        "by_sheet_id": by_sheet,
    }


def _load_ir_meta(game_dir: Path, swid: str) -> dict | None:
    p = game_dir / f"{game_dir.name}.{swid}.slot-sim.ir.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text())
    return d.get("meta", {})


def probe5_constraint_system(game: str) -> dict[str, Any]:
    """Probe 5 — constraint solver feasibility.

    For each SWID, count picker weights vs RTP breakdown components.
    Underdetermined ⇒ organic solver alone cannot recover the picker.
    """
    game_dir = GAMES / game / "out"
    if not game_dir.exists():
        return {"swids": []}
    out_swids = []
    for p in sorted(game_dir.glob("*.slot-sim.ir.json")):
        ir = json.loads(p.read_text())
        meta = ir.get("meta", {})
        reels = ir.get("reels", {})
        base_w = (reels.get("base_weights") or {}).get("weights", [])
        fs_w = (reels.get("fs_weights") or {}).get("weights", [])
        bk = meta.get("rtp_breakdown", {})
        rtp_components = [k for k in bk.keys() if k != "total"]
        n_base = len(base_w)
        n_fs = len(fs_w)
        n_cmp = len(rtp_components)
        # System: solve picker weights[i] given Σ picker × per_set_contribution
        # = rtp_component. For SK we have 1 component (base_game) → 1 eq, 8 set
        # weights → 7-DoF underdetermined. For FC we have 4 base components → 4
        # eq, 10 set weights → 6-DoF underdetermined.
        underdetermined = (n_base > n_cmp)
        out_swids.append({
            "swid": meta.get("swid"),
            "n_base_picker_weights": n_base,
            "n_fs_picker_weights": n_fs,
            "n_rtp_components": n_cmp,
            "components": rtp_components,
            "underdetermined": underdetermined,
        })
    return {"swids": out_swids}


def main() -> int:
    REPORTS.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {}
    for game in ("skeleton-key", "fortune-coin-boost-classic"):
        print(f"[probe] {game}", file=sys.stderr)
        report[game] = {
            "probe1_cells_markers": probe1_cells_markers(game),
            "probe2_shared_strings": probe2_shared_strings(game),
            "probe3_spin_replay_tabs": probe3_spin_replay_tabs(game),
            "probe4_calc_chain": probe4_calc_chain(game),
            "probe5_constraint_system": probe5_constraint_system(game),
        }
    out = REPORTS / "residual_gap_probe.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"[probe] report → {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
