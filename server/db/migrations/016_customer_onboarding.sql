-- W215 Faza 1300.0 Agent C — Customer onboarding tracker.
--
-- One row per customer (tenant) tracking its journey from deal_won
-- through first_renewal_due. State transitions are append-only and
-- live in the `history` JSONB column. This table is GLOBAL — not
-- multi-tenant — so the CSM team can see the full portfolio.

CREATE TABLE IF NOT EXISTS customer_onboarding (
  customer_id        UUID         PRIMARY KEY,
  tenant_id          VARCHAR(64)  NOT NULL UNIQUE,
  display_name       VARCHAR(200) NOT NULL,
  tier               VARCHAR(20)  NOT NULL CHECK (tier IN ('enterprise','platform','indie')),
  deal_value_usd     NUMERIC(14,2) NOT NULL DEFAULT 0,
  csm_email          VARCHAR(320) NOT NULL,
  stage              VARCHAR(40)  NOT NULL DEFAULT 'deal_won',
  stage_entered_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  renewal_due_at     TIMESTAMPTZ  NOT NULL,
  history            JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_onboarding_stage
  ON customer_onboarding(stage);
CREATE INDEX IF NOT EXISTS idx_customer_onboarding_tier
  ON customer_onboarding(tier);
CREATE INDEX IF NOT EXISTS idx_customer_onboarding_csm
  ON customer_onboarding(csm_email);
CREATE INDEX IF NOT EXISTS idx_customer_onboarding_renewal
  ON customer_onboarding(renewal_due_at);
