-- CORTI W209 Faza 500.0 — author registry.
-- Authors submit kernels + templates and collect a revenue share. KYC
-- status gates payout eligibility (`approved` required).

CREATE TABLE IF NOT EXISTS marketplace_authors (
  id                   UUID         PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  email                VARCHAR(255) NOT NULL UNIQUE,
  tier                 SMALLINT     NOT NULL DEFAULT 1, -- 1/2/3
  revenue_share_pct    DOUBLE PRECISION NOT NULL DEFAULT 0.70,
  payout_method        JSONB,
  kyc_status           VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  api_key_hash         VARCHAR(128),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_authors_kyc  ON marketplace_authors(kyc_status);
CREATE INDEX IF NOT EXISTS idx_mkt_authors_tier ON marketplace_authors(tier);
