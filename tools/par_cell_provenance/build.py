"""W5.3 — cell-level PAR provenance builder.

The canonical leaf encoding is::

    sheet || NUL || ref || NUL || canonical_json(value)

The two NUL separators are unambiguous because Excel cell refs (``A1``,
``AB12``, …) only use letters + digits, and sheet names produced by the
vendor pipeline don't contain NULs. ``canonical_json`` uses
``sort_keys=True`` + tight separators so the same value always produces
the same bytes regardless of language or serializer.

The Merkle reduction reuses the ``provenance_chain`` "duplicate-last
on odd layers" convention so root hashes are interoperable: a chain-level
auditor that already verified the per-file root can drop straight into
this cell-level proof by hashing on top.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
from pathlib import Path
from typing import Any

# We deliberately reuse the existing Merkle primitives rather than
# re-implementing them — keeps the audit story "one root reduction,
# both granularities" instead of "two competing tree shapes".
from tools.provenance_chain.chain import (
    MerkleProofPath,
    merkle_proof,
    merkle_root,
    verify_merkle_proof,
)


# ─── Canonical leaf encoding ─────────────────────────────────────────


def canonical_cell_bytes(sheet: str, ref: str, value: Any) -> bytes:
    """Produce the bytes that get SHA-256-hashed into a Merkle leaf.

    Format: ``sheet \\x00 ref \\x00 json(value, sort_keys=True)``.
    """
    if not sheet:
        raise ValueError("sheet name must be non-empty")
    if not ref:
        raise ValueError("cell ref must be non-empty")
    value_bytes = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return sheet.encode() + b"\x00" + ref.encode() + b"\x00" + value_bytes


def _leaf_hash(sheet: str, ref: str, value: Any) -> bytes:
    return hashlib.sha256(canonical_cell_bytes(sheet, ref, value)).digest()


# ─── Cell extraction ─────────────────────────────────────────────────


def _sheet_name_from_filename(path: Path) -> str:
    """``PAR_001.cells.json`` → ``PAR_001``."""
    return path.name.removesuffix(".cells.json")


def collect_cells(par_dir: Path) -> list[tuple[str, str, Any]]:
    """Walk ``*.cells.json`` and return a deterministic list of
    ``(sheet, ref, value)`` triples.

    Sort order: by ``sheet`` (lexicographic) then by ``ref`` (column-then-
    row, e.g. ``A1 < A2 < B1``). The column comparison is
    *length-then-lexicographic* so ``Z1 < AA1`` — matches Excel's
    natural A..Z..AA..AZ progression.
    """
    par_dir = Path(par_dir)
    if not par_dir.exists():
        raise FileNotFoundError(par_dir)
    triples: list[tuple[str, str, Any]] = []
    for path in sorted(par_dir.rglob("*.cells.json")):
        sheet = _sheet_name_from_filename(path)
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as e:
            raise ValueError(f"{path}: invalid JSON ({e})") from e
        if not isinstance(data, dict):
            raise ValueError(f"{path}: expected dict, got {type(data).__name__}")
        for ref, value in data.items():
            triples.append((sheet, ref, value))
    triples.sort(key=lambda t: (t[0], _excel_ref_sort_key(t[1])))
    return triples


def _excel_ref_sort_key(ref: str) -> tuple[int, str, int]:
    """Sort Excel refs as (column_length, column_letters, row_number).

    ``A1`` → (1, "A", 1)
    ``B12`` → (1, "B", 12)
    ``AA3`` → (2, "AA", 3)

    Handles defensive cases where the ref is malformed by sorting it last.
    """
    letters = ""
    digits = ""
    for ch in ref:
        if ch.isalpha() and not digits:
            letters += ch
        elif ch.isdigit():
            digits += ch
        else:
            # Malformed — push to the end, preserve raw order.
            return (99, ref, 0)
    if not letters or not digits:
        return (99, ref, 0)
    return (len(letters), letters.upper(), int(digits))


# ─── Provenance dataclasses ──────────────────────────────────────────


@dataclasses.dataclass
class CellLeaf:
    sheet: str
    ref: str
    value: Any
    leaf_hash_hex: str

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class CellProvenance:
    par_dir: str
    leaf_count: int
    merkle_root_hex: str
    leaves: list[CellLeaf]

    def to_dict(self) -> dict[str, Any]:
        return {
            "par_dir": self.par_dir,
            "leaf_count": self.leaf_count,
            "merkle_root_hex": self.merkle_root_hex,
            "leaves": [leaf.to_dict() for leaf in self.leaves],
        }


@dataclasses.dataclass
class CellProof:
    sheet: str
    ref: str
    value: Any
    leaf_index: int
    leaf_hash_hex: str
    siblings: list[dict[str, str]]
    merkle_root_hex: str

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class SignedRoot:
    merkle_root_hex: str
    signature_b64: str
    public_pem_fingerprint: str

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


# ─── Provenance build / mint / verify ────────────────────────────────


def build_cell_provenance(par_dir: Path) -> CellProvenance:
    triples = collect_cells(par_dir)
    leaves_bytes = [_leaf_hash(s, r, v) for s, r, v in triples]
    root = merkle_root(leaves_bytes) if leaves_bytes else b""
    leaves = [
        CellLeaf(sheet=s, ref=r, value=v, leaf_hash_hex=lh.hex())
        for (s, r, v), lh in zip(triples, leaves_bytes, strict=True)
    ]
    return CellProvenance(
        par_dir=str(par_dir),
        leaf_count=len(leaves),
        merkle_root_hex=root.hex() if leaves else "",
        leaves=leaves,
    )


def mint_cell_proof(
    prov: CellProvenance, sheet: str, ref: str
) -> CellProof:
    """Return a Merkle inclusion proof for the cell ``sheet!ref``.

    Raises ``KeyError`` if the cell is not present in the provenance.
    """
    idx = None
    for i, leaf in enumerate(prov.leaves):
        if leaf.sheet == sheet and leaf.ref == ref:
            idx = i
            break
    if idx is None:
        raise KeyError(f"cell {sheet}!{ref} not present in provenance")
    leaves_bytes = [bytes.fromhex(leaf.leaf_hash_hex) for leaf in prov.leaves]
    path: MerkleProofPath = merkle_proof(leaves_bytes, idx)
    leaf = prov.leaves[idx]
    return CellProof(
        sheet=sheet,
        ref=ref,
        value=leaf.value,
        leaf_index=idx,
        leaf_hash_hex=path.leaf_hash,
        siblings=[{"hash": h, "dir": d} for h, d in path.siblings],
        merkle_root_hex=prov.merkle_root_hex,
    )


def verify_cell_proof(
    proof: CellProof, claimed_value: Any, root_hex: str
) -> bool:
    """Re-derive the Merkle root from ``claimed_value`` + sibling path.

    Returns ``True`` iff the recomputed root equals ``root_hex``. The
    auditor passes the value they *think* the cell has — if the parser
    or transcript was tampered, the leaf hash differs and the proof
    fails. The on-disk PAR file is not required.
    """
    leaf_hash_hex = hashlib.sha256(
        canonical_cell_bytes(proof.sheet, proof.ref, claimed_value)
    ).hexdigest()
    if leaf_hash_hex != proof.leaf_hash_hex:
        return False
    rebuilt = MerkleProofPath(
        leaf_index=proof.leaf_index,
        leaf_hash=leaf_hash_hex,
        siblings=[(s["hash"], s["dir"]) for s in proof.siblings],
    )
    return verify_merkle_proof(
        leaf_hash_hex=leaf_hash_hex, proof=rebuilt, root_hex=root_hex,
    )


# ─── ed25519 sign / verify wrapper ───────────────────────────────────


def sign_cell_root(
    root_hex: str, *, private_pem: Path,
) -> SignedRoot:
    """Sign the Merkle root with the bundle's ed25519 key.

    Reuses ``tools.cert_bundle_swid.sign`` — same key path conventions,
    same fingerprint format — so a SignedRoot can drop directly into the
    cert bundle manifest as a sibling attestation.
    """
    from tools.cert_bundle_swid.sign import (  # noqa: PLC0415 — lazy import
        b64,
        sign_bytes,
    )
    signature = sign_bytes(bytes.fromhex(root_hex), private_pem_path=private_pem)
    fingerprint = hashlib.sha256(
        Path(private_pem).with_suffix(".pub.pem").read_bytes()
        if Path(private_pem).with_suffix(".pub.pem").exists()
        else _derive_public_pem(private_pem)
    ).hexdigest()[:16]
    return SignedRoot(
        merkle_root_hex=root_hex,
        signature_b64=b64(signature),
        public_pem_fingerprint=fingerprint,
    )


def verify_signed_root(
    signed: SignedRoot, *, public_pem: Path,
) -> bool:
    from tools.cert_bundle_swid.sign import (  # noqa: PLC0415
        verify_signature,
    )
    import base64

    signature_bytes = base64.b64decode(signed.signature_b64.encode("ascii"))
    return verify_signature(
        bytes.fromhex(signed.merkle_root_hex),
        signature_bytes,
        public_pem_path=public_pem,
    )


def _derive_public_pem(private_pem: Path) -> bytes:
    """Materialise the matching public PEM bytes from the private PEM.

    Used only as a fallback for fingerprinting when the conventional
    ``private.pub.pem`` sidecar isn't present.
    """
    from tools.plugin_sign.signer import _import_crypto  # noqa: PLC0415

    serialization, Ed25519PrivateKey, _ = _import_crypto()
    sk = serialization.load_pem_private_key(
        Path(private_pem).read_bytes(), password=None,
    )
    if not isinstance(sk, Ed25519PrivateKey):
        raise TypeError("expected ed25519 private key")
    pub = sk.public_key()
    return pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
