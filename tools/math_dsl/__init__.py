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
    "DslParseError",
    "CompileError",
    "ExtractError",
]
