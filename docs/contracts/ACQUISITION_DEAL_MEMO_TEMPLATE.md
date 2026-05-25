> **DISCLAIMER:** This is a draft template for negotiation reference only.
> All legal terms require review and approval by licensed counsel before
> execution. Numbers, term lengths, valuation ranges, and clause
> language are illustrative starting points — not binding commitments
> or legal advice.

# Acquisition Deal Memo (Template)

**Wave:** W214 Faza 1100.0 — Post-Pitch Negotiation Toolkit  
**Document type:** Sales-engineering reference template  
**Status:** DRAFT — counsel review required before execution

This Deal Memo frames a potential acquisition of the Slot Math Engine
(or `{{vendor_legal_entity}}` outright) by `{{operator_name}}` or a
strategic acquirer (the "Acquirer"). It is intended to anchor
negotiation; binding terms will be embodied in a separate Definitive
Acquisition Agreement.

---

## 1. Transaction Summary

- **Target:** `{{vendor_legal_entity}}` and/or the Slot Math Engine
  assets (the "Target")
- **Acquirer:** `{{operator_name}}` (or affiliated strategic acquirer)
- **Headline valuation range:** $200M – $500M (see Section 3)
- **Structure:** Asset purchase (preferred) or equity purchase
  (alternative)
- **Memo date:** `{{memo_date}}`

## 2. Asset vs Equity Acquisition Framework

| Dimension                  | Asset purchase                                  | Equity purchase                              |
| :------------------------- | :---------------------------------------------- | :------------------------------------------- |
| What Acquirer buys         | Specified Engine assets + IP + customer book    | 100% of Target equity (entity intact)        |
| Liabilities                | Only assumed liabilities                        | All liabilities, including unknowns          |
| Tax for sellers            | Mixed (ordinary + capital)                      | Capital gains (generally preferred by sellers)|
| Speed                      | Faster; cleaner DD scope                        | Slower; broader DD                           |
| Employee continuity        | Re-hire required; selective                     | Continues automatically                      |
| Contracts                  | Re-assignment required                          | Continues automatically (anti-assignment caveats)|
| Recommended default        | **Asset purchase** for this transaction         | Fallback if asset purchase blocked by contracts|

## 3. Valuation Methodology

Three independent methods, blended:

### 3.1 Discounted Cash Flow

- Base Tier-A/B revenue projection (5-year horizon).
- Conservative: 30 operators × $200K avg annual = $60M ARR steady-
  state. Mid: 60 operators × $300K = $180M. Aggressive: 100 operators
  × $500K = $500M.
- Discount rate: 12-18% (gaming SaaS comps).
- Terminal multiple: 8-12× ARR (industry SaaS norm).

### 3.2 Comparable Transactions

- Reference: industry slot-platform acquisitions in the prior 5
  years (e.g., math/RNG library deals; full-stack platform M&A).
- Comparable EBITDA multiples: 10-15× for mature platforms.
- Comparable revenue multiples: 6-12× ARR for high-growth platforms.

### 3.3 Strategic Value

- Category lock-in premium: $50M-$150M for a Tier-1 acquirer who
  would otherwise face a 24-36 month internal-build path.
- Patent / IR-spec defensibility premium: $25M-$75M.
- Founder / team retention value: $25M-$50M.

### 3.4 Sensitivity Table

| Scenario     | ARR @ Yr 5 | EV / ARR multiple | EV         |
| :----------- | ---------: | ----------------: | ---------: |
| Bear         |       $60M |               4×  |      $240M |
| Base low     |       $90M |               5×  |      $450M |
| Base mid     |      $150M |               6×  |      $900M |
| Base high    |      $200M |               7×  |     $1.4B  |
| Bull         |      $350M |              10×  |     $3.5B  |

The MEMO HEADLINE RANGE of **$200M–$500M** anchors near the
**Bear-to-Base-low** band, reflecting that the Engine is at an
early-revenue maturity stage and that strategic premiums are
realized only when paired with a Tier-1 distribution channel.

## 4. Due Diligence Checklist (50+ items)

### 4.1 Code and IP (12 items)

1. Source code completeness and clean ownership chain
2. Open-source license inventory and compliance
3. Copyright and trademark registrations
4. Patent applications and granted patents
5. Trade secret protection program
6. Code quality metrics (test coverage, mutation score)
7. Security audit results (SOC2 evidence, pentest reports)
8. Build reproducibility verification
9. Third-party dependency review (licenses, vulnerabilities)
10. Internal IR-spec change-control history
11. Closed-form solver portfolio sign-off matrix
12. Certification dossier templates and lab response history

### 4.2 Customers and Pipeline (8 items)

13. Customer roster + contract terms
14. Revenue concentration analysis
15. Churn history and reasons
16. Pipeline forecast and conversion assumptions
17. Reference calls with top 5 customers
18. Win/loss analysis vs competitors
19. Customer-success metrics (NPS, time-to-value)
20. Renewal / expansion bookings trend

### 4.3 Financials (10 items)

21. Audited financials (3 years if available)
22. Monthly recurring revenue (MRR) bridge
23. Gross margin and cost-to-serve breakdown
24. Operating expense detail
25. Cash position and runway
26. Capital structure (cap table, options pool)
27. Tax filings and outstanding obligations
28. Outstanding debt and contingent liabilities
29. Working capital and AR/AP aging
30. Bank statements (last 12 months)

