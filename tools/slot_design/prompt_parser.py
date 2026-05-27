"""P10.1 — Natural-Language → DSL Prompt Parser.

Deterministic heuristic parser that promotes a free-form English / Serbian
game spec to a `PromptSpec` dataclass + then to a DSL dict ready for the
W6.4 `dsl_to_ir_via_smt` synthesizer.

Design notes:
  - **Deterministic-first**: pure regex + token-bag detection. No LLM call
    by default; LLM-assisted refinement is an optional shim (P10.1b).
  - **Host-orchestrator-agnostic**: no host-specific imports; this module
    works in any Python 3.10+ runtime regardless of agent framework.
  - **Clean-room**: every detected token is recorded in the audit log so
    the CI / regulator can replay the parsing decision tree.

Detection categories:
  - Topology         (5×3 / 5x3 / 6-reel / 7×7 cluster / megaways)
  - Feature kinds    (free_spins / hold_and_win / cash_bag / wild_expand /
                      pick_bonus / wheel_bonus / multiplier / cascade /
                      megaways_ways / sticky_wild / tumble / cluster_pays)
  - Target RTP       (CLI flag --target-rtp OR heuristic from "high-RTP" /
                      "low-RTP" / "RTP 96%" / "RTP 0.96")
  - Volatility       (low / medium / high / ultra)
  - Vendor style     (vendor_a / vendor_b / pragmatic / generic)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional


# ─── Detection data ────────────────────────────────────────────────────────

# Feature keyword → DSL feature kind mapping.
# Order matters: longest phrases first so "hold and win" matches before "win".
_FEATURE_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bhold[\s-]*(and|&|i)[\s-]*(win|spin)\b", re.I), "hold_and_win"),
    (re.compile(r"\bHoldAndWin\b"), "hold_and_win"),
    (re.compile(r"\bHoldAndSpin\b"), "hold_and_win"),
    (re.compile(r"\bhold[\s-]?&[\s-]?spin\b", re.I), "hold_and_win"),
    (re.compile(r"\bH&S\b"), "hold_and_win"),
    (re.compile(r"\bH&W\b"), "hold_and_win"),
    (re.compile(r"\bcash[\s-]+bag\b", re.I), "hold_and_win"),
    (re.compile(r"\bfree[\s-]+spin(s)?\b", re.I), "free_spins"),
    (re.compile(r"\bFS\b"), "free_spins"),
    (re.compile(r"\bbonus[\s-]+wheel\b", re.I), "wheel_bonus"),
    (re.compile(r"\bwheel[\s-]+bonus\b", re.I), "wheel_bonus"),
    (re.compile(r"\bpick[\s-]+bonus\b", re.I), "pick_bonus"),
    (re.compile(r"\bpicker\b", re.I), "pick_bonus"),
    (re.compile(r"\btumble\b", re.I), "tumble"),
    (re.compile(r"\bcascade\b", re.I), "tumble"),
    (re.compile(r"\bavalanche\b", re.I), "tumble"),
    (re.compile(r"\bmegaways\b", re.I), "megaways_ways"),
    (re.compile(r"\bcluster[\s-]+pays?\b", re.I), "cluster_pays"),
    (re.compile(r"\bsticky[\s-]+wilds?\b", re.I), "sticky_wild"),
    (re.compile(r"\bwild[\s-]+expand(s|ing)?\b", re.I), "wild_expand"),
    (re.compile(r"\bexpanding[\s-]+wilds?\b", re.I), "wild_expand"),
    (re.compile(r"\bmultiplier\b", re.I), "multiplier_stack"),
    (re.compile(r"\bjackpot\b", re.I), "progressive_jackpot"),
    (re.compile(r"\bprogressive\b", re.I), "progressive_jackpot"),
    (re.compile(r"\brespin\b", re.I), "respin"),
    (re.compile(r"\bbuy\s*(feature|bonus)\b", re.I), "buy_feature"),
    (re.compile(r"\bbonus\s*buy\b", re.I), "buy_feature"),
]

# Vendor-style keyword → vendor_id.
_VENDOR_KEYWORDS: dict[str, str] = {
    r"\bvendor[\s-]?a\b": "vendor_a",
    r"\bvendor[\s-]?b\b": "vendor_b",
    r"\bvendor[\s-]?c\b": "vendor_c",
    r"\bvendor[\s-]?d\b": "vendor_d",
    r"\bvendor[\s-]?e\b": "vendor_e",
    r"\bpragmatic[\s-](style|like)\b": "pragmatic",
    r"\bhacksaw[\s-](style|like)\b": "hacksaw",
    r"\bnetent[\s-](style|like)\b": "netent",
    r"\bIGT[\s-](style|like)\b": "vendor_a",
    r"\bL&W[\s-](style|like)\b": "vendor_b",
    r"\blight[\s-]&[\s-]wonder[\s-](style|like)\b": "vendor_b",
}

# Volatility keyword → label.
_VOLATILITY_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bultra[\s-]+(volatility|vol)\b", re.I), "ultra"),
    (re.compile(r"\bhigh[\s-]+(volatility|vol)\b", re.I), "high"),
    (re.compile(r"\bmedium[\s-]+(volatility|vol)\b", re.I), "medium"),
    (re.compile(r"\blow[\s-]+(volatility|vol)\b", re.I), "low"),
    (re.compile(r"\bhigh[\s-]+variance\b", re.I), "high"),
    (re.compile(r"\blow[\s-]+variance\b", re.I), "low"),
]

# Topology shapes.
_TOPOLOGY_REELxROW = re.compile(r"\b(\d+)\s*[×xX]\s*(\d+)\b")
_TOPOLOGY_NREEL = re.compile(r"\b(\d+)[\s-]+reel(s)?\b", re.I)
_TOPOLOGY_NROW = re.compile(r"\b(\d+)[\s-]+row(s)?\b", re.I)
_TOPOLOGY_MEGAWAYS = re.compile(r"\bmegaways\b", re.I)
_TOPOLOGY_CLUSTER = re.compile(r"\bcluster\b", re.I)

# Target RTP — fractional (0.96), percent (96%), or phrasal (high/low/medium RTP).
_RTP_FRACTION = re.compile(r"\bRTP[\s=:]+(0\.\d{2,4})\b", re.I)
_RTP_PERCENT = re.compile(r"\bRTP[\s=:]+(\d{2,3}(?:\.\d{1,2})?)\s*%", re.I)
_RTP_PERCENT_BARE = re.compile(r"\b(\d{2,3}(?:\.\d{1,2})?)\s*%\s+RTP\b", re.I)
_RTP_PHRASAL: dict[str, float] = {
    r"\bhigh[\s-]+RTP\b": 0.97,
    r"\bmedium[\s-]+RTP\b": 0.95,
    r"\blow[\s-]+RTP\b": 0.90,
    r"\bregulator[\s-]+(minimum|baseline)[\s-]+RTP\b": 0.85,
}

# Max-win cap phrases.
_MAX_WIN = re.compile(r"\bmax[\s-]+win[\s-]+(\d{2,6})\s*[xX]?\b", re.I)
_MAX_WIN_PHRASAL: dict[str, int] = {
    r"\b5000x\b": 5000,
    r"\b10000x\b": 10000,
    r"\b25000x\b": 25000,
    r"\b50000x\b": 50000,
    r"\b100000x\b": 100000,
}


# ─── Data classes ──────────────────────────────────────────────────────────


@dataclass
class DetectedFeature:
    """A feature detected in the prompt + its source span for audit."""

    kind: str
    matched_text: str
    span_start: int
    span_end: int


@dataclass
class PromptSpec:
    """Structured representation of the parsed prompt."""

    raw_prompt: str
    reels: int = 5
    rows: int = 3
    paylines: int = 20
    topology_shape: str = "lines"  # lines | ways | cluster | megaways
    target_rtp: float = 0.96
    volatility: str = "medium"
    vendor_style: str = "generic"
    max_win_x: int = 5000
    features: list[DetectedFeature] = field(default_factory=list)
    audit_log: list[str] = field(default_factory=list)

    @property
    def feature_kinds(self) -> list[str]:
        """De-duplicated list of feature kinds in detection order."""
        seen: set[str] = set()
        out: list[str] = []
        for f in self.features:
            if f.kind not in seen:
                seen.add(f.kind)
                out.append(f.kind)
        return out


# ─── Parser ────────────────────────────────────────────────────────────────


def _detect_topology(prompt: str, spec: PromptSpec) -> None:
    """Detect reels × rows + topology shape (lines / ways / cluster / megaways)."""
    if _TOPOLOGY_MEGAWAYS.search(prompt):
        spec.topology_shape = "megaways"
        spec.reels = 6
        spec.rows = 7  # variable-height proxy
        spec.paylines = 117649  # 7^6 megaways
        spec.audit_log.append("topology: megaways → 6×7 var, 117649 ways")
        return
    if _TOPOLOGY_CLUSTER.search(prompt):
        spec.topology_shape = "cluster"
        # Default cluster grid 7×7 (NetEnt Aloha)
        spec.reels = 7
        spec.rows = 7
        spec.paylines = 0
        spec.audit_log.append("topology: cluster pays → 7×7 grid")
    m = _TOPOLOGY_REELxROW.search(prompt)
    if m:
        spec.reels = int(m.group(1))
        spec.rows = int(m.group(2))
        spec.audit_log.append(
            f"topology: {spec.reels}×{spec.rows} (matched '{m.group(0)}')"
        )
    else:
        rm = _TOPOLOGY_NREEL.search(prompt)
        if rm:
            spec.reels = int(rm.group(1))
            spec.audit_log.append(f"topology: {spec.reels} reels")
        nrm = _TOPOLOGY_NROW.search(prompt)
        if nrm:
            spec.rows = int(nrm.group(1))
            spec.audit_log.append(f"topology: {spec.rows} rows")
    # Sensible default for paylines when not explicitly cluster/megaways
    if spec.topology_shape == "lines" and spec.paylines == 20:
        # 5×3 → 20 standard; 6×4 → 4096 ways implicit
        if spec.reels == 5 and spec.rows == 3:
            spec.paylines = 20
        elif spec.reels == 6 and spec.rows == 4:
            spec.paylines = 0
            spec.topology_shape = "ways"
            spec.audit_log.append("topology: 6×4 inferred ways (4096)")


def _detect_features(prompt: str, spec: PromptSpec) -> None:
    """Detect feature kinds with audit-friendly span tracking."""
    seen: set[str] = set()
    for pattern, kind in _FEATURE_KEYWORDS:
        m = pattern.search(prompt)
        if m and kind not in seen:
            seen.add(kind)
            spec.features.append(
                DetectedFeature(
                    kind=kind,
                    matched_text=m.group(0),
                    span_start=m.start(),
                    span_end=m.end(),
                )
            )
            spec.audit_log.append(f"feature: {kind} ← '{m.group(0)}'")


def _detect_target_rtp(prompt: str, spec: PromptSpec, override: Optional[float]) -> None:
    """Detect target RTP from CLI override (highest priority), then prompt
    keyword search."""
    if override is not None:
        spec.target_rtp = override
        spec.audit_log.append(f"target_rtp: {override:.4f} (CLI override)")
        return
    m = _RTP_FRACTION.search(prompt)
    if m:
        spec.target_rtp = float(m.group(1))
        spec.audit_log.append(f"target_rtp: {spec.target_rtp:.4f} (fractional)")
        return
    m = _RTP_PERCENT.search(prompt)
    if m:
        spec.target_rtp = float(m.group(1)) / 100.0
        spec.audit_log.append(
            f"target_rtp: {spec.target_rtp:.4f} (percent '{m.group(0)}')"
        )
        return
    m = _RTP_PERCENT_BARE.search(prompt)
    if m:
        spec.target_rtp = float(m.group(1)) / 100.0
        spec.audit_log.append(
            f"target_rtp: {spec.target_rtp:.4f} (bare percent '{m.group(0)}')"
        )
        return
    for pat, rtp in _RTP_PHRASAL.items():
        if re.search(pat, prompt, re.I):
            spec.target_rtp = rtp
            spec.audit_log.append(f"target_rtp: {rtp:.4f} (phrasal '{pat}')")
            return
    spec.audit_log.append("target_rtp: 0.9600 (default)")


def _detect_volatility(prompt: str, spec: PromptSpec) -> None:
    for pattern, label in _VOLATILITY_KEYWORDS:
        if pattern.search(prompt):
            spec.volatility = label
            spec.audit_log.append(f"volatility: {label} ← match")
            return


def _detect_vendor_style(prompt: str, spec: PromptSpec) -> None:
    for pattern, vendor in _VENDOR_KEYWORDS.items():
        if re.search(pattern, prompt, re.I):
            spec.vendor_style = vendor
            spec.audit_log.append(f"vendor_style: {vendor} ← match")
            return


def _detect_max_win(prompt: str, spec: PromptSpec) -> None:
    m = _MAX_WIN.search(prompt)
    if m:
        spec.max_win_x = int(m.group(1))
        spec.audit_log.append(f"max_win_x: {spec.max_win_x} (matched)")
        return
    for pat, val in _MAX_WIN_PHRASAL.items():
        if re.search(pat, prompt, re.I):
            spec.max_win_x = val
            spec.audit_log.append(f"max_win_x: {val} (phrasal)")
            return


def parse_prompt(prompt: str, *, target_rtp: Optional[float] = None) -> PromptSpec:
    """Parse a natural-language game spec into a structured `PromptSpec`.

    Args:
        prompt:     free-form English / Serbian text describing the game
        target_rtp: optional CLI override for target RTP (highest priority)

    Returns:
        `PromptSpec` with detected topology + features + RTP + volatility +
        vendor style + max-win + audit log of every detection decision.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string")
    if target_rtp is not None and not (0.5 <= target_rtp <= 1.0):
        raise ValueError(f"target_rtp override {target_rtp} outside [0.5, 1.0]")

    spec = PromptSpec(raw_prompt=prompt.strip())
    _detect_topology(prompt, spec)
    _detect_features(prompt, spec)
    _detect_target_rtp(prompt, spec, target_rtp)
    _detect_volatility(prompt, spec)
    _detect_vendor_style(prompt, spec)
    _detect_max_win(prompt, spec)
    return spec


