/**
 * W211 Agent C — Demo Theater player entry barrel.
 *
 * Re-exports the surface area that tests + host pages consume. Keeping a
 * tight barrel lets us evolve internal modules without leaking change
 * across consumers.
 */

export * from './types.js';
export {
  createPlayer,
  loadTimeline,
  play,
  pause,
  togglePlay,
  setSpeed,
  setPersona,
  skipDay,
  rewindDay,
  seek,
  tick,
  filterForPersona,
  keyMetrics,
} from './state.js';
export {
  renderPlayer,
  renderProgressBar,
  renderPersonaSwitcher,
  renderControls,
  renderKeyMetrics,
  renderFeed,
  renderNarrativeBox,
} from './render.js';
export { bootPlayer } from './player.js';
