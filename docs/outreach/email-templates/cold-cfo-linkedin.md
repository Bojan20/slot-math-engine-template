# Cold CFO — LinkedIn DM

> Summary line 1: Cold LinkedIn DM to Vendor B CFO / VP Finance / Head of Corp Dev.
> Summary line 2: Tone: numerate, NPV/payback framed, no engineering jargon.
> Summary line 3: Goal: get on the corp dev / build-vs-buy short-list for FY planning.

## Tone notes
- CFOs want: NPV, payback period, build-vs-buy framing, downside-protection terms.
- Speak in dollars and quarters; never in solvers and kernels.
- Mention escrow / source-license / MIT-tier fallback explicitly — CFOs evaluate vendor risk.
- Keep ≤150 words.

## Subject line variants (LinkedIn opener)
- A: "Build-vs-buy on the math engine layer — 3-page model inside"
- B: "$33M five-year NPV from compressing math-cert window — model inside"
- C: "Re: studio acceleration — financial model + escrow option"

## Body
Hi {{first_name}},

I'm reaching out on the corp dev / build-vs-buy lens. We've built a math engine (slot-math-engine) that compresses the math + cert paper trail for new title launches from 12–18 weeks down to 14 days. Three commercial pathways for Vendor B:

1. **Acquire** — full IP transfer; clean-room provenance; engineering team transitions.
2. **License** — perpetual or annual, source-available with escrow trigger if we wind down.
3. **Pilot** — 30-day, no cost-to-walk-away, sandbox tenant.

Two artifacts a CFO can scan:

- One-pager (numbers + terms): {{one_pager_link}}
- 5-year NPV model: {{roi_link}} — base case +$33M @ 24 ships/yr

15 min {{week_window}}? Happy to share the per-pathway pricing range in advance if that helps prep.

Best,
{{sender_name}}

## Suggested links
- {{one_pager_link}}: outreach one-pager
- {{roi_link}}: ROI model

## Placeholder reference
- {{first_name}}, {{one_pager_link}}, {{roi_link}}, {{week_window}}, {{sender_name}}

## Send checklist
- [ ] Sender name uses full legal name, not nickname
- [ ] No technical terms ("solver", "kernel", "IR", "DSL") in body
- [ ] One-pager loads instantly on mobile
- [ ] Escrow option is mentioned (de-risks evaluation)

## Follow-up trigger
- 5 days no response → `followup-no-response.md`
- Asks for pricing → respond with pricing range, do NOT lock numbers until pilot
- Forwards to legal → send `warm-cfo-intro.md` to the legal contact

## What CFOs ask first
- "What's your runway?" → addressed by escrow option
- "What's the dilution / equity ask?" → none in license/pilot path; only in acquire
- "Who else is in the deal?" → "We're talking to {{competitor_name}} but Vendor B is the natural fit"
- "What's the exit?" → keep ambiguous; depends on commercial pathway
