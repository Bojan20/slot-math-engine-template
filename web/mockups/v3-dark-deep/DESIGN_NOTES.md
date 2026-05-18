# v3-dark-deep — Design Notes

## Brief

**Deep Midnight Trading Floor.** This mockup is a direct response to
Boki's three feedback points on the earlier light v2-engine variant:

1. **TOO BRIGHT** → moved to deep midnight-navy (blue-tinted black,
   `#0B1020`), warm ivory text (`#F1EBDC`), restrained amber-gold
   accent (`#E0A75E`). NOT pure black. NOT casino gold. NOT cyan.
   Atmosphere is **Bloomberg Terminal × Sentry Dark × Vercel Slate**.
2. **TOO SIMPLE** → 7-row shell (header / context strip / tabs /
   global status / 3-col workspace / bottom panel / ticker) with
   workspace tabs, IR Library left rail, live metrics right rail,
   activity log, scrolling Bloomberg ticker, command palette.
3. **HARDCODED SYMBOLS** → dropped the fixed Pebble/Tide/Lattice set.
   Pool counts are sliders (HP 1–8, MP 1–8, LP 1–8, WILD 0–3,
   SCATTER 0–2, MULT 0–4). Default 3·3·3·1·1·1 = 12 symbols.
   Auto-named HP1..HPn, MP1..MPn, etc. Inline rename. Icon picker
   from 40-glyph warm-amber library. Paytable + reel editor
   regenerate reactively on every pool / rename / icon change.

## Midnight Paleta (hex codes)

| Token              | Hex        | Role                                       |
|--------------------|------------|--------------------------------------------|
| `--bg-0`           | `#0B1020`  | deep midnight, blue-tinted (not black)     |
| `--bg-1`           | `#121A2E`  | elevated panel (left/right rails)          |
| `--bg-2`           | `#1A2440`  | secondary surface (cards, hover)           |
| `--bg-3`           | `#243054`  | tertiary (input fields, tracks)            |
| `--line`           | `#1F2A47`  | hairline divider                           |
| `--line-strong`    | `#384B7A`  | strong divider                             |
| `--text-0`         | `#F1EBDC`  | warm ivory primary text                    |
| `--text-1`         | `#B8B0A0`  | warm secondary                             |
| `--text-2`         | `#7A7461`  | warm muted (labels, sublines)              |
| `--amber`          | `#E0A75E`  | primary accent (RTP, wilds, active tabs)   |
| `--amber-soft`     | `#8C6437`  | subdued amber for hover / borders          |
| `--copper`         | `#C67D43`  | secondary accent (scatter, mid-pay tier)   |
| `--steel`          | `#7A9BC4`  | tertiary accent (low-pay, info state)      |
| `--moss`           | `#7DA67D`  | pass state, compliance OK                  |
| `--rust`           | `#B85C5C`  | alert, regulator FAIL                      |
| `--ink`            | `#1A1410`  | dark ink for chip text ON amber background |

No `#FFD700` cliché gold. All accents are **burnished** (lower
saturation, slight desaturation) — financial command center feel.

## Density patterns added (response to "too simple")

### 7-row shell
1. **Header** (38px) — brand + workspace tabs + persona + ⌘K
2. **Context strip** (30px) — IR, build state, topology, seed, save
3. **Tabs** (40px) — 6 panels + layout / snap / density pills
4. **Global status** (28px) — RTP/σ/Hit/MaxWin/Vola/Drift/Recompute
5. **Workspace** (flex) — 3-column: IR Library / panels / metrics
6. **Bottom panel** (28px) — MC progress + CI gates + activity log
7. **Ticker** (26px) — Bloomberg-style scrolling engine metrics

### 3-column workspace
- **LEFT (240px)** — IR Library Browser (workspace / IR / L&W /
  recent / pinned), search box, collapsible folders with leaf
  taps; click loads into context strip + emits activity log.
