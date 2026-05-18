> **DISCLAIMER:** This is a draft template for negotiation reference only.
> All legal terms require review and approval by licensed counsel before
> execution. Numbers, term lengths, and clause language are illustrative
> starting points — not binding commitments or legal advice.

# Master Services Agreement (Template)

**Wave:** W214 Faza 1100.0 — Post-Pitch Negotiation Toolkit  
**Document type:** Sales-engineering reference template  
**Status:** DRAFT — counsel review required before execution

This Master Services Agreement ("MSA" or "Agreement") governs the
production relationship between `{{operator_name}}` ("Operator") and
`{{vendor_legal_entity}}` ("Vendor") for the Slot Math Engine
platform. It is intended to be executed after a successful Pilot per
`PILOT_AGREEMENT_TEMPLATE.md` and a signed Term Sheet per
`TERM_SHEET_TEMPLATE.md`.

---

## 1. Definitions

- **"Engine"** — Vendor's slot mathematics engine, including the
  closed-form solver portfolio, IR specification, certification
  dossier toolchain, and all updates delivered under this MSA.
- **"SOW"** — Statement of Work executed under this MSA (Appendix A).
- **"SLA"** — Service Level Agreement (Appendix B).
- **"Services"** — engineering, math, dossier-generation, and support
  services described in any SOW.
- **"Deliverables"** — outputs of Services (code, math reports,
  dossiers, etc.).
- **"Confidential Information"** — as defined in the Mutual NDA
  between the Parties.
- **"DPA"** — Data Processing Addendum (Appendix C, for EU operators).

## 2. Services

Vendor shall provide the Services described in each SOW, on the
schedule and at the pricing set forth therein. The first SOW
incorporated by reference into this MSA is `SOW-1`, attached as
Appendix A.

## 3. Fees and Payment

3.1 **Fees.** Operator shall pay the fees set forth in each SOW or in
the Term Sheet exhibit attached as Appendix D.

3.2 **Invoicing.** Vendor invoices monthly in arrears (Tier B revenue
share: quarterly), payable net 30 days from invoice date.

3.3 **Late payment.** Past-due amounts accrue interest at the lesser
of 1.5% per month or the maximum rate permitted by law.

3.4 **Taxes.** Each Party bears its own income taxes. Operator is
responsible for sales, use, VAT, GST, and similar transaction taxes,
except where Vendor is required to collect and remit by law.

## 4. Intellectual Property

4.1 **Vendor IP.** Vendor retains all right, title, and interest in
and to the Engine and all pre-existing IP. Operator receives the
license rights set forth in the Term Sheet and the applicable SOW.

4.2 **Operator IP.** Operator retains all right, title, and interest
in and to Operator IR, branding, and game designs. Vendor receives a
limited license to use Operator IP solely to perform the Services.

4.3 **Foreground IP.** Improvements to the Engine developed under
this MSA are owned by Vendor and licensed to Operator under the
applicable license tier. Operator-specific custom IR is owned by
Operator.

4.4 **Source Escrow (Optional).** At Operator's election (see
Appendix F), Vendor shall deposit a copy of the Engine source code
with a neutral third-party escrow agent. Release events: (a) Vendor
bankruptcy or insolvency, (b) cessation of Engine maintenance for
more than 180 days, (c) material breach uncured for 60 days. Release
grants Operator a perpetual, non-transferable license to maintain
the deposited code internally.

## 5. Warranties

5.1 **Vendor warranties.**

- The Engine substantially conforms to its published documentation
  for a period of 90 days after acceptance of each Deliverable.
- Services will be performed in a workmanlike manner by qualified
  personnel.
- The Engine does not, to Vendor's knowledge, infringe any third-
  party IP.

5.2 **Operator warranties.**

- Operator has authority to enter into this MSA.
- Operator IR and any data provided to Vendor do not infringe any
  third-party IP or violate any privacy or gaming regulation.

5.3 **Disclaimer.** EXCEPT AS EXPRESSLY SET FORTH ABOVE, THE ENGINE
AND ALL SERVICES ARE PROVIDED "AS IS." VENDOR DISCLAIMS ALL OTHER
WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

## 6. Indemnification

