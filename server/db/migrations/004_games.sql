-- CORTI W206-PERSISTENCE — games registry storage.

CREATE TABLE IF NOT EXISTS games (
  game_id         VARCHAR(64)  PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  version         VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
  supplier        VARCHAR(128) NOT NULL DEFAULT 'unknown',
  category        VARCHAR(64)  NOT NULL DEFAULT 'unknown',
  topology        VARCHAR(64)  NOT NULL DEFAULT 'rectangular',
  rtp             DOUBLE PRECISION NOT NULL DEFAULT 0.955,
  jurisdictions   JSONB        NOT NULL DEFAULT '[]'::jsonb,
  ir_blob         JSONB,
  metadata        JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_supplier ON games(supplier);
CREATE INDEX IF NOT EXISTS idx_games_category ON games(category);
