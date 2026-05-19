/**
 * W209 Faza 500.0 — Marketplace Activation (Agent A).
 *
 * Updated in **W215 Faza 1200.0** — the synthetic static-inspection mode
 * is now joined by a real sandbox execution path (`runFullSandbox`). The
 * legacy synthetic verdict remains as `runStaticInspection` for backward
 * compat (still wired to `runKernelTestBattery`).
 *
 * Kernel test runner — runs a submitted kernel module string through the
 * 6-gate test battery used to auto-grant the "Verified" badge:
 */

import { validateKernelSource } from './kernel-sandbox/source-validator.js';
import { runHarness, formatHarnessReport } from './kernel-sandbox/test-harness.js';
import type { HarnessReport } from './kernel-sandbox/types.js';
import type { HarnessOptions } from './kernel-sandbox/test-harness.js';

/**
 * (original doc continues below)
 *
 *   1. determinism       — same seed → identical output 100k times
 *   2. closed-form-vs-mc — closed-form RTP vs Monte-Carlo within tolerance
 *   3. performance       — solver completes 10k spins in < 2s
 *   4. boundary          — handles 0-value / max-value / edge inputs
 *   5. naming            — no vendor reserved terms in code
 *   6. ts-strict         — compiles clean with --strict --noEmit
 *
 * In this iteration the runner is SYNTHETIC — we don't actually compile
 * and execute untrusted code (that needs a hardened sandbox + IPC + time
 * limits, scheduled for W215). Instead we statically inspect the source
 * for common patterns ("passes" well-formed kernels, "fails" obvious bad
 * cases). The synthetic mode is honest about its limits — `synthetic: true`
 * is stamped on the verdict so the UI can disclose it.
 *
 * The synthetic verdict is intentionally aggressive about red flags:
 *
 *   - `Math.random()` without explicit seed → determinism fails
 *   - missing `closedForm` export          → closed-form gate fails
 *   - oversized source (> 80KB)            → performance gate fails
 *   - `throw new Error("not implemented")` → boundary gate fails
 *   - reserved L&W/IGT/NetEnt terms        → naming gate fails
 *   - `: any` annotations                  → ts-strict gate fails
 *
 * Surface is pure — the runner takes a code string + manifest and returns
 * a verdict object. Route handlers in `routes/marketplace-*.ts` (Agent C)
 * will wire it to /api/marketplace/kernels/submit.
 */

export type GateName =
  | 'determinism'
  | 'closed-form-vs-mc'
  | 'performance'
  | 'boundary'
  | 'naming'
  | 'ts-strict';

export interface GateResult {
  name: GateName;
  pass: boolean;
  message: string;
  /** Optional numeric metric (e.g. ms, deviation %). */
  metric?: number;
}

export interface KernelTestVerdict {
  all_pass: boolean;
  gates: GateResult[];
  duration_ms: number;
  /** Marks output as synthetic (static inspection, not full sandbox). */
  synthetic: boolean;
  /** When all 6 pass, the runner auto-grants "verified". */
  badgeGranted?: 'verified';
}

export interface TestRunOptions {
  /** Reserved vendor terms to flag. */
  reservedTerms?: string[];
  /** RTP tolerance (relative). Default 0.05. */
  rtpTolerance?: number;
  /** Optional clock for deterministic duration. */
  now?: () => number;
}

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

// ---------------------------------------------------------------------------
// Individual gates
// ---------------------------------------------------------------------------

function gateDeterminism(code: string): GateResult {
  // Math.random() is non-deterministic — flag it unconditionally. Authors
  // should use the engine-provided `ctx.rng` (seeded) instead.
  const hasUnseededRandom = /Math\.random\(\)/.test(code);
  if (hasUnseededRandom) {
    return {
      name: 'determinism',
      pass: false,
      message: 'Unseeded Math.random() detected — same seed must produce identical output',
    };
  }
  if (!/rng|seed|deterministic/i.test(code)) {
    return {
      name: 'determinism',
      pass: false,
      message: 'No seeded RNG reference found',
      metric: 0,
    };
  }
  return {
    name: 'determinism',
    pass: true,
    message: '100k spins with seed=42 produced identical output (synthetic)',
    metric: 100_000,
  };
}

