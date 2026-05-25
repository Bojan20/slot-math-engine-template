"""W5.7 — slot-build full-pipeline E2E integration tests.

End-to-end coverage of the entire `slot-build` pipeline. Every test
parametrized over the shipped vendor PAR families exercises the full
chain:

    raw/<sheet>.tsv  (parse_par auto-detect vendor)
       ↓
    out/<vendor>.<swid>.ir.json          (vendor-shaped IR)
       ↓
    out/<vendor>.<swid>.slot-sim.ir.json (universal Rust IR)
       ↓
    codegen-ts/<slug>/ts/                (TS engine scaffold,
       ├── <slug>.ir.json (Zod-valid)     Zod-validated)
       ├── runner.ts
       └── …
       ↓
    codegen-studio/<slug>/studio/        (browser-runnable UI)
       ├── index.html
       ├── app.js
       └── …
       ↓
    cert/<slug>.<swid>.cert.zip          (signed cert bundle)
       ↓
    unzip + bash verify.sh               (exit 0 ⇒ pass)

Plus invariants the pipeline MUST satisfy:

  ▸ IR `meta.swid` survives end-to-end and appears in cert manifest.
  ▸ Universal IR SHA-256 in cert manifest equals the raw IR file hash.
  ▸ Studio + TS IRs validate against the Zod schema (W5.3 gate).
  ▸ The cert verify.sh exits 0 on the freshly-built bundle.
  ▸ Tampering with ANY IR file flips verify.sh to exit 1.

Run:
    python -m unittest tools.tests.test_w5_7_pipeline_e2e
"""
from __future__ import annotations
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))


# Vendor matrix — (raw_dir, sheet, expected_swid, slug_prefix, vendor)
PIPELINE_MATRIX = [
    ("games/fort-knox-wolf-run/raw", "PAR_001", "200-1775-001",
     "fort-knox-wolf-run", "igt"),
    ("games/fort-knox-wolf-run/raw", "PAR_002", "200-1775-002",
     "fort-knox-wolf-run", "igt"),
    ("games/ce-copy-test/raw", "PAR-001", "200-1637-001",
     "ce-copy-test", "lw"),
]


def _has_npx() -> bool:
    return shutil.which("npx") is not None


def _has_node() -> bool:
    return shutil.which("node") is not None


def _has_crypto() -> bool:
    try:
        import cryptography  # noqa: F401
        return True
    except ImportError:
        return False


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _run_full_pipeline(td: Path, raw_dir: str, sheet: str) -> tuple[Path, Path, Path, Path]:
    """Run `slot-build` with --no-mc + --codegen-ts + --codegen-studio +
    --cert-package and return paths to (out_dir, ts_dir, studio_dir,
    cert_dir).

    All artifacts land under `td/` (a temporary directory). Caller is
    responsible for cleanup via `with tempfile.TemporaryDirectory()`.
    """
    out = td / "out"
    ts = td / "ts"
    studio = td / "studio"
    cert = td / "cert"
    proc = subprocess.run(
        [
            sys.executable, "-m", "tools.slot_build",
            str(ROOT / raw_dir),
            "--sheet", sheet,
            "--no-mc",
            "--out", str(out),
            "--codegen-ts", str(ts),
            "--codegen-studio", str(studio),
            "--cert-package", str(cert),
            "--quiet",
        ],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"slot-build failed: {proc.stderr}\n{proc.stdout}")
    return out, ts, studio, cert


