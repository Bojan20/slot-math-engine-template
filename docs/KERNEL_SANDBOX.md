# Kernel Sandbox

**W215 Faza 1200.0 — Kernel Sandbox Runtime CORE (v1.0).**

This document describes the hardened execution sandbox that runs third-party
kernels submitted to the marketplace. It replaces the static-inspection stub
introduced in W209 (now retained as `runStaticInspection` for cheap
first-pass screening).

> **Scope of CORE (W215)**: synchronous in-process execution with hard CPU
> + heap kill, source-level deny-list, 6-gate harness. Async queue, persistent
> job store, crash classifier, and CLI for local authors land in W216.

---

## 1. Architecture

```
+---------------------------+
| SDK: submitKernel()       |   (client-side validation, manifest)
+-------------+-------------+
              |
              v
+---------------------------+
| runFullSandbox(code, opts)|   server/lib/kernel-test-runner.ts
+-------------+-------------+
              |
              v
+---------------------------+
| validateKernelSource      |   regex deny-list (eval, require, ...)
+-------------+-------------+
              |
              v
+---------------------------+
| runHarness                |   6 gates with REAL execution
+-------------+-------------+
              |
              v
+---------------------------+
| executeKernelSandbox      |   vm.Script + frozen context + timeout
+---------------------------+
```

Files (all under `server/lib/kernel-sandbox/`):

| File                  | Responsibility                                         | Lines |
|-----------------------|--------------------------------------------------------|-------|
| `types.ts`            | All interfaces (SandboxResult, GateVerdict, ...)       | ~100  |
| `resource-limits.ts`  | Per-tier limits, clamping helpers, heap sampler        | ~85   |
| `source-validator.ts` | Regex deny-list, export-shape check, violation report  | ~265  |
| `executor.ts`         | Frozen vm context, vm.Script timeout, console proxy    | ~245  |
| `test-harness.ts`     | 6-gate orchestration on REAL execution                 | ~460  |

---

## 2. Security model

### 2.1 Threat model

We assume the submitted code is **adversarial**: it may attempt to read
host filesystem state, mutate global JS prototypes, smuggle data out via
async timers, exhaust CPU, or balloon the heap. Our defences are layered:

1. **Source deny-list** (`validateKernelSource`) — rejects obvious foot-guns
   before they reach the VM.
2. **Frozen context** (`makeFrozenContext`) — exposes only pure-math globals,
   plus a console proxy. No `process`, `require`, `module`, `Buffer`,
   `Reflect`, `Proxy`, `globalThis`, `setTimeout`.
3. **`vm.Script.runInContext({ timeout })`** — hard CPU kill enforced by V8
   (the only mechanism Node exposes that interrupts synchronous JS).
4. **Heap monitoring** — `process.memoryUsage().heapUsed` sampled before
   and after each run; a `heap-exceeded` crash is recorded if the delta
   crosses the tier limit.
5. **Code generation disabled** — `codeGeneration: { strings: false, wasm: false }`
   makes `eval`, `new Function`, and WebAssembly compilation throw.

### 2.2 What the sandbox does NOT defend against

- **Algorithmic DoS that fits in the CPU budget** — e.g. a kernel that
  returns wrong math but runs in 1ms. The cf-vs-mc gate catches this for
  the closed-form-vs-MC comparison, but a subtle math bug can still slip
  through. Production-proven badge requires live-game observation.
- **Side-channel timing leaks** between submissions — we do not run each
  kernel in its own process. W216 introduces a worker-pool with one
  kernel per worker.
- **Native-addon escape** — the host process has full access. Source
  deny-list blocks `require` so this is moot in practice.

---

## 3. Allowed / disallowed APIs

### Allowed

| Surface       | Notes                                                  |
|---------------|--------------------------------------------------------|
| `Math.*`      | All static methods + constants. Frozen.                |
| `Number.*`    | Including `Number.EPSILON`, `Number.MAX_SAFE_INTEGER`. |
| `String.*`    | All static methods.                                    |
| `Array.*`     | All static methods (`from`, `isArray`).                |
| `Object.*`    | `keys`, `values`, `entries`, `freeze`, `assign`.       |
| `JSON.*`      | `parse`, `stringify`.                                  |
| `Symbol`      | `Symbol()`, well-known symbols.                        |
| `Boolean`     | `Boolean()`.                                           |
| `Error`, `RangeError`, `TypeError` | Construction + throw.            |
| `isFinite`, `isNaN`, `parseInt`, `parseFloat` |                          |
| `console.log/info/warn/error` | Captured (max 1000 lines / FIFO).      |

### Disallowed

| Surface           | Why                                                |
|-------------------|----------------------------------------------------|
| `require`         | No module loader exposed.                          |
| `import('…')`     | Dynamic-import vector → blocked by validator.      |
| `process.*`       | Host runtime is hidden.                            |
| `Buffer`          | Avoids byte-level exfil paths.                     |
| `globalThis.*`    | Global mutation forbidden.                         |
| `Reflect`, `Proxy`| Trap-based reflection forbidden.                   |
| `eval`, `new Function` | Code gen disabled at the V8 level.            |
| `setTimeout`, `setInterval`, `setImmediate`, `queueMicrotask` | No async escape. |
| `__proto__`, `constructor[...]` | Prototype-pollution paths.           |
| Core-module static import (`from 'fs'`, `'child_process'`, …) | Validator blocks the syntax. |

