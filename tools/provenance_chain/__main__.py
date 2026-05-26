"""CLI entry for slot-provenance-chain."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.provenance_chain.chain import (
    build_chain,
    verify_chain,
    merkle_proof,
    verify_merkle_proof,
    ChainCommitment,
    MerkleProofPath,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-provenance-chain",
        description=(
            "Build / verify a Merkle chain-of-custody over PAR cells + "
            "IR digest. Supports selective Merkle proofs for individual "
            "PAR cells without revealing siblings."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    bld = sub.add_parser("build", help="emit chain.json + leaves.json")
    bld.add_argument("--ir", type=Path, required=True)
    bld.add_argument("--par-dir", type=Path, required=True)
    bld.add_argument("--out", type=Path, required=True,
                     help="directory for chain.json + leaves.json")
    bld.add_argument("--quiet", action="store_true")

    vfy = sub.add_parser("verify", help="re-derive + compare commitments")
    vfy.add_argument("--ir", type=Path, required=True)
    vfy.add_argument("--par-dir", type=Path, required=True)
    vfy.add_argument("--chain", type=Path, required=True,
                     help="chain.json produced by `build`")
    vfy.add_argument("--json", type=Path, default=None)
    vfy.add_argument("--quiet", action="store_true")

    pf = sub.add_parser("proof", help="emit a Merkle proof for one leaf index")
    pf.add_argument("--ir", type=Path, required=True)
    pf.add_argument("--par-dir", type=Path, required=True)
    pf.add_argument("--index", type=int, required=True)
    pf.add_argument("--out", type=Path, required=True)
    pf.add_argument("--quiet", action="store_true")

    vp = sub.add_parser("verify-proof",
                         help="check a Merkle proof against a claimed root")
    vp.add_argument("--proof", type=Path, required=True)
    vp.add_argument("--root", required=True,
                     help="claimed Merkle root hex")
    vp.add_argument("--leaf-hash", required=True,
                     help="claimed leaf SHA-256 hex")
    vp.add_argument("--quiet", action="store_true")

    args = p.parse_args(argv)

    if args.cmd == "build":
        try:
            ir = json.loads(args.ir.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read IR: {e}\n")
            return 2
        chain, leaves = build_chain(ir=ir, par_dir=args.par_dir)
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "chain.json").write_text(
            json.dumps(chain.to_dict(), indent=2, sort_keys=True)
        )
        (args.out / "leaves.json").write_text(
            json.dumps([leaf.hex() for leaf in leaves], indent=2)
        )
        if not args.quiet:
            sys.stdout.write(
                f"\n[provenance-chain build] leaves={chain.par_leaves_count}  "
                f"root={chain.par_merkle_root_hex[:16]}…  "
                f"chain={chain.chain_commitment_hex[:16]}…\n"
            )
        return 0

    if args.cmd == "verify":
        try:
            ir = json.loads(args.ir.read_text())
            chain_data = json.loads(args.chain.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read inputs: {e}\n")
            return 2
        chain = ChainCommitment(
            par_leaves_count=int(chain_data["par_leaves_count"]),
            par_merkle_root_hex=str(chain_data["par_merkle_root_hex"]),
            ir_digest_hex=str(chain_data["ir_digest_hex"]),
            timestamp_utc=str(chain_data["timestamp_utc"]),
            chain_commitment_hex=str(chain_data["chain_commitment_hex"]),
        )
        report = verify_chain(ir=ir, chain=chain, par_dir=args.par_dir)
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(
                json.dumps(report.to_dict(), indent=2, sort_keys=True)
            )
        if not args.quiet:
            verdict = "✅ VALID" if report.passed else "🔴 INVALID"
            sys.stdout.write(
                f"\n[provenance-chain verify] {verdict}  "
                f"merkle={report.merkle_match} ir={report.ir_match} "
                f"chain={report.chain_match}\n"
            )
        return 0 if report.passed else 1

    if args.cmd == "proof":
        try:
            ir = json.loads(args.ir.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read IR: {e}\n")
            return 2
        _, leaves = build_chain(ir=ir, par_dir=args.par_dir)
        if not (0 <= args.index < len(leaves)):
            sys.stderr.write(
                f"index {args.index} out of range (have {len(leaves)} leaves)\n"
            )
            return 2
        proof = merkle_proof(leaves, args.index)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(proof.to_dict(), indent=2, sort_keys=True))
        if not args.quiet:
            sys.stdout.write(
                f"\n[provenance-chain proof] leaf={args.index}  "
                f"hash={proof.leaf_hash[:16]}…  "
                f"path_len={len(proof.siblings)}\n"
            )
        return 0

    if args.cmd == "verify-proof":
        try:
            proof_data = json.loads(args.proof.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read proof: {e}\n")
            return 2
        proof = MerkleProofPath(
            leaf_index=int(proof_data["leaf_index"]),
            leaf_hash=str(proof_data["leaf_hash"]),
            siblings=[
                (str(s["hash"]), str(s["dir"]))
                for s in proof_data.get("siblings") or []
            ],
        )
        ok = verify_merkle_proof(
            leaf_hash_hex=args.leaf_hash,
            proof=proof,
            root_hex=args.root,
        )
        if not args.quiet:
            sys.stdout.write(
                f"\n[provenance-chain verify-proof] "
                f"{'✅ VALID' if ok else '🔴 INVALID'}\n"
            )
        return 0 if ok else 1

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
