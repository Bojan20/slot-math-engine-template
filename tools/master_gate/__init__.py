"""W74 — Master Pipeline Gate.

Repo-wide one-command CI gate aggregating every previously-shipped gate:

  * W11 Drift Sentinel        — silent IR math drift
  * W14 CI Gate Aggregator    — drift + cert_xml + jurisdiction + matrix
  * W57 Operator Dashboard    — per-game traffic-light health
  * W63 Catalog Diff          — kernel catalog breaking-change detection
  * W67 Cert SBOM             — CycloneDX 1.4 BOM emit

Each gate yields ``(name, status, detail, counts, exit_code)``; the
master verdict is the worst status across all gates (PASS < WARN <
FAIL). One JSON + Markdown report is emitted alongside the existing
per-gate reports.
"""
from tools.master_gate.gate import (
    MasterGateReport,
    MasterStep,
    MasterVerdict,
    run_master_gate,
)

__all__ = [
    "MasterGateReport",
    "MasterStep",
    "MasterVerdict",
    "run_master_gate",
]
