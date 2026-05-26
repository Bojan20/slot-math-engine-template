"""Synthetic PAR-sheet generator.

Build a deterministic, vendor-profile-driven TSV PAR sheet from a
small set of in-memory game parameters. The output is a regulator-
shape TSV (rows × tab-separated columns) whose cells live at exactly
the coordinates a `VendorProfile` expects, so `parse_par(profile,
raw_dir)` reads back a dict structurally equivalent to the source.

Primary use:
  • Round-trip integrity tests for vendor profiles (no real-PAR
    fixture data needed — covered under W-SANITIZE IP-leak policy).
  • CI gate that detects profile drift (a coordinate change that
    silently breaks parsing of every game built against the profile).
  • Sandbox material for the slot-build pipeline when an operator
    wants to scaffold a new vendor end-to-end before authoring real
    PAR sheets.

CLI:
  python -m tools.parse_par.synth_par <vendor_id> \\
      --seed 42 --rtp 0.95 --out games/synth-<id>-001/raw

Programmatic:
  from tools.parse_par.synth_par import SyntheticPAR
  par = SyntheticPAR.from_profile(load_profile("vendor_c"), seed=42)
  par.set_meta(swid="SYN-001", hold=5.0, hit_freq=0.25, win_freq=0.12)
  par.set_rtp_breakdown({"base_game": 0.80, "free_spins": 0.15,
                          "total": 0.95})
  par.write(Path("games/syn-c-001/raw"))
"""
from __future__ import annotations
import argparse
import math
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from tools.parse_par.profile import VendorProfile, load_profile