6.1 **Vendor indemnity.** Vendor shall defend and indemnify Operator
against third-party claims alleging that the Engine infringes such
third party's IP rights. Vendor's obligation is conditioned on
Operator's prompt notice, sole control of defense by Vendor, and
Operator's reasonable cooperation. Vendor may, at its option, modify
the Engine to be non-infringing, procure a license, or refund the
unamortized portion of the upfront fee (Tier A) or trailing-12 months
of royalties (Tier B).

6.2 **Operator indemnity.** Operator shall defend and indemnify
Vendor against third-party claims arising from Operator IR, Operator
data, or use of the Engine outside the licensed scope.

## 7. Limitation of Liability

7.1 **Exclusion.** EXCEPT FOR (a) BREACHES OF CONFIDENTIALITY, (b) IP
INDEMNIFICATION OBLIGATIONS, (c) GROSS NEGLIGENCE OR WILLFUL
MISCONDUCT, NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT,
INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES,
INCLUDING LOST PROFITS OR LOST REVENUE.

7.2 **Cap.** EACH PARTY'S TOTAL CUMULATIVE LIABILITY UNDER THIS
AGREEMENT SHALL NOT EXCEED THE GREATER OF (a) `{{liability_cap_usd}}`
USD OR (b) FEES PAID OR PAYABLE BY OPERATOR TO VENDOR IN THE TWELVE
(12) MONTHS PRECEDING THE EVENT GIVING RISE TO LIABILITY.

## 8. Term and Termination

8.1 **Term.** This MSA commences on `{{effective_date}}` and continues
until terminated. Individual SOWs may have their own terms.

8.2 **Termination for convenience.** Either Party may terminate this
MSA for convenience upon 90 days' written notice, subject to
completion of all active SOWs unless mutually waived.

8.3 **Termination for cause.** Either Party may terminate for material
breach with 30 days' written cure notice. Insolvency events are
immediate cause.

8.4 **Effect of termination.** Sections 4 (IP), 5 (Disclaimer), 7
(Limitation), 9 (Confidentiality), 10 (Data Protection), and any
accrued payment obligations survive termination.

## 9. Confidentiality

The Mutual NDA between the Parties dated `{{nda_effective_date}}`
is incorporated by reference. In the event of conflict regarding
confidentiality, the more protective provision controls.

## 10. Data Protection

For EU-jurisdiction Services or where Operator processes personal
data through the Engine, the Data Processing Addendum at Appendix C
(GDPR-compliant template) applies. Vendor acts as Processor; Operator
acts as Controller for player data.

## 11. Audit Rights

11.1 **Operator audit of Vendor.** Operator may audit Vendor's
compliance with this MSA, including security controls and royalty
calculations (where applicable), once per 12 months on 30 days'
written notice, during business hours, with reasonable cooperation
from Vendor. Operator bears its own audit costs unless variance > 5%.

11.2 **Vendor audit of Operator.** Vendor may audit Operator's
compliance with license scope and royalty reporting once per 24
months on 30 days' written notice.

## 12. Acceptance Criteria

Deliverables are subject to the acceptance framework defined in each
SOW. The default framework comprises:

1. **Math validation.** Closed-form RTP within 0.5pp of target,
   validated by 10M-spin Monte Carlo.
2. **Lab certification.** Successful submission to the agreed
   certification laboratory (GLI, BMM, NMi, or eCOGRA) with no major
   findings.
3. **Jurisdiction compliance.** Confirmation by Operator's compliance
   team that the Deliverable meets the target jurisdiction's
   regulatory requirements.

Operator has 30 days from delivery to accept or reject with written
reasons.

## 13. Change Control

Changes to scope, schedule, or fees require a written change order
signed by authorized representatives of both Parties. Vendor shall
log change requests and respond within 5 business days with impact
assessment.

## 14. Insurance

Vendor shall maintain at minimum:

- Commercial general liability: $2M per occurrence / $4M aggregate.
- Professional liability / E&O: $5M per claim.
- Cyber liability: $5M per occurrence.

Certificates of insurance available on request.

## 15. Force Majeure

Neither Party is liable for delay or failure to perform due to causes
beyond its reasonable control, provided that the affected Party gives
prompt notice and uses reasonable efforts to mitigate.

## 16. Notices

All notices to be in writing, delivered to addresses on the signature
page, via email with read receipt or overnight courier.

## 17. Governing Law

