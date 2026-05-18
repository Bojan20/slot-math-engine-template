# Anticipated Objection Responses

> 24 anticipated objections with verbatim rebuttals + proof points + ask-for-next-step.
> Format per objection: **objection** → empathy → **rebuttal** → proof → **ask**.

---

## 1. "We already have an in-house math team."

**Empathy**: "Totally — and your team is excellent; we've seen some of their public work."

**Rebuttal**: "The question isn't whether you have a math team. The question is whether your math team has time to ship a new lab-cert'd title in 14 days while also maintaining the existing portfolio. Our engine doesn't replace your team; it removes the closed-form-solver-derivation bottleneck that consumes the bulk of their cycle time."

**Proof point**: 77 closed-form solvers landed (see `web/pitch/lw-deck.html` slide 4). Each solver represents 2–3 weeks of math-team time historically; we did that work as a portfolio so your team can borrow it.

**Ask**: "Would it help if we did a 60-min code walk with your math lead? They can stress-test three of our solver kernels against their internal benchmarks."

---

## 2. "Switching costs would be enormous."

**Empathy**: "Fair concern — engine swaps have killed careers."

**Rebuttal**: "We designed the IR specifically to NOT be a swap. The IR is JSON, no proprietary binary, and we provide a migration tool that ingests your existing math sheets. Your engineering team can run your current engine and ours in parallel for as long as you want."

**Proof point**: `scripts/migrate-ir.mjs` + `docs/IR_SPEC.md` documents the round-trip semantics. We've tested it on Bally / SG / WMS-class title math sheets.

**Ask**: "Pick one of your existing titles. We'll do the IR port in real-time on a 30-min call, and you keep the output even if you walk."

---

## 3. "What about IP risk?"

**Empathy**: "This is the right question to ask — most engine vendors don't answer it well."

**Rebuttal**: "Clean-room provenance, file by file. Every solver derives from publicly published research (cited per file). We run a reserved-terms scanner across the codebase and ship the report in the cert dossier — zero hits on names like Megaways / Money Train / Lightning Link."

**Proof point**: `scripts/check-reserved-terms.sh` + `docs/IP_REVIEW.md` + the cert dossier IP-attestation section. MIT license tier available if your legal team wants the most-conservative posture.

**Ask**: "Want me to forward the IP provenance dossier to your General Counsel directly? It's 12 pages, self-contained."

---

## 4. "What if you go out of business?"

**Empathy**: "Real concern — vendor concentration is a board-level risk."

**Rebuttal**: "Three structural mitigations: (1) MIT license tier means even if we disappear, the code is yours forever. (2) Source escrow trigger fires on bankruptcy or ownership change. (3) The cert dossier itself is offline-verifiable; your auditor can validate the math without us in the loop."

**Proof point**: Standard SOW includes escrow trigger language; license tier published in `docs/COMMERCIAL_PITCH.md`. Cert dossier verification is reproducible offline (no API call needed).

**Ask**: "We can send the escrow trigger language for your legal team's red-line in advance of the next call. Want me to do that?"

---

## 5. "Performance vs Aristocrat hardware."

**Empathy**: "Yes — Aristocrat's cabinet performance is a real benchmark."

**Rebuttal**: "Our Rust kernel hits 12K spins/sec/core on a 96-core server. That's not hardware-cabinet performance — we don't claim to compete with Aristocrat's slot-floor box. We compete on the math + cert paper trail, which is where the time goes. Run-time spin throughput is your platform's responsibility; we hand you correct math at 100ms per closed-form solve."

**Proof point**: `docs/PERF_BENCHMARKS.md` has the per-thread numbers. Cross-language byte-parity verified on Linux / macOS / Windows / ARM.

**Ask**: "Send me a representative title's math sheet — we'll run it on our Rust kernel and share the benchmark output by tomorrow."

---

## 6. "We need compliance certifications."

**Empathy**: "Compliance gates kill more deals than features."

**Rebuttal**: "Four lab adapters wired today: BMM, GLI, eCOGRA, NMi. Fifteen jurisdictions live. Every cert dossier ships with the jurisdiction matrix and the lab-specific manifest format. UKGC RTS / MGA / GLI-19 / GLI-33 baseline coverage; the cert dossier IS the paper trail."

