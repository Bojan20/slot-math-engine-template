"""W5.3 — IR → DSL inverse extractor.

Closes the round-trip: existing `SlotGameIR` JSON (legacy game, vendor
import, hand-tuned) can be reduced back to a `MathDslSpec` + YAML text
the designer can edit. Combined with W5.1 compile + W5.2 synth, this
turns the entire pipeline bi-directional:

    Designer YAML → IR → Z3 weights → IR JSON   (forward, design)
                              ↓
    Existing IR → DSL spec → YAML                (inverse, refactor)
                              ↓
    Edit YAML → re-compile → Z3 → IR JSON        (designer mutation)

Why bi-directional matters:
  - Vendor B ships PAR sheets → we already auto-parse into IR. Now we
    can present the resulting IR as a DSL spec the designer can mutate
    (e.g. raise RTP target, change volatility, swap a feature).
  - Compliance auditor sees the same DSL → IR equivalence proof
    (compile(extract(ir)) ≈ ir modulo derived defaults).
"""

from __future__ import annotations

import io
from typing import Any

from .spec import (
    MathDslSpec, SymbolSpec, FeatureSpec, ConstraintsSpec, TopologySpec,
)


class ExtractError(ValueError):
    """Raised when IR shape cannot be reduced to DSL form."""


def extract_from_ir(ir: dict) -> MathDslSpec:
    """Recover a `MathDslSpec` from a SlotGameIR JSON dict.

    The extractor is best-effort: feature kinds not natively expressible
    in the DSL are dropped with a stub `extra` payload. Defaults are
    chosen to maximize round-trip equivalence — when the IR carries an
    explicit field we lift it verbatim; when it doesn't, we reconstruct
    the most-likely DSL form.
    """
    if not isinstance(ir, dict):
        raise ExtractError("IR must be a dict")
    schema_version = str(ir.get("schema_version") or "1.0.0")

    # Meta
    meta_block = ir.get("meta") or {}
    if not isinstance(meta_block, dict) or not meta_block.get("name"):
        raise ExtractError("IR.meta.name is required")
    meta = {k: v for k, v in meta_block.items() if k != "id"}
    # Carry provenance vendor / author / description through verbatim
    prov = ir.get("provenance") or {}
    if isinstance(prov, dict) and prov.get("vendor") and "vendor" not in meta:
        meta["vendor"] = prov["vendor"]

    # Topology
    top_block = ir.get("topology") or {}
    if not isinstance(top_block, dict):
        raise ExtractError("IR.topology missing")
    kind = str(top_block.get("kind") or "rectangular")
    topology = TopologySpec(
        kind=kind,
        reels=int(top_block.get("reels") or top_block.get("columns") or 5),
        rows=int(top_block.get("rows") or 3),
        row_range_per_reel=top_block.get("row_range_per_reel"),
        columns=top_block.get("columns"),
        adjacency=top_block.get("adjacency"),
        ways_cap=top_block.get("ways_cap"),
    )

    # Symbols
    syms_raw = ir.get("symbols") or []
    if not isinstance(syms_raw, list) or len(syms_raw) < 2:
        raise ExtractError("IR.symbols must be a list with ≥2 entries")
    symbols: list[SymbolSpec] = []
    for s in syms_raw:
        if not isinstance(s, dict):
            continue
        symbols.append(SymbolSpec(
            id=str(s["id"]),
            kind=str(s.get("kind") or "lp"),
            name=s.get("name"),
            substitutes=s.get("substitutes"),
            weight_hint=s.get("weight_hint"),
        ))

    # Features
    features: list[FeatureSpec] = []
    for f in ir.get("features", []) or []:
        if not isinstance(f, dict):
            continue
        fk = str(f.get("kind") or "")
        feat = FeatureSpec(kind=fk)
        if fk == "free_spins":
            trig = f.get("trigger") or {}
            feat.trigger_count_min = int(trig.get("min") or 3)
            thr = trig.get("thresholds") or {}
            if thr:
                # take the first threshold value as initial spins
                k0 = sorted(thr.keys())[0]
                feat.initial_spins = int(thr[k0])
            if "global_multiplier" in f:
                feat.global_multiplier = float(f["global_multiplier"])
            rt = f.get("retrigger") or {}
            if rt:
                rthr = rt.get("thresholds") or {}
                if rthr:
                    feat.retrigger_spins = int(list(rthr.values())[0])
                if "max_total" in rt:
                    feat.max_total_spins = int(rt["max_total"])
        elif fk == "linear_progressive":
            feat.pool_id = f.get("pool_id")
            feat.contribution_x = float(f.get("contribution_per_spin_x") or 0.0)
            feat.seed_x = float(f.get("seed_x") or 0.0)
            if f.get("must_hit_by_x") is not None:
                feat.must_hit_by_x = float(f["must_hit_by_x"])
        elif fk == "hold_and_win":
            trig = f.get("trigger") or {}
            feat.trigger_count_min = int(trig.get("min") or 6)
            feat.respins_initial = int(f.get("respins_initial") or 3)
        elif fk == "cascade":
            feat.replacement = f.get("replacement")
            feat.max_chain = f.get("max_chain")
        features.append(feat)

    # Paylines (lines mode) or 1 (other)
    ev = ir.get("evaluation") or {}
    if ev.get("kind") == "lines":
        paylines = ev.get("paylines") or []
        if isinstance(paylines, list) and paylines and isinstance(paylines[0], list):
            paylines_dsl: Any = len(paylines)
        else:
            paylines_dsl = 1
    else:
        paylines_dsl = 1

    # Constraints — lift from limits + compliance + rtp_allocation
    limits = ir.get("limits") or {}
    compliance = ir.get("compliance") or {}
    rtp_alloc = ir.get("rtp_allocation") or {}
    constraints = ConstraintsSpec(
        target_rtp=float(limits.get("target_rtp") or 0.96),
        rtp_tolerance=float(limits.get("rtp_tolerance") or 0.005),
        volatility_class=str(limits.get("target_volatility") or "medium"),
        hit_freq_target=float(limits.get("hit_freq_target") or 0.25),
        max_win_x=float(limits.get("max_win_x") or 5000.0),
        win_cap_apply=str(limits.get("win_cap_apply") or "per_spin"),
        jurisdictions=list(compliance.get("jurisdictions") or ["UKGC", "MGA"]),
        pay_ladder_monotonic=True,
        pay_min=1.0,
        pay_max=10_000.0,
        rtp_alloc_base=rtp_alloc.get("base_game"),
        rtp_alloc_free_spins=rtp_alloc.get("free_spins"),
        rtp_alloc_hold_and_win=rtp_alloc.get("hold_and_win"),
        rtp_alloc_jackpot=rtp_alloc.get("jackpot"),
    )

    # Hints — derive reel_length / wild_share / scatter_share from reels[0]
    reels_block = ir.get("reels") or {}
    base = reels_block.get("base") or []
    hints: dict[str, Any] = {}
    if base and isinstance(base[0], dict):
        first = base[0]
        total = sum(float(v) for v in first.values()) or 1.0
        hints["reel_length"] = int(round(total))
        wild_ids = {s.id for s in symbols if s.kind == "wild"}
        scatter_ids = {s.id for s in symbols if s.kind == "scatter"}
        wild_total = sum(float(first.get(i) or 0) for i in wild_ids)
        scatter_total = sum(float(first.get(i) or 0) for i in scatter_ids)
        if wild_total > 0:
            hints["wild_share"] = round(wild_total / total, 4)
        if scatter_total > 0:
            hints["scatter_share"] = round(scatter_total / total, 4)

    return MathDslSpec(
        schema_version=schema_version,
        meta=meta,
        topology=topology,
        symbols=symbols,
        features=features,
        paylines=paylines_dsl,
        constraints=constraints,
        hints=hints,
    )


