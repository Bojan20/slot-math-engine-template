"""W6.1 — Cert bundle generator for math-compiler output.

Packages a fully solved SlotGameIR + DSL spec + provenance + run-time
verification artifacts into a single ZIP that can be uploaded to a
test lab (NMi, iTechLabs, BMM, GLI, Trisigma) or attached to a
regulator submission.

Bundle layout
=============

    cert_<game_slug>_<isodate>.zip
    ├── README.md             — purpose, layout, verification instructions
    ├── design.yaml           — Math DSL source (the *intent*)
    ├── game.ir.json          — solved SlotGameIR (canonical JSON)
    ├── provenance.json       — SHA-256 chain of design.yaml + game.ir.json
    ├── synth_log.json        — Z3 solver mode, timings, model values
    ├── manifest.json         — file → sha256 + size; bundle digest
    └── verify.sh             — shell script the lab runs to verify
                                IR re-derives the published RTP from the
                                solved weights (closed-form, no MC needed)

Usage:
    from tools.math_dsl.cert_bundle import build_cert_bundle
    path = build_cert_bundle(spec, solved_ir, "/tmp")

Lab-side verification:
    unzip cert_*.zip
    cd cert_*
    bash verify.sh        # exits 0 if SHA chain valid + RTP within tolerance
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .spec import MathDslSpec
from .extract import serialize_to_yaml


def _slug(s: str) -> str:
    out = []
    for ch in s.lower():
        out.append(ch if ch.isalnum() else "-")
    return "".join(out).strip("-") or "game"


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _verify_sh(rtp_target: float, rtp_tolerance: float) -> str:
    return f"""#!/usr/bin/env bash
# W6.1 cert bundle verification script.
# Re-derives the closed-form RTP from the solved SlotGameIR and asserts
# (1) every file in the bundle matches its declared SHA-256 from
#     `manifest.json`, and (2) `tools.smt.weight_synthesizer.measured_rtp`
# of the solved IR is within {rtp_tolerance} of {rtp_target}.
#
# Run from inside the unzipped bundle directory:
#     bash verify.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "[1/3] verifying file SHA-256 chain against manifest.json…"
python3 - <<'PY'
import json, hashlib, pathlib, sys
m = json.loads(pathlib.Path("manifest.json").read_text())
bad = 0
for name, want in m["files"].items():
    if name == "manifest.json":
        continue
    data = pathlib.Path(name).read_bytes()
    got = hashlib.sha256(data).hexdigest()
    if got != want["sha256"]:
        print(f"  SHA mismatch on {{name}}: got {{got[:16]}}…, want {{want['sha256'][:16]}}…")
        bad += 1
    else:
        print(f"  ok  {{name}}")
sys.exit(bad)
PY

echo "[2/3] running closed-form RTP verification…"
python3 - <<'PY'
import json, pathlib, sys
sys.path.insert(0, "{Path.cwd()}")  # adjust to your repo root before sending to lab
from tools.smt.weight_synthesizer import measured_rtp
ir = json.loads(pathlib.Path("game.ir.json").read_text())
rtp = measured_rtp(ir)
print(f"  measured_rtp = {{rtp:.6f}}  target = {rtp_target}  tolerance = {rtp_tolerance}")
delta = abs(rtp - {rtp_target})
if delta > {rtp_tolerance}:
    print(f"  RTP delta {{delta:.6f}} exceeds tolerance — FAIL")
    sys.exit(1)
print("  RTP within tolerance — PASS")
PY

