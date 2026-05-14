# W152 P2-16 — Math studio toolchain Makefile.
#
# KIMI 14 / P2-16 prescribes the targets a 2026 slot-math studio
# expects: dev/prod/cert profiles, PAR sheet export, RGS verify, cert
# bundle, parity gate, RNG cert. This file wires every existing
# script + binary behind a single `make <target>` surface so the
# studio side does not have to memorise `cargo run --release --bin …`
# incantations.
#
# Run `make help` for the discoverable list.

.PHONY: help run unittest test lint build par-sheet par-diff par-stress \
        cert-bundle rng-cert rng-quality rng-submission parity parity-bin \
        mutate mutate-rust mutate-scoped clean ci

# ─── Default target ────────────────────────────────────────────────────────

help: ## Print the menu of available targets
	@echo "W152 P2-16 — Math studio Makefile"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ─── Build / lint / test ───────────────────────────────────────────────────

build: ## TypeScript compile (tsc → dist/)
	npm run build

lint: ## TypeScript typecheck (tsc --noEmit) + cargo clippy
	npm run lint
	cargo clippy --workspace --lib -- -D warnings

test: ## Run the full vitest + cargo lib test suites
	npm test
	cargo test --workspace --lib

unittest: ## Quick TS-only unit-test smoke (vitest single-run)
	npm test

run: ## Build then run the simulator (default 100K spins)
	npm run sim

# ─── PAR sheet pipeline ────────────────────────────────────────────────────

par-sheet: ## Generate PAR sheet PDFs from latest sim run
	npm run par-samples

par-diff: ## Compare two PAR JSON files — usage: make par-diff PREV=a.json NEXT=b.json
	@if [ -z "$(PREV)" ] || [ -z "$(NEXT)" ]; then \
		echo "ERROR: pass PREV=<previous.json> NEXT=<next.json>"; \
		exit 2; \
	fi
	node --experimental-vm-modules \
		-e "const {diffParSheets,formatDiffHeadline}=require('./dist/math/par-sheet/diff.js'); \
		    const fs=require('fs'); \
		    const a=JSON.parse(fs.readFileSync('$(PREV)','utf8')); \
		    const b=JSON.parse(fs.readFileSync('$(NEXT)','utf8')); \
		    const d=diffParSheets(a,b); \
		    console.log(formatDiffHeadline(d)); \
		    console.log(JSON.stringify(d,null,2));"

par-stress: ## 50-seed × 20K-spin PAR distribution stress (CoV gate)
	npm run par-stress

# ─── RNG ───────────────────────────────────────────────────────────────────

rng-quality: ## TS-side NIST 5-test sweep across 4 backends
	npm run rng-quality

rng-cert: ## Rust BigCrush / PractRand / NIST artifact pipeline
	cargo run --release --bin rng_cert -- --out reports/rng-cert

rng-submission: ## GLI-19 lab submission bundle (per-backend dumps + manifest)
	cargo run --release --bin rng_submission -- --out reports/cert-bundle

cert-bundle: ## Full GLI-19 bundle (rng_submission + shell wrapper → zip)
	bash scripts/cert-bundle.sh

# ─── Parity (W152 P0-5) ────────────────────────────────────────────────────

parity-bin: ## Build the evaluator_parity oracle binary (release)
	cargo build --release --bin evaluator_parity

parity: parity-bin ## Run the TS↔Rust evaluator parity spec
	npx vitest run tests/evaluator_parity.test.ts

# ─── Mutation testing (W152 P1-9) ──────────────────────────────────────────

mutate: mutate-rust ## Run Rust + TS mutation testing baselines (alias)
	npm run mutate

mutate-rust: ## cargo-mutants on rust-sim/src/rng.rs (default hot path)
	./scripts/rust-mutate.sh

mutate-scoped: ## Stryker on a narrow TS file scope (faster CI gate)
	npm run mutate:scoped

# ─── Hygiene ───────────────────────────────────────────────────────────────

clean: ## Remove build artifacts (dist/, target/, reports/.tmp/)
	rm -rf dist target/debug target/release reports/.tmp

# ─── CI aggregate ──────────────────────────────────────────────────────────

ci: ## Full CI gate: lint + test + build + parity
	$(MAKE) lint
	$(MAKE) test
	$(MAKE) build
	$(MAKE) parity
