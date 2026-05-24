# Mutation Testing Consolidated Report

> **W152 Wave 17 — Faza 10.7 acceptance proof.** Generated 2026-05-24T03:55:51.428Z from stored mutation artifacts. Pure read — no mutation engine spawned.

## Headline

* **TypeScript (Stryker scoped)**: 292 / 342 mutants killed → strict 85.38 % / lenient 85.38 %.
* **Rust adapter** (cargo-mutants): 45 / 56 scored mutants killed → strict 80.36 %.
* **Rust adapter_w237_kill** (cargo-mutants): 14 / 15 scored mutants killed → strict 93.33 %.
* **Rust behavior_impls** (cargo-mutants): 148 / 148 scored mutants killed → strict 100.00 %.
* **Rust behavior_pipeline** (cargo-mutants): 24 / 24 scored mutants killed → strict 100.00 %.
* **Rust evaluator** (cargo-mutants): 21 / 21 scored mutants killed → strict 100.00 %.
* **Rust rng** (cargo-mutants): 63 / 68 scored mutants killed → strict 92.65 %.
* **Rust rng_w236_final3** (cargo-mutants): 22 / 31 scored mutants killed → strict 70.97 %.

## Pass/fail vs Faza 10.7 acceptance

Acceptance: mutation score ≥ 95 % both runtimes.

| Runtime | Strict score | Faza 10.7 ≥ 95 % | Notes |
|---|---:|:---:|---|
| TypeScript (Stryker scoped) | 85.38 % | ⚠️ | scoped to RG/sensitivity hot-paths |
| Rust `adapter` | 80.36 % | ⚠️ | 
| Rust `adapter_w237_kill` | 93.33 % | ⚠️ | 
| Rust `behavior_impls` | 100.00 % | ✅ | 
| Rust `behavior_pipeline` | 100.00 % | ✅ | 
| Rust `evaluator` | 100.00 % | ✅ | 
| Rust `rng` | 92.65 % | ⚠️ | 
| Rust `rng_w236_final3` | 70.97 % | ⚠️ | 

## Per-file detail (TypeScript)

| File | Mutants | Killed | Survived | NoCov | Strict | Lenient |
|---|---:|---:|---:|---:|---:|---:|
| `src/sensitivity/analyzer.ts` | 128 | 99 | 27 | 0 | 78.91 % | 78.91 % |
| `src/rg/session.ts` | 214 | 191 | 23 | 0 | 89.25 % | 89.25 % |

## Methodology

* **TS source**: latest `reports/mutation/scoped-*.json` (most recent mtime). Strict score = (killed + timeout) / (killed + survived + timeout + noCoverage). Lenient excludes `noCoverage` from denominator.
* **Rust source**: each `reports/mutation/rust/<crate>/mutants.out/outcomes.json`. Strict score = (caught + timeout) / (caught + missed + timeout + success). `success` = mutant compiled + tests passed → counts as SURVIVED.
* **Re-generation**: `npm run mutation-summary` after every fresh `mutate:scoped` or `mutate:rust` run. CI can diff committed SUMMARY.json to detect score regressions.
