# Developer Guide — slot-math-engine-template

> Setup, common workflows, troubleshooting, and contribution flow for
> contributors to the `slot-math-engine-template` codebase.
> Companion to `README.md` (user-facing) and `SLOTH_MASTER.md` (status).

## 1. Local setup

```bash
git clone https://github.com/Bojan20/slot-math-engine-template.git
cd slot-math-engine-template
npm install      # vitest + commander + zod + typescript
npm run build    # tsc → dist/
cargo build --release --manifest-path rust-sim/Cargo.toml   # Rust solver
```

System requirements:

| Tool       | Min version | Notes |
|------------|-------------|-------|
| Node.js    | 20.x LTS    | ES2022, `node:test` available |
| npm        | 10.x        | comes with Node 20 |
| TypeScript | 5.4+        | `tsc` is invoked by `npm run build` |
| Rust       | 1.78+       | `cargo` toolchain; aarch64-darwin verified |
| Python     | 3.11+       | for `tools/*` (PAR doctor, public-benchmark, etc.) |
| pytest     | 8.x         | install via `pip install pytest typeguard` |

## 2. Common workflows

### 2.1 Run the full test suite

```bash
npm test                       # Vitest TypeScript (~50s, 294 spec files)
cargo test --manifest-path rust-sim/Cargo.toml          # Rust (~20s, 307 tests)
python3 -m pytest tools/tests/                          # Python tools (~5s)
```

### 2.2 Run a single Vitest spec

```bash
npx vitest run tests/bonus_tournament_hybrid.test.ts
npx vitest run tests/bonus_tournament_hybrid.test.ts -t "MC acceptance"
```

### 2.3 Build + emit a tournament audit report

```bash
# After npm run build, the bin script is available:
./bin/slot-tournament-audit.mjs --input cfg.json --format md > audit.md
./bin/slot-tournament-audit.mjs --input cfg.json --format json --strict
echo '{"tournamentId":"x","operator":"UKGC","baseGameRtpTarget":0.945,...}' | \
  ./bin/slot-tournament-audit.mjs --format xml
```

See `bin/slot-tournament-audit.mjs --help` for the full surface.

### 2.4 Run the public benchmark

```bash
python3 -m tools.public_benchmark games/ --out reports/benchmark/
# Emits reports/benchmark/benchmark.{json,md} — band: green/yellow/red
# against published RTP references (see PUBLIC_BENCHMARK_REFERENCES.md).
```

## 3. Troubleshooting

### 3.1 Vitest 4.1.7 OOM on large suites

Symptom:

```
RangeError: Array buffer allocation failed
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

Cause: Vitest 4.1.x worker pool keeps every imported module in memory
when the full suite has > 290 spec files. Native fix landed in Vitest
4.2, but we pin 4.1.x for cargo-mutants compatibility (deeper isolation
guarantees during mutation testing).

Workarounds, in order of preference:

| Workaround | Effect | When to use |
|---|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 npm test` | Bump heap to 8 GB | Most laptops with 16 GB+ RAM |
| `npm test -- --pool=forks` | Use fork pool (slower, isolated) | If heap bump doesn't help |
| `npm test -- tests/<dir>` | Run a subdirectory only | Iterating on one wave |
| `npx vitest run tests/<file>` | Single file | Per-spec triage |

The repo already ships `package.json`'s `"test"` script with sane
defaults; no manual configuration required unless you hit the symptom
above. CI gates use the heap-bumped form via
`.github/workflows/ci.yml`.

### 3.2 `tsc` shows errors I can't reproduce locally

Check that `npm run build` cleans `dist/` first:

```bash
rm -rf dist/
npm run build
```

The TypeScript path-cache occasionally pins stale module IDs after a
file rename; a clean build is the canonical fix.

### 3.3 Rust mutants tests take > 30 min