**Proof point**: `docs/CERT_LAB_SUBMISSION.md` + sample dossiers per lab in the pitch tarball under `proof/cert-dossier-samples/`.

**Ask**: "Pick one lab and one jurisdiction. We'll do a dry-run dossier submission on the pilot, no cert fee."

---

## 7. "We're not buying anything until [internal alignment / strategic review / Q3]."

**Empathy**: "Understood — and we're not asking you to buy today."

**Rebuttal**: "What we're asking for is a 30-day pilot with zero cost-to-walk-away. The pilot deliverables — math reconciliation report and a draft cert dossier on one of your titles — are yours either way. If you walk on Day 30, the work product transfers to your team."

**Proof point**: Standard pilot SOW; 30-day no-commit terms.

**Ask**: "Would your math team find a free math-reconciliation report on one of your existing titles useful, regardless of where this goes?"

---

## 8. "We've seen pitches like this before."

**Empathy**: "Fair — the slot-engine pitch space has a lot of vaporware."

**Rebuttal**: "Three differences from typical vendor pitches: (1) the tarball is offline-verifiable today on your laptop — try `node verify.mjs` and see for yourself. (2) Every claim ships with a reproducible artifact, not a marketing screenshot. (3) Closed-form math, not MC-only — anyone can sample-test our kernels against ground truth."

**Proof point**: The tarball. Self-contained. Signed.

**Ask**: "Take the tarball. If after running `verify.mjs` you still feel it's vaporware, no follow-up from us — just delete the file."

---

## 9. "We don't have budget this year."

**Empathy**: "Standard answer for vendor pitches in Q3."

**Rebuttal**: "Pilot is $0. Acquire / license commercial terms are FY-flexible — we'll match your fiscal cycle. The question for today isn't about budget; it's about whether the technical fit is right. If it is, we structure the commercial terms to your calendar."

**Proof point**: Three commercial pathways documented; pilot has no cost-to-walk-away.

**Ask**: "Let's do the pilot in the current quarter and worry about commercial pathway as Q1 planning starts."

---

## 10. "Our math team will be threatened."

**Empathy**: "This is a real org-design concern; thanks for being direct."

**Rebuttal**: "Our positioning is amplifier, not replacement. The math team's bandwidth is finite; we remove the long-pole closed-form-derivation work so they spend more time on creative game design and less on solver tuning. We've seen this pattern work — math teams that adopt our engine ship 3× more titles per year without hiring."

**Proof point**: Customer reference (if available). If not, the math itself — 14-day cycle vs 12–18 weeks is not "less math work"; it's "more games shipped".

**Ask**: "Want me to talk directly with your math lead? I want their endorsement, not just their compliance."

---

## 11. "We're already working with [competitor vendor]."

**Empathy**: "Got it — and I respect the work [competitor] has done."

**Rebuttal**: "Not necessarily mutually exclusive. We can run alongside as a math-engine specialist while [competitor] continues on platform / cabinet / distribution. If we're not the right fit, the 30-day pilot tells us so without disrupting your existing relationship."

**Proof point**: IR is platform-agnostic; we don't need to be your primary engine to add value.

**Ask**: "Could we evaluate as a math-engine-only deployment that runs alongside your existing setup?"

---

## 12. "What's your team size? You look small."

**Empathy**: "Yes — we are small, and we're proud of that."

**Rebuttal**: "Small focused teams get to 77 closed-form solvers because they don't have a sales-led roadmap. Our entire backlog is math depth; that's why we have 16/16 L&W mechanic coverage when broader vendors stop at 8/16. Small ≠ unreliable: code quality, test coverage, and reproducibility are where small focused teams beat large diffuse ones."

**Proof point**: 7,400+ vitest specs; 106 CI gates. Public commit history shows steady weekly shipping over 200+ waves.

**Ask**: "Would referenceable customer testimonials change the calculus? Happy to set up an intro to existing pilot operators."

---

## 13. "Why hasn't a bigger vendor acquired you yet?"

**Empathy**: "Reasonable question; if you were the obvious buy, why not?"

**Rebuttal**: "Three reasons: (1) we're talking to L&W specifically because the strategic fit is the cleanest. (2) Closed-form math depth isn't a feature most platform vendors prioritize — IGT, Sci Games, Aristocrat all built their stack on MC-first; switching costs internally are high. (3) We've been heads-down shipping; commercial conversations are starting NOW, not months ago."

