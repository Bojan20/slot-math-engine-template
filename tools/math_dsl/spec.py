"""W5.1 — Math DSL parser + validator.

DSL shape (YAML)
================

    schema_version: "1.0.0"
    meta:
      name: "Crimson Tiger"
      vendor: "vendor_b"
      author: "designer@studio"

    topology:
      kind: rectangular   # rectangular | variable_rows | cluster_grid
      reels: 5
      rows: 3
      # variable_rows: row_range_per_reel: [[2,7], [2,7], ...]

    symbols:
      - id: wild
        kind: wild
        substitutes: "*"
      - id: scatter
        kind: scatter
      - id: hp1
        kind: hp
      - id: hp2
        kind: hp
      - id: lp1
        kind: lp
      - id: lp2
        kind: lp

    features:
      - kind: free_spins
        trigger_count_min: 3
        initial_spins: 10
        global_multiplier: 2.0
      - kind: linear_progressive
        pool_id: "wap-grand"
        contribution_x: 0.005
        seed_x: 100

    paylines: 20            # int OR explicit array per reel

    constraints:
      target_rtp: 0.96
      rtp_tolerance: 0.005
      volatility_class: high    # low | medium | high | ultra
      hit_freq_target: 0.22
      max_win_x: 25000
      jurisdictions: [UKGC, MGA, ADM]
      pay_ladder_monotonic: true   # pay_3 < pay_4 < pay_5
      pay_min: 1.0
      pay_max: 10000.0

    # Optional hints to seed the solver
    hints:
      reel_length: 60
      wild_share: 0.03
      scatter_share: 0.02

The parser is pure-stdlib YAML-subset (mirrors tools.parse_par.profile);
no PyYAML dependency so it ships in the slim distro. Round-trip safe.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


class DslParseError(ValueError):
    """Raised when DSL YAML is malformed or fails semantic validation."""


# ─── Sub-spec dataclasses ────────────────────────────────────────────────


@dataclass
class TopologySpec:
    kind: str  # rectangular | variable_rows | cluster_grid
    reels: int = 5
    rows: int = 3
    row_range_per_reel: Optional[list[list[int]]] = None  # variable_rows
    columns: Optional[int] = None  # cluster_grid
    adjacency: Optional[str] = None  # orthogonal | diagonal | hex
    ways_cap: Optional[int] = None  # for variable_rows Megaways


@dataclass
class SymbolSpec:
    id: str
    kind: str  # lp | hp | wild | scatter | bonus | multiplier | sticky | expanding | mystery | transform | chain_wild
    name: Optional[str] = None
    substitutes: Optional[Any] = None  # list[str] | "*"
    weight_hint: Optional[float] = None


@dataclass
class FeatureSpec:
    kind: str  # free_spins | hold_and_win | cascade | respin | pick | wheel | buy_feature | ante_bet | gamble | mystery_symbol | symbol_upgrade | linear_progressive | money_collect
    # Free spins
    trigger_count_min: Optional[int] = None
    initial_spins: Optional[int] = None
    global_multiplier: Optional[float] = None
    retrigger_spins: Optional[int] = None
    max_total_spins: Optional[int] = None
    # Hold and win
    respins_initial: Optional[int] = None
    # Cascade
    replacement: Optional[str] = None
    max_chain: Optional[int] = None
    # Linear progressive
    pool_id: Optional[str] = None
    contribution_x: Optional[float] = None
    seed_x: Optional[float] = None
    must_hit_by_x: Optional[float] = None
    # Pick / wheel
    awards: Optional[list[dict]] = None
    # Money-collect — W244 wave 10. Trigger: ≥ trigger_count_min money
    # symbols on initial spin opens a 3-respin "cash bonus" mode. Each
    # landed money symbol locks + resets respin counter. Each money
    # symbol carries a value drawn from `money_value_weights` (× bet).
    # Episode total = SUM(locked money values).
    # Standard industry shape (Cash Eruption, Money Train, Coin Volcano).
    money_trigger_count_min: Optional[int] = None    # e.g. 6
    money_respins_reset: Optional[int] = None         # respin pool, default 3
    money_value_weights: Optional[dict[float, float]] = None  # {value_x_bet: weight}
    money_grid_cap: Optional[int] = None              # e.g. 15 (5×3 full)
    money_symbol_id: Optional[str] = None             # "$" / "coin"
    # Charge meter — W244 wave 11. Energy meter grows by
    # `charge_per_spin` (mean) each spin; reaching `charge_threshold`
    # fires the tier's `charge_award_x_bet` award (credit/multiplier/
    # free-spin/feature-token) and rolls excess forward. Multi-tier
    # supported via `charge_tiers` list. Used by NetEnt Starburst-like
    # meters, Pragmatic Power Stacks, Relax Money Cart meter mode.
    charge_per_spin: Optional[float] = None           # mean charge per spin
    charge_threshold: Optional[float] = None          # single-tier shortcut
    charge_award_x_bet: Optional[float] = None        # single-tier award
    charge_tiers: Optional[list[dict]] = None         # [{name, threshold, award_value_x_bet, award_kind}]
    charge_persistent: Optional[bool] = None          # survives session boundary
    # Must-hit-by jackpot — W244 wave 12. Mystery pot guaranteed to
    # hit by `mhb_must_hit_by_x_bet` cumulative bet. Multi-tier supported.
    # Used by IGT Lightning Link, Aristocrat Dragon Link, Scientific Games
    # Dollar Storm, all NGCB-cert mystery pots.
    mhb_pots: Optional[list[dict]] = None             # [{name, seed_x_bet, contribution_x, must_hit_by_x_bet, p_strike_per_spin}]
    # Generic catch-all so designer can pass vendor-specific keys
    extra: dict = field(default_factory=dict)


@dataclass
class ConstraintsSpec:
    target_rtp: float = 0.96
    rtp_tolerance: float = 0.005
    volatility_class: str = "medium"  # low | medium | high | ultra
    hit_freq_target: float = 0.25
    max_win_x: float = 5000.0
    win_cap_apply: str = "per_spin"
    jurisdictions: list[str] = field(default_factory=lambda: ["UKGC", "MGA"])
    pay_ladder_monotonic: bool = True
    pay_min: float = 1.0
    pay_max: float = 10_000.0
    # RTP allocation hints
    rtp_alloc_base: Optional[float] = None
    rtp_alloc_free_spins: Optional[float] = None
    rtp_alloc_hold_and_win: Optional[float] = None
    rtp_alloc_jackpot: Optional[float] = None


@dataclass
class MathDslSpec:
    schema_version: str
    meta: dict
    topology: TopologySpec
    symbols: list[SymbolSpec]
    features: list[FeatureSpec]
    paylines: Any  # int (line count) | list[list[int]] (explicit shapes)
    constraints: ConstraintsSpec
    hints: dict = field(default_factory=dict)


# ─── YAML mini-parser (stdlib-only, deliberate subset) ──────────────────


def _parse_yaml_subset(text: str) -> Any:
    """Parses a deliberately tiny YAML subset:
      • key: value
      • key:
          - item
          - item
      • nested maps via indentation (2-space)
      • inline lists: `[a, b, c]`
      • numbers, strings (with or without quotes), booleans, null
      • dict items as `key: value` lines

    No anchors, no merges, no multi-line strings — slot DSL doesn't need them.
    Mirrors `tools/parse_par/profile.py::_mini_yaml`.
    """
    lines = text.splitlines()
    # Strip comments + trailing whitespace
    cleaned: list[tuple[int, str]] = []
    for raw in lines:
        # Remove `#`-prefixed comments (but preserve `#` inside quoted strings)
        in_q: Optional[str] = None
        out_chars: list[str] = []
        for ch in raw:
            if in_q:
                out_chars.append(ch)
                if ch == in_q:
                    in_q = None
                continue
            if ch in ('"', "'"):
                in_q = ch
                out_chars.append(ch)
                continue
            if ch == "#":
                break
            out_chars.append(ch)
        stripped_raw = "".join(out_chars).rstrip()
        if not stripped_raw.strip():
            continue
        indent = len(stripped_raw) - len(stripped_raw.lstrip(" "))
        cleaned.append((indent, stripped_raw.lstrip(" ")))

    def coerce(v: str) -> Any:
        v = v.strip()
        if not v:
            return None
        if v.lower() in ("true", "yes", "on"):
            return True
        if v.lower() in ("false", "no", "off"):
            return False
        if v.lower() in ("null", "none", "~"):
            return None
        if v.startswith('"') and v.endswith('"') and len(v) >= 2:
            return v[1:-1]
        if v.startswith("'") and v.endswith("'") and len(v) >= 2:
            return v[1:-1]
        if v.startswith("[") and v.endswith("]"):
            inner = v[1:-1].strip()
            if not inner:
                return []
            return [coerce(x) for x in _split_top_commas(inner)]
        # Numeric
        try:
            if "." in v or "e" in v or "E" in v:
                return float(v)
            return int(v)
        except ValueError:
            return v

    def _split_top_commas(s: str) -> list[str]:
        depth = 0
        out: list[str] = []
        buf: list[str] = []
        for ch in s:
            if ch in "[{":
                depth += 1
            elif ch in "]}":
                depth -= 1
            if ch == "," and depth == 0:
                out.append("".join(buf).strip())
                buf = []
                continue
            buf.append(ch)
        if buf:
            out.append("".join(buf).strip())
        return out

    # Recursive descent: at each call, parent_indent < first_indent.
    def parse_block(start: int, parent_indent: int) -> tuple[Any, int]:
        if start >= len(cleaned):
            return None, start
        block_indent = cleaned[start][0]
        if block_indent <= parent_indent:
            return None, start
        # List?
        if cleaned[start][1].startswith("- "):
            items: list[Any] = []
            i = start
            while i < len(cleaned):
                ind, line = cleaned[i]
                if ind < block_indent:
                    break
                if ind == block_indent and line.startswith("- "):
                    item_body = line[2:].strip()
                    if ":" in item_body and not item_body.startswith('"'):
                        # Item is a dict that starts on this line
                        k_v = item_body.split(":", 1)
                        key = k_v[0].strip()
                        val = k_v[1].strip()
                        item_dict: dict = {}
                        if val:
                            item_dict[key] = coerce(val)
                        else:
                            child, ni = parse_block(i + 1, ind + 1)
                            item_dict[key] = child
                            i = ni
                            items.append(item_dict)
                            continue
                        # peek for additional keys at indent > block_indent
                        j = i + 1
                        while j < len(cleaned) and cleaned[j][0] > block_indent and not cleaned[j][1].startswith("- "):
                            sub_ind, sub_line = cleaned[j]
                            if ":" in sub_line:
                                sk, sv = sub_line.split(":", 1)
                                sk = sk.strip()
                                sv = sv.strip()
                                if sv:
                                    item_dict[sk] = coerce(sv)
                                    j += 1
                                else:
                                    child, nj = parse_block(j + 1, sub_ind)
                                    item_dict[sk] = child
                                    j = nj
                            else:
                                j += 1
                        items.append(item_dict)
                        i = j
                        continue
                    items.append(coerce(item_body))
                    i += 1
                else:
                    break
            return items, i
        # Map
        d: dict = {}
        i = start
        while i < len(cleaned):
            ind, line = cleaned[i]
            if ind < block_indent:
                break
            if ind != block_indent:
                i += 1
                continue
            if ":" not in line:
                i += 1
                continue
            k, v = line.split(":", 1)
            k = k.strip()
            v = v.strip()
            if v:
                d[k] = coerce(v)
                i += 1
            else:
                child, ni = parse_block(i + 1, ind)
                d[k] = child
                i = ni
        return d, i

    root, _ = parse_block(0, -1)
    return root or {}


# ─── DSL parse entry-point ───────────────────────────────────────────────


_VALID_SYMBOL_KINDS = {
    "lp", "hp", "wild", "scatter", "bonus", "multiplier",
    "sticky", "expanding", "mystery", "transform", "chain_wild",
}

_VALID_VOLATILITY = {"low", "medium", "high", "ultra"}

_VALID_FEATURE_KINDS = {
    "free_spins", "hold_and_win", "cascade", "respin", "pick", "wheel",
    "buy_feature", "ante_bet", "gamble", "mystery_symbol", "symbol_upgrade",
    "linear_progressive",
    # W244 wave 10 — Cash Eruption / Money Train / Coin Volcano pattern.
    "money_collect",
    # W244 wave 11 — Charge meter (Starburst-like, Money Cart meter mode).
    "charge_meter",
    # W244 wave 12 — Mystery / "Must Hit By" jackpot (NGCB, IGT, Aristocrat).
    "must_hit_by",
}


def parse_spec(text: str) -> MathDslSpec:
    """Parse YAML DSL text → validated `MathDslSpec`.

    Raises `DslParseError` with a detailed message if any of the
    structural / semantic invariants fail.
    """
    raw = _parse_yaml_subset(text)
    if not isinstance(raw, dict):
        raise DslParseError("top-level YAML must be a mapping")

    schema_version = str(raw.get("schema_version") or "1.0.0")
    meta = raw.get("meta") or {}
    if not isinstance(meta, dict):
        raise DslParseError("`meta` must be a mapping")
    if not meta.get("name"):
        raise DslParseError("`meta.name` is required")

    # Topology
    top_raw = raw.get("topology") or {}
    if not isinstance(top_raw, dict):
        raise DslParseError("`topology` must be a mapping")
    kind = str(top_raw.get("kind") or "rectangular")
    if kind not in ("rectangular", "variable_rows", "cluster_grid"):
        raise DslParseError(f"unknown topology.kind {kind!r}")
    topology = TopologySpec(
        kind=kind,
        reels=int(top_raw.get("reels") or 5),
        rows=int(top_raw.get("rows") or 3),
        row_range_per_reel=top_raw.get("row_range_per_reel"),
        columns=top_raw.get("columns"),
        adjacency=top_raw.get("adjacency"),
        ways_cap=top_raw.get("ways_cap"),
    )
    if kind == "variable_rows":
        if not topology.row_range_per_reel:
            raise DslParseError(
                "topology.row_range_per_reel is required for variable_rows"
            )
        if len(topology.row_range_per_reel) != topology.reels:
            raise DslParseError(
                f"row_range_per_reel length ({len(topology.row_range_per_reel)}) "
                f"must equal topology.reels ({topology.reels})"
            )

    # Symbols
    syms_raw = raw.get("symbols") or []
    if not isinstance(syms_raw, list):
        raise DslParseError("`symbols` must be a list")
    if len(syms_raw) < 2:
        raise DslParseError("at least 2 symbols required")
    symbols: list[SymbolSpec] = []
    seen_ids: set[str] = set()
    for s in syms_raw:
        if not isinstance(s, dict):
            raise DslParseError(f"symbol entry must be a mapping: {s!r}")
        sid = s.get("id")
        if not sid:
            raise DslParseError("symbol entry missing `id`")
        if sid in seen_ids:
            raise DslParseError(f"duplicate symbol id {sid!r}")
        seen_ids.add(sid)
        skind = str(s.get("kind") or "lp")
        if skind not in _VALID_SYMBOL_KINDS:
            raise DslParseError(
                f"symbol {sid!r} has unknown kind {skind!r}; "
                f"valid: {sorted(_VALID_SYMBOL_KINDS)}"
            )
        symbols.append(SymbolSpec(
            id=str(sid),
            kind=skind,
            name=s.get("name"),
            substitutes=s.get("substitutes"),
            weight_hint=s.get("weight_hint"),
        ))

    # Features
    feats_raw = raw.get("features") or []
    if not isinstance(feats_raw, list):
        raise DslParseError("`features` must be a list")
    features: list[FeatureSpec] = []
    for f in feats_raw:
        if not isinstance(f, dict):
            raise DslParseError(f"feature entry must be a mapping: {f!r}")
        fk = str(f.get("kind") or "")
        if fk not in _VALID_FEATURE_KINDS:
            raise DslParseError(
                f"feature kind {fk!r} not in {sorted(_VALID_FEATURE_KINDS)}"
            )
        # Pull known fields, dump remaining into `extra`.
        known_keys = {
            "kind", "trigger_count_min", "initial_spins", "global_multiplier",
            "retrigger_spins", "max_total_spins", "respins_initial",
            "replacement", "max_chain", "pool_id", "contribution_x", "seed_x",
            "must_hit_by_x", "awards",
            # W244 wave 10 — money_collect known keys
            "money_trigger_count_min", "money_respins_reset",
            "money_value_weights", "money_grid_cap", "money_symbol_id",
            # W244 wave 11 — charge_meter known keys
            "charge_per_spin", "charge_threshold", "charge_award_x_bet",
            "charge_tiers", "charge_persistent",
            # W244 wave 12 — must_hit_by known keys
            "mhb_pots",
        }
        extra = {k: v for k, v in f.items() if k not in known_keys}
        # money_value_weights normalization: YAML can carry float keys as
        # strings; coerce to {float: float} for downstream Z3 / closed-form.
        mvw_raw = f.get("money_value_weights")
        mvw: Optional[dict[float, float]] = None
        if mvw_raw is not None:
            if not isinstance(mvw_raw, dict):
                raise DslParseError(
                    "money_value_weights must be a mapping {value_x_bet: weight}"
                )
            mvw = {}
            for k, v in mvw_raw.items():
                mvw[float(k)] = float(v)
            if not mvw:
                raise DslParseError("money_value_weights must be non-empty")
            if any(v < 0 for v in mvw.values()):
                raise DslParseError("money_value_weights weights must be ≥ 0")
        # charge_tiers validation: list of {name, threshold,
        # award_value_x_bet [, award_kind]} dicts, sorted ascending.
        ct_raw = f.get("charge_tiers")
        ct: Optional[list[dict]] = None
        if ct_raw is not None:
            if not isinstance(ct_raw, list) or not ct_raw:
                raise DslParseError(
                    "charge_tiers must be a non-empty list of {name, threshold, "
                    "award_value_x_bet} dicts"
                )
            for tier in ct_raw:
                if not isinstance(tier, dict):
                    raise DslParseError(f"charge_tiers entry must be mapping: {tier!r}")
                for req in ("name", "threshold", "award_value_x_bet"):
                    if req not in tier:
                        raise DslParseError(
                            f"charge_tiers entry missing required key {req!r}: {tier}"
                        )
                if float(tier["threshold"]) <= 0:
                    raise DslParseError(
                        f"charge_tiers threshold must be > 0: {tier!r}"
                    )
            ct = list(ct_raw)
        # mhb_pots validation: list of {name, seed_x_bet, contribution_x,
        # must_hit_by_x_bet} dicts; p_strike_per_spin optional.
        mhb_raw = f.get("mhb_pots")
        mhb: Optional[list[dict]] = None
        if mhb_raw is not None:
            if not isinstance(mhb_raw, list) or not mhb_raw:
                raise DslParseError(
                    "mhb_pots must be a non-empty list of {name, seed_x_bet, "
                    "contribution_x, must_hit_by_x_bet} dicts"
                )
            for pot in mhb_raw:
                if not isinstance(pot, dict):
                    raise DslParseError(f"mhb_pots entry must be mapping: {pot!r}")
                for req in ("name", "seed_x_bet", "contribution_x", "must_hit_by_x_bet"):
                    if req not in pot:
                        raise DslParseError(
                            f"mhb_pots entry missing required key {req!r}: {pot}"
                        )
                if float(pot["must_hit_by_x_bet"]) <= float(pot["seed_x_bet"]):
                    raise DslParseError(
                        f"mhb_pots must_hit_by_x_bet must exceed seed_x_bet: {pot!r}"
                    )
            mhb = list(mhb_raw)
        features.append(FeatureSpec(
            kind=fk,
            trigger_count_min=f.get("trigger_count_min"),
            initial_spins=f.get("initial_spins"),
            global_multiplier=f.get("global_multiplier"),
            retrigger_spins=f.get("retrigger_spins"),
            max_total_spins=f.get("max_total_spins"),
            respins_initial=f.get("respins_initial"),
            replacement=f.get("replacement"),
            max_chain=f.get("max_chain"),
            pool_id=f.get("pool_id"),
            contribution_x=f.get("contribution_x"),
            seed_x=f.get("seed_x"),
            must_hit_by_x=f.get("must_hit_by_x"),
            awards=f.get("awards"),
            money_trigger_count_min=f.get("money_trigger_count_min"),
            money_respins_reset=f.get("money_respins_reset"),
            money_value_weights=mvw,
            money_grid_cap=f.get("money_grid_cap"),
            money_symbol_id=f.get("money_symbol_id"),
            charge_per_spin=f.get("charge_per_spin"),
            charge_threshold=f.get("charge_threshold"),
            charge_award_x_bet=f.get("charge_award_x_bet"),
            charge_tiers=ct,
            charge_persistent=f.get("charge_persistent"),
            mhb_pots=mhb,
            extra=extra,
        ))

    # Paylines
    paylines = raw.get("paylines") or 1
    if isinstance(paylines, int) and paylines < 1:
        raise DslParseError("paylines must be ≥ 1")

    # Constraints
    cons_raw = raw.get("constraints") or {}
    if not isinstance(cons_raw, dict):
        raise DslParseError("`constraints` must be a mapping")
    vol = str(cons_raw.get("volatility_class") or "medium")
    if vol not in _VALID_VOLATILITY:
        raise DslParseError(
            f"volatility_class {vol!r} not in {sorted(_VALID_VOLATILITY)}"
        )
    target_rtp = float(cons_raw.get("target_rtp") or 0.96)
    if not (0.5 <= target_rtp <= 1.0):
        raise DslParseError(f"target_rtp {target_rtp} outside [0.5, 1.0]")
    hit = float(cons_raw.get("hit_freq_target") or 0.25)
    if not (0.0 <= hit <= 1.0):
        raise DslParseError(f"hit_freq_target {hit} outside [0, 1]")
    constraints = ConstraintsSpec(
        target_rtp=target_rtp,
        rtp_tolerance=float(cons_raw.get("rtp_tolerance") or 0.005),
        volatility_class=vol,
        hit_freq_target=hit,
        max_win_x=float(cons_raw.get("max_win_x") or 5000.0),
        win_cap_apply=str(cons_raw.get("win_cap_apply") or "per_spin"),
        jurisdictions=list(cons_raw.get("jurisdictions") or ["UKGC", "MGA"]),
        pay_ladder_monotonic=bool(
            cons_raw.get("pay_ladder_monotonic")
            if cons_raw.get("pay_ladder_monotonic") is not None
            else True
        ),
        pay_min=float(cons_raw.get("pay_min") or 1.0),
        pay_max=float(cons_raw.get("pay_max") or 10_000.0),
        rtp_alloc_base=cons_raw.get("rtp_alloc_base"),
        rtp_alloc_free_spins=cons_raw.get("rtp_alloc_free_spins"),
        rtp_alloc_hold_and_win=cons_raw.get("rtp_alloc_hold_and_win"),
        rtp_alloc_jackpot=cons_raw.get("rtp_alloc_jackpot"),
    )

    hints = raw.get("hints") or {}
    if not isinstance(hints, dict):
        raise DslParseError("`hints` must be a mapping")

    return MathDslSpec(
        schema_version=schema_version,
        meta=meta,
        topology=topology,
        symbols=symbols,
        features=features,
        paylines=paylines,
        constraints=constraints,
        hints=hints,
    )