@dataclass
class SyntheticPAR:
    """Mutable 2D TSV grid driven by a VendorProfile's coordinates.

    Cells are stored as strings (TSV-native). Numeric values are
    formatted via `_fmt_num` to preserve int-vs-float distinction
    so `parse_par.tsv.num()` parses them back to the same Python type.
    """

    profile: VendorProfile
    rows: list[list[str]] = field(default_factory=list)
    seed: int = 0

    # ─── construction ──────────────────────────────────────────────

    @classmethod
    def from_profile(cls, profile: VendorProfile, seed: int = 0) -> "SyntheticPAR":
        """Build a fresh PAR grid sized to fit all profile coordinates.

        Computes max(row, col) used anywhere in the profile and
        pre-allocates a grid of empty strings, ready for `put()`/
        `set_*()` calls.
        """
        max_r, max_c = cls._profile_extent(profile)
        # +6 row / +4 col headroom for label rows + symbol-counts +
        # bet-table tails that may extend below the last referenced
        # cell in the profile (vendor PARs typically end with totals).
        rows = [["" for _ in range(max_c + 4)] for _ in range(max_r + 6)]
        return cls(profile=profile, rows=rows, seed=seed)

    @staticmethod
    def _profile_extent(profile: VendorProfile) -> tuple[int, int]:
        """Walk every {row, col} coordinate + row/col_range in the
        profile and return the (max_row, max_col) seen."""
        max_r = 0
        max_c = 0

        def visit(obj):
            nonlocal max_r, max_c
            if isinstance(obj, dict):
                if "row" in obj and isinstance(obj["row"], int):
                    max_r = max(max_r, obj["row"])
                if "col" in obj and isinstance(obj["col"], int):
                    max_c = max(max_c, obj["col"])
                if "row_range" in obj and isinstance(obj["row_range"], list):
                    max_r = max(max_r, *[v for v in obj["row_range"] if isinstance(v, int)])
                if "total_row" in obj and isinstance(obj["total_row"], int):
                    max_r = max(max_r, obj["total_row"])
                if "max_rows" in obj and isinstance(obj["max_rows"], int):
                    # Treat max_rows as a hint of additional row span needed.
                    max_r = max(max_r, max_r + obj["max_rows"])
                for v in obj.values():
                    visit(v)
            elif isinstance(obj, list):
                for v in obj:
                    visit(v)

        visit(profile.data)
        return max_r, max_c

    # ─── low-level cell ops ────────────────────────────────────────

    def _grow_to(self, r: int, c: int) -> None:
        while len(self.rows) <= r:
            self.rows.append([])
        row = self.rows[r]
        while len(row) <= c:
            row.append("")

    @staticmethod
    def _fmt_num(v) -> str:
        """Render a number as a TSV cell that parses back to the same
        type via `parse_par.tsv.num()`."""
        if v is None:
            return ""
        if isinstance(v, bool):
            return "1" if v else "0"
        if isinstance(v, int):
            return str(v)
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return ""
            if v.is_integer():
                # core.num() prefers int when float is integral, so
                # write as float to keep round-trip semantically a float
                return f"{v:.1f}"
            return repr(v)
        return str(v)

    def put(self, r: int, c: int, value) -> None:
        """Place a single cell. Numbers are TSV-formatted; strings
        are written verbatim."""
        self._grow_to(r, c)
        if isinstance(value, str):
            self.rows[r][c] = value
        else:
            self.rows[r][c] = self._fmt_num(value)

    def put_coord(self, spec: dict | None, value) -> None:
        """Place at a {row, col} dict if present."""
        if not isinstance(spec, dict):
            return
        r = spec.get("row")
        c = spec.get("col")
        if isinstance(r, int) and isinstance(c, int):
            self.put(r, c, value)

    # ─── high-level setters keyed off the profile ──────────────────

    def set_meta(self, swid: str = "", hold=None, hit_freq=None,
                 win_freq=None) -> None:
        meta = self.profile.data.get("meta") or {}
        if swid:
            self.put_coord(meta.get("swid"), swid)
        if hold is not None:
            self.put_coord(meta.get("hold"), hold)
        if hit_freq is not None:
            self.put_coord(meta.get("hit_freq"), hit_freq)
        if win_freq is not None:
            self.put_coord(meta.get("win_freq"), win_freq)

    def set_rtp_breakdown(self, values: dict) -> None:
        bd = self.profile.data.get("rtp_breakdown") or {}
        for key, v in values.items():
            self.put_coord(bd.get(key), v)

    def set_bet_table(self, bet_multipliers: Iterable[float]) -> None:
        cfg = self.profile.data.get("bet_table")
        if not cfg:
            return
        r0, r1 = cfg["row_range"]
        mult_c = cfg["mult_col"]
        total_c = cfg.get("total_col")
        ml_c = cfg.get("max_liab_col")
        bm = list(bet_multipliers)
        max_n = r1 - r0
        for i, m in enumerate(bm[:max_n]):
            r = r0 + i
            self.put(r, mult_c, m)
            if total_c is not None:
                self.put(r, total_c, m)        # 1× line bet for synthesis
            if ml_c is not None:
                self.put(r, ml_c, m * 10_000)  # max liability proxy

    def set_paytable(self, combos: Iterable[dict]) -> None:
        """Each combo dict has keys:
             cells: list[str] (length = reels matched, padded with "")
             pays: number
             optional: pph, rtp_pct, marker
        """
        cfg = self.profile.data.get("paytable") or {}
        r0 = cfg.get("row_range", [0, 0])[0]
        cc0, cc1 = cfg.get("combo_cols", [0, 0])
        pays_c = cfg.get("pays_col")
        pph_c = cfg.get("pph_col")
        rtp_c = cfg.get("rtp_pct_col")
        mk_c = cfg.get("marker_col")
        # Cluster-pays uses a flatter shape; map cluster combos onto a
        # dense row block with `cluster_size`, `symbol`, `pays`.
        if "cluster_size_col" in cfg:
            cs_c = cfg["cluster_size_col"]
            sym_c = cfg["symbol_col"]
            for i, combo in enumerate(combos):
                r = r0 + i
                cs = combo.get("cluster_size") or len(combo.get("cells", []))
                self.put(r, cs_c, cs)
                sym = combo.get("symbol") or (combo.get("cells") or [""])[0]
                self.put(r, sym_c, sym)
                if pays_c is not None:
                    self.put(r, pays_c, combo.get("pays", 0))
            return
        for i, combo in enumerate(combos):
            r = r0 + i
            cells = list(combo.get("cells") or [])
            for j, sym in enumerate(cells):
                if cc0 + j < cc1:
                    self.put(r, cc0 + j, sym)
            if pays_c is not None:
                self.put(r, pays_c, combo.get("pays", 0))
            if pph_c is not None and combo.get("pph") is not None:
                self.put(r, pph_c, combo["pph"])
            if rtp_c is not None and combo.get("rtp_pct") is not None:
                self.put(r, rtp_c, combo["rtp_pct"])
            if mk_c is not None and combo.get("marker") is not None:
                self.put(r, mk_c, combo["marker"])

    def set_reel_set(self, set_id: int, reels: list[list[str]],
                      block: str = "base") -> None:
        """Place a `Base Game Reel Set:` / `Free Spins Reel Set:` block
        for the given set_id. `reels[i]` = symbol sequence of reel i."""
        cfg = (self.profile.data.get("reel_sets") or {}).get(block) or {}
        if not cfg:
            return
        header_label = cfg.get("header_label") or f"{block.title()} Reel Set:"
        header_col = cfg.get("header_col", 1)
        set_num_col = cfg.get("set_num_col", 3)
        data_offset = cfg.get("data_offset", 4)
        sym_col_start = cfg.get("symbol_col_start", 2)
        stride = cfg.get("stride", 2)
        index_col = cfg.get("index_col", 1)
        max_stops = cfg.get("max_stops", 200)

        # We allocate a contiguous block of (header row + max_stops data rows)
        # placed below previously-written content. To stay deterministic
        # we reserve a slab starting at row = 200 + set_id * (max_stops + 5).
        base_row = 200 + set_id * (max_stops + 5)
        self.put(base_row, header_col, header_label)
        self.put(base_row, set_num_col, set_id)

        for stop_idx in range(max(len(r) for r in reels) if reels else 0):
            row_r = base_row + data_offset + stop_idx
            if stop_idx < max_stops:
                self.put(row_r, index_col, stop_idx + 1)
            for reel_i, strip in enumerate(reels):
                col_sym = sym_col_start + reel_i * stride
                col_w = col_sym + 1
                if stop_idx < len(strip):
                    self.put(row_r, col_sym, strip[stop_idx])
                    self.put(row_r, col_w, 1)   # uniform weight

    # ─── seeding helpers (deterministic from self.seed) ────────────

    def synthesize_minimal(self, *, target_rtp: float = 0.95) -> None:
        """Populate every profile-mandated coordinate with a self-
        consistent synthetic payload. Idempotent given (profile, seed).
        """
        rng = random.Random(self.seed)
        dims = self.profile.dimensions
        reels = int(dims.get("reels") or 5)
        rows_dim = dims.get("rows") or 3
        if isinstance(rows_dim, list):
            rows_n = max(rows_dim) if rows_dim else 5
        else:
            rows_n = int(rows_dim)

        # meta
        hit = round(0.20 + rng.random() * 0.15, 4)
        win = round(hit * (0.45 + rng.random() * 0.10), 4)
        self.set_meta(
            swid=f"SYN-{self.profile.vendor.upper()}-{self.seed:04d}",
            hold=round((1 - target_rtp) * 100, 2),
            hit_freq=hit,
            win_freq=win,
        )

        # rtp_breakdown — split into base + FS roughly, hit the published total
        base_share = 0.70 + rng.random() * 0.20
        breakdown = {
            "base_game": round(target_rtp * base_share, 4),
            "free_spins": round(target_rtp * (1 - base_share), 4),
            "total": round(target_rtp, 4),
        }
        # add vendor-specific slots if present (cascade, pattern, ways,
        # cash_eruption, sticky_wild_in_fs, etc.) — give each a token mass
        defined = set((self.profile.data.get("rtp_breakdown") or {}).keys())
        for extra in defined - set(breakdown.keys()):
            breakdown[extra] = round(target_rtp * 0.02 * rng.random(), 4)
        self.set_rtp_breakdown(breakdown)

        # bet table
        bm = [1, 2, 3, 5, 10]
        self.set_bet_table(bm)

        # paytable — generate plausible (symbol, pays) rows
        symbols = ["Wild", "Scatter", "HP1", "HP2", "HP3", "LP1", "LP2", "LP3"]
        combos: list[dict] = []
        if "cluster_size_col" in (self.profile.data.get("paytable") or {}):
            for cs in (5, 6, 7, 8, 9, 10):
                for sym in symbols[:6]:
                    combos.append({
                        "cluster_size": cs,
                        "symbol": sym,
                        "pays": cs * 5 + rng.randint(0, 20),
                    })
        else:
            for sym in symbols:
                for count in (3, 4, 5):
                    cells = ["", "", "", "", ""]
                    for i in range(min(count, reels)):
                        cells[i] = sym
                    combos.append({
                        "cells": cells,
                        "pays": (count - 2) * 10 + rng.randint(0, 30),
                        "pph": round(rng.random() * 0.001, 6),
                        "rtp_pct": round(rng.random() * 0.05, 4),
                    })
        self.set_paytable(combos)

        # reel sets — one minimal base set
        base_strip = [
            symbols[rng.randrange(len(symbols))]
            for _ in range(max(rows_n + 5, 20))
        ]
        self.set_reel_set(1, [base_strip[:] for _ in range(reels)], block="base")

    # ─── IO ────────────────────────────────────────────────────────

    def serialize(self) -> str:
        return "\n".join("\t".join(row) for row in self.rows)

    def write(self, raw_dir: Path, sheet: str | None = None) -> Path:
        """Write `<raw_dir>/<sheet>.tsv`. Defaults to
        `profile.sheets["main_par"]`. Returns the written path.

        Also emits a sibling `Paylines.tsv` when the profile declares
        a `paylines_layout` block, so `parse_paylines()` can read
        cleanly. Cells in the paylines sheet are marker characters
        (e.g. `"X"`) at the row indicated by each line's middle stop.
        """
        raw_dir = Path(raw_dir)
        raw_dir.mkdir(parents=True, exist_ok=True)
        sheet_name = sheet or self.profile.sheets.get("main_par") or "PAR"
        path = raw_dir / f"{sheet_name}.tsv"
        path.write_text(self.serialize())
        self._maybe_write_paylines(raw_dir)
        return path

    def _maybe_write_paylines(self, raw_dir: Path) -> None:
        cfg = self.profile.data.get("paylines_layout")
        if not cfg:
            return
        sheet = cfg.get("sheet") or self.profile.sheets.get("paylines") or "Paylines"
        marker = cfg.get("marker", "X")
        reels = int(cfg.get("reels") or self.profile.dimensions.get("reels") or 5)
        rows_dim = self.profile.dimensions.get("rows") or 3
        rows_n = max(rows_dim) if isinstance(rows_dim, list) else int(rows_dim)
        # Build a 2-D grid sized to cover every block's row range and
        # every line's column span.
        max_r = 0
        max_c = 0
        for blk in cfg.get("blocks") or []:
            d0, d1 = blk["data_row_range"]
            max_r = max(max_r, d1)
            col0 = blk["col_start"]
            cpl = blk["cols_per_line"]
            for k, _ in enumerate(blk["line_numbers"]):
                max_c = max(max_c, col0 + k * cpl + reels - 1)
        grid: list[list[str]] = [
            ["" for _ in range(max_c + 2)] for _ in range(max_r + 2)
        ]
        # Place a `marker` on the middle row of each line's block
        for blk in cfg.get("blocks") or []:
            d0, d1 = blk["data_row_range"]
            col_start = blk["col_start"]
            cpl = blk["cols_per_line"]
            mid_row = d0 + min((d1 - d0) // 2, rows_n - 1)
            for k, _ln in enumerate(blk["line_numbers"]):
                for r_i in range(reels):
                    grid[mid_row][col_start + k * cpl + r_i] = marker
        text = "\n".join("\t".join(row) for row in grid)
        (raw_dir / f"{sheet}.tsv").write_text(text)

    # ─── inspection ────────────────────────────────────────────────

    def cell(self, r: int, c: int) -> str:
        if r < 0 or r >= len(self.rows):
            return ""
        row = self.rows[r]
        if c < 0 or c >= len(row):
            return ""
        return row[c]


# ─── CLI ────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-synth-par",
        description=(
            "Generate a synthetic PAR-sheet TSV from a vendor profile. "
            "Output is regulator-shape (cells at profile coordinates) "
            "and re-parses via parse_par with structural equivalence."
        ),
    )
    p.add_argument("vendor_id", help="vendor short id (vendor_c / vendor_d / ...)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--rtp", type=float, default=0.95,
                   help="target total RTP (0-1, default 0.95)")
    p.add_argument("--out", type=Path, required=True,
                   help="output raw directory; PAR-001.tsv (or profile's "
                        "main_par sheet name) will be written here")
    args = p.parse_args(argv)

    profile = load_profile(args.vendor_id)
    par = SyntheticPAR.from_profile(profile, seed=args.seed)
    par.synthesize_minimal(target_rtp=args.rtp)
    out_path = par.write(args.out)
    sys.stdout.write(f"wrote {out_path}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
