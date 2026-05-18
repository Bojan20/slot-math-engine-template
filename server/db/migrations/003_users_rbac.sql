-- CORTI W206-PERSISTENCE — users + RBAC tables.
-- Co-ordinated with W206-SECURITY agent; this migration only creates
-- the tables (idempotent). The SECURITY agent owns the auth logic.

CREATE TABLE IF NOT EXISTS users (
  user_id         VARCHAR(64)  PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  display_name    VARCHAR(255),
  enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS roles (
  role_id         VARCHAR(64)  PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  permissions     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id         VARCHAR(64)  NOT NULL,
  role_id         VARCHAR(64)  NOT NULL,
  granted_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
