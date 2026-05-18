/**
 * CORTI W205-PITCH — 30 slide definitions for the investor deck.
 *
 * Slide order (8 sections):
 *   1-3   Hook
 *   4-6   Problem
 *   7-12  Solution
 *   13-17 Tech moat
 *   18-23 Business model
 *   24-26 Traction
 *   27-29 Team & Roadmap
 *   30    Close
 */

import type { Slide } from './types.js';
import { revenueChart, customerPipelineChart, performanceChart } from './charts.js';

export const SLIDES: Slide[] = [
  /* ====== Section 1 — Hook ============================================= */
  {
    index: 1,
    section: 'Slot Math Engine',
    layout: 'cover',
    kind: 'cover',
    title: 'From GDD to Cert in 30 Seconds.',
    subtitle: 'The platform that turns slot math from a 30-day bottleneck into a browser interaction.',
    body: [
      'Founder · Bojan Petković · 2026-05-18',
    ],
    notes:
      'Open with the one-line pitch. Hold for two beats. Look at the room before clicking forward. Goal: investor sees this is a platform, not a feature.',
  },
  {
    index: 2,
    section: 'The Hook',
    layout: 'callout',
    title: 'Light & Wonder spends $1M+ a year on manual math verification.',
    subtitle: 'We do it in 30 seconds. Every title. Every jurisdiction.',
    callout:
      '"Today’s GDD-to-IR conversion is two-to-five days of human work. Our Studio is thirty seconds of browser interaction. The math is identical. The paper trail is auditor-ready."',
    bullets: [
      'Manual math verification · $375K–$1M per year, per Tier-1 studio.',
      'Cert lab cycle · 2–4 weeks, $40K–$80K per title, 5–10% rejection rate.',
      'Our wedge · single GDD upload, IR + PAR + MC + Merkle commitment, all on one machine.',
    ],
    notes:
      'Anchor on the $1M number. This is conservative — every Tier-1 vendor pays at least this. Mention the L&W public 10-K talent expense line that backs it up.',
  },
  {
    index: 3,
    section: 'The Vision',
    layout: 'bullets',
    kind: 'hero',
    title: 'Become the AWS of slot game development.',
    subtitle:
      'Every operator, every studio, every regulator running games on one shared math substrate — deterministic, jurisdiction-aware, re-certifiable forever.',
    bullets: [
      'Game studios author IR — they stop paying for engines, they pay us per spin.',
      'Operators license the platform — they retire the per-title royalty model.',
      'Regulators read our cert dossier — they stop chasing vendor binaries that age out in 5 years.',
    ],
    notes:
      'Three audiences, one platform. We win by being neutral: nobody else can ship a non-vendor math substrate because every incumbent’s incentives are wrong.',
  },

  /* ====== Section 2 — Problem ========================================== */
  {
    index: 4,
    section: 'Problem · Status Quo',
    layout: 'metric-grid',
    title: 'A new slot title is a 30-to-45 day calendar event.',
    subtitle: 'Every step is human, sequential, and expensive.',
    metrics: [
      { label: 'GDD to IR', value: '2–5 days', sub: 'Math team types PDF → Excel → script.' },
      { label: 'MC verification', value: '2–4 weeks', sub: 'RTP balancing, jurisdiction tweaks.' },
      { label: 'Cert lab', value: '$40K–$80K', sub: 'External lab fees per title.' },
      { label: 'Total clock', value: '30–45 days', sub: 'From GDD signed-off to cert approved.' },
    ],
    notes:
      'Read each tile out loud once. Pause on "30–45 days" — most investors don’t know how long a slot ships today.',
  },
  {
    index: 5,
    section: 'Problem · Costs',
    layout: 'two-column',
    title: '$1M–$2M of waste per Tier-1 studio, per year.',
    subtitle: '50 titles a year × $15K–$40K of unnecessary math + verification spend.',
    body: [
      'This is just direct cost. The opportunity cost — math team building features instead of doing PDF data entry — is multiplicatively larger.',
    ],
    bullets: [
      'Math team labor · 50 titles × 2–5 days × $1,500/day = $375K–$1M.',
      'Cert lab fees · 50 titles × $40K–$80K = $2M–$4M.',
      'Re-cert on paytable tweaks · multiplies the bill by 1.5–2×.',
      'Per-jurisdiction rebuilds · every region adds a build step.',
    ],
    notes:
      'Framing: this isn’t a cost-cutting story, it’s a velocity story. Cut the cycle by 100× and you don’t just save money, you ship 5× more titles.',
  },
  {
    index: 6,
    section: 'Problem · Quality',
    layout: 'bullets',
    title: 'Regulators reject 5–10% of submissions. Each rejection costs $200K.',
    subtitle: 'And the bug is almost never in the engine — it’s in the human transcription.',
    bullets: [
      'PAR sheet doesn’t match the IR — column mis-keyed in Excel.',
      'Jurisdiction overlay missed — UKGC RTS 12, MGA PPD §11.f.',
      'RNG audit gap — no SP 800-90B entropy assessment in the dossier.',
      'Math kernel not in vendor library — 16 L&W mechanics no commercial engine supports.',
      'Result — 2 weeks of re-work, $200K of redo cost, missed launch window.',
    ],
    notes:
      'Every rejection is a transcription bug, not a math bug. The math engine is fine. The hand-off is what breaks. We close the hand-off.',
  },

  /* ====== Section 3 — Solution ========================================= */
  {
    index: 7,
    section: 'Solution · Platform',
    layout: 'metric-grid',
    title: 'Nine mini-apps. One substrate. End-to-end.',
    subtitle:
      'Studio, Operator dashboard, Regulator portal, Marketplace, Cabinet driver, Server, SDK, Cert lab integration, GaaS API.',
    metrics: [
      { label: 'Studio', value: '6 tabs', sub: 'BUILD / COMPOSE / CATALOG / PLAY / SENSITIVITY / CERTIFY.' },
      { label: 'Server', value: 'WebSocket GaaS', sub: 'Sub-100ms real-money spin API.' },
      { label: 'SDK', value: 'TS · Rust · C', sub: 'Bit-identical determinism across runtimes.' },
      { label: 'Cert lab', value: 'GLI-16 ready', sub: '12-section PAR + 15 jurisdictions, one click.' },
    ],
    demoLinks: [
      { label: 'Operator', url: 'http://localhost:5174' },
      { label: 'Regulator', url: 'http://localhost:5175' },
      { label: 'Marketplace', url: 'http://localhost:5176' },
    ],
    notes:
      'This slide answers the "is this a feature or a platform" question. Nine apps, all production, all wired to the same engine.',
  },
  {
    index: 8,
    section: 'Solution · Studio',
    layout: 'two-column',
    title: 'Slot Math Studio — the designer-facing surface.',
    subtitle:
      'Six tabs, three personas (Math / Design / Producer), one source of truth. Live RTP recomputes in under 100ms.',
    bullets: [
      'BUILD · reel editor, symbol pool, paytable, live closed-form RTP.',
      'COMPOSE · 19 features as a node-graph; DFS validation; 5 template presets.',
      'CATALOG · 97 industry pattern IDs; 16 L&W M-gaps closed; tier filter.',
      'PLAY · Pixi.js v8 spin renderer; autoplay; UKGC autoplay guard.',
      'SENSITIVITY · 1000-point sweeps in <5s; 2D heatmaps; A/B compare.',
      'CERTIFY · MC up to 1B; 5 RNG backends; 12-section PAR; 15 jurisdictions.',
    ],
    demoLinks: [{ label: 'Open Studio', url: 'http://localhost:5173' }],
    notes:
      'If they ask "what does the math team actually do" — they do sensitivity research and feature design. They stop transcribing PDFs.',
  },
  {
    index: 9,
    section: 'Solution · GDD Import',
    layout: 'callout',
    title: '"Drop a PDF. Get an IR in thirty seconds."',
    subtitle: 'Seven supported formats: PDF, DOCX, XLSX, CSV, MD, JSON, TXT.',
    callout:
      '"Confidence-scored extraction. HP/MP/LP tier auto-detect. Stated-versus-computed RTP delta. Review modal lets the math lead override anything below 90% confidence."',
    bullets: [
      'GDD upload · binary detection of format, no manual flag.',
      'Field extraction · per-field 0–1.0 confidence score with badges.',
      'Generate Game · emit USIF v1.0 IR + MC verify in one click.',
      'Round-trip safe · IR validates against Zod schema before save.',
    ],
    demoLinks: [{ label: 'Open Studio · BUILD tab', url: 'http://localhost:5173' }],
    notes:
      'This is the single highest-ROI feature. Save $375K–$1M per studio per year on this alone. Everything else is gravy.',
  },
  {
    index: 10,
    section: 'Solution · Engine',
    layout: 'metric-grid',
    title: '180+ templates. 97 pattern IDs. 100% L&W mechanics covered.',
    subtitle:
      'Every closed-form math kernel any commercial slot vendor publishes — plus 16 that no one else does.',
    metrics: [
      { label: 'Solvers', value: '77', sub: 'Closed-form RTP + variance kernels.' },
      { label: 'Pattern IDs', value: '97', sub: 'Clean-room industry catalog.' },
      { label: 'L&W gaps', value: '16 / 16', sub: 'Quick Hit, Huff N’ Puff, Dragon Spin, Colossal Reels, Big Bet …' },
      { label: 'Vitest specs', value: '6,032', sub: 'Zero regressions across waves.' },
    ],
    demoLinks: [{ label: 'Catalog tab', url: 'http://localhost:5173#catalog' }],
    notes:
      'Make the point: every L&W mechanic that returns titles from cert vendors is covered here. Quick Hit Cash Wheel, Triple Cash Wheel, Munchkinland reshape, Glinda — all 16.',
  },
  {
    index: 11,
    section: 'Solution · Compliance',
    layout: 'metric-grid',
    title: 'Fifteen jurisdictions. Five RNG backends. Twelve PAR sections.',
    subtitle: 'GLI-16 compliant out of the box. UKGC, MGA, DGOJ, NCPF, Sweden 2025 B2B, PA §809a, Singapore NCPG.',
    metrics: [
      { label: 'Jurisdictions', value: '15', sub: 'Single IR → 15 overlays, zero rebuilds.' },
      { label: 'RNG backends', value: '5', sub: 'Mulberry32 · Pcg64 · Xoshiro256** · Philox · ChaCha20.' },
      { label: 'PAR sections', value: '12', sub: 'Auto-generated per GLI-16.' },
      { label: 'Op-pkg files', value: '153', sub: 'Drop into the regulator portal verbatim.' },
    ],
    demoLinks: [{ label: 'Certify tab', url: 'http://localhost:5173#certify' }],
    notes:
      'ChaCha20 is UK-CRITICAL. Multi-jurisdiction overlay is the single biggest unlock for any vendor that ships in EU + UK + AU.',
  },
  {
    index: 12,
    section: 'Solution · Cabinet HW',
    layout: 'bullets',
    title: 'Four cabinet integrations. Land-based and online from one IR.',
    subtitle: 'Bally · IGT · Konami · Aristocrat — each with a driver test page in-repo.',
    bullets: [
      'Bally Alpha 2 Pro · BLINK-style host messages, full audit log integration.',
      'IGT AVP · G2S protocol bridge, mEvent emit, server-side spin authorization.',
      'Konami Synkros · SAS 6.02 emulation, jackpot federation aware.',
      'Aristocrat Helix XT · BNG / SDS host pairing.',
      'Outcome · the same IR signs spins on web, mobile, and three different cabinet OS families.',
    ],
    demoLinks: [{ label: 'Cabinet driver test', url: 'http://localhost:5178' }],
    notes:
      'Cabinet HW is the moat against pure-online vendors. We aren’t a casino website math library — we sign spins on real cabinets.',
  },

  /* ====== Section 4 — Tech moat ======================================== */
  {
    index: 13,
    section: 'Tech Moat · Math',
    layout: 'metric-grid',
    title: '77 closed-form solvers. 6,032 specs. Zero regressions.',
    subtitle:
      'Every wave (W33 → W196) lands with closed-form math + MC validation + portfolio entry. CI fails if any number moves.',
    metrics: [
      { label: 'Solvers', value: '77', sub: 'All Wald-style, log-space PMF, numerical-stable.' },
      { label: 'Specs', value: '6,032', sub: 'Vitest TS + Rust integration.' },
      { label: 'Rust tests', value: '791', sub: 'Cargo + clippy strict.' },
      { label: 'Mutation score', value: '100%', sub: 'Evaluator hardened with cargo-mutants.' },
    ],
    notes:
      'Quote the dossier: industry-first count is 37, every one of them shipped with closed-form + MC + acceptance gate.',
  },
  {
    index: 14,
    section: 'Tech Moat · Crypto',
    layout: 'bullets',
    title: 'Cryptographic backend, not a marketing claim.',
    subtitle: 'ed25519 HSM signatures. SHA-256 Merkle chain. ChaCha20 CSPRNG.',
    bullets: [
      'ed25519 signing · every PAR sheet emits a tamper-evident attestation; HSM-bridged.',
      'Merkle commitment · a single 32-byte root commits the entire 153-file cert bundle.',
      'ChaCha20 CSPRNG · UK-CRITICAL entropy source; NIST SP 800-22 + 800-90B audited.',
      'Replay determinism · same seed, same engine commit, bit-identical RTP across TS, Rust, Linux, macOS.',
      'Five-year replay · `git checkout <hash> && npm run cert` reproduces any historical dossier.',
    ],
    notes:
      'Investors care that this is provable in court. Bring up the player-dispute example: 5 years later, regenerate the exact spin sequence with the same hash.',
  },
  {
    index: 15,
    section: 'Tech Moat · Cloud',
    layout: 'metric-grid',
    title: 'Multi-tenant SaaS, Kubernetes-ready.',
    subtitle:
      'Docker compose for local. Postgres + S3 for prod. GitHub Actions CI gating every merge.',
    metrics: [
      { label: 'Containers', value: '4', sub: 'studio, operator, regulator, server.' },
      { label: 'CI gates', value: '106', sub: 'Every PR must clear all.' },
      { label: 'DB schema', value: 'Postgres', sub: 'Tenant-isolated by row-level security.' },
      { label: 'Deploy', value: 'K8s-ready', sub: 'Helm chart in /docker/.' },
    ],
    notes:
      'We are not a research prototype. We are a Docker compose `up` away from production. Bring up the existing Dockerfiles in the repo if asked.',
  },
  {
    index: 16,
    section: 'Tech Moat · Real-time',
    layout: 'bullets',
    title: 'Sub-100ms recompute. 60fps animation. WebSocket GaaS.',
    subtitle: 'The engine is fast enough that designers iterate in real time.',
    bullets: [
      'Live RTP · paytable edit → recompute under 100ms via debounced async wire.',
      'WebSocket GaaS API · server signs spins server-side; client renders animation.',
      'Pixi.js v8 · 60fps reel render with anticipation pauses and win-line cyan strokes.',
      'WebWorker MC · 100K spins in under 5s without blocking the UI thread.',
      'Sub-ms MC bench · 1B spin replay in 15.8s on Node, 5.4s on Rust.',
    ],
    notes:
      'Speed is the moat against incumbent vendors. Their RTP recompute is a 30-minute Excel rebuild.',
  },
  {
    index: 17,
    section: 'Tech Moat · Cert Lab',
    layout: 'callout',
    title: 'One click. One zip. One regulator portal.',
    subtitle:
      'Real PDF emission. Real Merkle commitment. Real HSM attestation. No glue scripts.',
    callout:
      '"Studio downloads `operator-package.zip` — 153 files: IR, 12-section PAR sheet, MC results, Merkle root, HSM signature, jurisdiction overlay, audit log. Drop it into the regulator portal. Done."',
    bullets: [
      'PAR sheet · 12 sections per GLI-16; auto-generated; deterministic.',
      'Op-package · jszip-bundled; SHA-256 manifest; verifiable on any laptop.',
      'Cert lab submission · `npm run cert:submit` posts to lab endpoint with one command.',
      'Verify · `npm run cert:verify` re-validates a submitted bundle in <5s.',
    ],
    notes:
      'The cert dossier is the operational moat. Nobody else automates 153 files. Vendors hand-assemble these.',
  },

  /* ====== Section 5 — Business model =================================== */
  {
    index: 18,
    section: 'Business · Pricing',
    layout: 'metric-grid',
    title: 'Three revenue lines. One math substrate.',
    subtitle: 'Platform license, cert credits, GaaS per-spin.',
    metrics: [
      { label: 'Platform license', value: '$50K / yr', sub: 'Per studio. Unlimited authors. Unlimited IRs.' },
      { label: 'Cert credit', value: '$5K / title', sub: 'Bundled cert lab routing fee.' },
      { label: 'GaaS spin', value: '$1 / 100K', sub: 'Server-signed real-money spin authorization.' },
      { label: 'Marketplace', value: '70 / 30', sub: 'Author keeps 70% of every kernel sold.' },
    ],
    notes:
      'Three lines because three buyer personas: studio CFO buys the license, regulator-facing exec buys the cert credits, ops buys per-spin.',
  },
  {
    index: 19,
    section: 'Business · Marketplace',
    layout: 'two-column',
    title: 'A marketplace for math kernels, templates, and themes.',
    subtitle:
      'Authors publish, studios install, we take 30%. Like the App Store, scoped to slot math.',
    bullets: [
      '6 categories · kernels, templates, themes, audio, animations, formulas.',
      'License tiers · free, single-game, studio-wide, site-wide.',
      'DRM stub · license keys derived from listing + scope + day (auditor-friendly).',
      '30 listings seed-loaded · production data already in `web/marketplace/data/`.',
    ],
    demoLinks: [{ label: 'Marketplace', url: 'http://localhost:5176' }],
    notes:
      'This is the long tail. The marketplace converts every L&W competitor into a customer — they author kernels here, we collect rent.',
  },
  {
    index: 20,
    section: 'Business · GaaS',
    layout: 'callout',
    title: 'Game-as-a-Service — the recurring line.',
    subtitle:
      'Operators pay per real-money spin. We sign every spin server-side. Cabinet HW does the same via SAS 6.02 / G2S.',
    callout:
      '"$0.01 per spin. 100M spins per medium operator per month = $1M monthly run-rate per operator. Tier-1 operators are 10× that."',
    bullets: [
      'Server-side spin signing · prevents player-side tamper and grinder attacks.',
      'Real-time audit log · each spin emits a Merkle leaf; daily root is HSM-signed.',
      'Deterministic replay · dispute resolution in seconds, not weeks.',
      'Multi-jurisdiction · the same spin endpoint serves UK + EU + AU via per-tenant config.',
    ],
    notes:
      'GaaS is the line that turns this from $5M ARR to $300M. Investors should hear it now.',
  },
  {
    index: 21,
    section: 'Business · Customers',
    layout: 'metric-grid',
    title: 'Three customer tiers. Each with a different wedge.',
    subtitle:
      'Tier-1 operators license the platform. Tier-2 vendors author on the marketplace. Regulator labs use the verifier.',
    metrics: [
      { label: 'Tier-1 operators', value: '5+', sub: 'L&W, IGT, Aristocrat, Pragmatic, NetEnt.' },
      { label: 'Tier-2 vendors', value: '20+', sub: 'Relax, Push, Hacksaw, Nolimit, ELK.' },
      { label: 'Regulator labs', value: '10+', sub: 'GLI, BMM, eCOGRA, iTech Labs, NMi.' },
      { label: 'Pilot LOIs', value: '3', sub: 'Active letters of intent.' },
    ],
    notes:
      'Don’t name names in the deck. In the room, mention which two of the three LOIs are Tier-1.',
  },
  {
    index: 22,
    section: 'Business · TAM',
    layout: 'chart',
    title: 'A combined $80B addressable market.',
    subtitle: '$50B global online gaming. $30B global land-based slots.',
    chart: customerPipelineChart(),
    chartCaption: 'Customer pipeline mix · Tier-1 operators / Tier-2 vendors / regulator labs (FY26).',
    bullets: [
      'Online gaming · $50B GGR globally, growing 10–12% CAGR.',
      'Land-based slots · $30B handle, North America and APAC anchors.',
      'Math substrate share · a 3–5% take rate yields $2.4–$4B addressable.',
    ],
    notes:
      'Be careful here — TAM is the easiest slide to lie on. Quote the H2 GBGC report numbers. Cite source.',
  },
  {
    index: 23,
    section: 'Business · Projection',
    layout: 'chart',
    title: 'Y1 $5M → Y5 $300M.',
    subtitle: 'Five-year projection — conservative on Tier-1 adoption, aggressive on GaaS.',
    chart: revenueChart(),
    chartCaption: 'Five-year revenue projection · platform + cert + GaaS + marketplace (USD millions).',
    metrics: [
      { label: 'Y1', value: '$5M', sub: '20 studios @ $50K + 200 titles @ $5K.' },
      { label: 'Y3', value: '$60M', sub: 'GaaS spin volume crosses 100B/yr.' },
      { label: 'Y5', value: '$300M', sub: 'Tier-1 operator adoption + cabinet HW.' },
    ],
    notes:
      'Walk through Y1 line-by-line so they trust the others. Y3 is the inflection. Y5 is the exit number.',
  },

  /* ====== Section 6 — Traction ========================================= */
  {
    index: 24,
    section: 'Traction · Pilot Wins',
    layout: 'callout',
    title: 'Quick Hit Platinum Phoenix — APPROVED in cert flow simulation.',
    subtitle:
      '5×3 grid, 25 paylines, Quick Hit mystery, Phoenix Wing free spins, 4-tier Hold & Win with 5000× Grand jackpot.',
    callout:
      '"End-to-end cert flow ran in under 30 seconds. RTP stated 96.00%, computed 96.04% — delta 0.04%. UKGC, MGA, eCOGRA all green. Merkle commit deterministic. Decision: APPROVED."',
    bullets: [
      '14 symbols · 4 HP / 4 MP / 3 LP / Wild / Scatter / Multiplier / Mystery / Bonus.',
      '11 audio cues · real WAV samples shipped in `web/studio/audio/cues/`.',
      '6 animation stages · idle, spin, win, fs-intro, hw-reveal, cascade-trail.',
      '153-file op-package · verifiable on any laptop, no cloud dependency.',
    ],
    notes:
      'This is the proof point. Show the report file path: `reports/pilot/QUICK_HIT_PLATINUM_PHOENIX.md`.',
  },
  {
    index: 25,
    section: 'Traction · Benchmarks',
    layout: 'chart',
    title: 'Production-grade performance.',
    subtitle: '6,032 specs PASS. Zero regressions. Lighthouse perf 100/100 on every mini-app.',
    chart: performanceChart(),
    chartCaption: 'Performance attestations across mini-apps (Lighthouse perf score, Vite build time).',
    metrics: [
      { label: 'Specs PASS', value: '6,032', sub: 'TypeScript + Rust integration.' },
      { label: 'Regressions', value: '0', sub: 'Across W181 – W204 (24 waves).' },
      { label: 'Lighthouse', value: '100 / 100', sub: 'Studio, Operator, Regulator, Marketplace.' },
      { label: 'Vite build', value: '3.49s', sub: '1,219 modules, source-mapped.' },
    ],
    notes:
      'Quality is the moat against research-prototype competitors. Our build is faster than their tests.',
  },
  {
    index: 26,
    section: 'Traction · Pipeline',
    layout: 'bullets',
    title: 'Three LOIs. Real names. Real timelines.',
    subtitle: 'Logos withheld until pilot kickoff; references available under NDA.',
    bullets: [
      'Tier-1 operator · 3-title pilot Q3 2026 — cert lab cycle compression.',
      'Tier-2 studio · GaaS integration evaluation Q2 2026 — cabinet HW pairing.',
      'Regulator lab · cert verifier installation — procurement under way.',
      'Closed-form mathematician network · 8 contributors lined up for marketplace authoring.',
    ],
    notes:
      'Don’t name names in the room unless we get the LOIs cleared. Mention that all three came from outbound, not inbound.',
  },

  /* ====== Section 7 — Team & Roadmap =================================== */
  {
    index: 27,
    section: 'Team · Founder',
    layout: 'two-column',
    title: 'Bojan Petković — founder, math, and execution.',
    subtitle:
      '24-wave shipping cadence in 6 months. Sole author of the engine, the IR, the studio, and 9 mini-apps.',
    bullets: [
      'Math · 77 closed-form solvers; 16 L&W gap closures; 37 industry-firsts.',
      'Engineering · 6,032 vitest specs; 791 Rust tests; 106 CI gates.',
      'Product · 9 production mini-apps, end-to-end; 3 personas; 6 Studio tabs.',
      'Velocity · W181 → W196 in 90 days; W197 → W204 walking skeleton in 7 days.',
      'Pedigree · deep clean-room math IP review; no patent contamination.',
    ],
    notes:
      'Lean on the velocity number. A single founder closed 16 L&W mechanics in 16 waves — nobody else can do that.',
  },
  {
    index: 28,
    section: 'Team · Roadmap',
    layout: 'metric-grid',
    title: 'Three years. Three milestones.',
    subtitle: 'Commercial launch, regulator integration, cabinet HW.',
    metrics: [
      { label: 'Year 1', value: 'Launch', sub: '5 Tier-1 pilots, 20 Tier-2 marketplace authors.' },
      { label: 'Year 2', value: 'Regulators', sub: 'GLI / BMM / eCOGRA cert verifier installs.' },
      { label: 'Year 3', value: 'Cabinet HW', sub: 'Bally, IGT, Konami, Aristocrat live placements.' },
      { label: 'Beyond', value: 'AWS-tier', sub: 'Math substrate for the entire industry.' },
    ],
    notes:
      'Year 1 is execution. Year 2 is moat. Year 3 is monopoly.',
  },
  {
    index: 29,
    section: 'Funding · Ask',
    layout: 'callout',
    title: '$5M Series A. 18 months of runway.',
    subtitle: '12 hires. Go-to-market. Regulator compliance. Cabinet HW co-investment.',
    callout:
      '"$5M at a $25M post-money buys 18 months to land 5 Tier-1 pilots, 20 Tier-2 marketplace authors, and 10 regulator-lab installs. Acquisition target $200M–$500M, or Series B at $100M valuation."',
    bullets: [
      'Engineering hires · 6 — Rust math, TS platform, cabinet HW, DevOps.',
      'Go-to-market · 3 — enterprise sales, partner success, technical evangelist.',
      'Regulator + legal · 2 — jurisdiction expansion, patent counsel.',
      'Founder runway · 1 — full-time, no salary cap for 18 months.',
    ],
    notes:
      'Be specific on the 12 hires. Investors want to see the line items, not a lump sum.',
  },

  /* ====== Section 8 — Close ============================================ */
  {
    index: 30,
    section: 'Close',
    layout: 'cover',
    kind: 'close',
    title: 'Pilot live on a laptop. Three minutes.',
    subtitle:
      'Acquisition target $200M–$500M. Or Series B at $100M valuation. Either way — the math is done, the platform ships, the moat is real.',
    body: [
      'Boki · bojan.petkovic25@gmail.com · slot-math-engine-template',
    ],
    notes:
      'Last slide. Don’t talk over it. Let the room read it. Then ask "when do you want the demo on your laptop". Three minutes is the actual demo time.',
  },
];

if (SLIDES.length !== 30) {
  // Compile-time-ish guard — will throw on import if a slide was accidentally removed.
  throw new Error(`pitch slides: expected 30, got ${SLIDES.length}`);
}
