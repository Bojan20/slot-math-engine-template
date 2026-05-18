/**
 * W211 Agent C — Demo Theater player DOM shell.
 *
 * Wires the pure renderers in render.ts and the reducers in state.ts to
 * a live DOM root. Boots when a #demo-theater-player root exists in the
 * host page.
 *
 * Boot path:
 *   1. Fetch ?timeline=<url> (or default /demo-theater/timeline.json).
 *   2. Build PlayerState via createPlayer + loadTimeline.
 *   3. Animation loop ticks every 100ms while not paused.
 *   4. Click handlers dispatch reducer functions.
 */

import type { PlayerState, Persona, Timeline } from './types.js';
import {
  createPlayer,
  loadTimeline,
  togglePlay,
  setSpeed,
  setPersona,
  skipDay,
  rewindDay,
  seek,
  tick,
} from './state.js';
import { renderPlayer } from './render.js';

const ROOT_ID = 'demo-theater-player';
const TICK_MS = 100;

let state: PlayerState = createPlayer();
let timer: ReturnType<typeof setInterval> | null = null;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function rootEl(): HTMLElement | null {
  return $(ROOT_ID);
}

function render(): void {
  const root = rootEl();
  if (!root) return;
  root.innerHTML = renderPlayer(state);
  wireHandlers(root);
}

function apply(next: PlayerState): void {
  state = next;
  render();
  resyncTimer();
}

function resyncTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (state.paused) return;
  timer = setInterval(() => {
    const { state: ns } = tick(state, TICK_MS);
    state = ns;
    render();
    if (ns.paused) {
      if (timer) clearInterval(timer);
      timer = null;
    }
  }, TICK_MS);
}

function wireHandlers(root: HTMLElement): void {
  for (const btn of Array.from(root.querySelectorAll<HTMLButtonElement>('.tp-persona-btn'))) {
    btn.addEventListener('click', () => {
      const p = btn.dataset.persona as Persona | undefined;
      if (p) apply(setPersona(state, p));
    });
  }
  for (const btn of Array.from(root.querySelectorAll<HTMLButtonElement>('.tp-speed-btn'))) {
    btn.addEventListener('click', () => {
      const s = Number(btn.dataset.speed ?? 1);
      apply(setSpeed(state, s));
    });
  }
  for (const btn of Array.from(root.querySelectorAll<HTMLButtonElement>('.tp-btn'))) {
    const act = btn.dataset.action;
    btn.addEventListener('click', () => {
      if (act === 'play') apply(togglePlay(state));
      else if (act === 'skip') apply(skipDay(state));
      else if (act === 'rewind') apply(rewindDay(state));
    });
  }
  const prog = root.querySelector<HTMLElement>('.tp-progress');
  prog?.addEventListener('click', (ev) => {
    const rect = prog.getBoundingClientRect();
    const x = (ev as MouseEvent).clientX - rect.left;
    const days = state.timeline?.days ?? 30;
    apply(seek(state, (x / rect.width) * days));
  });
}

async function fetchTimeline(url: string): Promise<Timeline> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`timeline fetch failed: ${r.status}`);
  return (await r.json()) as Timeline;
}

/** Boot entrypoint. Idempotent — safe to call from main.ts or directly. */
export async function bootPlayer(opts: { timelineUrl?: string } = {}): Promise<void> {
  if (!rootEl()) return;
  const url = opts.timelineUrl ?? '/demo-theater/timeline.json';
  try {
    const t = await fetchTimeline(url);
    apply(loadTimeline(createPlayer(), t));
  } catch {
    // Render empty state so UI still appears in unit tests / demos without data.
    apply(state);
  }
}

// Expose for tests / external callers.
declare global {
  interface Window {
    __theaterPlayer__?: {
      getState: () => PlayerState;
      apply: (s: PlayerState) => void;
      reducers: typeof import('./state.js');
    };
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void bootPlayer());
  } else {
    void bootPlayer();
  }
  window.__theaterPlayer__ = {
    getState: () => state,
    apply,
    reducers: { createPlayer, loadTimeline, togglePlay, setSpeed, setPersona, skipDay, rewindDay, seek, tick } as unknown as typeof import('./state.js'),
  };
}
