-- CORTI W209 Faza 500.0 — marketplace templates (UI / behaviour packs).
-- These are operator-purchasable presets that pair with one or more
-- kernels (lobby skins, bonus animation packs, etc.).

CREATE TABLE IF NOT EXISTS marketplace_templates (
  id                  UUID         PRIMARY KEY,
  author_id           UUID,
  manifest            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  price_usd           DOUBLE PRECISION NOT NULL DEFAULT 0,
  license_type        VARCHAR(32)  NOT NULL DEFAULT 'perpetual',
  preview_asset_url   VARCHAR(512),
  install_count       BIGINT       NOT NULL DEFAULT 0,
  status              VARCHAR(32)  NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_tmpl_author ON marketplace_templates(author_id);
CREATE INDEX IF NOT EXISTS idx_mkt_tmpl_status ON marketplace_templates(status);
