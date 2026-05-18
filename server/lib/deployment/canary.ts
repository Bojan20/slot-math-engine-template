/**
 * W210 Faza 600.0 — Canary deployment controller.
 *
 * Drives the 4-stage rollout (1% → 5% → 25% → 100%) with per-stage
 * health gates. The controller is deterministic and time-injectable so
 * the test suite can step through stages without sleeping. Stage
 * advancement and rollback decisions are pure functions of the
 * collected `HealthSample` stream.
 *
 *   stage    rolloutPercent    holdDuration
 *   --------------------------------------------
 *   s0       1%                30min
 *   s1       5%                30min
 *   s2       25%               30min
 *   s3       100%              ∞ (live)
 *
 * Health gates evaluated per sample:
 *
 *   1. RTP drift: |rtpCanary - rtpProduction| < rollbackTriggers.rtpDriftPp/100
 *   2. Error rate: errorRate < rollbackTriggers.errorRate
 *   3. Latency: latencyP99Ms ≤ baselineLatencyP99Ms × multiplier
 *   4. Replay determinism: replayDeterministic === true (bit-identical
 *      replay of a 1000-spin sample).
 *
 * If any gate fails on any sample within the active stage window, the
 * controller emits a 'rollback' decision with the trigger reason. If
 * the stage window passes cleanly, the controller emits 'promote' and
 * advances to the next stage. Stage 3 emits 'live' once its hold
 * elapses; further samples are accepted but no longer change state.
 */
import type { DeploymentManifest, CanaryStrategy } from './manifest.js';

export interface HealthSample {
  /** Sample wallclock in ms (injectable for tests). */
  tsMs: number;
  /** Observed RTP on the canary traffic (0..1). */
  rtpCanary: number;
  /** Observed RTP on production for comparison (0..1). */
  rtpProduction: number;
  /** Observed error rate on canary (0..1). */
  errorRate: number;
  /** Observed canary p99 latency in milliseconds. */
  latencyP99Ms: number;
  /** Baseline production p99 latency in milliseconds. */
  baselineLatencyP99Ms: number;
  /** Spin replay determinism check passed. */
  replayDeterministic: boolean;
}

export type StageDecision =
  | { kind: 'hold'; stage: number; reason: 'within_stage_window' }
  | { kind: 'promote'; fromStage: number; toStage: number }
  | { kind: 'live'; stage: number }
  | { kind: 'rollback'; stage: number; trigger: RollbackTrigger };

export type RollbackTrigger =
  | 'rtp_drift'
  | 'error_rate'
  | 'latency_p99'
  | 'replay_nondeterministic';

export interface StageDefinition {
  index: number;
  rolloutPercent: number;
  holdDurationMs: number;
}

export interface ControllerOptions {
  /** Override hold duration per stage. Default 30min. */
  stageHoldMs?: number;
  /** Override strategy from the manifest. */
  strategy?: CanaryStrategy;
  /** Health gate listener — called after every sample. */
  onDecision?: (d: StageDecision) => void;
  /** Logger callback for stage transitions. */
  onStageLog?: (line: string) => void;
}

const DEFAULT_HOLD_MS = 30 * 60 * 1000;

export function planStages(
  strategy: CanaryStrategy,
  holdMs: number
): StageDefinition[] {
  switch (strategy) {
    case 'exponential':
      return [
        { index: 0, rolloutPercent: 1, holdDurationMs: holdMs },
        { index: 1, rolloutPercent: 10, holdDurationMs: holdMs },
        { index: 2, rolloutPercent: 50, holdDurationMs: holdMs },
        { index: 3, rolloutPercent: 100, holdDurationMs: Infinity },
      ];
    case 'adaptive':
      // Adaptive uses the same shape but the hold time per stage is
      // re-evaluated by `adaptHold()` based on recent health margin.
      return [
        { index: 0, rolloutPercent: 1, holdDurationMs: holdMs },
        { index: 1, rolloutPercent: 5, holdDurationMs: holdMs },
        { index: 2, rolloutPercent: 25, holdDurationMs: holdMs },
        { index: 3, rolloutPercent: 100, holdDurationMs: Infinity },
      ];
    case 'linear':
    default:
      return [
        { index: 0, rolloutPercent: 1, holdDurationMs: holdMs },
        { index: 1, rolloutPercent: 5, holdDurationMs: holdMs },
        { index: 2, rolloutPercent: 25, holdDurationMs: holdMs },
        { index: 3, rolloutPercent: 100, holdDurationMs: Infinity },
      ];
  }
}