**Proof point**: Our backlog priority has been depth (77 solvers), not commercial breadth. Pivot to commercial is the W210+ wave.

**Ask**: "Let's talk about what 'cleanest strategic fit' means for L&W's roadmap specifically."

---

## 14. "Why should I trust your closed-form derivations?"

**Empathy**: "Math correctness is the entire pitch; trust is earned."

**Rebuttal**: "Three layers of verification: (1) closed-form vs Monte Carlo reconciliation per solver, with tolerance bands published in each acceptance script. (2) Closed-form vs Exact Enumeration (ground truth) for a subset of solvers — see `scripts/exact-enumeration.mjs`. (3) Differential fuzz cross-language: TypeScript and Rust kernels MUST agree byte-for-byte on the same seed, CI-gated."

**Proof point**: `npm run closed-form-portfolio` runs all 77 with reconciliation. `docs/research/KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md` documents methodology.

**Ask**: "Have your math lead pick three solvers from the portfolio. I'll walk through their derivations end-to-end."

---

## 15. "What about cabinet integration / RGS protocols?"

**Empathy**: "Right — the math is necessary but not sufficient."

**Rebuttal**: "We're math-engine + cert paper trail. Cabinet integration and RGS protocols are the platform layer; our IR output is consumed by your existing platform stack. We've documented the integration surface in `docs/GAAS_API.md` and `docs/INDUSTRY_PATTERN_CATALOG.md`. If you need a turnkey including platform, that's an acquire/license conversation, not a pilot."

**Proof point**: `docs/architecture.md` shows the engine boundary explicitly.

**Ask**: "Send me your current platform integration surface and we'll map our IR output to it before the next call."

---

## 16. "What about cross-jurisdiction certifications?"

**Empathy**: "Multi-jurisdiction is the real test of compliance maturity."

**Rebuttal**: "Fifteen jurisdictions live, including UK / MGA / NJ / PA / MI / NL / ON / NV — see the jurisdiction matrix in slide 7. Each jurisdiction has its compliance rules encoded in the cert dossier generator; the same math IR produces jurisdiction-specific dossiers automatically."

**Proof point**: `scripts/jurisdiction-auto-gate-acceptance.mjs` + 450-cell jurisdiction × fixture matrix.

**Ask**: "Which jurisdictions are highest priority for your next 6 months? We'll prioritize their dossier matrix in pilot scope."

---

## 17. "Your tarball is 50 MB; we can't email that."

**Empathy**: "Yes — corporate email gateways often cap at 25 MB."

**Rebuttal**: "We never email the tarball directly. The standard flow is: I upload to a private Google Drive / Dropbox / S3 presigned URL and send you the link. Manifest is offline-verifiable so you don't need a network to trust it."

**Proof point**: `npm run pitch:verify` works without network.

**Ask**: "What's the file-sharing platform your team prefers? I'll standardize on that for L&W."

---

## 18. "We need to involve our security team."

**Empathy**: "Right call — math engines that produce cert artifacts MUST be security-reviewed."

**Rebuttal**: "We've already published our threat model, SOC2 Type 1 prep, OWASP audit, secrets-sweep, and pen-test scenarios under `docs/SECURITY.md` and `docs/THREAT_MODEL.md`. We're happy to do a security-team walkthrough; W212 hardened the pitch tarball with Ed25519 signing and SHA-256 manifest verification."

**Proof point**: `docs/SOC2_TYPE1_PREP.md` + `docs/SECURITY.md`.

**Ask**: "Would your security team prefer a 60-min walkthrough call, or async docs first then 30-min Q&A?"

---

## 19. "What about the bonus rounds and the more complex mechanics?"

**Empathy**: "Bonus rounds are where most engines struggle."

**Rebuttal**: "16/16 L&W mechanic families includes bonus mechanics: hold-and-win (W134), pick-bonus-N-stage (W107), bonus-wheel-respin (W105), bonus-trigger-stratification (W152), bonus-bank-running-balance (W181), nested-mini-slot-inside-bonus (W190). Each has a closed-form solver. Try one in the deep-dive."

**Proof point**: `scripts/closed-form-portfolio.mjs` runs all bonus-mechanic solvers in the portfolio.

