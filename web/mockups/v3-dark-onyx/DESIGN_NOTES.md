# v3-dark-onyx — Design Notes

## Brief
v3-dark-onyx is the **dark engineering-tool** rebuild of v2-engine after
Boki rejected the lighter "previously too-simple" iteration. Reference
feel: **Datadog APM × Linear dark × Grafana × Vercel dashboard dark**.
Onyx baseline (not pure black, 5–8% gray), elektroliz-cyan signal accent,
hairline borders, dense triple-column engineering layouts. Every cm² carries
information.

## Dark palette (locked, all values hex)

### Surfaces
- `--bg-0` `#0A0D11` — onyx, root canvas
- `--bg-1` `#11151B` — elevated panel
- `--bg-2` `#171C24` — secondary surface, hover state
- `--bg-3` `#1F252F` — tertiary, modal / inspector cards
- `--bg-4` `#262D38` — interactive raised

### Lines
- `--line` `#252B36` — primary hairline (1px everywhere)
- `--line-soft` `#1A2028` — micro-divider between table rows
- `--line-strong` `#3B4452` — emphasized rule, focused border

### Text
- `--text-0` `#E8ECF1` — primary
- `--text-1` `#9BA3AF` — secondary
- `--text-2` `#5C6470` — muted / labels / micro-caps headers
- `--text-3` `#3F4651` — placeholder, ghost numeric

### Accents
- `--cyan` `#22D3EE` — signal: RTP, wilds, live indicators, active
- `--cyan-soft` `#0E7490` — subdued cyan, hover, secondary action
- `--amber` `#F59E0B` — warnings, scatter-tier emphasis, drift positive
- `--violet` `#A78BFA` — special features, bonus mode, L&W M-badge
- `--rose` `#FB7185` — alerts, negative delta, regulator FAIL, scatter symbol
- `--green` `#34D399` — pass state, compliance OK, save state

## Density patterns added (vs v2-engine)

1. **Triple-column main-row** — left sidebar (232px) + main panels +
   right telemetry strip (296px). Never empty.
2. **Workspace tabs** (30px row below topbar) — multi-IR open, dirty-dot
   indicator, commit pin shown on each tab, close button + add tab.
3. **Breadcrumb toolbar** — portfolio / L&W / M6 · Cash Wheel.
4. **Notification strip** below each panel head — live recompute, CI
   gate status, drift, MC queue, wave pin, catalog version.
5. **Activity log panel** (left sidebar) — timestamped log: "10:42 RTP
   recomputed 95.42 → 95.45", "10:40 imported IR", etc. Live-appends.
6. **Sparklines everywhere** — par-headline trend, engine telemetry
   solver-count, CI gates 7d, L&W coverage growth, session RTP. All
   1-px stroke Datadog-style.
7. **Inline diff overlays** — `↗ +0.03` (green) / `↘ -0.05` (rose) shown
   inline beside RTP and in the diff card.
8. **4-segment statusbar** — `engine|specs|solvers / CI|P-IDs|L&W|juris /
   MC|recompute|drift|cat / palette|save|open|user`.
9. **Telemetry sidebar** (right, toggleable) — 6 sections (Engine,
   CI gates, Workspace, Active jobs, L&W coverage, Health) with live
   pulse dots and sparklines per section.
10. **Engineering toolbar** — undo/redo + saved-Xs-ago + who-touched-last.
11. **Micro-typography** — 9.5–11px micro-labels in JetBrains Mono with
    0.14em tracking and uppercase. Mono everywhere for numerals.

## Dynamic symbol logic (replaces hardcoded 11)

### Tier configurator (BUILD tab, top-left column)
Six sliders, each with min/max range:

```
HP (high pay)   range 1–8   default 3
MP (mid pay)    range 1–8   default 3
LP (low pay)    range 1–8   default 3
Wild            range 0–3   default 1
Scatter         range 0–2   default 1
Mult/Bonus      range 0–4   default 1
TOTAL           reactive    default 12
```

