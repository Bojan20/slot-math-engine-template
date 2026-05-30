# AGENT.md — guide for AI coding assistants

This file is a navigation aid for AI coding assistants (Claude Code,
Cursor, Aider, Continue, etc.) working in this repository. It is
intentionally generic and **does not duplicate `CLAUDE.md`** (which
contains owner-specific autonomy rules).

If you are a human, you probably want [`README.md`](README.md) or
[`CONTRIBUTING.md`](CONTRIBUTING.md) instead.

## Repository identity

`slot-math-engine-template` — production-grade slot game math engine.

- **Languages:** Rust 1.83 (parity-pinned), Python 3.10+, TypeScript
- **Toolchains:** cargo, npm, ruff, pytest, vitest, wasm-pack
- **Packages distributed:** `slot-math-kernels` (PyPI), `slot-math-wasm` (npm)
- **CI gates:** 20+ workflows under `.github/workflows/`

## Where to look for what

| Looking for | Path |
|---|---|
| W244 Python closed-form kernels | `tools/math_dsl/*.py` |
| Rust kernel ports | `rust-sim/src/kernels/*.rs` |
| WebAssembly hot kernels | `packages/slot-math-wasm/src/lib.rs` |
| PyPI package (vendored copies) | `packages/slot-math-kernels/` |
| Acceptance JSON artefakti | `reports/acceptance/*.json` |
| Auditor dossier HTML | `reports/dossier/*.html` |
| Per-kernel Markdown docs | `docs/kernels/*.md` |
| Auto-generated docs index | `docs/README.md` |
| JSON Schemas (Draft 2020-12) | `reports/schemas/*.schema.json` |
| Master TODO + status snapshot | `SLOT_ENGINE_MASTER_TODO.md` |
| Build / test orchestration | `Makefile` |
| Pre-commit hook config | `.pre-commit-config.yaml` |

## Determinism is the prime directive

Every closed-form kernel + dossier artefact rebuilds **byte-identical**
across runs. If you change a kernel:

1. Run `make qa-w244-full` (orchestrates pytest + health + lint +
   cargo wasm + ruff). All gates must pass.
2. If you touch the PyPI vendored kernels, refresh the API surface
   snapshot: `python3 tools/refresh_api_surface.py` and bump MAJOR
   semver if the public signature changed (test_w244_pypi_api_contract
   will fail loudly otherwise).
3. If you touch a kernel's acceptance JSON, the dossier HTML pages
   that consume it must be rebuilt: `make dossier-all`.
4. The W244 health probe (`make health-w244`) is the smoke test —
   23+ checks across kernel JSONs, dossier HTML, vendored PyPI sources,
   schemas, search index.

## Useful one-shot commands

```bash
make qa-w244-full       # pytest + health + lint + cargo wasm + ruff (~10s)
make health-w244        # 23-26 sanity checks across W244 surface (~0.1s)
make dossier-all        # rebuild 5 root HTML pages + 19 kernel refs + landing
make wasm-build         # wasm-pack build slot-math-wasm
make wasm-parity        # wasm ↔ Python parity (build + verify)
make perf-regress       # benchmark drift detector vs git HEAD
```

## Test conventions

- **Python:** `pytest`, file pattern `tools/tests/test_w244_*.py`.
  Tests must run pure-stdlib (no network, no GPU, no big-MC runs).
  Use `unittest.TestCase` style.
- **Rust:** `cargo test`, idiomatic `#[test]` in module footers.
- **TS:** `vitest`, files end with `.test.ts`.

## What NOT to do

- **Do not introduce non-determinism** (random seeds without explicit
  param, wall-clock timestamps in output, ordering depending on dict
  hashing). The Merkle attestation chain breaks instantly.
- **Do not modify acceptance JSONs by hand** — re-run the builder, let
  the JSON regenerate. Hand-edits drift Merkles.
- **Do not skip Merkle recompute when expanding fixtures** — every
  fixture addition rotates the Merkle, document it in the wave commit.
- **Do not add CDN-loaded assets to dossier HTML** — pages must work
  offline for regulator review. The HTML linter
  (`tools/lint_dossier_html.py`) will fail.

## Commit format

```
feat(W244 wave N): <verb> <component> — <one-line outcome>

<bullet list of substantive changes>

<test count + key gate status>

Co-Authored-By: <AI name> <noreply@anthropic.com>
```

## How the parity story works

Three independent implementations of every hot kernel:

1. **Python** (`slot_math_kernels`) — reference, MIT-licensed PyPI.
2. **Rust** (`slot_sim::kernels::*` + `kernel_parity` CLI) — sub-µs
   performance, byte-stable via JSON stdin/stdout protocol.
3. **WebAssembly** (`slot_math_wasm`) — 17 KB browser embed.

Parity gates verify pairwise ULP equivalence:

- `tools/parity/w244_rust_python_parity.py` → Python ↔ Rust
- `.github/workflows/template-parity.yml` → TS ↔ Rust (sim layer)
- `tools/parity/w244_wasm_python_parity.py` → Python ↔ wasm

Max observed delta in production: **9.42e-15** (sub-ULP).

## Contact / escalation

- General: `bojan.petkovic25@gmail.com`
- Security vuln: see [`SECURITY.md`](SECURITY.md)
- Contributor questions: see [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Citation: [`CITATION.cff`](CITATION.cff)
