# Follow-up — After Demo

> Summary line 1: Post-demo recap email within 4 hours; ships the tarball + pilot proposal.
> Summary line 2: Tone: confident, specific, next-step is a yes/no pilot decision.
> Summary line 3: Goal: move from demo'd to pilot-signed in ≤2 weeks.

## Tone notes
- After a demo, momentum is at peak. Use it.
- Tarball is the centerpiece — they should have everything they need to evaluate offline.
- Propose a pilot start date within the email — don't leave it open.
- ≤220 words (slightly longer is OK; recipient is engaged).

## Subject line variants
- A: "Re: today's demo — tarball + proposed pilot start date inside"
- B: "Pilot proposal for Vendor B: 30 days starting {{proposed_start_date}}"
- C: "Demo recap + the four things you'd need to start a pilot"

## Body
Hi {{first_name}},

Great demo today — thanks for the deep questions on {{specific_demo_moment}}.

Tarball with everything we covered: {{tarball_link}}
- Engine snapshot at today's commit (Ed25519-signed manifest)
- Live integration suite output (10/10 PASS at demo time)
- Per-operator branded README (your team name pre-filled)
- 4-lab cert dossier sample
- ROI model with the numbers we discussed in-meeting

You asked about {{their_specific_question}} during the demo. Detailed answer here: {{specific_link}}. Short version: {{one_sentence_answer}}.

**Proposed pilot path**:

- **Day 0** ({{proposed_start_date}}): we provision the sandbox tenant, port one of your titles (you pick), seed the math IR.
- **Day 7**: closed-form solver outputs reconciled with your existing cert dossier.
- **Day 14**: lab-cert paper trail dry-run with BMM or GLI (your choice).
- **Day 22**: cert export + dossier delivered.
- **Day 30**: you decide pilot → license / acquire / walk-away. Zero cost-to-walk-away.

If {{proposed_start_date}} doesn't work, alternate: {{alt_start_date}}.

What do you need from us in the next 48 hours to make this a yes/no by {{decision_date}}?

Best,
{{sender_name}}
{{sender_phone}} | {{sender_link}}

## Suggested attachments
- Tarball (fresh)
- Pilot SOW one-pager (single page, ≤500 words)
- Calendar invite for pilot kick-off

## Placeholder reference
- {{first_name}}, {{specific_demo_moment}}, {{tarball_link}}, {{their_specific_question}}, {{specific_link}}, {{one_sentence_answer}}, {{proposed_start_date}}, {{alt_start_date}}, {{decision_date}}, {{sender_*}}

## Send checklist
- [ ] Sent within 4 hours of demo
- [ ] Tarball is fresh — `npm run pitch:tarball` re-run today
- [ ] Per-operator branding applied (Agent C scripts)
- [ ] Pilot start date is concrete, no vague "soon"
- [ ] Decision date proposed (creates urgency without being pushy)

## What good looks like
- Reply rate: ≥90%; the demo proved we could ship
- Pilot signed: ≥30% on first follow-up; ≥60% within 2 weeks
- Decision by {{decision_date}}: clean yes / no / "later" — never ghosted

## If they push back on pilot timing
- "We need internal alignment first" → send `OBJECTION_RESPONSES.md` "internal alignment" section
- "Q3 is too busy" → offer Q4 start with calendar hold; do NOT shift to next year without push-back
- "We need our legal team to review" → send your IP provenance dossier + standard pilot SOW

## Internal action items
- [ ] Update CRM status to "demo_done"
- [ ] Flag for ops: pilot tenant pre-provisioning if {{proposed_start_date}} confirmed
- [ ] Update master TODO with pipeline row
- [ ] Brief Agent A (engineering) on the title they want to port
