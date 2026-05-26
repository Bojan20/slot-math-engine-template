"""W7.5 — Crypto-verifiable PAR provenance regression tests.

Six guarantees:

  1. **Merkle build correctness** — canonical leaves → deterministic
     root across runs and machines.
  2. **Per-leaf proof verifies** — every emitted inclusion proof
     reconstructs the signed root.
  3. **Tamper detection (cell)** — modifying any cell value breaks
     the inclusion proof.
  4. **Tamper detection (meta)** — modifying meta dict breaks the
     signed-root verify.
  5. **Tamper detection (signature)** — flipping signature bit breaks
     verify.
  6. **E2E cert bundle integration** — `slot-build --cert-package`
     emits a `provenance/` directory with verifiable proofs.

Run:
    python -m unittest tools.tests.test_w7_5_provenance
"""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: F401
    _HAS_CRYPTO = True
except ImportError:
    _HAS_CRYPTO = False


from tools.provenance.merkle_tree import (
    InclusionProof,
    canonicalize_par_row,
    build_merkle_tree,
    hash_leaf,
    hash_inner,
)


class TestMerkleTreeBuild(unittest.TestCase):
    """Pure-Python Merkle build behavior."""

    def test_canonicalize_is_deterministic(self):
        a = canonicalize_par_row({"combo": ["Red7"] * 5, "pays": 200})
        b = canonicalize_par_row({"pays": 200, "combo": ["Red7"] * 5})
        # Sort keys → identical bytes regardless of insertion order
        self.assertEqual(a, b)

    def test_empty_input_raises(self):
        with self.assertRaises(ValueError):
            build_merkle_tree([])

    def test_single_leaf_root_equals_leaf_hash(self):
        rows = [{"x": 1}]
        tree = build_merkle_tree(rows)
        leaf = hash_leaf(canonicalize_par_row(rows[0]))
        self.assertEqual(tree.root_hash, leaf)
        self.assertEqual(tree.size, 1)

    def test_two_leaves_root_is_hash_of_concat(self):
        rows = [{"x": 1}, {"y": 2}]
        tree = build_merkle_tree(rows)
        l0 = hash_leaf(canonicalize_par_row(rows[0]))
        l1 = hash_leaf(canonicalize_par_row(rows[1]))
        expected_root = hash_inner(l0, l1)
        self.assertEqual(tree.root_hash, expected_root)

    def test_odd_leaf_count_self_pads(self):
        """Odd count: last leaf is paired with itself."""
        rows = [{"a": 1}, {"b": 2}, {"c": 3}]
        tree = build_merkle_tree(rows)
        self.assertEqual(tree.size, 3)
        self.assertGreaterEqual(len(tree.layers), 3)
        # Verify proof for every leaf reconstructs the root
        for i in range(3):
            proof = tree.proof_for(i)
            self.assertTrue(proof.verify(tree.root_hash))

    def test_deterministic_root_across_runs(self):
        rows = [{"i": i, "v": i * 2.5} for i in range(7)]
        r1 = build_merkle_tree(rows).root_hash
        r2 = build_merkle_tree(rows).root_hash
        self.assertEqual(r1, r2)


class TestInclusionProof(unittest.TestCase):
    """Inclusion proofs must verify for every leaf."""

    def test_proof_for_every_leaf_reconstructs_root(self):
        rows = [{"row": i, "pays": i * 7} for i in range(11)]
        tree = build_merkle_tree(rows)
        for i in range(len(rows)):
            proof = tree.proof_for(i)
            self.assertTrue(proof.verify(tree.root_hash))

    def test_proof_for_invalid_index_raises(self):
        rows = [{"x": 1}, {"y": 2}]
        tree = build_merkle_tree(rows)
        with self.assertRaises(IndexError):
            tree.proof_for(5)
        with self.assertRaises(IndexError):
            tree.proof_for(-1)

    def test_proof_serialization_roundtrip(self):
        rows = [{"x": i} for i in range(5)]
        tree = build_merkle_tree(rows)
        proof = tree.proof_for(2)
        d = proof.to_dict()
        restored = InclusionProof.from_dict(d)
        self.assertEqual(restored.leaf_index, proof.leaf_index)
        self.assertEqual(restored.leaf_hash, proof.leaf_hash)
        self.assertEqual(restored.tree_size, proof.tree_size)
        self.assertEqual(restored.path, proof.path)
        self.assertTrue(restored.verify(tree.root_hash))

    def test_tampered_leaf_hash_fails_proof(self):
        rows = [{"x": i} for i in range(5)]
        tree = build_merkle_tree(rows)
        proof = tree.proof_for(2)
        # Tamper: flip last byte of leaf_hash
        tampered = bytes(proof.leaf_hash[:-1]) + bytes([proof.leaf_hash[-1] ^ 0xFF])
        proof.leaf_hash = tampered
        self.assertFalse(proof.verify(tree.root_hash))


