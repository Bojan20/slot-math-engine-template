import type { Theme } from '../theme-engine.js';

export const fairyTale: Theme = {
  id: 'fairy-tale',
  displayName: 'Fairy Tale',
  description: 'Pastel pink + forest emerald. Enchanted vines + glittering dust.',
  palette: {
    primary: '#22d3ee',
    accent: '#ec4899',
    deep: '#0e2a1f',
    highlight: '#a7f3d0',
    warn: '#fbbf24',
    err: '#dc2626',
  },
  typography: {
    display: 'Berkshire Swash, cursive',
    body: 'Inter, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'fairy-tale',
  audio_pack: 'enchanted-glade',
  animation_style: 'sparkle-dust',
  cabinet_wrapper: 'enchanted-vine',
};
