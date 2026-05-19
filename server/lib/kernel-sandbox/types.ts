/**
 * W215 Faza 1200.0 — Kernel Sandbox Runtime CORE (Agent A, restart).
 *
 * Shared interfaces za sandbox executor, source validator, resource limits
 * i test harness. Public surface deliberately small — sve interno tipovano
 * `unknown` da spreči implicit-any leak iz untrusted code path.
 */

/** Severity for a source-level violation. */
export type SourceSeverity = 'critical' | 'high' | 'medium';

export interface SourceViolation {
  /** Stable id (`eval-call`, `require-call`, …) za UI/grouping. */
  rule: string;
  severity: SourceSeverity;
  message: string;
  /** 1-based line number; `0` when the matcher is whole-file. */
  line: number;
  /** Text of the offending fragment (truncated to 120 chars). */
  excerpt: string;
}

export interface SourceValidationResult {
  ok: boolean;
  violations: SourceViolation[];
}

/** Hard limits enforced by the executor. */
export interface ResourceLimits {
  /** Wall-clock budget for a single compile-and-run, in ms. */
  cpuMs: number;
  /** Heap soft-cap in MiB; sampled via `process.memoryUsage().heapUsed`. */
  heapMb: number;
  /** Max captured console lines (FIFO truncation). */
  consoleLines: number;
}

export type SandboxTier = 'tier-1' | 'tier-2' | 'tier-3';

export interface ResourceUsage {
  cpuMsObserved: number;
  heapMbObservedPeak: number;
  consoleLinesCaptured: number;
}

/** A line written to the sandbox console proxy. */
export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  tsMs: number;
}

export interface SandboxCrash {
  kind: 'cpu-timeout' | 'heap-exceeded' | 'thrown' | 'compile-error';
  message: string;
  /** Optional stack from the thrown error. */
  stack?: string;
}

export interface SandboxResult {
  ok: boolean;
  /** Captured value from the kernel's exported function call (if requested). */
  returnValue?: unknown;
  /** Module-shape probe — names of exported functions. */
  exportedFunctions: string[];
  resourceUsage: ResourceUsage;
  consoleEntries: ConsoleEntry[];
  crashes: SandboxCrash[];
  timings: {
    compileMs: number;
    executeMs: number;
    totalMs: number;
  };
}

/** A single harness gate verdict (matches W209 gate vocabulary). */
export type GateName =
  | 'determinism'
  | 'cf-vs-mc'
  | 'performance'
  | 'boundary'
  | 'naming'
  | 'module-shape';

export interface GateVerdict {
  name: GateName;
  pass: boolean;
  message: string;
  /** Optional numeric metric (relative-deviation, ms, count). */
  metric?: number;
}

export interface HarnessReport {
  ok: boolean;
  gates: GateVerdict[];
  /** Resource usage of the dominant harness execution. */
  resourceUsage: ResourceUsage;
  crashes: SandboxCrash[];
  durationMs: number;
}
