# 3-Minute Screen Recording — Demo Script

> Summary line 1: Studio Builder live demo — drag-drop math IR, RTP curve, run 1M MC, export cert.
> Summary line 2: Use as Loom for cold outreach, embedded in deck slide 11, or pre-meeting send-ahead.
> Summary line 3: Total duration: 3 minutes. VO: ~360 words.

## Goal
Take a viewer who knows nothing about us from cold to "I want to talk to these people".

## Materials needed
- Studio app running locally (`npm run studio:dev`)
- Pre-staged math IR file `dragon-train-port.json` (any Vendor B title structurally)
- Loom or OBS at 1080p, 30 fps
- Mic at -12 dBFS
- Studio's window dock-able to left half of screen, terminal right half

## Frame-by-frame sequence

### 0:00–0:15 (15 sec) — Intro
- **Screen**: Studio app open, blank canvas, your face top-right corner.
- **VO**: "Three minutes. I'm going to take a math IR file, drop it into our Studio, see the RTP curve live, run a million Monte Carlo spins, and export a cert dossier. Watch the clock."
- **Cue**: timer overlay starts top-right.

### 0:15–0:45 (30 sec) — Drop the IR
- **Screen**: drag `dragon-train-port.json` from Finder into Studio canvas.
- **VO**: "First — drop the math IR. This is one of Vendor B's titles, ported to our IR format. It's just JSON. Reels, paytable, paylines, bonus rules. No proprietary binary."
- **Cue**: file lands; engine compiles; pipeline graph renders in ~200 ms.
- **Pacing note**: pause 2 seconds on the pipeline graph. Let it breathe.

### 0:45–1:15 (30 sec) — RTP curve live
- **Screen**: click "Run closed-form solver". RTP curve renders.
- **VO**: "Run the closed-form solver. RTP comes back in a hundred milliseconds. That's the green line — 96.42%. Variance is the orange shaded band. Hit frequency is the histogram below. All closed-form, all exact."
- **Cue**: hover over the green line at one point to show tooltip.
- **Pacing note**: speak SLOWLY here. The viewer needs 5 sec to absorb the curve.

### 1:15–1:55 (40 sec) — 1M Monte Carlo
- **Screen**: click "Run 1M MC".
- **VO**: "Now let's reconcile with Monte Carlo. One million spins. Rust kernel under the hood. Watch the drift band — it's narrowing. The closed-form line is the truth; the MC line should converge to it. At about 200K spins, you can see they agree to four decimal places."
- **Cue**: progress bar fills; convergence line drops below ±0.01%.
- **Pacing note**: highlight the moment of convergence with a soft "ding" sound effect.

### 1:55–2:25 (30 sec) — Cert export
- **Screen**: click "Export Cert Dossier".
- **VO**: "Export the cert dossier. Two hundred milliseconds. Open it. Here's the SHA-256 manifest. Here's the Ed25519 signature. Here's the PAR commitment Merkle root. Anyone — your math team, your auditor, BMM, GLI — can verify this offline. Try to tamper with one bit and the manifest rejects it."
- **Cue**: PDF / JSON opens in adjacent window; scroll quickly through 3 pages.
- **Pacing note**: don't read every line — the visual scroll is the point.

### 2:25–2:50 (25 sec) — Wrap
- **Screen**: terminal showing `npm run pitch:verify` succeed.
- **VO**: "Same verification, command-line. Same result. No console required. Every claim in this clip is in the pitch tarball I'll link below. Built today, signed today, reproducible on your laptop today."
- **Cue**: "VERIFICATION OK" appears.

### 2:50–3:00 (10 sec) — Close
- **Screen**: face full-screen.
- **VO**: "Thirty-day pilot, zero cost-to-walk-away. Tarball link is in the description. Reply or DM — I'll send it tonight."
- **Cue**: caption with tarball URL on screen.

## Pacing notes
- Slow on the RTP curve (sec 45–75) — viewers need time to absorb.
- Fast on the cert PDF scroll (sec 115–145) — momentum.
- Final 10 sec — no rush; close with eye contact via webcam.

## Voiceover total word count
- Target: 360–400 words at conversational pace (120 wpm).
- Record VO separately first, time it, then sync to screen recording.

## Pre-record checklist
- [ ] Studio app pre-loaded with the IR file in clipboard for drag-drop
- [ ] Rust engine pre-compiled (so MC kicks off instantly, no warm-up)
- [ ] Tarball pre-built so `verify.mjs` succeeds in real time
- [ ] No notifications visible
- [ ] Browser bookmarks bar hidden
- [ ] Screen recording window cropped to remove dock / menubar clutter
- [ ] Three takes minimum; pick the cleanest

## Post-record editing
- Add timer overlay top-right ticking 0:00 → 3:00
- Add caption overlays for key moments (RTP, MC convergence, verify OK)
- Soft "ding" SFX at MC convergence (sec 1:50)
- Add tarball URL caption final 10 sec
- Export 1080p, H.264, ≤200 MB
- Subtitles (.srt) required for LinkedIn / email mute-by-default viewers

## Where to use
- Loom embed in cold-CTO-email.md
- Pitch deck slide 11 (replaces static screenshot)
- Sales engineer onboarding training
- Pre-meeting send-ahead in warm-cto-intro.md

## Success metric
- View completion rate ≥60%
- Tarball download from video viewers ≥10%
- Meeting requests from video viewers ≥3%
