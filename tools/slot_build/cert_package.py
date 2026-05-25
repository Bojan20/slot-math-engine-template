"""W5.6 — Auto cert package builder.

Bundles a per-game certification ZIP that contains every artifact a
regulator lab needs to reproduce + verify the slot game's math:

  ▸ manifest.json          — game metadata + RTP claims + drift summary
                              + cryptographic commitments
  ▸ ir/universal.ir.json   — Rust slot-sim IR (single source of truth)
  ▸ ir/ts.ir.json          — TS engine IR (RGS client mirror)
  ▸ ir/vendor.ir.json      — vendor-shaped raw IR (auditable)
  ▸ audit/mc_verify.json   — W5.5 standard-tier MC verification report
  ▸ audit/par_commitments.json — SHA-256 over every raw PAR cell file
  ▸ audit/build_metadata.json — git commit, build time, host
  ▸ signatures/hsm_pubkey.pem — ed25519 public key
  ▸ signatures/manifest.sig    — ed25519 signature of manifest.json
  ▸ verify.sh                  — standalone bash script that recomputes
                                  all hashes + verifies the signature
  ▸ README.md                  — what's in the bundle, how to verify

The HSM secret key is generated per-build (ephemeral) by default and
discarded after signing. For production, pass `--hsm-key <path>` to
sign with an existing ed25519 PEM key.

CLI:
    python -m tools.slot_build.cert_package <game-dir> --out <DIR>

Where `<game-dir>` contains the slot-build scaffold (W5.2 layout):
  game-dir/
    README.md
    CERT.md
    ir/        (universal + vendor IRs)
    ...
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )
    from cryptography.hazmat.primitives import serialization
    _CRYPTO_OK = True
except ImportError:  # pragma: no cover
    _CRYPTO_OK = False


# ─── helpers ────────────────────────────────────────────────────────────────


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _git_rev() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=Path(__file__).resolve().parent.parent.parent,
            stderr=subprocess.DEVNULL,
        )
        return out.decode().strip()
    except Exception:
        return "unknown"


def _generate_hsm_keypair() -> tuple[bytes, bytes]:
    """Generate an ephemeral ed25519 keypair.

    Returns (private_pem_bytes, public_pem_bytes). Caller is responsible
    for discarding the private key after signing.
    """
    if not _CRYPTO_OK:
        raise RuntimeError(
            "cryptography library not installed; cert signing unavailable"
        )
    sk = Ed25519PrivateKey.generate()
    private_pem = sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem


def _sign_with_pem(private_pem: bytes, message: bytes) -> bytes:
    sk = serialization.load_pem_private_key(private_pem, password=None)
    if not isinstance(sk, Ed25519PrivateKey):
        raise ValueError("expected ed25519 PKCS8 PEM key")
    return sk.sign(message)


# ─── PAR commitment ─────────────────────────────────────────────────────────


def compute_par_commitments(raw_dir: Path) -> dict[str, str]:
    """SHA-256 over every PAR cell file in `raw_dir`."""
    if not raw_dir.is_dir():
        return {}
    out: dict[str, str] = {}
    for p in sorted(raw_dir.rglob("*")):
        if p.is_file():
            out[p.name] = _sha256_file(p)
    return out


# ─── manifest assembly ──────────────────────────────────────────────────────


def build_manifest(
    *,
    game_id: str,
    swid: str,
    vendor: str,
    universal_ir_path: Path,
    ts_ir_path: Path | None,
    vendor_ir_path: Path | None,
    mc_report_path: Path | None,
    par_commitments: dict[str, str],
    universal_ir_data: dict,
) -> dict[str, Any]:
    """Build the cert manifest dict (pre-signing)."""
    meta = universal_ir_data.get("meta", {})
    target_rtp = meta.get("rtp_total")
    rtp_breakdown = meta.get("rtp_breakdown", {})
    sampling_mode = meta.get("sampling_mode", "physical_strip")

    # MC drift extraction (if report available)
    mc_summary: dict[str, Any] = {"available": False}
    if mc_report_path and mc_report_path.exists():
        try:
            mc = json.loads(mc_report_path.read_text())
            # Find the entry for THIS IR file
            for r in mc.get("results", []) or []:
                ir_str = str(r.get("ir", ""))
                if str(universal_ir_path) in ir_str or universal_ir_path.name in ir_str:
                    mc_summary = {
                        "available": True,
                        "tier": mc.get("tier"),
                        "spins": r.get("spins"),
                        "seed": r.get("seed"),
                        "threshold": r.get("threshold"),
                        "effective_threshold": r.get("effective_threshold"),
                        "rtp_measured": r.get("rtp"),
                        "rtp_target": r.get("rtp_target"),
                        "hit_freq_measured": r.get("hit_freq"),
                        "win_freq_measured": r.get("win_freq"),
                        "drift": r.get("drift"),
                        "pass": r.get("ok"),
                    }
                    break
        except Exception:
            mc_summary = {"available": False, "error": "could not parse mc_report"}

    universal_sha = _sha256_file(universal_ir_path)
    ts_sha = _sha256_file(ts_ir_path) if (ts_ir_path and ts_ir_path.exists()) else None
    vendor_sha = (
        _sha256_file(vendor_ir_path) if (vendor_ir_path and vendor_ir_path.exists()) else None
    )

    return {
        "schema_version": "1.0.0",
        "cert_kind": "slot-math-engine-template/w5.6",
        "game": {
            "id": game_id,
            "vendor": vendor,
            "swid": swid,
            "name": meta.get("name", game_id),
        },
        "math": {
            "rtp_target": target_rtp,
            "rtp_breakdown": rtp_breakdown,
            "hit_frequency_target": meta.get("hit_frequency"),
            "win_frequency_target": meta.get("win_frequency"),
            "sampling_mode": sampling_mode,
            "mc_tolerance": meta.get("mc_tolerance"),
        },
        "ir_commitments": {
            "universal_sha256": universal_sha,
            "ts_sha256": ts_sha,
            "vendor_sha256": vendor_sha,
        },
        "mc_verification": mc_summary,
        "par_commitments_sha256": par_commitments,
        "build": {
            "git_commit": _git_rev(),
            "built_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "host": os.uname().nodename if hasattr(os, "uname") else "unknown",
            "python_version": sys.version.split()[0],
        },
    }


# ─── cert package writer ────────────────────────────────────────────────────


def build_cert_package(
    *,
    out_dir: Path,
    game_id: str,
    swid: str,
    vendor: str,
    universal_ir_path: Path,
    ts_ir_path: Path | None = None,
    vendor_ir_path: Path | None = None,
    raw_dir: Path | None = None,
    mc_report_path: Path | None = None,
    hsm_key_pem: bytes | None = None,
) -> Path:
    """Build a cert package ZIP.

    Returns the path to the emitted ZIP file (`<out_dir>/<game_id>.<swid>.cert.zip`).
    """
    if not _CRYPTO_OK:
        raise RuntimeError("cryptography library required for cert package signing")
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    universal_ir_data = json.loads(universal_ir_path.read_text())
    par_commitments = compute_par_commitments(raw_dir) if raw_dir else {}

    manifest = build_manifest(
        game_id=game_id,
        swid=swid,
        vendor=vendor,
        universal_ir_path=universal_ir_path,
        ts_ir_path=ts_ir_path,
        vendor_ir_path=vendor_ir_path,
        mc_report_path=mc_report_path,
        par_commitments=par_commitments,
        universal_ir_data=universal_ir_data,
    )

    # Sign manifest with ephemeral key (or provided key)
    if hsm_key_pem is None:
        private_pem, public_pem = _generate_hsm_keypair()
        ephemeral = True
    else:
        private_pem = hsm_key_pem
        sk = serialization.load_pem_private_key(private_pem, password=None)
        public_pem = sk.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        ephemeral = False

    manifest_json = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    signature = _sign_with_pem(private_pem, manifest_json)
    # Wipe the private PEM from memory ASAP if ephemeral
    if ephemeral:
        private_pem = b"\x00" * len(private_pem)

    # Build verify.sh content
    verify_sh = _build_verify_script(game_id, swid)

    # README
    readme = _build_readme(manifest)

    zip_path = out_dir / f"{game_id}.{swid}.cert.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_json)
        zf.writestr("signatures/manifest.sig", signature)
        zf.writestr("signatures/hsm_pubkey.pem", public_pem)
        zf.writestr("ir/universal.ir.json", universal_ir_path.read_bytes())
        if ts_ir_path and ts_ir_path.exists():
            zf.writestr("ir/ts.ir.json", ts_ir_path.read_bytes())
        if vendor_ir_path and vendor_ir_path.exists():
            zf.writestr("ir/vendor.ir.json", vendor_ir_path.read_bytes())
        if mc_report_path and mc_report_path.exists():
            zf.writestr("audit/mc_verify.json", mc_report_path.read_bytes())
        zf.writestr(
            "audit/par_commitments.json",
            json.dumps(par_commitments, indent=2, sort_keys=True),
        )
        zf.writestr(
            "audit/build_metadata.json",
            json.dumps(manifest["build"], indent=2, sort_keys=True),
        )
        zf.writestr("verify.sh", verify_sh)
        zf.writestr("README.md", readme)

    return zip_path


def _build_verify_script(game_id: str, swid: str) -> str:
    return f"""#!/usr/bin/env bash