- **CENTER** — 6-tab panel stack.
- **RIGHT (280px)** — Live Metrics Rail (always visible):
  big RTP value + SVG semi-circle gauge (sweeps with RTP),
  5-axis volatility radar (σ, P99, skew, hit, kurt), copper
  hit-frequency strip-chart (last 64 spins), symbol contribution
  bars (top 7), confidence CI95 numbers, Producer KPI strip.

### Bottom panel
3 blocks: **MC progress** (live bar, IDLE / RUNNING / COMPLETE),
**CI gates** (106/106 ✓, last green timestamp), **activity log**
(prepended events — `ir.load`, `mc.run`, `pool.HP 3→4`, etc).

### Bloomberg ticker
Continuous-scroll bottom strip (70s loop), pulse dot at start and
end, segments for: SOLVERS, SPECS, CI GATES, P-IDs, L&W M-GAPS,
JURISDICTIONS, RNG BACKENDS, last WAVE, BUILD ERRORS, MC state,
STORAGE, DRIFT, RECOMPUTE. Drift segment uses copper to indicate
"watch this number".

### Inline mini-metrics on reel cells
Each reel-cell shows the symbol's probability mass percentage in
the bottom-right corner (`pmf` micro-label, 8px monospace).

### Per-input density
Tooltips on every section header (`sub` line), 12-col snap rule
pills in the context-tools strip, KV-row density on every panel.

## Dynamic Symbol Logic

### Pool configurator → symbol generation chain
```
[Pool sliders] → state.pool = { HP, MP, LP, WILD, SCATTER, MULT }
       ↓ regenerateSymbols() preserves any existing renames/icons
[state.symbols array] = [
  { id: "HP1", tier: "HP", name: "Sapphire", icon: "crystal", x3,x4,x5, weight }
  { id: "HP2", tier: "HP", name: "Ruby",     icon: "diamond", ... }
  ... up to state.pool.HP entries
  ... then MP1..MPn, LP1..LPn, WILD, SCATTER, MULT
]
       ↓ each render is reactive
[Symbol Table] · [Reel Editor cells] · [Right rail contribution]
```

### Default names + icons (cycled when pool > 1)
- HP: Sapphire/Ruby/Emerald/Topaz/Onyx/Pearl/Garnet/Opal · crystal/diamond/star6/sigil/rune/prism/shard/lattice
- MP: Crown/Compass/Coin/Cog/Orbit/Cipher/Vortex/Lyre · hexagon/star5/octagon/compass/gear/orbit/cipher/vortex
- LP: Sphere/Block/Spire/Arc/Bolt/Wave/Drop/Knot · circle/square/triangle/chevron/arrow/wave/drop/knot
- WILD: amber `wild` glyph · star burst
- SCATTER: copper `scatter` glyph · dashed concentric circles
- MULT: moss `mult` glyph · crossed circle

### Per-symbol controls
- **Rename** inline text input (live as you type)
- **Icon** click opens picker modal with 40 SVG glyphs across
  4 categories (geometric · abstract · symbolic · special)
- **Weight** range slider 1–40 (per-reel mass)
- **x3/x4/x5 payouts** numeric inputs (disabled for WILD / MULT)
- **⋯ menu** placeholder for duplicate/delete/move-tier

### Tier-coded colors
- HP background uses `--amber-glow` + `--amber-soft` border
- MP background uses `--copper-glow` + `--copper` border
- LP background uses `--steel-glow` + `--steel` border
- WILD uses bold amber border
- SCATTER uses bold copper border
- MULT uses moss

## NEW: Workspace switcher (top bar)

Three pre-seeded workspaces (`Lava Falls`, `Pearl Dive`, `Solar
Path`) plus `[+ New workspace]` button. Each workspace owns its own
`state` snapshot (pool, symbols, reels, weights, RTP/σ/hit/maxWin),
preserved across switches. Active workspace shows amber underline
and amber dot, others show muted grey dot. New workspace creates
`wsD/wsE/...` with default symbol pool.

## NEW: IR Library Browser (left sidebar)

