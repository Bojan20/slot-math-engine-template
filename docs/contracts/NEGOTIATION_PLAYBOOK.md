> **DISCLAIMER:** This is a draft template for negotiation reference only.
> All legal terms require review and approval by licensed counsel before
> execution. Numbers, term lengths, and clause language are illustrative
> starting points — not binding commitments or legal advice.

# Negotiation Playbook

**Wave:** W214 Faza 1100.0 — Post-Pitch Negotiation Toolkit  
**Document type:** Internal sales-engineering playbook  
**Audience:** Vendor deal team (sales lead, sales engineer, legal,
founders)

This playbook is the Vendor-side companion to the templates in
`docs/contracts/`. It is **internal-facing**: do not share with the
Operator.

---

## 1. Pre-Negotiation Posture

### 1.1 What we want (anchored "ask")

- **Tier A (preferred for first deals):** Mid-band upfront ($850K) +
  $170K annual maintenance, 24-month minimum term, non-exclusive.
- **Tier B (preferred for cash-poor Operators):** 4% revenue share,
  $150K upfront, $150K annual minimum.
- **Tier C:** anchor at $500M (Bull / Base-high blend); accept
  anywhere in $200M-$500M range with appropriate earnout structure.

### 1.2 Walk-away (BATNA)

- **License deals:** $0; we have a no-commission cost floor since the
  Engine is built. Walk away rather than:
  - Surrender source ownership (escrow opt-in is fine; transfer is
    not)
  - Cap aggregate liability below $1M floor
  - Grant exclusivity without ≥25% premium and ≤12 month duration
  - Operate without a Pilot first (we never sell sight-unseen)
- **Acquisition deals:** $200M floor without strategic premium; below
  $200M is a "no, thank you" — we continue to build ARR independently.

### 1.3 BATNA refresh cadence

Every 90 days, refresh:

- Pipeline value (sum of qualified-opportunity ARR)
- Pilot conversion rate (last 6 months)
- Comparable transactions
- Vendor team's cash runway and morale

The BATNA strengthens as we sign more Tier-A and Tier-B Operators.
Discipline: never sell below the floor early in the curve; doing so
breaks the price ladder for later Operators.

## 2. Anchoring Strategy

| Stage              | Vendor anchor                                            | Operator-likely response                 |
| :----------------- | :------------------------------------------------------- | :--------------------------------------- |
| Initial ask        | Tier A High band ($1.6M) or Tier B 5% revenue share      | "Too expensive" / counter at half        |
| First concession   | Move to Mid band; offer training + custom-dev allowance  | "Closer, but need exclusivity / more SLA"|
| Bundled trade      | Add 6-mo category exclusivity for +25% premium           | Counter on warranty cap or audit         |
| Final              | Lock at Mid band + the bundled trades; sign Term Sheet   | Negotiate MSA appendices                 |

**Rule:** Never make the first concession without a reciprocal ask
("If we move on price, you move on term"). Concessions come in
trades, not gifts.

## 3. Concession Ladder

What we can give (in priority order, smallest first):

1. Training days (cheap; high perceived value)
2. Custom development hours (we already do many of these for fun)
3. Payment terms (net 30 → net 45 with discount)
4. Maintenance fee % (move 20% → 17.5%)
5. Royalty percentage (move 4% → 3.5%) — only with longer term
6. Upfront fee (move 10-15% as bundle anchor)
7. Liability cap (move floor up to 12-month-fees-only)

What we **do not** give (red lines):

- Source code transfer (escrow OK; transfer NO)
- Uncapped liability
- Below-floor pricing
- Multi-year exclusivity without volume guarantee
- Operator IP ownership of Engine improvements

## 4. Multi-Issue Bundles

Bundle 3+ issues so the Operator perceives flexibility while we
optimize across dimensions:

- **Price + Term + Exclusivity:** "We can come down 10% on upfront IF
  you commit to 36-month term AND drop the exclusivity ask."
- **Royalty + Reporting + Audit:** "We can move from 4% to 3.5% IF we
  switch to monthly reporting AND you accept a 5% variance-threshold
  audit clause."
- **SLA + Liability + Insurance:** "We can offer 24×7 SLA IF the
  liability cap stays at 12-mo-fees AND you waive the consequential-
  damages indemnity."

## 5. Common Operator Playbook Patterns

### 5.1 Procurement tactics

- **"Standard procurement terms" lock-in.** Reality: their template
  was drafted for janitorial supply, not regulated software. We
  redline with our MSA core.
- **Aggressive payment terms.** Reality: net 60 or 90 is a margin
  drain. We push back with discount-for-early-pay if movement needed.
- **Most-favored-nation clauses.** Reality: kills price ladder. We
  reject MFNs except in very narrow rider form.

### 5.2 Legal stalling

- **"Our legal team will get back in 4 weeks."** Reality: their
  procurement uses time as a weapon. We respond with a 30-day
  expiration on the proposal, with the Pilot Conversion Credit
  contingent on signing by date.
- **Heavy redlines that gut warranties.** Reality: their template
  doesn't apply. We escalate to their business sponsor.

