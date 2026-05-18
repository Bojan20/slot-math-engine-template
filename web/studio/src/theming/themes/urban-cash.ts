import type { Theme } from '../theme-engine.js';

export const urbanCash: Theme = {
  id: 'urban-cash',
  displayName: 'Urban Cash',
  description: 'Neon street grit. Cash green + concrete + graffiti pink.',
  palette: {
    primary: '#22d3ee',
    accent: '#22c55e',
    deep: '#0c0c0e',
    highlight: '#ff2d95',
    warn: '#fbbf24',
    err: '#ef4444',
  },
  typography: {
    display: 'Bungee, cursive',
    body: 'Inter, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'urban-cash',
  audio_pack: 'hip-hop-bass',
  animation_style: 'neon-flicker',
  cabinet_wrapper: 'graffiti-frame',
};
