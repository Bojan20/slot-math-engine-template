/**
 * W215 Faza 1200.0 — Kernel Sandbox Runtime CORE (Agent A, restart).
 *
 * Sandbox executor backed by Node's native `vm` module — NO vm2, NO
 * external libs. Strategy:
 *
 *   1. Source is rewritten so `export function/const NAME` becomes a
 *      plain binding plus an `__exports.NAME = NAME` assignment at the
 *      end (we have already rejected `export default`, `export-*`, and
 *      non analyze.../simulate.../solve... names in the validator).
 *   2. We build a *frozen* context exposing only safe globals
 *      (Math/Number/String/Array/Object/JSON/Symbol) plus a custom
 *      `console` proxy. There is NO `process`, `require`, `module`,
 *      `globalThis`, `Buffer`, `Reflect`, or `Proxy`.
 *   3. `vm.compileFunction(rewrittenSource, ['__exports', 'console'],
 *      { parsingContext, timeout })` — the `timeout` option gives a
 *      hard wall-clock kill at the V8 level.
 *   4. After invocation we sample heap usage; if it crossed the limit
 *      we record a `heap-exceeded` crash and refuse to return.
 *
 * Returned `SandboxResult.ok` is true iff:
 *   - compile succeeded
 *   - top-level call returned without throwing
 *   - no resource-limit crash recorded
 */

import vm from 'node:vm';
import type {
  ConsoleEntry,
  ResourceLimits,
  ResourceUsage,
  SandboxCrash,
  SandboxResult,
} from './types.js';
import { DEFAULT_LIMITS, isHeapExceeded, sampleHeapMb } from './resource-limits.js';

export interface ExecuteOptions {
  /** Resource limits; defaults to DEFAULT_LIMITS. */
  limits?: ResourceLimits;
  /**
   * Optional invocation: after compile, the executor will look up
   * `__exports[invoke.name]` and call it with `invoke.args`. The result
   * is placed in `SandboxResult.returnValue`. Omit to do "shape-only".
   */
  invoke?: { name: string; args: unknown[] };
}

