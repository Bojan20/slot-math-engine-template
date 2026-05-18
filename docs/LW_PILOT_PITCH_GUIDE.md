# L&W Pilot Pitch Guide — How to use these materials

**Audience:** Slot Math Engine sales + solutions engineering team — anyone who walks into a room with L&W
**Purpose:** the playbook for using the deck, ROI calculator, deep-dive, comparison, and storyboards effectively
**Last updated:** 2026-05-18 (W211)

---

## 1. The pitch surface, at a glance

You have six artifacts. Use them in this order based on the room:

| Artifact | Path | Use when |
| --- | --- | --- |
| 12-slide L&W deck | `web/pitch/lw-deck.html` | scheduled exec meeting |
| ROI calculator | embedded in deck, also `web/pitch/src/roi-calculator.ts` | CFO / finance team |
| Technical deep-dive | `docs/LW_TECHNICAL_DEEP_DIVE.md` | CTO + math lead 60-minute session |
| Competitive comparison | `docs/LW_VS_COMPETITORS.md` | M&A team, board |
| 30sec elevator storyboard | `web/pitch/src/storyboards/storyboard-30sec-elevator.ts` | G2E hallway, conference floor |
| 5min deep storyboard | `web/pitch/src/storyboards/storyboard-5min-deep.ts` | scheduled 5-minute slot |
| 90min board storyboard | `web/pitch/src/storyboards/storyboard-90min-board.ts` | full board / executive committee |

The deck is the primary surface; everything else is a companion.

---

## 2. The four rooms

You will encounter one of four rooms with L&W. Pick a playbook per room.

### Room A — G2E hallway, 30 seconds

Use the **30-second elevator storyboard**. Don't pitch — demo. Phone screen. Studio Builder. Drop IR. Spin. Certify. Hand card. Walk off. Confidence comes from the demo, not the script.

Anchor lines:
- "Watch this — math IR into the Studio Builder, RTP live in 100 ms…"
- "…spin, byte-deterministic, replay across machines…"
- "…and here's the cert dossier, 200 ms, Ed25519 signed."
- "Works for every L&W mechanic. Pilot tarball one email away. Card?"

### Room B — Scheduled 5-minute slot

Use the **5-minute deep storyboard**. Open terminal split-pane: shell + browser. Provision a tenant, port a Bally title, run 100 spins, generate the dossier, deliberately break a solver, roll back. Show the platform as a working system, not slides.

Key beats:
- Tenant provisioning in 2.4s (one command).
- Real Bally title (Dragon Train Chi Lin or Quick Hit Platinum) running live.
- 100K MC samples in 3 seconds, Rust simulator.
- CI portfolio gate firing on a deliberate regression.
- Canary rollback in 6 minutes.

End with: "30 days, no cost-to-walk-away. Tarball in your inbox before you leave the room."

### Room C — 60-minute technical session (CTO + math lead)

Use the **deep-dive document** + live engine in the laptop.

Agenda:
1. **0:00–0:05** — frame: "we're going to do a math diff together, no slides."
2. **0:05–0:20** — L&W picks one of their hardest titles. We port the IR live. Closed-form solver outputs. Compare to L&W's internal cert dossier RTP.
3. **0:20–0:40** — walk three solver source files end-to-end (~150 LOC each). The math team reads the code.
4. **0:40–0:50** — generate the cert dossier. Open the operator-package.zip. Walk the SHA-256 manifest. Show the Merkle PAR commitment + Ed25519 signature.
5. **0:50–1:00** — Q&A. Anticipated questions in the storyboard Q&A bullets.

Hard rule: **never open the slide deck in this room**. The slide deck is for executive review. The technical session is the engine itself.

### Room D — 90-minute boardroom

Use the **90-minute board storyboard**. Slide-by-slide. Pace ~7 min per slide + 10 min Q&A + 5 min open + 5 min close. Read the scene-by-scene notes. Calibrate to the room — let Q&A run on slides 2 (the reality), 6 (marketplace), and 10 (commercial terms). Don't be precious about timing; the close is the only fixed beat.

---

## 3. Talking points per slide

### Slide 1 — Title

- Read the four hero stats out loud. They are the deck in one frame.
- Pause and ask: "Anyone here familiar with the platform?"
- Don't move on until you've calibrated the room's prior knowledge.

### Slide 2 — The 3-Slide Reality

- This is the whole pitch in one frame.
- Spend 10 minutes here. Let Q&A run.
- If the room pushes back on the 4.3x or 75% numbers, point to the ROI calculator on the deck — adjust their inputs live.

### Slide 3 — 16/16 L&W Coverage

- Credibility slide for the math team.
- Walk three rows in detail: M5 (Quick Hit reel-bound mystery), M7 (Spartacus Colossal Reels wild transfer), M14 (Nested mini-slot inside bonus).
- Cite the KIMI research doc. Invite the math team to audit post-meeting.

### Slide 4 — 77 Closed-Form Solvers

- Acknowledge peer counts are inferred — they don't publish. We do.
- Anchor on the CI portfolio gate: "if a solver regresses, the platform stops shipping."
- If a skeptic challenges the number, invite them to count the solver files in the tarball.

### Slide 5 — Cert Paper Trail

- The most underrated lever in the deck.
- Anchor on the 200 ms dossier + 5-year replay guarantee.
- Invite General Counsel to scrutinize the audit trail.

### Slide 6 — Marketplace Ecosystem

- This is where the $8–15M Year-2 ARR projection comes from.
- Be specific about the 70/30 split + 5% commission template.
- Expect M&A questions about IP control. Point to Option A vs Option B trade-off on slide 10.

### Slide 7 — Multi-tenant + Compliance

- For the CFO and General Counsel.
- 15 jurisdictions × 11 rules = 165 verdicts on one page.
- Three-ring isolation tested by independent pen-test.

