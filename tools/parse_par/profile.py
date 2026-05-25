"""Vendor profile loader + schema validator.

A vendor profile is a YAML file describing **layout conventions** that
are invariant across all games from one vendor (IGT, L&W, NetEnt, …).
Game-specific math (paytable values, reel weights) is parsed from the
PAR sheet itself — the profile only knows **where to look**.

Schema (v1):

    vendor: str                 # short id ("lw", "igt", ...)
    display_name: str
    profile_version: int        # increments on breaking layout changes

    sheets:                     # logical name → on-disk basename
      main_par: PAR-001         # canonical per-SWID sheet
      summary: PAR_Summary      # multi-SWID summary (optional)
      paylines: Paylines        # paylines sheet (optional)

    meta:                       # per-cell coordinates of header metrics
      swid:     { row, col }
      hold:     { row, col }
      hit_freq: { row, col }
      win_freq: { row, col }

    dimensions:                 # fixed game shape
      reels: 5
      rows: 3                   # int OR list[int] for variable (Megaways)
      paylines: 20              # int OR "ways"

    rtp_breakdown:              # row × col map of RTP components
      base_game:               { row, col }
      free_spins:              { row, col }
      total:                   { row, col }
      <vendor-specific keys>:  { row, col }

    bet_table:                  # bet multipliers / total bets / max liability
      row_range: [start, end]
      mult_col: 11
      total_col: 12
      max_liab_col: 13

    paytable:
      row_range: [start, end]
      combo_cols: [start, end_exclusive]    # 5 reel symbols
      pays_col: 7
      pph_col: 8
      rtp_pct_col: 9
      marker_col: 1

    symbol_counts:              # optional (not all PAR sheets have)
      row_range: [7, 20]
      name_col: 2
      reel_col_range: [3, 8]

    reel_sets:
      base:
        header_label: "Base Game Reel Set:"
        set_num_col: 3
        data_offset: 4
        symbol_col_start: 2
        stride: 2               # cols per reel (symbol + weight)
      fs:                       # optional
        header_label: "Free Spins Reel Set:"
        ...

    reel_set_weights:
      base:
        row_range: [start, end]
        set_col: 2
        weight_col: 3
        total_row: <int>
        total_col: 3
        initial_set: { row, col }    # optional
        initial_rtp: { row, col }    # optional

    paylines_layout:            # optional — for sheet-based paylines
      blocks: [...]             # see paylines.py

    features:                   # ordered list of vendor-specific features
      - type: free_spins
        config:
          header_label: "Free Spins Bonus"
          summary_header: "Bonus Summary"
      - type: cash_eruption_pages
        config:
          page_pattern: "BET MULTIPLIER\\s+(\\d+)"
      - type: linear_progressive
        config:
          summary_sheet: PAR_Summary
"""
from __future__ import annotations
from pathlib import Path
from typing import Any
import re

# We intentionally do NOT depend on PyYAML — the profile files are small
# and avoiding a third-party dep keeps `pip install` zero-friction for
# regulator-lab Python environments. A tiny dependable subset of YAML
# (block mappings + scalars + nested mappings + comments + simple lists)
# is enough for our schema. Anything more exotic falls back to JSON
# (same loader, just `.json` extension allowed too).

import json
import os

PROFILE_DIR = Path(__file__).resolve().parent.parent / "vendor_profiles"


# ---------------------------------------------------------------- mini YAML
# Supports: block mappings (k: v), nested via indent (2 spaces),
# block sequences (- ...), inline lists [a, b, c], int / float / bool / null /
# quoted strings, comments (# ...).
# Sufficient for the schema; bails out with a clear error on anything else.

_INT = re.compile(r"^-?\d+$")
_FLOAT = re.compile(r"^-?\d+\.\d+$")
_INLINE_LIST = re.compile(r"^\[(.*)\]$")
_INLINE_MAP = re.compile(r"^\{(.*)\}$")


