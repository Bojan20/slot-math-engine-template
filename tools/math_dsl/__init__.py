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
from .pipeline import run_pipeline, PipelineError
from .audit import append_audit, verify_audit_chain, read_audit
from .mc_validate import mc_validate, McValidationReport
from .lint import lint_spec, render_lint, filter_by_severity, LintFinding
from .docs import render_docs
from .health import health_check, HealthReport, HealthCheck
from .stress import stress_synth, StressReport, StressRow
from .prompt import parse_prompt, list_prompt_grammar, PromptLog, PromptOp
from .jurisdictions import (
    adapt_spec_for_jurisdiction, adapt_for_all,
    list_jurisdictions, render_variants_summary,
    JurisdictionVariant, JurisdictionRules, REGISTRY as JURISDICTION_REGISTRY,
)
from .compare import compare_specs, shared_jurisdictions, feature_overlap, CompareMatrix
from .migrate import (
    migrate, current_schema_version, list_migrations,
    MigrationError, MIGRATIONS,
)
from .bench import bench_corpus, BenchReport, BenchEntry

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