# ─── DSL builder ───────────────────────────────────────────────────────────


# Feature-kind → DSL feature config template.
_FEATURE_TEMPLATES: dict[str, dict[str, Any]] = {
    "free_spins": {
        "kind": "free_spins",
        "trigger_symbol": "Scatter",
        "trigger_count_min": 3,
        "initial_spins": 10,
        "retrigger_spins": 5,
        "max_total_spins": 50,
    },
    "hold_and_win": {
        "kind": "hold_and_win",
        "trigger_symbol": "Cash",
        "trigger_count_min": 6,
        "initial_respins": 3,
        "avg_pay": 25.0,
        "trigger_prob": 0.008,
    },
    "wheel_bonus": {
        "kind": "wheel_bonus",
        "tiers": ["Mini", "Minor", "Major", "Grand"],
        "weights": [60, 25, 12, 3],
        "tier_pays": [50.0, 200.0, 1000.0, 5000.0],
    },
    "pick_bonus": {
        "kind": "pick_bonus",
        "n_picks": 3,
        "stages": 1,
        "avg_pay_per_pick": 30.0,
    },
    "tumble": {
        "kind": "tumble",
        "chain_prob": 0.45,
        "max_chain": 8,
    },
    "megaways_ways": {
        "kind": "megaways_ways",
        "min_symbols": 2,
        "max_symbols": 7,
    },
    "cluster_pays": {
        "kind": "cluster_pays",
        "min_cluster": 5,
    },
    "sticky_wild": {
        "kind": "sticky_wild",
        "trigger_prob": 0.05,
        "max_sticky": 5,
    },
    "wild_expand": {
        "kind": "wild_expand",
        "on_reels": [1, 2, 3, 4],
    },
    "multiplier_stack": {
        "kind": "multiplier_stack",
        "max_multiplier": 100,
        "trigger_prob": 0.05,
    },
    "progressive_jackpot": {
        "kind": "progressive_jackpot",
        "tiers": ["Mini", "Major", "Grand"],
        "must_hit_by_x": [1000, 10000, 100000],
        "contribution_rate": 0.003,
    },
    "respin": {
        "kind": "respin",
        "trigger_prob": 0.1,
        "max_respins": 3,
    },
    "buy_feature": {
        "kind": "buy_feature",
        "cost_x": 100,
        "feature_kind": "free_spins",
    },
}


