import type { Theme } from '../theme-engine.js';

export const royal: Theme = {
  id: 'royal',
  displayName: 'Royal',
  description: 'Purple velvet + brushed gold. Crowns, scepters, banking.',
  palette: {
    primary: '#22d3ee',
    accent: '#9b59b6',
    deep: '#180022',
    highlight: '#ffd700',
    warn: '#ffb347',
    err: '#c0392b',
  },
  typography: {
    display: 'Playfair Display, serif',
    body: 'Inter, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'royal',
  audio_pack: 'regal-fanfare',
  animation_style: 'gold-sparkle',
  cabinet_wrapper: 'royal-velvet',
};