def _split_top_level(s: str) -> list[str]:
    """Split on commas outside braces/brackets/quotes."""
    out: list[str] = []
    buf: list[str] = []
    depth = 0
    in_s: str | None = None
    for ch in s:
        if in_s:
            buf.append(ch)
            if ch == in_s:
                in_s = None
            continue
        if ch in ("'", '"'):
            in_s = ch
            buf.append(ch)
            continue
        if ch in "[{":
            depth += 1
            buf.append(ch)
            continue
        if ch in "]}":
            depth -= 1
            buf.append(ch)
            continue
        if ch == "," and depth == 0:
            out.append("".join(buf).strip())
            buf = []
            continue
        buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def _scalar(v: str):
    v = v.strip()
    if v == "":
        return None
    if v == "null" or v == "~":
        return None
    if v == "true":
        return True
    if v == "false":
        return False
    if _INT.match(v):
        return int(v)
    if _FLOAT.match(v):
        return float(v)
    m = _INLINE_LIST.match(v)
    if m:
        inner = m.group(1).strip()
        if not inner:
            return []
        return [_scalar(p) for p in _split_top_level(inner)]
    m = _INLINE_MAP.match(v)
    if m:
        inner = m.group(1).strip()
        if not inner:
            return {}
        out: dict = {}
        for pair in _split_top_level(inner):
            if ":" not in pair:
                raise ValueError(f"inline map needs 'k: v' pairs, got {pair!r}")
            k, _, val = pair.partition(":")
            out[k.strip()] = _scalar(val)
        return out
    # double-quoted: interpret \n \t \\ \" \r
    if v.startswith('"') and v.endswith('"') and len(v) >= 2:
        inner = v[1:-1]
        out: list[str] = []
        i = 0
        while i < len(inner):
            ch = inner[i]
            if ch == "\\" and i + 1 < len(inner):
                nx = inner[i + 1]
                out.append({"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "'": "'"}.get(nx, nx))
                i += 2
            else:
                out.append(ch)
                i += 1
        return "".join(out)
    # single-quoted: literal (only '' → ')
    if v.startswith("'") and v.endswith("'") and len(v) >= 2:
        return v[1:-1].replace("''", "'")
    return v


def _strip_comment(line: str) -> str:
    # naive: # outside quotes starts a comment
    out = []
    in_s = None
    for ch in line:
        if in_s:
            out.append(ch)
            if ch == in_s:
                in_s = None
            continue
        if ch in ("'", '"'):
            in_s = ch
            out.append(ch)
            continue
        if ch == "#":
            break
        out.append(ch)
    return "".join(out).rstrip()


def _parse_yaml(text: str) -> Any:
    """Tiny YAML subset → Python structure. Sufficient for our schema."""
    # Pre-process: keep non-empty, non-comment lines with indent metadata.
    lines: list[tuple[int, str]] = []
    for raw in text.splitlines():
        stripped = _strip_comment(raw)
        if not stripped.strip():
            continue
        indent = len(stripped) - len(stripped.lstrip(" "))
        lines.append((indent, stripped.strip()))

    def parse_block(start: int, base_indent: int) -> tuple[Any, int]:
        # Detect: dict (k: v) vs list (- ...)
        if start >= len(lines):
            return None, start
        first_indent, first_text = lines[start]
        if first_indent < base_indent:
            return None, start
        if first_text.startswith("- "):
            return parse_list(start, base_indent)
        return parse_dict(start, base_indent)

    def parse_dict(start: int, base_indent: int) -> tuple[dict, int]:
        out: dict = {}
        i = start
        while i < len(lines):
            indent, text = lines[i]
            if indent < base_indent:
                break
            if indent > base_indent:
                # shouldn't happen — caller should have recursed
                raise ValueError(f"unexpected indent at line {i}: {text!r}")
            if ":" not in text:
                raise ValueError(f"expected 'key: value' at line {i}: {text!r}")
            key, _, rest = text.partition(":")
            key = key.strip()
            rest = rest.strip()
            if rest == "":
                # nested
                child, ni = parse_block(i + 1, base_indent + 2)
                out[key] = child if child is not None else {}
                i = ni
            else:
                out[key] = _scalar(rest)
                i += 1
        return out, i

    def parse_list(start: int, base_indent: int) -> tuple[list, int]:
        out: list = []
        i = start
        while i < len(lines):
            indent, text = lines[i]
            if indent < base_indent or not text.startswith("- "):
                break
            if indent > base_indent:
                raise ValueError(f"unexpected list indent at line {i}: {text!r}")
            payload = text[2:].strip()
            if payload == "":
                child, ni = parse_block(i + 1, base_indent + 2)
                out.append(child if child is not None else {})
                i = ni
            elif ":" in payload:
                # inline first key, rest of mapping continues on next indented lines
                key, _, rest = payload.partition(":")
                key = key.strip()
                rest = rest.strip()
                d: dict = {}
                if rest == "":
                    child, ni = parse_block(i + 1, base_indent + 2)
                    d[key] = child if child is not None else {}
                    i = ni
                else:
                    d[key] = _scalar(rest)
                    i += 1
                # Continue collecting mapping entries that belong to this list item
                while i < len(lines):
                    indent2, text2 = lines[i]
                    if indent2 != base_indent + 2:
                        break
                    if text2.startswith("- "):
                        break
                    if ":" not in text2:
                        raise ValueError(f"expected mapping in list item at line {i}: {text2!r}")
                    k2, _, r2 = text2.partition(":")
                    k2 = k2.strip()
                    r2 = r2.strip()
                    if r2 == "":
                        child, ni = parse_block(i + 1, base_indent + 4)
                        d[k2] = child if child is not None else {}
                        i = ni
                    else:
                        d[k2] = _scalar(r2)
                        i += 1
                out.append(d)
            else:
                out.append(_scalar(payload))
                i += 1
        return out, i

    if not lines:
        return {}
    data, _ = parse_dict(0, lines[0][0])
    return data


# ---------------------------------------------------------------- VendorProfile

class VendorProfile:
    """Validated vendor profile. Raises `ValueError` on schema violation."""

    REQUIRED_TOP = ("vendor", "display_name", "profile_version", "sheets", "meta", "dimensions")

    def __init__(self, data: dict, path: Path | None = None):
        self.data = data
        self.path = path
        self._validate()

    def _validate(self):
        for k in self.REQUIRED_TOP:
            if k not in self.data:
                raise ValueError(f"vendor profile missing required key: {k!r} (in {self.path})")
        v = self.data["profile_version"]
        if not isinstance(v, int) or v < 1:
            raise ValueError(f"profile_version must be positive int, got {v!r}")
        sheets = self.data["sheets"]
        if not isinstance(sheets, dict) or "main_par" not in sheets:
            raise ValueError("sheets.main_par is required")

    # convenience accessors
    @property
    def vendor(self) -> str:
        return self.data["vendor"]

    @property
    def display_name(self) -> str:
        return self.data["display_name"]

    @property
    def sheets(self) -> dict:
        return self.data["sheets"]

    @property
    def dimensions(self) -> dict:
        return self.data["dimensions"]

    @property
    def features(self) -> list[dict]:
        return self.data.get("features", []) or []

    def get(self, key: str, default=None):
        return self.data.get(key, default)

    def __repr__(self) -> str:
        return f"VendorProfile({self.vendor!r} v{self.data['profile_version']})"


def load_profile(vendor_or_path: str, *, search_dirs: list[Path] | None = None) -> VendorProfile:
    """Load a vendor profile by short id (`lw`, `igt`, …) or absolute path.

    Search order for short ids:
      1. Explicit search_dirs (first match wins)
      2. `tools/vendor_profiles/<id>.yaml`
      3. `tools/vendor_profiles/<id>.yml`
      4. `tools/vendor_profiles/<id>.json`
      5. $SLOT_VENDOR_PROFILE_DIR (env var override)
    """
    p = Path(vendor_or_path)
    if p.exists() and p.is_file():
        return _load_file(p)

    dirs: list[Path] = []
    if search_dirs:
        dirs.extend(search_dirs)
    dirs.append(PROFILE_DIR)
    env = os.environ.get("SLOT_VENDOR_PROFILE_DIR")
    if env:
        dirs.append(Path(env))

    for d in dirs:
        for ext in (".yaml", ".yml", ".json"):
            cand = d / f"{vendor_or_path}{ext}"
            if cand.exists():
                return _load_file(cand)

    raise FileNotFoundError(
        f"vendor profile {vendor_or_path!r} not found. Searched: "
        + ", ".join(str(d) for d in dirs)
    )


def _load_file(path: Path) -> VendorProfile:
    text = path.read_text()
    if path.suffix == ".json":
        data = json.loads(text)
    else:
        data = _parse_yaml(text)
    return VendorProfile(data, path=path)


def list_profiles(search_dir: Path | None = None) -> list[str]:
    """List available vendor profile short ids."""
    d = search_dir or PROFILE_DIR
    if not d.exists():
        return []
    out = set()
    for p in d.iterdir():
        if p.suffix in (".yaml", ".yml", ".json") and not p.name.startswith("_"):
            out.add(p.stem)
    return sorted(out)
