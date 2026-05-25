# 5-Minute Loom Walkthrough — Demo Script

> Summary line 1: Persona-driven (CTO view of pilot flow); day-by-day pilot narrative.
> Summary line 2: Use as post-demo follow-up Loom, or pre-call send-ahead for warm intros.
> Summary line 3: Total duration: 5 minutes. VO: ~600 words. Interactive-friendly.

## Goal
Make a Vendor B CTO see themselves as the protagonist of the pilot story.

## Frame
You are narrating the pilot AS THE CTO experiencing it. First-person CTO POV. The viewer is the CTO. You are saying what they would feel.

## Materials needed
- Loom Desktop app (allows webcam picture-in-picture)
- Studio app + Operator app + Regulator app all running locally
- Pre-staged pilot tenant `lw-pilot-demo` already seeded
- Mic at -12 dBFS, headset preferred for 5-min recordings
- Browser zoom 110% for screen readability

## Frame-by-frame sequence

### 0:00–0:30 (30 sec) — Persona open
- **Screen**: webcam + Studio app open, blank.
- **VO (verbatim)**: "Hi — pretend you're the CTO of Vendor B. It's Monday morning. You decided last Friday to pilot the slot-math-engine. Today is Day 0. The next five minutes is the pilot, compressed."
- **Pacing note**: address the viewer directly. "You" is the protagonist.

### 0:30–1:15 (45 sec) — Day 0: Seed
- **Screen**: terminal split-pane with Studio + Operator app.
- **VO**: "Day 0. We provision your sandbox tenant. One command — `npm run pilot:seed`. Watch the terminal. Tenant created, database migrated, RNG seeded, license signed, sample title imported. About two and a half seconds. Now you've got a Studio app running in your browser at port 5173 and an Operator console at port 5174. Both authenticated, both yours."
- **Cue**: type the command live; let it complete; switch tabs to Studio.
- **Pacing note**: don't rush the 2.5-second wait. Confidence comes from "we don't need to fake speed".

### 1:15–2:00 (45 sec) — Day 1: Integration
- **Screen**: Studio app, drag-drop one of Vendor B's IR files.
- **VO**: "Day 1. Your math team takes one of Vendor B's existing titles — pick any of the sixteen mechanic families — and drops the IR into the Studio. Engine compiles. Closed-form solver runs. The RTP comes back in a hundred milliseconds. Your math team compares it against Vendor B's internal cert dossier RTP — and they match to four decimal places. That's Day 1. Math reconciled."
- **Cue**: highlight the green RTP value vs reference RTP side-by-side.
- **Pacing note**: pause for 2 seconds on the side-by-side comparison.

### 2:00–2:45 (45 sec) — Day 7: First lab dry-run
- **Screen**: switch to Operator app's cert-dossier view.
- **VO**: "Day 7. Time to test the lab paper trail. You pick BMM or GLI — let's say GLI. We submit a dry-run dossier through the adapter. GLI's format check passes end-to-end. No cert fee yet — this is just verifying our manifest format matches their submission spec. Five seconds to build the dossier, dry-run submitted, GLI returns 'format OK'."
- **Cue**: trigger the dry-run, show the GLI response.
- **Pacing note**: highlight that this is no-fee, no-commitment.

### 2:45–3:30 (45 sec) — Day 14: Closed-form portfolio gate
- **Screen**: terminal, run `npm run closed-form-portfolio`.
- **VO**: "Day 14. Half-way through the pilot. Your team wants to know — what's the regression-protection story? Run the closed-form portfolio: seventy-seven solvers, each with closed-form ground-truth vs MC reconciliation. CI gate fires. 77 of 77 PASS. Now your team has a regression-baseline they can ship into their own CI."
- **Cue**: show the 77/77 PASS line; zoom into one solver's report.
- **Pacing note**: this is the technical-credibility climax.