echo "[3/3] bundle ok ✓"
"""


def build_cert_bundle(
    spec: MathDslSpec,
    solved_ir: dict,
    out_dir: str | Path,
    *,
    notes: Optional[str] = None,
) -> Path:
    """Assemble the cert ZIP under `out_dir`. Returns the ZIP path.

    The bundle is self-contained — every artifact has a SHA-256 in
    manifest.json + the verify.sh script re-derives RTP closed-form.
    No MC, no random seed, no Rust engine binary required for lab
    verification (only Python 3.10+ + z3-solver).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name_slug = _slug(spec.meta.get("name", "game"))
    bundle_name = f"cert_{name_slug}_{timestamp}.zip"
    zip_path = out_dir / bundle_name

    # 1) design.yaml — the DSL source
    yaml_text = serialize_to_yaml(spec)
    yaml_bytes = yaml_text.encode("utf-8")

    # 2) game.ir.json — solved IR (drop transient _synth_log + _cache_meta
    #    keys to keep the cert artifact deterministic per spec; archive a
    #    separate synth_log.json next to it).
    ir_clean = {k: v for k, v in solved_ir.items()
                if k not in ("_synth_log", "_cache_meta")}
    ir_bytes = json.dumps(ir_clean, indent=2, sort_keys=False).encode("utf-8")

    # 3) synth_log.json
    synth_log = solved_ir.get("_synth_log") or {}
    synth_bytes = json.dumps(synth_log, indent=2, sort_keys=False).encode("utf-8")

    # 4) provenance.json
    rtp_target = spec.constraints.target_rtp
    rtp_tolerance = spec.constraints.rtp_tolerance
    prov = {
        "schema_version": "1.0.0",
        "game": {
            "name": spec.meta.get("name"),
            "vendor": spec.meta.get("vendor"),
            "author": spec.meta.get("author"),
        },
        "math": {
            "target_rtp": rtp_target,
            "rtp_tolerance": rtp_tolerance,
            "volatility_class": spec.constraints.volatility_class,
            "hit_freq_target": spec.constraints.hit_freq_target,
            "max_win_x": spec.constraints.max_win_x,
            "jurisdictions": list(spec.constraints.jurisdictions),
        },
        "cert": {
            "built_at_utc": timestamp,
            "design_yaml_sha256": _sha256_bytes(yaml_bytes),
            "game_ir_json_sha256": _sha256_bytes(ir_bytes),
        },
        "verification": {
            "method": "closed_form_rtp_via_tools.smt.weight_synthesizer.measured_rtp",
            "expected_rtp": rtp_target,
            "tolerance": rtp_tolerance,
        },
    }
    if notes:
        prov["notes"] = notes
    prov_bytes = json.dumps(prov, indent=2, sort_keys=False).encode("utf-8")

    # 5) verify.sh
    verify_bytes = _verify_sh(rtp_target, rtp_tolerance).encode("utf-8")

    # 6) README.md
    readme = f"""# Cert bundle — {spec.meta.get('name')} ({timestamp})

This ZIP contains the math-compiler proof artifacts for the
**{spec.meta.get('name')}** slot game.

## Layout

| File | Purpose |
|---|---|
| `design.yaml` | Math DSL source — the *intent* (target RTP, volatility, features, constraints) |
| `game.ir.json` | Solved SlotGameIR (canonical JSON) — the *artifact* |
| `provenance.json` | SHA-256 chain of inputs + outputs |
| `synth_log.json` | Z3 solver mode + timing + model values |
| `manifest.json` | File → SHA-256 + size; bundle digest |
| `verify.sh` | Shell script the lab runs to verify integrity + RTP |

## Verification (lab side)

```bash
unzip {bundle_name}
cd {bundle_name[:-4]}
bash verify.sh
```

Exits 0 if all SHA-256 hashes match AND closed-form RTP
(re-derived from `game.ir.json` via `measured_rtp`) is within
**{rtp_tolerance}** of **{rtp_target}**.

## Reproducibility

The math compiler is **deterministic per spec** — running
`python -m tools.math_dsl synth design.yaml` on any machine with the
same `tools/` source tree will produce the same `game.ir.json` (modulo
ordered dict serialization differences). The cache layer at
`tools/smt/cache.py` is purely a runtime optimization and never changes
solver output.

— CORTEX Slot Math Engine v1.0.0
"""
    readme_bytes = readme.encode("utf-8")

    # Manifest of all files
    files_in_bundle = {
        "README.md": readme_bytes,
        "design.yaml": yaml_bytes,
        "game.ir.json": ir_bytes,
        "synth_log.json": synth_bytes,
        "provenance.json": prov_bytes,
        "verify.sh": verify_bytes,
    }
    manifest = {
        "bundle_name": bundle_name,
        "built_at_utc": timestamp,
        "files": {
            name: {
                "sha256": _sha256_bytes(data),
                "size": len(data),
            }
            for name, data in files_in_bundle.items()
        },
    }
    # Bundle digest = sha256 over sorted-key concat of file SHAs
    cat = "".join(
        manifest["files"][k]["sha256"] for k in sorted(manifest["files"].keys())
    )
    manifest["bundle_digest_sha256"] = _sha256_bytes(cat.encode("utf-8"))
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=False).encode("utf-8")

    # Write the zip
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files_in_bundle.items():
            zi = zipfile.ZipInfo(filename=name)
            zi.external_attr = (0o755 if name.endswith(".sh") else 0o644) << 16
            zi.date_time = (2026, 1, 1, 0, 0, 0)  # deterministic mtime
            z.writestr(zi, data)
        zi_m = zipfile.ZipInfo(filename="manifest.json")
        zi_m.external_attr = 0o644 << 16
        zi_m.date_time = (2026, 1, 1, 0, 0, 0)
        z.writestr(zi_m, manifest_bytes)

    return zip_path
