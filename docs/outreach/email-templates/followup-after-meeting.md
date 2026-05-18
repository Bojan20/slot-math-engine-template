# Follow-up — After First Meeting

> Summary line 1: Thank-you + next-steps email within 2 hours of the meeting ending.
> Summary line 2: Tone: action-oriented, recap-focused, no new selling.
> Summary line 3: Goal: anchor the next meeting on the calendar before momentum decays.

## Tone notes
- Send within 2 hours of meeting (highest reply rate); within 24 hours absolute max.
- Recap what they said, not what you said. Mirroring builds trust.
- Concrete next step with a date — never "let's stay in touch".
- ≤180 words.

## Subject line variants
- A: "Re: today's call — recap + next steps"
- B: "Thanks for the time — three follow-ups attached"
- C: "Following up from {{day}} — proposed next step inside"

## Body
Hi {{first_name}},

Thanks for the time today — great session.

Quick recap of what I heard from you:

1. {{their_concern_1}} — addressed by {{your_answer_1_short}}; full detail in {{artifact_1_link}}.
2. {{their_concern_2}} — we'd handle this via {{your_answer_2_short}}; reference: {{artifact_2_link}}.
3. {{their_concern_3}} — open question; I'll come back to you by {{date}} with a concrete answer.

Three things attached / linked:

- Updated pitch tarball with today's date: {{tarball_link}}
- The {{specific_doc_they_asked_for}}: {{specific_link}}
- Calendar invite for our follow-up: proposed {{next_meeting_date}} at {{next_meeting_time}}

If the proposed time doesn't work, here are two backups: {{backup_1}} / {{backup_2}}. Just hit reply.

Looking forward to {{next_meeting_topic}}.

Best,
{{sender_name}}
{{sender_phone}} | {{sender_link}}

## Suggested attachments
- Updated pitch tarball (fresh date, fresh manifest)
- The one specific document they asked about during the call
- Calendar invite (.ics) for follow-up

## Placeholder reference
- {{first_name}}, {{their_concern_1..3}}, {{your_answer_1..2_short}}, {{artifact_1..2_link}}, {{date}}, {{tarball_link}}, {{specific_doc_they_asked_for}}, {{specific_link}}, {{next_meeting_date}}, {{next_meeting_time}}, {{backup_1..2}}, {{next_meeting_topic}}, {{sender_*}}

## Send checklist
- [ ] Sent within 2 hours of meeting end (set a hard timer in the meeting)
- [ ] All three concerns addressed — even the one you don't know yet ("I'll come back to you by X")
- [ ] Next meeting is concrete with a real date, not "let's stay in touch"
- [ ] Two backup time slots offered (reduces friction)
- [ ] Updated tarball linked (showing continuous shipping)

## What good looks like
- Reply rate target: ≥80% (they were in the meeting; if no reply, it went badly)
- Next meeting booked: ≥50% on first follow-up
- If they don't book: send `followup-no-response.md` 5 days later, then close the loop

## If they didn't book in the first follow-up
- 5 days → send a one-line nudge with the calendar invite link only
- 14 days → close the loop; revisit in next quarter

## Internal action items after sending
- [ ] Update CRM (scripts/outreach/crm-export.mjs) with new status
- [ ] Note their three concerns in the contact record for future calls
- [ ] If they asked for a custom artifact, calendar it on your side
