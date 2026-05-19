# CSM Operations — Data Model & Tooling Reference

> Companion to `CSM_PLAYBOOK.md`. The playbook tells the team **what to
> do**; this document tells them **what to use** (and where the data
> lives).

## 1. Overview

The W215 Customer Success Operations suite adds six post-deal tools on
top of the existing pre-deal pipeline (W213 outreach, W214 deal flow):

| Tool | What it does | File |
|---|---|---|
| Customer onboarding tracker | 8-state journey + SLA | `server/state/customer-onboarding.ts` |
| Support ticketing | P0-P3 tickets + auto-escalation | `server/state/support-tickets.ts` |
| NPS survey | Tokenized link + classification | `server/lib/csm/nps.ts` |
| Churn risk scorer | 6-signal weighted score | `server/lib/csm/churn-risk.ts` |
| MBR generator | Monthly markdown + HTML + PDF stub | `scripts/csm/generate-mbr.mjs` |
| CSM dashboard | Operator-side tab | `web/operator/src/csm-dashboard.ts` |

## 2. When to use which

- **About to onboard a new customer?** → Use the onboarding tracker
  (`POST /api/csm/customers`). The state machine enforces a clean
  hand-off; never bypass it.
- **Customer reports a bug / question / billing issue?** → Open a
  ticket (`POST /api/support/tickets`). Severity drives SLA; never set
  an artificial P0 to "make things happen" — it pollutes metrics.
- **Want to know how a customer feels?** → Send the NPS invitation
  (`POST /api/csm/nps/send`). The tokenized link is single-use and
  expires in 14 days.
- **Worried about a customer?** → Run the churn-risk scorer
  (`GET /api/csm/churn-risk`). Severity = high or critical triggers
  template **11 churn-save-outreach** within 48h.
- **Monthly review coming up?** → Generate the MBR
  (`node scripts/csm/generate-mbr.mjs --tenant=<id> --month=YYYY-MM`).
  The output is 3 files (md / html / pdf-stub) ready to share.
- **Need the bird's-eye view?** → Open the operator dashboard CSM tab.
  Click any row for the per-tenant detail page.

## 3. Data model

### `customer_onboarding`

```
customer_id      uuid    primary key
tenant_id        text    unique, fk-like to tenants.tenant_id
display_name     text
tier             enum    enterprise|platform|indie
deal_value_usd   numeric
csm_email        text    lowercased
stage            enum    deal_won|kickoff_scheduled|kickoff_done|
                         integration_in_progress|first_spin|
                         soft_launch|full_launch|first_renewal_due
stage_entered_at timestamptz
renewal_due_at   timestamptz
history          jsonb   append-only [{ fromStage, toStage, occurredAt, actor, note }]
```

### `support_tickets`

```
id                  uuid    primary key
tenant_id           text
raised_by           text    lowercased
title               text
description         text
severity            enum    P0|P1|P2|P3
category            enum    bug|question|feature_request|billing
status              enum    open|in_progress|waiting_customer|resolved|closed
assignee            text
sla_deadline        timestamptz
first_response_at   timestamptz  null until first non-customer comment
escalations         jsonb   append-only
comments            jsonb   append-only
resolved_at         timestamptz
```

### `nps_responses`

```
id                 uuid    primary key
tenant_id          text
respondent_email   text
score_out_of_10    smallint  0..10
comment            text
survey_date        timestamptz
category           enum    detractor|passive|promoter
sentiment          enum    positive|neutral|negative|unknown
tags               jsonb   themes extracted from the comment
```

## 4. Integration points

| Source | Consumer | Why |
|---|---|---|
| W208 cache | All CSM endpoints | Cache hot lists (active tickets, dashboard rollups) |
| W208 rate-limit | CSM endpoints | Per-tenant throttle (default 600 rpm) |
| W208 observability | CSM endpoints | Structured logs + metrics counter |
| W208 tenant isolation | Support tickets | Enforces tenant scope on every query |
| W213 PII redactor | All log lines that touch customer data | Strip emails from log payloads |
| W213 contact tracking | NPS send + dashboard | Per-contact opt-in to surveys |
| W214 compliance posture | Churn risk + MBR | Compliance pending → +risk |
| W212 anomaly mitigation | Churn risk + MBR | Anomaly count is a signal |

## 5. Email sending stub

Real SMTP delivery is intentionally NOT wired in W215. The NPS
"composeInvite()" call returns the {token, subject, body, expiresAt}
shape; downstream automation (W21x) will pipe that into the
SES / SMTP provider. The unit test asserts that the body contains the
token and the link is well-formed.

To smoke-test the invitation flow:

```ts
const invite = nps.composeInvite('tenant-123', 'sponsor@operator.example');
console.log(invite.body);
// Click https://platform.example.com/csm/nps/respond?token=...
```

## 6. PII handling

All CSM modules treat `respondentEmail`, `raisedBy`, `csmEmail`, and
the `displayName` field as PII. Log lines that include them MUST be
routed through the W213 PII redactor first. Database backups follow the
existing retention policy (7 years for finance, 3 years for ops).

## 7. Quality bars

- **Customer onboarding store:** 18+ tests, full state-machine coverage.
- **Support tickets:** 22+ tests, including the SLA sweep edge cases.
- **NPS:** 15+ tests, classification deterministic.
- **Churn risk:** 18+ tests, deterministic on every input snapshot.
- **MBR generator:** 15+ tests, single-tenant report under 5 seconds.
- **Operator CSM dashboard:** 15+ tests, projection-layer only (DOM
  rendering covered by manual QA + Playwright).
- **CSM templates:** 12+ tests, structural validation.

## 8. Where the code lives

```
server/
  state/
    customer-onboarding.ts        # in-memory store
    customer-onboarding-pg.ts     # postgres mirror
    support-tickets.ts            # in-memory store
    support-tickets-pg.ts         # postgres mirror
  lib/csm/
    nps.ts                        # NPS classification + tokens
    churn-risk.ts                 # churn-risk scorer
  routes/
    csm.ts                        # /api/csm/* endpoints
  db/migrations/
    016_customer_onboarding.sql
    017_support_tickets.sql
    018_nps_responses.sql

scripts/csm/
  generate-mbr.mjs                # CLI MBR generator

web/operator/src/
  csm-dashboard.ts                # projection layer

docs/
  CSM_PLAYBOOK.md                 # how the team operates
  CSM_OPERATIONS.md               # this file
  csm-templates/                  # 15 email templates
```

---

*Maintained by Customer Success Operations. See CSM_PLAYBOOK.md for the
cadence guide.*
