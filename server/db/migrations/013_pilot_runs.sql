-- W211 Faza 700.0 — Real L&W Pilot Onboard
--
-- One row per integration-suite execution. Each row is an immutable
-- summary; the per-spin audit log proper continues to live in
-- `audit_log`. `verdicts` stores the array of per-step verdicts as
-- JSONB so we can index into individual gate failures without joining
-- another table.

CREATE TABLE IF NOT EXISTS pilot_runs (
  run_id            UUID         PRIMARY KEY,
  tenant_id         UUID         NOT NULL,
  started_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  total_elapsed_ms  BIGINT       NOT NULL DEFAULT 0,
  pass_count        INTEGER      NOT NULL DEFAULT 0,
  fail_count        INTEGER      NOT NULL DEFAULT 0,
  overall_ok        BOOLEAN      NOT NULL DEFAULT TRUE,
  verdicts          JSONB        NOT NULL,
  result_hash       VARCHAR(64)  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pilot_runs_tenant
  ON pilot_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pilot_runs_tenant_completed
  ON pilot_runs(tenant_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pilot_runs_overall_ok
  ON pilot_runs(overall_ok);
