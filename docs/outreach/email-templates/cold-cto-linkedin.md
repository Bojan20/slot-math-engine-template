# Cold CTO — LinkedIn DM

> Summary line 1: Cold LinkedIn DM to L&W CTO (or VP Engineering).
> Summary line 2: Tone: peer-to-peer, technical, no marketing fluff.
> Summary line 3: Goal: 20-minute discovery call to discuss math engine acceleration.

## Tone notes
- Talk to them as another senior engineer, not as a buyer.
- Lead with a concrete technical asset (the tarball), not a promise.
- LinkedIn DMs cap practically around 300 words; aim for 120–180.
- No emojis. No "synergy" / "value proposition" / "best-in-class".
- Mention 1 specific thing they ship — proof you read their public work.

## Subject line variants (LinkedIn doesn't have subjects, but use this as opener)
- A: "Closed-form math engine + 4-lab cert paper trail — 20 min?"
- B: "We can ship a lab-cert'd L&W title in 14 days — proof inside"
- C: "77 closed-form solvers covering 16/16 L&W M-gaps — open to a peer review?"

## Body
Hi {{first_name}},

I run engineering on slot-math-engine — a closed-form RTP/variance solver portfolio with a Rust/TS dual implementation. We just closed our 16th L&W mechanic gap (the M-gap matrix in {{deep_dive_link}} maps directly to {{lw_title_example}}-class titles you ship today).

The reason I'm reaching out: we built this assuming L&W would be the natural integration partner, and I think the math team would actually have fun with the kernels. Three concrete artifacts I can share:

1. {{tarball_link}} — single tar.gz, offline-verifiable, Ed25519-signed manifest. Has the deck, the technical deep-dive, and a 4-lab cert dossier sample (BMM/GLI/eCOGRA/NMi).
2. {{deep_dive_link}} — the deep-dive doc; you can read 3 of our 77 solver source files in ~20 minutes.
3. {{pilot_path}} — 30-day pilot path, no integration cost-to-walk-away.

If you'd rather just look at the code first and decide later, fully understood — the tarball is self-contained.

20 minutes on your calendar {{week_window}}?

— {{sender_name}}
{{sender_title}}
{{sender_link}}

## Suggested links to include
- {{tarball_link}}: private Google Drive / Dropbox upload of the pitch tarball
- {{deep_dive_link}}: docs/LW_TECHNICAL_DEEP_DIVE.md (HTML render or PDF)
- {{pilot_path}}: docs/LW_PILOT_PITCH_GUIDE.md or one-pager

## Placeholder reference
- {{first_name}} — target's first name
- {{lw_title_example}} — a specific L&W title they have publicly worked on
- {{tarball_link}} — URL to private pitch tarball mirror
- {{deep_dive_link}} — URL to deep-dive doc
- {{pilot_path}} — URL to pilot guide / one-pager
- {{week_window}} — e.g. "next Tue/Wed afternoon GMT"
- {{sender_name}} — your name
- {{sender_title}} — your title
- {{sender_link}} — your LinkedIn URL

## Send checklist
- [ ] Personalized {{lw_title_example}} field with real title from their LinkedIn
- [ ] Tarball link is private and you can see the download log
- [ ] Subject opener picked (A/B/C)
- [ ] Sent during their working hours (US Pacific for L&W Vegas HQ)

## Follow-up trigger
- Day 5: no response → use `followup-no-response.md`
- Replied + interested → use `warm-cto-intro.md` for pre-meeting email
- Replied + skeptical → use `OBJECTION_RESPONSES.md` rebuttal matching their question
