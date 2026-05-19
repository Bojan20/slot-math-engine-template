// Shared protocol types for the Auto-MC worker / orchestrator.
// Kept structurally compatible with the IR's `validated_metrics` block so
// the result can be merged into the variant verbatim.

import type { SlotGameIR } from '@engine/ir/types.js';

export interface AutoMcRunRequest {
  kind: 'run';
  /** The IR to simulate against. */
  ir: SlotGameIR;
  /** Total spins to play.  Defaults to 1_000_000 in the orchestrator. */
  spins: number;
  /** Deterministic seed.  Defaults to `ir.rng.default_seed ?? 12345`. */
  seed: number;
  /** Reservoir cap for percentile estimation. */
  reservoirSize: number;
  /** Cap simulator runtime — if exceeded, return partial result. */
  timeoutMs: number;
  /** Tag echoed back in progress/result messages so the orchestrator can
   *  ignore stale callbacks if the variant changed mid-run. */
  runId: string;
}

export interface AutoMcCancelRequest {
  kind: 'cancel';
  runId: string;
}

export type AutoMcRequest = AutoMcRunRequest | AutoMcCancelRequest;

export interface AutoMcProgressMessage {
  kind: 'progress';
  runId: string;
  spinsDone: number;
  totalSpins: number;
  runningRtp: number;     // 0..1
  elapsedMs: number;
}

export interface AutoMcResultMessage {
  kind: 'result';
  runId: string;
  /** Whether the run completed or was cancelled / timed out. */
  status: 'complete' | 'cancelled' | 'timeout' | 'partial';
  /** Mirror of IR `validated_metrics` shape — drop straight into v.validatedMetrics. */
  validatedMetrics: {
    source: string;
    total_spins: number;
    rtp: number;                 // percent (0..100)
    hit_rate: number;            // percent
    volatility_index: number;
    fs_frequency: number | null; // 1-in-N (Infinity → null)
    hnw_frequency: number | null;
    cascade_frequency: number | null;
    pick_frequency: number | null;
    wheel_frequency: number | null;
    respin_frequency: number | null;
    max_win_observed_x: number;
    win_percentiles: {
      p50: number; p75: number; p90: number; p95: number;
      p99: number; p99_9: number; p99_99: number;
    };
    rtp_breakdown: Record<string, number>;
    confidence: {
      mean_rtp: number; std_dev: number; std_error: number;
      ci_95_low: number; ci_95_high: number;
    };
  };
  /** Stats for the orchestrator UI (not stored on the variant). */
  durationMs: number;
  spinsPerSec: number;
}

export interface AutoMcErrorMessage {
  kind: 'error';
  runId: string;
  message: string;
  stack?: string;
}

export type AutoMcResponse =
  | AutoMcProgressMessage
  | AutoMcResultMessage
  | AutoMcErrorMessage;
