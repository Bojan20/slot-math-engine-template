-- W210 Faza 600.0 — tenant→wallet-provider config.
-- One active provider per tenant; credentials encrypted at rest with
-- AES-256-GCM via server/lib/wallet/crypto.ts. Schema versioned via
-- a leading version byte on the blob.

CREATE TABLE IF NOT EXISTS tenant_wallet_config (
  id                UUID         PRIMARY KEY,
  tenant_id         UUID         NOT NULL,
  provider_name     VARCHAR(64)  NOT NULL,
  config_encrypted  BYTEA        NOT NULL,
  health_status     VARCHAR(16)  NOT NULL DEFAULT 'unknown',
  last_check        TIMESTAMPTZ,
  active            BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twc_tenant_active
  ON tenant_wallet_config(tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_twc_provider
  ON tenant_wallet_config(provider_name);

-- Enforce one active provider per tenant. (Idempotent — the predicate
-- index will be re-created if missing.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_twc_tenant_active
  ON tenant_wallet_config(tenant_id) WHERE active = true;
