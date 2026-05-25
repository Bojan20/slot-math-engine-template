> **DISCLAIMER:** All documents in `docs/contracts/` are draft templates
> for negotiation reference only. All legal terms require review and
> approval by licensed counsel before execution. Numbers, term lengths,
> and clause language are illustrative starting points — not binding
> commitments or legal advice.

# Post-Pitch Negotiation Toolkit

**Wave:** W214 Faza 1100.0  
**Audience:** Vendor deal team (sales, sales engineering, founders,
legal); shared with Operator as redline starting points.

When the Operator says "yes, let's talk pilot" after the W213 outreach
package + W212 pitch tarball, you reach into this directory. Everything
here is a *starting point* — counsel adapts to the specific deal.

---

## Template Inventory

| # | File                                       | Purpose                                                       | Lines |
| - | :----------------------------------------- | :------------------------------------------------------------ | ----: |
| 1 | `MUTUAL_NDA_TEMPLATE.md`                   | Mutual NDA — first paper before any DD                        |   ~400|
| 2 | `PILOT_AGREEMENT_TEMPLATE.md`              | 30-day Pilot Evaluation Agreement ($0 walk-away)              |   ~600|
| 3 | `TERM_SHEET_TEMPLATE.md`                   | 3-tier commercial term sheet (A perpetual / B revshare / C M&A)|  ~500|
| 4 | `PARTNERSHIP_LOI_TEMPLATE.md`              | Strategic Partnership LOI (alternative to outright M&A)       |   ~400|
| 5 | `MSA_TEMPLATE.md`                          | Master Services Agreement for production engagement           |   ~700|
| 6 | `ACQUISITION_DEAL_MEMO_TEMPLATE.md`        | Acquisition Deal Memo for Tier-C / strategic M&A              |   ~500|
| — | `NEGOTIATION_PLAYBOOK.md`                  | Internal Vendor-side negotiation playbook                     |   ~500|

## Generator Inventory

| # | File                                               | Purpose                                              |
| - | :------------------------------------------------- | :--------------------------------------------------- |
| 1 | `scripts/contracts/generate-term-sheet.mjs`        | Pre-fill term sheet for operator × tier              |
| 2 | `scripts/contracts/pricing-calculator.mjs`         | Vendor-side pricing band + ARR + margin analysis     |

## When to Use Which

Decision tree from "Operator interest" to "Signed Deal":

1. **Operator expresses interest after pitch** → `MUTUAL_NDA_TEMPLATE.md`
2. **NDA executed; Operator agrees to pilot** → `PILOT_AGREEMENT_TEMPLATE.md`
3. **Pilot succeeds (10/10 + RTP within 0.5pp + dossier approved)** →
   `TERM_SHEET_TEMPLATE.md`
   - Or run `scripts/contracts/generate-term-sheet.mjs --operator=X --tier=Y`
   - Use `scripts/contracts/pricing-calculator.mjs` first to anchor numbers.
4. **Term Sheet agreed** → `MSA_TEMPLATE.md` (binding production agreement)
5. **Discussion turns strategic, not transactional** →
   `PARTNERSHIP_LOI_TEMPLATE.md` (instead of or in parallel with MSA)
6. **Operator (or third party) wants to acquire** →
   `ACQUISITION_DEAL_MEMO_TEMPLATE.md`
7. **Throughout, the Vendor team consults** → `NEGOTIATION_PLAYBOOK.md`

## Generator Quick Start

```sh
# Generate Vendor C Tier-B term sheet:
node scripts/contracts/generate-term-sheet.mjs --operator=aristocrat --tier=B

# Pricing calculator with defaults (Tier-1, 30 games, 3 jurisdictions, standard):
node scripts/contracts/pricing-calculator.mjs

# Pricing calculator JSON output:
node scripts/contracts/pricing-calculator.mjs --format=json
```

The term-sheet generator supports all 7 W213 operator manifests
(lw, aristocrat, igt, playtech, pragmatic, evolution, hacksaw) × 3
tiers (A, B, C) → 21 supported combinations.

## Placeholder Reference (Global)

