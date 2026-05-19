# Tier-2 Cold Outreach — Email Template

> Summary line 1: Generic cold-email template for any of the 8 Tier-2 slot operators (Aristocrat, IGT, Konami, Novomatic, Playtech, Everi, Ainsworth, AGS).
> Summary line 2: Tone: technical peer + commercial pragmatist. One number, one differentiator, one ask.
> Summary line 3: Goal: 30-min math-team code walk OR NDA exchange to forward to Corp Dev.

## Tone notes
- Mirror the structure of `cold-cto-email.md` (technical peer framing).
- Substitute the operator name and flagship title to land specificity in line 1.
- Coverage % is concrete proof; ground it in the matching mechanic-family.
- Avoid "demo" in the subject — read as sales-call by technical recipients.
- Keep under 180 words.

## Subject line variants
- A: "{{operator_name}} math engine peer-review — {{coverage_pct}}% portfolio match"
- B: "Closed-form solver for {{flagship_title}}'s math signature — code walk?"
- C: "{{operator_name}} portfolio: {{coverage_pct}}% covered by our engine, config-only — 30-min walk?"
- D: "We built the math engine layer {{operator_name}} could license — proof tarball inside"

## Body
Hi {{first_name}},

I lead engineering on slot-math-engine — a closed-form math kernel covering ~80% of the published Tier-2 slot mechanic palette with cert paper-trail wired for BMM/GLI/eCOGRA/NMi labs.

We benchmarked our solvers against {{operator_name}}'s public catalogue. Result: **{{coverage_pct}}% of {{operator_name}}'s active titles map to our existing solvers config-only**. Anchor signal: {{flagship_title}}'s math signature reproduces within 0.001 absolute RTP from our closed-form derivation.

Three artifacts you can verify without a meeting:

- **Coverage matrix**: `reports/outreach/TIER2_COVERAGE.md` — mechanic-by-mechanic match grid.
- **Portfolio fit**: `reports/outreach/PORTFOLIO_FIT_{{operator_slug}}.md` — weighted coverage + 5yr NPV.
- **Solver dossier**: {{deep_dive_link}} — three solver source files end-to-end.

If after reviewing the artifacts you'd like a 30-min walk-through with your math team (no slides), I block {{week_window}} for {{decision_maker_role}} or peer. If not, no follow-up — the artifacts stand on their own.

Best,
{{sender_name}}
{{sender_title}} | slot-math-engine
{{sender_email}} | {{sender_link}}

## Suggested links to include
- {{deep_dive_link}}: docs/outreach/operators-tier2/{{operator_slug}}.md (per-operator dossier)
- Coverage matrix link: reports/outreach/TIER2_COVERAGE.md
- Portfolio fit link: reports/outreach/PORTFOLIO_FIT_{{operator_slug}}.md

## Placeholder reference
- {{operator_name}} — display name, e.g. "Aristocrat", "IGT", "Konami"
- {{operator_slug}} — lowercase slug, e.g. "aristocrat", "igt", "konami"
- {{flagship_title}} — operator flagship, e.g. "Buffalo", "Wheel of Fortune", "Book of Ra"
- {{coverage_pct}} — integer percentage from coverage matrix
- {{decision_maker_role}} — role placeholder, e.g. "Chief Math Officer", "VP Game Development"
- {{first_name}} — target's first name (or salutation fallback)
- {{week_window}} — "Tue–Thu next week, mornings local"
- {{deep_dive_link}} — per-operator dossier URL
- {{sender_name}}, {{sender_title}}, {{sender_email}}, {{sender_link}}

## Per-operator suggested fills

| operator_slug | operator_name | flagship_title | coverage_pct | decision_maker_role |
|---|---|---|---|---|
| aristocrat | Aristocrat | Buffalo | 82 | Chief Math Officer |
| igt | IGT | Wheel of Fortune | 71 | Chief Math Officer |
| konami | Konami Gaming | China Shores | 88 | SVP Engineering |
| novomatic | Novomatic / Greentube | Book of Ra | 79 | CTO of Greentube |
| playtech | Playtech | Age of the Gods | 76 | Chief Math Officer |
| everi | Everi | Cash Machine | 85 | VP Engineering |
| ainsworth | Ainsworth | Mustang Money | 88 | VP Game Development |
| ags | AGS | Rakin' Bacon | 84 | Chief Math Officer |

## Send checklist
- [ ] {{operator_name}} + {{flagship_title}} both substituted in subject and body
- [ ] {{coverage_pct}} matches latest TIER2_COVERAGE.md output
- [ ] {{decision_maker_role}} matches the actual target role
- [ ] Plain-text fallback verified
- [ ] Coverage matrix + portfolio fit links resolve in incognito
- [ ] Sent Tuesday–Thursday, 9:30–11:00 target-local

## Follow-up trigger
- Day 5 no response → `followup-no-response.md` (operator-substituted)
- Reply → meeting scheduled → `pre-pitch-checklist.md`
- Forward to Corp Dev → trigger `cold-cfo-email.md` (substituting tier2 operator)

## A/B test plan
- Send 5 with subject A (peer-review framing, coverage % anchor).
- Send 5 with subject B (flagship-title anchor).
- Reply rate threshold: ≥1 reply per 5 = continue; 0/5 = revise body.
