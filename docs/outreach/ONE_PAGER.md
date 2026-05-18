# slot-math-engine — One-Pager (Markdown source)

> Single-page artifact for outreach attachments, email previews, and printed leave-behinds.
> HTML equivalent: `docs/outreach/one-pager.html` (offline-self-contained, print-CSS for PDF export).

---

## Headline
# Ship lab-cert'd slot titles in 14 days, not 14 weeks.

**Tagline:** 77 closed-form solvers. 16/16 L&W mechanics. 4-lab cert paper trail.
30-day pilot, zero cost-to-walk-away.

---

## Q1 — Numbers (the math)

| Metric | Value |
|---|---|
| Vitest grand-total specs | 7,400+ |
| Closed-form solvers landed | 77 |
| L&W mechanic gaps closed | 16 / 16 |
| Industry-pattern catalog | 97 P-IDs |
| CI gates (one per acceptance) | 106 |
| 5-year NPV impact (base case) | +$33M |
| Math + lab-cert cycle time | 14 days vs 12–18 weeks |
| Live jurisdictions | 15 |

---

## Q2 — Differentiators vs incumbents

- **Closed-form first, MC second.** Every solver has a closed-form RTP/variance ground-truth reconciled against ≥1M Monte Carlo spins. Incumbents ship MC-only.
- **Cryptographic paper trail.** Ed25519-signed manifests, Merkle PAR commitment, SHA-256 reproducibility. No vendor can tamper post-cert without detection.
- **Cross-language byte parity.** TypeScript and Rust kernels are byte-identical across macOS/Linux/Windows/ARM. Differential-fuzz CI-gated.

---

## Q3 — Lab matrix (4 labs ready today)

| Lab | Adapter status | Sample dossier | Jurisdiction coverage |
|---|---|---|---|
| **BMM Testlabs** | Plugged | ✓ in tarball | UK / MGA / NV / NJ |
| **GLI (Gaming Labs Intl)** | Plugged | ✓ in tarball | NJ / PA / MI / global |
| **eCOGRA** | Plugged | ✓ in tarball | UKGC / MGA |
| **NMi** | Plugged | ✓ in tarball | NL / DK / ON |

Submission format: each lab's preferred manifest schema, auto-generated from our engine. No manual paperwork.

---

## Q4 — Pilot path (30 days, 3 milestones)

- **Day 7** — Title ported. We take one of your existing L&W titles, port the math IR, run closed-form solver, reconcile against your internal cert dossier RTP. Side-by-side report delivered.
- **Day 14** — Lab paper-trail dry-run. Submit to BMM or GLI (your choice) as a dry-run. Verify the dossier passes their format check end-to-end. No actual cert fee.
- **Day 30** — Decision point. You evaluate: license / acquire / walk-away. We pre-stage all three contracts. Zero cost-to-walk-away. Tenant decommissioned same day if you walk.

---

## Bottom — CTA

**Tarball (offline, signed)**: download at {{tarball_link}}
**One-pager HTML / printable**: `docs/outreach/one-pager.html`
**Technical deep-dive**: `docs/LW_TECHNICAL_DEEP_DIVE.md`
**Contact**: {{sender_name}} — {{sender_email}} — {{sender_phone}}

**Next step**: 30 minutes of your CTO + math lead's time. We bring the engine on a laptop.

---

## Verify everything we claim (≤10 minutes)

```sh
# Step 1: Download the tarball.
curl -L -o pitch.tar.gz {{tarball_link}}

# Step 2: Verify Ed25519 signature on manifest (no install).
node verify.mjs pitch.tar.gz

# Step 3: Run the closed-form portfolio yourself.
tar -xzf pitch.tar.gz && cd pitch-package
npm install && npm run closed-form-portfolio
# → expect 77/77 PASS in ~3 seconds.
```

Every number on this page traces to a reproducible artifact in the tarball.

---

## Why now (one paragraph)

The math + cert paper-trail stage is the longest single bottleneck in slot title release cycles. Every major operator quietly acknowledges it. We did the 100+ wave grind to compress it. L&W has the catalog and the brand; we have the closed-form portfolio and the lab adapters. The math is independently verifiable; the integration is contract-bounded; the downside is zero. The asymmetry of this is the whole pitch.

---

## Placeholder reference
- {{tarball_link}}, {{sender_name}}, {{sender_email}}, {{sender_phone}}
