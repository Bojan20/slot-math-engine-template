import type { Theme } from '../theme-engine.js';

export const asianDragon: Theme = {
  id: 'asian-dragon',
  displayName: 'Asian Dragon',
  description: 'Imperial crimson + gold lacquer. Koi, dragons, lanterns.',
  palette: {
    primary: '#22d3ee',
    accent: '#ffd700',
    deep: '#1a0006',
    highlight: '#fff8dc',
    warn: '#ff8c00',
    err: '#dc143c',
  },
  typography: {
    display: 'Cinzel, serif',
    body: 'Inter, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'asian-dragon',
  audio_pack: 'asian-temple',
  animation_style: 'crimson-burst',
  cabinet_wrapper: 'lacquered-bezel',
};
