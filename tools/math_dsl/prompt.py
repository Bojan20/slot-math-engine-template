"""W8.6 — Natural-language prompt → fresh DSL spec.

Designer types a one-liner like:
    "5x3 lines slot, RTP 96, medium volatility, free spins, 20 paylines"

and gets back a complete `MathDslSpec`. The parser is **deterministic
regex** — no LLM call. It recognizes a fixed vocabulary of phrases and
maps them to spec fields; anything unrecognized falls through to the
default value the constructor would emit.

This is the "from-scratch creation" counterpart to W5.4
`apply_mutation` (which edits an existing spec).

Recognized phrases
==================
  TOPOLOGY:
    "<N>x<M>" / "<N> reels <M> rows" / "<N>×<M>" — rectangular
    "megaways" / "variable rows" — variable_rows 6r [2-7] 117k ways
    "cluster" / "cluster pays" — cluster_grid 7×7 orthogonal

  EVALUATION:
    "<N> paylines" / "<N> lines" — explicit line count
    "ways" — implied by megaways topology

  FEATURES:
    "free spins" / "freespins"
    "cascade" / "tumble"
    "hold and win" / "hold-and-win"
    "linear progressive" / "progressive" / "jackpot pool"
    "mystery symbol"
    "ante bet"
    "buy feature"
    "gamble"
    "wheel"
    "pick bonus" / "pick"

  CONSTRAINTS:
    "RTP <X>" / "RTP <X>%" — target_rtp
    "<low|medium|high|ultra> volatility" / "volatility <…>"
    "<X> max win" / "max win <X>x"
    "hit freq <X>" / "<X>% hit freq"
    "jurisdiction <CODE>" / "for <CODE>" (UKGC|MGA|ADM|DGOJ|KSA|NL|...)

  META:
    "name <quoted>" / "game name <quoted>"
    "vendor <id>"

Anything unrecognized → log.errors[]; recognized phrases land in `ops`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .spec import (
    MathDslSpec, SymbolSpec, FeatureSpec, ConstraintsSpec, TopologySpec,
)


@dataclass
class PromptOp:
    kind: str
    description: str
    value: object = None


@dataclass
class PromptLog:
    prompt: str
    ops: list[PromptOp] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


_RTP_RE = re.compile(r"\bRTP[: ]+\s*(\d{2,3}(?:\.\d+)?|0?\.\d+)\s*%?", re.I)
_VOL_RE = re.compile(r"\b(low|medium|high|ultra)\s+volatility|\bvolatility\s+(low|medium|high|ultra)\b", re.I)
_TOPO_RECT_RE = re.compile(r"\b(\d+)\s*[x×]\s*(\d+)\b", re.I)
_PAYLINES_RE = re.compile(r"\b(\d+)\s+(?:paylines?|lines?)\b", re.I)
_MAX_WIN_RE = re.compile(r"\b(?:max\s*win|max-win)\s*[:= ]?\s*([\d_,]+(?:\.\d+)?)\s*x?", re.I)
_HIT_FREQ_RE = re.compile(r"\bhit[-_ ]freq(?:uency)?\s*[:= ]?\s*(\d+(?:\.\d+)?\s*%?)", re.I)
_NAME_RE = re.compile(r"\b(?:game\s+)?name[: ]+['\"]([^'\"]+)['\"]", re.I)
_VENDOR_RE = re.compile(r"\bvendor[: ]+([A-Za-z][A-Za-z0-9_-]+)", re.I)
_JURIS_RE = re.compile(r"\b(?:for\s+|jurisdiction\s+)([A-Z]{2,5})\b")

_FEATURE_PHRASES = {
    "free_spins": [r"free\s*spins?", r"freespins?"],
    "cascade": [r"cascade", r"tumble", r"avalanche"],
    "hold_and_win": [r"hold[\s-]and[\s-]win", r"hold\s*&\s*win"],
    "linear_progressive": [r"linear\s+progressive", r"\bprogressive\b", r"jackpot\s+pool", r"\bwap\b"],
    "mystery_symbol": [r"mystery\s+symbol", r"mystery\s+reveal"],
    "ante_bet": [r"ante\s+bet"],
    "buy_feature": [r"buy[\s-]feature", r"feature\s+buy"],
    "gamble": [r"\bgamble\b", r"red[\s-]black"],
    "wheel": [r"bonus\s+wheel", r"wheel\s+bonus"],
    "pick": [r"pick\s+bonus", r"pick\s+game"],
    "respin": [r"\brespin\b"],
}


def _percentify(s: str) -> float:
    s = s.strip().rstrip("%")
    v = float(s)
    return v / 100.0 if v > 1.5 else v


def _default_symbol_pack() -> list[SymbolSpec]:
    return [
        SymbolSpec(id="wild", kind="wild", substitutes="*"),
        SymbolSpec(id="scatter", kind="scatter"),
        SymbolSpec(id="hp_a", kind="hp"),
        SymbolSpec(id="hp_b", kind="hp"),
        SymbolSpec(id="lp_a", kind="lp"),
        SymbolSpec(id="lp_k", kind="lp"),
        SymbolSpec(id="lp_q", kind="lp"),
        SymbolSpec(id="lp_j", kind="lp"),
    ]


def _megaways_symbol_pack() -> list[SymbolSpec]:
    return [
        SymbolSpec(id="wild", kind="wild", substitutes="*"),
        SymbolSpec(id="scatter", kind="scatter"),
        SymbolSpec(id="mystery", kind="mystery"),
        SymbolSpec(id="hp_a", kind="hp"),
        SymbolSpec(id="hp_b", kind="hp"),
        SymbolSpec(id="hp_c", kind="hp"),
        SymbolSpec(id="lp_a", kind="lp"),
        SymbolSpec(id="lp_k", kind="lp"),
        SymbolSpec(id="lp_q", kind="lp"),
        SymbolSpec(id="lp_j", kind="lp"),
    ]


def parse_prompt(prompt: str) -> tuple[MathDslSpec, PromptLog]:
    """Parse a one-line natural-language prompt into a fresh
    `MathDslSpec`. Returns (spec, log).
    """
    log = PromptLog(prompt=prompt)
    text = prompt.strip()

    # ─── Topology ────────────────────────────────────────────────────
    topology = TopologySpec(kind="rectangular", reels=5, rows=3)
    symbols = _default_symbol_pack()
    paylines: int = 20
    if re.search(r"\bmegaways\b|\bvariable\s+rows\b", text, re.I):
        topology = TopologySpec(
            kind="variable_rows", reels=6, rows=7,
            row_range_per_reel=[[2, 7]] * 6, ways_cap=117649,
        )
        symbols = _megaways_symbol_pack()
        paylines = 1
        log.ops.append(PromptOp("topology", "megaways 6r [2-7], 117k ways"))
    elif re.search(r"\bcluster(?:\s+pays?)?\b", text, re.I):
        topology = TopologySpec(
            kind="cluster_grid", reels=7, rows=7, columns=7,
            adjacency="orthogonal",
        )
        symbols = _default_symbol_pack()
        paylines = 1
        log.ops.append(PromptOp("topology", "cluster_grid 7×7 orthogonal"))
    else:
        m = _TOPO_RECT_RE.search(text)
        if m:
            r, rows = int(m.group(1)), int(m.group(2))
            topology = TopologySpec(kind="rectangular", reels=r, rows=rows)
            log.ops.append(PromptOp("topology", f"rectangular {r}x{rows}"))

    # ─── Paylines ────────────────────────────────────────────────────
    pl_m = _PAYLINES_RE.search(text)
    if pl_m and topology.kind == "rectangular":
        paylines = int(pl_m.group(1))
        log.ops.append(PromptOp("paylines", f"{paylines}"))

    # ─── Features ────────────────────────────────────────────────────
    features: list[FeatureSpec] = []
    seen: set[str] = set()
    for kind, patterns in _FEATURE_PHRASES.items():
        for pat in patterns:
            if re.search(pat, text, re.I):
                if kind in seen:
                    break
                seen.add(kind)
                if kind == "free_spins":
                    features.append(FeatureSpec(
                        kind="free_spins",
                        trigger_count_min=3,
                        initial_spins=10,
                        global_multiplier=2.0,
                    ))
                elif kind == "linear_progressive":
                    features.append(FeatureSpec(
                        kind="linear_progressive",
                        pool_id="default-progressive",
                        contribution_x=0.005,
                        seed_x=100.0,
                    ))
                elif kind == "cascade":
                    features.append(FeatureSpec(
                        kind="cascade", replacement="drop", max_chain=20,
                    ))
                elif kind == "hold_and_win":
                    features.append(FeatureSpec(
                        kind="hold_and_win",
                        trigger_count_min=6, respins_initial=3,
                    ))
                else:
                    features.append(FeatureSpec(kind=kind))
                log.ops.append(PromptOp("feature_add", f"+{kind}"))
                break
    # Megaways gets mystery_symbol by default
    if topology.kind == "variable_rows" and "mystery_symbol" not in seen:
        features.append(FeatureSpec(kind="mystery_symbol"))

    # ─── Constraints ─────────────────────────────────────────────────
    constraints = ConstraintsSpec()
    rtp_m = _RTP_RE.search(text)
    if rtp_m:
        constraints.target_rtp = _percentify(rtp_m.group(1))
        log.ops.append(PromptOp("rtp", f"target_rtp={constraints.target_rtp:.4f}"))

    vol_m = _VOL_RE.search(text)
    if vol_m:
        constraints.volatility_class = (vol_m.group(1) or vol_m.group(2)).lower()
        log.ops.append(PromptOp("volatility", constraints.volatility_class))

    mw_m = _MAX_WIN_RE.search(text)
    if mw_m:
        constraints.max_win_x = float(mw_m.group(1).replace(",", "").replace("_", ""))
        log.ops.append(PromptOp("max_win", f"{constraints.max_win_x}"))

    hf_m = _HIT_FREQ_RE.search(text)
    if hf_m:
        constraints.hit_freq_target = _percentify(hf_m.group(1))
        log.ops.append(PromptOp("hit_freq", f"{constraints.hit_freq_target:.3f}"))

    # ─── Meta ────────────────────────────────────────────────────────
    meta: dict = {"name": "Untitled Slot"}
    name_m = _NAME_RE.search(text)
    if name_m:
        meta["name"] = name_m.group(1)
        log.ops.append(PromptOp("name", meta["name"]))
    vendor_m = _VENDOR_RE.search(text)
    if vendor_m:
        meta["vendor"] = vendor_m.group(1)
        log.ops.append(PromptOp("vendor", meta["vendor"]))

    # ─── Jurisdictions ───────────────────────────────────────────────
    juris = []
    for jm in _JURIS_RE.finditer(text):
        code = jm.group(1).upper()
        if code in {"UKGC", "MGA", "ADM", "DGOJ", "KSA", "NL", "NMI", "GLI", "BMM"}:
            juris.append(code)
    if juris:
        constraints.jurisdictions = list(dict.fromkeys(juris))  # dedupe
        log.ops.append(PromptOp("jurisdictions", ", ".join(constraints.jurisdictions)))

    spec = MathDslSpec(
        schema_version="1.0.0",
        meta=meta,
        topology=topology,
        symbols=symbols,
        features=features,
        paylines=paylines,
        constraints=constraints,
        hints={"reel_length": 50},
    )
    return spec, log


def list_prompt_grammar() -> list[str]:
    return [
        "5x3 lines slot, RTP 96, medium volatility, free spins, 20 paylines",
        "megaways with progressive, RTP 96.5%, high volatility, for UKGC",
        "cluster pays, cascade, RTP 95, high volatility, max win 10000",
        "6x4 hold-and-win, RTP 97, ultra volatility, name 'Diamond Crown'",
    ]