8 sections, ~30 leaves total:
1. Workspaces — clickable mirror of top-bar workspaces
2. IR Library · 5×3 — 4 IRs (20 lines / 50 lines / 243 ways / hold)
3. IR Library · 6×4 + Megaways — 3 IRs
4. IR Library · 7×7 cluster — 3 IRs
5. IR Library · Cascade — 2 IRs
6. IR Library · Hold & Win — 2 IRs
7. IR Library · Free Spins — 2 IRs
8. L&W Templates — 8 of 16 M-gaps (M1, M2, M3, M4, M5, M6, M13, M16)
9. Recent Files — 3 last-touched IRs
10. Pinned ★ — 2 starred

L&W templates carry a `L&W` tag pill (amber). Click any leaf →
emits `ir.load <name>` event → updates `#ctx-ir` and prepends to
activity log.

## NEW: Bloomberg-style ticker

Bottom-bottom strip, 26px high, `#08101E` background with amber-
soft top border. Continuous CSS keyframe scroll (`translateX(0
→ −50%)` over 70 seconds; content is duplicated for seamless
loop). 15 segments, dot-separated, with bold amber values for
numbers and copper for the drift "watch" segment. Disabled by
`prefers-reduced-motion`.

## NEW: Command Palette (⌘K)

Linear/Vercel-style overlay. 28 commands across 7 categories:
- **nav** (6) — open Build/Compose/Catalog/Play/Sensitivity/Certify
- **ws** (4) — switch / new workspace
- **persona** (3) — Math / Design / Producer
- **mc** (4) — Run MC 100K / 1M / 10M / 1B
- **sym** (4) — add/remove HP, add WILD, reset pool
- **ir** (5) — load IR files / L&W templates
- **export** (2) — operator-package.zip / save IR
- **util** (2) — reset metrics / toggle palette

Keyboard: ↑↓ to navigate, ↵ to run, Esc to close, ⌘K to toggle.
Live filter as you type, focus row highlights amber.

## NEW: Icon Picker modal

Triggered by clicking the icon cell in Symbol Table. 40 SVG glyphs
in 4 categories (geometric 10 · abstract 12 · symbolic 14 · special 4).
On click, the symbol's `icon` field is reassigned and table + reels
re-render. All icons are warm-amber stroke 1.8px on transparent bg,
`viewBox 0 0 64 64`.

## 6 tabs preserved

01 BUILD, 02 COMPOSE (node graph), 03 CATALOG (97 P-IDs + 16 L&W
chips), 04 PLAY (5×3 reel + replay + Merkle), 05 SENSITIVITY
(heatmap + curve + A/B compare), 06 CERTIFY (MC + PAR sheet + 15
juris + RNG audit + Merkle commit).

## Persona switcher

`Math` (default, all formulae visible) · `Design` (icon picker
backgrounds tint amber, icons scale +15%) · `Producer` (extra KPI
strip in right metrics rail: $40K cost saved / 3w time saved /
0% reject rate). Symbol table also tints name fields amber under
Producer persona.

## What was deliberately NOT done

- No external framework, no CDN, no font load — file:// offline.
- No real Markov solver compute (synthetic but reactive).
- No real MC compute (progress bar + CI tightening).
- No casino imagery, no `#FFD700` gold, no neon, no red/black.
- No emoji.
- No 6×8 hard-coded paytable — fully reactive to pool sliders.

## File inventory

- `index.html` ~70KB · 7-row shell, 40-glyph SVG sprite, 6 tab
  panels, command palette + icon picker modals, ticker, bottom
  panel.
- `styles.css` ~40KB · midnight design system, all components.
- `app.js` ~30KB · workspace state, dynamic symbol pipeline, MC
  simulation, command palette, icon picker, activity log,
  catalog filter, sensitivity heatmap, PAR sections.
- `data/catalog-97.json` (copy from v2-engine)
- `data/lw-16.json` (copy from v2-engine)
- `data/symbol-lib.json` — 40 icon metadata
- `data/ir-library.json` — IR Library tree
- `symbols/lib/*.svg` — 40 warm-amber stroke glyphs
