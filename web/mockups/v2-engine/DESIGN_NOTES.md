# v2-engine — Design Notes

## Brief
v2-engine is the **FULL engine** representation of `slot-math-engine-template`,
built for an L&W C-level acquisition pitch. Unlike the MVP-scoped Corti and
KIMI mockups, this is the platform's complete surface area: **6 tabs**,
**3-persona switcher**, **97 P-IDs**, **15 jurisdictions**, **5 RNG backends**,
**16 L&W gaps closed**.

Reference feel: **Bloomberg terminal × Linear Status Engine × Houdini network
view**. Density of information communicates power; calm chromatic restraint
communicates engineering credibility.

## Inheritance
- **Corti DNA**: graphite ink + bone paper palette (`--ink-900`, `--paper`,
  `--signal`, `--warn`). JetBrains Mono for every numeric. Single-accent
  teal `#1E8F8A`, terracotta `#B8763A` for scatter / warnings only.
- **KIMI a11y**: `role="tablist"` + `aria-selected` + ArrowLeft/Right cycle,
  skip-link, `:focus-visible` rings, `prefers-reduced-motion`, small-caps
  section headers at 9.5–11px / 0.1–0.14em tracking.

## Six-tab structure

### 01 BUILD (extended Corti baseline)
Three-column: palette / reel editor / live PAR. Topology selector now exposes
all **5 engine topologies**: `rectangular`, `variable_rows` (megaways),
`cluster`, `hexagonal`, `cluster_variable`. PAR sidebar live-recomputes in
1.4ms on every paytable / weight edit.

### 02 COMPOSE — Feature Graph Editor (new)
Visual node-graph composer inspired by Blender shader nodes / Houdini network
view. Left rail: 15 feature nodes grouped in 3 categories (Triggers /
Mechanics / Modifiers), each chip with category-coded left border. Center
canvas: graph paper grid with 6 pre-loaded node cards (Base Game → Scatter
Trigger → Free Spins → Cascade → Multiplier Ladder + Sticky Wilds branch),
SVG edges with arrowhead markers. Nodes are drag-able by their head bar.
Right rail Inspector: live parameter editor + closed-form solver preview
(`E[FS] = Σ P(k scat) · μ_k · m̄`) + kernel/spec/CI-gate metadata for the
selected node. Footer shows the **composed RTP** as stacked horizontal bars
(base 0.42 + FS 0.18 + cascade 0.06 + mult 0.04 = 0.70, target 0.94–0.96).

### 03 CATALOG — Industry Pattern Library (new)
Tri-pane: filters / 97-card grid / detail. Top banner highlights the 16 L&W
M-gaps closed (W181→W196) as a strip of clickable chips. Cards show P-ID
(P-001..P-097), title, wave + commit pin, RTP band pill (teal-bordered),
variance pill (LOW/MID/HIGH coloured), family code, and an L&W M-badge
in the corner when applicable. Detail pane shows formula preview (varies by
family — Hold & Win, cascade, FS, cluster, megaways, wheel, pick, jackpot,
colossal), sample parameters, acceptance counts (vitest specs, MC spins,
closed↔MC Δ, CI gate green status), and three CTAs: Insert into BUILD,
View specs, View MC acceptance.

### 04 PLAY (extended Corti baseline + replay + Merkle)
Asymmetric 5×3 reel (cols 2 & 4 offset 12px), SPIN/AUTO, spin history.
**New**: seed-override input + "Replay this exact spin" button + Merkle
commit display showing per-spin hash composition.

### 05 SENSITIVITY — Parameter Sweep (new)
Tri-pane: 18 parameter sliders / heatmap + RTP curve / what-if comparator.
Heatmap is a 16×12 grid coloured via a cold-warm gradient (paper-tan →
signal-teal). RTP curve is a 1000-pt SVG line with CI95 ribbon underneath.
Comparator shows Config A (current) vs Config B (sweep) vs Δ card with
green/warn-coded deltas (RTP +0.76 pp, σ +1.3, hit +1.6 pp).

### 06 CERTIFY (massively extended)
- **MC bar**: 5 sample-size pills (100K / 1M / 10M / 100M / 1B), 5 RNG pills
  (Mulberry32 legacy / PCG64 default / Xoshiro256SS parallel / Philox4×32 GPU
  / **ChaCha20 with UK badge**), seed input, run button + progress + CI band
  that tightens with sample size (±0.058% at 1M, ±0.002% at 1B).
