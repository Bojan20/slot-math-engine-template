"""PHASE 17 — AI Math Designer Copilot.

Given an existing IR + a natural-language mutation prompt, the copilot
proposes a single concrete edit to the DSL (or directly to the IR) and
re-locks the RTP via the P10.7 share-aware path.

Use cases:
  • Designer says: "raise free spins RTP share to 30 %, lower bonus wheel"
  • Designer says: "swap topology to 6×4 ways"
  • Designer says: "add a sticky wild feature with trigger prob 0.04"
  • Designer says: "set target RTP to 95.5 %"

The copilot is **deterministic** — no LLM dep. Heuristic regex parsing
maps mutation phrases to concrete DSL diffs. Every applied diff records
a mutation row in `meta.copilot_log` so the audit trail is replayable.

Public API:
  apply_mutation(ir, prompt) → (new_ir, MutationReport)
  list_supported_mutations() → list[str]

Companion to P10.1 (prompt → fresh DSL) — this kernel is **delta** over
an existing IR, not creation from scratch.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from typing import Any, Optional


# ─── Mutation patterns ─────────────────────────────────────────────────────

# Each entry is (regex_pattern, mutation_kind) — the apply step keeps a
# `MutationOp` per match.  Pattern order matters: longer / more specific
# phrases first.
_MUTATION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Target RTP edits
    (re.compile(r"\b(?:set|raise|lower|change)?\s*target\s+RTP\s+to\s+(\d{2,3}(?:\.\d{1,2})?)\s*%", re.I),
     "set_target_rtp_percent"),
    (re.compile(r"\b(?:set|raise|lower|change)?\s*target\s+RTP\s+to\s+(0\.\d{2,4})", re.I),
     "set_target_rtp_fraction"),
    # Feature share rebalancing
    (re.compile(r"\braise\s+(\w+(?:\s+\w+)?)\s+(?:RTP\s+)?share\s+to\s+(\d{1,3}(?:\.\d{1,2})?)\s*%", re.I),
     "set_feature_share"),
    (re.compile(r"\bset\s+(\w+(?:\s+\w+)?)\s+share\s+to\s+(\d{1,3}(?:\.\d{1,2})?)\s*%", re.I),
     "set_feature_share"),
    (re.compile(r"\blower\s+(\w+(?:\s+\w+)?)\s+(?:RTP\s+)?share", re.I),
     "halve_feature_share"),
    # Topology swaps
    (re.compile(r"\bswap\s+topology\s+to\s+(\d+)\s*[×x]\s*(\d+)\s+(?:ways|paylines?)?", re.I),
     "set_topology_size"),
    (re.compile(r"\bchange\s+topology\s+to\s+(\d+)\s*[×x]\s*(\d+)", re.I),
     "set_topology_size"),
    (re.compile(r"\bswap\s+topology\s+to\s+(\d+)\s+reel(s)?", re.I),
     "set_topology_reels"),
    # Add / remove feature
    (re.compile(r"\badd\s+(?:a\s+)?(\w+(?:[\s-]+\w+)?)\s+feature\b(?:\s+with\s+(.+))?", re.I),
     "add_feature"),
    (re.compile(r"\bremove\s+(\w+(?:[\s-]+\w+)?)\s+feature\b", re.I),
     "remove_feature"),
    # Max-win cap
    (re.compile(r"\bset\s+max[\s-]+win\s+to\s+(\d{2,7})", re.I),
     "set_max_win"),
    # Volatility class
    (re.compile(r"\bset\s+volatility\s+to\s+(low|medium|high|ultra)", re.I),
     "set_volatility"),
    # Vendor style
    (re.compile(r"\bswap\s+vendor\s+to\s+(vendor[\s_-]?[abcde]|pragmatic|hacksaw|netent|generic)", re.I),
     "set_vendor_style"),
]


@dataclass
class MutationOp:
    """One applied mutation."""

    kind: str
    matched_text: str
    target_path: str          # dot-notation, e.g. "meta.target_rtp"
    before: Any
    after: Any


@dataclass
class MutationReport:
    """Aggregate of applied mutations + audit log."""

    operations: list[MutationOp] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    rtp_relock_required: bool = False


# ─── Public API ────────────────────────────────────────────────────────────


def apply_mutation(
    ir: dict[str, Any],
    prompt: str,
) -> tuple[dict[str, Any], MutationReport]:
    """Apply NL mutation prompt to a copy of the IR.

    Returns (new_ir, MutationReport). Never mutates input.

    The mutation kernel deliberately edits the **emitted IR** rather than
    re-deriving from a DSL. That lets the designer iterate from any
    existing IR (PAR-derived, GDD-derived, NL-derived, or hand-written)
    without needing a sidecar DSL.

    When the mutation changes a parameter that affects RTP (paytable
    shape, feature share, topology), `rtp_relock_required=True` is set —
    upstream caller (e.g. CLI) should re-run the share-aware lock.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string")
    if not isinstance(ir, dict):
        raise TypeError("ir must be a dict")

    new_ir = copy.deepcopy(ir)
    report = MutationReport()

    # Track which mutation kinds were applied so we don't double-apply
    # overlapping regex matches.
    applied_kinds: set[str] = set()

    for pattern, kind in _MUTATION_PATTERNS:
        m = pattern.search(prompt)
        if not m:
            continue
        # For mutations that target features, allow multiple of same kind
        # for different feature names; otherwise dedupe.
        if kind in ("set_target_rtp_percent", "set_target_rtp_fraction",
                    "set_topology_size", "set_topology_reels",
                    "set_max_win", "set_volatility", "set_vendor_style"):
            if kind in applied_kinds:
                continue
            applied_kinds.add(kind)

        op = _apply_one(new_ir, kind, m, report)
        if op is not None:
            report.operations.append(op)

    # Record audit trail on the IR meta
    if report.operations:
        meta = new_ir.setdefault("meta", {})
        log = meta.setdefault("copilot_log", [])
        log.append({
            "prompt": prompt,
            "ops_count": len(report.operations),
            "kinds": sorted({op.kind for op in report.operations}),
            "rtp_relock_required": report.rtp_relock_required,
        })

    return new_ir, report