`cargo mutants` runs the *full* test suite per mutant. The wave-shaped
strategy is `scripts/rust-mutate.sh --target <module>` which mutates
only one source file at a time. See
`docs/RUST_MUTATION_TESTING.md` for the full playbook.

## 4. Project layout

```
slot-math-engine-template/
├── src/                       # TypeScript IR + solver kernels
│   ├── features/              # 107 closed-form solver kernels
│   ├── cli/                   # commander CLI (`slot-math`, builders)
│   ├── compose/               # IR assembly
│   ├── core/                  # primitives (RNG, statistics)
│   └── ...
├── tests/                     # Vitest specs (294 files, 7554 tests)
├── rust-sim/                  # Rust MC engine (307 tests)
├── tools/                     # Python utilities
│   ├── public_benchmark/      # marketing benchmark vs published RTPs
│   ├── par_doctor/            # PAR sheet validator
│   ├── codegen_*/             # codegen for cert XML / Rust / Svelte UI
│   └── tests/                 # pytest suite
├── bin/                       # Node executables (slot-tournament-audit)
├── docs/                      # design docs, playbooks, this guide
├── games/                     # IR fixtures for testing
├── reports/                   # generated artefacts (gitignored mostly)
├── SLOTH_MASTER.md            # canonical roadmap + status
├── package.json
└── README.md
```

## 5. Contribution flow

We accept PRs for:

1. **New closed-form solver kernels** — file in `src/features/`,
   vitest specs in `tests/`, portfolio entry in
   `src/portfolio/closedForms.ts`, master TODO row in
   `SLOTH_MASTER.md`. Each new kernel must pass:

   * MC validator agreement ratio measured/expected ∈ [0.9, 1.1]
     (relaxed to 1.2 for heavy-tail families) at ≥ 1500 tournaments.
   * UKGC/MGA/EU compliance disclosure if applicable.
   * Determinism: same seed → byte-identical MC output.
   * ≥ 30 specs covering happy-path + edge + validation + acceptance.

2. **Compliance checks** — extend `src/cli/buildTournamentAuditReport.ts`
   compliance engine; new regulator rule + status enum.

3. **Public benchmark references** — add `PUBLISHED_REFERENCES` entries
   in `tools/public_benchmark/benchmark.py` with published RTP source
   cited in `docs/research/PUBLIC_BENCHMARK_REFERENCES.md`.

4. **Bug fixes** — regression test required (red-then-green pattern).

### 5.1 Style + lint

- TypeScript strict mode; `tsc --noEmit` must be clean.
- Rust: `cargo clippy --all-targets -- -D warnings`.
- Python: PEP 8; `ruff check tools/` clean.
- Commit messages: conventional commits (`feat(W205): ...`).

### 5.2 PR review checklist

- [ ] All tests green (`npm test` + `cargo test` + `pytest`).
- [ ] No lint warnings.
- [ ] Wave row added to `SLOTH_MASTER.md` (status ✅).
- [ ] Industry-first claim, if any, sourced in commit body.
- [ ] No vendor TM in identifiers (use "Vendor B", "Vendor C", etc.).
- [ ] Determinism contract pinned (seed → identical output).

## 6. Release process

1. `npm run build` → `dist/` clean.
2. `npm test` + `cargo test` + `pytest` all green.
3. Bump version in `package.json` (semver: MAJOR for breaking IR
   schema, MINOR for new kernels, PATCH for fixes).
4. Generate `reports/operator-package/` via `npm run operator:pkg`.
5. Tag `git tag v<MAJOR>.<MINOR>.<PATCH>` + push.
6. Update `SLOTH_MASTER.md` MILESTONE SNAPSHOT.

## 7. Where to ask for help

- Architecture / math: open an issue on the `slot-math-engine-template`
  repo with `[design]` prefix.
- Regulator-side questions: cite the relevant UKGC / MGA / eCOGRA
  section and tag with `[compliance]`.
- Tooling / CI: tag with `[devex]`.

All issues get a triage label within 24h on the upstream repo.
