import type { Theme } from '../theme-engine.js';

export const underwater: Theme = {
  id: 'underwater',
  displayName: 'Underwater',
  description: 'Atlantis pearl + coral. Aquamarine + iridescent shimmer.',
  palette: {
    primary: '#22d3ee',
    accent: '#00b4d8',
    deep: '#001a33',
    highlight: '#f8f4e3',
    warn: '#ffb703',
    err: '#e63946',
  },
  typography: {
    display: 'Cormorant Garamond, serif',
    body: 'Inter, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'underwater',
  audio_pack: 'ocean-deep',
  animation_style: 'pearl-shimmer',
  cabinet_wrapper: 'coral-ring',
};