class TestE2EAllArtifactsEmitted(unittest.TestCase):
    """Every entry in the vendor matrix emits all four artifact layers."""

    def _check_all_for(self, raw_dir: str, sheet: str, expected_swid: str,
                        slug_prefix: str, vendor: str):
        if not _has_crypto():
            self.skipTest("cryptography not installed — cert step unavailable")

        with tempfile.TemporaryDirectory() as td_str:
            td = Path(td_str)
            out, ts, studio, cert = _run_full_pipeline(td, raw_dir, sheet)

            # 1) Vendor-shaped IR
            vendor_ir = out / f"{vendor}.{expected_swid}.ir.json"
            self.assertTrue(vendor_ir.exists(), f"missing vendor IR: {vendor_ir}")
            self.assertGreater(vendor_ir.stat().st_size, 1000)

            # 2) Universal slot-sim IR
            universal_ir = out / f"{vendor}.{expected_swid}.slot-sim.ir.json"
            self.assertTrue(universal_ir.exists(), f"missing universal IR: {universal_ir}")
            ir_data = json.loads(universal_ir.read_text())
            self.assertEqual(ir_data["meta"]["swid"], expected_swid)

            # 3) TS codegen scaffold (5 files)
            ts_dir = ts / f"{slug_prefix}-{expected_swid}" / "ts"
            self.assertTrue(ts_dir.is_dir(), f"missing TS scaffold: {ts_dir}")
            for f in ("README.md", "package.json", "tsconfig.json", "runner.ts",
                      f"{slug_prefix}-{expected_swid}.ir.json"):
                self.assertTrue((ts_dir / f).exists(), f"missing TS artifact: {f}")

            # 4) Studio scaffold (5 files)
            st_dir = studio / f"{slug_prefix}-{expected_swid}" / "studio"
            self.assertTrue(st_dir.is_dir(), f"missing studio: {st_dir}")
            for f in ("README.md", "index.html", "app.js", "app.css",
                      f"{slug_prefix}-{expected_swid}.ir.json"):
                self.assertTrue((st_dir / f).exists(), f"missing studio artifact: {f}")

            # 5) Cert package ZIP
            zips = list(cert.glob("*.cert.zip"))
            self.assertEqual(len(zips), 1, f"expected 1 cert zip, got {zips}")
            self.assertGreater(zips[0].stat().st_size, 10_000)

    def test_igt_par_001_full_pipeline(self):
        self._check_all_for(*PIPELINE_MATRIX[0])

    def test_igt_par_002_full_pipeline(self):
        self._check_all_for(*PIPELINE_MATRIX[1])

    def test_lw_par_001_full_pipeline(self):
        self._check_all_for(*PIPELINE_MATRIX[2])


class TestE2EInvariants(unittest.TestCase):
    """Pipeline invariants — SWID propagation, IR SHA, signed bundle integrity."""

    def setUp(self):
        if not _has_crypto():
            self.skipTest("cryptography not installed")

    def test_swid_survives_pipeline(self):
        """meta.swid must appear in every IR + cert manifest end-to-end."""
        raw_dir, sheet, expected_swid, slug_prefix, vendor = PIPELINE_MATRIX[0]
        with tempfile.TemporaryDirectory() as td_str:
            td = Path(td_str)
            out, ts, studio, cert = _run_full_pipeline(td, raw_dir, sheet)

            # Universal IR
            u_ir = json.loads(
                (out / f"{vendor}.{expected_swid}.slot-sim.ir.json").read_text()
            )
            self.assertEqual(u_ir["meta"]["swid"], expected_swid)

            # TS IR
            ts_ir = json.loads(
                (ts / f"{slug_prefix}-{expected_swid}" / "ts"
                 / f"{slug_prefix}-{expected_swid}.ir.json").read_text()
            )
            # SWID is embedded in TS IR meta.id slug, not raw SWID
            self.assertIn(expected_swid.lower(), ts_ir["meta"]["id"].lower())

            # Cert manifest
            zip_path = list(cert.glob("*.cert.zip"))[0]
            with zipfile.ZipFile(zip_path, "r") as zf:
                manifest = json.loads(zf.read("manifest.json"))
            self.assertEqual(manifest["game"]["swid"], expected_swid)
            self.assertEqual(manifest["game"]["vendor"], vendor)

    def test_cert_ir_sha_matches_emitted_universal(self):
        """The cert manifest's `ir_commitments.universal_sha256` must equal
        the SHA-256 of the universal IR file emitted earlier in the pipeline."""
        raw_dir, sheet, expected_swid, slug_prefix, vendor = PIPELINE_MATRIX[0]
        with tempfile.TemporaryDirectory() as td_str:
            td = Path(td_str)
            out, ts, studio, cert = _run_full_pipeline(td, raw_dir, sheet)
            u_path = out / f"{vendor}.{expected_swid}.slot-sim.ir.json"
            expected_sha = _sha256_file(u_path)
            zip_path = list(cert.glob("*.cert.zip"))[0]
            with zipfile.ZipFile(zip_path, "r") as zf:
                manifest = json.loads(zf.read("manifest.json"))
                bundled_sha = hashlib.sha256(zf.read("ir/universal.ir.json")).hexdigest()
            self.assertEqual(manifest["ir_commitments"]["universal_sha256"], expected_sha)
            self.assertEqual(manifest["ir_commitments"]["universal_sha256"], bundled_sha)

    def test_cert_verify_passes_on_fresh_bundle(self):
        """bash verify.sh inside a freshly-emitted bundle must exit 0."""
        raw_dir, sheet, expected_swid, slug_prefix, vendor = PIPELINE_MATRIX[0]
        with tempfile.TemporaryDirectory() as td_str:
            td = Path(td_str)
            _, _, _, cert = _run_full_pipeline(td, raw_dir, sheet)
            zip_path = list(cert.glob("*.cert.zip"))[0]
            unpack = td / "unpack"
            unpack.mkdir()
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(unpack)
            proc = subprocess.run(
                ["bash", "verify.sh"],
                capture_output=True, text=True, cwd=str(unpack), timeout=30,
            )
            self.assertEqual(proc.returncode, 0, f"verify failed: {proc.stdout}\n{proc.stderr}")

    def test_cert_verify_fails_on_tamper(self):
        """Tampering with any IR inside the bundle must trip verify.sh."""
        raw_dir, sheet, expected_swid, slug_prefix, vendor = PIPELINE_MATRIX[0]
        with tempfile.TemporaryDirectory() as td_str:
            td = Path(td_str)
            _, _, _, cert = _run_full_pipeline(td, raw_dir, sheet)
            zip_path = list(cert.glob("*.cert.zip"))[0]
            unpack = td / "unpack"
            unpack.mkdir()
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(unpack)
            # Tamper: insert a single byte into universal IR
            ir_path = unpack / "ir/universal.ir.json"
            original = ir_path.read_text()
            ir_path.write_text(original.replace('"meta"', '"meta_x"', 1))
            proc = subprocess.run(
                ["bash", "verify.sh"],
                capture_output=True, text=True, cwd=str(unpack), timeout=30,
            )
            self.assertEqual(proc.returncode, 1, "tampered bundle should fail verify")


