# Contributing to `slot-math-engine-template`

Thanks for considering a contribution. This project values
**determinism**, **regulator-audit-readiness**, and **byte-stable
reproducibility** above all else. Every change must preserve those
invariants.

## Quick start

```bash
git clone https://github.com/Bojan20/slot-math-engine-template
cd slot-math-engine-template

# Python deps (kernel work)
python3 -m pip install --user ruff pytest

# Optional pre-commit hooks (recommended)
pip install pre-commit
pre-commit install

# Sanity check
make qa-w244-session    # 85+ tests, ~1.5s
make health-w244        # 23 checks, ~0.1s
```

## What kinds of changes are welcome

| Welcome | Example |
|---------|---------|
| ✅ New W244 closed-form kernel | New industry mechanic → port to Python + Rust + parity gate |
| ✅ Mutation testing improvements | Killer tests for previously-survived Stryker mutants |
| ✅ Performance optimization | Sub-microsecond Rust kernels (verified by Criterion bench) |
| ✅ Documentation | Industry reference clarifications, formula derivations |
| ✅ Regulator compliance additions | New jurisdiction profile in `reg-oracle` |
| ⚠️  TypeScript layer changes | Must preserve TS↔Rust parity (template-parity CI) |
| ❌ Non-deterministic features | Anything that produces different output on rebuild |

## Required gates

Every PR must pass:

1. **Determinism** — `make qa-w244-session` (85+ tests) + `make health-w244` (23 checks)
2. **Lint** — `ruff check tools/ packages/` clean + `cargo clippy --all-targets` clean
3. **CI workflows** — `.github/workflows/w244-kernel-attest.yml` + `w244-dossier-html.yml`
4. **API contract** (if PyPI surface touched) — `API_SURFACE.json` refresh + MAJOR bump if breaking

## Workflow for adding a new W244 kernel

```bash
# 1. Add Python kernel
$EDITOR tools/math_dsl/your_kernel.py

# 2. Add acceptance builder
$EDITOR tools/build_your_kernel.py
python3 -m tools.build_your_kernel    # produces reports/acceptance/YOUR_KERNEL.json

# 3. Add acceptance tests
$EDITOR tools/tests/test_w244_your_kernel.py
python3 -m pytest tools/tests/test_w244_your_kernel.py

# 4. Port to Rust
$EDITOR rust-sim/src/kernels/your_kernel.rs
$EDITOR rust-sim/src/kernels/mod.rs    # add module decl
cargo test --manifest-path rust-sim/Cargo.toml --release

# 5. Add to CLI parity
$EDITOR rust-sim/src/bin/kernel_parity.rs
$EDITOR tools/parity/w244_rust_python_parity.py

# 6. Vendor into PyPI package
cp tools/math_dsl/your_kernel.py packages/slot-math-kernels/src/slot_math_kernels/
$EDITOR packages/slot-math-kernels/src/slot_math_kernels/__init__.py  # add to __all__
python3 tools/refresh_api_surface.py    # bump snapshot

# 7. Rebuild dossiers + verify
make dossier-all
make qa-w244-session
make health-w244

# 8. Commit + push
git add -A
git commit -m "feat(W244 wave N): your_kernel — industry pattern + Python↔Rust parity"
git push origin main
```

## Code style

- **Python**: ruff defaults (`ruff check`), pure-stdlib for kernel core
- **Rust**: rustfmt + clippy with project flags (`cargo clippy --all-targets`)
- **TypeScript**: existing project ESLint config
- **JSON**: sorted keys, 2-space indent, deterministic
- **HTML**: 2-space indent, CSS+JS inlined (no CDN), Merkle in footer
- **Commits**: imperative mood; `feat(scope):` / `fix(scope):` / `docs(scope):`

## Acceptance reports

Every kernel produces a Merkle-pinned acceptance JSON in
`reports/acceptance/`. Two clean rebuilds **must** produce a
byte-identical file (CI verifies this on every PR). If you need
non-determinism (random seeds, timestamps), encode it as a fixed
fixture parameter — never let it leak into the output.

## Reporting bugs

File a non-security issue at
<https://github.com/Bojan20/slot-math-engine-template/issues>.

Security issues: see [`SECURITY.md`](SECURITY.md).

## Code of Conduct

See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). TL;DR: technical
critique welcome; personal attacks not.