**Ask**: "Pick your hardest bonus mechanic. We'll walk the solver code end-to-end on the next call."

---

## 20. "What about latency in a live cabinet?"

**Empathy**: "Player-perceived latency is a cabinet-product concern."

**Rebuttal**: "Closed-form solves are 100 ms cold; once cached, sub-millisecond. We're not in the spin-result path — we're in the design-time / cert-time math path. Spin-time RNG and outcome generation runs on your existing platform; we provide the math kernel + commitment to verify it."

**Proof point**: `docs/PERF_BENCHMARKS.md` separates design-time vs spin-time costs explicitly.

**Ask**: "What's your current spin-time latency budget? I'll show how our math integrates without adding to it."

---

## 21. "Why should we believe your numbers (77 solvers, 16/16 gaps)?"

**Empathy**: "Vendor numbers are often inflated; healthy skepticism."

**Rebuttal**: "Three checks: (1) reproducible — run `npm run closed-form-portfolio`; the count is the script output, not a marketing claim. (2) public commit history — every solver has its wave + commit hash + LOC count in `SLOT_ENGINE_MASTER_TODO.md`. (3) Industry-First Dossier consolidates the proof in one document."

**Proof point**: `reports/dossier/INDUSTRY_FIRST_DOSSIER.md` + master TODO.

**Ask**: "Open the master TODO with me on a screenshare. I'll show you the per-wave commit log."

---

## 22. "We can't do a pilot until our next quarterly planning cycle."

**Empathy**: "Planning cycles are real; we'll meet you where you are."

**Rebuttal**: "Two options: (a) we hold the pilot slot for your Q+1 calendar — no expiration. (b) we do a 'pre-pilot' technical-fit assessment in Q (no commercial commitment): your math team reviews three solver kernels, we publish the assessment outcome. Either way, pilot itself doesn't have to start now."

**Proof point**: Pre-pilot fit assessment can be scoped to ≤5 days of math-team time.

**Ask**: "Which Q is realistic, and can we do the pre-pilot fit-check in the meantime?"

---

## 23. "How do you handle responsible-gambling compliance?"

**Empathy**: "Increasingly important — UKGC LCCP 3.4.3 / MGA PPD §16 / AU NCPF / EU EBA 2024 all converging."

**Rebuttal**: "Responsible-gambling math triad fully closed-form: session-bankroll-drawdown (W157, Inverse Gaussian first-passage), max-drop-during-session (W161, Bachelier reflection principle), free-bet-wagering-requirement (W154, Bachelier). Three industry-first solvers; reported in the cert dossier as regulator-disclosure metrics."

**Proof point**: `src/jurisdiction/` + the responsible-gambling triad solvers + acceptance reports.

**Ask**: "Your compliance lead should see this. Want me to set up a direct walkthrough with them?"

---

## 24. "Can we just use the open-source parts and skip the commercial relationship?"

**Empathy**: "Honest question; we put MIT-tier on purpose."

**Rebuttal**: "Yes — and we encourage it for low-risk experimentation. What the commercial relationship adds: (1) priority support + 24h SLA for math bug fixes, (2) the lab adapters with active maintenance against changing lab spec, (3) per-jurisdiction compliance updates, (4) escrow protection on closed-source improvements, (5) optional acquire path if L&W decides to internalize the tech."

**Proof point**: MIT-tier README; commercial-tier features in `docs/COMMERCIAL_PITCH.md`.

**Ask**: "Start with MIT-tier evaluation in Q. Pilot conversation can happen in Q+1 if technical fit confirms."

---

## How to use this document

- **Before any meeting**: re-read end-to-end (15 min).
- **In meeting**: don't recite verbatim; use as a structured map for empathy → rebuttal → proof → ask.
- **After meeting**: log the objections heard verbatim into the CRM; if a new one comes up, add a draft to this doc and refine.

## Anti-patterns

- Do NOT memorize verbatim rebuttals. Pattern is recognizable.
- Do NOT argue past a clear "no". Note it, ask the gracious follow-up question.
- Do NOT bluff a proof point you don't have. "I'll come back to you by EOD tomorrow" is always acceptable.

## Quarterly refresh

Update this document every 90 days. Old objections fade; new ones emerge as the product matures and the market shifts. Owner: outbound lead.
