# Slot Math Studio — CORTI mockup
## Design rationale

**Theme: "Tide & Lattice."** Engineering-grade tool for slot mathematicians, not a casino product. Reference points: Linear, Figma, Datadog — calm document surfaces, mono numerics, single signal accent.

### Palette (8 swatches)

| Role | Hex | Use |
|---|---|---|
| `--ink-900` | `#0E1116` | Primary text, primary button |
| `--ink-700` | `#2A2F38` | Secondary text, hovered surfaces |
| `--ink-500` | `#6B7280` | Muted text, labels |
| `--ink-300` | `#C7CBD2` | Borders, dividers, zero-state |
| `--paper`   | `#F5F2EC` | App background (warm bone) |
| `--paper-2` | `#ECE7DD` | Secondary surface |
| `--signal`  | `#1E8F8A` | Single accent — wilds, recompute pulse, lit cells, accent borders |
| `--warn`    | `#B8763A` | Scatter symbol + non-critical warnings |

No neon, no gold, no red/black casino contrast. Warm bone + graphite ink gives the tool the feel of an engineering notebook; the cyan-teal accent is borrowed from oscilloscope CRTs.

### Typography

- **Inter** (UI, weights 400/500/600) — system fallback to Helvetica.
- **JetBrains Mono** (numerics, IR hashes, RTP percentages, status bar) — system fallback to SF Mono / ui-monospace.

Uppercase 10–11px tracking-wide (`letter-spacing: 0.1–0.18em`) is reserved for section labels — a deliberate echo of engineering schematic captions.

### Icon system — 11 original SVGs

Two coexisting visual families bound by stroke-only outlined geometry, 1.5–2.8px stroke, square `viewBox="0 0 64 64"`:

- **Mineralogy** — `Pebble`, `Prism`, `Shard`, `Keystone`, `Obelisk`, `Lattice` (wild).
- **Acoustic / hydrology** — `Tide`, `Arc`, `Knot`, `Meridian`, `Sonar` (scatter, with dashed rings).

No A/K/Q/J playing-card glyphs, no fruit, no zodiac. Tier is communicated by stroke weight + colour role, not by ornament.

### Layout grid

3 vertical columns per tab: control / canvas / metrics. Build = `220 / 1fr / 340`. Play = `1fr / 320`. Certify = `1fr / 360`. Inside the canvas, content is on an 8px baseline, 14/22 padding rhythm. Reel widows on the PLAY tab use deliberate asymmetric vertical offsets (cols 2 & 4 shifted 12px) to break the vegas-grid cliché while keeping mathematical alignment.

### What I avoided & why

- **No gradient backgrounds, no glow, no drop shadows beyond 1px hairlines** — the surface is a document, not a stage.
- **No emoji, no flat-cartoon symbols** — keeps audience (designers + auditors) anchored.
- **No CDN, no framework, no external font** — file:// works, zero network, fully reproducible.
- **No red/green for win/loss** — `--signal` for wins, `--ink-500` for no-win; colour-blind-safe.
- **No rotating star "spin" button bling** — black disk with hairline ring, the heaviest UI mass on the page, as a deliberate gravity centre.

### Interaction details

- Paytable cell edits → 100 ms `setTimeout` → RTP value receives `.pulse` class (transient teal + 1px upward translate) and is rewritten with `tabular-nums`.
- Reel weight sliders are inline per reel, footer of the reel card; sliders use 2px track + 12px filled ink-900 thumb.
- Symbol palette supports both `dragstart`/`drop` and click-to-select fallback.
