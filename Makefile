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
        mutate mutate-rust mutate-scoped clean ci \
        agents-check agents-corpus agents-rag agents-eval agents-routing \
        qa-selftest qa-quick qa-manual qa-full qa-status

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

ci: ## Full CI gate: lint + test + build + parity + agents-check
	$(MAKE) lint
	$(MAKE) test
	$(MAKE) build
	$(MAKE) parity
	$(MAKE) agents-check

# ─── PHASE 8 agent fleet (P8.1–P8.6) ──────────────────────────────────────

agents-corpus: ## Rebuild + expand + stats traces.jsonl for all 3 PHASE 8 agents
	python3 -m tools.agent_corpus refresh all
	python3 -m tools.agent_corpus.expand all --seeds 6
	python3 -m tools.agent_corpus stats all

agents-rag: ## Re-ingest mock + (when reachable) Qdrant RAG indexes
	python3 -m tools.agent_rag ingest all

agents-eval: ## Structural check of every agent eval fixture (missing → SKIP)
	python3 -m tools.agent_eval qa-agent --self-test

agents-routing: ## Dispatcher routing accuracy gate (≥95%, currently 100%)
	@# W205+2: host-orchestrator-agnostic. The dispatcher binary path is
	@# resolved from $$SLOT_AGENT_BIN (defaults to `slot-agent` on $$PATH).
	@# If the binary isn't installed (fresh checkout, CI without external
	@# orchestrator), the gate is a no-op so `make agents-check` stays
	@# green for users who don't ship the optional agent fleet.
	@if command -v "$${SLOT_AGENT_BIN:-slot-agent}" >/dev/null 2>&1; then \
		"$${SLOT_AGENT_BIN:-slot-agent}" eval | \
		python3 -c "import sys,json; d=json.loads(sys.stdin.read()); \
		print('routing accuracy', d['accuracy']); \
		sys.exit(0 if d['pass'] else 1)"; \
	else \
		echo "slot-agent binary not on PATH — skipping routing gate (set SLOT_AGENT_BIN=/path to enable)"; \
	fi

agents-check: ## PHASE 8 CI gate — corpus + RAG + eval + routing + scrape + qlora
	$(MAKE) agents-corpus
	$(MAKE) agents-rag
	$(MAKE) agents-eval
	$(MAKE) agents-routing
	@# Optional nightly-scrape + qlora self-tests; resolved from
	@# $${SLOT_MATH_AGENTS_ROOT:-./agents}. Skipped when artefacts are not
	@# present on this checkout.
	@SCRAPE="$${SLOT_MATH_AGENTS_ROOT:-./agents}/reg-oracle/nightly_scrape.py"; \
	if [ -f "$$SCRAPE" ]; then python3 "$$SCRAPE" --self-test; \
	else echo "nightly_scrape.py not present at $$SCRAPE — skipping"; fi
	@if command -v "$${SLOT_QLORA_BIN:-slot-qlora-train}" >/dev/null 2>&1; then \
		"$${SLOT_QLORA_BIN:-slot-qlora-train}" --self-test; \
	else \
		echo "slot-qlora-train not on PATH — skipping qlora gate (set SLOT_QLORA_BIN=/path to enable)"; \
	fi
	@echo "✅ agents-check OK"

# ─── QA Agent (PHASE 8 P8.7) ───────────────────────────────────────────────

qa-selftest: ## QA Agent L0 self-verification (scenarios + CLI + antibody roundtrip + report hash)
	python3 -m tools.qa_agent selftest

qa-quick: ## QA Agent quick scope (L0, L1, L2, L3, L9) — fast iteration
	python3 -m tools.qa_agent auto --quick --allow-dirty

qa-manual: ## QA Agent manual scenario suite (every scenario under tools/qa_agent/scenarios/)
	python3 -m tools.qa_agent manual --all --allow-dirty

qa-full: ## QA Agent every layer L0..L9 (BASELINE=<ref> optional for L7 regression)
	python3 -m tools.qa_agent full $(if $(BASELINE),--baseline $(BASELINE),) --allow-dirty

qa-status: ## Read the last persisted QA Agent report
	python3 -m tools.qa_agent status
