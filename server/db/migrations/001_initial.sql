-- CORTI W206-PERSISTENCE — initial schema (sessions, wallet, audit, tenants).
-- All migrations are idempotent (CREATE TABLE IF NOT EXISTS / DO blocks).

CREATE TABLE IF NOT EXISTS sessions (
  session_id      VARCHAR(64) PRIMARY KEY,
  player_id       VARCHAR(64) NOT NULL,
  jurisdiction    VARCHAR(8)  NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  last_spin_at    TIMESTAMPTZ,
  state           JSONB       NOT NULL,
  closed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_player  ON sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS wallet_balances (
  player_id       VARCHAR(64) PRIMARY KEY,
  balance_minor   BIGINT      NOT NULL DEFAULT 0,
  currency        CHAR(3)     NOT NULL DEFAULT 'USD',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_balance_nonneg CHECK (balance_minor >= 0)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  transaction_id  BIGSERIAL   PRIMARY KEY,
  player_id       VARCHAR(64) NOT NULL,
  amount_minor    BIGINT      NOT NULL,
  kind            VARCHAR(16) NOT NULL,
  status          VARCHAR(16) NOT NULL,
  currency        CHAR(3)     NOT NULL DEFAULT 'USD',
  ref             VARCHAR(128),
  balance_after_minor BIGINT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txn_player  ON wallet_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_txn_created ON wallet_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id        BIGSERIAL   PRIMARY KEY,
  session_id      VARCHAR(64) NOT NULL,
  seq             INTEGER     NOT NULL,
  type            VARCHAR(32) NOT NULL,
  payload         JSONB       NOT NULL,
  prev_hash       CHAR(64)    NOT NULL,
  this_hash       CHAR(64)    NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id, audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_hash    ON audit_log(this_hash);

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id       VARCHAR(64) PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  config          JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
