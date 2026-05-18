import type { Theme } from '../theme-engine.js';

export const sciFi: Theme = {
  id: 'sci-fi',
  displayName: 'Sci-Fi',
  description: 'Plasma orange + electric magenta on chrome.',
  palette: {
    primary: '#22d3ee',
    accent: '#ff8c42',
    deep: '#220033',
    highlight: '#ff00ff',
    warn: '#ffd60a',
    err: '#ef233c',
  },
  typography: {
    display: 'Orbitron, sans-serif',
    body: 'Rajdhani, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'sci-fi',
  audio_pack: 'synth-future',
  animation_style: 'plasma-pulse',
  cabinet_wrapper: 'chrome-hex',
};
