# Theming Engine

W209 — White-label theming for the slot-math-studio.

A theme bundles **palette + typography + symbol pack + audio pack +
animation style + cabinet wrapper** into one descriptor. Applying a
theme mutates studio state and pushes new CSS variables onto the root
element, so every render layer (UI chrome, paytable preview, win
animations) picks up the new brand without a code change.

## Theme shape

```ts
interface Theme {
  id: ThemeId;
  displayName: string;
  description: string;
  palette: {
    primary: '#22d3ee';     // cyan v5 anchor — NEVER overridden
    accent: string;          // theme color (gold / pearl / plasma)
    deep: string;            // background gradient stop
    highlight: string;       // win flash / glow
    warn: string;
    err: string;
  };
  typography: { display, body, numeric };
  symbol_pack: string;       // selects icon set
  audio_pack: string;        // selects SFX library
  animation_style: AnimationStyle;
  cabinet_wrapper: CabinetWrapper;
}
```

## 8 default themes

| Id              | Accent    | Symbol pack       | Audio pack         | Cabinet         |
| --------------- | --------- | ----------------- | ------------------ | --------------- |
| `asian-dragon`  | `#ffd700` | asian-dragon      | asian-temple       | lacquered-bezel |
| `underwater`    | `#00b4d8` | underwater        | ocean-deep         | coral-ring      |
| `sci-fi`        | `#ff8c42` | sci-fi            | synth-future       | chrome-hex      |
| `mythological`  | `#ff4500` | mythological      | orchestra-epic     | stone-arch      |
| `royal`         | `#9b59b6` | royal             | regal-fanfare      | royal-velvet    |
| `space`         | `#7c3aed` | space             | synthwave-arcade   | starship-hull   |
| `fairy-tale`    | `#ec4899` | fairy-tale        | enchanted-glade    | enchanted-vine  |
| `urban-cash`    | `#22c55e` | urban-cash        | hip-hop-bass       | graffiti-frame  |

The `primary` token in every palette is locked to `#22d3ee` (cyan v5)
on purpose: it keeps studio chrome, modal headers, and brand marks
consistent across re-skins so an operator's portfolio stays coherent.

## API

```ts
import {
  applyTheme,
  getActiveTheme,
  listThemes,
  onThemeChange,
  paletteToCssVars,
  validateTheme,
  defaultThemedState,
} from '@/theming/theme-engine.js';

const state = defaultThemedState();
applyTheme('mythological', state);
// state.symbolPack === 'mythological'
// state.paletteVars['--accent'] === '#ff4500'

onThemeChange((id, theme) => {
  console.log('theme changed to', id, theme.displayName);
});
```

`applyTheme` returns the resolved `Theme` object so callers can read
display metadata. It also writes CSS variables on
`document.documentElement` for chrome-wide propagation.

## Adding a custom theme

1. Create `web/studio/src/theming/themes/my-theme.ts`:

```ts
import type { Theme } from '../theme-engine.js';

export const myTheme: Theme = {
  id: 'my-theme',
  displayName: 'My Theme',
  description: '...',
  palette: {
    primary: '#22d3ee',
    accent: '#abcdef',
    deep: '#001122',
    highlight: '#ffeeaa',
    warn: '#ffaa00',
    err: '#ee0033',
  },
  typography: { display: '...', body: '...', numeric: '...' },
  symbol_pack: 'my-pack',
  audio_pack: 'my-audio',
  animation_style: 'crimson-burst',
  cabinet_wrapper: 'lacquered-bezel',
};
```

2. Register it in `theme-engine.ts`:

```ts
import { myTheme } from './themes/my-theme.js';

export type ThemeId = ... | 'my-theme';

export const THEMES: Record<ThemeId, Theme> = {
  ...,
  'my-theme': myTheme,
};
```

3. Add an entry to `ALL_THEME_IDS` and run
   `npx vitest run tests/theme-engine.test.ts` — the registry tests
   automatically validate the new theme's shape.

## Validation

```ts
import { validateTheme } from '@/theming/theme-engine.js';

const r = validateTheme(myTheme);
// { ok: true, errors: [] }
```

The re-skin wizard calls `validateTheme` before export so a malformed
custom theme can't ship a broken IR bundle to the cabinet.
