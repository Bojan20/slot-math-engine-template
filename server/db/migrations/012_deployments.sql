-- W210 Faza 600.0 — Live Operator Integration / Production Deployment
-- Rehearsal. The `deployments` table tracks every manifest a tenant has
-- promoted (or attempted to promote). It's the durable backing store for
-- canary state, rollback history, and the audit/cert paper trail.

CREATE TABLE IF NOT EXISTS deployments (
  id                    UUID         PRIMARY KEY,
  tenant_id             UUID         NOT NULL,
  version               VARCHAR(64)  NOT NULL,
  manifest              JSONB        NOT NULL,
  status                VARCHAR(32)  NOT NULL,
  -- pending | canary | rolling | live | rolled_back | failed
  rollout_percent       INTEGER      NOT NULL DEFAULT 0,
  rollback_reason       TEXT,
  health_score          NUMERIC(4,3),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  promoted_to_live_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deployments_tenant
  ON deployments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status
  ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_tenant_created
  ON deployments(tenant_id, created_at DESC);