### Auto-naming protocol
On any tier-count change, `buildSymbolPool()` re-runs:
- 3 HP → `HP1`, `HP2`, `HP3`
- 3 MP → `MP1`, `MP2`, `MP3`
- 3 LP → `LP1`, `LP2`, `LP3`
- 1 Wild → `WILD1`
- 1 Scatter → `SCATTER1`
- 1 Mult → `MULT1`

If user has already manually renamed a slot, the rebuild **preserves the
custom name and icon** by matching tier+slot index. Only new slots get
auto-name + first-unused-icon assignment.

### Per-symbol table (BUILD center)
Five-column table: `TIER | ID | NAME | ICON | WEIGHT`. Each row is fully
editable inline:
- **Tier** — colour-coded pill (HP cyan, MP amber, LP muted, Wild violet,
  Scatter rose, Mult green).
- **ID** — `<input class="sym-id">`. Click to rename.
- **Name** — `<input class="sym-name">` (displayed in paytable).
- **Icon** — button opens picker modal showing all 36 lib icons.
- **Weight** — range slider 5–50, live updates per-reel weight.

### Icon library (36 placeholder SVGs)
`symbols/lib/` contains 36 stroke-only SVGs at `viewBox 0 0 64 64`,
1.75-stroke-width:
- **Geometric (13)**: triangle, square, pentagon, hexagon, octagon,
  circle, diamond, star5/6/7, arrow, chevron, arc
- **Abstract (10)**: spiral, wave, knot, lattice, prism, shard, crystal,
  vortex, sonar, meridian
- **Symbolic (13)**: pebble, obelisk, keystone, anchor, key, gear, flame,
  leaf, drop, mountain, sun, moon, eye

Each is also inlined as `<symbol id="g-{icon}">` in the HTML sprite at
the top of `index.html`, so reel cells / paytable / contribution chart
all reference `#g-{icon}` and inherit `currentColor` for tier tinting.

Picker modal supports category filter tabs and shows used icons with an
amber border so the user can avoid duplicates. "+ Upload custom SVG"
button is a placeholder.

### Paytable adapts
Paytable rebuilds on every pool change: HP rows = `state.tierCounts.HP`,
MP rows = `state.tierCounts.MP`, etc. Wild/Mult rows hidden (no pay). Each
row carries a tier-coloured pill plus the symbol's current icon + name.

## Command palette structure (⌘K / Ctrl+K)

Opened via topbar Search button, ⌘K, or Ctrl+K. Live filters as you type.

Categories (30 commands total):
- **Navigation (6)** — Open Build / Compose / Catalog / Play / Sensitivity / Certify
- **Actions (7)** — Recompute RTP, Run MC 100K/1M/1B, Export IR, Download op-pkg, Save
- **Persona (3)** — Switch to Math / Design / Producer
- **L&W gaps (8)** — M1 Dragon Spin … M16 Stellar Jackpots, jumps to catalog detail
- **Settings (4)** — Toggle telemetry/sidebar, theme placeholder, shortcuts placeholder

Keyboard:
- ↑↓ navigate (live highlight)
- ↵ execute
- Esc / click backdrop close

