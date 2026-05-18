# Demo Theater — C-level Playbook

This playbook scripts three presentation modes for the W211 Demo
Theater: 5-minute (elevator), 15-minute (board sub-committee) and
90-minute (full board). Each mode pairs a persona, a speed setting and
a narrative checkpoint plan so the presenter never improvises under
pressure.

---

## 5-minute mode — "elevator"

**Audience:** CEO or single C-level decision maker.
**Speed:** 300× (default). Wall time ≈ 5 minutes for 30 days.
**Persona:** the one that matches the audience.

### Script

| Wall t | Day | Talking point                                                       |
| ------ | --- | ------------------------------------------------------------------- |
| 0:00   | 0   | "This is the moment L&W signs. Watch."                              |
| 0:25   | 3   | "Canary opens at 1%. Four health gates greenlight us."              |
| 1:20   | 8   | "Real-world anomaly: wallet provider spikes. We auto-mitigate."     |
| 2:30   | 15  | "Mid-rollout, 25% live, RTP drift inside 0.5pp."                    |
| 3:40   | 22  | "GLI bundle generated and HSM-signed. Submitted."                   |
| 4:30   | 29  | "Lab approval received. Production cert issued."                    |
| 4:55   | 30  | "Dossier sealed. ROI: +€48 200. Lab fees avoided: €61 500."         |

### Setup

```bash
npm run theater:run -- --persona=cto    # or cmo / cfo
```

Open the deck slide that hosts the player. The narrative auto-scrolls.

---

## 15-minute mode — "board sub-committee"

**Audience:** small group (3-5 execs).
**Speed:** 100× (~15 min for 30 days).
**Persona:** rotate every 5 minutes (cto → cmo → cfo).

### Script

1. **0:00 – 4:00 (Days 0-10) · CTO frame.** Open with the deterministic
   replay claim: "Same seed, same outcome. Every time. Show me my
   pilot." Walk through canary stages and the wallet-anomaly auto
   mitigation.
2. **4:00 – 9:00 (Days 10-21) · CMO frame.** Highlight tenant growth,
   marketplace tile activity, sessions and the brand events around the
   approval moment. Pause on day 17 to talk about RTP drift in plain
   English: "It moved, the gate held, the players never noticed."
3. **9:00 – 15:00 (Days 21-30) · CFO frame.** Lab fees avoided.
   Time-to-cert vs traditional 90-day cycle. ROI compounding.

### Setup

```bash
node scripts/demo-theater/orchestrator.mjs --speed=100x --persona=all
```

When the playhead reaches day 10 / 21, click the persona buttons in
the player to switch frame.

---

## 90-minute mode — "full board"

**Audience:** L&W board of directors (10+).
**Speed:** 16× (~90 min for 30 days). Allows two breakouts.
**Persona:** all four (incl. unfiltered).

### Script

| Block | Wall t      | Day  | Activity                                          |
| ----- | ----------- | ---- | ------------------------------------------------- |
| 1     | 0:00–10:00  | 0-3  | Walk through pilot kickoff + smoke harness.       |
| 2     | 10:00–25:00 | 3-8  | Live demo: canary controller advance from s0→s1.  |
| —     | 25:00–35:00 | —    | **Breakout 1**: open `dashboard-snapshots/day-07-*` |
| 3     | 35:00–55:00 | 8-15 | Anomaly + rollback drill.                         |
| 4     | 55:00–75:00 | 15-22| Lab submission live: HSM-signed bundle.           |
| —     | 75:00–80:00 | —    | **Breakout 2**: financial Q&A.                    |
| 5     | 80:00–90:00 | 22-30| Approval + dossier seal + portfolio pitch.        |

### Setup

```bash
node scripts/demo-theater/orchestrator.mjs --speed=16x
node scripts/demo-theater/dashboard-snapshots.mjs
```

The snapshot HTML files are self-contained — open in any browser
without a dev server.

---

## Demo hygiene checklist

- [ ] Run `npm run theater:run -- --synthetic --quiet` 24h before the
      meeting to refresh artifacts.
- [ ] Verify timeline.json + narrative.md exist under `dist/demo-theater/`.
- [ ] Open the player at `/demo-theater/index.html?timeline=...`.
- [ ] Have the dashboard snapshots open in another tab as backup.
- [ ] Pre-load the speaker notes from `narrative-{ts}.md`.
- [ ] Keep `--persona=cfo` output handy for ROI follow-ups.

---

## Customizing the narrative

The seed is a CLI flag: `--seed=N`. Same N → same story. Useful when
the team wants to rehearse a specific anomaly cadence.

To tailor anomalies, edit `anomalyDay(day)` in
`scripts/demo-theater/events.mjs`. The narrator picks them up
automatically because the schedule is read at run time.

To add a persona, register it in `narrator.mjs:PERSONAS` and supply
the persona-specific bullets in `summarizeDay()`. The orchestrator and
player accept any registered persona without changes.
