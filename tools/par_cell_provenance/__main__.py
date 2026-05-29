"""CLI for the W5.3 cell-level PAR provenance tool.

Three subcommands:

* ``build`` — walk a raw PAR dump dir, emit a JSON file with the cell
  manifest + Merkle root + (optionally) signed root.

* ``proof`` — given a built manifest and a ``SHEET!REF`` selector,
  emit a single-cell inclusion proof JSON.

* ``verify`` — auditor side: given a manifest, a proof, and the
  claimed value, confirm the proof recomputes to the same root.

Usage::

    python -m tools.par_cell_provenance build \\
        games/fort-knox-wolf-run/raw/ \\
        --out reports/provenance/fort-knox-wolf-run.cells.json

    python -m tools.par_cell_provenance proof \\
        reports/provenance/fort-knox-wolf-run.cells.json \\
        --cell "PAR_001!C3" \\
        --out reports/provenance/proof.swid.json

    python -m tools.par_cell_provenance verify \\
        reports/provenance/proof.swid.json \\
        --root <hex>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .build import (
    build_cell_provenance,
    mint_cell_proof,
    sign_cell_root,
    verify_cell_proof,
)


def _cmd_build(args: argparse.Namespace) -> int:
    prov = build_cell_provenance(Path(args.par_dir))
    out_doc = prov.to_dict()
    if args.sign_with:
        signed = sign_cell_root(prov.merkle_root_hex, private_pem=Path(args.sign_with))
        out_doc["signed_root"] = signed.to_dict()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out_doc, sort_keys=True, indent=2))
    print(
        f"par_cell_provenance: {prov.leaf_count} cells, "
        f"root={prov.merkle_root_hex[:16]}… → {out_path}"
    )
    return 0


def _cmd_proof(args: argparse.Namespace) -> int:
    doc = json.loads(Path(args.manifest).read_text())
    # Re-hydrate just enough to mint the proof.
    from .build import CellLeaf, CellProvenance  # noqa: PLC0415
    prov = CellProvenance(
        par_dir=doc.get("par_dir", ""),
        leaf_count=doc["leaf_count"],
        merkle_root_hex=doc["merkle_root_hex"],
        leaves=[
            CellLeaf(
                sheet=l["sheet"], ref=l["ref"], value=l["value"],
                leaf_hash_hex=l["leaf_hash_hex"],
            )
            for l in doc["leaves"]
        ],
    )
    try:
        sheet, ref = args.cell.split("!", 1)
    except ValueError:
        print(f"--cell must be SHEET!REF, got {args.cell!r}", file=sys.stderr)
        return 2
    try:
        proof = mint_cell_proof(prov, sheet, ref)
    except KeyError as e:
        print(str(e), file=sys.stderr)
        return 3
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(proof.to_dict(), sort_keys=True, indent=2))
    print(f"par_cell_provenance: proof for {args.cell} → {out_path}")
    return 0


def _cmd_verify(args: argparse.Namespace) -> int:
    proof_doc = json.loads(Path(args.proof).read_text())
    from .build import CellProof  # noqa: PLC0415
    proof = CellProof(
        sheet=proof_doc["sheet"],
        ref=proof_doc["ref"],
        value=proof_doc["value"],
        leaf_index=proof_doc["leaf_index"],
        leaf_hash_hex=proof_doc["leaf_hash_hex"],
        siblings=proof_doc["siblings"],
        merkle_root_hex=proof_doc["merkle_root_hex"],
    )
    claimed = (
        json.loads(args.claimed_value)
        if args.claimed_value is not None
        else proof.value
    )
    root_hex = args.root or proof.merkle_root_hex
    ok = verify_cell_proof(proof, claimed, root_hex)
    print(
        f"par_cell_provenance: cell={proof.sheet}!{proof.ref} "
        f"verdict={'PASS' if ok else 'FAIL'}"
    )
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="par_cell_provenance",
        description="Cell-level PAR Merkle provenance (W5.3)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_build = sub.add_parser("build", help="Build cell-level Merkle manifest")
    p_build.add_argument("par_dir", help="Directory containing *.cells.json")
    p_build.add_argument("--out", required=True, help="Output JSON path")
    p_build.add_argument(
        "--sign-with",
        default=None,
        help="ed25519 private PEM path; when set adds 'signed_root' block",
    )
    p_build.set_defaults(func=_cmd_build)

    p_proof = sub.add_parser("proof", help="Mint inclusion proof for one cell")
    p_proof.add_argument("manifest", help="Manifest JSON from `build`")
    p_proof.add_argument(
        "--cell",
        required=True,
        help='Selector "SHEET!REF" (e.g. "PAR_001!C3")',
    )
    p_proof.add_argument("--out", required=True, help="Proof output JSON")
    p_proof.set_defaults(func=_cmd_proof)

    p_verify = sub.add_parser("verify", help="Auditor-side proof verification")
    p_verify.add_argument("proof", help="Proof JSON path")
    p_verify.add_argument(
        "--root",
        default=None,
        help="Claimed Merkle root hex (defaults to value embedded in proof)",
    )
    p_verify.add_argument(
        "--claimed-value",
        default=None,
        help="JSON-encoded claimed value (defaults to the proof's embedded value)",
    )
    p_verify.set_defaults(func=_cmd_verify)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
