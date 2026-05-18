# Atrium — Design Notes

**Brief.** Atrium is a math-studio for slot designers. It treats the IR file
as the source of truth and the visual canvas as a *thin lens* over closed-form
math. The goal is engineering credibility, not casino theatre.

## Palette (8 tokens, hex)

| token       | hex       | role |
|-------------|-----------|------|
| `--ink`     | `#14161b` | primary text, CTA, hex outlines |
| `--ink-soft`| `#4a4f5a` | secondary text |
| `--paper`   | `#f6f3ec` | parchment surface — warm, not white |
| `--paper-2` | `#ecE7da` | elevated surface |
| `--line`    | `#cdc6b3` | hairline borders, warm-neutral |
| `--accent`  | `#2b6c5d` | deep teal — primary action, RTP good-delta |
| `--accent-2`| `#c97a3a` | burnt amber — highlights, T1 tier, MC progress |
| `--warn`    | `#8a3a2e` | oxblood — alerts, negative delta |

Deliberately **no gold, no neon, no red-on-black**. The teal+amber pair sits
opposite the casino cliché on the color wheel.

## Typography

- **Sans**: Inter (system fallback chain). Letter-spacing −0.005em body,
  −0.015em headlines for a sharper engineering feel.
- **Mono**: JetBrains Mono / SF Mono. Used for every *quantity* (RTP, hit-freq,
  reel IDs, statusbar). Numerals run with `font-feature-settings: "tnum"` so
  RTP changes do not reflow.

Headlines are SMALL CAPS at 13px / 0.08em tracking, not large display type — a
choice that says *spec sheet*, not *casino marquee*.

## Layout decisions

- **Build tab**: 3-rail layout (palette · canvas · PAR). The reel canvas is
  rendered as a *gridded engineering surface* (dotted graph paper) — the
  designer is meant to feel they are editing a schematic, not playing a game.
- **Play tab**: deliberate non-grid render. Symbols sit in a 5-column hex
  honeycomb with staggered odd-columns. This breaks the visual equivalence to
  the build grid so the designer mentally separates *math view* from *player
  view*.
- **Certify tab**: 3 cards (Monte-Carlo · PAR sheet · Jurisdictions). The PAR
  sheet shows the GLI-16 12-section schedule numbered `01…12` to mirror the
  regulator format.

## Micro-interactions

- Paytable cell click → +5 nudge with a brief teal flash, RTP updates live.
  Shift-click or ArrowDown nudges −5.
- Drag a symbol onto a reel cell → cell border turns teal, RTP shimmers ±0.2.
- Topology / mechanic chip toggle → soft RTP perturbation.
- Spin button: hex stage shakes 480ms, ~28.6% of spins flag winning hexes
  amber for 900ms (matches the displayed hit-freq).
- Engine status dot pulses 2.2s — confirms 77/77 solvers online.

## Accessibility

- `role="tablist"` + `aria-selected` + ArrowLeft/Right cycling.
- `:focus-visible` rings on every interactive element (2px teal, 2px offset).
- `prefers-reduced-motion: reduce` disables all animation.
- All symbols ship with `aria-label` and inline `<img alt>`.
- Skip-to-content link, ARIA landmarks (`banner`, `main`, `contentinfo`).

## What I rejected on purpose

- Slotomania / Pragmatic / NetEnt UI: dark theme + gold + red — explicitly
  inverted (light parchment + teal + amber).
- Card values A K Q J 10 9: replaced with 11 original glyphs (Obsidian,
  Auralith, Cinder, Verdant, Tide, Quill, Prism, Cog, Wild, Scatter,
  Multiplier) organised in 4 tiers (T1 apex → T4 mechanics).
- Bootstrap card stack, Material elevation, Tailwind utility classes — none
  used. The system is 1 CSS file, ~700 lines, with custom tokens.
- Skeuomorphic 3D reels — replaced with a flat dotted-grid canvas.

## What I borrowed (and remixed)

- Linear's mono-numeral status bar and chip language.
- Datadog's per-symbol stacked horizontal bars for contribution charts.
- Notion's small-caps section headers.
- Houdini / TouchDesigner's *grid-as-surface* metaphor for the build canvas.

The result is recognisably modern but does not look like any single
reference. The dominant feeling target: a *Bloomberg terminal for slot math*.
