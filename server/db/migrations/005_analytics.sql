-- CORTI W207-ANALYTICS — analytics event store.
--
-- Mirrors the in-memory AnalyticsStore buffer. Insert-only — never
-- updated. Indexed by (game_id, created_at) and (session_id, created_at)
-- so the per-game RTP and per-session timeline queries stay fast.

CREATE TABLE IF NOT EXISTS analytics_events (
  event_id     BIGINT       NOT NULL,
  category     VARCHAR(32)  NOT NULL,
  session_id   VARCHAR(64),
  game_id      VARCHAR(64),
  bet          DOUBLE PRECISION,
  value        DOUBLE PRECISION,
  payload      JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_game     ON analytics_events(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session  ON analytics_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_category ON analytics_events(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_created  ON analytics_events(created_at DESC);
