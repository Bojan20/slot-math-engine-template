import type { Theme } from '../theme-engine.js';

export const space: Theme = {
  id: 'space',
  displayName: 'Space',
  description: 'Deep-space violet + arcade neon. Stars, ships, comets.',
  palette: {
    primary: '#22d3ee',
    accent: '#7c3aed',
    deep: '#000511',
    highlight: '#ffd700',
    warn: '#fb7185',
    err: '#ef233c',
  },
  typography: {
    display: 'Audiowide, sans-serif',
    body: 'Inter, sans-serif',
    numeric: 'JetBrains Mono, monospace',
  },
  symbol_pack: 'space',
  audio_pack: 'synthwave-arcade',
  animation_style: 'star-warp',
  cabinet_wrapper: 'starship-hull',
};
