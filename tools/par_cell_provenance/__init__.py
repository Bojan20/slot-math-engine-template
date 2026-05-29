"""W5.3 — Cell-level PAR provenance: per-Excel-cell SHA-256 + Merkle tree
+ ed25519 sign of the root, so regulators can verify any single cell of
any PAR sheet **without** access to the original XLSX.

The granularity is critical: existing ``tools.provenance_chain`` treats
each ``PAR_NNN.cells.json`` as one leaf, which means a regulator who
disputes the value of (say) cell ``PAR_001!M1`` (the holding rate) has
to re-hash the entire 4 416-cell JSON to verify. Cell-level provenance
lets us issue a Merkle inclusion proof on the order of ~13 SHA-256
operations per cell instead.

Public API
----------
- :func:`canonical_cell_bytes(sheet, ref, value)` — produces the
  byte string that gets SHA-256-hashed for each leaf. Deterministic.
- :func:`collect_cells(par_dir)` — walks every ``*.cells.json`` under a
  raw PAR dump directory, returns a sorted list of
  ``(sheet, ref, value)`` triples.
- :func:`build_cell_provenance(par_dir)` — returns a :class:`CellProvenance`
  carrying the leaf list, Merkle root hex, and a deterministic ordering
  guarantee.
- :func:`mint_cell_proof(prov, sheet, ref)` — Merkle inclusion proof
  for one specific Excel cell.
- :func:`verify_cell_proof(proof, claimed_value, root_hex)` — auditor
  side: recompute leaf bytes from the claimed value + walk the sibling
  path and confirm the root matches.
- :func:`sign_cell_root(root_hex, private_pem)` /
  :func:`verify_signed_root(...)` — ed25519 attestation of the root.
"""

from .build import (
    CellLeaf,
    CellProof,
    CellProvenance,
    SignedRoot,
    build_cell_provenance,
    canonical_cell_bytes,
    collect_cells,
    mint_cell_proof,
    sign_cell_root,
    verify_cell_proof,
    verify_signed_root,
)

__all__ = [
    "CellLeaf",
    "CellProof",
    "CellProvenance",
    "SignedRoot",
    "build_cell_provenance",
    "canonical_cell_bytes",
    "collect_cells",
    "mint_cell_proof",
    "sign_cell_root",
    "verify_cell_proof",
    "verify_signed_root",
]
