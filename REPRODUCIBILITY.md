# Reproducibility recipe

Step-by-step recipe za external auditora / regulator lab koji želi da
verifikuje da naši Merkle root-ovi reproduciraju byte-identical iz
source code-a. Cilj: zero-trust verification — auditor ne mora da
veruje našim emit-anim JSON-ovima; rebuild-uje sve sam.

## Prerequisites

Minimal toolchain:

| Tool | Version | Used for |
|---|---|---|
| Python | 3.10+ | kernel ports + acceptance builders + dossier HTML |
| Rust | stable (1.85+) | `slot-math-wasm` crate |
| Rust | 1.83 (pinned) | `rust-sim` workspace (parity-deterministic) |
| Node.js | 22+ | wasm pkg loading za parity gate |
| wasm-pack | 0.13+ | WebAssembly build |
| ripgrep, jq | latest | (optional) inspection |

Install (macOS / Linux):

```bash
# Rust 1.83 (parity pin) + stable (wasm)
rustup toolchain install 1.83 stable
rustup target add wasm32-unknown-unknown --toolchain stable

# wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Python deps
python3 -m pip install pytest pyyaml
```

## Step 1: Verify the kernel attestation chain

Master Merkle root nad svih 20 kernel acceptance JSONova:

```bash
git clone https://github.com/Bojan20/slot-math-engine-template
cd slot-math-engine-template

# Rebuild all kernel acceptance JSONs from source
python3 -m tools.build_all_w244_kernels

# Inspect the master Merkle
python3 -c "import json; d=json.load(open(
  'reports/acceptance/W244_ALL_KERNELS.json'));
  print(d['master_merkle_root_sha256'])"

# Re-run — must produce byte-identical output
python3 -m tools.build_all_w244_kernels
git diff reports/acceptance/W244_ALL_KERNELS.json
# (should print nothing — byte-identical)
```

Expected: master Merkle on `main` should match the value emitted by
the rebuild. If it doesn't, **the chain is broken** and should be
reported as a security issue (see `SECURITY.md`).

## Step 2: Verify Python ↔ Rust kernel parity

```bash
# Build Rust kernel CLI
cargo build --manifest-path rust-sim/Cargo.toml --release \
  --bin kernel_parity

# Run cross-language parity gate
python3 tools/parity/w244_rust_python_parity.py

# Verify max delta is sub-ULP
python3 -c "import json; d=json.load(open(
  'reports/acceptance/RUST_PYTHON_PARITY_KERNEL.json'));
  print('max delta:', max(r['delta_abs'] for r in d['records']))"
```

Expected max delta: `< 1e-12` (typical `~9.4e-15`).

## Step 3: Verify Python ↔ wasm parity

```bash
# Build wasm pkg (nodejs target)
cd packages/slot-math-wasm
RUSTUP_TOOLCHAIN=stable wasm-pack build --target nodejs --release
cd ../..

# Run wasm parity gate (spawns Node subprocess to load wasm)
python3 tools/parity/w244_wasm_python_parity.py

# Verify all 20 fixtures across 7 kernels match
python3 -c "import json; d=json.load(open(
  'reports/acceptance/WASM_PYTHON_PARITY_KERNEL.json'));
  print(f'{d[\"pass_count\"]}/{d[\"fixtures_count\"]} match, '
        f'max delta {d[\"max_observed_delta\"]:.2e}')"
```

Expected: `20/20 match, max delta 3.4e-15`.

## Step 4: Verify dossier HTML reproducibility

```bash
# Rebuild all 5 root HTML dashboards + 19 per-kernel pages + landing
make dossier-all

# Diff against committed
git diff reports/dossier/
# (should print nothing — byte-identical)
```

Every HTML page advertises its own SHA-256 Merkle in the footer.
Auditor can recompute by hand:

```bash
# Hash a specific page body (excluding the line that contains the
# Merkle itself — we strip __MERKLE__ before hashing)
python3 -c "
import hashlib, pathlib
text = pathlib.Path('reports/dossier/INDUSTRY_FIRST_DOSSIER.html')\
    .read_text()
# Find the line with the embedded Merkle and re-blank it
import re
stripped = re.sub(
    r'(<code>)[0-9a-f]{64}(</code>)', r'\\1\\2', text, count=1,
)
print(hashlib.sha256(
    stripped.encode('utf-8')).hexdigest())
"
```

## Step 5: Verify JSON Schema validation

```bash
# Rebuild schemas
python3 tools/build_acceptance_schemas.py

# Verify manifest Merkle re-derives
python3 -c "
import hashlib, json
d = json.load(open('reports/schemas/schemas_manifest.json'))
leaves = ''.join(
    f\"{e['filename']}|{e['sha256']}\n\"
    for e in sorted(d['schemas'], key=lambda x: x['filename'])
)
expected = hashlib.sha256(leaves.encode('utf-8')).hexdigest()
assert expected == d['manifest_merkle_root_sha256'], 'DRIFT'
print('manifest OK:', expected)
"
```

## Step 6: One-shot all-gates verification

For lazy auditors who want a single command:

```bash
make qa-w244-full
# Runs:
#   1. Pytest session sweep (152 tests)
#   2. W244 health probe (26 checks)
#   3. Dossier HTML lint (25 pages, no CDN, no dead links)
#   4. Cargo wasm crate tests (14 tests)
#   5. Ruff lint (tools + packages)
# Total wallclock: ~10s. Exit 0 = all green.
```

Or use the dedicated Merkle verifier:

```bash
./scripts/verify_all_merkles.sh
# Rebuilds every Merkle-pinned artefact + diffs against committed.
# Exit 0 = no drift, every Merkle reproduced byte-identical.
```

## What can go wrong

| Symptom | Likely cause | Remediation |
|---|---|---|
| Master Merkle differs | Source drift | Inspect `git status`; ensure clean checkout |
| Per-kernel JSON differs | Floating-point platform diff | Should not happen — all math is integer-stable or uses bounded ops; file `SECURITY.md` issue |
| HTML page differs | Embedded timestamp / hash mismatch | Pages strip mtimes; check for system-clock leakage |
| Wasm parity fails | Toolchain version drift | Re-pin Rust stable in `rust-toolchain` |
| Schema doesn't validate | Schema vs JSON drift | Refresh schema OR re-run kernel builder; verify intent |

## Audit checklist

Bullet-pointed sign-off list for a regulator engagement:

- [ ] Cloned repo at specific commit SHA (record it)
- [ ] Step 1: kernel attestation chain reproduces
- [ ] Step 2: Python ↔ Rust parity, max delta ≤ 1e-12
- [ ] Step 3: Python ↔ wasm parity, max delta ≤ 1e-12
- [ ] Step 4: 5 root HTML dashboards reproduce byte-identical
- [ ] Step 5: JSON Schema manifest Merkle re-derives from leaves
- [ ] Step 6: `make qa-w244-full` exits 0
- [ ] (Optional) Tested with `--seed 42` MC validation suite

Each checked item should record the observed Merkle / hash value.
A failed step = security finding, not a maintenance issue.

## See also

- `SECURITY.md` — vulnerability disclosure (incl. Merkle-determinism breaks)
- `CONTRIBUTING.md` — adding a new kernel (workflow that preserves chain)
- `AGENT.md` — guide for AI tools navigating the repo
- `docs/kernels/README.md` — per-kernel Markdown index (LaTeX formulas)
- `reports/dossier/index.html` — landing page (open offline)
