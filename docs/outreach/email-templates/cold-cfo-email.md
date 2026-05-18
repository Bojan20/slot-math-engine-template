# Cold CFO — Email

> Summary line 1: Cold outbound email to L&W CFO / VP Finance / Corp Dev lead.
> Summary line 2: Tone: numerate, multi-pathway commercial framing, escrow-risk-mitigation.
> Summary line 3: Goal: get on build-vs-buy short-list; 30-min commercial deep-dive call.

## Tone notes
- Frame as a build-vs-buy decision they will make anyway, not a vendor pitch.
- Acquire / License / Pilot — all three options in body, NPV per pathway.
- Mention escrow + clean-room IP provenance — CFO due-diligence concerns.
- Keep ≤200 words.

## Subject line variants
- A: "Build-vs-buy for the math engine layer — financial model attached"
- B: "5-year NPV +$33M on studio cadence acceleration — model link"
- C: "Three commercial pathways for L&W (acquire / license / pilot) — 30 min?"

## Body
Hi {{first_name}},

I'm reaching out on the corporate-development angle. We've built a math engine (slot-math-engine) that accelerates the math + cert paper-trail phase of slot title launches from 12–18 weeks to ~14 days. The financial frame:

| Pathway | Upfront | Annual | NPV impact (5yr, base case) | Risk profile |
|---|---|---|---|---|
| Acquire | {{acquire_price_range}} | n/a | +{{acquire_npv}} | Highest control, no vendor risk |
| License | {{license_upfront}} | {{license_annual}} | +{{license_npv}} | Source-available + escrow trigger |
| Pilot | $0 | 30 days only | +0 (validation) | Zero — no cost-to-walk-away |

Why we think L&W is the natural fit: 16/16 published L&W mechanic families covered closed-form, paper-trail compatible with your existing BMM/GLI submission flow, MIT-licensed clean-room provenance (0 IP infringement risk verified per dossier).

Two artifacts:

- One-pager (numbers + terms): {{one_pager_link}}
- 5-year NPV model with sensitivity table: {{roi_link}}

30 minutes {{week_window}}? I'll bring the per-pathway pricing range and the IP provenance dossier.

Best,
{{sender_name}}
{{sender_title}} | slot-math-engine
{{sender_email}}

## Suggested links
- {{one_pager_link}}: docs/outreach/one-pager.html
- {{roi_link}}: ROI calculator + sensitivity tables

## Placeholder reference
- {{first_name}}, {{acquire_price_range}}, {{acquire_npv}}, {{license_upfront}}, {{license_annual}}, {{license_npv}}, {{one_pager_link}}, {{roi_link}}, {{week_window}}, {{sender_*}}

## Send checklist
- [ ] NPV table fields filled with current model output
- [ ] One-pager link tested in incognito
- [ ] Subject A/B chosen
- [ ] Sent 9:00–10:30 target-local

## Follow-up trigger
- 5 days no response → `followup-no-response.md`
- Asks pricing → respond with full pricing PDF
- Forward to legal → trigger `warm-cfo-intro.md` to legal lead

## CFO objection map
- "Vendor risk" → escrow + MIT license tier addresses it
- "Why not build in-house?" → 100+ waves of solver work; opportunity cost ≠ headline cost
- "Why now?" → competitor catalog gap; first-mover advantage on 14-day cadence
- "What if you fail?" → escrow source release; we don't hold L&W hostage