@unittest.skipUnless(_HAS_CRYPTO, "cryptography required")
class TestSignedProvenance(unittest.TestCase):
    """End-to-end signed-root + cell-verify cycle."""

    @classmethod
    def setUpClass(cls):
        from tools.provenance.par_provenance import build_provenance
        cls.build_provenance = staticmethod(build_provenance)
        cls.par_rows = [
            {"combo": ["Red7"] * 5, "pays": 200, "rtp": 0.125},
            {"combo": ["Blue7"] * 5, "pays": 100, "rtp": 0.108},
            {"combo": ["Bell"] * 5, "pays": 25, "rtp": 0.038},
        ]
        cls.meta = {"vendor": "test", "swid": "TEST-001"}

    def test_build_returns_artifact_with_root(self):
        artifact, tree = self.build_provenance(self.par_rows, meta=self.meta)
        self.assertEqual(artifact.tree_size, len(self.par_rows))
        self.assertEqual(len(bytes.fromhex(artifact.merkle_root_hex)), 32)
        self.assertGreater(len(artifact.signature_hex), 0)

    def test_verify_signed_root(self):
        from tools.provenance.par_provenance import verify_signed_root
        artifact, _ = self.build_provenance(self.par_rows, meta=self.meta)
        self.assertTrue(verify_signed_root(artifact))

    def test_verify_each_cell(self):
        from tools.provenance.par_provenance import verify_proof
        artifact, tree = self.build_provenance(self.par_rows, meta=self.meta)
        for i, row in enumerate(self.par_rows):
            proof = tree.proof_for(i)
            self.assertTrue(verify_proof(row, proof, artifact))

    def test_tampered_cell_fails_verify(self):
        from tools.provenance.par_provenance import verify_proof
        artifact, tree = self.build_provenance(self.par_rows, meta=self.meta)
        proof = tree.proof_for(0)
        tampered = dict(self.par_rows[0])
        tampered["pays"] = 99999  # flip pay value
        self.assertFalse(verify_proof(tampered, proof, artifact))

    def test_tampered_meta_fails_verify_signed_root(self):
        from tools.provenance.par_provenance import verify_signed_root
        artifact, _ = self.build_provenance(self.par_rows, meta=self.meta)
        artifact.meta = dict(artifact.meta)
        artifact.meta["vendor"] = "tampered-vendor"
        self.assertFalse(verify_signed_root(artifact))

    def test_tampered_signature_fails_verify(self):
        from tools.provenance.par_provenance import verify_signed_root
        artifact, _ = self.build_provenance(self.par_rows, meta=self.meta)
        sig = bytes.fromhex(artifact.signature_hex)
        tampered_sig = bytes([sig[0] ^ 0xFF]) + sig[1:]
        artifact.signature_hex = tampered_sig.hex()
        self.assertFalse(verify_signed_root(artifact))

    def test_artifact_serialization_roundtrip(self):
        from tools.provenance.par_provenance import ProvenanceArtifact
        artifact, _ = self.build_provenance(self.par_rows, meta=self.meta)
        d = artifact.to_dict()
        restored = ProvenanceArtifact.from_dict(d)
        from tools.provenance.par_provenance import verify_signed_root
        self.assertTrue(verify_signed_root(restored))


@unittest.skipUnless(_HAS_CRYPTO, "cryptography required")
class TestCertBundleIntegration(unittest.TestCase):
    """`slot-build --cert-package` emits verifiable provenance section."""

    def test_cert_bundle_contains_provenance(self):
        raw_dir = ROOT / "games/ce-copy-test/raw"
        if not raw_dir.exists():
            self.skipTest("raw dir missing")
        with tempfile.TemporaryDirectory() as td:
            cert_out = Path(td) / "cert"
            proc = subprocess.run(
                [sys.executable, "-m", "tools.slot_build",
                 str(raw_dir),
                 "--sheet", "PAR-001",
                 "--no-mc",
                 "--cert-package", str(cert_out),
                 "--quiet"],
                capture_output=True, text=True, cwd=str(ROOT), timeout=60,
            )
            self.assertEqual(proc.returncode, 0, f"slot-build failed: {proc.stderr}")
            zips = list(cert_out.glob("*.cert.zip"))
            self.assertEqual(len(zips), 1)
            with zipfile.ZipFile(zips[0]) as zf:
                names = zf.namelist()
                self.assertIn("provenance/par_provenance.json", names)
                self.assertIn("provenance/inclusion_proofs.json", names)
                # Verify all proofs reconstruct
                prov = json.loads(zf.read("provenance/par_provenance.json"))
                proofs = json.loads(zf.read("provenance/inclusion_proofs.json"))
            from tools.provenance import ProvenanceArtifact, verify_proof
            from tools.provenance.merkle_tree import InclusionProof
            artifact = ProvenanceArtifact.from_dict(prov)
            verified = 0
            for entry in proofs["rows"]:
                proof = InclusionProof.from_dict(entry["proof"])
                if verify_proof(entry["row"], proof, artifact):
                    verified += 1
            self.assertEqual(verified, len(proofs["rows"]))
            self.assertGreater(verified, 0)


if __name__ == "__main__":
    unittest.main()
