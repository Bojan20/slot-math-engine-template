# Mutation Testing Consolidated Report

> **W152 Wave 17 — Faza 10.7 acceptance proof.** Generated 2026-05-29T15:13:46.833Z from stored mutation artifacts. Pure read — no mutation engine spawned.

## Headline

* **TypeScript (Stryker scoped)**: 312 / 342 mutants killed → strict 91.23 % / lenient 91.23 %.
* **Rust adapter** (cargo-mutants): 16 / 16 scored mutants killed → strict 100.00 %.
* **Rust behavior_impls** (cargo-mutants): 148 / 148 scored mutants killed → strict 100.00 %.
* **Rust behavior_pipeline** (cargo-mutants): 24 / 24 scored mutants killed → strict 100.00 %.
* **Rust behavior_registry** (cargo-mutants): 12 / 12 scored mutants killed → strict 100.00 %.
* **Rust bulk** (cargo-mutants): 17 / 33 scored mutants killed → strict 51.52 %.
* **Rust cluster** (cargo-mutants): 13 / 14 scored mutants killed → strict 92.86 %.
* **Rust evaluator** (cargo-mutants): 21 / 21 scored mutants killed → strict 100.00 %.
* **Rust features** (cargo-mutants): 49 / 112 scored mutants killed → strict 43.75 %.
* **Rust jurisdiction_adapter** (cargo-mutants): 19 / 25 scored mutants killed → strict 76.00 %.
* **Rust markov** (cargo-mutants): 172 / 219 scored mutants killed → strict 78.54 %.
* **Rust rng** (cargo-mutants): 63 / 68 scored mutants killed → strict 92.65 %.
* **Rust rng_w236_final3** (cargo-mutants): 22 / 31 scored mutants killed → strict 70.97 %.
* **Rust validate** (cargo-mutants): 25 / 25 scored mutants killed → strict 100.00 %.

## Pass/fail vs Faza 10.7 acceptance

Acceptance: mutation score ≥ 95 % both runtimes.

| Runtime | Strict score | Faza 10.7 ≥ 95 % | Notes |
|---|---:|:---:|---|
| TypeScript (Stryker scoped) | 91.23 % | ⚠️ | scoped to RG/sensitivity hot-paths |
| Rust `adapter` | 100.00 % | ✅ | 
| Rust `behavior_impls` | 100.00 % | ✅ | 
| Rust `behavior_pipeline` | 100.00 % | ✅ | 
| Rust `behavior_registry` | 100.00 % | ✅ | 
| Rust `bulk` | 51.52 % | ⚠️ | 
| Rust `cluster` | 92.86 % | ⚠️ | 
| Rust `evaluator` | 100.00 % | ✅ | 
| Rust `features` | 43.75 % | ⚠️ | 
| Rust `jurisdiction_adapter` | 76.00 % | ⚠️ | 
| Rust `markov` | 78.54 % | ⚠️ | 
| Rust `rng` | 92.65 % | ⚠️ | 
| Rust `rng_w236_final3` | 70.97 % | ⚠️ | 
| Rust `validate` | 100.00 % | ✅ | 

## Per-file detail (TypeScript)

| File | Mutants | Killed | Survived | NoCov | Strict | Lenient |
|---|---:|---:|---:|---:|---:|---:|
| `src/sensitivity/analyzer.ts` | 128 | 109 | 17 | 0 | 86.72 % | 86.72 % |
| `src/rg/session.ts` | 214 | 201 | 13 | 0 | 93.93 % | 93.93 % |

## Methodology

* **TS source**: latest `reports/mutation/scoped-*.json` (most recent mtime). Strict score = (killed + timeout) / (killed + survived + timeout + noCoverage). Lenient excludes `noCoverage` from denominator.
* **Rust source**: each `reports/mutation/rust/<crate>/mutants.out/outcomes.json`. Strict score = (caught + timeout) / (caught + missed + timeout + success). `success` = mutant compiled + tests passed → counts as SURVIVED.
* **Re-generation**: `npm run mutation-summary` after every fresh `mutate:scoped` or `mutate:rust` run. CI can diff committed SUMMARY.json to detect score regressions.
