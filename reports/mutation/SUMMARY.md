# Mutation Testing Consolidated Report

> **W152 Wave 17 — Faza 10.7 acceptance proof.** Generated 2026-05-16T04:12:14.831Z from stored mutation artifacts. Pure read — no mutation engine spawned.

## Headline

* **TypeScript (Stryker scoped)**: 292 / 342 mutants killed → strict 85.38 % / lenient 85.38 %.
* **Rust evaluator** (cargo-mutants): 21 / 21 scored mutants killed → strict 100.00 %.
* **Rust rng** (cargo-mutants): 63 / 68 scored mutants killed → strict 92.65 %.

## Pass/fail vs Faza 10.7 acceptance

Acceptance: mutation score ≥ 95 % both runtimes.

| Runtime | Strict score | Faza 10.7 ≥ 95 % | Notes |
|---|---:|:---:|---|
| TypeScript (Stryker scoped) | 85.38 % | ⚠️ | scoped to RG/sensitivity hot-paths |
| Rust `evaluator` | 100.00 % | ✅ | 
| Rust `rng` | 92.65 % | ⚠️ | 

## Per-file detail (TypeScript)

| File | Mutants | Killed | Survived | NoCov | Strict | Lenient |
|---|---:|---:|---:|---:|---:|---:|
| `src/sensitivity/analyzer.ts` | 128 | 99 | 27 | 0 | 78.91 % | 78.91 % |
| `src/rg/session.ts` | 214 | 191 | 23 | 0 | 89.25 % | 89.25 % |

## Methodology

* **TS source**: latest `reports/mutation/scoped-*.json` (most recent mtime). Strict score = (killed + timeout) / (killed + survived + timeout + noCoverage). Lenient excludes `noCoverage` from denominator.
* **Rust source**: each `reports/mutation/rust/<crate>/mutants.out/outcomes.json`. Strict score = (caught + timeout) / (caught + missed + timeout + success). `success` = mutant compiled + tests passed → counts as SURVIVED.
* **Re-generation**: `npm run mutation-summary` after every fresh `mutate:scoped` or `mutate:rust` run. CI can diff committed SUMMARY.json to detect score regressions.