def prompt_to_dsl(spec: PromptSpec) -> dict[str, Any]:
    """Convert a parsed `PromptSpec` into a DSL dict ready for the W6.4
    `dsl_to_ir_via_smt` synthesizer.

    The returned DSL is **complete enough** to round-trip through
    `dsl_validate` and synthesize a valid IR; designer can hand-edit
    individual fields before lock if desired.
    """
    feature_configs = []
    for kind in spec.feature_kinds:
        template = _FEATURE_TEMPLATES.get(kind)
        if template is not None:
            feature_configs.append(dict(template))  # shallow copy

    dsl: dict[str, Any] = {
        "meta": {
            "name": _derive_game_name(spec),
            "target_rtp": spec.target_rtp,
            "target_volatility": spec.volatility,
            "max_win_x": spec.max_win_x,
            "vendor_style": spec.vendor_style,
            "design_audit": spec.audit_log,
        },
        "topology": {
            "reels": spec.reels,
            "rows": spec.rows,
            "paylines": spec.paylines if spec.paylines > 0 else 1,
            "shape": spec.topology_shape,
        },
        "bet_table": {
            "min_bet": 0.20,
            "max_bet": 100.00,
            "multipliers": [1, 2, 5, 10, 20],
        },
        "features": feature_configs,
    }
    return dsl


def _derive_game_name(spec: PromptSpec) -> str:
    """Slug-friendly name from the first few prompt words."""
    words = re.findall(r"[A-Za-z0-9]+", spec.raw_prompt)
    if not words:
        return "Untitled Slot"
    return " ".join(words[:6])
