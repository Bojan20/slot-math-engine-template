"""W6.1 — GDD PDF → semi-structured JSON extractor.

Heuristic-driven section detection + table parsing. Supports:
  - 5-reel × 3/4-row games with fixed paylines (most common)
  - Lines / Ways / Megaways layouts
  - Free Spins / Hold-and-Win / Pick Bonus feature blocks
  - Bet table (min/max BM)
  - RTP / hit frequency / volatility targets

No external NLP — uses regex + section heading matching. Each parser
function is independently testable.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pypdf


# ─── PDF → flat lines ───────────────────────────────────────────────────


def pdf_to_lines(pdf_path: Path) -> list[str]:
    """Extract all text lines from a PDF in reading order.

    pypdf.PdfReader.extract_text() concatenates pages with form feed;
    we split, strip blanks, and return a flat list. Multi-line spans
    are NOT joined — section parsers expect line-by-line iteration.
    """
    reader = pypdf.PdfReader(str(pdf_path))
    out: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped:
                out.append(stripped)
    return out


# ─── Section heading detection ──────────────────────────────────────────


# Canonical section name → regex patterns matching common GDD headings.
SECTION_PATTERNS: dict[str, list[str]] = {
    "meta": [
        r"^game\s+(name|title|info(rmation)?)\s*[:]*",
        r"^math\s+(model|specification|summary)\s*[:]*",
        r"^overview\s*[:]*",
    ],
    "topology": [
        r"^reel\s+configuration\s*[:]*",
        r"^grid\s+(layout|size|configuration)\s*[:]*",
        r"^reels?\s*[:]*\s*\d+\s*(x|×|by)\s*\d+",
    ],
    "rtp": [
        r"^rtp(\s+target)?\s*[:]*",
        r"^return\s+to\s+player\s*[:]*",
        r"^target\s+rtp\s*[:]*",
    ],
    "volatility": [
        r"^volatility\s*[:]*",
        r"^variance\s*[:]*",
        r"^volatility\s+(index|class|level)\s*[:]*",
    ],
    "hit_frequency": [
        r"^hit\s+frequency\s*[:]*",
        r"^hit\s+rate\s*[:]*",
    ],
    "paylines": [
        r"^paylines?\s*[:]*",
        r"^win\s+lines\s*[:]*",
        r"^lines\s*[:]*\s*\d",
    ],
    "paytable": [
        r"^paytable\s*[:]*",
        r"^pay\s+table\s*[:]*",
        r"^symbol\s+pays\s*[:]*",
    ],
    "free_spins": [
        r"^free\s+spins?\s*(feature|bonus)?\s*[:]*",
        r"^bonus\s+spins?\s*[:]*",
    ],
    "hold_and_win": [
        r"^hold[\s\-]+and[\s\-]+win\s*[:]*",
        r"^hold[\s\-]+win\s+feature\s*[:]*",
        r"^cash\s+collect\s*[:]*",
    ],
    "pick_bonus": [
        r"^pick\s+(bonus|feature)\s*[:]*",
        r"^pick\s+to\s+win\s*[:]*",
    ],
    "bet_range": [
        r"^bet\s+(range|table|multipliers?)\s*[:]*",
        r"^stake\s+range\s*[:]*",
    ],
    "max_win": [
        r"^max(imum)?\s+win\s*[:]*",
        r"^win\s+cap\s*[:]*",
        r"^max\s+payout\s*[:]*",
    ],
}


def _is_heading(line: str, patterns: list[str]) -> bool:
    """Match a line against a list of regex patterns (case-insensitive)."""
    for pat in patterns:
        if re.match(pat, line, flags=re.IGNORECASE):
            return True
    return False


def detect_sections(lines: list[str]) -> dict[str, list[str]]:
    """Split flat line list into per-section line buckets.

    For each line, check if it matches any known section heading. When
    a heading is found, subsequent lines belong to that section until
    the next heading is encountered. Lines before any heading go into
    the synthetic `_prelude` bucket.

    Returns dict {section_name: [verbatim_lines]}.
    """
    sections: dict[str, list[str]] = {"_prelude": []}
    current = "_prelude"
    for line in lines:
        matched_section = None
        for sec_name, pats in SECTION_PATTERNS.items():
            if _is_heading(line, pats):
                matched_section = sec_name
                break
        if matched_section is not None:
            current = matched_section
            sections.setdefault(current, [])
            sections[current].append(line)
        else:
            sections.setdefault(current, []).append(line)
    return sections


# ─── Per-section parsers ────────────────────────────────────────────────


_NUMBER_RX = re.compile(r"(\d+(?:[\.,]\d+)?)")
_PERCENT_RX = re.compile(r"(\d+(?:[\.,]\d+)?)\s*%")


def _parse_number(s: str) -> float | None:
    m = _NUMBER_RX.search(s)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except ValueError:
        return None


def _parse_percent(s: str) -> float | None:
    m = _PERCENT_RX.search(s)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ".")) / 100.0
    except ValueError:
        return None


def parse_topology(section_lines: list[str]) -> dict[str, int]:
    """Extract `reels` × `rows` from text like '5 reels x 3 rows' or
    '5×3 grid'. Returns dict with `reels`, `rows`."""
    out: dict[str, int] = {}
    text = " ".join(section_lines).lower()
    # Pattern 1: "<reels>x<rows>"
    m = re.search(r"(\d+)\s*(?:x|×|by)\s*(\d+)", text)
    if m:
        out["reels"] = int(m.group(1))
        out["rows"] = int(m.group(2))
    # Pattern 2: explicit "N reels" / "N rows"
    m2 = re.search(r"(\d+)\s+reels", text)
    if m2 and "reels" not in out:
        out["reels"] = int(m2.group(1))
    m3 = re.search(r"(\d+)\s+rows", text)
    if m3 and "rows" not in out:
        out["rows"] = int(m3.group(1))
    return out


def parse_rtp(section_lines: list[str]) -> float | None:
    """RTP is usually a single percentage on the section heading or
    the next line."""
    for line in section_lines:
        p = _parse_percent(line)
        if p is not None and 0.7 <= p <= 1.0:
            return p
    return None


def parse_volatility(section_lines: list[str]) -> str | None:
    """Returns 'low' / 'medium' / 'high' / 'ultra' or numeric index."""
    text = " ".join(section_lines).lower()
    for level in ("ultra", "very high", "high", "medium", "low"):
        if level in text:
            return level.replace(" ", "_")
    # Numeric VI
    m = re.search(r"vi\s*[:=]\s*([\d\.]+)", text)
    if m:
        try:
            return f"vi:{float(m.group(1))}"
        except ValueError:
            pass
    return None


def parse_paylines(section_lines: list[str]) -> int | None:
    """Number of paylines (in either order: '20 paylines' OR
    'Paylines: 20')."""
    patterns = [
        r"(\d+)\s*(?:lines?|paylines?|ways?)",
        r"(?:lines?|paylines?|ways?)\s*[:=]?\s*(\d+)",
    ]
    for line in section_lines:
        for pat in patterns:
            m = re.search(pat, line, re.IGNORECASE)
            if m:
                n = int(m.group(1))
                if 1 <= n <= 117_649:  # Megaways cap
                    return n
    return None


def parse_paytable(section_lines: list[str]) -> list[dict[str, Any]]:
    """Extract paytable entries from lines like
        '<Symbol>  3-OAK  10x'   or
        'Red7    5x   1000'      or
        'Bell  3 100  4 250  5 1000'.

    Returns list of {"symbol", "count", "pays"} dicts.
    """
    entries: list[dict[str, Any]] = []
    for line in section_lines:
        # Multi-tier on one line: "Bell  3 100 4 250 5 1000"
        m_multi = re.match(
            r"^([A-Za-z][A-Za-z0-9 _\-]*?)\s+"
            r"3\s+(\d+(?:\.\d+)?)\s+"
            r"4\s+(\d+(?:\.\d+)?)\s+"
            r"5\s+(\d+(?:\.\d+)?)\s*$",
            line.strip(),
        )
        if m_multi:
            sym = m_multi.group(1).strip()
            for cnt, pay in [(3, m_multi.group(2)),
                             (4, m_multi.group(3)),
                             (5, m_multi.group(4))]:
                entries.append({"symbol": sym, "count": cnt, "pays": float(pay)})
            continue
        # Single entry: "Red7 5-OAK 1000" / "Red7   5    1000"
        m_single = re.match(
            r"^([A-Za-z][A-Za-z0-9 _\-]*?)\s+"
            r"(?:(\d+)[-\s]*OAK|of[-\s]*a[-\s]*kind\s+(\d+)|(\d+)x)\s+"
            r"(\d+(?:\.\d+)?)\s*$",
            line.strip(),
            re.IGNORECASE,
        )
        if m_single:
            sym = m_single.group(1).strip()
            count_str = m_single.group(2) or m_single.group(3) or m_single.group(4)
            try:
                count = int(count_str)
            except (TypeError, ValueError):
                continue
            pay = float(m_single.group(5))
            entries.append({"symbol": sym, "count": count, "pays": pay})
    return entries


def parse_free_spins(section_lines: list[str]) -> dict[str, Any] | None:
    """Extract trigger + initial spins + retrigger."""
    text = " ".join(section_lines)
    out: dict[str, Any] = {}
    # "3 scatters trigger 10 free spins"
    m = re.search(
        r"(\d+)\s+(?:scatter|bonus|wild)\w*\s+(?:trigger|award)s?\s+"
        r"(\d+)\s+(?:free\s+)?spins?",
        text, re.IGNORECASE,
    )
    if m:
        out["trigger_count_min"] = int(m.group(1))
        out["initial_spins"] = int(m.group(2))
    # "Retrigger awards +N free spins" / "retrigger +N spins"
    m2 = re.search(r"retrigger\D{0,20}(\d+)\s+(?:free\s+)?spins?",
                   text, re.IGNORECASE)
    if m2:
        out["retrigger_spins"] = int(m2.group(1))
    # "Max N spins"
    m3 = re.search(r"max(?:imum)?\D{0,20}(\d+)\s+(?:free\s+)?spins?",
                   text, re.IGNORECASE)
    if m3:
        out["max_total_spins"] = int(m3.group(1))
    return out or None


def parse_bet_range(section_lines: list[str]) -> dict[str, float] | None:
    """Extract min/max bet."""
    text = " ".join(section_lines)
    out: dict[str, float] = {}
    m_min = re.search(r"min(?:imum)?\s*(?:bet|stake)?\s*[:=]?\s*(\d+(?:\.\d+)?)",
                      text, re.IGNORECASE)
    m_max = re.search(r"max(?:imum)?\s*(?:bet|stake)?\s*[:=]?\s*(\d+(?:\.\d+)?)",
                      text, re.IGNORECASE)
    if m_min:
        out["min_bet"] = float(m_min.group(1))
    if m_max:
        out["max_bet"] = float(m_max.group(1))
    return out or None


def parse_max_win(section_lines: list[str]) -> float | None:
    """Max win in × total bet (e.g. '5000x')."""
    text = " ".join(section_lines)
    m = re.search(r"(\d+(?:[\.,]\d+)?)\s*(?:x|×)\s*(?:total\s*bet|bet|stake)?",
                  text, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1).replace(",", "."))
        except ValueError:
            return None
    return None


# ─── Top-level orchestrator ─────────────────────────────────────────────


def extract_gdd(pdf_path: Path) -> dict[str, Any]:
    """Read a GDD PDF and emit a semi-structured math summary.

    Always returns at minimum:
        {"meta": {}, "raw_sections": {<section>: <text>}}

    Other keys populated when section detection finds the relevant
    block. Each per-section parser silently no-ops on absent data
    (returns None / empty), so even minimal GDDs produce a usable
    skeleton.
    """
    lines = pdf_to_lines(pdf_path)
    sections = detect_sections(lines)

    out: dict[str, Any] = {
        "meta": {},
        "raw_sections": {k: "\n".join(v) for k, v in sections.items()
                          if k != "_prelude"},
    }

    # Topology
    if "topology" in sections:
        topo = parse_topology(sections["topology"])
        if topo:
            out["topology"] = topo

    # RTP
    rtp = None
    if "rtp" in sections:
        rtp = parse_rtp(sections["rtp"])
    if rtp is None and "meta" in sections:
        rtp = parse_rtp(sections["meta"])
    if rtp is not None:
        out["meta"]["target_rtp"] = rtp

    # Volatility
    vol = None
    if "volatility" in sections:
        vol = parse_volatility(sections["volatility"])
    if vol is not None:
        out["meta"]["volatility"] = vol

    # Paylines count
    if "paylines" in sections:
        pl = parse_paylines(sections["paylines"])
        if pl is not None:
            out.setdefault("topology", {})["paylines"] = pl

    # Paytable
    if "paytable" in sections:
        pt = parse_paytable(sections["paytable"])
        if pt:
            out["paytable"] = pt

    # Free Spins
    if "free_spins" in sections:
        fs = parse_free_spins(sections["free_spins"])
        if fs is not None:
            out.setdefault("features", []).append({
                "kind": "free_spins",
                **fs,
            })

    # Hold-and-Win
    if "hold_and_win" in sections:
        out.setdefault("features", []).append({
            "kind": "hold_and_win",
            "raw": "\n".join(sections["hold_and_win"]),
        })

    # Pick Bonus
    if "pick_bonus" in sections:
        out.setdefault("features", []).append({
            "kind": "pick_bonus",
            "raw": "\n".join(sections["pick_bonus"]),
        })

    # Bet range
    if "bet_range" in sections:
        br = parse_bet_range(sections["bet_range"])
        if br is not None:
            out["bet_range"] = br

    # Max win
    if "max_win" in sections:
        mw = parse_max_win(sections["max_win"])
        if mw is not None:
            out["meta"]["max_win_x"] = mw

    return out