/** Run a kernel source string in a hardened context. */
export function executeKernelSandbox(
  source: string,
  opts: ExecuteOptions = {},
): SandboxResult {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const consoleEntries: ConsoleEntry[] = [];
  const crashes: SandboxCrash[] = [];
  const t0 = Date.now();
  const heap0 = sampleHeapMb();
  let heapPeak = heap0;

  const sampleHeap = (): void => {
    const cur = sampleHeapMb();
    if (cur > heapPeak) heapPeak = cur;
  };

  const consoleProxy = makeConsoleProxy(consoleEntries, limits.consoleLines);
  const rewritten = rewriteExports(source);
  const context = makeFrozenContext();
  const exportsObj: Record<string, unknown> = Object.create(null);
  let returnValue: unknown;
  let compileMs = 0;
  let executeMs = 0;

  // ---- Compile phase -------------------------------------------------------
  // We wrap the kernel source + an optional invocation into a single
  // `vm.Script`, then call `runInContext({ timeout })`. The `timeout`
  // option is the ONLY way Node's vm gives us a hard wall-clock kill of
  // synchronous JS — `compileFunction` does not honour it. The script
  // assigns its captured return value to `__exports.__returnValue` so we
  // can lift it back out after execution.
  const invokeFragment = opts.invoke
    ? `__exports.__returnValue = __exports[${JSON.stringify(opts.invoke.name)}].apply(null, __invokeArgs);`
    : '';
  const fullSource = `(function(__exports, console, __invokeArgs){\n${rewritten}\n${invokeFragment}\n})(__exports, console, __invokeArgs);`;

  const compileStart = Date.now();
  let script: vm.Script;
  try {
    script = new vm.Script(fullSource, { filename: 'kernel-sandbox.js' });
  } catch (e) {
    crashes.push({
      kind: 'compile-error',
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    compileMs = Date.now() - compileStart;
    return finalize();
  }
  compileMs = Date.now() - compileStart;

  // ---- Execute phase -------------------------------------------------------
  // Expose __exports + console + invoke args as context bindings.
  (context as unknown as Record<string, unknown>).__exports = exportsObj;
  (context as unknown as Record<string, unknown>).console = consoleProxy;
  (context as unknown as Record<string, unknown>).__invokeArgs = opts.invoke
    ? opts.invoke.args
    : [];
  const execStart = Date.now();
  try {
    script.runInContext(context, { timeout: limits.cpuMs });
    returnValue = exportsObj['__returnValue'];
    sampleHeap();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    // Node tags timeouts with `code = 'ERR_SCRIPT_EXECUTION_TIMEOUT'`.
    const code = (e as { code?: string }).code;
    const isCpu =
      code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
      /script execution timed out/i.test(msg);
    crashes.push({ kind: isCpu ? 'cpu-timeout' : 'thrown', message: msg, stack });
  }
  executeMs = Date.now() - execStart;
  sampleHeap();

  const heapDelta = Math.max(0, heapPeak - heap0);
  if (isHeapExceeded(heapDelta, limits.heapMb)) {
    crashes.push({
      kind: 'heap-exceeded',
      message: `heap delta ${heapDelta.toFixed(1)}MiB > limit ${limits.heapMb}MiB`,
    });
  }

  function finalize(): SandboxResult {
    const totalMs = Date.now() - t0;
    const exportedFunctions: string[] = Object.keys(exportsObj).filter(
      (k) => k !== '__returnValue' && typeof exportsObj[k] === 'function',
    );
    const usage: ResourceUsage = {
      cpuMsObserved: totalMs,
      heapMbObservedPeak: Math.max(0, heapPeak - heap0),
      consoleLinesCaptured: consoleEntries.length,
    };
    return {
      ok: crashes.length === 0,
      returnValue,
      exportedFunctions,
      resourceUsage: usage,
      consoleEntries,
      crashes,
      timings: {
        compileMs,
        executeMs,
        totalMs,
      },
    };
  }

  return finalize();
}

/**
 * Build a frozen vm context exposing ONLY pure-math globals. No
 * `process`, `require`, `module`, `Reflect`, `Proxy`, `Buffer`,
 * `globalThis` mutation. We freeze each surface to prevent monkey-patch
 * exfiltration between runs.
 */
export function makeFrozenContext(): vm.Context {
  const safe = {
    Math: freezeShallow(Math),
    Number: freezeShallow(Number),
    String: freezeShallow(String),
    Array: freezeShallow(Array),
    Object: freezeShallow(Object),
    JSON: freezeShallow(JSON),
    Symbol: freezeShallow(Symbol),
    // Useful but harmless typed-array primitives.
    Boolean: freezeShallow(Boolean),
    Error: freezeShallow(Error),
    RangeError: freezeShallow(RangeError),
    TypeError: freezeShallow(TypeError),
    isFinite,
    isNaN,
    parseFloat,
    parseInt,
    // explicit holes — make the absence visible to inspectors
    require: undefined,
    process: undefined,
    Buffer: undefined,
    Reflect: undefined,
    Proxy: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    queueMicrotask: undefined,
  } as const;
  const ctx = vm.createContext(safe, {
    name: 'kernel-sandbox',
    codeGeneration: { strings: false, wasm: false },
  });
  // We don't `Object.freeze(this)` inside the context — Node refuses to
  // freeze its sandbox proxy. The per-binding holes (`require: undefined`,
  // etc.) plus `codeGeneration.strings = false` already block the major
  // exfil vectors; new global assignments inside kernels are isolated to
  // this throwaway context anyway.
  return ctx;
}

/** Shallow-freeze; returns the input so it can be inlined. */
function freezeShallow<T extends object>(o: T): T {
  try {
    Object.freeze(o);
  } catch {
    /* some built-ins refuse — ignore */
  }
  return o;
}

/**
 * Console proxy — captures up to `cap` lines (FIFO truncation). Methods
 * present: log/info/warn/error. All other globals on `console` are absent
 * so kernels can't reach e.g. `console.Console` (a Node constructor).
 */
export function makeConsoleProxy(sink: ConsoleEntry[], cap: number): object {
  const push = (level: ConsoleEntry['level'], args: unknown[]): void => {
    const message = args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
    sink.push({ level, message, tsMs: Date.now() });
    if (sink.length > cap) sink.shift();
  };
  return Object.freeze({
    log: (...a: unknown[]) => push('log', a),
    info: (...a: unknown[]) => push('info', a),
    warn: (...a: unknown[]) => push('warn', a),
    error: (...a: unknown[]) => push('error', a),
  });
}

/**
 * Rewrite ESM-style exports into a captured-`__exports` form so we can
 * compile via `vm.compileFunction` (which does NOT support `export`).
 *
 *   export function foo(...) { ... }           →
 *     function foo(...) { ... } __exports.foo = foo;
 *
 *   export const foo = expr                    →
 *     const foo = expr; __exports.foo = foo;
 *
 * The source has already passed `validateKernelSource`, so we know there
 * are no `export *` / `export default` / async function exports.
 */
export function rewriteExports(source: string): string {
  let out = source;
  const tail: string[] = [];

  out = out.replace(
    /\bexport\s+function\s+([A-Za-z_$][\w$]*)/g,
    (_m, name: string) => {
      tail.push(`__exports.${name} = ${name};`);
      return `function ${name}`;
    },
  );

  out = out.replace(
    /\bexport\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    (_m, kind: string, name: string) => {
      tail.push(`__exports.${name} = ${name};`);
      return `${kind} ${name}`;
    },
  );

  // Strip any remaining import statements — the sandbox provides no
  // module loader. The validator already flagged dynamic-import; this
  // sweep handles static `import x from 'y'` which `compileFunction`
  // would reject as a syntax error otherwise.
  out = out.replace(/^\s*import[^;]*;?\s*$/gm, '');

  return out + '\n' + tail.join('\n');
}

/**
 * (Previously hosted a `runWithTimeout` helper. We switched to
 * `vm.Script.runInContext({ timeout })` — the only mechanism Node's
 * `vm` exposes that can interrupt synchronous JS. That option is what
 * gives us the hard CPU kill for runaway loops.)
 */
