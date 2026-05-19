# 12 — Escalation acknowledgment

> Send within 1 hour of a customer-initiated escalation.

**Subject:** Got it — escalation acknowledged for {{customer_name}}

**Audience:** Customer point of contact + cc internal lead

**Cadence:** Immediate, automated by the support ticketing SLA breach hook

---

Hi {{primary_contact_first_name}},

This is to confirm that we've **received and acknowledged** your
escalation regarding {{escalation_topic}}.

- **Reference ticket:** {{ticket_id}}
- **Severity:** {{ticket_severity}}
- **Owner:** {{escalation_owner}}
- **Next update:** by {{next_update_at}}

We are treating this with the seriousness it deserves. You will
receive a substantive update from {{escalation_owner}} within the
window above — not just a status ping.

If anything changes on your side, reply to this thread and we will
re-prioritize.

— {{csm_name}}

---

**Internal notes:**
- This template is what the support-ticket auto-escalation pipeline
  uses for the customer-facing email when a P0/P1 SLA breaches.
- The `next_update_at` placeholder should be set by the SLA module
  (W215 support-tickets) — never wing it.