export function evaluateGates(
  sample: HealthSample,
  manifest: DeploymentManifest
): RollbackTrigger | null {
  const t = manifest.rollbackTriggers;
  const drift = Math.abs(sample.rtpCanary - sample.rtpProduction);
  if (drift > t.rtpDriftPp / 100) return 'rtp_drift';
  if (sample.errorRate > t.errorRate) return 'error_rate';
  if (sample.baselineLatencyP99Ms > 0) {
    if (sample.latencyP99Ms > sample.baselineLatencyP99Ms * t.latencyP99Multiplier)
      return 'latency_p99';
  }
  if (!sample.replayDeterministic) return 'replay_nondeterministic';
  return null;
}

/**
 * Adaptive hold-time computation: when the sample has comfortable
 * margin against every gate, halve the hold; when it's marginal, keep
 * the configured hold. Returns the *remaining* hold to apply for the
 * stage starting at `stageStartMs`.
 */
export function adaptHold(
  sample: HealthSample,
  manifest: DeploymentManifest,
  baseHoldMs: number
): number {
  const t = manifest.rollbackTriggers;
  const driftMargin =
    t.rtpDriftPp / 100 - Math.abs(sample.rtpCanary - sample.rtpProduction);
  const errMargin = t.errorRate - sample.errorRate;
  const latMargin =
    sample.baselineLatencyP99Ms > 0
      ? sample.baselineLatencyP99Ms * t.latencyP99Multiplier - sample.latencyP99Ms
      : 1;
  const comfortable =
    driftMargin > t.rtpDriftPp / 200 && errMargin > t.errorRate / 2 && latMargin > 0;
  return comfortable ? Math.max(baseHoldMs / 2, 60_000) : baseHoldMs;
}

export class CanaryController {
  private readonly stages: StageDefinition[];
  private currentStage = 0;
  private stageStartMs = 0;
  private done = false;
  private rolledBack = false;
  private lastTrigger: RollbackTrigger | null = null;
  private samplesInStage = 0;
  private readonly onDecision?: (d: StageDecision) => void;
  private readonly onStageLog?: (line: string) => void;

  constructor(
    private readonly manifest: DeploymentManifest,
    opts: ControllerOptions = {}
  ) {
    const holdMs = opts.stageHoldMs ?? DEFAULT_HOLD_MS;
    this.stages = planStages(
      opts.strategy ?? manifest.canaryStrategy,
      holdMs
    );
    this.onDecision = opts.onDecision;
    this.onStageLog = opts.onStageLog;
  }

  /** Begin the rollout at `tsMs` (typically Date.now()). */
  start(tsMs: number): void {
    this.currentStage = 0;
    this.stageStartMs = tsMs;
    this.done = false;
    this.rolledBack = false;
    this.lastTrigger = null;
    this.samplesInStage = 0;
    this.log(
      `stage=s0 rolloutPercent=${this.stages[0].rolloutPercent} status=started`
    );
  }