def list_supported_mutations() -> list[str]:
    """Return human-readable list of mutation kinds this kernel supports."""
    seen: set[str] = set()
    out: list[str] = []
    for _, kind in _MUTATION_PATTERNS:
        if kind not in seen:
            seen.add(kind)
            out.append(kind)
    return out


# ─── Per-kind handlers ─────────────────────────────────────────────────────


def _apply_one(
    ir: dict[str, Any],
    kind: str,
    m: re.Match[str],
    report: MutationReport,
) -> Optional[MutationOp]:
    """Dispatch to the right handler; return the applied MutationOp."""
    if kind == "set_target_rtp_percent":
        val = float(m.group(1)) / 100.0
        return _set_path(ir, "meta.target_rtp", val, m.group(0), report,
                          rtp_relock=True)
    if kind == "set_target_rtp_fraction":
        val = float(m.group(1))
        return _set_path(ir, "meta.target_rtp", val, m.group(0), report,
                          rtp_relock=True)
    if kind == "set_feature_share":
        feature_label = m.group(1).strip().lower().replace(" ", "_")
        new_share = float(m.group(2)) / 100.0
        return _set_feature_share(ir, feature_label, new_share, m.group(0),
                                   report)
    if kind == "halve_feature_share":
        feature_label = m.group(1).strip().lower().replace(" ", "_")
        return _halve_feature_share(ir, feature_label, m.group(0), report)
    if kind == "set_topology_size":
        reels = int(m.group(1))
        rows = int(m.group(2))
        op = _set_path(ir, "topology.reels", reels, m.group(0), report,
                        rtp_relock=True)
        _set_path(ir, "topology.rows", rows, m.group(0), report,
                   rtp_relock=True)
        return op
    if kind == "set_topology_reels":
        reels = int(m.group(1))
        return _set_path(ir, "topology.reels", reels, m.group(0), report,
                          rtp_relock=True)
    if kind == "add_feature":
        feature_label = m.group(1).strip().lower().replace(" ", "_")
        return _add_feature(ir, feature_label, m.group(0), report)
    if kind == "remove_feature":
        feature_label = m.group(1).strip().lower().replace(" ", "_")
        return _remove_feature(ir, feature_label, m.group(0), report)
    if kind == "set_max_win":
        return _set_path(ir, "meta.max_win_x", int(m.group(1)), m.group(0),
                          report)
    if kind == "set_volatility":
        return _set_path(ir, "meta.target_volatility", m.group(1).lower(),
                          m.group(0), report)
    if kind == "set_vendor_style":
        vendor = m.group(1).lower().replace(" ", "_").replace("-", "_")
        return _set_path(ir, "meta.vendor_style", vendor, m.group(0), report)
    return None


def _set_path(
    ir: dict[str, Any],
    path: str,
    value: Any,
    matched_text: str,
    report: MutationReport,
    rtp_relock: bool = False,
) -> MutationOp:
    """Traverse + set a dot-path on the IR; record before/after."""
    parts = path.split(".")
    cur: Any = ir
    for p in parts[:-1]:
        if not isinstance(cur, dict):
            raise TypeError(f"path {path} traverses non-dict at {p}")
        cur = cur.setdefault(p, {})
    if not isinstance(cur, dict):
        raise TypeError(f"path {path} terminal parent not dict")
    before = cur.get(parts[-1])
    cur[parts[-1]] = value
    if rtp_relock:
        report.rtp_relock_required = True
    return MutationOp(
        kind=path,
        matched_text=matched_text,
        target_path=path,
        before=before,
        after=value,
    )


