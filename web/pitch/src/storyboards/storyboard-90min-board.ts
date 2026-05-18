/**
 * 90-minute boardroom presentation storyboard.
 *
 * Use case: L&W board / executive committee. Slide-by-slide notes, audience
 * Q&A bullets, technical asides. Pace ~7-8 minutes per slide + 10 minute
 * Q&A buffer + 5 minute open + 5 minute close.
 */

import type { Storyboard } from './index.js';

export const storyboard: Storyboard = {
  slug: '90min-board',
  title: '90-minute boardroom presentation — full pilot pitch',
  audience: 'L&W Board / Executive Committee + CTO + CFO + General Counsel',
  duration: '90 minutes (12 slides @ ~7min + 10min Q&A + opens / closes)',
  goal:
    'Walk the L&W board from "first time hearing this" to "yes, proceed to a 30-day pilot." Hit credibility on every axis: math, cert, multi-tenant, marketplace, performance, commercial terms, risk.',
  scenes: [
    {
      cue: 'Slide 0 — Open (5 min)',
      visual: 'Room: presenter + 8 L&W execs around table. Deck on main screen. Cyan + onyx palette.',
      dialogue:
        '"Thanks for the time. The next 90 minutes are a structured conversation about whether we can collapse L&W\'s cert + dev cycle by 75% and unlock $40-200M in marketplace upside. Twelve slides, lots of room for questions, one decision at the end: pilot yes/no."',
    },
    {
      cue: 'Slide 1 — Title (5 min)',
      visual: 'Cover slide. Four hero stats. Tagline.',
      dialogue:
        'Frame the platform identity. Read the four stats out loud. Pause. Ask: "Before I go further — anyone here familiar with the platform from prior conversations?" Calibrate the room.',
    },
    {
      cue: 'Slide 2 — The 3-Slide Reality (10 min)',
      visual: 'Side-by-side L&W today vs platform tomorrow.',
      dialogue:
        '"This slide is the whole pitch in one frame. Today\'s L&W: 26 weeks, $250K, $40-80K lab fee per title. Platform: 6 weeks, $0 marginal. The rest of the deck is just proof." Expect 10 min of Q&A here — let it run.',
    },
    {
      cue: 'Slide 3 — 16/16 L&W Coverage (8 min)',
      visual: 'M1-M16 table with wave + commit pinned.',
      dialogue:
        '"This is the credibility slide for your math team. Every L&W mechanic, every commit pinned. Independent KIMI deep research did the brand attribution. We did the math kernels. Sixteen for sixteen." Walk M3, M5, M14 in detail — your most iconic titles.',
    },
    {
      cue: 'Slide 4 — 77 Closed-Form Solvers (5 min)',
      visual: 'Bar chart vs Aristocrat / IGT / Pragmatic / Hacksaw.',
      dialogue:
        '"Peer counts are inferred — they don\'t publish. Ours is a CI portfolio gate. If a solver regresses, the platform stops shipping. The 77 isn\'t marketing, it\'s a build flag." Expect skepticism — invite the math team to audit post-meeting.',
    },
    {
      cue: 'Slide 5 — Cert Paper Trail (8 min)',
      visual: 'HSM signature schematic + 4-lab cards.',
      dialogue:
        '"Cert dossier is the most underrated lever in this entire deck. Today every paytable change re-opens the lab cycle. Platform regenerates the dossier from IR + commit hash. Five years from now, same machine, same dossier, byte-identical." Invite General Counsel to scrutinize the audit trail.',
    },
    {
      cue: 'Slide 6 — Marketplace Ecosystem (10 min)',
      visual: '6 templates, 8 themes, author revenue grid.',
      dialogue:
        '"This is where the $8-15M Year-2 ARR comes from. L&W operates the platform; 12 internal studios + N external authors ship templates; 30% of every transaction lands in L&W. We\'ll get to the math on the ROI slide." Expect M&A questions about IP control — point to Option A vs Option B trade-off.',
    },
    {
      cue: 'Slide 7 — Multi-tenant + Compliance (5 min)',
      visual: '15 jurisdictions grid + 3-ring isolation.',
      dialogue:
        '"For the CFO and General Counsel. 15 jurisdictions, 11 rules, 165 verdicts on one page. Compliance review collapses from weeks to hours. Three-ring tenant isolation tested by an independent pen-test."',
    },
    {
      cue: 'Slide 8 — Performance Numbers (5 min)',
      visual: '8 perf cards: latency / TPS / determinism / canary / RPO/RTO.',
      dialogue:
        '"For the CTO. p99 22ms spin eval. 450K MC TPS. Byte-identical replay across 4 OSes. 4-stage canary with RPO 60s. These numbers are reproducible from scripts/load-test-*.mjs in the tarball."',
    },
    {
      cue: 'Slide 9 — Pilot Path D0→D30 (8 min)',
      visual: 'Timeline with 6 milestones.',
      dialogue:
        '"This is the closest thing to a contract in the deck. Day 0 NDA + tarball. Day 30 decision point. Your math team has veto authority at every gate. Pilot risk is bounded: you can walk on Day 30 with zero residual obligation."',
    },
    {
      cue: 'Slide 10 — Commercial Terms (12 min)',
      visual: '3 cards: Acquire / License / Partnership.',
      dialogue:
        '"This is the slide we\'ll spend the most time on. Three paths. My recommended starting position: Option B license at $8M/yr, converting to Option A acquire at the 18-month checkpoint if portfolio coverage and marketplace ARR hit milestones. De-risks both sides. CFO — what\'s your reaction?"',
    },
    {
      cue: 'Slide 11 — Risk Mitigations (5 min)',
      visual: '8-row honest risk table.',
      dialogue:
        '"I will not pretend there\'s no risk. Eight rows. Every row has a mitigation we\'ve already built or shipped. General Counsel — you\'ll want to walk row 4 (multi-tenant leak) and row 6 (founders leave) with my pen-test report after this."',
    },
    {
      cue: 'Slide 12 — Next Steps (4 min)',
      visual: 'Single contact, single tarball, single hour.',
      dialogue:
        '"One email, one tarball, one 60-minute session. Your CTO + math lead pick the title and the jurisdiction. We provision the tenant. 30 days later we\'re back in this room with a decision."',
    },
    {
      cue: 'Close (5 min)',
      visual: 'Final slide held. Open Q&A.',
      dialogue:
        '"Three asks. (1) Approve the 60-minute technical session in the next two weeks. (2) Assign a math-team lead as primary contact. (3) Pick the pilot title — we\'ll integrate around your timeline." Sit. Take questions. Don\'t pitch over silence.',
    },
  ],
  qa: [
    'Likely CFO: "Where\'s the cost basis for $200-500M acquisition?" → Anchor to Wave 209 $25K template price × ~10,000 lifetime templates × Year-5 marketplace ARR × M&A multiple in slot-tech of 4-8x ARR.',
    'Likely CTO: "Why TypeScript + Rust both?" → "Two-brain rule. Same IR runs through both; cross-language differential fuzz catches semantic drift. Removes single-language footgun."',
    'Likely General Counsel: "IP overlap with Aristocrat / IGT patents?" → "IP review in docs/IP_REVIEW.md. Megaways variable-height: BTG patent expired 2023. Hold-and-spin: prior art back to 2007. No overlap with active L&W or peer patents."',
    'Likely CEO: "How do I tell my studio teams this won\'t replace them?" → "Studios get a 10x faster cert cycle and a marketplace storefront. Their math gets shipped more, not less. They become the IR authors, not the engine maintainers."',
    'Likely Board Member: "What\'s the downside of doing nothing?" → "Aristocrat or a private-equity backed challenger acquires this platform. L&W spends 2026 watching them ship faster than you."',
    'Likely Math Lead: "Can I see the solver for our hardest mechanic — say, Dragon Train\'s sticky mystery?" → "Open the tarball, src/solvers/. Every solver is ~150 LOC of TS + 150 LOC of Rust. Read it tonight. Tell us tomorrow what\'s wrong with it."',
    'Likely Compliance Lead: "GLI/BMM relationship?" → "Pre-submission walkthroughs with 2 of 4 labs completed. Dossier format follows GLI-19 spec verbatim. We can warm-introduce."',
    'Likely M&A Lead: "Founders\' incentive alignment post-acquisition?" → "24-month retention in Option A. Equity rollover negotiable. Earn-out tied to platform metric milestones (active titles, ARR, regression-free quarters)."',
    'Likely Skeptic: "This sounds too good. What\'s the catch?" → "The catch is your math team has to do the porting. We provide engine, IR spec, replay harness, support — your team learns the IR and ports your library. 80 titles × 1-3 weeks each = 18-24 months at full velocity."',
  ],
};
