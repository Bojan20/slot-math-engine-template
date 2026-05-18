# CORTI W207-ANALYTICS — Real-time Analytics, RTP Drift Detection, A/B Thompson Sampling

This wave adds three connected components to the backend, the operator
dashboard, and the offline reporting pipeline:

1. **Analytics ingestion pipeline** (`server/state/analytics.ts`)
2. **ML-lite RTP drift detector** (`server/lib/rtp-drift-detector.ts`)
3. **Thompson Sampling A/B bandit** (`server/lib/ab-test-sampler.ts`)
4. **GaaS WebSocket analytics channel** (`server/routes/gaas.ts`)
5. **Operator dashboard live charts + anomaly UX** (`web/operator/src/sections.ts`)
6. **Daily analytics report generator** (`scripts/analytics-report.mjs`)

## Architecture flow

```
                     +----------------------------------+
                     |  GaaS /api/gaas/spin             |
                     |  /api/gaas/live (WebSocket)      |
                     +----------------------------------+
                                  |
                          ingest()|every spin/win/loss
                                  v
+----------------+      +----------------------------------+      +-----------------------+
| Postgres       |<-----|  AnalyticsStore (bounded buffer) |----->| onEvent() listeners   |
| analytics_events|     |  - rolling RTP per game          |      |                       |
+----------------+      |  - stats (eps, sessions)         |      |  - WS analytics fanout|
                        +----------------------------------+      |  - RtpDriftDetector   |
                                                                  +-----------+-----------+
                                                                              |
                                                                              v
                                                                  +-----------------------+
                                                                  | Operator dashboard    |
                                                                  | - live RTP line chart |
                                                                  | - anomaly toast       |
                                                                  | - history table       |
                                                                  | - "Investigate" drill |
                                                                  +-----------------------+

                +----------------------------------+
                |  ABTestSampler (Thompson)        |
                |  - Beta posterior per variant    |
                |  - sample() / trafficSplit()     |
                |  - recommendation() => promote   |
                +----------------------------------+
```

## 1. Analytics ingestion

`AnalyticsStore` accepts events tagged with one of:

- `spin`, `win`, `loss` — drives the per-game rolling RTP windowed
  average (default window 1000 spins)
- `feature_trigger` — bonus / free spins triggers
- `session_start`, `session_end` — drives the unique-session count
- `wallet_op` — deposits/withdrawals/wagers
- `cert_submission` — cert lifecycle events
- `error` — drives `errors/min`