def _set_feature_share(
    ir: dict[str, Any],
    feature_label: str,
    new_share: float,
    matched_text: str,
    report: MutationReport,
) -> Optional[MutationOp]:
    features = ir.get("features")
    if not isinstance(features, list):
        report.warnings.append(
            f"set_feature_share: no features list in IR; '{matched_text}' skipped"
        )
        return None
    for feat in features:
        if not isinstance(feat, dict):
            continue
        kind = str(feat.get("kind", "")).lower()
        if kind == feature_label or kind.replace("_", "") == feature_label.replace("_", ""):
            before = feat.get("_rtp_share_alloc")
            feat["_rtp_share_alloc"] = round(new_share, 6)
            report.rtp_relock_required = True
            return MutationOp(
                kind="set_feature_share",
                matched_text=matched_text,
                target_path=f"features[{kind}]._rtp_share_alloc",
                before=before,
                after=new_share,
            )
    report.warnings.append(
        f"set_feature_share: feature '{feature_label}' not found; "
        f"'{matched_text}' skipped"
    )
    return None


def _halve_feature_share(
    ir: dict[str, Any],
    feature_label: str,
    matched_text: str,
    report: MutationReport,
) -> Optional[MutationOp]:
    features = ir.get("features")
    if not isinstance(features, list):
        report.warnings.append(
            f"halve_feature_share: no features list in IR; '{matched_text}' skipped"
        )
        return None
    for feat in features:
        if not isinstance(feat, dict):
            continue
        kind = str(feat.get("kind", "")).lower()
        if kind == feature_label or kind.replace("_", "") == feature_label.replace("_", ""):
            before = feat.get("_rtp_share_alloc", 0.0)
            new_share = round(before / 2, 6) if before > 0 else 0.0
            feat["_rtp_share_alloc"] = new_share
            report.rtp_relock_required = True
            return MutationOp(
                kind="halve_feature_share",
                matched_text=matched_text,
                target_path=f"features[{kind}]._rtp_share_alloc",
                before=before,
                after=new_share,
            )
    report.warnings.append(
        f"halve_feature_share: feature '{feature_label}' not found"
    )
    return None


def _add_feature(
    ir: dict[str, Any],
    feature_label: str,
    matched_text: str,
    report: MutationReport,
) -> Optional[MutationOp]:
    from tools.slot_design.prompt_parser import _FEATURE_TEMPLATES
    # Try exact match + a few canonical aliases.
    key = feature_label
    if key not in _FEATURE_TEMPLATES:
        # Sticky-wild ↔ sticky_wild etc.
        for k in _FEATURE_TEMPLATES.keys():
            if k.replace("_", "") == feature_label.replace("_", ""):
                key = k
                break
    template = _FEATURE_TEMPLATES.get(key)
    if template is None:
        report.warnings.append(
            f"add_feature: unknown feature '{feature_label}'; "
            f"supported: {sorted(_FEATURE_TEMPLATES.keys())}"
        )
        return None
    features = ir.setdefault("features", [])
    # Don't add duplicate of same kind
    for existing in features:
        if isinstance(existing, dict) and str(existing.get("kind", "")).lower() == key:
            report.warnings.append(
                f"add_feature: '{key}' already present; not re-adding"
            )
            return None
    new_feat = dict(template)
    features.append(new_feat)
    report.rtp_relock_required = True
    return MutationOp(
        kind="add_feature",
        matched_text=matched_text,
        target_path=f"features[+]={key}",
        before=None,
        after=new_feat,
    )


def _remove_feature(
    ir: dict[str, Any],
    feature_label: str,
    matched_text: str,
    report: MutationReport,
) -> Optional[MutationOp]:
    features = ir.get("features")
    if not isinstance(features, list):
        report.warnings.append(
            f"remove_feature: no features list in IR"
        )
        return None
    for i, feat in enumerate(features):
        if not isinstance(feat, dict):
            continue
        kind = str(feat.get("kind", "")).lower()
        if kind == feature_label or kind.replace("_", "") == feature_label.replace("_", ""):
            removed = features.pop(i)
            report.rtp_relock_required = True
            return MutationOp(
                kind="remove_feature",
                matched_text=matched_text,
                target_path=f"features[-]={kind}",
                before=removed,
                after=None,
            )
    report.warnings.append(
        f"remove_feature: feature '{feature_label}' not found"
    )
    return None
