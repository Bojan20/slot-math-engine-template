/**
 * CORTI W205-PITCH — entry point for the investor pitch deck mini-app.
 *
 * Boots on :5177 (Vite dev). Wires keyboard + click navigation to the
 * navigation reducer in navigation.ts, renders slides via renderer.ts,
 * and triggers PDF export via pdf-export.ts.
 */

import { SLIDES } from './slides.js';
import {
  createDeck,
  next,
  prev,
  goTo,
  toggleOverview,
  togglePresenter,
  toggleAutoplay,
  reduceKey,
  tickAutoplay,
} from './navigation.js';
import { renderSlide, renderOverview, renderCounter, setSlideCount } from './renderer.js';
import { exportDeck, downloadDeck } from './pdf-export.js';
import type { DeckState, ToastKind } from './types.js';

setSlideCount(SLIDES.length);

const state: DeckState = createDeck(SLIDES);
let autoplayTimer: ReturnType<typeof setInterval> | null = null;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function toast(msg: string, kind: ToastKind = 'ok'): void {
  const root = $('pitch-toast');
  if (!root) return;
  const div = document.createElement('div');
  div.className = `t ${kind}`;
  div.textContent = msg;
  root.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

function render(): void {
  const frame = $('slide-frame');
  const counter = $('slide-counter');
  const notesBody = $('notes-body');
  const overviewEl = $('overview-grid');
  const presenterBtn = $('btn-presenter');
  const overviewBtn = $('btn-overview');
  const autoplayBtn = $('btn-autoplay');
  const prevBtn = $('btn-prev') as HTMLButtonElement | null;
  const nextBtn = $('btn-next') as HTMLButtonElement | null;
  const speakerAside = $('speaker-notes');

  const slide = state.slides[state.current];
  if (frame) frame.innerHTML = renderSlide(slide);
  if (counter) counter.textContent = renderCounter(state.current, state.slides.length);
  if (notesBody) notesBody.textContent = slide.notes;

  if (overviewEl) {
    overviewEl.hidden = !state.overview;
    if (state.overview) {
      overviewEl.innerHTML = renderOverview(state.slides);
      for (const card of Array.from(overviewEl.querySelectorAll<HTMLButtonElement>('.overview-card'))) {
        card.addEventListener('click', () => {
          const i = Number(card.dataset.index);
          applyState({ ...state, current: i, overview: false });
        });
      }
    }
  }

  document.body.classList.toggle('is-presenter', state.presenter);
  if (speakerAside) speakerAside.hidden = !state.presenter;
  presenterBtn?.classList.toggle('is-active', state.presenter);
  overviewBtn?.classList.toggle('is-active', state.overview);
  autoplayBtn?.classList.toggle('is-active', state.autoplay);
  if (autoplayBtn) autoplayBtn.textContent = state.autoplay ? `Auto · On` : `Auto · Off`;

  if (prevBtn) prevBtn.disabled = state.current === 0;
  if (nextBtn) nextBtn.disabled = state.current === state.slides.length - 1;
}

function applyState(s: DeckState): void {
  // Mutate the singleton in place so the autoplay timer reads fresh values.
  Object.assign(state, s);
  render();
  resyncAutoplay();
}

function resyncAutoplay(): void {
  if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
  if (!state.autoplay) return;
  autoplayTimer = setInterval(() => {
    const { next: nextState, wrapped } = tickAutoplay(state);
    if (wrapped) {
      applyState(nextState);
      toast('Auto-advance reached the end of the deck.', 'warn');
    } else {
      applyState(nextState);
    }
  }, state.autoplayMs);
}

function onKey(e: KeyboardEvent): void {
  // Don't intercept while focus is on an interactive control inside the deck.
  const tgt = e.target as HTMLElement | null;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

  const reduced = reduceKey(state, e.key);
  if (reduced) {
    e.preventDefault();
    applyState(reduced);
  }
}

async function onDownload(): Promise<void> {
  toast('Generating PDF…');
  try {
    const bytes = await exportDeck(SLIDES, { includeNotes: true });
    downloadDeck(bytes);
    toast('PDF downloaded.', 'ok');
  } catch (err) {
    console.error(err);
    toast(`PDF export failed: ${String(err)}`, 'err');
  }
}

async function boot(): Promise<void> {
  document.addEventListener('keydown', onKey);

  $('btn-prev')?.addEventListener('click', () => applyState(prev(state)));
  $('btn-next')?.addEventListener('click', () => applyState(next(state)));
  $('btn-overview')?.addEventListener('click', () => applyState(toggleOverview(state)));
  $('btn-presenter')?.addEventListener('click', () => applyState(togglePresenter(state)));
  $('btn-autoplay')?.addEventListener('click', () => applyState(toggleAutoplay(state)));
  $('btn-download')?.addEventListener('click', () => { void onDownload(); });

  // Initial deeplink: support #slide-N hash addressing for sharing.
  const hash = window.location.hash.match(/^#slide-(\d+)/);
  if (hash) applyState(goTo(state, Number(hash[1]) - 1));
  else render();

  // Sync hash when the slide changes so links are deep-shareable.
  const renderWithHash = (): void => {
    const num = String(state.current + 1).padStart(2, '0');
    history.replaceState(null, '', `#slide-${num}`);
  };
  const origRender = render;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__pitch_render__ = () => { origRender(); renderWithHash(); };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
  else void boot();
}

// Exposed for debugging + testing handshake (same pattern as marketplace).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__pitch__ = {
  state,
  slides: SLIDES,
  go: (i: number) => applyState(goTo(state, i)),
  next: () => applyState(next(state)),
  prev: () => applyState(prev(state)),
  export: () => exportDeck(SLIDES, { includeNotes: true }),
};