### 3:30–4:15 (45 sec) — Day 22: Cert export + dossier
- **Screen**: Operator app, click "Generate Cert Dossier".
- **VO**: "Day 22. Generate the production cert dossier. PDF + JSON manifest, SHA-256 hashed, Ed25519 signed. Submit to BMM, GLI, eCOGRA, NMi — any of the four labs that fit your jurisdiction. The dossier includes the math, the MC reconciliation, the seed provenance, the IP attestation, the PAR commitment, and the per-jurisdiction compliance matrix. Your auditor receives this and verifies it offline in two minutes."
- **Cue**: PDF opens; flip through 3 representative pages.
- **Pacing note**: the visual flip is the point — viewer doesn't need to read every line.

### 4:15–4:45 (30 sec) — Day 30: Decision
- **Screen**: switch back to webcam.
- **VO**: "Day 30. You decide. License, acquire, or walk away. We've pre-staged all three contracts. If you walk, sandbox is decommissioned same day, your team takes the math reconciliation report and the cert dossier with them — those are yours either way. Zero cost-to-walk-away is in the SOW, not the marketing copy."
- **Pacing note**: confident, slow, eye contact.

### 4:45–5:00 (15 sec) — Close
- **Screen**: face full-screen, one-pager URL caption.
- **VO**: "That's the pilot. Tarball link in description, one-pager next to it. Pick a Tuesday or Thursday this month, I'll bring the laptop. Thanks for five minutes."

## Where to pause for emphasis
- 0:30 (you're the protagonist) — let the framing land
- 1:00 (2.5-second seed) — confidence
- 1:55 (RTP match to 4 decimal places) — technical proof
- 2:40 (dry-run no fee) — commercial de-risking
- 3:25 (77 of 77 PASS) — regression baseline
- 4:10 (auditor 2-min verify) — auditor's perspective
- 4:40 (zero cost-to-walk-away in SOW) — closing trust signal

## Anticipated questions (if recording interactive Loom with comments)

### Q1: "What if your closed-form solver disagrees with our internal dossier RTP?"
- **Answer**: "If they disagree, your dossier's internal MC noise is the most likely cause; we'll show you the closed-form derivation step-by-step. If our solver has a bug, we ship a patch within 24 hours — that's in the pilot SLA."

### Q2: "What about IP risk on the math kernels?"
- **Answer**: "Clean-room. Every solver is derived from publicly published research (cited per file). Zero reserved-term violations in the catalog (verified per dossier). MIT license tier available."

### Q3: "What about performance under production load?"
- **Answer**: "Rust kernel: 12K spins/second per thread, scales linearly to 96 cores. TypeScript kernel: 1.2K spins/second per thread, for browser-side replay only. Bench reports in the tarball."

### Q4: "How do you handle the lab cert fee?"
- **Answer**: "Pilot dry-runs are no-fee; production cert submissions you pay the lab directly per their standard rates. We handle the format generation, lab handles the validation."

### Q5: "What's the team behind this?"
- **Answer**: "Small focused team. Our only product is the math engine. That focus is why we got to 77 closed-form solvers and 16/16 Vendor B mechanic coverage; broader companies don't dedicate this depth to one layer."

## Voiceover total word count
- Target: 600–650 words at conversational pace (120–125 wpm).

## Pre-record checklist
- [ ] All three apps (Studio, Operator, Regulator) pre-loaded
- [ ] Sample title IR file ready in clipboard
- [ ] Cert dossier pre-generated as fallback (in case live gen hiccups)
- [ ] Webcam framing — top-third of face visible, eye-line camera-level
- [ ] Headset / mic tested
- [ ] Browser zoom set to 110%
- [ ] No notifications visible
- [ ] Backup take queued in case primary fails

## Post-record editing
- Add chapter markers in Loom (Day 0 / Day 1 / Day 7 / Day 14 / Day 22 / Day 30)
- Captions for sound-off
- Tarball URL caption final 15 seconds
- Loom shareable URL → embed in `followup-after-meeting.md`

## Where to use
- Post-meeting follow-up Loom (sent within 4 hours of demo)
- Pre-meeting send-ahead in `warm-cto-intro.md`
- Vendor B internal forwarding artifact (CTO forwards to math lead, EM, head of compliance)

## Success metric
- View completion rate ≥50% (5 min is long; we accept lower completion than 30-sec)
- Chapter 4 (Day 14 portfolio) reached ≥70% (the technical-credibility climax)
- Tarball download from viewers ≥15%
- Pilot-signed within 14 days of Loom send ≥25%
