# 01 — Welcome email (post-deal)

> Send within 24 hours of contract signature.

**Subject:** Welcome aboard, {{customer_name}} — let's make this great

**Audience:** All key stakeholders (sponsor, ops lead, math lead)

**Cadence:** Day 0 (deal signed)

---

Hi {{primary_contact_first_name}},

On behalf of the entire team at the L&W slot-math platform, **welcome aboard.**
We are thrilled to officially count {{customer_name}} as a partner.

A quick overview of what happens next:

1. **Kickoff meeting** — I'd like to lock in 60 minutes within the next 5 business days.
   Suggested topics:
   - Introductions across both teams
   - Confirm scope, success metrics, and timeline
   - Review the implementation runway (we target first spin within 30 days)
   - Q&A on certification, jurisdictions, wallet integration
2. **Shared workspace** — I'll be sending you the Notion + Slack channel invites today.
3. **Your Customer Success Manager** — that's me. I'm your single point of escalation for
   anything that touches operations, certification, billing, or roadmap. My
   number is on the signature; treat it like the bat-phone.

A few helpful links so you can hit the ground running:

- Onboarding playbook: {{onboarding_playbook_url}}
- Sample IR file: {{ir_sample_url}}
- API reference: {{api_docs_url}}
- Status page: {{status_page_url}}

Reply with your top 3 priorities for the next 90 days so we can keep
the kickoff laser-focused.

Looking forward to a long and productive partnership.

— {{csm_name}}
Customer Success Manager, L&W slot-math platform
{{csm_email}} · {{csm_phone}}

---

**Internal notes:**
- CC the assigned sales rep + ops lead.
- Attach the welcome PDF (templates/welcome.pdf — version-controlled).
- Log a CSM activity in the CRM with category=`welcome` and stage=`deal_won`.
- Trigger the workflow that schedules the kickoff invite at T+2 business days.
