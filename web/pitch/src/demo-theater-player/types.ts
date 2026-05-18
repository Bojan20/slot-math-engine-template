/**
 * W211 Agent C — Demo Theater player type definitions.
 *
 * Mirrors the JSON envelope produced by
 * scripts/demo-theater/orchestrator.mjs so the player can deserialize a
 * timeline.json file without runtime type drift.
 */

export type Persona = 'cto' | 'cmo' | 'cfo' | 'all';

export type EventType =
  | 'spin'
  | 'cache'
  | 'audit'
  | 'canary'
  | 'lab'
  | 'anomaly'
  | 'operator';

export interface TimelineEvent {
  type: EventType;
  day: number;
  ts: string;
  payload: Record<string, unknown>;
}

export interface DailyCount {
  day: number;
  total: number;
  byType: Record<string, number>;
  spinVolume: number;
  canary: { stage: number; rolloutPercent: number };
  lab: { stage: string; daysInStage: number };
}

export interface Timeline {
  seed: number;
  days: number;
  persona: Persona;
  speed: number;
  startedAt: string;
  finishedAt: string;
  wallTimeMs: number;
  totalEvents: number;
  dailyCounts: DailyCount[];
  events: TimelineEvent[];
  consoleLines: string[];
}

export interface PlayerState {
  /** Current playhead day (float — supports sub-day animation). */
  playheadDay: number;
  /** Wall-clock playback speed multiplier. */
  speed: number;
  /** Paused? */
  paused: boolean;
  /** Active persona filter. */
  persona: Persona;
  /** Loaded timeline (null until load). */
  timeline: Timeline | null;
}

export const SPEED_PRESETS = [0.5, 1, 2, 5] as const;
export type SpeedPreset = (typeof SPEED_PRESETS)[number];