All templates use `{{snake_case}}` placeholders. Replace before sending
to Operator. The aggregate set used across all templates is:

| Placeholder                       | Used in                                                       |
| :-------------------------------- | :------------------------------------------------------------ |
| `{{operator_name}}`               | All templates                                                 |
| `{{operator_legal_entity}}`       | Term Sheet, Acquisition Memo                                  |
| `{{operator_entity_type}}`        | NDA                                                           |
| `{{operator_jurisdiction}}`       | NDA                                                           |
| `{{operator_address}}`            | NDA                                                           |
| `{{operator_signatory_name}}`     | All templates with signature blocks                           |
| `{{operator_signatory_title}}`    | All templates with signature blocks                           |
| `{{operator_jurisdictions}}`      | LOI                                                           |
| `{{operator_brand}}`              | LOI                                                           |
| `{{operator_tech_contact}}`       | Pilot Agreement                                               |
| `{{operator_biz_contact}}`        | Pilot Agreement                                               |
| `{{operator_titles_committed}}`   | LOI                                                           |
| `{{operator_marketing_usd}}`      | LOI                                                           |
| `{{operator_negotiation_lead}}`   | Term Sheet                                                    |
| `{{vendor_legal_entity}}`         | All templates                                                 |
| `{{vendor_entity_type}}`          | NDA                                                           |
| `{{vendor_address}}`              | NDA                                                           |
| `{{vendor_signatory_name}}`       | All templates with signature blocks                           |
| `{{vendor_signatory_title}}`      | All templates with signature blocks                           |
| `{{vendor_brand}}`                | LOI                                                           |
| `{{vendor_engineering_hours}}`    | LOI                                                           |
| `{{vendor_negotiation_lead}}`     | Term Sheet                                                    |
| `{{effective_date}}`              | NDA, Pilot Agreement, MSA                                     |
| `{{nda_effective_date}}`          | Pilot Agreement, MSA, LOI, Acquisition Memo                   |
| `{{governing_law}}`               | NDA, MSA, Pilot Agreement, LOI                                |
| `{{governing_law_venue}}`         | NDA, MSA, LOI                                                 |
| `{{arbitration_body}}`            | MSA                                                           |
| `{{term_sheet_date}}`             | Term Sheet                                                    |
| `{{selected_tier}}`               | Term Sheet, MSA Appendix D                                    |
| `{{custom_hourly_rate}}`          | Term Sheet                                                    |
| `{{pilot_game_title}}`            | Pilot Agreement                                               |
| `{{pilot_wallet_provider}}`       | Pilot Agreement                                               |
| `{{pilot_jurisdiction}}`          | Pilot Agreement                                               |
| `{{pilot_credit_usd}}`            | Pilot Agreement                                               |
| `{{liability_cap_usd}}`           | MSA                                                           |
| `{{sow_effective_date}}`          | MSA                                                           |
| `{{subprocessor_list_url}}`       | MSA Appendix C                                                |
| `{{escrow_agent}}`                | MSA Appendix F                                                |
| `{{escrow_fee_usd}}`              | MSA Appendix F                                                |
| `{{stretch_bonus_usd}}`           | LOI                                                           |
| `{{acquisition_trigger_usd}}`     | LOI                                                           |
| `{{loi_effective_date}}`          | LOI                                                           |
| `{{memo_date}}`                   | Acquisition Memo                                              |

## Disclaimer Discipline

All six numbered templates (NDA, Pilot, Term Sheet, LOI, MSA,
Acquisition Memo) carry the standard disclaimer block at **the top
AND the bottom**:

```
> **DISCLAIMER:** This is a draft template for negotiation reference only.
> All legal terms require review and approval by licensed counsel before
> execution. Numbers, term lengths, and clause language are illustrative
> starting points — not binding commitments or legal advice.
```

The generator-produced term sheets also carry the same disclaimer
top and bottom — see `generate-term-sheet.mjs` `DISCLAIMER_BLOCK`
export.

---

> **DISCLAIMER (REPEATED):** All documents in this directory are draft
> templates for negotiation reference only. All legal terms require
> review and approval by licensed counsel before execution.
