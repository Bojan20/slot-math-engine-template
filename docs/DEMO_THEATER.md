# Demo Theater — 30-day Pilot Simulation

The Demo Theater is a scripted, deterministic, time-compressed
simulation of a 30-day Vendor B pilot deployment that can be replayed in
under five minutes for any C-level demo. It generates a full timeline
of events, metrics, dashboards, alerts and decisions — essentially a
flight simulator for "what happens when Vendor B signs the pilot."

W211 Faza 700.0 ships this on top of the W210 deployment harness:
canary controller, smoke orchestrator, lab adapters and observability.

## Quick start

```bash
# Default 300× compression — 30 days collapse into ~5 minutes wall time.
npm run theater:run

# Persona-shaped narratives.
npm run theater:run:cto    # latency, replay determinism, RNG quality
npm run theater:run:cmo    # revenue, time-to-market, marketplace
npm run theater:run:cfo    # ROI, lab-fee savings, NPV ticker

# CI / unit-test rehearsal — pacing skipped, completes in <30s.
node scripts/demo-theater/orchestrator.mjs --synthetic --persona=cto
```

Outputs land under `dist/demo-theater/`:

| File                                | Purpose                                  |
| ----------------------------------- | ---------------------------------------- |
| `timeline-{ts}.json`                | Full event stream + per-day counts        |
| `timeline-{ts}.md`                  | Human-readable per-day summary            |
| `narrative-{ts}.md`                 | Persona-shaped storyteller narrative      |
| `snapshots/day-{NN}-{dashboard}.html` | 30 dashboard cuts (5 moments × 6 dashboards) |

## How it works

1. **events.mjs** — deterministic event factory. Spins, cache, audit
   chain, canary, lab pipeline, anomalies, operator refreshes. Seeded
   LCG (1664525 / 1013904223) → reproducible byte-for-byte.
2. **narrator.mjs** — persona-shaped storyteller. Emits a ~30-day
   markdown narrative with a per-day headline + bullets + closing
   executive summary.
3. **orchestrator.mjs** — wires the two, paces wall time per CLI flags,
   writes the three artifacts, prints a progress bar with live narrator
   lines for the most narrative-worthy event of each day.
4. **dashboard-snapshots.mjs** — emits 30 styled HTML dashboard cuts
   at Day 0 / 7 / 14 / 21 / 30 across spins / latency / canary / cert /
   roi / alerts.

The output JSON is the input for the **Demo Theater Player** under
`web/pitch/src/demo-theater-player/` — a frontend module that replays
the timeline visually with a play/pause/skip/seek UX.

## CLI flags

```
--seed=<int>       deterministic seed, default 42
--days=<int>       length of the pilot in days, default 30
--persona=cto      cto | cmo | cfo (default = all)
--compress=300x    compression ratio: 300x = ~5min for 30 days
--speed=1x         alias of --compress=
--synthetic        skip wall-clock pacing (CI mode)
--quiet            suppress live progress output
```

## Narrative timeline reference

| Day  | Phase                                  | Key beat                          |
| ---- | -------------------------------------- | --------------------------------- |
| 0    | Pilot seeded                           | smoke suite green                 |
| 1    | First 1 000 spins                      | RTP convergence visible           |
| 2    | Wallet health checks                   | latency baseline                  |
| 3-7  | Bulk traffic                           | canary 1% → 5%                    |
| 8    | Anomaly: wallet latency spike          | auto-mitigated within 12s         |
| 8-14 | Canary 5% → 25%                        | RTP drift gate evaluated          |
| 15-21| Full production traffic                | canary 25% → 100%                 |
| 17   | Anomaly: RTP drift                     | within tolerance, no rollback     |
| 22   | First GLI bundle generated + signed    | submitted to lab                  |
| 23-28| Revision cycle                         | revisions regenerated in minutes  |
| 29   | LAB APPROVAL                           | production cert issued            |
| 30   | Pilot dossier finalized                | ROI tally + portfolio expansion   |

## Determinism guarantees

- Same `--seed` → same JSON byte-for-byte (`scripts/tests/demo-theater-events.test.mjs`).
- Same JSON → identical replay in the player (`web/pitch/tests/demo-theater-player.test.ts`).
- CI rehearses the full 30-day timeline in synthetic mode every PR.

## Player frontend

The HTML player is mounted via:

```html
<div id="demo-theater-player"></div>
<script type="module" src="/src/demo-theater-player/index.ts"></script>
```

URL params:

- `?timeline=/path/to/timeline.json` overrides the default fetch.

Keyboard / click controls:

- Click the progress bar to seek by day.
- Persona buttons (left rail) re-filter the live event feed.
- Speed buttons (footer) snap to 0.5× / 1× / 2× / 5×.
- Rewind / Play / Skip step through days.

See `docs/DEMO_THEATER_PLAYBOOK.md` for the C-level presentation
scripts.
