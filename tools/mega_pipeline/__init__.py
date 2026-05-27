"""CONSOLIDATION PASS — `slot-mega-pipeline` end-to-end orchestrator.

One command chains every engineering-vector kernel into a single
artefact bundle for a single natural-language game spec.

Pipeline stages:

  1. P10 slot_design.parse_prompt → spec.json
  2. P10.4 prompt_to_dsl + P10.2 plan_composition → game.dsl.toml
  3. P10.7 share_aware_lock → universal IR
  4. P32 type_system.type_check_ir → type_check_report.json
  5. P19 theorem_prover.prove × 3 claims (rtp_in_band, paytable_consistency,
     reel_weight_positive) → proofs/*.json
  6. P24 symbolic_compiler.compile_symbolic → derivation.md
  7. P35 vol_class_auto.classify_volatility (synthetic spin sample) →
     volatility.json
  8. P11 slot_bench.run_benchmark → benchmark.{json,md}
  9. P22 federated_audit.build_audit_transcript (3 mock parties) →
     federated_audit.json
 10. P15 crypto_fair.commit_server_seed → server_seed.json
 11. P34 cert_xml_v3.emit_cert_xml_v3 → cert.xml + cert_validation.json
 12. P36 auto_compliance.emit_compliance_doc × 5 jurisdictions →
     compliance/{UKGC,MGA,GLI-19,eCOGRA,EU-GA-2024}.md
 13. PIPELINE_MANIFEST.json sa SHA-256 svakog emitovanog artefakta

Public API:
    from tools.mega_pipeline import run_mega_pipeline, MegaPipelineReport
"""

from __future__ import annotations

from tools.mega_pipeline.pipeline import (
    MegaPipelineReport,
    StageResult,
    run_mega_pipeline,
)

__all__ = ["MegaPipelineReport", "StageResult", "run_mega_pipeline"]
