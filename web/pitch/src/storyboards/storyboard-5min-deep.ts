/**
 * 5-minute deep demo storyboard.
 *
 * Use case: pre-scheduled 5-minute slot in a conference room. Audience
 * is one CTO + one math lead. Walks the full pilot tenant lifecycle:
 * seed → spin → cert → rollback. Establishes credibility on every axis.
 */

import type { Storyboard } from './index.js';

export const storyboard: Storyboard = {
  slug: '5min-deep',
  title: '5-minute deep demo — pilot tenant lifecycle',
  audience: 'L&W CTO + math lead, scheduled meeting',
  duration: '5 minutes',
  goal:
    'Show end-to-end: seed a tenant, run a real spin, generate a cert dossier, simulate a regression, and roll back. Establish "production-grade" credibility.',
  scenes: [
    {
      cue: 'T+0:00',
      visual:
        'Terminal split-pane. Left: shell prompt. Right: browser tab to Studio Builder. Tenant seed file open.',
      dialogue:
        '"This is the platform. Left side terminal, right side browser. I\'m going to provision a fresh L&W pilot tenant, run a spin, generate a cert dossier, simulate a regression, and roll back — in five minutes. Start the clock."',
      ascii: `+--- TERMINAL ---+    +--- BROWSER ---+
| $ _            |    |  Studio        |
|                |    |  [empty]       |
+----------------+    +----------------+`,
    },
    {
      cue: 'T+0:30',
      visual:
        'Terminal: `node scripts/tenant-seed.mjs --name=lw-pilot --jurisdiction=UKGC` running, ~3s output.',
      dialogue:
        '"Tenant provisioning. One command. Creates per-tenant DB namespace, HSM key partition, JWT scope claim. AsyncLocalStorage context wired."',
      ascii: `$ node scripts/tenant-seed.mjs --name=lw-pilot --jurisdiction=UKGC
[ok]  namespace lw-pilot created
[ok]  HSM key partition lw-pilot mounted
[ok]  JWT scope lw-pilot signed
[ok]  AsyncLocalStorage context: tenant_id=lw-pilot
provisioned in 2.4s.`,
    },
    {
      cue: 'T+1:00',
      visual:
        'Browser: Studio open under lw-pilot tenant. Drop "Dragon Train Chi Lin" IR file. Reels populate. Live PAR sidebar updates.',
      dialogue:
        '"Drop Dragon Train Chi Lin IR. The studio re-creates the math: 6-scatter hold-and-spin, 4-tier MMMS, Fortune 8 progressive, sticky mystery during FS. Live PAR: RTP 96.04%, hit freq 26.8%, volatility HIGH."',
    },
    {
      cue: 'T+1:45',
      visual:
        'Click SPIN. Animation. Win line draws. Spin history log accumulates. Click AUTOPLAY 100 — runs in ~2s.',
      dialogue:
        '"Hundred autoplay spins. Each one byte-deterministic against seed. The replay harness can reproduce any spin five years from now from the seed + IR + commit hash. Player dispute? Solved in a function call."',
      ascii: `[spin 1] WIN £4.50   line 3   seed 0xA1B2C3D4 ... [seed deterministic]
[spin 2] LOSS         seed 0xA1B2C3D5
[spin 3] BONUS TRIG   seed 0xA1B2C3D6 → free spins ×8
...
[100/100]   RTP measured: 95.87%  ·  expected: 96.04%  ·  within 95% CI`,
    },
    {
      cue: 'T+2:30',
      visual:
        'Click CERTIFY tab. Run "MC 100K" button → progress bar fills in ~3s. PAR sheet preview opens (12 GLI-16 sections).',
      dialogue:
        '"100,000 MC samples in three seconds, Rust simulator. PAR sheet renders 12 GLI-16 sections — RTP, hit freq, volatility, quantiles, moments, bonus distances, required spins, compliance. Click Export."',
    },
    {
      cue: 'T+3:00',
      visual:
        'Export modal: pick UKGC + GLI-19 → "Download operator-package.zip · 1.2 MB · signed". Terminal: `unzip -l operator-package.zip` shows 155 files.',
      dialogue:
        '"Operator package: 155 files, SHA-256 manifest, Ed25519 detached signature. Same HSM key signs every dossier. Drop into the lab portal. Three to twelve weeks of cert time turn into one upload."',
    },
    {
      cue: 'T+3:45',
      visual:
        'Terminal: `git checkout deliberate-regression-branch` then `npm run portfolio` — one solver fails. Red CI badge.',
      dialogue:
        '"Now I deliberately break a solver. Portfolio gate fires. CI status red. Master TODO unaffected. Deploy is blocked. The platform stops itself before regression ships."',
      ascii: `$ npm run portfolio
[ FAIL ] solver: cascadeMeterCharge (W146)
        expected E[F]=0.2143  got 0.1980  rel=7.6%
        tolerance 5%
[ CI ] gate blocked. deploy aborted.`,
    },
    {
      cue: 'T+4:15',
      visual:
        'Terminal: `git checkout main`, `npm run canary-rollback --to-tag=W210`. Canary stages 1-4 turn green.',
      dialogue:
        '"Roll back to the last green tag — Wave 210. Canary in 4 stages: 1%, 5%, 25%, 100%. RPO 60 seconds, RTO 5 minutes. Tested quarterly. Nobody pages a human."',
      ascii: `$ npm run canary-rollback --to-tag=W210
[stage 1/4]  1%  ramp - 30s  ok
[stage 2/4]  5%  ramp - 60s  ok
[stage 3/4] 25%  ramp - 120s ok
[stage 4/4] 100% ramp - 180s ok
rolled back in 6m 30s.`,
    },
    {
      cue: 'T+4:50',
      visual:
        'Clock stops at 4:50. Single panel summarizing what just happened: provisioned, signed, certified, regressed, rolled back.',
      dialogue:
        '"Five minutes. Provisioned, certified, regressed, rolled back. This is the engine. The pilot tarball is in your inbox before you leave the room."',
    },
  ],
  qa: [
    'Q: "How do we audit the math against our internal SG/Bally pipeline?" → A: "Exact-enumeration solvers (W63/W68) give ground-truth RTP by formula. Diff is line-by-line, not statistical."',
    'Q: "What about our existing 80 titles?" → A: "Each title becomes an IR file. Porting is math-team-led — 1-3 weeks per title depending on complexity. Engine team supports."',
    'Q: "Multi-tenant data leak?" → A: "3-ring defense: network namespace, AsyncLocalStorage context with SQL interceptor, HSM key partition. Pen-tested. SOC2 Type 1 prep done."',
    'Q: "What if you get hit by a bus?" → A: "~50K LOC, 7,000+ tests, onboarding docs, TS+Rust parity (two-brain rule). Engine survives. 24-month founder retention in Option A."',
    'Q: "Why not build this internally?" → A: "16 weeks of waves got us to 77 solvers. Internal estimate: 24-36 months at L&W team velocity. We can do this together starting Day 0."',
  ],
};
