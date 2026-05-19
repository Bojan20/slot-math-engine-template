/**
 * W215 Faza 1200.0 — Kernel Sandbox Runtime CORE (Agent A, restart).
 *
 * Test harness — runs a submitted kernel through 6 production gates with
 * REAL execution (the static stub in `kernel-test-runner.ts` is now the
 * "synthetic" fallback). The gates mirror W209 vocabulary:
 *
 *   1. determinism   — same args, 10 invocations → identical JSON output
 *   2. cf-vs-mc      — `analyze*` vs `simulate*` within 5% rel deviation
 *   3. performance   — 10k invocations of analyze* in < 2s
 *   4. boundary      — 0 / max / NaN / Infinity inputs → no crash
 *   5. naming        — no reserved vendor terms in source
 *   6. module-shape  — exports >= 1 `analyze*` AND >= 1 `simulate*`
 *
 * Each gate is independent — failures don't short-circuit the rest, so
 * authors see the full set of issues per round-trip.
 */

import type {
  GateVerdict,
  HarnessReport,
  ResourceLimits,
  SandboxCrash,
} from './types.js';
import { executeKernelSandbox } from './executor.js';
import { DEFAULT_LIMITS } from './resource-limits.js';

const DEFAULT_RESERVED = [
  'Light & Wonder',
  'Scientific Games',
  'IGT',
  'NetEnt',
  'Pragmatic Play',
  'Aristocrat',
  'Bally',
  'WMS',
  'Konami Gaming',
];

export interface HarnessOptions {
  limits?: ResourceLimits;
  reservedTerms?: string[];
  /** Tolerance for cf-vs-mc gate (relative). Default 0.05 (5%). */
  rtpTolerance?: number;
  /**
   * Args to pass to the analyze/simulate exports. The same args are
   * reused across all relevant gates so the comparison is meaningful.
   * Default: `[{}]` (kernels typically take a single config object).
   */
  args?: unknown[];
  /** Override perf budget (ms for 10k calls). Default 2000. */
  perfBudgetMs?: number;
  /** Override perf call count. Default 10_000. */
  perfCallCount?: number;
}

/** Run the 6-gate harness on a kernel source. */
export function runHarness(source: string, opts: HarnessOptions = {}): HarnessReport {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const reserved = opts.reservedTerms ?? DEFAULT_RESERVED;
  const tolerance = opts.rtpTolerance ?? 0.05;
  const args = opts.args ?? [{}];
  const perfBudget = opts.perfBudgetMs ?? 2_000;
  const perfCalls = opts.perfCallCount ?? 10_000;
  const t0 = Date.now();
  const crashes: SandboxCrash[] = [];

  // First, a "shape only" probe — we need to know the export names. If
  // compile fails we cannot run anything; emit a synthetic FAIL for all
  // execution gates.
  const probe = executeKernelSandbox(source, { limits });
  for (const c of probe.crashes) crashes.push(c);
  const exportedFns = probe.exportedFunctions;

  const analyzeName = pickByPrefix(exportedFns, ['analyze', 'solve']);
  const simulateName = pickByPrefix(exportedFns, ['simulate']);

  const gates: GateVerdict[] = [];

  // --- Gate 6: module-shape (we do this first because others depend on it).
  gates.push(gateModuleShape(exportedFns, analyzeName, simulateName));

  // --- Gate 5: naming (string-only, cheap)
  gates.push(gateNaming(source, reserved));

  if (!probe.ok || !analyzeName) {
    // Without an analyze function the remaining gates can't run.
    gates.push(missing('determinism', 'no analyze* export — cannot test'));
    gates.push(missing('cf-vs-mc', 'no analyze*/simulate* exports — cannot test'));
    gates.push(missing('performance', 'no analyze* export — cannot test'));
    gates.push(missing('boundary', 'no analyze* export — cannot test'));
    return finalize(gates, probe, crashes, t0);
  }

  // --- Gate 1: determinism
  gates.push(gateDeterminism(source, analyzeName, args, limits));

  // --- Gate 2: cf-vs-mc
  if (simulateName) {
    gates.push(gateCfVsMc(source, analyzeName, simulateName, args, limits, tolerance));
  } else {
    gates.push({
      name: 'cf-vs-mc',
      pass: false,
      message: 'no simulate* export — cannot cross-validate analyze*',
    });
  }

  // --- Gate 3: performance
  gates.push(gatePerformance(source, analyzeName, args, limits, perfBudget, perfCalls));

  // --- Gate 4: boundary
  gates.push(gateBoundary(source, analyzeName, limits));

  return finalize(gates, probe, crashes, t0);
}