### 4.4 Legal (8 items)

31. Corporate governance (formation, bylaws, board minutes)
32. Material contract review
33. Pending or threatened litigation
34. Regulatory inquiries (gaming control boards)
35. Employment agreements and IP assignment
36. NDA inventory and enforceability
37. Insurance policy review
38. Compliance program (privacy, anti-corruption, sanctions)

### 4.5 Technical (8 items)

39. Architecture review and scalability analysis
40. Infrastructure cost and vendor lock-in assessment
41. Disaster recovery and business continuity
42. RNG audit and entropy program
43. Multi-tenant isolation evidence
44. Penetration test results (recent)
45. Performance benchmarks (sub-ms MC, throughput)
46. Roadmap viability assessment

### 4.6 People (6 items)

47. Org chart, headcount, and key-person identification
48. Compensation benchmarks
49. Retention risk assessment
50. Visa and work-authorization status (where applicable)
51. Culture and engagement survey results
52. Departures in last 24 months

## 5. Earnout Structure

A 36-month earnout aligned with strategic integration:

| Milestone                                | Earnout share | Trigger                                                  |
| :--------------------------------------- | ------------: | :------------------------------------------------------- |
| Year-1 revenue retention                 |           10% | ≥85% of trailing-12 revenue retained post-close          |
| Year-2 revenue growth                    |           10% | ≥20% YoY growth on Engine ARR                            |
| Year-3 portfolio penetration             |           10% | ≥40% of Acquirer's annual game ships on the Engine       |
| Optional bonus: category lock-in         |        +5-10% | Defined competitive-displacement target met              |

Total earnout cap: 30% of headline valuation, with optional bonus
extending to 40%.

## 6. Founder / Team Retention

- **Founder retention:** 3-year vesting with 1-year cliff; cash +
  equity blend.
- **Key engineering retention:** 24-month retention bonus, paid
  quarterly, contingent on continued employment in good standing.
- **Non-compete:** 24 months in the slot-math-engine category for
  selling principals; narrowly drafted to comply with
  jurisdictional limits (e.g., California enforceability caveats).
- **Non-solicit:** 24 months for employees and customers.

## 7. High-Level Integration Plan

| Phase            | Window      | Activities                                                       |
| :--------------- | :---------- | :--------------------------------------------------------------- |
| Close + Day 1    | Day 0       | Announcement, key communications, retention letters issued       |
| Stabilize        | Months 1-3  | Systems integration plan, customer continuity confirmations      |
| Integrate        | Months 4-12 | Engine team folded into Acquirer's R&D; first co-branded release |
| Optimize         | Months 12+  | Cross-portfolio adoption; legacy math library deprecation        |

## 8. Anti-Trust Considerations

The slot supply market is concentrated among a handful of Tier-1
platforms (Vendor B, Vendor C, Vendor A, Vendor F, Evolution / Vendor D /
Red Tiger). An acquisition by a Tier-1 incumbent may trigger
regulatory review (HSR in the US; EC merger review; UKGC fit-and-
proper). The Parties shall jointly assess:

- HSR filing thresholds (size-of-transaction / size-of-person tests)
- EC merger control thresholds
- Gaming-regulatory transfer-of-control approvals across the
  Operator's jurisdictions

Estimated timeline allowance for regulatory review: **3-9 months**
post-signing, with a customary outside-date provision.

## 9. Conditions Precedent

- DD completion to Acquirer's reasonable satisfaction
- Material consents (key customer contracts, critical vendors)
- Regulatory approvals (HSR, gaming control boards)
- Founder retention agreements signed
- No material adverse change (MAC) since memo date

## 10. Confidentiality

Subject to the Mutual NDA dated `{{nda_effective_date}}` plus a
no-shop covenant for 90 days following Deal Memo signing.

## 11. Non-Binding Nature

Except for confidentiality and exclusivity-of-negotiations, this Deal
Memo is non-binding and is subject to Definitive Acquisition
Agreement, DD outcome, board approvals, and regulatory clearances.

---

## Signature Block (Non-Binding Acknowledgment)

**ACQUIRER:**  
`{{operator_name}}`

By: ___________________________________  
Name: `{{operator_signatory_name}}`  
Title: `{{operator_signatory_title}}`  
Date: ___________________________________

**TARGET:**  
`{{vendor_legal_entity}}`

By: ___________________________________  
Name: `{{vendor_signatory_name}}`  
Title: `{{vendor_signatory_title}}`  
Date: ___________________________________

---

## Placeholder Reference

| Placeholder                  | Purpose                                            |
| :--------------------------- | :------------------------------------------------- |
| `{{operator_name}}`          | Acquirer name                                      |
| `{{vendor_legal_entity}}`    | Target entity                                      |
| `{{memo_date}}`              | Deal memo date                                     |
| `{{nda_effective_date}}`     | Pre-existing NDA date                              |
| `{{governing_law}}`          | Choice of law for definitive agreement             |

---

> **DISCLAIMER (REPEATED):** This is a draft template for negotiation
> reference only. All legal terms require review and approval by
> licensed counsel before execution. Valuation bands are illustrative
> ranges — not commitments or fairness opinions.
