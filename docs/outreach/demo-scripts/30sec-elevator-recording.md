# 30-Second Elevator Demo — Recording Script

> Summary line 1: Frame-by-frame camera/screen sequence for a 30-second demo recording.
> Summary line 2: Use this when sharing as a video clip in LinkedIn DM / email signature / G2E booth.
> Summary line 3: Total duration: 30 seconds. Voice-over: 60–70 words.

## Goal
Make a recipient open the tarball within 5 minutes of watching.

## Materials needed
- Loom, OBS, or QuickTime
- Laptop with `web/pitch/lw-deck.html` open
- Terminal with `npm run pitch:tarball:dry` ready to run
- Mic (headset OK; built-in laptop mic is fine for 30 sec)
- Tarball already pre-built so `verify.mjs` succeeds in real time

## Frame-by-frame sequence

### Frames 0:00–0:03 (3 sec) — Hook
- **Camera/screen**: webcam-only, talking head, you smiling, slight zoom.
- **VO (verbatim)**: "Watch this — slot math engine. Three commands."
- **Software cue**: webcam fade-in.
- **Pacing note**: confident, no hedging. Smile.

### Frames 0:03–0:10 (7 sec) — Build
- **Camera/screen**: switch to terminal full-screen.
- **VO**: "Build the pitch tarball. One command. Engine snapshot, manifest, signed."
- **Software cue**: type `npm run pitch:tarball` slowly enough to read. Hit enter at 0:06.
- **Wait for**: tarball completion stdout flicker visible.
- **Pacing note**: don't truncate; let viewer see the green ✓ at end.

### Frames 0:10–0:20 (10 sec) — Verify
- **Camera/screen**: terminal, scroll to fresh prompt.
- **VO**: "Verify it. Ed25519 signature. SHA-256 manifest. Reproduces byte-for-byte across machines."
- **Software cue**: type `node verify.mjs pitch.tar.gz` slowly. Enter at 0:14.
- **Wait for**: "MANIFEST OK" / "SIGNATURE OK" lines.
- **Pacing note**: pause for 1 sec on the green "OK" line. The pause is the proof.

### Frames 0:20–0:27 (7 sec) — Run portfolio
- **Camera/screen**: terminal, fresh prompt.
- **VO**: "And the closed-form solver portfolio runs in three seconds. Seventy-seven solvers."
- **Software cue**: type `npm run closed-form-portfolio`. Enter at 0:21.
- **Wait for**: "77/77 PASS" line.
- **Pacing note**: this is the climax frame. Let it sit on screen.

### Frames 0:27–0:30 (3 sec) — Close
- **Camera/screen**: switch back to webcam.
- **VO**: "Your move."
- **Software cue**: webcam centered, tarball download URL visible as caption overlay.
- **Pacing note**: don't smile at this line. Confident, neutral. 2 sec hold.

## Sample VO (verbatim, 30 sec read at normal pace)
"Watch this. Slot math engine. Three commands. Build the pitch tarball. One command. Engine snapshot, manifest, signed. Verify it. Ed25519 signature. SHA-256 manifest. Reproduces byte-for-byte across machines. And the closed-form solver portfolio runs in three seconds. Seventy-seven solvers. Your move."

## Pre-record checklist
- [ ] Terminal background color matches your brand
- [ ] Font size ≥ 18pt for screen readability
- [ ] Mic level tested at -12 dBFS
- [ ] No notifications visible (do not disturb on)
- [ ] Tarball pre-built so `verify.mjs` doesn't fail on the recording
- [ ] Caption overlay with URL prepared in editor
- [ ] Three takes recorded; pick the cleanest one

## Post-record editing
- Trim to exactly 30 seconds (target: 30.0–30.3 sec)
- Add caption overlay on final 3 seconds: tarball URL + your contact
- Export 1080p, H.264, ≤30 MB (LinkedIn cap)
- Add subtitles (.srt) for sound-off viewers (required on LinkedIn)

## Where to use
- LinkedIn DM as attached video clip
- Email signature embed (private link, not attached)
- G2E booth tablet loop (mute, subtitle-only)
- Sales-engineer's laptop dock screen
- Loom shareable URL in cold-CTO-email.md follow-up

## Success metric
- View-to-tarball-download conversion: ≥15%
- View-to-meeting-request conversion: ≥3%
- Average watch duration: ≥85% (people fall off if not engaging by sec 10)

## Variant ideas (record once, post multiple)
- Variant A: this script — peer-to-peer for CTOs
- Variant B: replace climax with "5-year NPV +$33M" for CFOs
- Variant C: replace climax with "14 days vs 14 weeks" for CMOs