# ─── DSL → YAML serializer (mirrors the parser's subset) ─────────────────


def _yaml_scalar(v: Any) -> str:
    """Render a scalar in our YAML subset."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    if any(ch in s for ch in ":#-{}[]&*!|>'\"%@`") or s != s.strip():
        return '"' + s.replace('"', '\\"') + '"'
    return s


def _yaml_list_inline(items: list) -> str:
    return "[" + ", ".join(_yaml_scalar(x) for x in items) + "]"


def serialize_to_yaml(spec: MathDslSpec) -> str:
    """Convert MathDslSpec → YAML string the parser can re-read losslessly.

    Output mirrors the example specs in `tools/math_dsl/specs/`. Indent
    fixed at 2 spaces. Keys ordered to match the parser's expectations.
    """
    out = io.StringIO()
    w = out.write
    w(f"schema_version: \"{spec.schema_version}\"\n\n")

    # meta
    w("meta:\n")
    for k in ("name", "vendor", "author", "description"):
        v = spec.meta.get(k)
        if v is not None:
            w(f"  {k}: {_yaml_scalar(v)}\n")
    if spec.meta.get("theme_tags"):
        w(f"  theme_tags: {_yaml_list_inline(list(spec.meta['theme_tags']))}\n")
    w("\n")

    # topology
    w("topology:\n")
    w(f"  kind: {spec.topology.kind}\n")
    w(f"  reels: {spec.topology.reels}\n")
    w(f"  rows: {spec.topology.rows}\n")
    if spec.topology.row_range_per_reel:
        w("  row_range_per_reel:\n")
        for rng in spec.topology.row_range_per_reel:
            w(f"    - {_yaml_list_inline(list(rng))}\n")
    if spec.topology.ways_cap is not None:
        w(f"  ways_cap: {spec.topology.ways_cap}\n")
    if spec.topology.columns is not None and spec.topology.kind == "cluster_grid":
        w(f"  columns: {spec.topology.columns}\n")
    if spec.topology.adjacency is not None:
        w(f"  adjacency: {spec.topology.adjacency}\n")
    w("\n")

    # symbols
    w("symbols:\n")
    for s in spec.symbols:
        w(f"  - id: {s.id}\n")
        w(f"    kind: {s.kind}\n")
        if s.name and s.name != s.id:
            w(f"    name: {_yaml_scalar(s.name)}\n")
        if s.substitutes is not None:
            if isinstance(s.substitutes, list):
                w(f"    substitutes: {_yaml_list_inline(s.substitutes)}\n")
            else:
                w(f"    substitutes: {_yaml_scalar(s.substitutes)}\n")
        if s.weight_hint is not None:
            w(f"    weight_hint: {s.weight_hint}\n")
    w("\n")

    # features
    if spec.features:
        w("features:\n")
        for f in spec.features:
            w(f"  - kind: {f.kind}\n")
            for fld in (
                "trigger_count_min", "initial_spins", "global_multiplier",
                "retrigger_spins", "max_total_spins", "respins_initial",
                "replacement", "max_chain", "pool_id", "contribution_x",
                "seed_x", "must_hit_by_x",
            ):
                v = getattr(f, fld, None)
                if v is not None:
                    w(f"    {fld}: {_yaml_scalar(v)}\n")
        w("\n")

    # paylines
    if isinstance(spec.paylines, int):
        w(f"paylines: {spec.paylines}\n\n")
    else:
        # list of lists — render explicitly
        w("paylines:\n")
        for line in spec.paylines:
            w(f"  - {_yaml_list_inline(list(line))}\n")
        w("\n")

    # constraints
    w("constraints:\n")
    c = spec.constraints
    w(f"  target_rtp: {c.target_rtp}\n")
    w(f"  rtp_tolerance: {c.rtp_tolerance}\n")
    w(f"  volatility_class: {c.volatility_class}\n")
    w(f"  hit_freq_target: {c.hit_freq_target}\n")
    w(f"  max_win_x: {c.max_win_x}\n")
    w(f"  win_cap_apply: {c.win_cap_apply}\n")
    w(f"  jurisdictions: {_yaml_list_inline(list(c.jurisdictions))}\n")
    w(f"  pay_ladder_monotonic: {'true' if c.pay_ladder_monotonic else 'false'}\n")
    w(f"  pay_min: {c.pay_min}\n")
    w(f"  pay_max: {c.pay_max}\n")
    for fld, dsl_key in (
        ("rtp_alloc_base", "rtp_alloc_base"),
        ("rtp_alloc_free_spins", "rtp_alloc_free_spins"),
        ("rtp_alloc_hold_and_win", "rtp_alloc_hold_and_win"),
        ("rtp_alloc_jackpot", "rtp_alloc_jackpot"),
    ):
        v = getattr(c, fld)
        if v is not None:
            w(f"  {dsl_key}: {v}\n")
    w("\n")

    # hints
    if spec.hints:
        w("hints:\n")
        for k, v in spec.hints.items():
            w(f"  {k}: {_yaml_scalar(v)}\n")

    return out.getvalue()
