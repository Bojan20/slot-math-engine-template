> **DISCLAIMER:** This is a draft template for negotiation reference only.
> All legal terms require review and approval by licensed counsel before
> execution. Numbers, term lengths, and clause language are illustrative
> starting points — not binding commitments or legal advice.

# 30-Day Pilot Evaluation Agreement (Template)

**Wave:** W214 Faza 1100.0 — Post-Pitch Negotiation Toolkit  
**Document type:** Sales-engineering reference template  
**Status:** DRAFT — counsel review required before execution

---

## 1. Parties

This Pilot Evaluation Agreement ("Pilot Agreement") is entered into as
of `{{effective_date}}` by and between:

- **"Operator"** — `{{operator_name}}` (the company evaluating the
  Engine for production use); and
- **"Vendor"** — `{{vendor_legal_entity}}` (developer and licensor of
  the Slot Math Engine).

## 2. Recitals

WHEREAS, Vendor has developed a slot mathematics engine consisting of a
closed-form solver portfolio, an IR specification, a certification
dossier toolchain, and a multi-tenant evaluation environment (the
"Engine"); and

WHEREAS, Operator wishes to evaluate the Engine under controlled
conditions on a 30-day no-cost trial for the purpose of validating
mathematical accuracy, integration feasibility, and certification-path
readiness for `{{operator_name}}`'s slot-game portfolio;

NOW, THEREFORE, the Parties agree as follows.

## 3. Scope of Pilot

The Pilot covers exactly **one (1) game template, one (1) wallet
provider integration, and one (1) jurisdiction certification path**
(collectively, the "Pilot Scope"). Specifically:

- **Game template:** `{{pilot_game_title}}` (an existing template from
  the Vendor catalog or an Operator-supplied IR file).
- **Wallet provider:** `{{pilot_wallet_provider}}`.
- **Jurisdiction:** `{{pilot_jurisdiction}}` (and the certification
  laboratory matching that jurisdiction, e.g., GLI, BMM, NMi, eCOGRA).

Expansion of the Pilot Scope (additional games, providers, or
jurisdictions) requires a written change order signed by both Parties.

## 4. Deliverables

Vendor shall deliver to Operator the following during the Pilot,
mirroring the 12-section pilot dossier defined in
`docs/LW_PILOT_PITCH_GUIDE.md` (W211):

1. Dedicated pilot tenant (isolated environment, signed manifest).
2. Integration suite results (10 of 10 steps PASS evidence file).
3. Closed-form portfolio reconciliation report (CF vs MC RTP within
   0.5 percentage points).
4. Game-specific IR validation report.
5. Wallet provider integration test report.
6. RNG audit + entropy health monitor logs.
7. Jurisdiction-specific certification dossier draft (12 sections).
8. PAR (Probability Accounting Report) sample, USIF v1 schema.
9. Volatility and hit-frequency analysis.
10. Penetration-test pre-flight checklist.
11. SOC2 Type-1 evidence index (relevant excerpt).
12. Final evaluation report with operator-team feedback section.

## 5. Timeline

| Phase                  | Days        | Activities                                                          |
| :--------------------- | :---------- | :------------------------------------------------------------------ |
| Onboard                | Day 0       | Tenant provisioning, key exchange, kickoff call                     |
| Integration            | Days 1-7    | Wallet wiring, smoke checks, IR upload, sandbox spins               |
| Canary                 | Days 8-21   | Controlled-load testing, RTP convergence runs, volatility profiling |
| Certification path     | Days 22-29  | Dossier draft, lab format conversion, internal math-team review     |
| Evaluation report      | Day 30      | Final report delivery + decision conference                         |

## 6. Operator Obligations

Operator shall:

1. Provide a test wallet/sandbox environment with mock credentials by
   Day 1.
2. Designate one (1) primary technical contact (`{{operator_tech_contact}}`)
   and one (1) primary business contact (`{{operator_biz_contact}}`).
3. Respond to Vendor questions or blockers within two (2) business
   days during the Pilot.
4. Make a good-faith effort to attend weekly status calls.
5. Provide written feedback on each deliverable within five (5)
   business days of receipt.
6. Not deploy the Engine into a real-money production environment
   during the Pilot without a separate written agreement.

## 7. Vendor Obligations

Vendor shall:

1. Provision the dedicated pilot tenant by Day 0.
2. Run the full integration suite and supply PASS evidence.
3. Generate the 12-section dossier per Section 4.
4. Host weekly status calls (45 minutes) and provide written notes.
5. Make engineering staff available for ad-hoc blocker resolution
   during the Pilot window (best-effort, business hours).
6. Maintain pilot tenant uptime at or above 99.0% during the Pilot.

## 8. Pilot Cost and Conversion