- **PAR sheet**: 12 expandable sections per GLI-16 Appendix D (Identification,
  RTP & moments, Hit freq, Volatility, Win dist, Jackpot, Compliance,
  Confidence, Quantiles, Moments, Bonus distances, Required spins). Click
  expands inline detail.
- **RNG audit**: NIST SP 800-22 (15/15 PASS), ENT entropy, χ², SP 800-90B
  min-entropy, TestU01 BigCrush, PractRand — six cards, accent-coloured PASS.
- **Compliance attestation**: 8 cards covering FastForward, anti-fraud,
  self-exclusion, loss limits, spin pacing, bonus wagering, stake caps,
  net-position display.
- **Merkle commit + HSM signature**: monospace pre-block with root hash,
  per-artifact sha256, SBOM line, ed25519 signature reference.
- **15 jurisdiction grid** (2-column): UKGC, MGA, ADM, eCOGRA, DGOJ, SE,
  PA, NL, DE, CA-ON, AU, NZ, JP, KR, BR. UKGC has terracotta left-border
  marking it as UK-critical. **Click any chip opens a centered overlay**
  with that jurisdiction's specific compliance rules (e.g. UK: RTS 7A/12/14,
  SI 2025/215 2.5s pacing + £2 stake cap, LCCP 4.2; JP: 80%-cycle, 6.0號機,
  Kakuhen bounds).
- **Cert submission status**: per-jurisdiction PENDING/APPROVED/REVIEW.
- **Package preview**: 10-category content list of operator-package.zip
  (153 files, 42.8 MB, sha256 anchored, ed25519 signed).

## Persona switcher
Topbar `Math / Design / Producer` toggle. Each persona enables `[data-persona-only]`
sections without redrawing the layout:

- **Math** (default): full numeric density, all formulae visible, RNG audit
  expanded. The "neutral" view used by the math team during integration.
- **Design**: symbols scale 1.4× via transform, paytable symbol-cells tint
  teal, theme picker (Geological/Cosmic/Botanical) appears, "feel" indicator
  (tight/balanced/loose horizontal slider) shows alongside RTP.
- **Producer**: Build right-rail gains a 3-card KPI strip ($40K cost saved,
  3w time saved, 0% reject rate), Certify side gains a "Producer view" block
  with market readiness (78%), jurisdictions deployed (3/15), time-to-cert
  (11 days avg), reject rate (0%).

## Statusbar
Pinned across all tabs. Pulsing 7px teal dot (2.2s ease, box-shadow pulse —
disabled under `prefers-reduced-motion`). 9 segments: `engine online · 77
solvers · 5 351 specs · 106 CI gates · 97 P-IDs · 16 L&W M-gaps · 15
jurisdictions · 5 RNG · cat v2.63 | recompute Xms · drift Ypp`.

## Fake data inventory
- **97 patterns** generated in `app.js` (first 16 = L&W gap-closing, remaining
  81 = synthetic but plausible solver families). JSON sample in
  `data/catalog-97.json` (25 patterns) + complete metadata in
  `data/lw-16.json` (16 gaps).
- **15 jurisdictions** with full rule sets (3–6 rules each, code + description)
  inlined in `app.js` JURIS array — drives overlay content.
- **12 PAR sections** with kv pairs + per-section regulator detail string.
- **18 sensitivity parameters** with min/max/value ranges + slider widgets.
- **16-cell × 12-row heatmap** = 192 RTP samples computed via synthetic 2D
  Gaussian surface peaking at (0.6, 0.4) — produces a recognisable hotspot.

## What was deliberately NOT done
- No casino imagery, no red/black, no gold, no flame icons, no character art.
- No external framework, no CDN, no web font load — works file:// offline.
- No skeuomorphic 3D reels.
- No emoji.
- No console errors.
- No real interactive Blender-style node-edge re-routing (would require
  6–8 hours; nodes drag but edges are static SVG to demonstrate the metaphor).
- No real MC compute (progress bar + CI tightening curve, deterministic).

The mockup is **dense by intent**: every region answers "what does this
engine do today?" with quantitative evidence rather than aspirational copy.
