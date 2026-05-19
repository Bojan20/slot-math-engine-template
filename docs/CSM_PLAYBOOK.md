# CSM Playbook — `slot-math-engine-template`

> Customer Success Operations (Wave 215, Faza 1300.0). This document is
> the canonical reference for how the Customer Success team operates
> the post-deal customer relationship. It is internally maintained;
> revisions go through a normal PR.

## 1. Mission

Make every customer **so successful** that they renew unprompted, expand
proactively, and refer their peers. Everything else flows from this.

## 2. Cadence by milestone

### Day 1 (deal signed)
- Send template **01-welcome-email** within 24 hours.
- Schedule kickoff (T+5 days).
- Update the customer record (W215 onboarding tracker) → `kickoff_scheduled`.
- Open the deal-room Notion + Slack channels.
- Hand-off note from sales to CSM filed in the deal-room.

### Week 1 (T+0 to T+7 days)
- Run kickoff call (template **02-kickoff-agenda**).
- Confirm key technical contacts (math, ops, comms).
- Walk through the operator dashboard, IR pipeline, certification flow.
- Move to `kickoff_done` after the meeting.

### Month 1 (T+7 to T+30 days)
- Move to `integration_in_progress` once the first IR ingestion begins.
- Run weekly status email (template **03-weekly-status**) every Friday.
- Target first spin within 30 days.
- When first spin lands: trigger template **04-first-spin-congrats** automatically.

### Month 3 (T+90 days)
- Run the 30-day check-in (template **06-30-day-checkin**).
- Send the first NPS survey (template **10**) AFTER the call, not before.
- Use the response to populate the churn-risk computation (W215).

### Month 6 (T+180 days)
- First QBR (template **07-qbr-intro**) with at least one executive on
  each side present.
- Roadmap preview (template **14**) tailored to the tenant's interest profile.
- Renewal pre-discussion 90 days before due (template **08**).

## 3. Per-segment playbook

| Segment | Touch cadence | Primary metric | Renewal lead time |
|---|---|---|---|
| **Enterprise** (>$2M ACV) | Weekly + monthly exec | NRR | 120 days |
| **Platform** ($500K-$2M) | Bi-weekly | GRR | 90 days |
| **Indie** (<$500K) | Monthly + quarterly | logo retention | 60 days |

Within each segment, the templates remain the same — the *cadence* and
*who's on the calls* change.

## 4. Escalation tree

```
Customer issue / signal
  → CSM (you)
    → Lead CSM (24h SLA to engage if no progress)
      → VP Customer Success (48h SLA)
        → CEO (only for churn-risk = critical or PR exposure)
```

Special rule: **P0 incidents** route directly to the on-call
engineering rotation AND the VP Customer Success in parallel. CSM
keeps the customer relationship warm; engineering keeps the system warm.

## 5. "If X happens, do Y" rules

| Signal | Action |
|---|---|
| Detractor NPS (0-6) | Send template **11** within 48h, schedule save call with VP within 5 business days |
| P0 ticket created | Page on-call, kick off template **13** update cadence (30 min), CSM owns customer comms |
| RTP drift event | Math team owns root cause; CSM informs customer within 24h, pre-emptive |
| NPS <6 from sponsor | Critical — escalate to VP Customer Success same day |
| Missed CSM call (2 in a row) | Reassign CSM if there's a fit issue, otherwise escalate |
| Renewal date within 60 days, no contact | Lead CSM owns immediately |
| Churn-risk = critical | VP Customer Success briefed within 24h, save plan within 5 business days |
| Anomaly count > 5 in 30d | Pre-emptive QBR slot, full root-cause document |

## 6. QBR agenda template

```
1. (10 min) Hellos + executive context
2. (25 min) Performance review (use W215 MBR generator output)
3. (20 min) Roadmap preview (template 14)
4. (20 min) Customer's priorities + asks
5. (10 min) Risks + commitments
6. (5 min)  Wrap + action items
```

Required artifacts: latest 3 MBR documents, latest NPS aggregate, churn-risk
snapshot, list of open P1+ tickets.

## 7. Customer churn save tactics

When a customer hits churn-risk = high or critical, run the **5-step save plan**:

1. **Listen first.** Schedule the save call within 5 business days; do
   not bring slides. Ask "what would 'success' look like from here?"
2. **Quantify the gap.** Translate complaints into measurable goals
   (uptime, NPS, latency, ticket MTTR).
3. **Commit publicly.** Send a written follow-up summarizing the
   commitments and the cadence under which we'll review them.
4. **Review weekly** until the churn-risk drops below `medium`.
5. **Close the loop.** When the score drops, send a thank-you note +
   schedule a celebration for the joint team.

A save plan that doesn't move the score in 60 days is escalated to the
VP Customer Success for either a leadership-level intervention or a
graceful exit.

## 8. Reference scripts for common situations

**"You're more expensive than competitor X."**
> "Thanks for sharing. Competitor X charges less because they charge for
> the kernel; we charge for the certification paper trail. If your
> regulators don't ask for that, you can save money with X. If they do,
> you're 6 months ahead with us. Want me to walk through the cert
> dossier we already have for {{jurisdiction}}?"

**"Your platform is hard to use."**
> "That's not the experience we want. Can you walk me through the
> exact workflow that frustrated you? We have a UX research budget
> earmarked for this — your input directly drives the next sprint."

**"We're considering moving in-house."**
> "Many of our customers have evaluated that. The math is usually a
> wash on the build side but compounds on the maintain side — every
> new jurisdiction is a multi-month project. Happy to share a
> total-cost-of-ownership model. Can we walk through it together?"

## 9. KPIs

| KPI | Definition | Owner | Cadence |
|---|---|---|---|
| **Logo retention** | (customers at end of period / customers at start of period) × 100, excluding upsells | VP CS | Monthly |
| **Net Revenue Retention (NRR)** | Σ(ARR end of period) / Σ(ARR start of period), including upsells, churn, expansion | VP CS | Quarterly |
| **Gross Revenue Retention (GRR)** | Same as NRR but EXCLUDING expansion | VP CS | Quarterly |
| **MBR completion rate** | (# MBRs sent / # MBRs due) × 100 | CSM team | Monthly |
| **NPS portfolio score** | (% promoters - % detractors) × 100 across all responses | CSM team | Quarterly |
| **Mean time to ticket first response** | Mean of (first_response_at - created_at) across open tickets | Support lead | Daily |
| **% customers on cadence** | % of customers with no missed CSM call in last 60d | Lead CSM | Weekly |

## 10. Tooling

All CSM tooling lives in the platform itself:

- **Onboarding tracker:** `POST/GET /api/csm/customers`, dashboard `CSM` tab
- **Support tickets:** `/api/support/tickets`
- **NPS survey system:** `/api/csm/nps/...`
- **Churn risk scorer:** `server/lib/csm/churn-risk.ts` (daily cron)
- **MBR generator:** `node scripts/csm/generate-mbr.mjs --tenant=<id> --month=YYYY-MM`
- **Email templates:** `docs/csm-templates/*.md` (15 templates)

When in doubt, prefer the dashboard over ad-hoc SQL — every action
through the dashboard generates an audit-log entry, which is gold
during QBRs and post-incident reviews.

---

*Maintained by Customer Success Operations. Last updated W215.*