The Pilot is provided at **no cost** ($0) to Operator. Operator may
walk away at the conclusion of the Pilot with no further obligation.

If Operator elects to convert the Pilot into a production engagement,
Vendor will apply a credit toward the production license equal to the
list-price equivalent of the Pilot work (the "Pilot Conversion
Credit"). The default Pilot Conversion Credit is
`{{pilot_credit_usd}}` USD, applied against the upfront license fee
(Tier A) or against the first twelve months of revenue-share royalties
(Tier B). See `TERM_SHEET_TEMPLATE.md` for tier definitions.

## 9. Success Criteria

The Pilot shall be deemed "successful" if **all** of the following are
achieved by Day 30:

1. Ten (10) of ten (10) integration suite steps return PASS.
2. Closed-form solver RTP for the Pilot Scope game falls within
   0.5 percentage points of the target RTP, validated against a 1M-
   spin Monte Carlo run.
3. The 12-section dossier is reviewed and approved (with or without
   minor comments) by `{{operator_name}}`'s internal mathematics
   review team.

A "successful" Pilot is a precondition for the Pilot Conversion Credit
in Section 8.

## 10. Exit Clauses

Either Party may terminate this Pilot Agreement at any time, with or
without cause, upon five (5) business days' written notice. Upon
termination:

1. Vendor shall deprovision the pilot tenant within ten (10) business
   days.
2. Operator shall return or destroy all Vendor-provided materials
   subject to the Mutual NDA (see `MUTUAL_NDA_TEMPLATE.md`).
3. Vendor shall return or destroy all Operator-provided materials.
4. Sections 11 (IP), 12 (Confidentiality), and 13 (Limitation) survive
   termination.

## 11. Intellectual Property

1. **Vendor IP.** Vendor retains all right, title, and interest in and
   to the Engine, including the solver portfolio, the IR specification,
   the dossier toolchain, and all improvements developed during the
   Pilot. Operator receives a limited, non-exclusive, non-transferable,
   revocable license to use the Engine solely for the Pilot Scope and
   Purpose during the Pilot term.
2. **Operator IP.** Operator retains all right, title, and interest in
   and to any IR files, mathematical specifications, branding,
   artwork, and game designs it provides to or develops during the
   Pilot (collectively, "Operator IR"). Vendor receives no rights in
   Operator IR beyond the limited internal use required to run the
   Pilot.
3. **Feedback.** Operator-supplied feedback, suggestions, and bug
   reports may be incorporated by Vendor into the Engine without
   compensation, provided no Operator Confidential Information is
   embodied in such improvements.

## 12. Confidentiality

This Pilot Agreement is subject to the Mutual NDA between the Parties
dated `{{nda_effective_date}}`. In the event of a conflict between
this Pilot Agreement and the NDA regarding confidentiality, the more
protective provision controls.

## 13. Limitation of Liability

EXCEPT FOR BREACHES OF CONFIDENTIALITY OR INTELLECTUAL PROPERTY
RIGHTS, NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED
TO THIS PILOT AGREEMENT. EACH PARTY'S TOTAL CUMULATIVE LIABILITY UNDER
THIS PILOT AGREEMENT SHALL NOT EXCEED **TEN THOUSAND U.S. DOLLARS
($10,000)**.

## 14. Warranties; Pilot Status

The Engine is provided to Operator on a **"PILOT / EVALUATION"** basis
**"AS IS"**, without warranty of any kind. The Parties acknowledge
that the Engine is being evaluated for fitness and is not yet
contracted for production use under this Pilot Agreement.

## 15. Independent Contractors

Each Party is an independent contractor. Nothing in this Pilot
Agreement creates a joint venture, partnership, agency, or employment
relationship between the Parties.

## 16. Notices

All notices shall be in writing and delivered to the addresses set
forth on the signature page, by email with confirmation of receipt, or
by overnight courier.

## 17. Governing Law

This Pilot Agreement shall be governed by `{{governing_law}}`. Disputes
shall be resolved in `{{governing_law_venue}}`.

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

## Placeholder Reference

| Placeholder                       | Purpose                                                  |
| :-------------------------------- | :------------------------------------------------------- |
| `{{effective_date}}`              | Pilot start date                                         |
| `{{operator_name}}`               | Operator legal name                                      |
| `{{pilot_game_title}}`            | Game template targeted by the Pilot                      |
| `{{pilot_wallet_provider}}`       | Wallet provider integration target                       |
| `{{pilot_jurisdiction}}`          | Target jurisdiction (e.g., "Nevada", "UKGC")             |
| `{{pilot_credit_usd}}`            | USD credit applied if Pilot converts to production       |

---

> **DISCLAIMER (REPEATED):** This is a draft template for negotiation
> reference only. All legal terms require review and approval by
> licensed counsel before execution.
