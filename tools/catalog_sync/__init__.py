"""W61 — Cross-vendor Math Catalog Sync.

`slot-catalog-sync` rolls up every published artifact about every
closed-form solver kernel into a single SemVer-tagged downloadable
index that marketplace consumers can subscribe to:

  • Solver kernel name + Params dataclass field schema (introspected
    at import-time from ``tools.solvers``).
  • Math-spec doc text (when ``tools.math_doc.generator`` has emitted
    one for the kernel).
  • Kernel-compare entries (W48) — known proportional/equivalent
    relationships between kernels.
  • Feature coverage mapping (W41) — feature_kind → kernel id link.
  • Optional ``--with-docstrings`` to embed each kernel's module
    docstring (cuts the regulator hunt time from minutes to seconds).

Output:

    catalog/
      INDEX.json        — full structured registry
      INDEX.md          — human-readable Markdown summary
      checksums.txt     — SHA-256 lines for byte-for-byte sync
      version.txt       — auto-bumped SemVer (patch on every sync)
"""
from tools.catalog_sync.syncer import (
    CatalogEntry,
    CatalogReport,
    build_catalog,
    render_index_md,
    next_semver,
)

__all__ = [
    "CatalogEntry",
    "CatalogReport",
    "build_catalog",
    "render_index_md",
    "next_semver",
]