# W5.6 cert-bundle verify script — recompute SHA-256 + ed25519 verify.
# Standalone: only requires `openssl` + `python3` + standard unix tools.
# Returns 0 on full pass, 1 on any hash/signature mismatch.

set -euo pipefail
cd "$(dirname "$0")"

echo "[w5.6-verify] {game_id}.{swid} cert bundle"

# 1. Re-hash every IR file and check against manifest commitments
python3 - <<'PYCHECK'
import hashlib, json, sys
m = json.load(open("manifest.json"))
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            c = f.read(1<<20)
            if not c: break
            h.update(c)
    return h.hexdigest()

failed = 0
checks = []
for label, key in [("universal", "universal_sha256"), ("ts", "ts_sha256"), ("vendor", "vendor_sha256")]:
    expected = m["ir_commitments"].get(key)
    if expected is None:
        continue
    path = f"ir/{{label}}.ir.json"
    try:
        actual = sha(path)
    except FileNotFoundError:
        print(f"  [{{label}}] MISSING")
        failed += 1
        continue
    ok = actual == expected
    checks.append((label, ok))
    print(f"  [{{label}}] {{'OK' if ok else 'FAIL'}}")
    if not ok:
        failed += 1
        print(f"    expected: {{expected}}")
        print(f"    actual:   {{actual}}")

