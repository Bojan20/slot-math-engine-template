"""W67 — Cert Bundle SBOM.

Emits a CycloneDX-shape JSON Software Bill of Materials listing every
``tools.*`` module + its SHA-256 (computed against the running
checkout). Regulator-friendly supply-chain artifact.

Component shape per CycloneDX 1.4:

  {
    "type": "library",
    "name": "tools.solvers.megaways_ways_count",
    "version": "0.1.0",
    "hashes": [{"alg": "SHA-256", "content": "..."}],
    "purl": "pkg:python/tools.solvers.megaways_ways_count@0.1.0",
    "properties": [{"name": "module_size_bytes", "value": "..."}]
  }

The SBOM root carries serialNumber (UUID), timestamp, project
metadata, and a manifest of all `pyproject.toml`-declared console
entry points so a regulator can map every shipped CLI to its
backing module.
"""
from tools.cert_sbom.emitter import (
    SBOMComponent,
    SBOMReport,
    build_sbom,
    extract_entry_points,
)

__all__ = [
    "SBOMComponent",
    "SBOMReport",
    "build_sbom",
    "extract_entry_points",
]
