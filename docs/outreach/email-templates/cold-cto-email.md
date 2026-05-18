# Cold CTO — Email

> Summary line 1: Cold outbound email to L&W CTO / VP Engineering / Head of Math.
> Summary line 2: Tone: technical peer, dense with proof links, no decks attached.
> Summary line 3: Goal: 30-minute call or async tarball review.

## Tone notes
- Engineers ignore marketing emails; ship proof in the first 2 lines.
- Single short paragraph + 3 bullets + 1 ask. No multi-page essay.
- Plain text fallback friendly: no HTML-only formatting.
- Avoid the word "demo" in subject — engineers read it as "sales call".

## Subject line variants
- A: "Closed-form math engine, 16/16 L&W M-gaps closed — peer review?"
- B: "Slot math kernel portfolio (77 solvers, 4-lab cert) — open to a 30-min code walk?"
- C: "Quick technical question about {{lw_title_example}} math acceptance — also have a tool you might want to see"
- D: "We built the math engine L&W could acquire — proof tarball inside"

## Body
{{salutation}} {{first_name}},

I lead engineering on slot-math-engine — a closed-form math kernel portfolio (currently 77 solvers, Rust + TypeScript, 7,400+ vitest specs) that covers the 16 L&W mechanic families end-to-end with cert-lab paper trail for BMM, GLI, eCOGRA, and NMi.

Three things you can verify without a meeting:

- **Tarball (offline, signed)**: {{tarball_link}} — pitch package, manifest with SHA-256s, Ed25519-signed. `npm run pitch:verify` reproduces the verification.
- **Technical deep-dive**: {{deep_dive_link}} — three solver source files end-to-end, MC vs closed-form reconciliation.
- **Pilot path**: 30 days, no cost-to-walk-away. {{pilot_path}}

If after the tarball you want a 30-min code walk (no slides), I block {{week_window}} for you. If not, no follow-up — the tarball stands on its own.

Best,
{{sender_name}}
{{sender_title}} | slot-math-engine
{{sender_email}} | {{sender_link}}

## Suggested links to include
- {{tarball_link}}: private mirror with download tracking
- {{deep_dive_link}}: docs/LW_TECHNICAL_DEEP_DIVE.md (rendered)
- {{pilot_path}}: one-pager URL or docs/LW_PILOT_PITCH_GUIDE.md

## Placeholder reference
- {{salutation}} — "Hi" or "Hello" (default "Hi")
- {{first_name}} — target's first name
- {{lw_title_example}} — recent L&W release name (for subject C)
- {{tarball_link}} — private URL
- {{deep_dive_link}} — public/private URL
- {{pilot_path}} — public/private URL
- {{week_window}} — "Tue–Thu next week, mornings PT"
- {{sender_name}}, {{sender_title}}, {{sender_email}}, {{sender_link}}

## Send checklist
- [ ] Subject line A/B picked
- [ ] Plain-text fallback verified (paste into Gmail compose, toggle plain text)
- [ ] Tarball link works in incognito
- [ ] Sent Tuesday–Thursday, 9:30–11:00 target-local

## Follow-up trigger
- Day 5: no response → `followup-no-response.md`
- Replied → meeting scheduled → `pre-pitch-checklist.md`

## A/B test plan
- Send 5 with subject A (peer review framing).
- Send 5 with subject D (acquisition framing).
- Reply rate threshold: ≥1 reply per 5 = continue; 0/5 = revise body.