This MSA shall be governed by `{{governing_law}}`. Disputes resolved
by good-faith negotiation, escalating to mediation, then binding
arbitration under the rules of the American Arbitration Association
(or `{{arbitration_body}}`) in `{{governing_law_venue}}`.

## 18. Miscellaneous

- Independent contractors; no joint venture.
- Entire agreement; supersedes prior agreements on the subject.
- Amendments only by written, signed instrument.
- Severability; reformation in lieu of voiding.
- Waiver only by written, signed instrument.
- Counterparts; electronic signature permitted.

---

## Signature Block

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

## Appendix A — Statement of Work (Template)

**SOW Number:** SOW-001  
**Effective Date:** `{{sow_effective_date}}`

1. **Scope of work.** [Describe game template, IR work, integration
   targets, dossier deliverables.]
2. **Schedule.** [Milestone dates aligned with W211 dossier sections
   and the 30-day Pilot timeline.]
3. **Fees.** [Tier A upfront / Tier B revenue share / Tier C bespoke.]
4. **Acceptance criteria.** [Per Section 12 + game-specific RTP /
   volatility thresholds.]
5. **Key personnel.** [Vendor tech lead + Operator tech lead.]

## Appendix B — Service Level Agreement

| Metric                | Target          | Measurement window | Credit on miss             |
| :-------------------- | :-------------- | :----------------- | :------------------------- |
| Platform uptime       | 99.5%           | Calendar month     | 5% monthly fee credit/0.5pp|
| P1 response time      | 2 hours         | Per incident       | $1,000 per incident missed |
| P2 response time      | 8 hours         | Per incident       | $500 per incident missed   |
| P3 response time      | 1 business day  | Per incident       | $250 per incident missed   |
| Dossier turn-around   | 10 business days| Per request        | 10% fee credit             |

**Escalation path:** Support → CSM → Engineering manager → CTO.
Escalation may be invoked by Operator at any time without forfeiting
SLA credits.

## Appendix C — Data Processing Addendum (GDPR)

For Operators where the Engine processes personal data of EU/UK data
subjects:

- Vendor acts as Processor; Operator is Controller.
- Vendor processes personal data only on documented instructions.
- Vendor implements appropriate technical and organizational measures
  (encryption at rest and in transit, access controls, audit logs).
- Sub-processors require prior written authorization (general
  authorization for listed sub-processors maintained at
  `{{subprocessor_list_url}}`).
- International transfers under Standard Contractual Clauses where
  applicable.
- Personal data breach notification within 72 hours.
- Return or deletion of personal data upon termination, except where
  retention is required by law.
- Audit and inspection rights aligned with Section 11.

## Appendix D — Term Sheet Reference

The commercial terms negotiated in `TERM_SHEET_TEMPLATE.md` are
incorporated by reference. Selected tier: `{{selected_tier}}`.

## Appendix E — Acceptance Criteria Detail

Game-specific math acceptance criteria (RTP tolerance, hit-frequency
bands, volatility index, top-prize cap, jackpot tier separation) are
defined in each SOW.

## Appendix F — Source Escrow Election

[ ] Operator elects source escrow under Section 4.4. Escrow agent:
`{{escrow_agent}}`. Annual fee: `{{escrow_fee_usd}}` USD, shared
50/50 between the Parties.

[ ] Operator declines source escrow.

---

## Placeholder Reference

| Placeholder                  | Purpose                                                  |
| :--------------------------- | :------------------------------------------------------- |
| `{{operator_name}}`          | Operator name                                            |
| `{{effective_date}}`         | MSA effective date                                       |
| `{{liability_cap_usd}}`      | Liability cap floor (USD)                                |
| `{{governing_law}}`          | Choice of law                                            |
| `{{arbitration_body}}`       | AAA / ICC / LCIA / JAMS                                  |
| `{{nda_effective_date}}`     | Pre-existing NDA date                                    |
| `{{sow_effective_date}}`     | First SOW effective date                                 |
| `{{subprocessor_list_url}}`  | URL for sub-processor list                               |
| `{{escrow_agent}}`           | Source escrow agent (if elected)                         |
| `{{escrow_fee_usd}}`         | Annual escrow fee (USD)                                  |

---

> **DISCLAIMER (REPEATED):** This is a draft template for negotiation
> reference only. All legal terms require review and approval by
> licensed counsel before execution.