Buffer is bounded (default 10 000) — oldest events are evicted FIFO.
When a `PgConnection` is wired in, every event is **also** mirrored to
the `analytics_events` table via `INSERT` (best-effort; failures are
counted but don't block the in-memory pipeline). `loadFromPg()` replays
the latest N rows back into a fresh store, useful after a restart.

Real-time stats:

| Metric        | Definition                                         |
|---------------|----------------------------------------------------|
| eventsPerSec  | events with timestamp ≥ now-60s, divided by 60     |
| errorsPerMin  | events of category=error with timestamp ≥ now-60s |
| sessionCount  | distinct sessionId values seen                     |
| bufferSize    | current in-memory event count (≤ bufferCap)        |
| categoryCounts| per-category cumulative counter                    |

## 2. RTP drift detector

Statistical model:

- **Welford online mean + M² → variance.**
  No need to retain every sample for an O(1) running mean / variance.
- **EWMA(α=0.05).**
  A short-horizon smoothed estimate that tracks regime changes faster
  than the cumulative mean.
- **Sliding windows of 100 / 1000 / 10 000 spins.**
  These are FIFO arrays clipped to size.

Alert triggers (any one fires):

1. **`rolling_window`** — abs(window1000_mean − expected) × 100 > 2pp
2. **`z_score`** — |z| > 3.0 where `z = (mean − expected) / (σ/√n)`
3. **`consecutive_outliers`** — three samples in a row with |sample−mean|/σ > 2

Alert severity:

| Range of |observed − expected| | Severity |
|------------------------------|----------|
| > 0.05                       | critical |
| > 0.02                       | warning  |
| else                         | info     |

Subscribers:

- `onAlert(cb)` — synchronous local listener
- `addWebhook(url)` — POST `{alert}` JSON

## 3. Thompson Sampling A/B bandit

Each variant carries a Beta(α, β) posterior. On every conversion event:

```
update(id, converted=true)  → α += 1
update(id, converted=false) → β += 1
```

`sample()` draws once from each variant's Beta and returns the argmax —
this is the variant the next user should see. Run N samples and the
empirical frequency is the **adaptive traffic split**.

`recommendation()` returns:

```
{
  winnerId: <best posterior mean>,
  confidence: <P(winner beats all others) via N samples>,
  promote: confidence ≥ 0.95
}
```

When `promote=true` the operator should be prompted to promote the
winning variant (existing A/B Testing console action).

## 4. WebSocket analytics channel

Two new commands on `/api/gaas/live`:

- Client → server: `{type: "subscribe-analytics", role: "operator"}`
- Client → server: `{type: "unsubscribe-analytics"}`

Server emits, to subscribed connections only:

```json
{
  "type": "analytics",
  "category": "win",
  "payload": {
    "eventId": 42,
    "sessionId": "s1",
    "gameId": "g1",
    "bet": 1,
    "value": 5,
    "timestamp": "2026-05-18T10:00:00.000Z"
  }
}
```

Role gating: server accepts operator-grade roles only
(`operator`, `admin`, `regulator`). All other roles are rejected with
`{type:"error", error:"analytics_requires_operator_role"}`.

## 5. Operator dashboard

`web/operator/src/sections.ts` (RTP Monitoring section) now:

- Subscribes to both the spin fan-out and the analytics fan-out
- Renders a 480x100 SVG line chart per live game (last 100 RTP values)
- Runs a client-side Welford detector for instant 3-sigma anomaly
  markers (red dot on the chart endpoint)
- Pushes toasts (4.5 s auto-dismiss) on every detected anomaly
- Shows an anomaly history table (last 25 events) with an
  "Investigate" button per row
- Drill-down panel shows cumulative bet/win, running mean, variance,
  and live anomaly count

## 6. Daily analytics report

```
npm run analytics:report -- --input events.json [--anomaly-file alerts.json] [--date YYYY-MM-DD] [--top 10]
```

Outputs three files in `reports/analytics/`:

- `DAILY_<date>.json` — full structured summary
- `DAILY_<date>.md`   — human-readable table view
- `DAILY_<date>.csv`  — per-game stats for spreadsheet import

## Acceptance

- 32+ new vitest specs across three files (analytics, drift detector,
  A/B sampler).
- WebSocket frames carry `{type: "analytics", category, payload}` and
  are gated on the `operator|admin|regulator` role.
- Buffer cap is enforced at 10 000.
- 3-sigma alerts fire after `minSpins` and any of the three triggers.
- Thompson sampling converges to 95% confidence on a clear-winner
  workload in ≤ 1000 updates.
- `npm run analytics:report` writes JSON + Markdown + CSV.

## Files modified / added

| Path                                            | New | Lines |
|-------------------------------------------------|-----|-------|
| `server/state/analytics.ts`                     | yes | ~230  |
| `server/lib/rtp-drift-detector.ts`              | yes | ~200  |
| `server/lib/ab-test-sampler.ts`                 | yes | ~180  |
| `server/routes/gaas.ts`                         | mod | +60   |
| `server/db/migrations/005_analytics.sql`        | yes | ~20   |
| `server/tests/analytics.test.ts`                | yes | ~160  |
| `server/tests/rtp-drift-detector.test.ts`       | yes | ~130  |
| `server/tests/ab-test-sampler.test.ts`          | yes | ~130  |
| `server/tests/fake-pg.ts`                       | mod | +35   |
| `web/operator/src/sections.ts`                  | mod | +180  |
| `scripts/analytics-report.mjs`                  | yes | ~170  |
| `package.json`                                  | mod | +1    |
| `docs/ANALYTICS.md`                             | yes | this  |
