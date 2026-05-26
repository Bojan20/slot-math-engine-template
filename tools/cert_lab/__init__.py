"""Mission #3 — 12×12 primitive cert lab matrix."""
from .matrix_runner import (
    TopologyKind,
    FeatureKind,
    MatrixCell,
    MatrixReport,
    TOPOLOGY_KINDS,
    FEATURE_KINDS,
    build_synthetic_ir,
    run_matrix,
)

__all__ = [
    "TopologyKind", "FeatureKind", "MatrixCell", "MatrixReport",
    "TOPOLOGY_KINDS", "FEATURE_KINDS",
    "build_synthetic_ir", "run_matrix",
]
