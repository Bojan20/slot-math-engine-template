# Vendor B Contact List — Template

> Structured template (schema only, no real PII). Use this as the canonical contact tracking format.
> Companion CSV with same columns lives at `docs/outreach/L_W_CONTACTS.csv` (generate from your CRM).
> Status changes go into the table below + corresponding row in the CSV for tooling.

## Schema

| Field | Type | Notes |
|---|---|---|
| Name | string | Full name |
| Role | enum | One of: CEO, CTO, COO, CFO, CMO, HeadOfStudio, MathLead, EngManager, ComplianceOfficer, PartnershipLead, Other |
| Email | string | Use placeholder `<email>` if not yet sourced |
| LinkedIn | string | Public LinkedIn URL or "—" |
| Phone | string | Use "—" if unknown; never publish real phone numbers in version control |
| FirstContactDate | YYYY-MM-DD | Date of first outreach attempt |
| LastContactDate | YYYY-MM-DD | Most recent touch |
| Status | enum | See status enum below |
| NextAction | string | What you commit to doing next; with a date |
| Owner | string | Who on your team owns this relationship |

### Status enum

| Value | Meaning |
|---|---|
| `cold` | No contact attempted yet |
| `contacted_no_response` | Sent ≥1 message, no reply |
| `replied_interested` | Engaged in conversation, has not yet committed to meeting |
| `meeting_scheduled` | Meeting on calendar |
| `demo_done` | Live or recorded demo delivered |
| `in_negotiation` | Commercial terms under discussion |
| `won` | Pilot signed or contract closed |
| `lost` | Polite or hard "no" |
| `shelved` | Revisit in 90+ days |

## Suggested categories to populate

For an Vendor B full-spectrum coverage, aim to source contacts in each of these categories:

### Executives (highest priority)
- CEO
- CTO / Chief Engineering Officer
- COO
- CFO / Head of Corp Dev
- CMO / VP Marketing
- Chief Product Officer
- Chief Compliance Officer

### Heads of Studio
- Head of Studio (per studio: e.g., Vendor H Studio, SG Studio, Reno Studio)
- Studio Math Director
- Studio Producer

### Math leads
- VP / Head of Math
- Senior Math Designer (3–5 names typical)
- Math QA Lead

### Engineering managers
- VP Engineering
- Director of Engineering, Slots
- Director of Engineering, Platform
- Director of Engineering, Server / Backend

### Compliance officers
- Chief Compliance Officer
- Director of Lab Submissions
- Jurisdiction Compliance Manager (UK / EU / NA / AU)

### Partnership leads
- VP Business Development
- Head of Strategic Partnerships
- M&A Director

---

## Sample row (template, NO real data)

| Name | Role | Email | LinkedIn | Phone | FirstContact | LastContact | Status | NextAction | Owner |
|---|---|---|---|---|---|---|---|---|---|
| {{name_1}} | CTO | <email> | <linkedin_url> | — | 2026-05-20 | 2026-05-20 | cold | Send cold-cto-linkedin DM by 2026-05-22 | {{owner}} |
| {{name_2}} | CMO | <email> | <linkedin_url> | — | — | — | cold | Research + draft cold-cmo-linkedin by 2026-05-25 | {{owner}} |
| {{name_3}} | CFO | <email> | <linkedin_url> | — | — | — | cold | Wait for warm-intro from {{intro_contact}} | {{owner}} |
| {{name_4}} | HeadOfStudio | <email> | <linkedin_url> | — | — | — | cold | Comment on their G2E speaker slot promo post | {{owner}} |
| {{name_5}} | MathLead | <email> | <linkedin_url> | — | — | — | cold | Engagement via shared math-conference attendance | {{owner}} |
| {{name_6}} | ComplianceOfficer | <email> | <linkedin_url> | — | — | — | cold | Send compliance-specific outreach with lab matrix one-pager | {{owner}} |
| {{name_7}} | PartnershipLead | <email> | <linkedin_url> | — | — | — | cold | Mutual-investor intro path | {{owner}} |

---

## Where to find public-source contact details

| Source | What it gives you | Caveats |
|---|---|---|
| LinkedIn | Name, role, tenure, mutual connections, recent activity | Public profile is the most reliable source |
| Vendor B investor relations page | Press releases name C-level when they're quoted | Use as a tenure / role-confirmation cross-check |
| Vendor B annual report | Top 5–8 named executives w/ photos | Available via SEC EDGAR for the publicly-traded parent |
| G2E / ICE / SBC speaker pages | Bio + role + sometimes email | Conference organizer sites are public |
| Crunchbase | C-level history, prior companies | Free tier sufficient |
| Glassdoor | Org culture signals, internal review themes | Take individual reviews with salt; trend lines matter |
| Apollo / Hunter (legal tools) | Email pattern inference | Only use if you have a legitimate-interest basis per GDPR/CCPA |
| Public conference Q&A recordings | How they speak, what they care about | YouTube; gold for personalization |

**Do NOT** scrape or buy contact lists from grey-market data brokers. Reputation cost > pipeline benefit.

---

## Workflow

1. **Source** a target → add a row with `cold` status.
2. **Research** → write up the per-target one-page note (see CADENCE_PLAYBOOK Week 1).
3. **First contact** → update `FirstContactDate`, set status to `contacted_no_response`.
4. **Reply lands** → update status to `replied_interested`, log the reply text in your CRM (not this MD).
5. **Meeting scheduled** → update `Status = meeting_scheduled`, set `NextAction = "Pre-pitch checklist for {{date}}"`.
6. **Demo done** → status `demo_done`, next action = follow-up-after-demo email.
7. **Negotiation** → status `in_negotiation`, owner shifts from outbound to commercial lead.
8. **Closed** → status `won` or `lost`.

---

## GDPR / privacy notes

- Lawful basis for storing C-level contact info: legitimate interest (commercial outreach to publicly-listed corporate roles).
- Retention: 24 months from last contact; then purge if no engagement.
- DSR (Data Subject Request): if a contact asks for deletion, comply within 30 days.
- Never store sensitive data (race, health, etc.) — only commercial/public-role info.
- This template file is the schema; real contact data lives in your CRM, NOT in version control.

---

## CRM tooling

Export this list to your CRM via:

```sh
# Generate HubSpot CSV
node scripts/outreach/crm-export.mjs --format=hubspot --input=docs/outreach/L_W_CONTACTS.csv --output=dist/outreach/hubspot-import.csv

# Generate Salesforce CSV
node scripts/outreach/crm-export.mjs --format=salesforce --input=docs/outreach/L_W_CONTACTS.csv --output=dist/outreach/sf-import.csv

# Generate Pipedrive JSON
node scripts/outreach/crm-export.mjs --format=pipedrive --input=docs/outreach/L_W_CONTACTS.csv --output=dist/outreach/pipedrive.json

# Generate VCards
node scripts/outreach/crm-export.mjs --format=vcard --input=docs/outreach/L_W_CONTACTS.csv --output=dist/outreach/contacts.vcf

# Dry-run email merge with a template
node scripts/outreach/crm-export.mjs --merge --template=docs/outreach/email-templates/cold-cto-email.md --input=docs/outreach/L_W_CONTACTS.csv --dry-run
```
