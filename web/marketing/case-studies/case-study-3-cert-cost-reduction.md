---
title: "Case Study 3 — Mid-Tier US Operator cuts GLI-19 cycle from 8 weeks to 11 days"
operator: "Mid-Tier US Operator B"
publishDate: 2026-05-12
industry: "US online slots / certification"
metrics:
  baseline_cert_weeks: 8
  achieved_cert_days: 11
  cost_per_cert_before_usd: 38000
  cost_per_cert_after_usd: 9500
  audit_reruns_eliminated: 6
---

# Case Study 3 — Mid-Tier US Operator B: GLI-19 cycle 8 weeks → 11 days

## Problem statement

Mid-Tier US Operator B was certifying ~14 titles per year across NJ, PA, MI and WV. Each title required a separate GLI-19 cycle: 8 weeks median, $38K median lab cost. Cert was the critical-path bottleneck — every quarter the launch slate slipped by at least one title because of audit re-runs caused by non-deterministic operator-package archives and missing Monte-Carlo seeds.

## Solution

The operator migrated their math layer to slot-math-engine and adopted the deterministic operator-package workflow (W194 + W212-W214). Closed-form RTP results gave the auditor a re-derivable answer instead of a 10⁹-spin black box; deterministic tarballs eliminated audit re-runs; the cert paper trail is generated automatically as part of the build, not hand-curated.

## Math model used

* Closed-form RTP solver for every title
* MC validator at 5e8 spins (paper trail, not source of truth)
* Deterministic operator-package archive (byte-stable across re-builds)
* Per-jurisdiction overlay engine (NJ, PA, MI, WV)
* Auto-generated cert dossier with hashed reproducibility manifest

## Timeline (per title, after migration)

| Day | Milestone |
| --- | --- |
| 0   | Build complete in studio |
| 1   | Operator-package produced, hashed manifest signed |
| 3   | GLI-19 submission with closed-form + MC + reproducibility manifest |
| 8   | Lab review completes (re-derived RTP matches closed-form) |
| 11  | Certification PASS, build live in NJ, PA, MI, WV |

## Results

* Cert cycle reduced from 8 weeks to 11 days (~86% reduction)
* Median lab cost dropped from $38K → $9.5K (audit re-runs eliminated)
* 6 audit re-runs avoided in the first quarter post-migration
* Launch slate predictability: zero quarter-end slippage in two consecutive quarters
* Single deterministic tarball per title, signed and hash-pinned

## Lessons

1. The dominant lab cost is not the initial review — it's audit re-runs caused by non-determinism. Making the archive byte-stable kills the re-run cycle.
2. Closed-form RTP results compress lab review because the auditor can re-derive in minutes instead of replaying a 10⁹-spin trace.
3. A reproducibility manifest (hash of every input, deterministic build flags, pinned tool versions) is more valuable to a lab than any additional simulation data.

> "We took an 8-week certification cycle down to 11 days and shaved $28K per title off the lab bill. That's not a marginal improvement — it changes how we plan launches."
> — <Role at Operator>, Mid-Tier US Operator B