Each item shows: `›` glyph + title + dim mono description + right-aligned
kbd hint (`⌘R`, `⌘S`, `⌘E`, `⌘\`, etc.).

## Telemetry sidebar (right, 296px, toggleable)

Six stacked sections, each with `tel-h` header + content:

1. **Engine** — pulse dot + `77 / 77 solvers active` headline + 7d
   sparkline (cyan).
2. **CI gates** — `total 106/106`, `last 7d 100%`, `drift −0.58 pp` +
   sparkline (green).
3. **Workspace** — git branch (main), commit (#bf9b1be), wave (W196 ·
   14m ago), modified files (23 amber), staged (12).
4. **Active jobs** — MC idle, vitest watch PASS, cargo clippy PASS,
   portfolio audit idle. 2 of 8 slots.
5. **L&W coverage** — `M1–M16 100%`, P-IDs 97, last gap M6 · W196 +
   sparkline (violet).
6. **Health** — cpu 18%, mem 412 MB, recompute 1.4 ms, rng entropy 0.9992.

## NEW vs v2-engine — additions list

- **Dark theme** (full palette swap, no gold/red/casino accents)
- **Tier configurator** — 6 sliders, fully reactive
- **Dynamic symbol pool** — auto-named HP1/MP1/LP1, per-symbol rename
- **Icon library** with 36 placeholder SVGs + metadata JSON
- **Symbol icon picker modal** with category tabs + used-icon hint
- **Auto-icon assignment** when adding new tier slots
- **Command palette** (⌘K) with 30 commands across 5 categories
- **Left workspace sidebar** — pinned, recents (15 entries), filter chips,
  activity log
- **Right telemetry sidebar** — 6 live sections + 4 sparklines
- **Workspace tabs row** — multi-IR with dirty dots and commit pins
- **Toolbar** — breadcrumb + undo/redo + save state + last-touched
- **Notification strip** per panel
- **Inline diff arrows** (`↗ +0.03` / `↘ -0.05`) on RTP card and diff card
- **Sparkline charts** in PAR headline, telemetry, session RTP
- **4-segment statusbar** with kbd hints
- **Per-tier colour coding** (cyan/amber/muted/violet/rose/green)
- **Symbol table** replaces drag-palette as primary UX
- **Adaptive paytable** — row count follows tier counts
- **Tab transitions** retain Corti DNA: skip-link, ARIA tablist,
  ArrowLeft/Right cycle, focus-visible rings, `prefers-reduced-motion`

## Inheritance retained from v2

- 6-tab structure (BUILD / COMPOSE / CATALOG / PLAY / SENSITIVITY / CERTIFY)
- 3-persona switcher (Math / Design / Producer) with `[data-persona-only]`
- 97 P-IDs catalog (generated client-side, sample in `data/catalog-97.json`)
- 16 L&W M-gaps strip (`data/lw-16.json`)
- 15 jurisdictions with full rule overlays
- 5 RNG backends with UK badge on ChaCha20
- 12 PAR sections, expandable
- ARIA tablist + skip-link from KIMI a11y
- Tabular numerals, JetBrains Mono for all numerics

## What was deliberately NOT done

- No external CDN, no web font fetch — works file:// offline.
- No live drag-drop reel composition (the symbol table is the BUILD UX now).
- No real MC compute — deterministic progress bar + CI tightening curve.
- No casino chrome, no neon glow, no gold/red. Onyx + cyan only.
- No skeuomorphic 3D reels.
- No emoji anywhere in UI.
- No console errors expected on load.

## File inventory

```
v3-dark-onyx/
├── index.html              (~50 KB, 6 panels + 2 sidebars + 2 overlays)
├── styles.css              (~55 KB, full dark design system)
├── app.js                  (~30 KB, dynamic-symbol + ⌘K + telemetry)
├── DESIGN_NOTES.md         (this file)
├── data/
│   ├── catalog-97.json     (copy of v2-engine)
│   ├── lw-16.json          (copy of v2-engine)
│   └── symbol-lib.json     (36-entry library metadata)
└── symbols/lib/            (36 stroke-only SVG placeholders)
    ├── triangle.svg  square.svg  pentagon.svg  hexagon.svg  octagon.svg
    ├── circle.svg    diamond.svg star5.svg     star6.svg    star7.svg
    ├── arrow.svg     chevron.svg arc.svg
    ├── spiral.svg    wave.svg    knot.svg      lattice.svg  prism.svg
    ├── shard.svg     crystal.svg vortex.svg    sonar.svg    meridian.svg
    └── pebble.svg    obelisk.svg keystone.svg  anchor.svg   key.svg
        gear.svg      flame.svg   leaf.svg      drop.svg     mountain.svg
        sun.svg       moon.svg    eye.svg
```

The mockup is **dense by intent**: every region answers "what does this
engine do today?" with quantitative evidence, regulator-grade hashes, and
live telemetry — not aspirational copy.
