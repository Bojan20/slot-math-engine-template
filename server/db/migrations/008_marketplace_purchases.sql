-- CORTI W209 Faza 500.0 — operator purchases (kernel + template).
-- A purchase issues a license JWT signed by the HSM. The JWT is stored
-- alongside the row for verification + audit.

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id                   UUID         PRIMARY KEY,
  tenant_id            VARCHAR(64)  NOT NULL,
  item_id              UUID         NOT NULL,
  item_type            VARCHAR(16)  NOT NULL, -- 'kernel' | 'template'
  price_paid           DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency             VARCHAR(8)   NOT NULL DEFAULT 'USD',
  license_jwt          TEXT         NOT NULL,
  status               VARCHAR(16)  NOT NULL DEFAULT 'active', -- active | refunded | expired
  payment_ref          VARCHAR(128),
  purchased_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  refunded_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mkt_purch_tenant  ON marketplace_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mkt_purch_status  ON marketplace_purchases(status);
CREATE INDEX IF NOT EXISTS idx_mkt_purch_item    ON marketplace_purchases(item_id, item_type);
