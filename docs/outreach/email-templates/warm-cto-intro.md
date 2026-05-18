# Warm CTO — Pre-meeting Email After Intro

> Summary line 1: Pre-meeting note to L&W CTO after a warm intro from mutual contact.
> Summary line 2: Tone: confident peer, concise, "looking forward to" framing.
> Summary line 3: Goal: confirm meeting + set expectations + share one pre-read.

## Tone notes
- The intro already did the heavy lift of credibility. Don't re-pitch.
- Acknowledge the intro contact by name (warmth signal).
- Send ONE pre-read, not three — engineers respect bandwidth.
- ≤120 words.

## Subject line variants
- A: "Re: intro from {{intro_name}} — pre-read for our {{day}} call"
- B: "{{day}} call: one pre-read attached"
- C: "Following up on {{intro_name}}'s intro — call confirmation + tarball link"

## Body
Hi {{first_name}},

Thanks to {{intro_name}} for the intro — really appreciated.

Looking forward to {{day}} at {{time}}. To save us the first 10 minutes of context-setting, one pre-read: {{deep_dive_link}}. It's the technical deep-dive — three solver source files end-to-end, MC vs closed-form reconciliation, lab-cert paper trail walk-through. ~20 minutes to read.

I'll come prepared with:
- Live laptop (engine running, can port a title in real time if you want).
- Pilot tarball ready to hand over.
- 4-lab cert dossier samples staged.

Anything specific you'd like me to dig into before the call?

Best,
{{sender_name}}
{{sender_phone}} | {{sender_link}}

## Suggested links
- {{deep_dive_link}}: docs/LW_TECHNICAL_DEEP_DIVE.md

## Placeholder reference
- {{first_name}} — CTO first name
- {{intro_name}} — the mutual contact who introduced you
- {{day}} — "Tuesday" / "Thursday"
- {{time}} — "10:30 AM PT"
- {{deep_dive_link}}
- {{sender_*}}

## Send checklist
- [ ] Sent within 4 hours of the intro email landing
- [ ] {{intro_name}} explicitly thanked (re-affirms the social bond)
- [ ] Pre-read URL works from CTO's IP (test from external network)
- [ ] Mention live-laptop readiness — sets tone for non-slide meeting

## Day-before
- Re-send a 1-line confirmation: "On for tomorrow {{time}} — Zoom link still {{link}}?"
- Refresh tarball with current date: `npm run pitch:tarball`
- Print speaker notes from `docs/LW_PILOT_PITCH_GUIDE.md` Room C section

## Follow-up
- Post-meeting → `followup-after-meeting.md`
