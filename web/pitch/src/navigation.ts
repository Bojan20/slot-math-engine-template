/**
 * CORTI W205-PITCH — deck navigation (keyboard, click, presenter, autoplay).
 *
 * Pure, side-effect-free state transitions on a DeckState object so the
 * navigation logic can be unit-tested in Node without jsdom.
 */

import type { DeckState, Slide } from './types.js';

export function createDeck(slides: Slide[]): DeckState {
  return {
    slides,
    current: 0,
    presenter: false,
    overview: false,
    autoplay: false,
    autoplayMs: 10_000,
  };
}

export function next(state: DeckState): DeckState {
  const max = state.slides.length - 1;
  return { ...state, current: Math.min(state.current + 1, max) };
}

export function prev(state: DeckState): DeckState {
  return { ...state, current: Math.max(state.current - 1, 0) };
}

export function goTo(state: DeckState, index: number): DeckState {
  const max = state.slides.length - 1;
  const c = Math.max(0, Math.min(max, index));
  return { ...state, current: c };
}

export function toggleOverview(state: DeckState): DeckState {
  return { ...state, overview: !state.overview };
}

export function togglePresenter(state: DeckState): DeckState {
  return { ...state, presenter: !state.presenter };
}

export function toggleAutoplay(state: DeckState): DeckState {
  return { ...state, autoplay: !state.autoplay };
}

/**
 * Map a keyboard event to a state transition. Returns `null` if the event
 * doesn't bind to a deck command (caller should ignore).
 *
 * Bindings:
 *   ArrowRight / Space / PageDown    → next
 *   ArrowLeft / Backspace / PageUp   → prev
 *   Home                             → first slide
 *   End                              → last slide
 *   Escape                           → toggle overview
 *   f / F                            → toggle presenter
 *   a / A                            → toggle autoplay
 */
export function reduceKey(state: DeckState, key: string): DeckState | null {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
    case 'Space':
      return next(state);
    case 'ArrowLeft':
    case 'PageUp':
    case 'Backspace':
      return prev(state);
    case 'Home':
      return goTo(state, 0);
    case 'End':
      return goTo(state, state.slides.length - 1);
    case 'Escape':
      return toggleOverview(state);
    case 'f':
    case 'F':
      return togglePresenter(state);
    case 'a':
    case 'A':
      return toggleAutoplay(state);
    default:
      return null;
  }
}

/**
 * Drive auto-advance via a timer. The caller is responsible for actually
 * scheduling the timer; this helper returns the next state plus whether
 * a wrap occurred (so the UI can stop autoplay at the end of the deck).
 */
export function tickAutoplay(state: DeckState): { next: DeckState; wrapped: boolean } {
  if (!state.autoplay) return { next: state, wrapped: false };
  const max = state.slides.length - 1;
  if (state.current >= max) {
    return { next: { ...state, autoplay: false }, wrapped: true };
  }
  return { next: next(state), wrapped: false };
}