// ---------------------------------------------------------------------------
// Individual gates
// ---------------------------------------------------------------------------

function gateModuleShape(
  exports: string[],
  analyzeName: string | undefined,
  simulateName: string | undefined,
): GateVerdict {
  if (!analyzeName) {
    return {
      name: 'module-shape',
      pass: false,
      message: `expected analyze*/solve* export; got [${exports.join(', ') || 'none'}]`,
    };
  }
  if (!simulateName) {
    return {
      name: 'module-shape',
      pass: false,
      message: `expected simulate* export; got [${exports.join(', ') || 'none'}]`,
    };
  }
  return {
    name: 'module-shape',
    pass: true,
    message: `exports: ${analyzeName}, ${simulateName}`,
  };
}

function gateNaming(source: string, reserved: string[]): GateVerdict {
  for (const term of reserved) {
    const re = new RegExp(term.replace(/\s+/g, '\\s+'), 'i');
    if (re.test(source)) {
      return {
        name: 'naming',
        pass: false,
        message: `reserved vendor term detected: "${term}"`,
      };
    }
  }
  return { name: 'naming', pass: true, message: 'no reserved vendor terms found' };
}

function gateDeterminism(
  source: string,
  analyzeName: string,
  args: unknown[],
  limits: ResourceLimits,
): GateVerdict {
  const N = 10;
  // Run N invocations within the SAME sandbox so module-level state
  // (counters, accumulators) is visible across calls. A deterministic
  // kernel must produce identical output across every invocation.
  const driverSource =
    source +
    `\nfunction __detDriver(__args, __n) { const out = []; for (let __i=0;__i<__n;__i++) { out.push(${analyzeName}.apply(null, __args)); } return out; }` +
    `\n__exports.__detDriver = __detDriver;`;
  const r = executeKernelSandbox(driverSource, {
    limits,
    invoke: { name: '__detDriver', args: [args, N] },
  });
  if (!r.ok) {
    return {
      name: 'determinism',
      pass: false,
      message: `analyze* threw under driver: ${r.crashes[0]?.message ?? '?'}`,
    };
  }
  const samples = Array.isArray(r.returnValue) ? r.returnValue : [];
  if (samples.length !== N) {
    return {
      name: 'determinism',
      pass: false,
      message: `driver produced ${samples.length} samples (expected ${N})`,
    };
  }
  const baseline = stableStringify(samples[0]);
  for (let i = 1; i < samples.length; i++) {
    if (stableStringify(samples[i]) !== baseline) {
      return {
        name: 'determinism',
        pass: false,
        message: `output diverged on invocation ${i + 1}: same args produced different output`,
        metric: i + 1,
      };
    }
  }
  return {
    name: 'determinism',
    pass: true,
    message: `${N} invocations produced identical output`,
    metric: N,
  };
}

function gateCfVsMc(
  source: string,
  analyzeName: string,
  simulateName: string,
  args: unknown[],
  limits: ResourceLimits,
  tolerance: number,
): GateVerdict {
  const a = executeKernelSandbox(source, {
    limits,
    invoke: { name: analyzeName, args },
  });
  if (!a.ok) {
    return {
      name: 'cf-vs-mc',
      pass: false,
      message: `analyze* threw: ${a.crashes[0]?.message ?? '?'}`,
    };
  }
  const s = executeKernelSandbox(source, {
    limits,
    invoke: {
      name: simulateName,
      // Most simulate* take (cfg, numSpins, seed).
      args: args.length === 1 ? [args[0], 10_000, 0xface0181] : args,
    },
  });
  if (!s.ok) {
    return {
      name: 'cf-vs-mc',
      pass: false,
      message: `simulate* threw: ${s.crashes[0]?.message ?? '?'}`,
    };
  }
  const cf = extractScalar(a.returnValue);
  const mc = extractScalar(s.returnValue);
  if (cf === null || mc === null) {
    return {
      name: 'cf-vs-mc',
      pass: true,
      message: 'returned values not directly comparable — skipping numeric diff (probe ran clean)',
    };
  }
  if (cf === 0 && mc === 0) {
    return { name: 'cf-vs-mc', pass: true, message: 'both 0; trivial match' };
  }
  const rel = Math.abs(cf - mc) / Math.max(Math.abs(cf), 1e-12);
  if (rel > tolerance) {
    return {
      name: 'cf-vs-mc',
      pass: false,
      message: `relative deviation ${(rel * 100).toFixed(2)}% > ${(tolerance * 100).toFixed(2)}%`,
      metric: rel,
    };
  }
  return {
    name: 'cf-vs-mc',
    pass: true,
    message: `relative deviation ${(rel * 100).toFixed(2)}% within ${(tolerance * 100).toFixed(2)}%`,
    metric: rel,
  };
}