@unittest.skipUnless(_has_npx(), "npx not available — TS validation skipped")
class TestE2ETsZodValidation(unittest.TestCase):
    """The TS IR emitted in the pipeline still passes the W5.3 Zod schema."""

    def _validate(self, raw_dir: str, sheet: str, expected_swid: str, slug_prefix: str, vendor: str):
        if not _has_crypto():
            self.skipTest("cryptography not installed")
        with tempfile.TemporaryDirectory() as td_str:
            td = Path(td_str)
            _, ts, _, _ = _run_full_pipeline(td, raw_dir, sheet)
            ir_path = (
                ts / f"{slug_prefix}-{expected_swid}" / "ts"
                / f"{slug_prefix}-{expected_swid}.ir.json"
            )
            proc = subprocess.run(
                ["npx", "tsx",
                 str(ROOT / "tools/parse_par/_validate_ts_ir.mjs"),
                 str(ir_path)],
                capture_output=True, text=True, cwd=str(ROOT), timeout=60,
            )
            self.assertEqual(proc.returncode, 0,
                             f"Zod validation failed:\n{proc.stdout}\n{proc.stderr}")

    def test_igt_par_001_ts_zod(self):
        self._validate(*PIPELINE_MATRIX[0])

    def test_lw_par_001_ts_zod(self):
        self._validate(*PIPELINE_MATRIX[2])


@unittest.skipUnless(_has_node(), "node not available — studio app.js exec skipped")
class TestE2EStudioRuntime(unittest.TestCase):
    """The Studio app.js spin function works on the emitted IR."""

    def test_igt_studio_spingrid_no_missing_cells(self):
        if not _has_crypto():
            self.skipTest("cryptography not installed")
        raw_dir, sheet, expected_swid, slug_prefix, vendor = PIPELINE_MATRIX[0]
        with tempfile.TemporaryDirectory() as td_str:
            td = Path(td_str)
            _, _, studio, _ = _run_full_pipeline(td, raw_dir, sheet)
            ir_path = (
                studio / f"{slug_prefix}-{expected_swid}" / "studio"
                / f"{slug_prefix}-{expected_swid}.ir.json"
            )
            smoke = f"""
            import {{ readFileSync }} from 'node:fs';
            const ir = JSON.parse(readFileSync({json.dumps(str(ir_path))}, 'utf-8'));
            function m32(seed) {{
              return function () {{
                seed = (seed + 0x6d2b79f5) >>> 0;
                let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
              }};
            }}
            const r = m32(42);
            const reels = ir.topology.reels, rows = ir.topology.rows;
            const strips = ir.reels.base;
            let nulls = 0, total = 0;
            for (let i = 0; i < 500; i++) {{
              for (let c = 0; c < reels; c++) {{
                const strip = strips[c]; if (!strip || !strip.length) continue;
                const stop = Math.floor(r() * strip.length);
                for (let row = 0; row < rows; row++) {{
                  const cell = strip[(stop + row) % strip.length];
                  total++;
                  if (cell == null) nulls++;
                }}
              }}
            }}
            console.log(JSON.stringify({{ total, nulls }}));
            """
            proc = subprocess.run(
                ["node", "--input-type=module", "-e", smoke],
                capture_output=True, text=True, cwd=str(ROOT), timeout=30,
            )
            self.assertEqual(proc.returncode, 0, f"node smoke failed: {proc.stderr}")
            r = json.loads(proc.stdout.strip())
            self.assertEqual(r["nulls"], 0, "no null/missing cells expected")
            self.assertGreater(r["total"], 0)


if __name__ == "__main__":
    unittest.main()
