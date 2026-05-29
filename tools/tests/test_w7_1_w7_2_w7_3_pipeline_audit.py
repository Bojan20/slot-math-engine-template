"""W7.1 (GH Actions stub) + W7.2 (pipeline) + W7.3 (audit trail) tests."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    run_pipeline, append_audit, verify_audit_chain, read_audit,
    verify_provenance,
)


SPEC_CLASSIC = ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"


# ─── W7.1 — GH Actions workflow exists ─────────────────────────────


class TestCiWorkflow(unittest.TestCase):
    def test_workflow_file_exists(self):
        wf = ROOT / ".github" / "workflows" / "math-dsl-acceptance.yml"
        self.assertTrue(wf.exists(), f"workflow not at {wf}")
        text = wf.read_text(encoding="utf-8")
        self.assertIn("tools.math_dsl", text)
        self.assertIn("acceptance", text)
        self.assertIn("z3-solver", text)


# ─── W7.2 — One-shot pipeline ──────────────────────────────────────


class TestPipeline(unittest.TestCase):
    def test_pipeline_end_to_end_classic(self):
        with tempfile.TemporaryDirectory() as td:
            res = run_pipeline(
                SPEC_CLASSIC, td, mode="c-1",
                vendor="studio-internal", swid="TG-001",
            )
            self.assertTrue(res["ok"])
            self.assertTrue(Path(res["cert_zip"]).exists())
            self.assertEqual(len(res["ir_sha256"]), 64)
            self.assertEqual(len(res["signature"]), 64)
            self.assertEqual(res["signature_algo"], "hmac")
            self.assertAlmostEqual(res["rtp_target"], 0.96)
            self.assertAlmostEqual(res["rtp_measured"], 0.96, delta=0.02)

    def test_pipeline_audit_entry_written(self):
        with tempfile.TemporaryDirectory() as td:
            res = run_pipeline(SPEC_CLASSIC, td, vendor="x")
            audit_p = Path(res["audit_path"])
            self.assertTrue(audit_p.exists())
            entries = read_audit(audit_p)
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["action"], "pipeline.run")
            self.assertEqual(entries[0]["inputs"]["vendor"], "x")

    def test_pipeline_cert_zip_contains_provenance(self):
        with tempfile.TemporaryDirectory() as td:
            res = run_pipeline(SPEC_CLASSIC, td, vendor="studio", swid="X")
            with zipfile.ZipFile(res["cert_zip"]) as z:
                ir = json.loads(z.read("game.ir.json"))
        self.assertIn("provenance", ir)
        self.assertEqual(ir["provenance"]["vendor"], "studio")
        self.assertEqual(ir["provenance"]["swid"], "X")
        ok, _ = verify_provenance(ir)
        self.assertTrue(ok)

    def test_pipeline_provenance_chain_consistent(self):
        with tempfile.TemporaryDirectory() as td:
            res = run_pipeline(SPEC_CLASSIC, td, vendor="x")
            with zipfile.ZipFile(res["cert_zip"]) as z:
                ir = json.loads(z.read("game.ir.json"))
        # The signed IR sha matches the pipeline's reported ir_sha256
        self.assertEqual(ir["provenance"]["ir_sha256"], res["ir_sha256"])


# ─── W7.3 — Audit trail ────────────────────────────────────────────


class TestAuditTrail(unittest.TestCase):
    def test_append_audit_creates_file(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "audit.jsonl"
            e = append_audit(p, action="test.sign", inputs={"a": 1},
                             outputs={"b": 2})
            self.assertTrue(p.exists())
            self.assertEqual(e["action"], "test.sign")
            self.assertEqual(len(e["sha256_chain"]), 64)
            self.assertEqual(e["prev_sha256"], "0" * 64)

    def test_multiple_appends_form_chain(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "audit.jsonl"
            e1 = append_audit(p, action="step1")
            e2 = append_audit(p, action="step2")
            e3 = append_audit(p, action="step3")
            self.assertEqual(e2["prev_sha256"], e1["sha256_chain"])
            self.assertEqual(e3["prev_sha256"], e2["sha256_chain"])

    def test_verify_chain_pass(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "audit.jsonl"
            append_audit(p, action="a")
            append_audit(p, action="b")
            append_audit(p, action="c")
            ok, bad = verify_audit_chain(p)
            self.assertTrue(ok)
            self.assertEqual(bad, [])

    def test_verify_chain_detects_tamper(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "audit.jsonl"
            append_audit(p, action="a", inputs={"x": 1})
            append_audit(p, action="b", inputs={"y": 2})
            append_audit(p, action="c", inputs={"z": 3})
            # Tamper with the middle line
            lines = p.read_text().splitlines()
            mid = json.loads(lines[1])
            mid["inputs"]["y"] = 999  # tampered value
            lines[1] = json.dumps(mid)
            p.write_text("\n".join(lines) + "\n")
            ok, bad = verify_audit_chain(p)
            self.assertFalse(ok)
            self.assertIn(2, bad)

    def test_read_audit_returns_all_entries(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "audit.jsonl"
            for i in range(5):
                append_audit(p, action=f"step_{i}", inputs={"i": i})
            entries = read_audit(p)
            self.assertEqual(len(entries), 5)
            self.assertEqual(entries[0]["action"], "step_0")
            self.assertEqual(entries[4]["action"], "step_4")

    def test_verify_empty_log_ok(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "audit.jsonl"
            ok, bad = verify_audit_chain(p)
            self.assertTrue(ok)
            self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
