-- W215 Faza 800.2 Agent C — Marketing analytics event capture.
--
-- One row per analytics event emitted by the public marketing site.
-- Events are append-only — there is no UPDATE path. The application
-- layer aggregates funnel + A/B counts via SQL CTEs in
-- `server/state/marketing-events-pg.ts`.
--
-- No PII is stored. `session_id` is a hashed digest computed
-- client-side from page-load timestamp + UA + screen geometry.
-- `remote_ip` is retained only for rate-limiting forensics and is
-- cleared after 30 days by an out-of-band sweeper.

CREATE TABLE IF NOT EXISTS marketing_events (
  event_id       UUID         PRIMARY KEY,
  type           VARCHAR(40)  NOT NULL,
  session_id     VARCHAR(64)  NOT NULL,
  ts             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  page           VARCHAR(400),
  destination    VARCHAR(400),
  form_id        VARCHAR(80),
  video_id       VARCHAR(80),
  experiment_id  VARCHAR(60),
  variant        VARCHAR(60),
  props          JSONB,
  remote_ip      VARCHAR(45)  NOT NULL DEFAULT '0.0.0.0'
);

CREATE INDEX IF NOT EXISTS idx_marketing_events_ts
  ON marketing_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_events_session
  ON marketing_events(session_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_type_ts
  ON marketing_events(type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_events_experiment
  ON marketing_events(experiment_id, variant)
  WHERE experiment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_events_page
  ON marketing_events(page)
  WHERE page IS NOT NULL;