### Slide 8 — Performance Numbers

- For the CTO.
- Read three numbers out: p99 22 ms, 450K MC TPS, RPO 60s.
- Mention reproducibility: "every number here is reproducible from `scripts/load-test-*.mjs` in the tarball."

### Slide 9 — Pilot Path D0 → D30

- This is the closest thing to a contract in the deck.
- Math team retains veto authority at every gate.
- Pilot risk is bounded: walk on Day 30 with zero residual obligation.

### Slide 10 — Commercial Terms

- The slide you'll spend the most time on. **Plan for 12+ minutes.**
- Lead with recommended starting position: Option B (license) at $8M/yr, converting to Option A (acquire) at 18-month checkpoint.
- Ask CFO directly: "What's your reaction?" Don't pitch over silence.

### Slide 11 — Risk Mitigations

- Don't gloss. Acknowledge every row.
- Two rows worth a closer walk: row 4 (multi-tenant leak) and row 6 (founders leave).
- Offer to send the pen-test report after the meeting.

### Slide 12 — Next Steps

- Three asks: approve technical session, assign math-team lead, pick pilot title.
- One contact, one tarball, one hour.
- End. Take questions. Don't pitch.

---

## 4. ROI calculator — how to use it live

The ROI calculator is embedded in the deck under the **ROI** section. Five sliders, live recompute on every input. Use it when:

- The CFO challenges the cost-reduction number.
- A finance team wants to model their own portfolio.
- A board member asks "what if our games-per-year is different?"

**Default inputs:**

| Input | Default |
| --- | --- |
| Games per year | 30 |
| Cost per game | $250,000 |
| Weeks per game | 26 |
| Jurisdictions | 8 |
| Operator network | 50 |

**Default outputs:** annual cost savings ≈ $8.8M, accelerated weeks ≈ 7.8w/game, 5-year NPV ≈ $33M, break-even ~10 months, marketplace ARR ≈ $120K (Year 2 conservative).

Don't fight the inputs. If L&W's number is different (e.g. 80 games/year), enter it. The math is honest; the numbers move.

**Talking points on the assumptions:**

- 75% cost reduction is conservative — we get there from "lab cycle paid once, marginal cost ≈ 0." Don't anchor at 100%; the engineering team still has to integrate.
- 70% time reduction is conservative — full pipeline goes 26w to 6–8w; we model 7.8w as a defensible floor.
- 10% discount rate is standard slot-vendor WACC; adjust if L&W's hurdle rate is different.
- Marketplace ARR of $120K Year 2 is the **floor**, not the projection. Realistic Year-2 ARR with full activation is $8–15M; the calculator shows the floor so a CFO can't accuse us of optimism.

---

## 5. Storyboards — when to use which

| Storyboard | Run time | Audience | Where |
| --- | --- | --- | --- |
| 30sec elevator | 30 sec | random exec | G2E hallway, conference floor |
| 5min deep | 5 min | CTO + math lead | scheduled meeting |
| 90min board | 90 min | board / exec committee | scheduled board meeting |

Storyboards are scripts, not scripture. Adapt to the room. The opening hook, the demo beats, and the close are fixed; everything in the middle is responsive to the audience.

---

## 6. Anticipated objections + answers

### "How is this different from what we already have internally?"

- L&W internal pipelines are excellent per-studio but cross-studio reuse is manual. We unify 12+ studios under one IR + one engine.
- Cert pipeline collapses from weeks to minutes regardless of studio origin.
- Marketplace flips cost structure — internal pipelines don't do this.

### "What about cabinet HW?"

- We don't compete here. L&W's LightWave / Bally / WMS cabinet HW remains the surface. We integrate via standard HTML5/WebGL renderer.
- This is a strength of the partnership — keep your cabinet HW advantage, gain the substrate.

### "What if your team leaves?"

- 24-month retention in Option A.
- ~50K LOC + 7,000+ tests + onboarding docs + TS+Rust parity rule. Platform survives transitions.
- We can structure earn-out tied to platform metric milestones (active titles, ARR, regression-free quarters).

### "GLI / BMM relationships?"

- Pre-submission walkthroughs with 2 of 4 labs completed.
- Dossier format follows GLI-19 spec verbatim.
- We can warm-introduce.

### "Why not build this internally?"

- 16 weeks of focused waves got us to 77 solvers. Internal L&W estimate (we believe based on team velocity benchmarks): 24–36 months for parity.
- Time-to-market is the lever. Build vs buy depends on whether L&W wants Q1 2027 or Q1 2029 to start shipping.

### "What's the catch?"

- Honest answer: L&W's math team has to do the porting. We provide engine + IR spec + replay harness + support; your team learns the IR and ports your library. 80 titles × 1–3 weeks each = 18–24 months at full velocity. That's the cost.
- If you don't have math team capacity, Option C (JV) shifts that load to us.

### "What about Aristocrat / IGT counter-bid?"

- Exclusivity window during pilot.
- IP review in `docs/IP_REVIEW.md` — no overlap with peer claims.
- M&A team should be prepared for activity but pilot is structured to lock in fast.

### "How do we audit the math vs our internal SG/Bally pipeline?"

- Exact-enumeration solvers (W63/W68) give ground-truth RTP by formula.
- Diff against L&W internal is line-by-line, not statistical.
- Math team retains veto at every gate.

---

## 7. The single most important thing

The pitch is not a slide. The pitch is the engine. Every artifact in this guide is in service of getting the engine into L&W's math team's hands.

If you have to choose between (a) showing one more slide and (b) opening the terminal and running `npm run portfolio:gate`, always choose (b). 77 solvers passing in 3 seconds is more persuasive than any slide we could write.

— Slot Math Engine Platform team
