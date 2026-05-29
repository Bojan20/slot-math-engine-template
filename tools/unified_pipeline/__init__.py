"""W7.11 — Unified Audit Pipeline.

A single composability layer that fires every W7.x kernel for one game
spec and produces a **consolidated audit report** with a SHA-256 root
hash that interleaves all sub-manifests. Operators / regulators get the
entire cert paper trail (math genome, derivative manifest, anomaly
sweep, RL retention, asset manifest, provenance mesh, vendor graph
position, live PAR compiler bundle) in one call.

The root commitment is::

    consolidated_hash = SHA-256(
        sorted_canonical_json({
            "gdd_hash": ...,
            "manifest_hash": ...,
            "derivative_manifest_hash": ...,
            "pareto_hash": ...,
            "anomaly_hash": ...,
            "rl_kpi_hash": ...,
            "session_mesh_root": ...,
            "js_bundle_sha256": ...,
        })
    )

That single hash drops straight into the cert bundle as the
"W7.11 unified audit commitment" — auditor checks the hash and is
guaranteed the rest of the artefacts reproduce byte-for-byte.

Pure Python — composes the 8 already-shipping W7.x modules.
"""

from .pipeline import (
    UnifiedAuditConfig,
    UnifiedAuditReport,
    run_unified_pipeline,
    write_unified_report,
)
from .dashboard import (
    render_unified_audit_dashboard,
    write_unified_audit_dashboard,
)

__all__ = [
    "UnifiedAuditConfig",
    "UnifiedAuditReport",
    "run_unified_pipeline",
    "write_unified_report",
    "render_unified_audit_dashboard",
    "write_unified_audit_dashboard",
]