  /** Feed a health sample. Returns the resulting decision. */
  ingest(sample: HealthSample): StageDecision {
    if (this.done || this.rolledBack) {
      return this.rolledBack
        ? {
            kind: 'rollback',
            stage: this.currentStage,
            trigger: this.lastTrigger ?? 'rtp_drift',
          }
        : { kind: 'live', stage: this.currentStage };
    }
    this.samplesInStage++;
    const gateFail = evaluateGates(sample, this.manifest);
    if (gateFail) {
      this.rolledBack = true;
      this.lastTrigger = gateFail;
      const d: StageDecision = {
        kind: 'rollback',
        stage: this.currentStage,
        trigger: gateFail,
      };
      this.log(
        `stage=s${this.currentStage} status=rollback trigger=${gateFail}`
      );
      this.onDecision?.(d);
      return d;
    }
    const stage = this.stages[this.currentStage];
    const inWindow =
      sample.tsMs - this.stageStartMs <
      (this.manifest.canaryStrategy === 'adaptive'
        ? adaptHold(sample, this.manifest, stage.holdDurationMs)
        : stage.holdDurationMs);
    if (inWindow) {
      const d: StageDecision = {
        kind: 'hold',
        stage: this.currentStage,
        reason: 'within_stage_window',
      };
      this.onDecision?.(d);
      return d;
    }
    // Window elapsed and all gates pass — promote (or go live if the
    // next stage is the terminal one).
    if (this.currentStage < this.stages.length - 1) {
      const from = this.currentStage;
      this.currentStage++;
      this.stageStartMs = sample.tsMs;
      this.samplesInStage = 0;
      const promoted: StageDecision = {
        kind: 'promote',
        fromStage: from,
        toStage: this.currentStage,
      };
      this.log(
        `stage=s${this.currentStage} rolloutPercent=${this.stages[this.currentStage].rolloutPercent} status=promoted from=s${from}`
      );
      // Reaching the final stage (rolloutPercent=100) is equivalent to
      // being live — emit 'live' instead of 'promote' so the rehearsal
      // and tests can terminate cleanly.
      if (this.currentStage === this.stages.length - 1) {
        this.done = true;
        const live: StageDecision = { kind: 'live', stage: this.currentStage };
        this.log(`stage=s${this.currentStage} rolloutPercent=100 status=live`);
        this.onDecision?.(live);
        return live;
      }
      this.onDecision?.(promoted);
      return promoted;
    }
    this.done = true;
    const d: StageDecision = { kind: 'live', stage: this.currentStage };
    this.log(`stage=s${this.currentStage} rolloutPercent=100 status=live`);
    this.onDecision?.(d);
    return d;
  }

  /** Current effective rollout %. */
  rolloutPercent(): number {
    return this.stages[this.currentStage].rolloutPercent;
  }

  /** Snapshot for persistence. */
  snapshot(): {
    stage: number;
    rolloutPercent: number;
    done: boolean;
    rolledBack: boolean;
    trigger: RollbackTrigger | null;
    samplesInStage: number;
  } {
    return {
      stage: this.currentStage,
      rolloutPercent: this.rolloutPercent(),
      done: this.done,
      rolledBack: this.rolledBack,
      trigger: this.lastTrigger,
      samplesInStage: this.samplesInStage,
    };
  }

  /** Aggregate health score in [0,1] computed from the most recent sample. */
  healthScore(sample: HealthSample): number {
    const t = this.manifest.rollbackTriggers;
    const driftScore =
      1 - Math.min(1, Math.abs(sample.rtpCanary - sample.rtpProduction) / (t.rtpDriftPp / 100));
    const errScore = 1 - Math.min(1, sample.errorRate / Math.max(1e-9, t.errorRate));
    const latScore =
      sample.baselineLatencyP99Ms > 0
        ? 1 -
          Math.min(
            1,
            Math.max(0, sample.latencyP99Ms - sample.baselineLatencyP99Ms) /
              (sample.baselineLatencyP99Ms * (t.latencyP99Multiplier - 1) || 1)
          )
        : 1;
    const detScore = sample.replayDeterministic ? 1 : 0;
    return (driftScore + errScore + latScore + detScore) / 4;
  }

  private log(line: string): void {
    this.onStageLog?.(line);
  }
}

/**
 * Drive the controller through a deterministic sample stream — useful
 * for both tests and dry-run CI rehearsal. Returns the decision sequence.
 */
export function runRehearsal(
  manifest: DeploymentManifest,
  samples: HealthSample[],
  opts: ControllerOptions = {}
): StageDecision[] {
  const ctrl = new CanaryController(manifest, opts);
  if (samples.length === 0) return [];
  ctrl.start(samples[0].tsMs);
  const out: StageDecision[] = [];
  for (const s of samples) {
    const d = ctrl.ingest(s);
    out.push(d);
    if (d.kind === 'rollback' || d.kind === 'live') break;
  }
  return out;
}
