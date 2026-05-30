# Changelog

Top-level changelog za `slot-math-engine-template` monorepo. Format
prati [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning prati [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For per-package changelogs:
- `packages/slot-math-kernels/CHANGELOG.md` (PyPI package)

## [Unreleased]

### Added (W244 wave 49-80, 2026-05-30 → 2026-05-31)

**Cross-language parity (3 dimensions):**
- Python ↔ Rust kernel parity (waves 49-50): `multi_dim_inverse_solver`
  snapshot + 22 vendored Python kernels matching Rust closed-form.
- Python ↔ wasm parity (wave 74): 20 fixtures × 7 kernels, max delta
  3.4e-15. Acceptance gate `WASM_PYTHON_PARITY_KERNEL.json`.
- CI workflow `wasm-parity.yml` (wave 75) automatizes the gate.

**Distribution packages:**
- `packages/slot-math-kernels` — PyPI standalone (waves 50, 54):
  22 kernels vendored, MIT licensed, `pip install`-ready,
  `slot-math` CLI entry-point (wave 64).
- `packages/slot-math-wasm` — wasm-bindgen package (waves 73, 77):
  10 hot kernels → 17 KB .wasm, TS wrapper sa 3 namespaces.

**Auditor dossier surface:**
- 5 root HTML dashboards (waves 51, 52, 57, 66, 70): Industry Firsts
  (89 cards), Regulator Portal (3-tab), Closed-Form Portfolio (120
  solvers), Showcase Game (4-kernel composition), landing index.
- 19 per-kernel reference HTML deep-dive pages (wave 62).
- 19 per-kernel Markdown docs sa LaTeX formulama (wave 69).
- Cross-link nav između sva 5+ HTML page-a (wave 58 + 70).
- `tools/lint_dossier_html.py` — no-CDN / Merkle / dead-link gate
  (wave 67). 25/25 HTML pages clean.

**Validation infrastructure:**
- API contract snapshot `API_SURFACE.json` (wave 55) — 27 dataclass-a
  + 72 funkcije, MAJOR semver gate.
- 5 JSON Schema (Draft 2020-12) za acceptance + dossier files
  (wave 63) sa Merkle manifest.
- `tools/w244_health.py` — 26-check one-shot probe (wave 61 → 79).
- `tools/perf_regression_check.py` — bench drift detector
  (wave 68, >10% threshold).
- `tools/build_bench_history.py` — per-commit time-series snapshot
  (wave 79).

**Search + discovery:**
- Unified `search-index.json` (wave 71) — 229 entries cross-dossier
  (89 IFs + 19 kernels + 120 CF solvers + 1 showcase). Embed-uje se u
  landing page sa live filter.
- `docs/README.md` auto-index (wave 72) — 94 docs / 18 kategorija.

**Developer experience:**
- 5 runnable PyPI examples sa assertions (wave 54).
- `.pre-commit-config.yaml` (wave 65) — ruff + W244 health + API
  contract gate.
- `Makefile` targets: `qa-w244-full` (orchestrator), `qa-w244-session`
  (16-24 test fajla u jednoj komandi), `dossier-all`, `wasm-build`,
  `wasm-parity`, `health-w244`, `perf-regress`, `bench-history`.
- `AGENT.md` za AI coding assistants (wave 78) — javan navigator.

**CI workflows:**
- `w244-kernel-attest.yml` — 16-kernel determinism check, master
  Merkle verification.
- `w244-dossier-html.yml` — rebuild 4 dashboards + diff vs committed.
- `wasm-parity.yml` (wave 75) — Python ↔ wasm gate.
- `gh-pages-dossier.yml` (wave 66) — auto-deploy dossier HTML.

**Community profile (wave 67):**
- `CITATION.cff` — academic citation manifest.
- `SECURITY.md` — vuln disclosure policy (7-day ack / 30-day fix).
- `CONTRIBUTING.md` — kernel addition workflow + required gates.
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1 adapted.

### Engineering verification

- Pytest `make qa-w244-session`: 152/152 PASS in <2s (24 test fajla).
- W244 health probe: 26/26 PASS.
- Dossier HTML lint: 25/25 pages clean.
- Cargo lib tests (rust-sim): 412/412 PASS.
- Cargo wasm tests: 14/14 PASS.
- Ruff lint: clean (tools/ + packages/).

### Pending (čeka eksplicitan Boki signal)

- gh-pages enable (Settings → Pages → "GitHub Actions").
- PyPI `twine upload slot-math-kernels-1.0.0` (requires API token).
- Stryker upstream GitHub issue (`bug-reports/stryker-vitest-
  compound-conditional/GITHUB_ISSUE.md`).

## [Earlier history]

For pre-W244 changes (W1 → W243), see `git log` and
`SLOT_ENGINE_MASTER_TODO.md` archive sections.
