import type { Theme } from '../theme-engine.js';

export const mythological: Theme = {
  id: 'mythological',
  displayName: 'Mythological',
  description: 'Lava + bronze. Phoenix flame on volcanic stone.',
  palette: {
    primary: '#22d3ee',
    accent: '#ff4500',
    deep: '#1a0000',
    highlight: '#ffd700',
    warn: '#ff9500',
    err: '#cc0033',
  },
  typography: {
    display: 'Trajan Pro, serif',
    body: 'Inter, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'mythological',
  audio_pack: 'orchestra-epic',
  animation_style: 'flame-rise',
  cabinet_wrapper: 'stone-arch',
};
