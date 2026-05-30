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

# ─── W244 wave 53 — Dossier HTML build targets ─────────────────────────────

dossier-ifs-html: ## Build Industry-First Dossier static HTML dashboard (89 cards)
	python3 tools/build_industry_firsts_html.py

dossier-portal: ## Build unified Regulator Portal (3-tab: IFs + Kernels + Bench)
	python3 tools/build_regulator_portal.py

dossier-portfolio-html: ## Build Closed-Form Portfolio HTML (120 solvers, 589 configs)
	python3 tools/build_closed_form_portfolio_html.py

dossier-kernel-refs: ## Build 19 per-kernel reference HTML pages + index
	python3 tools/build_kernel_reference_cards.py

dossier-schemas: ## Build 5 JSON Schema files + Merkle manifest
	python3 tools/build_acceptance_schemas.py

dossier-landing: ## Build dossier landing index.html (GitHub Pages entry)
	python3 tools/build_dossier_landing.py

dossier-lint: ## Lint dossier HTML (no CDN, Merkle present, no dead links)
	python3 tools/lint_dossier_html.py

dossier-kernel-md: ## Build 19 per-kernel Markdown docs sa LaTeX formulama
	python3 tools/build_kernel_markdown_docs.py

dossier-showcase: ## Build Showcase Game HTML (4-kernel composition demo)
	python3 tools/build_showcase_game_html.py

dossier-search-index: ## Build unified search-index.json (229+ entries cross-dossier)
	python3 tools/build_search_index.py

perf-regress: ## Detect benchmark regressions vs git HEAD (>10% slowdown)
	python3 tools/perf_regression_check.py

dossier-bench: ## Aggregate criterion estimates → benchmark dossier JSON
	python3 tools/build_benchmark_dossier.py

dossier-all: ## Rebuild ALL dossier HTML artefakte (run after acceptance JSON changes)
	$(MAKE) dossier-ifs-html
	$(MAKE) dossier-portal
	$(MAKE) dossier-portfolio-html
	$(MAKE) dossier-kernel-refs
	$(MAKE) dossier-showcase
	$(MAKE) dossier-search-index
	$(MAKE) dossier-landing
	@echo "✅ All dossier HTML pages rebuilt"
	@echo "   reports/dossier/index.html               ← landing"
	@echo "   reports/dossier/INDUSTRY_FIRST_DOSSIER.html"
	@echo "   reports/dossier/REGULATOR_PORTAL.html"
	@echo "   reports/dossier/CLOSED_FORM_PORTFOLIO.html"
	@echo "   reports/dossier/showcase_game.html"
	@echo "   reports/dossier/kernels/ (19 per-kernel + index)"

health-w244: ## W244 one-shot health probe (16 checks, ~0.1s)
	python3 tools/w244_health.py

qa-w244-session: ## Run all W244 wave 49-58 test files (full session sweep, ~1s)
	python3 -m pytest \
		tools/tests/test_w244_multi_dim_parity.py \
		tools/tests/test_w244_pypi_package_vendored.py \
		tools/tests/test_w244_industry_firsts_html.py \
		tools/tests/test_w244_regulator_portal.py \
		tools/tests/test_w244_closed_form_portfolio_html.py \
		tools/tests/test_w244_pypi_examples_run.py \
		tools/tests/test_w244_pypi_api_contract.py \
		tools/tests/test_w244_dossier_schema.py \
		tools/tests/test_w244_kernel_reference_cards.py \
		tools/tests/test_w244_health_probe.py \
		tools/tests/test_w244_acceptance_schemas.py \
		tools/tests/test_w244_pypi_cli.py \
		tools/tests/test_w244_pre_commit_config.py \
		tools/tests/test_w244_dossier_landing.py \
		tools/tests/test_w244_dossier_html_lint.py \
		tools/tests/test_w244_perf_regression.py \
		tools/tests/test_w244_kernel_markdown_docs.py \
		tools/tests/test_w244_showcase_game_html.py \
		tools/tests/test_w244_search_index.py \
		-v --tb=short

# ─── W244 wave 53 — PyPI build + smoke ─────────────────────────────────────
#
# Note: PEP 517 `build` package is required. Install via:
#   python3 -m pip install build
# Override `PY` if your default python lacks `build`:
#   make pypi-build PY=python3.11

PY ?= python3

pypi-build: ## Build slot-math-kernels wheel via PEP 517 (dist/)
	@$(PY) -c "import build" 2>/dev/null || { \
		echo "Missing PEP 517 'build' — run: $(PY) -m pip install build"; \
		exit 2; \
	}
	cd packages/slot-math-kernels && $(PY) -m build --wheel --outdir dist

pypi-smoke: pypi-build ## Build wheel + smoke install + import test in /tmp venv
	@rm -rf /tmp/smk-pypi-venv
	@$(PY) -m venv /tmp/smk-pypi-venv
	@/tmp/smk-pypi-venv/bin/pip install --quiet \
		packages/slot-math-kernels/dist/slot_math_kernels-*.whl
	@/tmp/smk-pypi-venv/bin/python -c "import slot_math_kernels as smk; \
		assert len(smk.__all__) == 22, smk.__all__; \
		from slot_math_kernels import charge_meter as cm; \
		p = cm.ChargeMeterParams(expected_charge_per_spin=0.5, \
			tiers=(cm.ChargeTier('classic', threshold=50.0, \
			award_value_x_bet=10.0),)); \
		r = cm.charge_meter_rtp(p); \
		assert abs(r['rtp_contribution'] - 0.10) < 1e-9, r; \
		print('✅ slot-math-kernels wheel install + import OK')"
