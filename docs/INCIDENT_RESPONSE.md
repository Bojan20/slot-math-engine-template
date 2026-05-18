# Incident Response Plan — `slot-math-engine-template`

**Author:** CORTI W205-SECURITY
**Last updated:** 2026-05-18
**Audience:** SRE, on-call engineers, security lead, customer success.

This document defines the platform's incident response workflow: how
incidents are classified, escalated, contained, and resolved, plus the
post-incident review process. It is the operational counterpart to
`docs/PENTEST_PLAN.md` (proactive) and `docs/SECURITY.md` (external
disclosure).

---

## 1. Severity classification

| Severity | Definition                                                                                                       | Examples                                                                                  | SLA to acknowledge |
|---       |---                                                                                                              |---                                                                                        |---                 |
| SEV1     | Full outage of production, or active data breach / confirmed unauthorized access to player or HSM data.          | Backend hard-down; HSM private key exfiltrated; wallet double-spend confirmed.            | 15 minutes         |
| SEV2     | Degraded service affecting > 25% of tenants, or suspected unauthorized access pending confirmation.              | Per-tenant rate limit thrashing; WebSocket fan-out broken; suspected SQL injection probe. | 30 minutes         |
| SEV3     | Single-tenant or single-feature regression; integrity-relevant bug.                                              | Single tenant's audit chain fails verify; cert PDF render slow.                            | 2 hours            |
| SEV4     | Minor degradation, observability gap, scheduled-fix backlog.                                                     | Lighthouse score dip; non-critical CVE in dev dependency.                                  | 1 business day     |
| SEV5     | Informational; tracked but not paged.                                                                            | Documentation drift; cosmetic UI defect.                                                   | Next sprint        |

---

## 2. On-call rotation (placeholder)

| Role               | Coverage             | Tooling           |
|---                 |---                   |---                |
| Primary on-call    | 24/7                 | PagerDuty schedule |
| Secondary on-call  | Business hours       | PagerDuty schedule |
| Security on-call   | 24/7 for SEV1/SEV2   | Dedicated rota    |
| Incident commander | Drawn from on-call   | Slack #incident-response |

Operational details (rotation cadence, comp time, escalation tree) live in
the internal runbook; this file documents the workflow.

---

## 3. Detection sources

| Source                              | Trigger                                                  | Severity hint  |
|---                                  |---                                                       |---             |
| PagerDuty alert from health check    | `/api/health` non-200 for ≥ 3 minutes                    | SEV1/2         |
| Prometheus alert (RTP drift)         | observed vs target > 0.5pp                               | SEV2           |
| OWASP audit weekly CI                | Critical finding count > 0                               | SEV2           |
| Dependency scan weekly CI            | Critical CVE                                             | SEV2           |
| Secrets sweep CI                     | Any secret committed                                      | SEV1           |
| Customer report                      | Email / portal ticket                                     | classify on intake |
| Regulator inquiry                    | Inbound from compliance contact                           | SEV2 by default |
| Pentester finding (during a pentest) | Verbal flag during engagement                             | per severity rules |

---

## 4. Response phases

### 4.1 Detection
1. Alert fires.
2. Primary on-call acknowledges within SLA.
3. Open incident channel: `#inc-YYYYMMDD-<short-desc>`.
4. Assign incident commander (IC).

### 4.2 Containment
- For SEV1: feature-flag affected route off; rotate compromised credentials immediately.
- For SEV2: enable enhanced logging; rate-limit suspect tenant.
- For SEV3+: open issue with reproduction.

### 4.3 Eradication
- Identify root cause (5 whys).
- Patch in branch `inc/<ticket>`; cherry-pick to release branch.
- Deploy with extra observability.

### 4.4 Recovery
- Verify metrics return to baseline.
- Re-enable feature flags.
- Notify customers when post-recovery SLA met.

### 4.5 Lessons learned (postmortem)
- Within 5 business days of resolution.
- Blameless format: timeline, root cause, contributing factors, action items.
- Stored under `docs/incidents/POSTMORTEM_<date>_<slug>.md` (placeholder folder).

---

## 5. Communication templates

### 5.1 Internal incident announcement

```
INCIDENT OPEN — SEV<n> — <short title>
Started: <ISO timestamp>
Impact: <one sentence>
IC: <@name>
Channel: #inc-<id>
Status page: <link>
```

### 5.2 Customer notice (SEV1/SEV2)

```
We are currently investigating a service incident affecting <component>.
Started: <UTC time>. Updates every 30 minutes.
We will publish a postmortem within 5 business days.
```

### 5.3 Regulator notice (SEV1 with data implications)

```
Dear <regulator>,

We are notifying you of a service incident at <UTC time> affecting <component>.
Per our compliance commitment we are providing this initial notice within 24
hours and will follow with a full report within 72 hours.

Initial impact assessment: <one paragraph>.
Containment steps taken: <bullets>.
Point of contact: <name, email, phone>.

Sincerely,
<L&W ops contact>
```

### 5.4 Press / public statement

Drafted by Communications; reviewed by Legal; published only after IC + Security lead approval.

---

## 6. Forensic preservation

For any SEV1 incident or any SEV2 with potential data exposure:

1. **Snapshot logs** — copy `/api/metrics` history + Fastify logs to immutable S3 (object-lock 7 years).
2. **Capture audit chain** — `curl /api/audit/<sessionId>` for every affected session; save raw JSON.
3. **Image affected hosts** — EBS snapshot prior to any rotation.
4. **Hash + sign artifacts** — sha256 + HSM-sign with the same ed25519 key used for cert paper trails.
5. **Chain of custody log** — who accessed what, when, why; recorded in the incident channel.

These artifacts feed into both the postmortem and any regulator submission.

---

## 7. Roles & responsibilities

| Role                | Responsibility                                                                            |
|---                  |---                                                                                       |
| Incident commander  | Owns timeline; calls SEV upgrades/downgrades; coordinates roles.                          |
| Comms lead          | Drafts customer / regulator / press statements; owns status page.                         |
| Tech lead           | Drives investigation; pairs with on-call engineers.                                       |
| Scribe              | Captures timeline; updates the incident channel.                                          |
| Security lead       | Decides on credential rotation, key revocation, regulator notification.                   |
| Customer success    | Field inbound from affected customers; route operational questions to IC.                 |

---

## 8. Drills

Quarterly tabletop exercises are scheduled per the SOC 2 plan:

| Drill                                    | Cadence    | Owner        |
|---                                       |---         |---           |
| Wallet double-spend simulation           | Quarterly  | Eng + Sec    |
| HSM key compromise tabletop              | Quarterly  | Sec          |
| Audit-chain tampering exercise           | Bi-annual  | Eng          |
| Multi-tenant CORS exfiltration tabletop  | Bi-annual  | Sec          |

Drill outcomes are captured in `docs/incidents/DRILL_<date>_<slug>.md`.

---

## 9. After action

After every SEV1/SEV2:

- Public postmortem within 14 days (if customer-impacting).
- Internal postmortem within 5 business days (blameless).
- Action items tracked to closure in repository issues.
- Threat model + SOC 2 evidence updated as needed.