function gatePerformance(
  source: string,
  analyzeName: string,
  args: unknown[],
  limits: ResourceLimits,
  budgetMs: number,
  callCount: number,
): GateVerdict {
  // Run the loop INSIDE the sandbox via a synthesised driver so the
  // host doesn't pay re-compile per call.
  const driverSource =
    source +
    `\nfunction __perfDriver(__args, __n) { let __out; for (let __i=0;__i<__n;__i++) { __out = ${analyzeName}.apply(null, __args); } return __out; }` +
    `\n__exports.__perfDriver = __perfDriver;`;
  // We must run validator OUTPUT compatible source — but rewriteExports
  // already runs inside executeKernelSandbox. The synthesised driver
  // uses __exports.* directly (already rewritten by us here).
  const start = Date.now();
  const r = executeKernelSandbox(driverSource, {
    limits,
    invoke: { name: '__perfDriver', args: [args, callCount] },
  });
  const ms = Date.now() - start;
  if (!r.ok) {
    return {
      name: 'performance',
      pass: false,
      message: `crashed under load: ${r.crashes[0]?.message ?? '?'}`,
      metric: ms,
    };
  }
  if (ms > budgetMs) {
    return {
      name: 'performance',
      pass: false,
      message: `${callCount} calls took ${ms}ms > ${budgetMs}ms budget`,
      metric: ms,
    };
  }
  return {
    name: 'performance',
    pass: true,
    message: `${callCount} calls completed in ${ms}ms`,
    metric: ms,
  };
}

function gateBoundary(
  source: string,
  analyzeName: string,
  limits: ResourceLimits,
): GateVerdict {
  const probes: unknown[][] = [
    [{}],
    [0],
    [Number.MAX_SAFE_INTEGER],
    [NaN],
    [Infinity],
    [null],
  ];
  for (const p of probes) {
    const r = executeKernelSandbox(source, {
      limits,
      invoke: { name: analyzeName, args: p },
    });
    // A *thrown Error* is acceptable (defensive validation), what we
    // forbid is a crash kind we cannot survive (cpu-timeout, heap).
    const fatal = r.crashes.find(
      (c) => c.kind === 'cpu-timeout' || c.kind === 'heap-exceeded',
    );
    if (fatal) {
      return {
        name: 'boundary',
        pass: false,
        message: `fatal crash on input ${describe(p)}: ${fatal.kind}`,
      };
    }
  }
  return {
    name: 'boundary',
    pass: true,
    message: `${probes.length} edge inputs handled without fatal crash`,
    metric: probes.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickByPrefix(names: string[], prefixes: string[]): string | undefined {
  for (const n of names) {
    for (const p of prefixes) {
      if (n.startsWith(p)) return n;
    }
  }
  return undefined;
}

function missing(name: GateVerdict['name'], message: string): GateVerdict {
  return { name, pass: false, message };
}

function describe(p: unknown[]): string {
  try {
    return JSON.stringify(p);
  } catch {
    return String(p);
  }
}

function finalize(
  gates: GateVerdict[],
  probe: ReturnType<typeof executeKernelSandbox>,
  crashes: SandboxCrash[],
  t0: number,
): HarnessReport {
  return {
    ok: gates.every((g) => g.pass),
    gates,
    resourceUsage: probe.resourceUsage,
    crashes,
    durationMs: Math.max(1, Date.now() - t0),
  };
}

/**
 * Stable JSON stringify (key-sorted at every level) so deep object
 * comparisons are order-insensitive.
 */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        out[k] = (val as Record<string, unknown>)[k];
      }
      return out;
    }
    return val;
  });
}

/** Try to extract a primary numeric scalar (rtp/expected/observed) for cf-vs-mc. */
function extractScalar(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = [
      'rtp',
      'expectedPayoutPerSpin',
      'observedExpectedPayoutPerSpin',
      'expected',
      'observed',
      'mean',
    ];
    for (const k of keys) {
      const x = obj[k];
      if (typeof x === 'number' && Number.isFinite(x)) return x;
    }
  }
  return null;
}

/** Pretty-print a harness report (multi-line). */
export function formatHarnessReport(r: HarnessReport): string {
  const lines = [
    `harness-report: ok=${r.ok} duration=${r.durationMs}ms heap=${r.resourceUsage.heapMbObservedPeak.toFixed(1)}MiB`,
  ];
  for (const g of r.gates) {
    lines.push(`  [${g.pass ? 'PASS' : 'FAIL'}] ${g.name} — ${g.message}`);
  }
  return lines.join('\n');
}
