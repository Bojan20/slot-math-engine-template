/**
 * W211 Agent C — Demo Theater player state reducer.
 *
 * Pure functions over PlayerState so the test suite can validate every
 * UI action without booting jsdom. The UI shell in player.ts wires DOM
 * events to these reducers.
 */

import type {
  PlayerState,
  Persona,
  Timeline,
  TimelineEvent,
} from './types.js';
import { SPEED_PRESETS } from './types.js';

export function createPlayer(timeline: Timeline | null = null): PlayerState {
  return {
    playheadDay: 0,
    speed: 1,
    paused: true,
    persona: timeline?.persona ?? 'all',
    timeline,
  };
}

export function loadTimeline(state: PlayerState, t: Timeline): PlayerState {
  return {
    ...state,
    timeline: t,
    playheadDay: 0,
    persona: t.persona,
    paused: true,
  };
}

export function play(state: PlayerState): PlayerState {
  if (!state.timeline) return state;
  return { ...state, paused: false };
}

export function pause(state: PlayerState): PlayerState {
  return { ...state, paused: true };
}

export function togglePlay(state: PlayerState): PlayerState {
  return { ...state, paused: !state.paused };
}

export function setSpeed(state: PlayerState, speed: number): PlayerState {
  // Snap to nearest preset for stability.
  const snapped = SPEED_PRESETS.reduce((best, s) =>
    Math.abs(s - speed) < Math.abs(best - speed) ? s : best,
    SPEED_PRESETS[0]
  );
  return { ...state, speed: snapped };
}

export function setPersona(state: PlayerState, persona: Persona): PlayerState {
  return { ...state, persona };
}

export function skipDay(state: PlayerState): PlayerState {
  if (!state.timeline) return state;
  const next = Math.min(state.timeline.days, Math.floor(state.playheadDay) + 1);
  return { ...state, playheadDay: next };
}

export function rewindDay(state: PlayerState): PlayerState {
  const next = Math.max(0, Math.floor(state.playheadDay) - 1);
  return { ...state, playheadDay: next };
}

export function seek(state: PlayerState, day: number): PlayerState {
  if (!state.timeline) return state;
  const clamped = Math.max(0, Math.min(state.timeline.days, day));
  return { ...state, playheadDay: clamped };
}

/**
 * Advance the playhead by `wallMs` of wall time.
 *
 * Speed=1 ⇒ 5 minutes wall ≈ 30 days (300×), so each ms advances ~0.1
 * playhead days. Returns the new state and the events that crossed the
 * playhead in this tick.
 */
export function tick(
  state: PlayerState,
  wallMs: number
): { state: PlayerState; crossed: TimelineEvent[] } {
  if (state.paused || !state.timeline) return { state, crossed: [] };
  const dayAdvance = (wallMs / (10_000 / state.speed));
  // 10_000ms wall ≈ 1 day at speed=1.
  const newDay = Math.min(state.timeline.days, state.playheadDay + dayAdvance);
  const prevDay = state.playheadDay;
  const crossed = state.timeline.events.filter((e) => e.day > prevDay && e.day <= newDay);
  const nextState: PlayerState = {
    ...state,
    playheadDay: newDay,
    paused: newDay >= state.timeline.days ? true : state.paused,
  };
  return { state: nextState, crossed };
}

/** Filter events for the active persona (used by the live feed panel). */
export function filterForPersona(
  events: readonly TimelineEvent[],
  persona: Persona
): TimelineEvent[] {
  if (persona === 'all') return [...events];
  if (persona === 'cto') {
    return events.filter((e) => ['spin', 'cache', 'audit', 'canary', 'anomaly'].includes(e.type));
  }
  if (persona === 'cmo') {
    return events.filter((e) => ['spin', 'operator', 'lab'].includes(e.type));
  }
  // cfo
  return events.filter((e) => ['spin', 'lab', 'anomaly', 'operator'].includes(e.type));
}

/** Snapshot of the "key metrics" panel at the current playhead. */
export function keyMetrics(state: PlayerState): {
  currentDay: number;
  daysRemaining: number;
  canaryStage: number;
  canaryPercent: number;
  estRtp: number;
} {
  const day = Math.floor(state.playheadDay);
  if (!state.timeline || state.timeline.dailyCounts.length === 0) {
    return { currentDay: 0, daysRemaining: 0, canaryStage: 0, canaryPercent: 0, estRtp: 0 };
  }
  const safeDay = Math.min(day, state.timeline.dailyCounts.length - 1);
  const c = state.timeline.dailyCounts[safeDay];
  return {
    currentDay: day,
    daysRemaining: state.timeline.days - day,
    canaryStage: c.canary.stage,
    canaryPercent: c.canary.rolloutPercent,
    estRtp: 0.96,
  };
}
