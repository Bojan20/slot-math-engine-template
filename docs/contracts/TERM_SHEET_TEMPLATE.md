> **DISCLAIMER:** This is a draft template for negotiation reference only.
> All legal terms require review and approval by licensed counsel before
> execution. Numbers, term lengths, and clause language are illustrative
> starting points — not binding commitments or legal advice.

# Commercial Term Sheet (Template)

**Wave:** W214 Faza 1100.0 — Post-Pitch Negotiation Toolkit  
**Document type:** Sales-engineering reference template  
**Status:** DRAFT — counsel review required before execution

This document is a **non-binding** outline of commercial terms intended
to facilitate negotiation between Operator and Vendor following a
successful Pilot (see `PILOT_AGREEMENT_TEMPLATE.md`). Binding terms
will be embodied in a Master Services Agreement (`MSA_TEMPLATE.md`).

The Vendor offers three commercial paths. The Operator may select one,
or — by mutual agreement — convert between tiers under Section
"Convertibility" below.

---

## Header

- **Operator:** `{{operator_name}}` (`{{operator_legal_entity}}`)
- **Vendor:** `{{vendor_legal_entity}}`
- **Term sheet date:** `{{term_sheet_date}}`
- **Selected tier:** `{{selected_tier}}` (A / B / C)
- **Negotiation lead (Operator):** `{{operator_negotiation_lead}}`
- **Negotiation lead (Vendor):** `{{vendor_negotiation_lead}}`

---

## Tier A — Platform License (Perpetual + Maintenance)

A one-time upfront license fee plus annual maintenance for predictable
TCO. Best for operators wanting full IP control and minimum royalty
friction.

### A.1 Pricing Bands (USD)

| Band  | Upfront license | Annual maintenance | Notes                                  |
| :---- | --------------: | -----------------: | :------------------------------------- |
| Low   |        $400,000 |            $80,000 | Tier-2 studios; ≤30 game ships/year    |
| Mid   |        $850,000 |           $170,000 | Tier-1 platform; 50-80 game ships/year |
| High  |      $1,600,000 |           $320,000 | Tier-1 mega-platform; >80 ships/year   |

### A.2 Key Terms

- **Exclusivity:** Non-exclusive license. Optional 12-month
  category-exclusivity rider available at +25% upfront premium.
- **Sublicensing rights:** Operator may sublicense the Engine to
  wholly-owned subsidiaries; transfer to third parties requires
  Vendor consent (not unreasonably withheld).
- **Custom development:** Up to 200 hours of custom solver / IR work
  included in upfront fee; additional work billed at
  `{{custom_hourly_rate}}` USD/hour.
- **Training:** Up to 5 days of on-site math-team training included.

### A.3 Service Levels

- Support hours: business hours, 5×8 (default); 24×7 available at
  +40% maintenance premium.
- Response time: P1 ≤2 hours; P2 ≤8 hours; P3 ≤1 business day.
- Escalation: dedicated CSM + named SRE on-call for Tier-A High band.

### A.4 Governance

- Quarterly steering committee (2 reps per Party).
- Change control via written change orders against Statement of Work.

### A.5 Termination

- For convenience (Operator): 90 days' notice; no refund of upfront,
  pro-rated maintenance refund.
- For cause (either Party): 30 days' cure period.

---

## Tier B — Revenue Share (Low Upfront + N% Game Revenue)

Lower upfront cost in exchange for ongoing royalty on game-attributable
revenue. Best for operators preferring opex over capex and willing to
share upside.

### B.1 Pricing Bands

| Band  | Upfront | Revenue share | Min annual | Notes                                  |
| :---- | ------: | ------------: | ---------: | :------------------------------------- |
| Low   | $50,000 |          3.0% |    $50,000 | Tier-2 studios                         |
| Mid   | $150,000|          4.0% |   $150,000 | Tier-1 platform                        |
| High  | $250,000|          5.0% |   $300,000 | Tier-1 mega-platform with high volume  |

Revenue share is applied to **gross game revenue** attributable to
titles built with the Engine, net of duties, taxes, and operator-level
jackpot contributions, and gross of player bonuses (the definition is
finalized in the MSA).

### B.2 Key Terms

- **Exclusivity:** Non-exclusive; category exclusivity rider not
  offered at Tier B (consider Tier A instead).
- **Sublicensing:** Permitted to wholly-owned subsidiaries; royalty
  flows through unchanged.
- **Custom development:** Billed at `{{custom_hourly_rate}}` USD/hour,
  no included hours.
- **Training:** Up to 3 days included.
- **Reporting:** Quarterly self-reported royalty statement with annual
  audit right (Vendor pays for audit unless variance > 5%).

