/**
 * 30-second elevator demo storyboard.
 *
 * Use case: chance encounter at G2E, a 30-second airtime to plant the
 * hook before walking off. Single shot, single beat per scene.
 */

import type { Storyboard } from './index.js';

export const storyboard: Storyboard = {
  slug: '30sec-elevator',
  title: '30-second elevator demo — "drag, drop, ship"',
  audience: 'L&W exec, G2E hallway encounter, conference floor',
  duration: '30 seconds',
  goal:
    'Plant the hook: "L&W can ship a certified slot title in 30 seconds, end-to-end, in front of you." Hand business card and walk off.',
  scenes: [
    {
      cue: 'T+0s',
      visual:
        'Phone screen up, browser already on the Studio Builder. Empty 5×3 grid visible.',
      dialogue:
        '"Quick one — watch this. I drop a math IR into our Studio Builder…"',
      ascii: `+---------+---------+---------+---------+---------+
|  ___    |  ___    |  ___    |  ___    |  ___    |
| | A |   | | A |   | | A |   | | A |   | | A |   |
| |___|   | |___|   | |___|   | |___|   | |___|   |
+---------+---------+---------+---------+---------+
|  ___    |  ___    |  ___    |  ___    |  ___    |
| | K |   | | K |   | | K |   | | K |   | | K |   |
| |___|   | |___|   | |___|   | |___|   | |___|   |
+---------+---------+---------+---------+---------+
[ EMPTY STUDIO BUILDER · DROP IR HERE ]`,
    },
    {
      cue: 'T+5s',
      visual:
        'Drag-drop IR file from desktop onto the Studio canvas. Reels populate with symbols.',
      dialogue:
        '"…the reels populate from the IR — paytable, paylines, features. Live RTP appears in 100 milliseconds…"',
      ascii: `[ IR DROPPED · reels populated · RTP = 96.04% ]
        Hit freq: 26.8%  ·  Volatility: MED  ·  20 paylines`,
    },
    {
      cue: 'T+12s',
      visual:
        'Click SPIN. Reels animate. Win line highlights. Counter ticks.',
      dialogue:
        '"…I click SPIN, the engine evaluates byte-deterministically, win line draws. Same seed, same outcome, anywhere…"',
      ascii: `>>>  SPIN 1  ·  WIN £4.50  ·  line 3  ·  seed 0xDEADBEEF
>>>  Replay across Linux / macOS / Windows: BYTE-MATCH`,
    },
    {
      cue: 'T+20s',
      visual:
        'Click CERTIFY. Progress bar to 100%. Download button: "operator-package.zip · 1.2 MB · signed".',
      dialogue:
        '"…and here\'s the cert dossier. 200 milliseconds. Ed25519-signed. UKGC / MGA / GLI ready."',
      ascii: `[ CERTIFY ] 100%
  → operator-package.zip   (1.2 MB)
  → .sig  Ed25519, HSM-backed
  → ready for GLI / BMM / eCOGRA / NMi`,
    },
    {
      cue: 'T+28s',
      visual: 'Hand business card.',
      dialogue:
        '"This works for every L&W mechanic — Quick Hit, Huff N\' Puff, Spartacus. Pilot tarball is one email away. Card?"',
    },
  ],
  qa: [
    'Q: "Is this real or a mock?" → A: "Real. We can run it on your laptop in 60 seconds."',
    'Q: "What about my Lock It Link / Cash Falls / Dragon Train?" → A: "Already in our catalog — 16/16 L&W mechanics covered."',
    'Q: "What\'s the cost?" → A: "Three options on the deck — license at $8M/yr, partnership JV, or acquisition. Let\'s talk."',
  ],
};
