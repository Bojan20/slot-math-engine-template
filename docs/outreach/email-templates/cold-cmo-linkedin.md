# Cold CMO — LinkedIn DM

> Summary line 1: Cold LinkedIn DM to Vendor B CMO / VP Marketing / Head of Studio Marketing.
> Summary line 2: Tone: market-narrative, time-to-market angle, NOT technical.
> Summary line 3: Goal: warm intro to CTO + CFO via CMO, who controls C-level intros.

## Tone notes
- CMOs respond to time-to-market + competitive-share narrative, not solver counts.
- Lead with what they care about: ship more games per quarter than Pragmatic.
- Keep brand-safe; never say "Vendor B is slow" — say "the industry's release cadence".
- One concrete competitive frame, one ROI number, one ask.

## Subject line variants (LinkedIn opener)
- A: "Vendor B could ship a lab-cert'd title every 14 days — happy to show how"
- B: "Time-to-market angle on the Pragmatic catalog gap — 15 minutes?"
- C: "{{lw_title_example}} math IR'd in under a week — would your studio team find that useful?"

## Body
Hi {{first_name}},

I'm writing on the studio time-to-market side. Right now the industry baseline is 12–18 months from greenlight to lab-cert ship. We've built a math engine that compresses the math + cert paper trail portion to 14 days, end-to-end, with all four major labs (BMM/GLI/eCOGRA/NMi) plugged in.

What this means concretely: if Vendor B's roadmap has, say, 8 new title launches planned for {{quarter}}, the math-stage gating could absorb 20+ instead — without expanding the math team.

Two artifacts you might want:

- **One-pager**: {{one_pager_link}} — single page, 4 quadrants, no math jargon.
- **ROI model**: {{roi_link}} — 5-year NPV impact of moving from 8 to 24 ships per year.

15 minutes to walk you through, or I'm equally happy if you'd rather just forward to your CTO + CFO. Whichever is faster for you.

— {{sender_name}}
{{sender_title}}

## Suggested links to include
- {{one_pager_link}}: docs/outreach/one-pager.html (printable)
- {{roi_link}}: web/pitch/lw-deck.html#slide-10 anchor or standalone ROI page

## Placeholder reference
- {{first_name}} — CMO first name
- {{quarter}} — "H2 2026" or "Q1 2027"
- {{lw_title_example}} — a competitor title Vendor B might want to respond to
- {{one_pager_link}}, {{roi_link}} — URLs
- {{sender_name}}, {{sender_title}}

## Send checklist
- [ ] Quarter field reflects their actual planning cycle
- [ ] One-pager URL works on mobile (CMOs check LinkedIn on phone)
- [ ] No technical jargon in body
- [ ] Sent during US business hours

## Follow-up trigger
- No response in 5 days → `followup-no-response.md` with CMO variant
- Reply asking for more → switch to `warm-cmo-intro.md`
- Forwards to CTO → ride the warmth, send `warm-cto-intro.md`

## CMO-specific FAQ to anticipate
- "What's the catch?" → 30-day pilot, no cost-to-walk-away, MIT license tier available.
- "How is this not just better tooling for our math team?" → It's both — strict-superset.
- "Why hasn't Vendor B built this internally?" → Closed-form solver portfolio took 100+ waves; we did it because it's our only product. Vendor B's math team builds great games; that's a different superpower.
