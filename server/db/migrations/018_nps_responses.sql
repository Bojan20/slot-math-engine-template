-- W215 Faza 1300.0 Agent C — NPS responses table.
--
-- One row per recorded NPS response. Tokens are kept in-memory by the
-- application (they are single-use, short-lived), so they are not
-- persisted in this table. Tenant-scoped: every query MUST include
-- a tenant_id filter unless executed via the W208 cross-tenant
-- override.

CREATE TABLE IF NOT EXISTS nps_responses (
  id                 UUID         PRIMARY KEY,
  tenant_id          VARCHAR(64)  NOT NULL,
  respondent_email   VARCHAR(320) NOT NULL,
  score_out_of_10    SMALLINT     NOT NULL CHECK (score_out_of_10 BETWEEN 0 AND 10),
  comment            TEXT         NOT NULL DEFAULT '',
  survey_date        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  category           VARCHAR(20)  NOT NULL CHECK (category IN ('detractor','passive','promoter')),
  sentiment          VARCHAR(20)  NOT NULL CHECK (sentiment IN ('positive','neutral','negative','unknown')),
  tags               JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nps_tenant     ON nps_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nps_category   ON nps_responses(category);
CREATE INDEX IF NOT EXISTS idx_nps_survey     ON nps_responses(survey_date DESC);
