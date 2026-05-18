-- CORTI W209 Faza 500.0 — monthly author payout ledger.
-- Computed once per period (period_start..period_end). gross_revenue =
-- sum of purchases for the author's items in the window; author_payout
-- = gross_revenue * revenue_share_pct; platform_cut = remainder.

CREATE TABLE IF NOT EXISTS marketplace_payouts (
  id                UUID         PRIMARY KEY,
  author_id         UUID         NOT NULL,
  period_start      DATE         NOT NULL,
  period_end        DATE         NOT NULL,
  gross_revenue     DOUBLE PRECISION NOT NULL DEFAULT 0,
  platform_cut      DOUBLE PRECISION NOT NULL DEFAULT 0,
  author_payout     DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency          VARCHAR(8)   NOT NULL DEFAULT 'USD',
  status            VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending|paid|failed
  payout_ref        VARCHAR(128),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mkt_payouts_author ON marketplace_payouts(author_id);
CREATE INDEX IF NOT EXISTS idx_mkt_payouts_status ON marketplace_payouts(status);
CREATE INDEX IF NOT EXISTS idx_mkt_payouts_period ON marketplace_payouts(period_start, period_end);
