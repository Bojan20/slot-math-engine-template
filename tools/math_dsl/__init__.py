"""W5.1 — Math DSL: declarative slot game spec → SlotGameIR pipeline.

Designer writes a YAML spec stating *what* the game should be (RTP target,
volatility class, hit frequency, topology, symbols, features, constraints).
This module parses + validates the DSL and emits a SlotGameIR skeleton
ready to be passed to the W5.2 weight synthesizer (Z3 solver).

Public API:
    from tools.math_dsl import parse_spec, compile_to_ir
    spec = parse_spec(yaml_text)              # MathDslSpec
    ir_skeleton = compile_to_ir(spec)         # dict (SlotGameIR shape)

CLI:
    python -m tools.math_dsl parse design.yaml
    python -m tools.math_dsl compile design.yaml > game.ir.json
    python -m tools.math_dsl synth design.yaml > game.ir.json  # +Z3 solve
"""

from __future__ import annotations

from .spec import (
    MathDslSpec,
    SymbolSpec,
    FeatureSpec,
    ConstraintsSpec,
    TopologySpec,
    parse_spec,
    DslParseError,
)
from .compile import compile_to_ir, CompileError
from .extract import extract_from_ir, serialize_to_yaml, ExtractError
from .mutate import (
    apply_mutation, list_supported_mutations,
    MutationLog, MutationOp, MutationError,
)
from .diff import diff_specs, render_diff, DiffEntry
from .cert_bundle import build_cert_bundle
from .provenance import (
    sign_ir, verify_ir, sign_and_inject_provenance,
    verify_provenance, ir_sha256,
)
from .verify import (
    verify_rtp, verify_hit_freq, verify_volatility, verify_all,
    VerifyReport, CheckResult, hit_freq_closed_form,
)
from .catalog import build_catalog, filter_catalog
from .visualize import render_mermaid, render_mermaid_fenced
from .catalog_html import render_catalog_html
from .studio_html import render_studio_html
from .acceptance import run_acceptance, AcceptanceReport, AcceptanceEntry

__all__ = [
    "MathDslSpec",
    "SymbolSpec",
    "FeatureSpec",
    "ConstraintsSpec",
    "TopologySpec",
    "parse_spec",
    "compile_to_ir",
    "extract_from_ir",
    "serialize_to_yaml",
    "apply_mutation",
    "list_supported_mutations",
    "MutationLog",
    "MutationOp",
    "DslParseError",
    "CompileError",
    "ExtractError",
    "MutationError",
]