### B.3 Service Levels

- Same as Tier A Mid band (business hours, P1/P2/P3 response).

### B.4 Termination

- For convenience (Operator): 6 months' notice; revenue share runs to
  end of notice period.
- For cause: 30 days' cure period.

---

## Tier C — Acquisition (Engine IP Outright)

Operator (or strategic acquirer) acquires the Engine IP outright,
including all solver kernels, IR specification, dossier toolchain, and
brand. Vendor founders enter retention and transition packages.

### C.1 Valuation Framework (USD)

| Range  | Valuation | Headline rationale                                |
| :----- | --------: | :------------------------------------------------ |
| Low    |     $200M | Asset purchase (engine + IP + 12 mo. support)     |
| Mid    |     $325M | + customer book, retention bonuses, 36 mo. earnout|
| High   |     $500M | Strategic premium: category lock + 5 yr. earnout  |

The valuation framework references comparable transactions and a DCF
based on Tier-A/Tier-B revenue projections (see
`ACQUISITION_DEAL_MEMO_TEMPLATE.md` for the full methodology and
sensitivity tables).

### C.2 Key Terms

- **Structure:** Asset purchase (preferred) or equity purchase of
  `{{vendor_legal_entity}}` (Operator election).
- **Earnout:** Up to 30% of headline valuation tied to 36-month revenue
  milestones from the engine business unit.
- **Retention:** Founder + key engineering retention package; vesting
  over 3 years.
- **Non-compete:** 24 months in the slot-math-engine category for
  selling principals.

### C.3 Service Levels (Transition)

- Founder + senior engineers retained for 12-24 months of integration
  support.
- Source escrow released to Operator at close.

### C.4 Termination

- Acquisition is not a license; "termination" maps to deal-stage walk-
  away (LOI fall-through, DD failure, financing condition not met).

---

## Cross-Tier Provisions

### Convertibility

- **A → B:** Operator may convert from Tier A to Tier B by paying
  unused maintenance into the new Tier B upfront fee, with the
  revenue-share clock starting on conversion date.
- **B → A:** At any anniversary, Operator may buy out the revenue share
  at **3× trailing-12-month royalty**, becoming Tier A on the buy-out
  date.
- **A or B → C:** Operator credit toward Tier C valuation equal to
  trailing-24-month payments under Tier A/B.

### Liability Cap (License Tiers Only)

Aggregate liability under Tier A or Tier B is capped at:

- Tier A: **the greater of $1M or the upfront fee**.
- Tier B: **the greater of $1M or trailing-12-month royalties**.

Exclusions: breach of confidentiality, IP indemnification, gross
negligence, willful misconduct.

### IP Indemnification

Vendor indemnifies Operator against third-party IP infringement claims
arising from use of the Engine, subject to standard exclusions
(combined-products claims, Operator modifications, use outside the
Pilot Scope or production scope).

### Audit Rights

- Tier A: Vendor audit of compliance every 24 months, 30-day notice.
- Tier B: Operator audit of royalty calculation annually, 30-day
  notice; Vendor pays if variance > 5%.

---

## Signature Block

The Parties acknowledge that this Term Sheet is **non-binding** except
for the confidentiality and exclusivity-of-negotiations provisions,
and that binding obligations are subject to definitive agreements.

**OPERATOR:**  
`{{operator_name}}`

By: ___________________________________  
Name: `{{operator_signatory_name}}`  
Title: `{{operator_signatory_title}}`  
Date: ___________________________________

**VENDOR:**  
`{{vendor_legal_entity}}`

By: ___________________________________  
Name: `{{vendor_signatory_name}}`  
Title: `{{vendor_signatory_title}}`  
Date: ___________________________________

---

## Placeholder Reference

| Placeholder                       | Purpose                                            |
| :-------------------------------- | :------------------------------------------------- |
| `{{operator_name}}`               | Operator name                                      |
| `{{operator_legal_entity}}`       | Operator legal entity (long form)                  |
| `{{vendor_legal_entity}}`         | Vendor entity                                      |
| `{{term_sheet_date}}`             | Term sheet date                                    |
| `{{selected_tier}}`               | A / B / C tier election                            |
| `{{custom_hourly_rate}}`          | Custom dev billing rate (USD)                      |
| `{{operator_negotiation_lead}}`   | Operator-side lead                                 |
| `{{vendor_negotiation_lead}}`     | Vendor-side lead                                   |

---

> **DISCLAIMER (REPEATED):** This is a draft template for negotiation
> reference only. All legal terms require review and approval by
> licensed counsel before execution. Pricing bands are illustrative
> ranges — not commitments.