---

## 4. Resource limits

```typescript
interface ResourceLimits {
  cpuMs: number;        // hard wall-clock kill
  heapMb: number;       // soft heap cap (sampled)
  consoleLines: number; // FIFO capture cap
}
```

| Tier     | CPU       | Heap    | Console | Use case                       |
|----------|-----------|---------|---------|--------------------------------|
| tier-1   | 10000 ms  | 256 MiB | 4000    | Trusted internal CI smoke      |
| tier-2   |  5000 ms  | 128 MiB | 1000    | Verified third-party kernels   |
| tier-3   |  2000 ms  |  64 MiB |  250    | First-time / unverified submit |

Defaults (`DEFAULT_LIMITS`) match tier-2. `mergeLimits` clamps overrides to
`[50ms, 60000ms]`, `[8MiB, 1024MiB]`, `[10, 50000]` so callers cannot ask
for an effectively-infinite budget.

---

## 5. The 6 harness gates

| Gate          | Definition                                               |
|---------------|----------------------------------------------------------|
| `determinism` | `analyze*` invoked 10 times within the same sandbox; outputs must be identical (stable-stringify compare). |
| `cf-vs-mc`    | `analyze*` vs `simulate*`; primary numeric (rtp/expected…) within 5% relative deviation. |
| `performance` | 10000 invocations of `analyze*` complete in < 2s.        |
| `boundary`    | `analyze*` invoked with 0 / max-int / NaN / Infinity / null inputs; no fatal crash (thrown Error is acceptable). |
| `naming`      | Source has no reserved vendor terms (L&W, IGT, NetEnt…). |
| `module-shape`| At least one `analyze*`/`solve*` AND at least one `simulate*` exported. |

A submission gets the **Verified** badge iff all 6 gates pass.

---

## 6. Writing a passing kernel

The conventions are unchanged from W209; the difference now is that the
runner *actually executes the code*. Make sure your kernel:

1. **Exports exactly named functions** matching `analyze*` / `solve*` /
   `simulate*`. No `export default`, no `export *`.
2. **Is fully deterministic** for fixed args. Use the seeded PRNG pattern
   from `src/features/reelBoundMysteryProgressive.ts` if you need
   randomness in `simulate*`.
3. **Handles edge inputs defensively** — guard against `null`, `NaN`,
   `Infinity`, and oversized integers. Throwing a `RangeError` is fine;
   crashing the host is not.
4. **Stays within budget** — 10k `analyze*` calls in < 2s on a modern
   laptop. Bail out of nested loops aggressively.
5. **Uses only the math API surface** above. Anything you can't get from
   `Math` / `Number` / `Array` / `Object` / `JSON` / `Symbol` is forbidden.

Skeleton:

```typescript
export interface MyCfg { p: number; n: number; }
export interface MyResult { rtp: number; hitFrequency: number; }

export function analyzeMy(cfg: MyCfg): MyResult {
  // 1. Validate defensively.
  if (!Number.isFinite(cfg.p) || cfg.p < 0 || cfg.p > 1) {
    throw new RangeError('cfg.p must be in [0, 1]');
  }
  // 2. Closed-form math only.
  return { rtp: cfg.p * 0.5, hitFrequency: cfg.p };
}

export function simulateMy(cfg: MyCfg, numSpins: number, seed = 0xface): {
  observed: number;
} {
  // ... seeded PRNG loop ...
  return { observed: 0 };
}
```

---

## 7. How the executor compiles + runs

We do **not** use `vm.compileFunction` — it does not honour the `timeout`
option, so a runaway loop would hang the host forever. Instead the
executor wraps the rewritten source in an IIFE and runs it via
`new vm.Script(...).runInContext(ctx, { timeout })`. The script writes its
return value to `__exports.__returnValue` so the host can lift it back
out after execution.

Export rewrites (handled by `rewriteExports`):

```
export function analyzeFoo(...)   →   function analyzeFoo(...)
                                       __exports.analyzeFoo = analyzeFoo;

export const analyzeFoo = (...) => …  →  const analyzeFoo = (...) => …
                                          __exports.analyzeFoo = analyzeFoo;
```

Static `import` statements are stripped (the validator already flagged
non-bare module specifiers; this sweep handles syntactic cleanup).

---

## 8. What lands in W216

- Worker-pool: one kernel per worker, IPC boundary.
- Persistent job-store (Postgres) for sandbox verdicts.
- Crash classifier (cpu-loop vs heap-balloon vs vendor-call vs math-bug).
- `npm run sandbox:test-locally` CLI for kernel authors.
- Observability metrics (sandbox QPS, p95 duration, kill-rate).
- Pentest escape scenarios (the deny-list test suite is the seed).

---

## 9. References

- `server/lib/kernel-sandbox/executor.ts`
- `server/lib/kernel-sandbox/source-validator.ts`
- `server/lib/kernel-sandbox/test-harness.ts`
- `server/lib/kernel-test-runner.ts` — top-level orchestrator
- `server/tests/sandbox-*.test.ts` — 65 specs across 3 files
- Node docs: [vm module](https://nodejs.org/api/vm.html#class-vmscript),
  [`script.runInContext` timeout](https://nodejs.org/api/vm.html#scriptrunincontextcontextifiedobject-options).
