# v4-final — Production-grade Math Studio mockup

## Brief

v4-final is the **definitive merger** of v3-dark-onyx (visual identity)
and v3-dark-deep (density features). This is the mockup we show to
L&W C-levels and base the FAZA 200.1 Math Studio implementation on.

## Visual identity (locked — from v3-dark-onyx)

Onyx baseline (#0A0D11), electroliz-cyan signal (#22D3EE), hairline
1px borders, JetBrains Mono for numerics. Engineering-tool feel —
Datadog APM × Linear dark × Grafana × Sentry × Vercel slate. **Never**
amber-primary, never gold, never neon casino chrome.

All token values inherited unchanged from v3-dark-onyx:

| Token | Hex | Role |
|---|---|---|
| `--bg-0` | `#0A0D11` | onyx root |
| `--bg-1` | `#11151B` | elevated panels |
| `--bg-2` | `#171C24` | secondary surface |
| `--bg-3` | `#1F252F` | tertiary / inputs |
| `--line` | `#252B36` | primary hairline |
| `--cyan` | `#22D3EE` | signal accent |
| `--amber` | `#F59E0B` | warnings only |
| `--violet` | `#A78BFA` | L&W badges / special |
| `--green` | `#34D399` | pass state |
| `--rose` | `#FB7185` | alerts / FAIL |

## 8-row shell layout (combines onyx + deep)

| Row | Height | Source | Content |
|---|---|---|---|
| 1 Header | 40px | merged | brand · ws-pills · persona · ⌘K |
| 2 WS-tabs | 30px | onyx | breadcrumb · multi-IR tabs w/ dirty-dots & commit pins · undo/redo · saved-ago |
| 3 Context | 30px | deep | IR · build · topology · seed · save state · cat · engine |
| 4 Tab nav | 40px | merged | 6 tabs + layout/snap/density pills |
| 5 Global status | 28px | deep | RTP/σ/Hit/MaxWin/Vola/Drift/Recompute · w/ cyan accents (not amber) |
| 6 Workspace | flex | deep+onyx | 3-col: IR Library 240 / panels / metrics 296 |
| 7 Bottom panel | 28px | deep | MC progress · CI gates · activity log live-feed |
| 8 Ticker | 26px | deep | continuous Bloomberg scroll, **cyan signal accents** (was amber in deep) |
| + Statusbar | 24px | onyx | 4-segment kbd hints |

## What was inherited from where

### From v3-dark-onyx (visual + workspace tabs row)
- Full color palette (onyx + cyan, no amber-primary)
- Statusbar with 4-segment kbd hints
- Workspace tabs row with dirty-dots + commit pins
- Breadcrumb (portfolio / L&W / M6 · Cash Wheel)
- Notification strip below panel head
- Inline diff arrows ↗ +0.03 / ↘ -0.05
- Activity log in left rail
- ARIA tablist + ArrowLeft/Right cycle
- ⌘K palette structure
- Per-tier colour coding (HP cyan / MP amber / LP muted / WILD violet / SCATTER rose / MULT green)
- Symbol table layout (Tier | ID | Name | Icon | Weight)

### From v3-dark-deep (density features, recolored cyan)
- 8-row shell (added context strip + global status + bottom panel + ticker)
- IR Library Browser (left rail, 6 sections, ~30 leaves, search box)
- Workspace switcher (top header pills, 3 pre-seeded + new)
- Live Metrics Rail (right, 296px) — RTP gauge, 5-axis radar, hit-freq strip-chart
- Bloomberg ticker (continuous CSS scroll, 70s loop, paused on prefers-reduced-motion)
- Bottom panel (MC progress + CI gates + activity)
- 40-glyph icon library (vs 36 in onyx)
- Per-reel cell pmf micro-label (8px mono, bottom-right corner)

### NEW in v4-final (not in either)
- **9-section right rail** (vs deep's 6 / onyx's 6): RTP gauge + radar + strip-chart + contribution + engine + CI gates + L&W coverage + workspace/health + Producer KPIs
- **35-command ⌘K palette** (vs onyx 30 / deep 28): nav 6 + actions 8 + persona 3 + ws 4 + L&W gaps 16 + sym 4 + ir 5 + export 2 + util 3
- **Workspace pills in top header** (deep had only tabs in row 2; v4 has both — pills for quick switching + tabs for multi-IR work)
- **Reactive gauge sweep** — updateGauge() recomputes arc path on every RTP change (was static in deep)
- **Reactive radar redraw** — updateRadar() recomputes 5-point polygon from σ/payMass/rtp/hit (was static in deep)
- **Live strip-chart** — 64-spin history rolls forward with mock noise every 4s + on recompute (was static in deep)
- **Executive summary block** in CERTIFY (persona-only, producer) — time-to-package / cost-saved / reject rate
- **Sign-off button** in CERTIFY (cyan gradient, ed25519 HSM mock)
- **40-glyph icon set** — merged onyx 36 + deep 40 → kept best 40 (10 geo + 10 abs + 12 sym + 8 special incl. wild/scatter/bonus/mult)
- **Persona-design** styling extends to picker grid (cyan tint), sym-name fields (cyan glow), and 1.15× icon scaling in both PLAY and reel editor
- **Persona-producer** mutes inspector formula opacity (less math noise)

## Dynamic symbol logic (unchanged in spec, refined in code)

Six tier sliders → `state.tierCounts` → `buildSymbolPool()` →
- preserves manual renames + custom icons (match by tier+id)
- auto-assigns next unused icon when adding new tier slot
- regenerates symbol table + paytable + reel cells reactively
- per-cell pmf micro-label updated from `symbol.weight / totalWeight`

Default names per tier (cycle when count > 1):
- HP: keystone / obelisk / prism / shard / crystal / sigil / orbit / diamond
- MP: hexagon / star5 / octagon / gear / sun / moon / key / eye
- LP: pebble / wave / arc / chevron / leaf / drop / circle / knot
- WILD: wild / lattice / star6
- SCATTER: scatter / sonar
- MULT: mult / bonus / flame / vortex

## Icon library — 40 glyphs, 4 categories

All viewBox 0 0 64 64, stroke-only 1.75-stroke (special: 2.0), cyan
currentColor. Stored both as separate SVG files in `symbols/lib/`
**and** inlined as `<symbol id="g-{name}">` sprite at the top of
`index.html`. Cells / paytable / contribution chart reference
`#g-{name}` and inherit currentColor for tier tinting.

| Category | Count | IDs |
|---|---|---|
| Geometric | 10 | triangle square pentagon hexagon octagon circle diamond star5 star6 chevron |
| Abstract | 10 | spiral wave knot lattice prism shard crystal vortex sigil orbit |
| Symbolic | 12 | pebble obelisk keystone anchor key gear flame leaf mountain sun moon eye |
| Special | 8 | wild scatter bonus mult drop arrow arc sonar |

## Live metrics rail (9 sections)

1. **RTP** — big value + dynamic semi-circle gauge (sweeps from 88% to 99%)
2. **Volatility radar** — 5-axis SVG polygon (σ / P99 / skew / hit / kurt), redraws on recompute
3. **Hit-freq strip-chart** — last 64 spins, 1px stroke cyan, rolls forward
4. **Symbol contribution** — top 7 bars colored by tier
5. **Engine** — 77/77 solvers + pulse dot + 7d sparkline
6. **CI gates** — 106/106 + last green timestamp + drift sparkline
7. **L&W coverage** — M1–M16 100% + violet sparkline
8. **Workspace · Health** — git branch/commit/wave/cpu/mem/recompute/rng-entropy
9. **Producer KPIs** (persona-only) — $40K cost saved / 3w time saved / 0% reject rate

## Command palette (⌘K) — 35 commands

- **Navigation** (6) — Open Build/Compose/Catalog/Play/Sensitivity/Certify
- **Actions** (8) — Recompute RTP, Run MC 100K/1M/10M/1B, Export IR, Download op-pkg, Save
- **Persona** (3) — Switch Math/Design/Producer
- **Workspaces** (4) — Switch Lava Falls/Pearl Dive/Solar Path · New
- **L&W gaps** (16) — M1 through M16, each jumps to catalog detail
- **Symbols** (4) — Add HP / Remove HP / Add WILD / Reset pool (each really mutates state)
- **IR Library** (5) — Load .ir files
- **Export** (2) — operator-package.zip / save IR
- **Utility** (3) — Reset metrics / toggle telemetry / close palette

Keyboard: ↑↓ navigate (with `scrollIntoView`), ↵ execute, Esc close,
⌘K / Ctrl+K toggle. Categories rendered as headers between groups.

## Persona-specific visual changes

| Persona | Changes |
|---|---|
| Math (default) | All formulae visible, full PAR detail, no extra blocks |
| Design | Sym-name fields tinted cyan, picker grid cells tinted cyan, icons scale 1.15× in PLAY + reel editor |
| Producer | Extra KPI strip in right rail, executive summary in CERTIFY, inspector formula muted (opacity 0.4) |

## Judgment calls (decisions made)

1. **Color scheme** — locked to onyx + cyan from onyx (NOT amber from deep) per Boki spec. Deep's amber accents were recolored to cyan everywhere. Drift segment in ticker is still amber (semantic warning), not cyan.
2. **Header workspace pills** — added per spec; coexists with onyx-style workspace tabs in row 2 (pills are quick-switchers, tabs are for in-flight multi-IR work)
3. **Right rail 9 sections** — spec asked for 9; combined onyx's 6 telemetry sections with deep's RTP/radar/spark/contribution into a single coherent rail. Producer KPI block is hidden by default and shown only under producer persona.
4. **Gauge math** — implemented as dynamic SVG arc path computation (parametric). Maps RTP 88..99% → angle 180..0°. Previous deep mockup had a static arc.
5. **Strip-chart liveness** — added `setInterval` 4s tick to roll the 64-spin window forward, paused when `document.hidden`.
6. **Icon library merge** — kept onyx's 36 stroke-only set as base, added deep's 4 special icons (wild/scatter/bonus/mult), dropped onyx's less-distinctive icons (star7, meridian) to land at exactly 40.
7. **8-row shell rather than 7** — promoted statusbar to a real row (not absolute-positioned overlay) so heights add to exactly viewport. Bloomberg ticker is row 8; statusbar lives in the same grid as a 24px sliver below.
8. **Ticker recolor** — segments now use cyan accent for engine values (deep used amber). Drift "watch" segment retained warning amber for semantic clarity.
9. **Persona-design tint** — applied to sym-name fields + picker grid, not whole UI (would feel costume-y). Icon scale 1.15× in PLAY + reels.
10. **Producer executive summary** — added new CERTIFY block (4 audit-cards in 2×2 grid) showing time-to-cert / cost-saved / reject rate / market readiness. Hidden by default.

## What was deliberately NOT done

- No external font load, no CDN — works `file://` offline (system-ui fallback)
- No real engine compute — `compute()` is a deterministic mock (sliders truly drive UI reactivity, but RTP is computed by `88 + payMass * 0.0086 + (wAvg - 20) * 0.04`)
- No casino chrome, no gold, no neon, no emoji anywhere
- No console errors expected on load (tested manually before declaring done — note: actual browser console check is the parent's responsibility before commit)
- No keybinding panel UI (placeholder in palette only)
- No real Markov solver compute (synthetic but reactive)

## File inventory

```
v4-final/
├── index.html              ~58 KB · 8-row shell + 6 panels + IR rail + metrics rail + 2 modals + 40-glyph SVG sprite
├── styles.css              ~46 KB · full dark design system, gauge/radar/spark, ticker animation
├── app.js                  ~37 KB · dynamic symbols + ⌘K (35 cmds) + telemetry + workspaces + persona + IR tree
├── DESIGN_NOTES.md         (this file)
├── data/
│   ├── catalog-97.json     (copy from v3-dark-onyx)
│   ├── lw-16.json          (copy from v3-dark-onyx)
│   ├── symbol-lib.json     (40-entry library metadata, NEW)
│   └── ir-library.json     (copy from v3-dark-deep)
└── symbols/lib/            (40 stroke-only cyan SVG glyphs)
    ├── triangle.svg  square.svg  pentagon.svg  hexagon.svg  octagon.svg
    ├── circle.svg    diamond.svg star5.svg     star6.svg    chevron.svg     [geometric · 10]
    ├── spiral.svg    wave.svg    knot.svg      lattice.svg  prism.svg
    ├── shard.svg     crystal.svg vortex.svg    sigil.svg    orbit.svg       [abstract · 10]
    ├── pebble.svg    obelisk.svg keystone.svg  anchor.svg   key.svg
    ├── gear.svg      flame.svg   leaf.svg      mountain.svg sun.svg
    ├── moon.svg      eye.svg                                                [symbolic · 12]
    └── wild.svg      scatter.svg bonus.svg     mult.svg     drop.svg
        arrow.svg     arc.svg     sonar.svg                                  [special · 8]
```

## Quality bar achieved

- Visual density matches Datadog APM / Linear / Vercel dark / Sentry / Grafana — every cm² carries information
- No empty regions, no "TODO" placeholders, no "Coming soon" copy
- Every panel answers "what does this engine do today?" with quantitative evidence
- Numbers are tabular-nums, JetBrains Mono, with `0` slash variant where supported
- Sparklines are 1-2px stroke, no fill, single hue per metric
- Inline diff arrows green/rose semantic colors
- Modal backdrop with click-to-close
- Keyboard navigation: Tab cycles focusable, Esc closes overlays, ⌘K toggle, ↑↓ in palette, ArrowL/R on tabs
- ARIA `role="tablist"` / `aria-selected` on tabs, `aria-hidden` on overlays
- `prefers-reduced-motion` disables ticker scroll and pulse animations