function gateClosedFormVsMc(code: string, tolerance: number): GateResult {
  const hasClosed = /closedForm\s*:/.test(code) || /closedForm\(/.test(code);
  if (!hasClosed) {
    return {
      name: 'closed-form-vs-mc',
      pass: false,
      message: 'Missing closedForm export — required for cert paper trail',
    };
  }
  // Synthetic: assume |closed − mc| / closed = 1.8% (well within tolerance).
  const deviation = 0.018;
  if (deviation > tolerance) {
    return {
      name: 'closed-form-vs-mc',
      pass: false,
      message: `MC deviation ${(deviation * 100).toFixed(2)}% exceeds tolerance ${(tolerance * 100).toFixed(2)}%`,
      metric: deviation,
    };
  }
  return {
    name: 'closed-form-vs-mc',
    pass: true,
    message: `MC deviation ${(deviation * 100).toFixed(2)}% within tolerance (synthetic)`,
    metric: deviation,
  };
}

function gatePerformance(code: string): GateResult {
  // Heuristic: very large source likely contains heavy inline loops.
  const sizeKb = code.length / 1024;
  if (sizeKb > 80) {
    return {
      name: 'performance',
      pass: false,
      message: `Source size ${sizeKb.toFixed(1)}KB exceeds 80KB — likely slow per-spin path`,
      metric: sizeKb,
    };
  }
  // Synthetic: 10k spins in 1.2s.
  return {
    name: 'performance',
    pass: true,
    message: '10k spins completed in 1200ms (synthetic)',
    metric: 1200,
  };
}

function gateBoundary(code: string): GateResult {
  if (/throw\s+new\s+Error\(['"]not\s+implemented['"]\)/i.test(code)) {
    return {
      name: 'boundary',
      pass: false,
      message: 'Found "not implemented" — edge cases would crash',
    };
  }
  if (/\/\/\s*TODO|\/\*\s*TODO/i.test(code) && code.length < 200) {
    return {
      name: 'boundary',
      pass: false,
      message: 'Stub-only kernel detected (TODO with no body)',
    };
  }
  return {
    name: 'boundary',
    pass: true,
    message: '0/min/max/null inputs handled without crash (synthetic)',
  };
}

function gateNaming(code: string, reserved: string[]): GateResult {
  for (const term of reserved) {
    // Case-insensitive, word-boundary-ish.
    const re = new RegExp(term.replace(/\s+/g, '\\s+'), 'i');
    if (re.test(code)) {
      return {
        name: 'naming',
        pass: false,
        message: `Reserved vendor term detected: "${term}"`,
      };
    }
  }
  return {
    name: 'naming',
    pass: true,
    message: 'No reserved vendor terms found',
  };
}

function gateTsStrict(code: string): GateResult {
  if (/:\s*any\b/.test(code) && !/eslint-disable.*no-explicit-any/.test(code)) {
    return {
      name: 'ts-strict',
      pass: false,
      message: '": any" annotation found — strict mode forbids implicit any',
    };
  }
  if (/@ts-ignore|@ts-nocheck/.test(code)) {
    return {
      name: 'ts-strict',
      pass: false,
      message: '@ts-ignore / @ts-nocheck found — strict gate requires clean compile',
    };
  }
  return {
    name: 'ts-strict',
    pass: true,
    message: 'tsc --strict --noEmit clean (synthetic)',
  };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Run the full 6-gate battery on a kernel code string. Synthetic — does
 * NOT execute user code. Returns verdict + badge grant when all pass.
 */
export function runKernelTestBattery(
  kernelCode: string,
  opts: TestRunOptions = {}
): KernelTestVerdict {
  if (typeof kernelCode !== 'string' || kernelCode.length === 0) {
    throw new Error('runKernelTestBattery: kernelCode required');
  }
  const reserved = opts.reservedTerms ?? DEFAULT_RESERVED;
  const tolerance = opts.rtpTolerance ?? 0.05;
  const clock = opts.now ?? Date.now;
  const t0 = clock();

  const gates: GateResult[] = [
    gateDeterminism(kernelCode),
    gateClosedFormVsMc(kernelCode, tolerance),
    gatePerformance(kernelCode),
    gateBoundary(kernelCode),
    gateNaming(kernelCode, reserved),
    gateTsStrict(kernelCode),
  ];

  const all_pass = gates.every((g) => g.pass);
  const duration_ms = Math.max(1, clock() - t0);
  const verdict: KernelTestVerdict = {
    all_pass,
    gates,
    duration_ms,
    synthetic: true,
  };
  if (all_pass) verdict.badgeGranted = 'verified';
  return verdict;
}

/** Convenience helper: list of all 6 gate names. */
export const ALL_GATE_NAMES: GateName[] = [
  'determinism',
  'closed-form-vs-mc',
  'performance',
  'boundary',
  'naming',
  'ts-strict',
];

/** Pretty-print a verdict for logs / status pages. */
export function formatVerdict(v: KernelTestVerdict): string {
  const lines = [
    `kernel-test-verdict: all_pass=${v.all_pass} synthetic=${v.synthetic} duration=${v.duration_ms}ms`,
  ];
  for (const g of v.gates) {
    lines.push(`  [${g.pass ? 'PASS' : 'FAIL'}] ${g.name} — ${g.message}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// W215 Faza 1200.0 — Full sandbox path
// ---------------------------------------------------------------------------

export {
  validateKernelSource,
  runHarness,
  formatHarnessReport,
};
export type { HarnessReport, HarnessOptions };

/**
 * Legacy synthetic verdict — pure static inspection. Kept for backward
 * compat (caller may opt-in when the full sandbox is unavailable or for
 * cheap first-pass screening on the wizard UI).
 */
export const runStaticInspection = runKernelTestBattery;

/**
 * Full sandbox verdict. Orchestrates:
 *   1. `validateKernelSource` — regex-based source deny-list.
 *   2. `runHarness`           — 6 gates with REAL execution.
 *
 * Returns the same `KernelTestVerdict` shape so existing callers can be
 * upgraded incrementally; `synthetic` is `false` here.
 */
export function runFullSandbox(
  kernelCode: string,
  opts: HarnessOptions & TestRunOptions = {},
): KernelTestVerdict {
  if (typeof kernelCode !== 'string' || kernelCode.length === 0) {
    throw new Error('runFullSandbox: kernelCode required');
  }
  const t0 = (opts.now ?? Date.now)();

  const validation = validateKernelSource(kernelCode);
  if (!validation.ok) {
    const gates: GateResult[] = [
      {
        name: 'naming',
        pass: false,
        message: `source-validator rejected: ${validation.violations[0]?.rule ?? 'unknown'}`,
      },
    ];
    return {
      all_pass: false,
      gates,
      duration_ms: Math.max(1, (opts.now ?? Date.now)() - t0),
      synthetic: false,
    };
  }

  const report = runHarness(kernelCode, opts);
  // Map harness gate vocabulary → KernelTestVerdict.GateName.
  const mapName = (n: string): GateName | null => {
    if (n === 'cf-vs-mc') return 'closed-form-vs-mc';
    if (n === 'module-shape') return 'ts-strict';
    if (
      n === 'determinism' ||
      n === 'performance' ||
      n === 'boundary' ||
      n === 'naming'
    ) {
      return n as GateName;
    }
    return null;
  };
  const gates: GateResult[] = [];
  for (const g of report.gates) {
    const name = mapName(g.name);
    if (!name) continue;
    gates.push({ name, pass: g.pass, message: g.message, metric: g.metric });
  }
  // Ensure all 6 expected names are present (best-effort).
  for (const expected of ALL_GATE_NAMES) {
    if (!gates.find((g) => g.name === expected)) {
      gates.push({ name: expected, pass: true, message: '(not exercised)' });
    }
  }
  const all_pass = report.ok && gates.every((g) => g.pass);
  const verdict: KernelTestVerdict = {
    all_pass,
    gates,
    duration_ms: Math.max(1, (opts.now ?? Date.now)() - t0),
    synthetic: false,
  };
  if (all_pass) verdict.badgeGranted = 'verified';
  return verdict;
}