if failed:
    sys.exit(1)
print(f"  ✅ {{len(checks)}}/{{len(checks)}} IR hashes match manifest")
PYCHECK

# 2. ed25519 signature verify
python3 - <<'PYSIG'
import sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature

with open("manifest.json", "rb") as f:
    manifest_bytes = f.read()
with open("signatures/manifest.sig", "rb") as f:
    sig = f.read()
with open("signatures/hsm_pubkey.pem", "rb") as f:
    pub = serialization.load_pem_public_key(f.read())

assert isinstance(pub, Ed25519PublicKey), "not an ed25519 key"
try:
    pub.verify(sig, manifest_bytes)
    print("  ✅ ed25519 signature OK")
except InvalidSignature:
    print("  ❌ ed25519 signature FAILED")
    sys.exit(1)
PYSIG

echo "[w5.6-verify] ✅ cert bundle integrity verified"
"""


def _build_readme(manifest: dict) -> str:
    game = manifest["game"]
    math = manifest["math"]
    mc = manifest["mc_verification"]
    return f"""# Cert Bundle — {game['name']} ({game['swid']})

Auto-generated by `slot-build --cert-package` (W5.6). This ZIP is a
**self-contained certification package** suitable for regulator-lab
submission.

## Game

| Field | Value |
|---|---|
| Game ID | `{game['id']}` |
| Vendor  | `{game['vendor']}` |
| SWID    | `{game['swid']}` |
| Name    | {game['name']} |

## Math claims