### 5.3 Scope creep

- **"Can you also do live-dealer math, jackpot orchestration, table
  games...?"** Reality: each is a 6-12 month build for us. We say:
  "Yes — under a separate SOW. Engine first."
- **"Can the Pilot do 3 games instead of 1?"** Reality: 3× the work
  for $0. We say: "We'd love to. Convert to Tier-B now and we'll roll
  the first three games into the production scope at the same fee."

## 6. Decision Tree — "Operator Asks X"

| Operator ask                                  | Vendor response                                                  | Business reasoning                                                  |
| :-------------------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------ |
| "We need exclusivity"                         | Offer category-exclusivity at +25% premium, ≤12 months           | Exclusivity costs us 1-2 other deals; price it correctly            |
| "We need source code"                         | Offer source escrow; transfer is a Tier-C conversation           | We can't sell IP and license it at the same time                    |
| "Drop the price by 30%"                       | Counter: "Drop by 10% in exchange for 36-month term"             | Length is a partial substitute for headline price                   |
| "We want 1% revenue share, not 4%"            | Counter: "1% is Tier C math; we can do 3.5% at higher upfront"   | Below 3% breaks the floor; never break the floor                    |
| "Uncapped IP indemnity"                       | Accept (per our MSA Section 6.1)                                 | We stand behind our IP; the indemnity is part of the value prop     |
| "Uncapped general liability"                  | Decline; offer cap of greater of $1M or trailing-12-month fees   | Standard industry posture; we have insurance for this               |
| "MFN clause"                                  | Decline; offer narrow MFN on price-band only                     | Full MFN kills the ladder; narrow MFN is acceptable                 |
| "Custom solver for X mechanic"                | Quote it as additional SOW; price at custom hourly rate          | Our hourly rate covers margin even on bespoke work                  |
| "Walk back the Pilot Conversion Credit"       | Decline; the credit is the conversion mechanism                  | Without the credit, the Pilot is a free consulting engagement       |
| "Refund if cert lab fails"                    | Offer pro-rated refund if specific success criteria miss         | Tie refund to objective criteria, not Operator dissatisfaction      |
| "Add penalty clauses for SLA misses"          | Accept; per Appendix B credit table                              | SLA credits aligned with our existing SLA matrix                    |
| "Change the governing law"                    | Negotiate within accepted set (DE / NY / UK / Singapore)         | Avoid hostile jurisdictions; stay in established commercial law     |

## 7. BATNA Analysis Cheat Sheet

Before each negotiation, fill in:

- **Best alternative we have:** [pipeline value, next-best Operator]
- **Walk-away threshold:** [pricing floor + non-negotiables]
- **Time pressure on us:** [runway, board pressure, etc.]
- **Time pressure on them:** [Q4 close, board demo, competitor launch]
- **Information asymmetry:** [what do we know that they don't, and
  vice versa?]

Whichever side has the stronger BATNA + less time pressure wins the
median dollar. We work continuously to strengthen ours and observe
theirs.

## 8. When to Walk Away

Walk away if **any** of:

1. Operator refuses to start with a Pilot. (They're not serious; or
   they intend to lift and shift.)
2. Operator insists on source-code transfer in a license deal.
3. Operator insists on below-floor pricing (Tier A < $300K upfront;
   Tier B < 3% revenue share).
4. Operator's legal team won't engage on the MSA after 60 days.
5. Operator demands MFN with no carve-outs.
6. Negotiation reveals integrity flags (ghosting; reneging on signed
   Term Sheet; bait-and-switch on scope).

Walking away is a deal tool: telegraph the walk-away early enough
that they know it's real. Don't bluff.

## 9. After the Deal

- Move quickly from Term Sheet to MSA (target: 45 days).
- Schedule kickoff within 14 days of MSA signing.
- Lock in case-study + reference call rights in the MSA (Operator
  may say "later" — get the option now).
- Begin tracking SLA metrics from Day 1; never miss a P1.

---

## Appendix — Quick Reference Cards

### Card 1: Pricing Floors

| Tier | Floor upfront | Floor royalty / fee  | Notes                |
| :--- | ------------: | :------------------- | :------------------- |
| A    | $300K         | $60K maintenance/yr  | Tier-2 studio floor  |
| B    | $50K          | 3% revenue share     | Plus $50K annual min |
| C    | $200M         | n/a                  | + earnout structure  |

### Card 2: Non-Negotiables (Red Lines)

- No source-code transfer in license deals
- No uncapped general liability
- No multi-year exclusivity without volume guarantee
- No MFN without carve-outs
- No production deployment before MSA execution

### Card 3: Standard Concessions (Pre-Approved)

- Up to 10% off upfront for 36-month term
- Up to 0.5% off revenue share for 24-month term + audit waiver
- Up to 200 free custom dev hours
- Up to 5 days training included
- Up to 90-day payment terms (with 1% early-pay discount)

---

> **DISCLAIMER (REPEATED):** This is an internal Vendor playbook
> drafted for sales-engineering use. It is not a contract, not legal
> advice, and not enforceable against any Operator. All actual deal
> terms require review and approval by licensed counsel.
