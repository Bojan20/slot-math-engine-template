# Pre-Pitch Checklist

> Run this before any L&W meeting (cold-room or warm). Skip a step at your own risk.

## T-72 hours (Tuesday before a Friday meeting)

- [ ] Build fresh tarball: `npm run pitch:tarball`
- [ ] Verify signature: `npm run pitch:verify dist/pitch/slot-math-engine-pitch-*.tar.gz`
- [ ] Verify SHA-256s in the manifest by sampling 3 files manually
- [ ] Run full integration suite: `npm run pilot:integration` → expect 10/10 PASS
- [ ] Generate fresh dossier with current date: `npm run pilot:dossier`
- [ ] Run closed-form portfolio: `npm run closed-form-portfolio` → expect 77/77 PASS
- [ ] Take screenshots of all PASS outputs (use as fallback if live demo hiccups)

## T-48 hours

- [ ] Customize tarball README with operator name (`--operator=L&W`)
- [ ] If multi-team meeting, brand the one-pager with operator name (Agent C's per-operator scripts)
- [ ] Print speaker notes from `docs/LW_PILOT_PITCH_GUIDE.md` Room-X section corresponding to the meeting type
- [ ] Re-read `docs/outreach/OBJECTION_RESPONSES.md` end-to-end
- [ ] Re-read the target's last 3 LinkedIn posts (catch any same-week news)

## T-24 hours

- [ ] Email envelope ready:
  - [ ] Subject A/B picked (test both in pilot batches, then commit to winner)
  - [ ] Plain-text fallback verified (paste into a fresh Gmail compose with formatting OFF)
  - [ ] Attachments under 25 MB total (Gmail limit; OWA is 35 MB)
  - [ ] Tarball larger than 25 MB → use private Google Drive / Dropbox / S3 presigned URL
- [ ] Calendar slot confirmed:
  - [ ] Zoom or Teams link generated AND TESTED from a second device
  - [ ] Recording consent banner enabled (per their privacy preference)
  - [ ] Local recording fallback configured if remote recording fails
- [ ] One backup slot held on your calendar in case of last-minute reschedule
- [ ] Tarball uploaded to private link (Google Drive / Dropbox / signed S3 URL) — test the link in incognito
- [ ] Speaker notes printed (paper, not screen — eye contact matters)
- [ ] Demo machine tested:
  - [ ] Studio app starts (`npm run studio:dev`) within 8 seconds
  - [ ] Operator app starts within 8 seconds
  - [ ] Regulator app starts within 8 seconds
  - [ ] Sample IR file in clipboard
  - [ ] Rust kernel pre-warmed
  - [ ] Browser zoom set to 110% on demo screen
  - [ ] All notifications silenced
  - [ ] Browser bookmarks bar hidden
  - [ ] Slack / Discord / Telegram all closed
- [ ] Power cable for laptop in bag
- [ ] HDMI / USB-C adapter for projector (3 different formats to be safe)
- [ ] Backup laptop with mirrored env (if it's a deal-critical meeting)

## T-2 hours

- [ ] Re-build tarball if anything changed in last 24h
- [ ] Refresh meeting invite acceptance status — confirm attendee list
- [ ] If introduced via warm contact, send a short "looking forward" note (NOT a re-pitch)
- [ ] Hydrate. Eat. Bathroom. (Boring but real.)

## T-15 minutes

- [ ] Demo machine on, all apps started, IR file in clipboard
- [ ] Browser tabs in correct order: Studio (1), Operator (2), Regulator (3), terminal (4)
- [ ] One-pager open in tab 5 as fallback if live demo fails
- [ ] PDF cert-dossier sample open in tab 6
- [ ] Headset / mic tested
- [ ] Camera framing set (top of head visible, eye-line at camera level)
- [ ] Background tidied
- [ ] Phone on silent (real silent, not vibrate)

## In-meeting

- [ ] Open with 30-second context-setting ONLY if it's a cold room
- [ ] Spend ≥60% of time on the demo, ≤40% on slides or talk
- [ ] Ask their concerns BEFORE pitching solutions
- [ ] Take written notes on their words (verbatim quotes — gold for follow-up email)
- [ ] Demo deliberate-failure if requested (rollback in 6 min is a closer)
- [ ] Commit to one concrete follow-up artifact before the call ends
- [ ] Calendar the follow-up in the meeting itself (don't say "we'll find time")

## Post-meeting (within 2 hours)

- [ ] Send `followup-after-meeting.md` or `followup-after-demo.md`
- [ ] Update CRM via `crm-export.mjs`
- [ ] Log verbatim quotes / objections in CRM contact record
- [ ] If demo happened: build a clean fresh tarball today as a follow-up artifact
- [ ] Update master TODO row in `SLOT_ENGINE_MASTER_TODO.md`
- [ ] Self-rate the meeting 1–10 in your private journal; note one thing to improve

## Pre-meeting troubleshooting

### "Tarball build failed"
- Re-run with `--dry-run` first; check stdout for what's missing
- Fall back to last week's tarball, but UPDATE THE VERSION.txt manually
- Note in the meeting: "fresh tarball was rebuilt yesterday vs today — happy to send today's version after the call"

### "Integration suite 9/10 PASS"
- Identify the failing test
- Show the screenshot of yesterday's 10/10 to demonstrate it's a flake, not a regression
- If it's a real regression, be honest: "we caught one this morning; fix lands today"

### "Zoom/Teams link broken at start"
- Use the backup invite (you held one in calendar)
- Phone dial-in fallback ready
- If they can't connect, propose to reschedule rather than rush; rushed demos lose deals

### "They asked something I don't know"
- "Great question. I want to give you a precise answer; let me come back to you by EOD tomorrow."
- Write it down. Send the answer in the follow-up email within the committed timeframe.
- Never bluff. CTOs detect bluffs in 3 seconds.

---

## Meeting type → checklist matrix

| Meeting Type | Required steps |
|---|---|
| Cold 30-min discovery | T-24h block; tarball ready; objection responses re-read |
| Warm 30-min intro call | T-24h block + warm intro thank-you note sent T-2h |
| 60-min technical deep-dive | Full checklist; demo machine tested twice; tarball rebuilt T-24h |
| 90-min board presentation | Full checklist; second laptop backup; printed deck; speaker notes |
| Post-demo follow-up call | Sub-checklist: tarball-only refresh; follow-up artifact ready |
| Pilot kick-off | Tenant pre-provisioned; team intros confirmed; SOW pre-signed |

---

## Final readiness gate

Before you click "Join Meeting":

> Am I ready to be told "yes" right now?

If yes, you're prepared. If no, what's missing? Get it before joining.