| Metric | Value |
|---|---|
| RTP target | {math.get('rtp_target', 'n/a')} |
| Hit-freq target | {math.get('hit_frequency_target', 'n/a')} |
| Win-freq target | {math.get('win_frequency_target', 'n/a')} |
| Sampling mode | {math.get('sampling_mode', 'n/a')} |
| MC tolerance (override) | {math.get('mc_tolerance', 'strict-tier')} |

## MC verification

| Field | Value |
|---|---|
| Tier | {mc.get('tier', 'n/a')} |
| Spins | {mc.get('spins', 'n/a')} |
| RTP measured | {mc.get('rtp_measured', 'n/a')} |
| RTP target | {mc.get('rtp_target', 'n/a')} |
| Drift | {mc.get('drift', 'n/a')} |
| Pass | {mc.get('pass', 'n/a')} |

## What's in the bundle

| Path | Purpose |
|---|---|
| `manifest.json`                  | cert claims + commitments + build metadata |
| `signatures/manifest.sig`        | ed25519 signature of `manifest.json` |
| `signatures/hsm_pubkey.pem`      | ed25519 public key (PEM) |
| `ir/universal.ir.json`           | Rust slot-sim IR (single source of truth) |
| `ir/ts.ir.json`                  | TS engine IR (RGS client format) |
| `ir/vendor.ir.json`              | vendor-shaped raw IR (auditable) |
| `audit/mc_verify.json`           | W5.5 standard-tier MC verification |
| `audit/par_commitments.json`     | SHA-256 over each raw PAR file |
| `audit/build_metadata.json`      | git commit + build time + host |
| `verify.sh`                      | standalone hash/signature verify script |

## How to verify

```bash
unzip -d bundle <game-id>.<swid>.cert.zip
cd bundle
bash verify.sh
```

Returns exit code 0 on full integrity pass, 1 on any mismatch.

## Build metadata

| Field | Value |
|---|---|
| git commit | `{manifest['build']['git_commit'][:12]}` |
| built at   | {manifest['build']['built_at_utc']} |
| host       | {manifest['build']['host']} |
"""


# ─── CLI ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="slot-build-cert", description="W5.6 cert package builder")
    ap.add_argument("universal_ir", help="path to *.slot-sim.ir.json")
    ap.add_argument("--out", default="dist/cert", help="output directory (default dist/cert/)")
    ap.add_argument("--ts-ir", default=None, help="path to TS IR JSON")
    ap.add_argument("--vendor-ir", default=None, help="path to vendor-shaped IR JSON")
    ap.add_argument("--raw-dir", default=None, help="path to raw PAR dump dir")
    ap.add_argument("--mc-report", default=None, help="W5.5 MC verify JSON report path")
    ap.add_argument("--hsm-key", default=None, help="ed25519 private key PEM path (else ephemeral)")
    ap.add_argument("--game-id", default=None, help="override game-id (default from IR meta)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    universal = Path(args.universal_ir).resolve()
    if not universal.exists():
        print(f"error: {universal} not found", file=sys.stderr)
        return 2

    ir = json.loads(universal.read_text())
    meta = ir.get("meta", {})
    swid = meta.get("swid") or universal.stem
    vendor = meta.get("vendor") or "unknown"
    game_id = args.game_id or meta.get("name", swid).lower().replace(" ", "-")

    hsm_pem = None
    if args.hsm_key:
        hsm_pem = Path(args.hsm_key).read_bytes()

    zip_path = build_cert_package(
        out_dir=Path(args.out),
        game_id=game_id,
        swid=swid,
        vendor=vendor,
        universal_ir_path=universal,
        ts_ir_path=Path(args.ts_ir) if args.ts_ir else None,
        vendor_ir_path=Path(args.vendor_ir) if args.vendor_ir else None,
        raw_dir=Path(args.raw_dir) if args.raw_dir else None,
        mc_report_path=Path(args.mc_report) if args.mc_report else None,
        hsm_key_pem=hsm_pem,
    )
    if not args.quiet:
        size_kb = zip_path.stat().st_size / 1024
        print(f"✅ cert package {zip_path} ({size_kb:.1f} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
